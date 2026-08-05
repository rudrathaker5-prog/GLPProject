/**
 * Server-side safety triage. Mirrors `src/core/clinical/safety.ts` so the same
 * escalation happens whether the turn was answered by the model or by the
 * on-device fallback engine.
 */

export type SafetyLevel = 'none' | 'advice' | 'urgent' | 'emergency';

export interface SafetySignal {
  level: SafetyLevel;
  category: string;
  message: string;
}

const RULES: { category: string; level: SafetyLevel; patterns: RegExp[]; message: string }[] = [
  {
    category: 'self_harm',
    level: 'emergency',
    patterns: [
      /\b(kill myself|end my life|suicid|self harm|don'?t want to live|no reason to live)\b/i,
      /(जान देने|आत्महत्या|मरना चाहता|जीने का मन नहीं)/,
      /(આપઘાત|જીવવું નથી)/,
      /(जगावंसं वाटत नाही)/,
    ],
    message:
      'You matter, and this is more important than anything about weight. Please contact Tele-MANAS on 14416 (free, 24x7) or go to the nearest emergency department now. If you are in immediate danger, call 112.',
  },
  {
    category: 'pancreatitis',
    level: 'emergency',
    patterns: [
      /\bsevere (stomach|abdominal|belly) pain\b/i,
      /pain (in|from) (my )?(stomach|abdomen)[^.]{0,30}(back|radiat)/i,
      /(पेट में तेज़? दर्द)/,
    ],
    message:
      'Severe stomach pain spreading to your back needs to be seen today — it can be pancreatitis. Do not take your next dose, and go to an emergency department or call your doctor now.',
  },
  {
    category: 'allergy',
    level: 'emergency',
    patterns: [
      /(swelling of (my )?(face|lips|tongue|throat)|difficulty breathing|throat closing)/i,
      /(साँस लेने में तकलीफ)/,
    ],
    message:
      'Swelling of the face, lips or throat, or difficulty breathing, is a medical emergency. Call 112 or go to the nearest emergency department immediately.',
  },
  {
    category: 'dehydration',
    level: 'urgent',
    patterns: [
      /(vomiting|throwing up)[^.]{0,40}(all day|constantly|can'?t keep|cannot keep)/i,
      /can'?t keep (any )?(water|fluids?|food) down/i,
    ],
    message:
      'Repeated vomiting where fluids will not stay down causes dehydration quickly. Contact your doctor today, and go to a clinic if you feel dizzy or are passing very little urine.',
  },
  {
    category: 'pregnancy',
    level: 'urgent',
    patterns: [/(i'?m pregnant|i am pregnant|trying to conceive|planning (a )?pregnancy)/i, /(गर्भवती)/],
    message:
      'If you are pregnant, might be pregnant, or are trying to conceive, stop the medicine and contact your doctor straight away — these medicines are not used in pregnancy.',
  },
  {
    category: 'eating_disorder',
    level: 'urgent',
    patterns: [/(binge eat|binging|purg(e|ing)|make myself (sick|vomit)|laxatives? to lose)/i],
    message:
      'What you are describing deserves proper support in its own right, and it changes how weight medicines should be used. Please tell your doctor — this is treatable and more common than people think.',
  },
  {
    category: 'relapse',
    level: 'advice',
    patterns: [
      /(started binge|stopped (my )?injection|stopped taking|gained (it |the weight )?back|gaining weight again|lost motivation|feel hopeless|giving up)/i,
      /(दोबारा वज़न बढ़|इंजेक्शन बंद)/,
    ],
    message: '',
  },
];

export function screenForSafety(text: string): SafetySignal {
  const order: SafetyLevel[] = ['emergency', 'urgent', 'advice', 'none'];
  const hits = RULES.filter((r) => r.patterns.some((p) => p.test(text)));
  if (hits.length === 0) return { level: 'none', category: 'none', message: '' };
  hits.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  const top = hits[0];
  return { level: top.level, category: top.category, message: top.message };
}

/**
 * Post-generation guard. The model is instructed never to prescribe; this
 * catches the rare case where it does anyway.
 */
const PRESCRIPTION_PATTERNS = [
  /\byou should (start|take|increase|decrease|stop) (taking )?\w+\s?(mg|mcg|units)\b/i,
  /\bi (recommend|suggest) (you )?(start|increase|take) \w+ \d+\s?(mg|mcg)\b/i,
  /\b(increase|raise|double) your dose to \d/i,
];

export function violatesPrescribingRule(text: string): boolean {
  return PRESCRIPTION_PATTERNS.some((p) => p.test(text));
}

export const SAFE_REWRITE_SUFFIX =
  '\n\nI cannot advise on dose changes — that decision belongs to your doctor, who can see your full history. Please raise it with them before changing anything.';
