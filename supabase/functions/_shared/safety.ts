/**
 * Server-side safety triage.
 *
 * MIRROR of src/core/clinical/safety.ts. Everything from `SafetyLevel` to
 * `wantsTreatment` is copied verbatim and is compared byte-for-byte by
 * src/core/clinical/__tests__/safetyParity.test.ts — edit both copies, or
 * neither.
 *
 * This file used to be a hand-maintained "mirror" that had drifted: three whole
 * red-flag categories (hypoglycaemia, gallbladder, medication_misuse) and
 * several multilingual patterns existed only on the device. Since the server is
 * the *preferred* engine, the better-connected patient was getting the weaker
 * protection — someone typing "the whites of my eyes have gone yellow" got a
 * deterministic escalation on a key-less phone and nothing at all on a
 * fully configured one.
 */

export type SafetyLevel = 'none' | 'advice' | 'urgent' | 'emergency';

export interface SafetySignal {
  level: SafetyLevel;
  category:
    | 'none'
    | 'pancreatitis'
    | 'dehydration'
    | 'hypoglycaemia'
    | 'gallbladder'
    | 'allergy'
    | 'pregnancy'
    | 'self_harm'
    | 'eating_disorder'
    | 'relapse'
    | 'medication_misuse';
  message: string;
  matched: string[];
}

interface Rule {
  category: SafetySignal['category'];
  level: SafetyLevel;
  patterns: RegExp[];
  message: string;
}

/**
 * Patterns are deliberately multilingual — patients switch language mid-sentence
 * and the highest-stakes rules must not depend on the UI language setting.
 */
const RULES: Rule[] = [
  {
    category: 'self_harm',
    level: 'emergency',
    patterns: [
      /\b(kill myself|end my life|suicid|self harm|don'?t want to live|no reason to live)\b/i,
      /(जान देने|आत्महत्या|मरना चाहता|जीने का मन नहीं)/,
      /(આપઘાત|જીવવું નથી)/,
      /(आत्महत्या|जगावंसं वाटत नाही)/,
    ],
    message:
      'You matter, and this is more important than anything about weight. Please contact Tele-MANAS on 14416 (free, 24x7, multiple Indian languages) or go to the nearest emergency department now. If you are in immediate danger, call 112.',
  },
  {
    category: 'pancreatitis',
    level: 'emergency',
    patterns: [
      /\bsevere (stomach|abdominal|belly) pain\b/i,
      /\b(pain (in|from) (my )?(stomach|abdomen).{0,30}(back|radiat))/i,
      /\b(unbearable|intense) (stomach|abdominal) pain\b/i,
      /(पेट में तेज़? दर्द|पेट का असहनीय दर्द)/,
      /(પેટમાં તીવ્ર દુખાવો)/,
      /(पोटात तीव्र वेदना)/,
    ],
    message:
      'Severe stomach pain that spreads to your back needs to be seen today — it can be pancreatitis, which is uncommon but serious. Stop your next dose, do not eat, and go to an emergency department or call your doctor now.',
  },
  {
    category: 'dehydration',
    level: 'urgent',
    patterns: [
      /\b(vomiting|throwing up).{0,40}(all day|constantly|every|can'?t keep|cannot keep)\b/i,
      /\b(can'?t keep (any )?(water|fluids?|food) down)\b/i,
      /\b(no urine|not passed urine|not peeing)\b/i,
      /(लगातार उल्टी|पानी भी नहीं रुक)/,
    ],
    message:
      'Repeated vomiting where you cannot keep fluids down causes dehydration quickly. Please contact your doctor today, and go to a clinic if you feel dizzy, are passing very little urine, or your mouth is very dry.',
  },
  {
    category: 'hypoglycaemia',
    level: 'urgent',
    patterns: [
      /\b(sugar (went|dropped|drops|is|was|has gone) (very |really )?low|low blood sugar|hypo(glycaemi|glycemi)|shaky and sweating|sweating and shaky)\b/i,
      /(शुगर बहुत कम|हाइपो)/,
    ],
    message:
      'Low blood sugar needs immediate treatment: take 15 g of fast sugar (3 teaspoons of sugar, or glucose) now and re-check in 15 minutes. Then tell your doctor — if you take insulin or a sulfonylurea alongside your weight medicine, the doses usually need adjusting.',
  },
  {
    category: 'gallbladder',
    level: 'urgent',
    patterns: [
      /\b(pain (in |on )?(the )?(right|upper right).{0,25}(abdomen|stomach|side|rib))\b/i,
      /\b(yellow(ing)? (of )?(my |the )?(eyes|skin)|jaundice)\b/i,
      // How people actually say it: "the whites of my eyes have gone yellow",
      // "my skin is turning yellow". The clinical phrasing above matches almost
      // nobody's own words.
      /\b(eyes|skin|whites of (my |the )?eyes)\b.{0,30}\b(gone|going|turned|turning|look(ing)?|are|is|have gone)\b.{0,10}\byellow/i,
    ],
    message:
      'Pain under the right ribs, especially after fatty food, or yellowing of the eyes needs a doctor promptly — rapid weight loss raises the chance of gallstones.',
  },
  {
    category: 'allergy',
    level: 'emergency',
    patterns: [
      /\b(swelling of (my )?(face|lips|tongue|throat)|difficulty breathing|trouble breathing|throat closing)\b/i,
      /(साँस लेने में तकलीफ|चेहरा सूज)/,
    ],
    message:
      'Swelling of the face, lips or throat, or difficulty breathing, is a medical emergency. Call 112 or go to the nearest emergency department immediately.',
  },
  {
    category: 'pregnancy',
    level: 'urgent',
    patterns: [
      /\b(i(')?m pregnant|i am pregnant|missed my period.{0,30}(test|pregnan)|planning (a )?pregnancy|trying to conceive)\b/i,
      /(गर्भवती|प्रेग्नेंट)/,
      /(ગર્ભવતી)/,
      /(गर्भवती आहे)/,
    ],
    message:
      'If you are pregnant, might be pregnant, or are trying to conceive, stop the weight-loss medicine and contact your doctor straight away — these medicines are not used in pregnancy.',
  },
  {
    category: 'eating_disorder',
    level: 'urgent',
    patterns: [
      /\b(binge eat|binging|purg(e|ing)|make myself (sick|vomit)|laxative(s)? to lose)\b/i,
      /\b(not eaten (anything )?(for|in) (\d+ )?(days|day))\b/i,
      /(उल्टी करके|भूखा रह)/,
    ],
    message:
      'What you are describing — binge eating, purging, or long periods of not eating — deserves proper support in its own right, and it changes how weight medicines should be used. Please tell your doctor; this is treatable and common.',
  },
  {
    category: 'medication_misuse',
    level: 'advice',
    patterns: [
      // Past tense matters more than present here: people report what they have
      // already done ("I doubled my dose"), not what they intend to do.
      /\b(doubl(e|ed|ing) (the |my )?(weekly |daily )?dose|took two doses|took (an )?extra dose|increas(e|ed|ing) (my )?dose (myself|on my own)|skip(ping|ped)? to a higher dose|went up (a dose|to \d))\b/i,
      /(खुद डोज़ बढ़ा|दो डोज़ ले)/,
    ],
    message:
      'Please do not change the dose yourself. Titration steps exist because faster escalation is what causes most severe side effects. If you have taken extra, tell your doctor today.',
  },
  {
    category: 'relapse',
    level: 'advice',
    patterns: [
      /(started binge|stopped (my |taking )?(the )?injections?|stopped (taking|treatment)|gained (it |the )?(weight )?back|gaining weight again|lost motivation|feel hopeless|giving up)/i,
      /(दोबारा वज़न बढ़|इंजेक्शन बंद|हिम्मत टूट)/,
      /(ફરી વજન વધ્યું|ઇન્જેક્શન બંધ)/,
      /(पुन्हा वजन वाढ|इंजेक्शन बंद)/,
    ],
    message:
      'Thank you for telling me — this is exactly when support helps most, and it is not a failure.',
  },
];

export function screenForSafety(text: string): SafetySignal {
  const matches: SafetySignal[] = [];

  for (const rule of RULES) {
    const matched = rule.patterns
      .map((p) => text.match(p)?.[0])
      .filter((m): m is string => Boolean(m));
    if (matched.length > 0) {
      matches.push({
        level: rule.level,
        category: rule.category,
        message: rule.message,
        matched,
      });
    }
  }

  if (matches.length === 0) {
    return { level: 'none', category: 'none', message: '', matched: [] };
  }

  const order: SafetyLevel[] = ['emergency', 'urgent', 'advice', 'none'];
  matches.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level));
  return matches[0];
}

/** True when the message should trigger the relapse-prevention protocol. */
export function isRelapseSignal(text: string): boolean {
  const signal = screenForSafety(text);
  return signal.category === 'relapse' || signal.category === 'eating_disorder';
}

/**
 * Intents that must route the patient towards a clinician. The awareness-stage
 * agent uses this to surface the "Talk to a doctor" card automatically.
 */
export function wantsTreatment(text: string): boolean {
  return [
    /(i want (treatment|medicine|medication|injections?|to start)|start treatment|need help (losing|with weight)|prescribe|prescription for)/i,
    /\b(ozempic|wegovy|mounjaro|semaglutide|tirzepatide|liraglutide|saxenda|rybelsus)\b/i,
    /(इलाज चाहिए|दवा चाहिए|इंजेक्शन चाहिए|मदद चाहिए)/,
    /(સારવાર જોઈએ|દવા જોઈએ|ઇન્જેક્શન જોઈએ)/,
    /(उपचार हवा|औषध हवं|इंजेक्शन हवं)/,
  ].some((p) => p.test(text));
}

export const CRISIS_RESOURCES_IN = [
  { name: 'Tele-MANAS (Govt. of India mental health)', number: '14416' },
  { name: 'Emergency services', number: '112' },
  { name: 'Ambulance', number: '108' },
];

/**
 * Post-generation guard: catches a model that gives dose advice anyway.
 *
 * MIRROR of src/core/clinical/prescribingGuard.ts, held byte-identical by
 * src/core/clinical/__tests__/prescribingGuard.test.ts. Every real GLP-1 dose
 * is decimal, which is what the patterns are shaped around.
 */
const DOSE = String.raw`\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|units?|iu)\b`;

/**
 * Words that turn a mention of a dose into an instruction to take one.
 *
 * Includes the *downward* verbs — stop, drop, cut, come off, go back. Telling
 * someone to reduce or stop is every bit as much a prescribing decision as
 * telling them to increase, and it is the direction more likely to cause harm
 * if the patient acts on it without their doctor.
 */
const DIRECTIVE = String.raw`you should|you need to|you can|you could|i(?:'d| would)? (?:recommend|suggest|advise)|i recommend|i suggest|i advise|let'?s|try|start|switch|move|step|go|go back|increase|decrease|reduce|raise|lower|double|halve|bump|titrate|take|inject|administer|stay on|stick to|stop|skip|pause|hold|discontinue|come off|come down|drop|drop back|cut|cut back|revert`;

export const PRESCRIPTION_PATTERNS: RegExp[] = [
  // A directive within a short distance of a dose:
  // "you should take semaglutide 0.5 mg", "let's go up to 1 mg", "try 2.4 mg".
  new RegExp(String.raw`\b(?:${DIRECTIVE})\b[^.!?\n]{0,60}?${DOSE}`, 'i'),

  // A dose change with no number at all: "step up your dose", "double your
  // weekly dose", "reduce the dose".
  new RegExp(
    String.raw`\b(increase|decrease|raise|lower|double|halve|reduce|bump|step|go)\s+(up\s+|down\s+)?(?:on\s+)?(your|the)\s+(weekly\s+|daily\s+|current\s+)?dose\b`,
    'i',
  ),

  // Explicit titration language.
  new RegExp(String.raw`\b(titrate|up-?titrate|down-?titrate|dose escalation)\b`, 'i'),

  // Telling someone to stop, skip or hold medication — a prescribing decision
  // in the other direction, and the one most likely to cause harm.
  new RegExp(
    String.raw`\b(stop|skip|pause|hold|discontinue|come off)\b\s+(taking\s+)?(your|the)\s+[^.!?\n]{0,20}?(dose|injection|shot|medication|medicine|jab)\b`,
    'i',
  ),

  // "instead of 1.7 mg", "rather than 0.5 mg" — comparative dose advice.
  new RegExp(String.raw`\b(instead of|rather than)\s+${DOSE}`, 'i'),

  // Stopping by pronoun: "come off it for now", "pause it until you see them".
  // In this app's register the referent is always the medicine.
  new RegExp(String.raw`\b(stop|pause|come off|discontinue)\s+(taking\s+)?(it|them|this)\b`, 'i'),
];

export function violatesPrescribingRule(text: string): boolean {
  return PRESCRIPTION_PATTERNS.some((pattern) => pattern.test(text));
}

export const SAFE_REWRITE_SUFFIX =
  '\n\nI cannot advise on dose changes — that decision belongs to your doctor, who can see your full history. Please raise it with them before changing anything.';

/**
 * MIRROR of the call-request gate in src/features/calls/api/resolveDoctor.ts,
 * held byte-identical by src/features/calls/api/__tests__/callGateParity.test.ts.
 *
 * It decides whether the assistant may open the user's dialler unprompted, so
 * the server must apply exactly the rule the device applies — otherwise the
 * better-connected patient gets the looser one.
 */
/**
 * Whether the user asked to be put through, as opposed to talking *about*
 * ringing someone.
 *
 * Deliberately narrow. The cost of a false positive is the dialler opening
 * unasked, which is intrusive and erodes trust in every other suggestion the
 * app makes; the cost of a false negative is a tappable Call button, which is
 * what the app did before and is perfectly fine. So this only fires on an
 * imperative, and never on a question ("should I call my doctor?") or a report
 * ("I called my doctor yesterday").
 *
 * Phone keyboards autocorrect a straight apostrophe to a curly one, so the
 * patterns accept both. Matching only ' means "don't call" reads as a request
 * to call, which is the worst possible way to get this wrong — and it is what
 * the first version did.
 */
const APOS = "['\u2019]";

const CALL_REQUEST_PATTERNS: RegExp[] = [
  /^\s*(please\s+)?(call|phone|dial|ring)\b(?!.*\?)/i,
  /\b(call|phone|ring|dial)\s+(my\s+|the\s+)?(doctor|dr\.?|physician|clinic)\b(?!.*\?)/i,
  /\b(put me through|connect me)\b/i,
  /(डॉक्टर को (कॉल|फ़ोन) करो|कॉल लगाओ|फ़ोन लगाओ)/,
  /(ડૉક્ટરને (કૉલ|ફોન) કરો|કૉલ લગાવો)/,
  /(डॉक्टरांना (कॉल|फोन) करा|कॉल लावा)/,
];

/** Phrases that look like a request but are not one. */
const NOT_A_REQUEST: RegExp[] = [
  /\b(should|shall|do you think|is it worth|when should|do i need)\b/i,
  /\b(called|phoned|rang|dialled|dialed)\b/i,
  new RegExp(
    `\\b(cannot|can${APOS}?t|could not|couldn${APOS}?t|do not want to|don${APOS}?t want to)\\s+(call|phone|ring)\\b`,
    'i',
  ),
];

export function isDirectCallRequest(text: string): boolean {
  if (NOT_A_REQUEST.some((pattern) => pattern.test(text))) return false;
  return CALL_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}
