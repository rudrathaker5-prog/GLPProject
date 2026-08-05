import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { COLLECTIONS, newId, nowIso, readCollection, writeCollection } from '@core/data/localDb';
import type { AgentCard, ChatMessage, JourneyStage, LanguageCode } from '@core/domain/types';
import { storage } from '@core/storage/storage';
import { runAgentTurn, userMessage } from '@features/ai/agent/careAgent';

interface ChatState {
  conversationId: string | null;
  messages: ChatMessage[];
  sending: boolean;
  degraded: boolean;
  degradedReason: string | null;
  error: string | null;
  hydrated: boolean;
}

interface ChatActions {
  send: (text: string, stage: JourneyStage, language: LanguageCode) => Promise<void>;
  seedGreeting: (stage: JourneyStage, language: LanguageCode) => Promise<void>;
  reset: () => void;
  loadHistory: () => Promise<void>;
  appendAssistantCard: (content: string, cards: AgentCard[]) => void;
}

const MAX_MESSAGES_IN_MEMORY = 200;

export const useChatStore = create<ChatState & ChatActions>()(
  persist(
    (set, get) => ({
      conversationId: null,
      messages: [],
      sending: false,
      degraded: false,
      degradedReason: null,
      error: null,
      hydrated: false,

      send: async (text, stage, language) => {
        const trimmed = text.trim();
        if (!trimmed || get().sending) return;

        const conversationId = get().conversationId;
        const outgoing = userMessage(trimmed, conversationId, language);
        const pending: ChatMessage = {
          ...outgoing,
          id: `${outgoing.id}-pending`,
          role: 'assistant',
          content: '',
          pending: true,
        };

        set((state) => ({
          messages: [...state.messages, outgoing, pending].slice(-MAX_MESSAGES_IN_MEMORY),
          sending: true,
          error: null,
        }));

        try {
          const result = await runAgentTurn({
            message: trimmed,
            conversationId,
            stage,
            language,
            history: get().messages.filter((m) => !m.pending),
          });

          set((state) => ({
            conversationId: result.conversationId ?? state.conversationId,
            messages: state.messages
              .filter((m) => m.id !== pending.id)
              .concat(result.assistantMessage)
              .slice(-MAX_MESSAGES_IN_MEMORY),
            sending: false,
            degraded: result.degraded,
            degradedReason: result.degradedReason ?? null,
          }));

          await persistMessages([outgoing, result.assistantMessage]);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === pending.id
                ? {
                    ...m,
                    pending: false,
                    error: true,
                    content:
                      'I could not answer that just now. Please check your connection and try again.',
                  }
                : m,
            ),
            sending: false,
            error: message,
          }));
        }
      },

      seedGreeting: async (stage, language) => {
        if (get().messages.length > 0) return;
        const { runLocalEngine } = await import('@features/ai/engine/localEngine');
        const greeting = runLocalEngine({
          message: 'hello',
          stage,
          language,
          history: [],
          profile: {},
        });
        const message: ChatMessage = {
          id: newId(),
          conversationId: get().conversationId ?? 'local',
          role: 'assistant',
          content: greeting.followUp
            ? `${greeting.reply}`
            : greeting.reply,
          language,
          toolName: null,
          toolPayload: null,
          cards: null,
          createdAt: nowIso(),
        };
        set({ messages: [message] });
      },

      appendAssistantCard: (content, cards) => {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: newId(),
              conversationId: state.conversationId ?? 'local',
              role: 'assistant' as const,
              content,
              language: null,
              toolName: null,
              toolPayload: null,
              cards,
              createdAt: nowIso(),
            },
          ].slice(-MAX_MESSAGES_IN_MEMORY),
        }));
      },

      loadHistory: async () => {
        if (get().messages.length > 0) {
          set({ hydrated: true });
          return;
        }
        const stored = await readCollection<ChatMessage>(COLLECTIONS.messages);
        set({ messages: stored.slice(-MAX_MESSAGES_IN_MEMORY), hydrated: true });
      },

      reset: () => set({ conversationId: null, messages: [], error: null, degraded: false }),
    }),
    {
      name: 'glpcare.chat',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        conversationId: state.conversationId,
        messages: state.messages.slice(-60),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

async function persistMessages(messages: ChatMessage[]): Promise<void> {
  const existing = await readCollection<ChatMessage>(COLLECTIONS.messages);
  await writeCollection(COLLECTIONS.messages, [...existing, ...messages].slice(-400));
}
