import type { LanguageCode } from '@core/domain/types';

/**
 * Response bank for the on-device engine.
 *
 * Several variants per key so repeated questions do not produce identical text.
 * English is authoritative; other languages fall back to English when a key has
 * not been localised, which keeps the engine honest rather than silent.
 */

export type ResponseKey =
  | 'greeting_awareness'
  | 'greeting_returning'
  | 'want_treatment'
  | 'eligibility_need_data'
  | 'myth_unknown'
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
  | 'relapse'
  | 'motivation'
  | 'appointment'
  | 'refill'
  | 'cost'
  | 'progress'
  | 'thanks'
  | 'fallback';

type Bank = Partial<Record<ResponseKey, string[]>>;

const EN: Record<ResponseKey, string[]> = {
  greeting_awareness: [
    'Hello. I am here to talk about weight, health and what your options actually are — no judgement, and nothing recorded against your name.\n\nWhat brought you here today?',
    'Hi. You can ask me anything about weight and health, including the things that feel awkward to ask a doctor.\n\nWhere would you like to start?',
  ],
  greeting_returning: [
    'Good to see you again{{name}}. How are things going?',
    'Hello again{{name}}. What is on your mind today?',
  ],
  want_treatment: [
    'That is a clear and reasonable thing to want, and it is exactly the right moment to bring a doctor in.\n\nMedicines for obesity are prescription-only in India for good reason — the right choice depends on your BMI, waist, other conditions, and what you have already tried. A doctor can assess that properly in one visit.\n\nI can show you doctors who run obesity clinics near you, or run a quick eligibility check first so you walk in prepared.',
    'Good — wanting help is not a small step, and it is the one that actually changes things.\n\nThe next move is a consultation. Only a registered doctor can prescribe, and they will look at your BMI, waist measurement, other health conditions and history before deciding anything.\n\nShall I show you doctors near you, or would you rather check your eligibility first?',
  ],
  eligibility_need_data: [
    'I can work that out with you. I need two things to start: your height and your current weight.\n\nIf you also know your waist measurement, that makes it noticeably more accurate — in Indian populations waist matters as much as BMI.',
    'Happy to check. Tell me your height and your weight, and I will do the calculation using Indian thresholds rather than the Western ones.',
  ],
  myth_unknown: [
    'I do not have a stored evidence card for that one, and I am not going to guess at something medical.\n\nIf you tell me exactly what you heard and where, I can tell you whether it matches anything in the guidance I do have — and a doctor can give you a definitive answer.',
  ],
  side_effects: [
    'Most of these settle. Nausea, fullness, burping, constipation or loose stools are the common ones, and they are strongest in the first few days after a dose increase.\n\nWhat helps: smaller portions, eating slowly, less fried and fatty food on dose-change days, and more water. For constipation, fibre and fluids first, and ask your doctor before using a laxative.\n\nWhat is not routine: severe stomach pain spreading to your back, vomiting where you cannot keep fluids down, or yellowing of the eyes. Those need a doctor the same day.\n\nThis is general guidance — your doctor knows your case.',
  ],
  missed_dose: [
    'First, do not double up to catch up. That is the one thing that reliably makes people ill.\n\nThe correct action depends on which medicine you are on and how late you are — the rules genuinely differ between weekly and daily medicines. Check the instruction on your own prescription, or ask your doctor or pharmacist; either can answer in a minute.\n\nOne missed dose is not a failure and it does not undo your progress.',
  ],
  dose_question: [
    'Dose decisions belong to your doctor — I cannot advise on starting, changing or increasing anything.\n\nWhat I can tell you is the principle: doses are stepped up slowly on purpose, because the side effects that make people stop are almost always caused by going up too fast. If your current step feels hard, that is worth telling your doctor rather than pushing through or self-adjusting.\n\nYour schedule and next dose are in the Medication tab.',
  ],
  storage_travel: [
    'Injectable pens are kept in the fridge at 2-8 °C, and never frozen. Do not put them in the freezer compartment or against the back wall where things freeze.\n\nFor travel: carry them in hand luggage, never checked baggage — the hold gets cold enough to freeze them. A small insulated pouch with a gel pack is enough for a day of travel. Carry your prescription for security.\n\nEach product has its own rule about how long it can stay out of the fridge once in use, so follow the leaflet for your specific pen.',
  ],
  needle_fear: [
    'Needle anxiety is extremely common, and it is not something to be embarrassed about.\n\nThe practical part: the needle on a weekly pen is very short and very fine, and it goes into the fat layer, not muscle. Most people describe it as a pinch or nothing.\n\nWhat helps — let the pen sit out of the fridge for a few minutes first, sit down, breathe out slowly as you press, and look away. Most people are comfortable by the third or fourth dose.\n\nIf it stays overwhelming, tell your doctor. That is a real conversation to have, not a weakness.',
  ],
  expected_results: [
    'I will not give you a number to expect, because the honest answer is that individual response varies a lot.\n\nWhat trials show is a range, not a promise, and the people who do best are consistently the ones who keep protein up, keep moving, and stay on treatment long enough for it to work. Early weeks are often slow — that is normal, not a sign it is failing.\n\nA more useful target than kilograms is percentage: a 5% loss already improves blood sugar, blood pressure and joint pain measurably.',
  ],
  food_question: [
    'Protein at every meal is the single highest-value change, especially on appetite-lowering medicines — it is what protects your muscle while you lose fat.\n\nOn an Indian plate: dal, rajma, chana, paneer, curd, eggs, fish, chicken, soya, sprouts. Aim for roughly 1.2-1.6 g per kg of your target weight across the day.\n\nHalf the plate vegetables, a quarter protein, a quarter grain. Swap maida for whole grains where you can, and drink 2.5-3 litres of water.\n\nEat slowly and stop at comfortably full — with slowed stomach emptying, eating past fullness is the most common cause of vomiting.',
  ],
  alcohol: [
    'Alcohol works against you in three ways here: it is dense in calories with no useful nutrition, it lowers your inhibition around food, and it irritates a stomach that is already emptying slowly.\n\nThere is also a specific caution — if you take insulin or a sulfonylurea alongside your weight medicine, alcohol raises the risk of low blood sugar, particularly overnight.\n\nIf you drink, keep it occasional, eat before, and stay hydrated. Your doctor should know your actual intake — they are not there to judge it.',
  ],
  exercise_question: [
    'The target that matters is 150 minutes a week of moderate activity plus strength work on two days.\n\nThe strength part is the one people skip and the one that matters most during weight loss — without it you lose muscle along with fat, which makes maintenance harder later.\n\nIf your knees hurt, work with what does not hurt: flat walking, cycling, swimming, chair exercises. Start smaller than feels impressive. Ten minutes you actually do beats an hour you skip.',
  ],
  sleep_question: [
    'Sleep is a weight intervention, not a luxury. Under six hours raises hunger hormones and cravings the next day, for exactly the same food.\n\nThe anchors that work: a fixed wake time, daylight in the morning, no caffeine after 2 pm, and screens away 30 minutes before bed.\n\nIf you snore heavily, wake unrefreshed, or feel sleepy through the day, mention it to your doctor — sleep apnoea is common with obesity and very treatable.',
  ],
  relapse: [
    'Thank you for telling me. That took something, and this is exactly the moment where support makes the most difference.\n\nWhat you are describing is the disease reasserting itself, not you failing. Weight regain after treatment is documented and expected — which is precisely why this stage exists.\n\nThe useful move now is small and immediate: restart weekly weighing, get protein back into every meal, and book a review with your doctor in the next two weeks. Early action keeps this small.',
  ],
  motivation: [
    'Plateaus and flat weeks are part of this, not evidence that it is not working. Weight moves in steps, not a line.\n\nLook at what you have actually done{{progress}} rather than only at the number this week. Doses taken, walks done, protein hit — those are the things that produce the number eventually.\n\nWhat is the smallest thing that would make this week feel manageable?',
  ],
  appointment: [
    'I can help you get in front of a doctor. You can see who runs obesity clinics near you, what they charge, which languages they speak, and book a slot — in person or by video.',
  ],
  refill: [
    'Running out is worth avoiding — gaps in a weekly medicine can bring side effects back when you restart.\n\nYou can request a refill through the hospital pharmacy, a nearby chemist, or home delivery. Injectable pens need cold-chain delivery, so pick a pharmacy that supports it.',
  ],
  cost: [
    'Cost is a real factor and worth raising openly with your doctor — there are often meaningful differences between products, and between brand and equivalent options.\n\nSome hospitals and insurers cover obesity care when there is a linked condition such as type 2 diabetes or sleep apnoea. Ask your doctor and your insurer directly; the answer varies a lot by policy.',
  ],
  progress: [
    'Here is where things stand{{progress}}.\n\nThe number that matters clinically is percentage of starting weight, not kilograms — 5% already improves blood sugar, blood pressure and joint load.\n\nOpen your journey to see the full timeline.',
  ],
  thanks: [
    'Any time. I am here whenever something comes up.',
    'Glad it helped. Come back whenever you need to.',
  ],
  fallback: [
    'I want to answer that properly rather than guess.\n\nI can help with eligibility, how treatment works, side effects, food, activity, motivation, and getting you to a doctor. If you rephrase what you are after, I will do my best — and for anything clinical, a doctor is the right answer.',
  ],
};

const HI: Bank = {
  greeting_awareness: [
    'नमस्ते। मैं यहाँ वज़न, सेहत और आपके विकल्पों पर बात करने के लिए हूँ — बिना किसी जजमेंट के, और आपके नाम से कुछ भी दर्ज किए बिना।\n\nआज आप किस वजह से आए हैं?',
  ],
  greeting_returning: ['फिर से मिलकर अच्छा लगा{{name}}। सब कैसा चल रहा है?'],
  want_treatment: [
    'यह चाहना बिल्कुल सही है, और यही सही समय है डॉक्टर को शामिल करने का।\n\nभारत में मोटापे की दवाएँ केवल पर्चे पर मिलती हैं — सही विकल्प आपके BMI, कमर, अन्य बीमारियों और अब तक की कोशिशों पर निर्भर करता है। डॉक्टर एक ही मुलाक़ात में यह ठीक से जाँच सकते हैं।\n\nमैं आपके पास के डॉक्टर दिखा सकता हूँ, या पहले पात्रता जाँच कर सकता हूँ।',
  ],
  eligibility_need_data: [
    'मैं यह निकाल सकता हूँ। शुरू करने के लिए दो चीज़ें चाहिए: आपकी ऊँचाई और मौजूदा वज़न।\n\nकमर का माप भी पता हो तो नतीजा काफ़ी सटीक होगा — भारतीय आबादी में कमर का माप BMI जितना ही मायने रखता है।',
  ],
  missed_dose: [
    'सबसे पहले — भरपाई के लिए दो खुराक एक साथ न लें। यही एक चीज़ है जो अक्सर तबीयत बिगाड़ती है।\n\nसही कदम इस पर निर्भर करता है कि आप कौन सी दवा ले रहे हैं और कितनी देर हुई है। अपने पर्चे पर लिखा निर्देश देखें, या डॉक्टर/फ़ार्मासिस्ट से पूछें।\n\nएक खुराक छूटना नाकामी नहीं है और इससे आपकी प्रगति नहीं मिटती।',
  ],
  relapse: [
    'बताने के लिए धन्यवाद। यह कहना आसान नहीं होता, और यही वह समय है जब मदद सबसे ज़्यादा काम आती है।\n\nजो हो रहा है वह बीमारी का दोबारा उभरना है, आपकी नाकामी नहीं। इलाज के बाद वज़न बढ़ना दर्ज और अपेक्षित है — इसीलिए यह चरण मौजूद है।\n\nअभी छोटा कदम उठाएँ: हफ़्ते में एक बार वज़न, हर खाने में प्रोटीन, और दो हफ़्ते के भीतर डॉक्टर से मुलाक़ात।',
  ],
  thanks: ['कभी भी। जब भी कुछ हो, मैं यहीं हूँ।'],
  fallback: [
    'मैं अंदाज़ा लगाने के बजाय सही जवाब देना चाहता हूँ।\n\nमैं पात्रता, इलाज कैसे काम करता है, दुष्प्रभाव, खान-पान, व्यायाम, प्रेरणा और डॉक्टर तक पहुँचने में मदद कर सकता हूँ। सवाल थोड़ा अलग तरीक़े से पूछें — और किसी भी चिकित्सकीय बात के लिए डॉक्टर ही सही जवाब हैं।',
  ],
};

const GU: Bank = {
  greeting_awareness: [
    'નમસ્તે. હું અહીં વજન, આરોગ્ય અને તમારા વિકલ્પો વિશે વાત કરવા છું — કોઈ ચુકાદા વગર, અને તમારા નામે કંઈ નોંધ્યા વગર.\n\nઆજે તમે કયા કારણે આવ્યા છો?',
  ],
  greeting_returning: ['ફરી મળીને આનંદ થયો{{name}}. બધું કેમ ચાલે છે?'],
  want_treatment: [
    'આ ઇચ્છવું તદ્દન વાજબી છે, અને ડૉક્ટરને સામેલ કરવાનો આ જ યોગ્ય સમય છે.\n\nભારતમાં સ્થૂળતાની દવાઓ માત્ર પ્રિસ્ક્રિપ્શન પર મળે છે. ડૉક્ટર તમારા BMI, કમર, અન્ય બીમારીઓ જોઈને નક્કી કરશે.\n\nહું નજીકના ડૉક્ટર બતાવું કે પહેલાં પાત્રતા તપાસું?',
  ],
  eligibility_need_data: [
    'હું ગણી શકું. શરૂ કરવા બે વસ્તુ જોઈએ: તમારી ઊંચાઈ અને હાલનું વજન.\n\nકમરનું માપ પણ ખબર હોય તો પરિણામ વધુ ચોક્કસ થશે.',
  ],
  thanks: ['ગમે ત્યારે. જ્યારે પણ કંઈ હોય, હું અહીં છું.'],
  fallback: [
    'હું અનુમાન કરવાને બદલે યોગ્ય જવાબ આપવા માંગું છું.\n\nહું પાત્રતા, સારવાર કેવી રીતે કામ કરે, આડઅસર, ખોરાક, કસરત, પ્રેરણા અને ડૉક્ટર સુધી પહોંચવામાં મદદ કરી શકું.',
  ],
};

const MR: Bank = {
  greeting_awareness: [
    'नमस्कार. मी इथे वजन, आरोग्य आणि तुमचे पर्याय यावर बोलण्यासाठी आहे — कोणताही निवाडा न करता, आणि तुमच्या नावावर काहीही न नोंदवता.\n\nआज तुम्ही कशामुळे आलात?',
  ],
  greeting_returning: ['पुन्हा भेटून आनंद झाला{{name}}. कसं चाललंय?'],
  want_treatment: [
    'हे हवंसं वाटणं पूर्णपणे रास्त आहे, आणि डॉक्टरांना सामील करण्याची हीच योग्य वेळ आहे.\n\nभारतात लठ्ठपणाची औषधं फक्त प्रिस्क्रिप्शनवर मिळतात. डॉक्टर तुमचा BMI, कंबर, इतर आजार पाहून ठरवतील.\n\nमी जवळचे डॉक्टर दाखवू का, की आधी पात्रता तपासू?',
  ],
  eligibility_need_data: [
    'मी हे काढू शकतो. सुरुवातीसाठी दोन गोष्टी हव्यात: तुमची उंची आणि सध्याचं वजन.\n\nकंबरेचं माप माहीत असेल तर निकाल अधिक अचूक होईल.',
  ],
  thanks: ['कधीही. जेव्हा गरज असेल तेव्हा मी इथेच आहे.'],
  fallback: [
    'अंदाज लावण्यापेक्षा मला योग्य उत्तर द्यायचं आहे.\n\nमी पात्रता, उपचार कसे काम करतात, दुष्परिणाम, आहार, व्यायाम, प्रेरणा आणि डॉक्टरांपर्यंत पोहोचण्यात मदत करू शकतो.',
  ],
};

const BANKS: Record<LanguageCode, Bank> = { en: EN, hi: HI, gu: GU, mr: MR };

export function responses(
  key: ResponseKey,
  language: LanguageCode = 'en',
  context?: { displayName?: string | null; percentLost?: number | null; adherence?: number | null },
): string[] {
  const localised = BANKS[language]?.[key];
  const variants = localised?.length ? localised : EN[key];
  return variants.map((v) => interpolate(v, context));
}

function interpolate(
  template: string,
  context?: { displayName?: string | null; percentLost?: number | null; adherence?: number | null },
): string {
  const name = context?.displayName ? `, ${context.displayName}` : '';

  const parts: string[] = [];
  if (typeof context?.percentLost === 'number' && context.percentLost > 0) {
    parts.push(`you are ${context.percentLost}% down from where you started`);
  }
  if (typeof context?.adherence === 'number') {
    parts.push(`your medication adherence over the last four weeks is ${context.adherence}%`);
  }
  const progress = parts.length ? ` — ${parts.join(', and ')}` : '';

  return template.replace(/\{\{name\}\}/g, name).replace(/\{\{progress\}\}/g, progress);
}

/** Deterministic-enough variety without a random seed per render. */
export function pickVariant(variants: string[]): string {
  if (variants.length === 1) return variants[0];
  const index = Math.floor(Math.random() * variants.length);
  return variants[index];
}
