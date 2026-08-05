/**
 * ai-agent — the agentic care companion.
 *
 * Request  POST { conversationId?, message, stage, language, clientContext? }
 * Response { conversationId, reply, cards, toolCalls, safety, degraded }
 *
 * Loop:
 *   1. Safety screen the inbound message (deterministic, pre-model).
 *   2. Assemble context: patient snapshot + long-term memory + history summary.
 *   3. Reason with tools, up to MAX_TOOL_ROUNDS iterations.
 *   4. Safety screen the outbound message (post-model guard).
 *   5. Persist the turn and refresh long-term memory in the background.
 *
 * If no LLM key is configured the function returns `degraded: true` and the
 * client falls back to its on-device deterministic engine — the product keeps
 * working, it just stops being generative.
 */
import { errorResponse, handlePreflight, jsonResponse } from '../_shared/cors.ts';
import { buildPatientContext, loadConversationHistory } from '../_shared/context.ts';
import {
  chatCompletion,
  llmConfigured,
  parseJsonLoose,
  type LlmMessage,
} from '../_shared/llm.ts';
import {
  buildSystemPrompt,
  MEMORY_EXTRACTION_PROMPT,
  type Language,
  type Stage,
} from '../_shared/prompts.ts';
import {
  SAFE_REWRITE_SUFFIX,
  screenForSafety,
  violatesPrescribingRule,
} from '../_shared/safety.ts';
import { getUserId, userClient } from '../_shared/supabase.ts';
import { executeTool, toolDefinitionsFor } from '../_shared/tools.ts';

const MAX_TOOL_ROUNDS = 4;
const HISTORY_TURNS = 20;
const SUMMARISE_AFTER_MESSAGES = 24;

interface AgentRequest {
  conversationId?: string | null;
  message: string;
  stage?: Stage;
  language?: Language;
  /** Values an anonymous client keeps locally and sends per turn. */
  clientContext?: {
    heightCm?: number;
    weightKg?: number;
    waistCm?: number;
    age?: number;
    sex?: string;
    comorbidities?: string[];
    contraindications?: string[];
    recentMessages?: { role: 'user' | 'assistant'; content: string }[];
  };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: AgentRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const message = (body.message ?? '').trim();
  if (!message) return errorResponse('message is required');
  if (message.length > 4000) return errorResponse('message too long', 413);

  const stage: Stage = body.stage ?? 'awareness';
  const language: Language = body.language ?? 'en';

  const supabase = userClient(req);
  const userId = await getUserId(req);

  // ---- 1. Pre-model safety screen ---------------------------------------
  const inboundSafety = screenForSafety(message);

  if (inboundSafety.level === 'emergency') {
    // Emergencies never wait on a model round trip.
    const reply = inboundSafety.message;
    const conversationId = await persistTurn({
      supabase,
      userId,
      conversationId: body.conversationId ?? null,
      stage,
      language,
      userMessage: message,
      assistantMessage: reply,
      cards: [{ kind: 'escalation', severity: 'urgent', message: reply }],
    });
    return jsonResponse({
      conversationId,
      reply,
      cards: [{ kind: 'escalation', severity: 'urgent', message: reply }],
      toolCalls: [],
      safety: inboundSafety,
      degraded: false,
    });
  }

  if (!llmConfigured()) {
    return jsonResponse(
      {
        conversationId: body.conversationId ?? null,
        reply: null,
        cards: [],
        toolCalls: [],
        safety: inboundSafety,
        degraded: true,
        reason: 'OPENAI_API_KEY not configured on the server',
      },
      200,
    );
  }

  // ---- 2. Context assembly ----------------------------------------------
  const conversationId = await ensureConversation({
    supabase,
    userId,
    conversationId: body.conversationId ?? null,
    stage,
    language,
  });

  const context = await buildPatientContext({
    supabase,
    userId,
    stage,
    language,
    conversationId,
  });

  // Anonymous clients carry their own context; merge what they sent.
  if (!userId && body.clientContext) {
    const c = body.clientContext;
    context.bmi =
      c.heightCm && c.weightKg
        ? Math.round((c.weightKg / (c.heightCm / 100) ** 2) * 10) / 10
        : context.bmi;
    context.currentWeightKg = c.weightKg ?? null;
    context.comorbidities = c.comorbidities ?? [];
    context.contraindications = c.contraindications ?? [];
  }

  const history = conversationId
    ? await loadConversationHistory(supabase, conversationId, HISTORY_TURNS)
    : (body.clientContext?.recentMessages ?? []).slice(-HISTORY_TURNS);

  const messages: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history.map((m) => ({ role: m.role, content: m.content }) as LlmMessage),
    { role: 'user', content: message },
  ];

  if (inboundSafety.level === 'urgent' && inboundSafety.message) {
    messages.push({
      role: 'system',
      content: `SAFETY OVERRIDE: the user's message matched a "${inboundSafety.category}" rule. Open your reply with this guidance, in your own words and in the user's language, before anything else: "${inboundSafety.message}"`,
    });
  }

  // ---- 3. Reasoning loop -------------------------------------------------
  const tools = toolDefinitionsFor(stage, Boolean(userId));
  const cards: Record<string, unknown>[] = [];
  const toolCalls: { name: string; arguments: unknown }[] = [];
  let reply = '';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const completion = await chatCompletion({
        messages,
        tools,
        temperature: 0.6,
        maxTokens: 900,
      });

      const assistant = completion.message;
      messages.push(assistant);

      if (!assistant.tool_calls?.length) {
        reply = assistant.content ?? '';
        break;
      }

      for (const call of assistant.tool_calls) {
        const args = parseJsonLoose<Record<string, unknown>>(call.function.arguments) ?? {};
        toolCalls.push({ name: call.function.name, arguments: args });

        const result = await executeTool(call.function.name, args, {
          supabase,
          userId,
          conversationId,
          stage,
          language,
        });

        if (result.card) cards.push(result.card);

        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content: JSON.stringify(result.forModel).slice(0, 6000),
        });
      }

      // Final round: force a prose answer instead of another tool call.
      if (round === MAX_TOOL_ROUNDS - 1) {
        const final = await chatCompletion({ messages, temperature: 0.6, maxTokens: 700 });
        reply = final.message.content ?? '';
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('agent loop failed', detail);
    return jsonResponse(
      {
        conversationId,
        reply: null,
        cards,
        toolCalls,
        safety: inboundSafety,
        degraded: true,
        reason: detail.slice(0, 200),
      },
      200,
    );
  }

  if (!reply.trim()) {
    reply =
      'I did not manage to put that into words properly. Could you tell me again what you would like help with?';
  }

  // ---- 4. Post-model guard ----------------------------------------------
  if (violatesPrescribingRule(reply)) {
    reply = `${reply}${SAFE_REWRITE_SUFFIX}`;
  }

  // ---- 5. Persist --------------------------------------------------------
  const finalConversationId = await persistTurn({
    supabase,
    userId,
    conversationId,
    stage,
    language,
    userMessage: message,
    assistantMessage: reply,
    cards,
    toolCalls,
  });

  if (userId && finalConversationId) {
    // Memory refresh is best-effort and must never delay the reply.
    refreshMemory(supabase, userId, finalConversationId).catch((e) =>
      console.error('memory refresh failed', e),
    );
  }

  return jsonResponse({
    conversationId: finalConversationId,
    reply,
    cards,
    toolCalls,
    safety: inboundSafety,
    degraded: false,
  });
});

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

async function ensureConversation(params: {
  supabase: ReturnType<typeof userClient>;
  userId: string | null;
  conversationId: string | null;
  stage: Stage;
  language: Language;
}): Promise<string | null> {
  const { supabase, userId, conversationId, stage, language } = params;
  if (!userId) return conversationId;
  if (conversationId) return conversationId;

  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, stage, language })
    .select('id')
    .single();

  if (error) {
    console.error('conversation create failed', error.message);
    return null;
  }
  return data.id as string;
}

async function persistTurn(params: {
  supabase: ReturnType<typeof userClient>;
  userId: string | null;
  conversationId: string | null;
  stage: Stage;
  language: Language;
  userMessage: string;
  assistantMessage: string;
  cards: Record<string, unknown>[];
  toolCalls?: { name: string; arguments: unknown }[];
}): Promise<string | null> {
  const { supabase, userId, stage, language } = params;
  if (!userId) return params.conversationId;

  let conversationId = params.conversationId;
  if (!conversationId) {
    conversationId = await ensureConversation({
      supabase,
      userId,
      conversationId: null,
      stage,
      language,
    });
  }
  if (!conversationId) return null;

  await supabase.from('messages').insert([
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      content: params.userMessage,
      language,
    },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: params.assistantMessage,
      language,
      cards: params.cards.length ? params.cards : null,
      tool_payload: params.toolCalls?.length ? { calls: params.toolCalls } : null,
    },
  ]);

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);

  return conversationId;
}

/**
 * Compresses an ageing conversation into a summary plus durable memories so
 * later turns stay cheap without losing what matters.
 */
async function refreshMemory(
  supabase: ReturnType<typeof userClient>,
  userId: string,
  conversationId: string,
): Promise<void> {
  const { count } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (!count || count < SUMMARISE_AFTER_MESSAGES || count % 8 !== 0) return;

  const history = await loadConversationHistory(supabase, conversationId, 40);
  if (history.length === 0) return;

  const transcript = history.map((m) => `${m.role}: ${m.content}`).join('\n').slice(0, 12_000);

  const completion = await chatCompletion({
    messages: [
      { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
      { role: 'user', content: transcript },
    ],
    temperature: 0.2,
    maxTokens: 500,
    responseFormat: { type: 'json_object' },
  });

  const parsed = parseJsonLoose<{
    summary?: string;
    memories?: { kind: string; content: string; salience?: number }[];
  }>(completion.message.content);

  if (!parsed) return;

  if (parsed.summary) {
    await supabase
      .from('conversations')
      .update({ summary: parsed.summary.slice(0, 600) })
      .eq('id', conversationId);
  }

  const memories = (parsed.memories ?? []).slice(0, 6);
  if (memories.length > 0) {
    const { data: existing } = await supabase
      .from('agent_memories')
      .select('content')
      .eq('user_id', userId)
      .limit(100);
    const seen = new Set((existing ?? []).map((m: any) => m.content.toLowerCase()));

    const fresh = memories
      .filter((m) => m.content && !seen.has(m.content.toLowerCase()))
      .map((m) => ({
        user_id: userId,
        kind: ['preference', 'concern', 'goal', 'fact', 'barrier'].includes(m.kind)
          ? m.kind
          : 'fact',
        content: m.content.slice(0, 240),
        salience: Math.min(1, Math.max(0, m.salience ?? 0.5)),
      }));

    if (fresh.length) await supabase.from('agent_memories').insert(fresh);
  }
}
