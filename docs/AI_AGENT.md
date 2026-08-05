# The AI agent

## What makes it agentic rather than a chatbot

Five things, in order of importance:

1. **It acts.** 18 tools that read and write real records under the patient's own
   permissions — book an appointment, log a weight, save a check-in, raise a
   refill, start the relapse protocol.
2. **It remembers.** Durable facts extracted from conversations, plus a rolling
   summary, injected into every subsequent turn.
3. **It knows who it is talking to.** A live patient snapshot — BMI, adherence,
   next dose, side effects, relapse risk — is part of the prompt, so it never
   asks for data the app already has.
4. **It knows where they are.** Different goals, different tone and a different
   tool set per stage.
5. **It cannot be talked out of safety.** Triage is deterministic and runs
   outside the model on both sides of the call.

---

## The loop

`supabase/functions/ai-agent/index.ts`

```
inbound message
   │
   ├─ 1. deterministic safety screen ────────► emergency? reply immediately,
   │                                            skip the model entirely
   ├─ 2. build context
   │      patient_snapshot (1 query) + agent_memories + conversation summary
   │      + last 20 turns
   │
   ├─ 3. reason, up to 4 rounds
   │      model → tool_calls? → execute under the caller's JWT → feed results
   │      back → repeat.  Final round forces prose.
   │
   ├─ 4. post-model guard
   │      output matching a prescribing pattern gets a correction appended
   │
   └─ 5. persist turn, refresh memory in the background
```

`MAX_TOOL_ROUNDS = 4` bounds cost and latency. Memory extraction runs
out-of-band so it never delays a reply.

---

## Prompt construction

Four layers, assembled per turn in `_shared/prompts.ts`:

1. **Identity + hard safety rules** — never changes. Includes the eight
   non-negotiables (never prescribe, never diagnose, red-flag routing first,
   self-harm handling, pregnancy, educational reminder, no invented statistics,
   no promised kilograms).
2. **Stage instructions** — awareness, treatment or vigilance. Different goals,
   different behaviour, different definition of success.
3. **Therapeutic technique** — motivational interviewing, CBT and ACT, with the
   explicit instruction to blend them and never announce them.
4. **Live patient context** — the snapshot, memories and summary.

Prompts live on the server so they can be improved without shipping an app
release. That is a deliberate operational choice: prompt quality is the thing
you will iterate on most.

### Voice

The identity layer specifies things that are easy to get wrong and matter a lot
in this domain:

- Short paragraphs. One follow-up question at a time.
- Never "obese person" — "living with obesity".
- Mirror the emotional register before informing.
- Assume the person has been blamed for their weight by a health professional
  before, and actively counter that.

---

## Tools

`supabase/functions/_shared/tools.ts`

| Tool | Stages | Writes | What it is for |
|---|---|---|---|
| `check_eligibility` | all | — | ICMR-threshold screen, mid-conversation |
| `find_doctors` | all | — | directory query |
| `recommend_doctor_consultation` | all | — | the "talk to a doctor" transition |
| `get_available_slots` | all | — | real availability before offering times |
| `book_appointment` | all | ✓ | atomic booking via SQL function |
| `explain_myth` | all | — | retrieve the evidence card |
| `get_education_topic` | all | — | retrieve a WHO/ICMR article |
| `log_weight` | treat/vig | ✓ | a weight the user just stated |
| `request_check_in` | treat/vig | — | show the in-chat check-in form |
| `save_check_in` | treat/vig | ✓ | persist values given conversationally |
| `get_medication_schedule` | treatment | — | read before answering dose questions |
| `request_refill` | treatment | ✓ | raise a refill through a chosen channel |
| `get_progress` | treat/vig | — | read before claiming how someone is doing |
| `get_nutrition_plan` | treat/vig | — | advice matches the actual targets |
| `trigger_relapse_protocol` | treat/vig | ✓ | relapse signals detected |
| `escalate_to_care` | all | ✓ | urgent or routine escalation banner |
| `remember` | all | ✓ | store one durable fact |
| `suggest_actions` | all | — | up to 3 tappable next steps |

### The security property that matters

Tools run through `userClient(req)` — a Supabase client carrying the caller's
JWT. **Row-level security still applies to every query the agent makes.** The
agent cannot read another patient's data, cannot write outside its own rows, and
cannot do anything the user could not do themselves in the UI.

This is enforced by the database, not by the prompt. A jailbroken model gains
nothing.

Tools requiring auth are simply not offered to anonymous sessions — the model is
never tempted by an action it cannot take.

Every execution is written to `agent_actions` with arguments, result and status.

### Structured output

Tools return `{ forModel, card }`. `forModel` goes back into the conversation;
`card` is rendered by `AgentCardList` as a real UI element — an eligibility
result, a doctor list with working Book buttons, a check-in form, a relapse
plan.

The prompt forbids describing a button the model has not created with a tool
call, which is what stops the classic "tap the Book button below" hallucination
when there is no button.

---

## Memory

Three tiers:

| Tier | Store | Lifetime |
|---|---|---|
| Working | last 20 messages | the conversation |
| Episodic | `conversations.summary` | refreshed every 8 messages after 24 |
| Semantic | `agent_memories` | durable, salience-ranked, top 12 injected |

Memory extraction (`MEMORY_EXTRACTION_PROMPT`) is deliberately narrow: at most
six facts, ≤25 words each, only things that would change support in three
months, and explicitly *not* things the app already stores structurally. Weight
belongs in `weight_entries`, not in a memory.

The agent can also write a memory directly via the `remember` tool when
something matters in the moment.

---

## Multilingual

Language is a first-class parameter, not a translation layer:

- The prompt instructs the model to reply in the user's script, keeping medicine
  names in English the way Indian clinics actually say them.
- Safety patterns match in all four languages, because patients switch language
  mid-sentence and the emergency rules must not depend on a UI setting.
- Voice transcription goes through a Whisper-compatible endpoint, which handles
  Hindi, Gujarati and Marathi.

---

## The offline engine

`src/features/ai/engine/`

When no key is configured, the network is down, or the gateway degrades, the app
uses a rules engine over the same knowledge base and the same clinical
functions:

- 26 intents, matched with weighted multilingual patterns.
- Measurement extraction from prose ("I'm 5'6\" and 82 kg" → 168 cm, 82 kg).
- Real eligibility calculation and real myth/education retrieval.
- The same `AgentCard[]` contract, so the UI is identical.

It is not a placeholder. It is a genuine fallback that answers real questions,
routes to doctors, and refuses dose advice — tested to do so. Where it does not
know, it says so and routes to a clinician rather than guessing.

The chat screen shows a banner when it is running, so the user is never misled
about what is answering.

---

## Degradation ladder

```
server agent (LLM + tools)
   ↓ no key / network failure / timeout / bad response
on-device engine (rules + knowledge base)
   ↓ intent not recognised
nearest education article by keyword
   ↓ nothing matches
honest "I want to answer that properly rather than guess" + action buttons
```

At no point does the user see a spinner that never resolves, or an error with no
next step.

---

## Cost and latency

- Context is capped: 20 turns, 12 memories, one snapshot query.
- `MAX_TOOL_ROUNDS = 4`.
- Memory extraction runs at most every 8th message and is fire-and-forget.
- Tool results are truncated to 6 KB before going back to the model.
- Default model is `gpt-4o-mini`-class; the architecture does not assume a
  frontier model.

## Tuning it

| To change | Edit |
|---|---|
| Tone, rules, stage behaviour | `_shared/prompts.ts` |
| What the agent can do | `_shared/tools.ts` |
| What it knows about the patient | `_shared/context.ts` |
| Escalation thresholds | `_shared/safety.ts` **and** `src/core/clinical/safety.ts` |
| Offline answers | `src/features/ai/engine/responses.ts` |
| Provider / model | `OPENAI_BASE_URL` / `OPENAI_MODEL` secrets |
