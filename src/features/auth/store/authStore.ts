import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { isBackendConfigured, supabase } from '@core/supabase/client';
import { clearLocalData, storage } from '@core/storage/storage';
import { newId } from '@core/data/localDb';
import type { AccountMode, JourneyStage } from '@core/domain/types';

/**
 * Session model.
 *
 * Four modes, deliberately different:
 *  - anonymous  no identity at all. Nothing leaves the device unless the user
 *               sends a chat message, and even then no profile is created.
 *               This is the default and is never interrupted by a login wall.
 *  - guest      an anonymous Supabase session (real JWT, real row ownership)
 *               that can later be converted to a full account without losing
 *               history. Created the moment the user does something that needs
 *               storage — booking, prescriptions, reminders.
 *  - patient    email/phone account.
 *  - doctor     account linked to a `doctors` row.
 */

export interface AuthState {
  mode: AccountMode;
  userId: string | null;
  session: Session | null;
  user: User | null;
  /** Stable id for a purely local, never-uploaded anonymous session. */
  localId: string;
  stage: JourneyStage;
  displayName: string | null;
  doctorId: string | null;
  initialised: boolean;
  loading: boolean;
  error: string | null;
}

interface AuthActions {
  initialise: () => Promise<void>;
  setSession: (session: Session | null) => void;
  /** Promotes an anonymous device session to a real (anonymous) Supabase user. */
  ensureIdentity: () => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  setStage: (stage: JourneyStage) => void;
  setDisplayName: (name: string) => void;
  deleteEverything: () => Promise<void>;
}

const initialState: AuthState = {
  mode: 'anonymous',
  userId: null,
  session: null,
  user: null,
  localId: newId(),
  stage: 'awareness',
  displayName: null,
  doctorId: null,
  initialised: false,
  loading: false,
  error: null,
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      initialise: async () => {
        if (get().initialised) return;

        if (!isBackendConfigured || !supabase) {
          set({ initialised: true, mode: get().userId ? get().mode : 'anonymous' });
          return;
        }

        const { data } = await supabase.auth.getSession();
        applySession(set, data.session);

        supabase.auth.onAuthStateChange((_event, session) => {
          applySession(set, session);
        });

        set({ initialised: true });
      },

      setSession: (session) => applySession(set, session),

      ensureIdentity: async () => {
        const current = get();
        if (current.userId) return current.userId;
        if (!isBackendConfigured || !supabase) return null;

        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signInAnonymously();
        set({ loading: false });

        if (error) {
          set({ error: error.message });
          return null;
        }
        applySession(set, data.session);
        set({ mode: 'guest' });
        return data.user?.id ?? null;
      },

      signInWithEmail: async (email, password) => {
        if (!supabase) throw new Error('Backend not configured');
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        set({ loading: false });
        if (error) {
          set({ error: error.message });
          throw error;
        }
        applySession(set, data.session);
        await resolveRole(set, data.user?.id ?? null);
      },

      signUpWithEmail: async (email, password, displayName) => {
        if (!supabase) throw new Error('Backend not configured');
        set({ loading: true, error: null });

        // If we already hold an anonymous session, upgrade it in place so the
        // user keeps every conversation, reminder and measurement.
        const existing = get().session;
        if (existing && get().mode === 'guest') {
          const { error: updateError } = await supabase.auth.updateUser({
            email,
            password,
            data: { display_name: displayName },
          });
          set({ loading: false });
          if (updateError) {
            set({ error: updateError.message });
            throw updateError;
          }
          await supabase
            .from('profiles')
            .update({ mode: 'patient', display_name: displayName, email })
            .eq('id', get().userId!);
          set({ mode: 'patient', displayName });
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        set({ loading: false });
        if (error) {
          set({ error: error.message });
          throw error;
        }
        applySession(set, data.session);
        set({ mode: 'patient', displayName });
      },

      signInWithPhone: async (phone) => {
        if (!supabase) throw new Error('Backend not configured');
        set({ loading: true, error: null });
        const { error } = await supabase.auth.signInWithOtp({ phone: normalisePhone(phone) });
        set({ loading: false });
        if (error) {
          set({ error: error.message });
          throw error;
        }
      },

      verifyOtp: async (phone, token) => {
        if (!supabase) throw new Error('Backend not configured');
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.verifyOtp({
          phone: normalisePhone(phone),
          token,
          type: 'sms',
        });
        set({ loading: false });
        if (error) {
          set({ error: error.message });
          throw error;
        }
        applySession(set, data.session);
        await resolveRole(set, data.user?.id ?? null);
      },

      signOut: async () => {
        if (supabase) await supabase.auth.signOut();
        set({
          mode: 'anonymous',
          userId: null,
          session: null,
          user: null,
          doctorId: null,
          displayName: null,
          stage: 'awareness',
        });
      },

      setStage: (stage) => {
        set({ stage });
        const userId = get().userId;
        if (userId && supabase) {
          void supabase.from('profiles').update({ stage }).eq('id', userId);
        }
      },

      setDisplayName: (displayName) => {
        set({ displayName });
        const userId = get().userId;
        if (userId && supabase) {
          void supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
        }
      },

      deleteEverything: async () => {
        const userId = get().userId;
        if (userId && supabase) {
          // Cascades handle every child table.
          await supabase.from('profiles').delete().eq('id', userId);
          await supabase.auth.signOut();
        }
        await clearLocalData();
        set({ ...initialState, localId: newId(), initialised: true });
      },
    }),
    {
      name: 'glpcare.auth',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        mode: state.mode,
        localId: state.localId,
        stage: state.stage,
        displayName: state.displayName,
        doctorId: state.doctorId,
      }),
    },
  ),
);

type Setter = (partial: Partial<AuthState>) => void;

function applySession(set: Setter, session: Session | null): void {
  if (!session) {
    set({ session: null, user: null, userId: null });
    return;
  }
  const isAnonymous = Boolean((session.user as { is_anonymous?: boolean }).is_anonymous);
  set({
    session,
    user: session.user,
    userId: session.user.id,
    mode: isAnonymous ? 'guest' : 'patient',
    displayName: (session.user.user_metadata?.display_name as string | undefined) ?? null,
  });
}

/** Doctors are identified by a row in `doctors` linked to their auth user. */
async function resolveRole(set: Setter, userId: string | null): Promise<void> {
  if (!userId || !supabase) return;
  const { data } = await supabase
    .from('doctors')
    .select('id, full_name')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (data) {
    set({ mode: 'doctor', doctorId: data.id, displayName: data.full_name });
  }
}

export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return input.startsWith('+') ? input : `+${digits}`;
}

/** The id used to scope local records — real user id when we have one. */
export function currentOwnerId(): string {
  const { userId, localId } = useAuthStore.getState();
  return userId ?? localId;
}
