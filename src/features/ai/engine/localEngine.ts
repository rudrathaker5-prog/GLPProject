import { evaluateEligibility } from '@core/clinical/eligibility';
import { screenForSafety, wantsTreatment } from '@core/clinical/safety';
import type {
  AgentCard,
  EligibilityInput,
  JourneyStage,
  LanguageCode,
} from '@core/domain/types';
import { EDUCATION_TOPICS, getTopic, searchTopics } from '@features/awareness/content/education';
import { MYTHS, searchMyths } from '@features/awareness/content/myths';

import { isDirectCallRequest } from '@features/calls/api/resolveDoctor';

import { classifyIntent, extractMeasurements, type Intent } from './intents';
import { pickVariant, responses, type ResponseKey } from './responses';

/**
 * On-device care engine.
 *
 * Used when no LLM gateway is configured, when the network is unavailable, or
 * when the gateway degrades. It is a genuine rules engine over the same
 * knowledge base and the same clinical functions the server uses — not a
 * placeholder. It cannot free-form reason, so it says so when it is unsure and
 * routes to a doctor rather than guessing.
 */

export interface LocalEngineInput {
  message: string;
  stage: JourneyStage;
  language: LanguageCode;
  history: { role: 'user' | 'assistant'; content: string }[];
  /**
   * Who to ring if the user asks to be put through.
   *
   * Resolved by the caller because the directory lookup is async and this
   * engine is deliberately synchronous — it has to be able to answer with the
   * network down and nothing loaded.
   */
  callTarget?: { name: string; number: string; confidence: string } | null;
  profile: {
    heightCm?: number | null;
    weightKg?: number | null;
    waistCm?: number | null;
    age?: number | null;
    sex?: EligibilityInput['sex'];
    comorbidities?: EligibilityInput['comorbidities'];
    contraindications?: EligibilityInput['contraindications'];
    displayName?: string | null;
    percentLost?: number | null;
    adherence?: number | null;
    nextDoseAt?: string | null;
  };
}

export interface LocalEngineOutput {
  reply: string;
  cards: AgentCard[];
  intent: Intent;
  /** Measurements the engine picked out of the message, to persist upstream. */
  extracted: ReturnType<typeof extractMeasurements>;
  followUp: string | null;
}

export function runLocalEngine(input: LocalEngineInput): LocalEngineOutput {
  const { message, stage, language, profile } = input;
  const text = message.trim();
  const extracted = extractMeasurements(text);
  const safety = screenForSafety(text);
  const { intent } = classifyIntent(text);

  const cards: AgentCard[] = [];
  const say = (key: ResponseKey, context?: LocalEngineInput['profile']) =>
    pickVariant(
      responses(key, language, {
        displayName: context?.displayName,
        percentLost: context?.percentLost,
        adherence: context?.adherence,
      }),
    );

  // ---- Safety always wins -------------------------------------------------
  if (safety.level === 'emergency' || safety.level === 'urgent') {
    cards.push({
      kind: 'escalation',
      severity: safety.level === 'emergency' ? 'urgent' : 'routine',
      message: safety.message,
    });
    if (safety.level === 'emergency') {
      return { reply: safety.message, cards, intent, extracted, followUp: null };
    }
  }

  const prefix = safety.level === 'urgent' ? `${safety.message}\n\n` : '';

  /*
    ---- "Call my doctor" ---------------------------------------------------

    Handled before anything else that is not a red flag, and deterministically,
    because this has to work with no API key, no network and no model. Someone
    typing "call my doctor" is not asking for a conversation — they want a
    phone to ring, and the offline engine is exactly the configuration where
    they are least likely to have another way to get the number.

    The card carries the number; the resolution happens in the caller, which
    has async access to the directory. If it could not be resolved we fall
    through to the normal flow rather than claiming to have called.
  */
  if (isDirectCallRequest(text) && input.callTarget) {
    cards.push({
      kind: 'call',
      contactName: input.callTarget.name,
      number: input.callTarget.number,
      reason: safety.level === 'urgent' ? 'red_flag' : 'routine',
      autoDial: true,
      requestedAt: new Date().toISOString(),
    });
    return {
      reply:
        prefix +
        (input.callTarget.confidence === 'fallback'
          ? `Opening your dialler for the consulting line — ${input.callTarget.number}. Press the call button to connect.`
          : `Opening your dialler for ${input.callTarget.name}. Press the call button to connect.`),
      cards,
      intent,
      extracted,
      followUp: null,
    };
  }

  // ---- Treatment intent ---------------------------------------------------
  if (intent === 'want_treatment' || wantsTreatment(text)) {
    cards.push({
      kind: 'action',
      actions: [
        { id: 'doctors', label: 'See doctors near me', intent: 'open_doctors' },
        { id: 'eligibility', label: 'Check my eligibility first', intent: 'open_eligibility' },
      ],
    });
    return {
      reply: prefix + say('want_treatment'),
      cards,
      intent,
      extracted,
      followUp: 'Which city are you in? I can show you doctors who run obesity clinics there.',
    };
  }

  // ---- Eligibility --------------------------------------------------------
  if (intent === 'eligibility' || (extracted.weightKg && extracted.heightCm)) {
    const merged: EligibilityInput = {
      heightCm: extracted.heightCm ?? profile.heightCm,
      weightKg: extracted.weightKg ?? profile.weightKg,
      waistCm: extracted.waistCm ?? profile.waistCm,
      age: extracted.age ?? profile.age,
      sex: profile.sex,
      comorbidities: profile.comorbidities,
      contraindications: profile.contraindications,
    };

    if (!merged.heightCm || !merged.weightKg) {
      return {
        reply: prefix + say('eligibility_need_data'),
        cards,
        intent: 'eligibility',
        extracted,
        followUp: 'What is your height and your current weight?',
      };
    }

    const result = evaluateEligibility(merged);
    cards.push({ kind: 'eligibility', result });

    if (result.verdict === 'likely_eligible' || result.verdict === 'possibly_eligible') {
      cards.push({
        kind: 'action',
        actions: [{ id: 'doctors', label: 'Talk to a doctor', intent: 'open_doctors' }],
      });
    }

    const summary = [
      `Your BMI works out to ${result.bmi} — ${result.bmiCategoryIndian}.`,
      ...result.reasons.slice(1, 3),
      '',
      result.nextSteps[0] ?? '',
      '',
      result.disclaimer,
    ]
      .filter(Boolean)
      .join('\n');

    return {
      reply: prefix + summary,
      cards,
      intent: 'eligibility',
      extracted,
      followUp: merged.waistCm
        ? null
        : 'If you can measure your waist at the navel, I can make this more accurate.',
    };
  }

  // ---- Myths --------------------------------------------------------------
  if (intent === 'myth') {
    const matches = searchMyths(text);
    const card = matches[0];
    if (card) {
      cards.push({ kind: 'myth', myth: card });
      return {
        reply: prefix + `${card.explanation}\n\n${card.evidence}\n\n${card.reassurance}`,
        cards,
        intent,
        extracted,
        followUp: 'Is there anything else you have heard that you would like me to check?',
      };
    }
    cards.push({
      kind: 'action',
      actions: [{ id: 'myths', label: 'Browse myths vs facts', intent: 'open_myths' }],
    });
    return {
      reply: prefix + say('myth_unknown'),
      cards,
      intent,
      extracted,
      followUp: null,
    };
  }

  // ---- Education ----------------------------------------------------------
  const educationTopicId = educationTopicFor(intent, text);
  if (educationTopicId) {
    const topic = getTopic(educationTopicId);
    if (topic) {
      cards.push({ kind: 'education', topic });
      return {
        reply: prefix + `${topic.summary}\n\n${topic.body.slice(0, 2).join('\n\n')}`,
        cards,
        intent,
        extracted,
        followUp: 'Would you like me to go deeper on any part of that?',
      };
    }
  }

  // ---- Treatment-stage clinical questions --------------------------------
  switch (intent) {
    case 'side_effects': {
      const topic = getTopic('side-effects');
      if (topic) cards.push({ kind: 'education', topic });
      return {
        reply: prefix + say('side_effects'),
        cards,
        intent,
        extracted,
        followUp: 'How strong is it on a scale of mild, moderate or severe, and when did it start?',
      };
    }
    case 'missed_dose':
      return {
        reply: prefix + say('missed_dose'),
        cards,
        intent,
        extracted,
        followUp: 'How many days late are you?',
      };
    case 'dose_question':
      cards.push({
        kind: 'action',
        actions: [{ id: 'med', label: 'See my schedule', intent: 'open_medication' }],
      });
      return { reply: prefix + say('dose_question'), cards, intent, extracted, followUp: null };
    case 'storage_travel':
      return { reply: prefix + say('storage_travel'), cards, intent, extracted, followUp: null };
    case 'needle_fear':
      return {
        reply: prefix + say('needle_fear'),
        cards,
        intent,
        extracted,
        followUp: 'What is the part that worries you most — the pain, the sight of it, or doing it yourself?',
      };
    case 'expected_results':
      return { reply: prefix + say('expected_results'), cards, intent, extracted, followUp: null };
    case 'food_question': {
      const topic = getTopic('nutrition-basics');
      if (topic) cards.push({ kind: 'education', topic });
      cards.push({
        kind: 'action',
        actions: [{ id: 'nutrition', label: 'My nutrition plan', intent: 'open_nutrition' }],
      });
      return {
        reply: prefix + say('food_question'),
        cards,
        intent,
        extracted,
        followUp: 'What does a typical day of eating look like for you right now?',
      };
    }
    case 'alcohol':
      return { reply: prefix + say('alcohol'), cards, intent, extracted, followUp: null };
    case 'exercise_question': {
      const topic = getTopic('activity-basics');
      if (topic) cards.push({ kind: 'education', topic });
      return {
        reply: prefix + say('exercise_question'),
        cards,
        intent,
        extracted,
        followUp: 'What kind of movement do you actually enjoy, or at least not dread?',
      };
    }
    case 'sleep_question': {
      const topic = getTopic('sleep-and-stress');
      if (topic) cards.push({ kind: 'education', topic });
      return { reply: prefix + say('sleep_question'), cards, intent, extracted, followUp: null };
    }
    case 'relapse': {
      cards.push({
        kind: 'relapse',
        risk: {
          score: 55,
          band: 'moderate',
          signals: ['Self-reported setback'],
          recommendation:
            'Restart weekly weighing and daily protein now, and book a review with your doctor within two weeks.',
        },
      });
      cards.push({
        kind: 'action',
        actions: [
          { id: 'doctor', label: 'Book a review', intent: 'book_appointment' },
          { id: 'checkin', label: 'Do a check-in', intent: 'log_checkin' },
        ],
      });
      return {
        reply: prefix + say('relapse'),
        cards,
        intent,
        extracted,
        followUp: 'What changed around the time this started — sleep, stress, work, or something else?',
      };
    }
    case 'motivation':
      cards.push({
        kind: 'action',
        actions: [{ id: 'journey', label: 'See how far I have come', intent: 'open_journey' }],
      });
      return {
        reply: prefix + say('motivation', profile),
        cards,
        intent,
        extracted,
        followUp: 'What is the one thing that would make this week feel manageable?',
      };
    case 'appointment':
      cards.push({
        kind: 'action',
        actions: [{ id: 'doctors', label: 'Find a doctor', intent: 'open_doctors' }],
      });
      return { reply: prefix + say('appointment'), cards, intent, extracted, followUp: null };
    case 'refill':
      cards.push({
        kind: 'action',
        actions: [{ id: 'refill', label: 'Request a refill', intent: 'request_refill' }],
      });
      return { reply: prefix + say('refill'), cards, intent, extracted, followUp: null };
    case 'cost':
      return { reply: prefix + say('cost'), cards, intent, extracted, followUp: null };
    case 'progress':
      cards.push({
        kind: 'action',
        actions: [{ id: 'journey', label: 'Open my journey', intent: 'open_journey' }],
      });
      return { reply: prefix + say('progress', profile), cards, intent, extracted, followUp: null };
    case 'greeting':
      return {
        reply: say(stage === 'awareness' ? 'greeting_awareness' : 'greeting_returning', profile),
        cards,
        intent,
        extracted,
        followUp:
          stage === 'awareness'
            ? 'What made you open this today?'
            : 'How have the last few days been?',
      };
    case 'thanks':
      return { reply: say('thanks'), cards, intent, extracted, followUp: null };
    default:
      break;
  }

  // ---- Fallback: retrieve the nearest article -----------------------------
  const nearby = searchTopics(text);
  if (nearby.length > 0) {
    cards.push({ kind: 'education', topic: nearby[0] });
    return {
      reply: prefix + `${nearby[0].summary}\n\n${nearby[0].body[0]}`,
      cards,
      intent: 'unknown',
      extracted,
      followUp: 'Does that answer what you were asking, or did you mean something more specific?',
    };
  }

  cards.push({
    kind: 'action',
    actions: [
      { id: 'eligibility', label: 'Check eligibility', intent: 'open_eligibility' },
      { id: 'learn', label: 'Learn about obesity', intent: 'open_education' },
      { id: 'doctors', label: 'Talk to a doctor', intent: 'open_doctors' },
    ],
  });

  return {
    reply: prefix + say('fallback'),
    cards,
    intent: 'unknown',
    extracted,
    followUp: null,
  };
}

function educationTopicFor(intent: Intent, text: string): string | null {
  switch (intent) {
    case 'education_general':
      return 'obesity-is-a-disease';
    case 'education_medical':
      return 'how-glp1-works';
    case 'education_nutrition':
      return 'nutrition-basics';
    case 'education_activity':
      return 'activity-basics';
    case 'education_behaviour':
      return 'behavioural-health';
    case 'education_long_term':
      return 'long-term';
    default: {
      const lowered = text.toLowerCase();
      const direct = EDUCATION_TOPICS.find((t) => lowered.includes(t.title.toLowerCase()));
      return direct?.id ?? null;
    }
  }
}

/** Suggested opening questions on the awareness home screen. */
export function quickQuestions(language: LanguageCode): string[] {
  const bank: Record<LanguageCode, string[]> = {
    en: [
      'Am I eligible for obesity medication?',
      'Is obesity really a disease?',
      'Do these injections cause cancer?',
      'What should I eat to lose weight?',
      'Will I regain the weight after stopping?',
      'How do GLP-1 medicines work?',
    ],
    hi: [
      'क्या मैं मोटापे की दवा के लिए पात्र हूँ?',
      'क्या मोटापा सच में एक बीमारी है?',
      'क्या इन इंजेक्शनों से कैंसर होता है?',
      'वज़न घटाने के लिए क्या खाऊँ?',
      'दवा बंद करने के बाद वज़न वापस आएगा?',
      'GLP-1 दवाएँ कैसे काम करती हैं?',
    ],
    gu: [
      'શું હું સ્થૂળતાની દવા માટે પાત્ર છું?',
      'શું સ્થૂળતા ખરેખર રોગ છે?',
      'શું આ ઇન્જેક્શનથી કેન્સર થાય છે?',
      'વજન ઘટાડવા શું ખાવું?',
      'દવા બંધ કર્યા પછી વજન પાછું આવશે?',
      'GLP-1 દવાઓ કેવી રીતે કામ કરે છે?',
    ],
    mr: [
      'मी लठ्ठपणाच्या औषधासाठी पात्र आहे का?',
      'लठ्ठपणा खरंच आजार आहे का?',
      'या इंजेक्शनमुळे कर्करोग होतो का?',
      'वजन कमी करण्यासाठी काय खावं?',
      'औषध बंद केल्यावर वजन परत येईल का?',
      'GLP-1 औषधं कशी काम करतात?',
    ],
  };
  return bank[language];
}

export const KNOWLEDGE_SIZE = {
  topics: EDUCATION_TOPICS.length,
  myths: MYTHS.length,
};
