import type { EducationTopic } from '@core/domain/types';

/**
 * Offline education library. Mirrors `education_topics` in `supabase/seed.sql`.
 * Sources are WHO and ICMR-NIN; nothing here is invented.
 */
export const EDUCATION_TOPICS: EducationTopic[] = [
  {
    id: 'obesity-is-a-disease',
    title: 'Obesity is a medical condition, not a willpower problem',
    category: 'basics',
    summary:
      'Obesity is a chronic, relapsing disease driven by biology, environment and genetics — the body defends its highest weight.',
    body: [
      'The World Health Organization classifies obesity as a chronic disease. It is not a character flaw and it is not caused by laziness.',
      'When you lose weight, the body responds by lowering the energy it burns at rest and raising hunger hormones such as ghrelin, while lowering fullness hormones such as GLP-1 and leptin. This is why weight regain is so common after dieting — the biology actively pushes back.',
      'Because it is chronic, obesity needs long-term management the same way blood pressure or diabetes does. Stopping treatment usually means the condition returns; that is a property of the disease, not a failure of the person.',
      'In India, body fat rises at a lower BMI than in Western populations. ICMR guidance therefore treats BMI 23 and above as overweight and 25 and above as obesity, with waist circumference above 90 cm (men) or 80 cm (women) as an independent risk marker.',
    ],
    readMinutes: 4,
    sources: ['WHO Obesity and overweight fact sheet', 'ICMR-NIN Dietary Guidelines for Indians 2024'],
  },
  {
    id: 'how-glp1-works',
    title: 'How GLP-1 medicines actually work',
    category: 'medical',
    summary:
      'GLP-1 medicines copy a natural gut hormone that tells the brain you are full and slows how quickly the stomach empties.',
    body: [
      'GLP-1 (glucagon-like peptide-1) is a hormone your gut already releases after eating. It signals fullness to the brain, slows stomach emptying and improves the pancreas’ insulin response.',
      'GLP-1 receptor agonist medicines are a longer-lasting version of that same signal. They do not burn fat directly and they are not stimulants. They reduce appetite and food noise so that eating less does not feel like a constant fight.',
      'Doses are started low and increased in steps (titration) over weeks. This is deliberate — it gives the stomach time to adjust and keeps nausea manageable.',
      'These medicines are prescription-only. A doctor must confirm they are appropriate, rule out contraindications, and monitor you while you are on them.',
    ],
    readMinutes: 4,
    sources: ['WHO Model List of Essential Medicines', 'Indian consensus statements on obesity pharmacotherapy'],
  },
  {
    id: 'nutrition-basics',
    title: 'Eating well on an Indian plate',
    category: 'nutrition',
    summary:
      'Protein at every meal, half the plate vegetables, and fewer refined carbohydrates — without giving up the food you grew up with.',
    body: [
      'Aim for 1.2 to 1.6 g of protein per kg of your target body weight each day. On appetite-suppressing medicines this matters even more, because muscle is lost alongside fat when protein is too low.',
      'Indian high-protein options: dal and rajma, chana, paneer, curd and Greek-style dahi, eggs, fish, chicken, soya chunks, sprouts, and milk. A katori of dal has roughly 6-7 g of protein — most people need several servings across the day.',
      'Fill half your plate with vegetables and salad, one quarter with protein, and one quarter with grain. Swap refined flour (maida) for whole grains such as jowar, bajra, and unpolished rice where you can.',
      'Drink 2.5 to 3 litres of water daily. On GLP-1 medicines dehydration worsens nausea, constipation and fatigue.',
      'Eat slowly and stop at comfortably full. With slowed stomach emptying, eating past fullness is the single most common cause of vomiting.',
    ],
    readMinutes: 5,
    sources: ['ICMR-NIN Dietary Guidelines for Indians 2024', 'WHO Healthy diet fact sheet'],
  },
  {
    id: 'activity-basics',
    title: 'Moving in a way your body can sustain',
    category: 'activity',
    summary:
      '150 minutes a week of moderate activity plus two strength sessions protects muscle while you lose fat.',
    body: [
      'WHO recommends 150-300 minutes of moderate aerobic activity per week for adults, plus muscle-strengthening on two or more days.',
      'If your knees hurt, start with what does not: walking on flat ground, cycling, swimming, or chair-based exercises. Pain is a signal to change the activity, not to stop moving.',
      'Resistance training is not optional during medical weight loss. Losing weight without strength work costs you muscle, which lowers your resting metabolism and makes maintenance harder.',
      'Build the habit before the intensity. Ten minutes daily that you actually do beats an hour you skip.',
    ],
    readMinutes: 3,
    sources: ['WHO Guidelines on physical activity and sedentary behaviour 2020'],
  },
  {
    id: 'behavioural-health',
    title: 'The mind side of weight',
    category: 'behaviour',
    summary:
      'Stress, sleep, low mood and stigma all change eating behaviour — treating them is part of treating obesity.',
    body: [
      'Short sleep raises hunger hormones and cravings the next day. Seven to nine hours is a weight-management intervention, not a luxury.',
      'Emotional eating is a coping strategy, not a moral failure. Naming the trigger — stress, boredom, loneliness, exhaustion — is the first step in choosing a different response.',
      'Weight stigma, including from healthcare, makes outcomes worse: people avoid care, and stress hormones rise. You are entitled to be treated with respect at every appointment.',
      'If you binge, purge, or feel out of control around food, tell your doctor. Eating disorders need specific treatment and change how weight medicines should be used.',
    ],
    readMinutes: 4,
    sources: ['WHO European Regional Obesity Report 2022', 'Indian Psychiatric Society guidance on eating disorders'],
  },
  {
    id: 'side-effects',
    title: 'Side effects: what is expected and what is not',
    category: 'safety',
    summary:
      'Most side effects are gastrointestinal, early, and settle. A few are red flags that need urgent care.',
    body: [
      'Common and usually temporary: nausea, fullness, burping, constipation or loose stools, mild fatigue and headache. These are strongest in the first days after a dose increase and typically ease within a few weeks.',
      'What helps: smaller portions, eating slowly, less fat and less fried food on dose-change days, more water, and fibre or a doctor-approved laxative for constipation.',
      'Seek urgent medical care for severe, persistent abdominal pain radiating to the back (possible pancreatitis), repeated vomiting with inability to keep fluids down, signs of dehydration, severe right-upper-abdomen pain (gallbladder), or symptoms of low blood sugar if you also take insulin or sulfonylureas.',
      'Never increase your own dose to speed up results. Titration schedules exist because faster escalation causes most severe side effects.',
    ],
    readMinutes: 4,
    sources: ['WHO pharmacovigilance guidance', 'Product monographs for GLP-1 receptor agonists'],
  },
  {
    id: 'long-term',
    title: 'Life after the medicine',
    category: 'long_term',
    summary:
      'Obesity is chronic — maintenance is an active phase with its own plan, not the absence of treatment.',
    body: [
      'Studies consistently show that most people regain a substantial share of lost weight within a year of stopping GLP-1 therapy if nothing replaces it. This is the disease reasserting itself, not relapse of character.',
      'What protects maintenance: keeping protein high, keeping resistance training, weighing weekly (not daily), monthly check-ins, and having a written plan for what you do if weight rises by 3-5%.',
      'Some people stay on a lower maintenance dose long-term. That decision belongs to you and your doctor, and it is a legitimate medical choice, not a failure to "do it yourself".',
      'Catch drift early. A 2 kg rise is a nudge; a 10 kg rise is a rebuild. Early action is the whole game.',
    ],
    readMinutes: 4,
    sources: ['WHO Obesity and overweight fact sheet', 'STEP and SURMOUNT trial extension data'],
  },
  {
    id: 'injection-technique',
    title: 'Using a weekly pen without dreading it',
    category: 'medical',
    summary:
      'Needle anxiety is common and manageable. The needles are very fine and the injection is into fat, not muscle.',
    body: [
      'The needle on a weekly pen is short and very fine — most people describe it as a pinch or nothing at all. It goes into the fat layer of the abdomen, thigh or upper arm, not into muscle or a vein.',
      'Rotate the site each week so the same patch of skin is not used repeatedly. Keep at least 5 cm away from your navel.',
      'Let the pen sit out of the fridge for a few minutes first — cold liquid stings more. Do not warm it artificially.',
      'If you are anxious, sit down, breathe out slowly as you press, and look away. Anxiety fades quickly with repetition; most people are comfortable by the third or fourth dose.',
      'Store pens at 2-8 °C. Do not freeze. Follow the in-use storage instruction on your specific pen for travel.',
    ],
    readMinutes: 3,
    sources: ['Product monographs for GLP-1 receptor agonists', 'WHO injection safety guidance'],
  },
  {
    id: 'sleep-and-stress',
    title: 'Sleep, stress and the weight you did not eat',
    category: 'behaviour',
    summary:
      'Poor sleep and chronic stress raise appetite hormones and cortisol, which pushes weight up independently of what you eat.',
    body: [
      'Sleeping under six hours raises ghrelin (hunger) and lowers leptin (fullness) the next day — you feel hungrier for the same food.',
      'Chronic stress raises cortisol, which encourages fat storage around the abdomen and drives cravings for energy-dense food.',
      'Practical anchors: a fixed wake time, no screens for 30 minutes before bed, caffeine before 2 pm, and 10 minutes of daylight in the morning.',
      'If stress is the main driver, treat the stress. Breathing practice, walking, and talking to someone all measurably reduce stress eating.',
    ],
    readMinutes: 3,
    sources: ['WHO Healthy diet fact sheet', 'WHO Guidelines on physical activity and sedentary behaviour 2020'],
  },
  {
    id: 'maintenance-plan',
    title: 'Building a maintenance plan that holds',
    category: 'long_term',
    summary:
      'Five habits carry most of the weight in maintenance. Write them down before you need them.',
    body: [
      'Weigh once a week, same day, same time, after the toilet and before food. Daily weighing adds noise and anxiety without adding information.',
      'Set a personal action threshold — commonly 3% above your lowest weight. When you cross it, you act, no debate.',
      'Keep protein at 1.2-1.6 g/kg of target weight and keep two resistance sessions a week. These two protect muscle, which protects your metabolic rate.',
      'Book a review before you think you need one. A 15-minute conversation at 3% regain prevents a long rebuild at 15%.',
      'Name your three highest-risk situations (travel, festivals, work stress) and decide now what you will do in each.',
    ],
    readMinutes: 4,
    sources: ['WHO Obesity and overweight fact sheet', 'ICMR-NIN Dietary Guidelines for Indians 2024'],
  },
];

export function getTopic(id: string): EducationTopic | undefined {
  return EDUCATION_TOPICS.find((t) => t.id === id);
}

export function topicsByCategory(category: EducationTopic['category']): EducationTopic[] {
  return EDUCATION_TOPICS.filter((t) => t.category === category);
}

export function searchTopics(query: string): EducationTopic[] {
  const q = query.toLowerCase().trim();
  if (!q) return EDUCATION_TOPICS;
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return EDUCATION_TOPICS.filter((topic) => {
    const haystack = `${topic.title} ${topic.summary} ${topic.body.join(' ')}`.toLowerCase();
    return words.some((w) => haystack.includes(w));
  });
}
