/**
 * Intent recognition for the on-device engine.
 *
 * Deliberately rule-based and multilingual. This runs when no LLM gateway is
 * configured (or when the network is down) so the product still answers real
 * questions instead of showing an error.
 */

export type Intent =
  | 'greeting'
  | 'eligibility'
  | 'myth'
  | 'education_general'
  | 'education_nutrition'
  | 'education_activity'
  | 'education_behaviour'
  | 'education_medical'
  | 'education_long_term'
  | 'want_treatment'
  | 'side_effects'
  | 'missed_dose'
  | 'dose_question'
  | 'storage_travel'
  | 'needle_fear'
  | 'expected_results'
  | 'food_question'
  | 'alcohol'
  | 'exercise_question'
  | 'sleep_question'
  | 'motivation'
  | 'relapse'
  | 'appointment'
  | 'refill'
  | 'cost'
  | 'progress'
  | 'thanks'
  | 'unknown';

interface IntentRule {
  intent: Intent;
  patterns: RegExp[];
  weight: number;
}

const RULES: IntentRule[] = [
  {
    intent: 'greeting',
    weight: 1,
    patterns: [
      /^(hi|hello|hey|namaste|namaskar|good (morning|afternoon|evening))\b/i,
      /^(नमस्ते|नमस्कार|हैलो)/,
      /^(નમસ્તે|કેમ છો)/,
      /^(नमस्कार|काय म्हणता)/,
    ],
  },
  {
    intent: 'eligibility',
    weight: 3,
    patterns: [
      /\b(am i eligible|eligib|do i qualify|qualify for|can i take|am i a candidate|suitable for me)\b/i,
      /\b(my bmi|calculate.{0,10}bmi|what.{0,5}my bmi)\b/i,
      /(पात्र हूँ|योग्य हूँ|मुझे मिल सकती)/,
      /(પાત્ર છું|મને મળી શકે)/,
      /(पात्र आहे|मला मिळू शकते)/,
    ],
  },
  {
    intent: 'want_treatment',
    weight: 4,
    patterns: [
      /(i want (treatment|medicine|medication|injections?|to start)|start treatment|need help (losing|with weight)|prescribe|where can i get)/i,
      /\b(ozempic|wegovy|mounjaro|semaglutide|tirzepatide|liraglutide|saxenda|rybelsus)\b/i,
      /(इलाज चाहिए|दवा चाहिए|इंजेक्शन चाहिए|शुरू करना है)/,
      /(સારવાર જોઈએ|દવા જોઈએ|શરૂ કરવું છે)/,
      /(उपचार हवा|औषध हवं|सुरू करायचं)/,
    ],
  },
  {
    intent: 'myth',
    weight: 3,
    patterns: [
      /\b(is it true|i heard|people say|my (friend|relative|mother|aunt) said|does it cause|will i get cancer|is it safe|cheating|shortcut)\b/i,
      /\b(side effects? cause|dangerous|harmful|banned)\b/i,
      /(सुना है|क्या सच है|खतरनाक)/,
      /(સાંભળ્યું છે|શું સાચું છે)/,
      /(ऐकलंय|खरं आहे का)/,
    ],
  },
  {
    intent: 'side_effects',
    weight: 3,
    patterns: [
      /\b(nausea|nauseous|vomit|throwing up|constipat|diarrh|loose motion|bloat|acidity|heartburn|burp|gas|stomach upset|side effect)\b/i,
      /\b(feel(ing)? sick|头|tired all the time|fatigue|hair fall|hair thinning)\b/i,
      /(उल्टी|मतली|कब्ज|दस्त|गैस|थकान|बाल झड़)/,
      /(ઉલટી|કબજિયાત|ઝાડા|થાક)/,
      /(उलटी|बद्धकोष्ठता|जुलाब|थकवा)/,
    ],
  },
  {
    intent: 'missed_dose',
    weight: 4,
    patterns: [
      /\b(missed (my |a )?(dose|injection|shot)|forgot (my |to take)|skipped (my )?(dose|injection)|late for my (dose|shot))\b/i,
      /(खुराक छूट|डोज़ भूल|इंजेक्शन भूल)/,
      /(ડોઝ ચૂકી|ભૂલી ગયો)/,
      /(डोस चुकला|विसरलो)/,
    ],
  },
  {
    intent: 'dose_question',
    weight: 3,
    patterns: [
      /(what dose|which dose|dose (increase|escalat)|(increase|raise|change|reduce|lower) (my |the )?dose|titrat|next dose|when (do|should) i (take|inject))/i,
      /(डोज़ कब|खुराक कितनी)/,
    ],
  },
  {
    intent: 'storage_travel',
    weight: 3,
    patterns: [
      /\b(store|storage|fridge|refrigerat|freez|travel|flight|aeroplane|airplane|carry|cooler)\b/i,
      /(फ्रिज|यात्रा|सफ़र|रखना)/,
      /(ફ્રિજ|મુસાફરી)/,
      /(फ्रिज|प्रवास)/,
    ],
  },
  {
    intent: 'needle_fear',
    weight: 4,
    patterns: [
      /(afraid of needles?|scared of (the )?(needle|injection)s?|needle (phobia|fear|anxiety)|does it (hurt|pain)|will it (hurt|pain))/i,
      /(सुई से डर|इंजेक्शन से डर|दर्द होगा)/,
      /(સોયનો ડર|દુખશે)/,
      /(सुईची भीती|दुखेल)/,
    ],
  },
  {
    intent: 'expected_results',
    weight: 3,
    patterns: [
      /\b(how much weight|how many k(g|ilo)|how fast|how long (will|does) it take|when will i see|expected (loss|result))\b/i,
      /(कितना वज़न|कितने किलो|कितने दिन में)/,
      /(કેટલું વજન|કેટલા દિવસમાં)/,
      /(किती वजन|किती दिवसांत)/,
    ],
  },
  {
    intent: 'food_question',
    weight: 2,
    patterns: [
      /\b(what (should i|can i) eat|diet|food|protein|meal|breakfast|lunch|dinner|roti|rice|dal|paneer|calorie)\b/i,
      /(क्या खाऊँ|खाना|प्रोटीन|आहार)/,
      /(શું ખાવું|ખોરાક|પ્રોટીન)/,
      /(काय खावं|आहार|प्रथिने)/,
    ],
  },
  {
    intent: 'alcohol',
    weight: 3,
    patterns: [/\b(alcohol|drink(ing)?|beer|whisky|wine|smoking|cigarette)\b/i, /(शराब|दारू|पीना)/],
  },
  {
    intent: 'exercise_question',
    weight: 2,
    patterns: [
      /\b(exercise|workout|gym|walk|running|yoga|steps|strength|weights|cardio)\b/i,
      /(व्यायाम|कसरत|चलना|योग)/,
      /(કસરત|ચાલવું)/,
      /(व्यायाम|चालणे)/,
    ],
  },
  {
    intent: 'sleep_question',
    weight: 2,
    patterns: [/\b(sleep|insomnia|can'?t sleep|tired|rest)\b/i, /(नींद|सो नहीं)/, /(ઊંઘ)/, /(झोप)/],
  },
  {
    intent: 'relapse',
    weight: 5,
    patterns: [
      /(started binge|binge eating|stopped (my |taking )?(the )?(injections?|medicine|treatment)|gained (it |the )?(weight )?back|gaining weight again|lost motivation|feel hopeless|giving up|back to square one)/i,
      /(दोबारा वज़न बढ़|इंजेक्शन बंद|हिम्मत टूट|उम्मीद नहीं)/,
      /(ફરી વજન વધ્યું|ઇન્જેક્શન બંધ|હિંમત તૂટી)/,
      /(पुन्हा वजन वाढ|इंजेक्शन बंद|हिंमत तुटली)/,
    ],
  },
  {
    intent: 'motivation',
    weight: 2,
    patterns: [
      /\b(not working|no progress|plateau|stuck|frustrat|demotivat|why bother|feel like quitting|discouraged)\b/i,
      /(कुछ नहीं हो रहा|मन नहीं|निराश)/,
      /(કંઈ થતું નથી|નિરાશ)/,
      /(काहीच होत नाही|निराश)/,
    ],
  },
  {
    intent: 'appointment',
    weight: 3,
    patterns: [
      /\b(appointment|book|consult|see a doctor|doctor near|clinic|hospital|teleconsult|video call)\b/i,
      /(अपॉइंटमेंट|डॉक्टर से मिल|बुक)/,
      /(એપોઇન્ટમેન્ટ|ડૉક્ટરને મળ)/,
      /(अपॉइंटमेंट|डॉक्टरांना भेट)/,
    ],
  },
  {
    intent: 'refill',
    weight: 3,
    patterns: [
      /\b(refill|running out|finish(ing)?|order|pharmacy|chemist|medicine (over|khatam))\b/i,
      /(दवा खत्म|रीफिल|मंगवा)/,
      /(દવા પૂરી|રીફિલ)/,
      /(औषध संपल|रिफिल)/,
    ],
  },
  {
    intent: 'cost',
    weight: 3,
    patterns: [
      /\b(cost|price|expensive|afford|how much (does|will) it cost|insurance|fees)\b/i,
      /(कीमत|महंगा|खर्च)/,
      /(કિંમત|મોંઘું)/,
      /(किंमत|महाग)/,
    ],
  },
  {
    intent: 'progress',
    weight: 2,
    patterns: [
      /\b(my progress|how am i doing|how much have i lost|my weight|my adherence)\b/i,
      /(मेरी प्रगति|कितना घटा)/,
    ],
  },
  {
    intent: 'education_nutrition',
    weight: 1,
    patterns: [/\b(nutrition|protein target|hydration|water intake)\b/i],
  },
  {
    intent: 'education_activity',
    weight: 1,
    patterns: [/\b(physical activity guideline|how much exercise)\b/i],
  },
  {
    intent: 'education_medical',
    weight: 2,
    patterns: [
      /\b(how (do|does) (glp|it|the medicine) work|what is glp|mechanism|how does it help)\b/i,
      /(कैसे काम करती है|कैसे असर)/,
    ],
  },
  {
    intent: 'education_long_term',
    weight: 2,
    patterns: [/\b(after (stopping|treatment)|long term|maintain|maintenance|forever|lifelong)\b/i],
  },
  {
    intent: 'education_general',
    weight: 1,
    patterns: [
      /\b(what is obesity|tell me about obesity|why am i (fat|overweight)|is obesity a disease)\b/i,
      /(मोटापा क्या|मोटापे के बारे)/,
      /(સ્થૂળતા શું)/,
      /(लठ्ठपणा म्हणजे)/,
    ],
  },
  {
    intent: 'thanks',
    weight: 1,
    patterns: [/^(thanks|thank you|thx|dhanyawad|shukriya)\b/i, /^(धन्यवाद|शुक्रिया)/, /^(આભાર)/, /^(धन्यवाद)/],
  },
];

export function classifyIntent(text: string): { intent: Intent; confidence: number } {
  const scores = new Map<Intent, number>();

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        scores.set(rule.intent, (scores.get(rule.intent) ?? 0) + rule.weight);
      }
    }
  }

  if (scores.size === 0) return { intent: 'unknown', confidence: 0 };

  const [intent, score] = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  return { intent, confidence: Math.min(1, score / 5) };
}

/** Extracts measurements the user mentions in free text. */
export function extractMeasurements(text: string): {
  weightKg?: number;
  heightCm?: number;
  waistCm?: number;
  age?: number;
} {
  const out: { weightKg?: number; heightCm?: number; waistCm?: number; age?: number } = {};

  const weight = text.match(/(\d{2,3}(?:\.\d)?)\s*(?:kg|kilo|किलो|કિલો)/i);
  if (weight) out.weightKg = Number(weight[1]);

  const heightCm = text.match(/(\d{3})\s*(?:cm|सेमी|સેમી)/i);
  if (heightCm) out.heightCm = Number(heightCm[1]);

  // 5'6" / 5 feet 6 / 5.6 ft
  const feet = text.match(/(\d)\s*(?:'|ft|feet|foot)\s*(\d{1,2})?/i);
  if (!out.heightCm && feet) {
    const ft = Number(feet[1]);
    const inch = feet[2] ? Number(feet[2]) : 0;
    if (ft >= 3 && ft <= 7) out.heightCm = Math.round((ft * 12 + inch) * 2.54);
  }

  const waist = text.match(/waist\D{0,12}(\d{2,3})/i) || text.match(/(?:कमर|કમર|कंबर)\D{0,10}(\d{2,3})/);
  if (waist) out.waistCm = Number(waist[1]);

  const age = text.match(/(?:i am|i'm|age|उम्र|ઉંમર|वय)\D{0,6}(\d{1,2})\s*(?:years?|yrs?|साल|વર્ષ|वर्ष)?/i);
  if (age) {
    const value = Number(age[1]);
    if (value >= 10 && value <= 100) out.age = value;
  }

  return out;
}
