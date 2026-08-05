/**
 * Safety triage.
 *
 * Runs on every inbound patient message before and after the model responds.
 * Nothing here depends on the LLM, so an offline device and a degraded model
 * both still escalate correctly.
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
