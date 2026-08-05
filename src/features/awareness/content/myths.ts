import type { MythCard } from '@core/domain/types';

/**
 * Offline myth library. Mirrors the `myth_cards` table in `supabase/seed.sql`
 * so the Myth Coach works with no network and no account.
 */
export const MYTHS: MythCard[] = [
  {
    id: 'glp1-causes-cancer',
    myth: 'GLP-1 medicines cause cancer',
    verdict: 'myth',
    explanation:
      'There is no established evidence that GLP-1 medicines cause cancer in humans. The concern comes from rodent studies where high, lifelong doses raised thyroid C-cell tumours in rats — a cell type that behaves very differently in humans.',
    evidence:
      'Human trial and registry data so far have not shown an increased rate of thyroid cancer. As a precaution, these medicines are not given to people with a personal or family history of medullary thyroid carcinoma or MEN2 syndrome.',
    reassurance:
      'It is a fair question to ask, and your doctor will screen for the specific family history that matters before prescribing.',
    tags: ['safety', 'cancer', 'side_effects'],
  },
  {
    id: 'regain-all-weight',
    myth: 'I will just regain all the weight, so what is the point',
    verdict: 'partly_true',
    explanation:
      'Weight does tend to return if treatment stops and nothing replaces it — but that is true of blood pressure medicine too, and it does not make treating it pointless.',
    evidence:
      'Trial extension data show substantial regain after stopping. The same data show that people who continue treatment, or who move into a structured maintenance plan with protein, resistance training and monitoring, hold their loss far better.',
    reassurance:
      'Every month at a lower weight is a month of lower blood sugar, lower blood pressure and less joint load. That benefit is real while it lasts, and maintenance is a plan you can build.',
    tags: ['maintenance', 'relapse', 'motivation'],
  },
  {
    id: 'injections-are-cheating',
    myth: 'Weight loss injections are cheating',
    verdict: 'myth',
    explanation:
      'Treating a chronic disease with medicine is not cheating. Nobody calls insulin cheating for diabetes or a stent cheating for heart disease.',
    evidence:
      'Obesity involves hormonal regulation of appetite that diet advice alone cannot override in most people. GLP-1 medicines correct part of that signalling — the person still has to eat well, move and sleep.',
    reassurance:
      'You are not taking a shortcut. You are removing a biological headwind so your effort finally counts.',
    tags: ['stigma', 'motivation'],
  },
  {
    id: 'only-need-willpower',
    myth: 'If I just had more willpower I would not need help',
    verdict: 'myth',
    explanation:
      'Appetite is regulated by hormones and brain circuits, not by moral strength. After weight loss the body actively increases hunger and lowers energy expenditure to pull weight back up.',
    evidence:
      'Studies measuring hunger hormones after weight loss show ghrelin stays elevated and satiety hormones stay suppressed for a year or more after dieting.',
    reassurance:
      'You have been fighting a headwind, not failing a test. Treatment reduces the headwind.',
    tags: ['stigma', 'behaviour'],
  },
  {
    id: 'muscle-loss-inevitable',
    myth: 'These medicines make you lose muscle, so they are dangerous',
    verdict: 'partly_true',
    explanation:
      'Any rapid weight loss costs some lean mass — that is true of dieting and surgery too. The size of the loss depends heavily on what you do about it.',
    evidence:
      'Adequate protein (1.2-1.6 g/kg of target weight) plus resistance training two or more times a week substantially reduces lean-mass loss during medical weight management.',
    reassurance:
      'This is manageable, and your nutrition plan in this app is built around exactly that. It is a reason to train and eat protein, not a reason to avoid treatment.',
    tags: ['nutrition', 'activity', 'safety'],
  },
  {
    id: 'natural-is-safer',
    myth: 'Ayurvedic or herbal weight loss products are safer',
    verdict: 'myth',
    explanation:
      '"Natural" does not mean tested. Unregulated weight-loss products have repeatedly been found adulterated with undeclared pharmaceuticals, including banned appetite suppressants and steroids.',
    evidence:
      'Indian regulators have issued repeated warnings about adulterated slimming products. Prescription medicines, by contrast, have published trial data, known dose ranges and a reporting system for adverse events.',
    reassurance:
      'If a product promises fast loss without a prescription, that is the warning sign — not the reassurance.',
    tags: ['safety', 'stigma'],
  },
  {
    id: 'diabetics-only',
    myth: 'These medicines are only for people with diabetes',
    verdict: 'myth',
    explanation:
      'GLP-1 medicines were first approved for type 2 diabetes, but several are now specifically approved for weight management in people without diabetes.',
    evidence:
      'Approval for chronic weight management typically applies at BMI thresholds with or without weight-related comorbidities; Indian practice uses lower BMI cut-offs than Western labels.',
    reassurance:
      'Whether they are right for you depends on your BMI, waist, comorbidities and history — which is exactly what the eligibility check and a doctor visit sort out.',
    tags: ['eligibility', 'medical'],
  },
  {
    id: 'stop-when-target-reached',
    myth: 'I can stop the moment I hit my target weight',
    verdict: 'partly_true',
    explanation:
      'You can stop, but stopping abruptly without a maintenance plan is the most common route back to the starting weight.',
    evidence:
      'Post-treatment follow-up data show the steepest regain in the first six months after stopping, concentrated in people with no structured maintenance.',
    reassurance:
      "Plan the exit with your doctor before you reach the target. This app's vigilance stage exists precisely for that phase.",
    tags: ['maintenance', 'relapse'],
  },
  {
    id: 'skipping-meals-helps',
    myth: 'Skipping meals will speed things up',
    verdict: 'myth',
    explanation:
      'Skipping meals usually backfires: protein intake drops, muscle is lost faster, and hunger rebounds later in the day.',
    evidence:
      'Adequate protein spread across the day preserves lean mass during weight loss better than the same protein concentrated in one meal.',
    reassurance:
      'On appetite-lowering medicines the risk is eating too little protein, not too much food. Aim for protein at every meal, even small ones.',
    tags: ['nutrition', 'behaviour'],
  },
  {
    id: 'surgery-is-failure',
    myth: 'Needing surgery means you failed at everything else',
    verdict: 'myth',
    explanation:
      'Bariatric surgery is a treatment option with its own indications, not a punishment for failing at other options.',
    evidence:
      'For people with severe obesity, particularly with type 2 diabetes, surgery produces the largest and most durable improvements in metabolic health of any current treatment.',
    reassurance:
      'Choosing a treatment because it fits your situation is good medicine. Your doctor will explain where each option sits for you.',
    tags: ['stigma', 'medical'],
  },
];

export function searchMyths(query: string): MythCard[] {
  const q = query.toLowerCase().trim();
  if (!q) return MYTHS;
  const words = q.split(/\s+/).filter((w) => w.length > 3);
  return MYTHS.map((card) => {
    const haystack = `${card.myth} ${card.explanation} ${card.tags.join(' ')}`.toLowerCase();
    const score = words.reduce((acc, w) => acc + (haystack.includes(w) ? 1 : 0), 0);
    return { card, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.card);
}
