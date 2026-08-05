import { COLLECTIONS, findBy, newId, nowIso, upsert } from '@core/data/localDb';
import type { PeerGroup, PeerPost } from '@core/domain/types';
import { supabase } from '@core/supabase/client';
import type { PeerGroupRow, PeerPostRow } from '@core/supabase/database.types';
import { currentOwnerId, useAuthStore } from '@features/auth/store/authStore';

/**
 * Peer support.
 *
 * Groups and posts are real and moderated at the database level (RLS restricts
 * reading a group's posts to its members). Members post under an alias, never
 * their own name, because weight is stigmatised and identity leakage would keep
 * people out of exactly the support they need.
 */

const ALIAS_ADJECTIVES = ['Steady', 'Quiet', 'Bright', 'Calm', 'Patient', 'Kind', 'Sunny'];
const ALIAS_NOUNS = ['Sparrow', 'Banyan', 'River', 'Lotus', 'Peak', 'Sunrise', 'Compass'];

export function generateAlias(): string {
  const adjective = ALIAS_ADJECTIVES[Math.floor(Math.random() * ALIAS_ADJECTIVES.length)];
  const noun = ALIAS_NOUNS[Math.floor(Math.random() * ALIAS_NOUNS.length)];
  return `${adjective}${noun}${Math.floor(Math.random() * 90 + 10)}`;
}

const FALLBACK_GROUPS: PeerGroup[] = [
  {
    id: '44444444-4444-4444-8444-000000000001',
    name: 'Starting GLP-1',
    description: 'For anyone in the first 12 weeks — titration, nausea, and finding a rhythm.',
    stage: 'treatment',
    language: 'en',
    memberCount: 412,
    isModerated: true,
  },
  {
    id: '44444444-4444-4444-8444-000000000002',
    name: 'Protein & Indian Kitchens',
    description: 'Practical high-protein swaps for everyday Indian meals.',
    stage: 'all',
    language: 'en',
    memberCount: 890,
    isModerated: true,
  },
  {
    id: '44444444-4444-4444-8444-000000000003',
    name: 'इलाज के बाद',
    description: 'दवा बंद होने के बाद वज़न बनाए रखने वालों का समूह।',
    stage: 'vigilance',
    language: 'hi',
    memberCount: 233,
    isModerated: true,
  },
  {
    id: '44444444-4444-4444-8444-000000000004',
    name: 'Movement, gently',
    description: 'Low-impact activity for joints that hurt. Start where you are.',
    stage: 'all',
    language: 'en',
    memberCount: 351,
    isModerated: true,
  },
];

export async function listGroups(): Promise<{ groups: PeerGroup[]; offline: boolean }> {
  if (supabase) {
    const { data, error } = await supabase.from('peer_groups').select('*').limit(30);
    if (!error && data) {
      return {
        groups: (data as PeerGroupRow[]).map((row) => ({
          id: row.id,
          name: row.name,
          description: row.description,
          stage: row.stage as PeerGroup['stage'],
          language: row.language,
          memberCount: row.member_count,
          isModerated: row.is_moderated,
        })),
        offline: false,
      };
    }
  }
  return { groups: FALLBACK_GROUPS, offline: true };
}

export async function joinGroup(groupId: string): Promise<string> {
  const alias = generateAlias();
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());

  if (identity && supabase) {
    await supabase
      .from('peer_memberships')
      .upsert({ group_id: groupId, user_id: identity, alias }, { onConflict: 'group_id,user_id' });
  }
  return alias;
}

export async function listPosts(groupId: string): Promise<PeerPost[]> {
  if (supabase) {
    const { data, error } = await supabase
      .from('peer_posts')
      .select('*')
      .eq('group_id', groupId)
      .eq('flagged', false)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) {
      return (data as PeerPostRow[]).map((row) => ({
        id: row.id,
        groupId: row.group_id,
        authorId: row.author_id,
        authorAlias: row.author_alias,
        body: row.body,
        createdAt: row.created_at,
        reactionCount: row.reaction_count,
        replyCount: row.reply_count,
        flagged: row.flagged,
      }));
    }
  }

  const rows = await findBy<PeerPost>(COLLECTIONS.peerPosts, (p) => p.groupId === groupId);
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPost(groupId: string, body: string, alias: string): Promise<PeerPost> {
  const { userId, ensureIdentity } = useAuthStore.getState();
  const identity = userId ?? (await ensureIdentity());

  if (identity && supabase) {
    const { data, error } = await supabase
      .from('peer_posts')
      .insert({ group_id: groupId, author_id: identity, author_alias: alias, body })
      .select()
      .single();
    if (!error && data) {
      const row = data as PeerPostRow;
      return {
        id: row.id,
        groupId: row.group_id,
        authorId: row.author_id,
        authorAlias: row.author_alias,
        body: row.body,
        createdAt: row.created_at,
        reactionCount: row.reaction_count,
        replyCount: row.reply_count,
        flagged: row.flagged,
      };
    }
  }

  const post: PeerPost = {
    id: newId(),
    groupId,
    authorId: currentOwnerId(),
    authorAlias: alias,
    body,
    createdAt: nowIso(),
    reactionCount: 0,
    replyCount: 0,
    flagged: false,
  };
  await upsert(COLLECTIONS.peerPosts, post);
  return post;
}

/**
 * Pre-post moderation. Blocks the two things that reliably harm people in
 * weight-loss communities: dose advice between patients, and sourcing
 * prescription medicines outside a pharmacy.
 */
export function moderatePost(body: string): { allowed: boolean; reason?: string } {
  const DOSE_ADVICE = /\b(you should (take|start|increase|stop)|just take|try \d+\s?mg|skip your dose)\b/i;
  const SOURCING = /\b(sell|selling|buy from me|without prescription|grey market|dm me for)\b/i;
  const NUMBERS = /\b(\+?91[\s-]?)?[6-9]\d{9}\b/;

  if (DOSE_ADVICE.test(body)) {
    return {
      allowed: false,
      reason:
        'This looks like dose advice. Sharing experiences is welcome; telling someone what dose to take is not — that has to come from their doctor.',
    };
  }
  if (SOURCING.test(body)) {
    return {
      allowed: false,
      reason:
        'Buying or selling prescription medicine outside a licensed pharmacy is unsafe and not allowed here.',
    };
  }
  if (NUMBERS.test(body)) {
    return {
      allowed: false,
      reason: 'Please do not share phone numbers — this group is anonymous by design.',
    };
  }
  return { allowed: true };
}

export const COMMUNITY_GUIDELINES = [
  'Share your experience, not prescriptions. Only your doctor knows your case.',
  'No selling, sourcing or swapping medicines.',
  'No numbers as targets for other people — weight is personal.',
  'No before/after shaming, of yourself or anyone else.',
  'Assume everyone here has been judged enough already.',
];
