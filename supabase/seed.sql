-- =====================================================================
-- Seed data.
--
-- Hospitals, doctors, availability, pharmacies and peer groups are
-- illustrative but structurally complete — replace with the real
-- network before going live. Education topics and myth cards mirror
-- `src/features/awareness/content/*` so the offline library and the
-- backend stay in sync.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Hospitals
-- ---------------------------------------------------------------------

insert into hospitals (id, name, city, address, phone, latitude, longitude, has_obesity_clinic, has_pharmacy) values
  ('11111111-1111-4111-8111-000000000001', 'Sterling Metabolic Institute', 'Ahmedabad', 'Nr. Judges Bungalow Road, Bodakdev, Ahmedabad 380054', '+918879511005', 23.0396, 72.5100, true, true),
  ('11111111-1111-4111-8111-000000000002', 'Civil Endocrine & Obesity Centre', 'Ahmedabad', 'Asarwa, Ahmedabad 380016', '+918879511005', 23.0530, 72.6050, true, true),
  ('11111111-1111-4111-8111-000000000003', 'Sahyadri Weight Care Clinic', 'Pune', 'Karve Road, Deccan Gymkhana, Pune 411004', '+918879511005', 18.5100, 73.8400, true, false),
  ('11111111-1111-4111-8111-000000000004', 'Mumbai Diabetes & Obesity Hospital', 'Mumbai', 'Dr. Annie Besant Road, Worli, Mumbai 400018', '+917986791522', 19.0020, 72.8180, true, true),
  ('11111111-1111-4111-8111-000000000005', 'Delhi Metabolic Health Centre', 'Delhi', 'Sector 8, Rohini, New Delhi 110085', '+918879511005', 28.7000, 77.1100, true, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Doctors
-- ---------------------------------------------------------------------

insert into doctors (id, full_name, speciality, qualifications, registration_number, hospital_id, city, languages, consultation_fee, teleconsult_available, rating, years_experience, phone, bio) values
  ('22222222-2222-4222-8222-000000000001', 'Dr. Anjali Mehta', 'Endocrinology', 'MBBS, MD (Medicine), DM (Endocrinology)', 'GMC-45231', '11111111-1111-4111-8111-000000000001', 'Ahmedabad', '{en,hi,gu}', 800, true, 4.8, 14, '+918879511005', 'Runs a dedicated GLP-1 titration clinic and has managed over 2,000 patients through medical weight management.'),
  ('22222222-2222-4222-8222-000000000002', 'Dr. Rakesh Patel', 'Bariatric & Metabolic Medicine', 'MBBS, MS (General Surgery), FIAGES', 'GMC-38872', '11111111-1111-4111-8111-000000000002', 'Ahmedabad', '{en,gu,hi}', 600, true, 4.6, 18, '+917986791522', 'Focuses on non-surgical metabolic care first, with surgery reserved for clearly indicated cases.'),
  ('22222222-2222-4222-8222-000000000003', 'Dr. Sneha Kulkarni', 'Endocrinology', 'MBBS, MD (Medicine), DNB (Endocrinology)', 'MMC-71204', '11111111-1111-4111-8111-000000000003', 'Pune', '{en,mr,hi}', 900, true, 4.9, 11, '+918879511005', 'Special interest in PCOS, insulin resistance and behaviour-first obesity care.'),
  ('22222222-2222-4222-8222-000000000004', 'Dr. Imran Shaikh', 'Diabetology', 'MBBS, MD (Medicine), Fellowship in Diabetology', 'MMC-66019', '11111111-1111-4111-8111-000000000004', 'Mumbai', '{en,hi,mr}', 1200, true, 4.7, 20, '+917986791522', 'Manages type 2 diabetes with obesity, with emphasis on cardiovascular risk reduction.'),
  ('22222222-2222-4222-8222-000000000005', 'Dr. Kavita Rao', 'Nutrition & Metabolic Medicine', 'MBBS, MD (Community Medicine), PG Dip Clinical Nutrition', 'DMC-92310', '11111111-1111-4111-8111-000000000005', 'Delhi', '{en,hi}', 700, true, 4.5, 9, '+918879511005', 'Builds Indian-diet-first nutrition plans alongside medical therapy.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Availability — Mon-Sat morning and evening clinics
-- ---------------------------------------------------------------------

insert into doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, mode)
select d.id, wd, '10:00'::time, '13:00'::time, 20, 'in_person'::appointment_mode
from doctors d cross join generate_series(1, 6) wd
on conflict do nothing;

insert into doctor_availability (doctor_id, weekday, start_time, end_time, slot_minutes, mode)
select d.id, wd, '17:00'::time, '19:00'::time, 15, 'video'::appointment_mode
from doctors d cross join generate_series(1, 5) wd
where d.teleconsult_available
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Pharmacies
-- ---------------------------------------------------------------------

insert into pharmacies (id, name, city, address, phone, supports_delivery, supports_cold_chain, hospital_id) values
  ('33333333-3333-4333-8333-000000000001', 'Sterling Hospital Pharmacy', 'Ahmedabad', 'Ground Floor, Sterling Metabolic Institute, Bodakdev', '+917940001010', true, true, '11111111-1111-4111-8111-000000000001'),
  ('33333333-3333-4333-8333-000000000002', 'Apex Chemists', 'Ahmedabad', 'Vastrapur Lake Road, Ahmedabad 380015', '+917940001011', true, true, null),
  ('33333333-3333-4333-8333-000000000003', 'Sahyadri Care Pharmacy', 'Pune', 'Karve Road, Pune 411004', '+912040002010', true, true, '11111111-1111-4111-8111-000000000003'),
  ('33333333-3333-4333-8333-000000000004', 'Worli MedPoint', 'Mumbai', 'Worli Naka, Mumbai 400018', '+912240003010', true, true, '11111111-1111-4111-8111-000000000004'),
  ('33333333-3333-4333-8333-000000000005', 'Rohini Health Mart', 'Delhi', 'Sector 8, Rohini, New Delhi 110085', '+911140004010', true, false, '11111111-1111-4111-8111-000000000005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Peer groups
-- ---------------------------------------------------------------------

insert into peer_groups (id, name, description, stage, language, member_count, is_moderated) values
  ('44444444-4444-4444-8444-000000000001', 'Starting GLP-1', 'For anyone in the first 12 weeks — titration, nausea, and finding a rhythm.', 'treatment', 'en', 412, true),
  ('44444444-4444-4444-8444-000000000002', 'Protein & Indian Kitchens', 'Practical high-protein swaps for everyday Indian meals.', 'all', 'en', 890, true),
  ('44444444-4444-4444-8444-000000000003', 'इलाज के बाद', 'दवा बंद होने के बाद वज़न बनाए रखने वालों का समूह।', 'vigilance', 'hi', 233, true),
  ('44444444-4444-4444-8444-000000000004', 'Movement, gently', 'Low-impact activity for joints that hurt. Start where you are.', 'all', 'en', 351, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Education topics (WHO / ICMR aligned)
-- ---------------------------------------------------------------------

insert into education_topics (id, title, category, summary, body, read_minutes, sources) values
(
  'obesity-is-a-disease', 'Obesity is a medical condition, not a willpower problem', 'basics',
  'Obesity is a chronic, relapsing disease driven by biology, environment and genetics — the body defends its highest weight.',
  array[
    'The World Health Organization classifies obesity as a chronic disease. It is not a character flaw and it is not caused by laziness.',
    'When you lose weight, the body responds by lowering the energy it burns at rest and raising hunger hormones such as ghrelin, while lowering fullness hormones such as GLP-1 and leptin. This is why weight regain is so common after dieting — the biology actively pushes back.',
    'Because it is chronic, obesity needs long-term management the same way blood pressure or diabetes does. Stopping treatment usually means the condition returns; that is a property of the disease, not a failure of the person.',
    'In India, body fat rises at a lower BMI than in Western populations. ICMR guidance therefore treats BMI 23 and above as overweight and 25 and above as obesity, with waist circumference above 90 cm (men) or 80 cm (women) as an independent risk marker.'
  ],
  4,
  array['WHO Obesity and overweight fact sheet', 'ICMR-NIN Dietary Guidelines for Indians 2024']
),
(
  'how-glp1-works', 'How GLP-1 medicines actually work', 'medical',
  'GLP-1 medicines copy a natural gut hormone that tells the brain you are full and slows how quickly the stomach empties.',
  array[
    'GLP-1 (glucagon-like peptide-1) is a hormone your gut already releases after eating. It signals fullness to the brain, slows stomach emptying and improves the pancreas'' insulin response.',
    'GLP-1 receptor agonist medicines are a longer-lasting version of that same signal. They do not burn fat directly and they are not stimulants. They reduce appetite and food noise so that eating less does not feel like a constant fight.',
    'Doses are started low and increased in steps (titration) over weeks. This is deliberate — it gives the stomach time to adjust and keeps nausea manageable.',
    'These medicines are prescription-only. A doctor must confirm they are appropriate, rule out contraindications, and monitor you while you are on them.'
  ],
  4,
  array['WHO Model List of Essential Medicines', 'Indian consensus statements on obesity pharmacotherapy']
),
(
  'nutrition-basics', 'Eating well on an Indian plate', 'nutrition',
  'Protein at every meal, half the plate vegetables, and fewer refined carbohydrates — without giving up the food you grew up with.',
  array[
    'Aim for 1.2 to 1.6 g of protein per kg of your target body weight each day. On appetite-suppressing medicines this matters even more, because muscle is lost alongside fat when protein is too low.',
    'Indian high-protein options: dal and rajma, chana, paneer, curd and Greek-style dahi, eggs, fish, chicken, soya chunks, sprouts, and milk. A katori of dal has roughly 6-7 g of protein — most people need several servings across the day.',
    'Fill half your plate with vegetables and salad, one quarter with protein, and one quarter with grain. Swap refined flour (maida) for whole grains such as jowar, bajra, and unpolished rice where you can.',
    'Drink 2.5 to 3 litres of water daily. On GLP-1 medicines dehydration worsens nausea, constipation and fatigue.',
    'Eat slowly and stop at comfortably full. With slowed stomach emptying, eating past fullness is the single most common cause of vomiting.'
  ],
  5,
  array['ICMR-NIN Dietary Guidelines for Indians 2024', 'WHO Healthy diet fact sheet']
),
(
  'activity-basics', 'Moving in a way your body can sustain', 'activity',
  '150 minutes a week of moderate activity plus two strength sessions protects muscle while you lose fat.',
  array[
    'WHO recommends 150-300 minutes of moderate aerobic activity per week for adults, plus muscle-strengthening on two or more days.',
    'If your knees hurt, start with what does not: walking on flat ground, cycling, swimming, or chair-based exercises. Pain is a signal to change the activity, not to stop moving.',
    'Resistance training is not optional during medical weight loss. Losing weight without strength work costs you muscle, which lowers your resting metabolism and makes maintenance harder.',
    'Build the habit before the intensity. Ten minutes daily that you actually do beats an hour you skip.'
  ],
  3,
  array['WHO Guidelines on physical activity and sedentary behaviour 2020']
),
(
  'behavioural-health', 'The mind side of weight', 'behaviour',
  'Stress, sleep, low mood and stigma all change eating behaviour — treating them is part of treating obesity.',
  array[
    'Short sleep raises hunger hormones and cravings the next day. Seven to nine hours is a weight-management intervention, not a luxury.',
    'Emotional eating is a coping strategy, not a moral failure. Naming the trigger — stress, boredom, loneliness, exhaustion — is the first step in choosing a different response.',
    'Weight stigma, including from healthcare, makes outcomes worse: people avoid care, and stress hormones rise. You are entitled to be treated with respect at every appointment.',
    'If you binge, purge, or feel out of control around food, tell your doctor. Eating disorders need specific treatment and change how weight medicines should be used.'
  ],
  4,
  array['WHO European Regional Obesity Report 2022', 'Indian Psychiatric Society guidance on eating disorders']
),
(
  'side-effects', 'Side effects: what is expected and what is not', 'safety',
  'Most side effects are gastrointestinal, early, and settle. A few are red flags that need urgent care.',
  array[
    'Common and usually temporary: nausea, fullness, burping, constipation or loose stools, mild fatigue and headache. These are strongest in the first days after a dose increase and typically ease within a few weeks.',
    'What helps: smaller portions, eating slowly, less fat and less fried food on dose-change days, more water, and fibre or a doctor-approved laxative for constipation.',
    'Seek urgent medical care for severe, persistent abdominal pain radiating to the back (possible pancreatitis), repeated vomiting with inability to keep fluids down, signs of dehydration, severe right-upper-abdomen pain (gallbladder), or symptoms of low blood sugar if you also take insulin or sulfonylureas.',
    'Never increase your own dose to speed up results. Titration schedules exist because faster escalation causes most severe side effects.'
  ],
  4,
  array['WHO pharmacovigilance guidance', 'Product monographs for GLP-1 receptor agonists']
),
(
  'long-term', 'Life after the medicine', 'long_term',
  'Obesity is chronic — maintenance is an active phase with its own plan, not the absence of treatment.',
  array[
    'Studies consistently show that most people regain a substantial share of lost weight within a year of stopping GLP-1 therapy if nothing replaces it. This is the disease reasserting itself, not relapse of character.',
    'What protects maintenance: keeping protein high, keeping resistance training, weighing weekly (not daily), monthly check-ins, and having a written plan for what you do if weight rises by 3-5%.',
    'Some people stay on a lower maintenance dose long-term. That decision belongs to you and your doctor, and it is a legitimate medical choice, not a failure to "do it yourself".',
    'Catch drift early. A 2 kg rise is a nudge; a 10 kg rise is a rebuild. Early action is the whole game.'
  ],
  4,
  array['WHO Obesity and overweight fact sheet', 'STEP and SURMOUNT trial extension data']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Myth cards
-- ---------------------------------------------------------------------

insert into myth_cards (id, myth, verdict, explanation, evidence, reassurance, tags) values
(
  'glp1-causes-cancer', 'GLP-1 medicines cause cancer', 'myth',
  'There is no established evidence that GLP-1 medicines cause cancer in humans. The concern comes from rodent studies where high, lifelong doses raised thyroid C-cell tumours in rats — a cell type that behaves very differently in humans.',
  'Human trial and registry data so far have not shown an increased rate of thyroid cancer. As a precaution, these medicines are not given to people with a personal or family history of medullary thyroid carcinoma or MEN2 syndrome.',
  'It is a fair question to ask, and your doctor will screen for the specific family history that matters before prescribing.',
  array['safety','cancer','side_effects']
),
(
  'regain-all-weight', 'I will just regain all the weight, so what is the point', 'partly_true',
  'Weight does tend to return if treatment stops and nothing replaces it — but that is true of blood pressure medicine too, and it does not make treating it pointless.',
  'Trial extension data show substantial regain after stopping. The same data show that people who continue treatment, or who move into a structured maintenance plan with protein, resistance training and monitoring, hold their loss far better.',
  'Every month at a lower weight is a month of lower blood sugar, lower blood pressure and less joint load. That benefit is real while it lasts, and maintenance is a plan you can build.',
  array['maintenance','relapse','motivation']
),
(
  'injections-are-cheating', 'Weight loss injections are cheating', 'myth',
  'Treating a chronic disease with medicine is not cheating. Nobody calls insulin cheating for diabetes or a stent cheating for heart disease.',
  'Obesity involves hormonal regulation of appetite that diet advice alone cannot override in most people. GLP-1 medicines correct part of that signalling — the person still has to eat well, move and sleep.',
  'You are not taking a shortcut. You are removing a biological headwind so your effort finally counts.',
  array['stigma','motivation']
),
(
  'only-need-willpower', 'If I just had more willpower I would not need help', 'myth',
  'Appetite is regulated by hormones and brain circuits, not by moral strength. After weight loss the body actively increases hunger and lowers energy expenditure to pull weight back up.',
  'Studies measuring hunger hormones after weight loss show ghrelin stays elevated and satiety hormones stay suppressed for a year or more after dieting.',
  'You have been fighting a headwind, not failing a test. Treatment reduces the headwind.',
  array['stigma','behaviour']
),
(
  'muscle-loss-inevitable', 'These medicines make you lose muscle, so they are dangerous', 'partly_true',
  'Any rapid weight loss costs some lean mass — that is true of dieting and surgery too. The size of the loss depends heavily on what you do about it.',
  'Adequate protein (1.2-1.6 g/kg of target weight) plus resistance training two or more times a week substantially reduces lean-mass loss during medical weight management.',
  'This is manageable, and your nutrition plan in this app is built around exactly that. It is a reason to train and eat protein, not a reason to avoid treatment.',
  array['nutrition','activity','safety']
),
(
  'natural-is-safer', 'Ayurvedic or herbal weight loss products are safer', 'myth',
  '"Natural" does not mean tested. Unregulated weight-loss products have repeatedly been found adulterated with undeclared pharmaceuticals, including banned appetite suppressants and steroids.',
  'Indian regulators have issued repeated warnings about adulterated slimming products. Prescription medicines, by contrast, have published trial data, known dose ranges and a reporting system for adverse events.',
  'If a product promises fast loss without a prescription, that is the warning sign — not the reassurance.',
  array['safety','stigma']
),
(
  'diabetics-only', 'These medicines are only for people with diabetes', 'myth',
  'GLP-1 medicines were first approved for type 2 diabetes, but several are now specifically approved for weight management in people without diabetes.',
  'Approval for chronic weight management typically applies at BMI thresholds with or without weight-related comorbidities; Indian practice uses lower BMI cut-offs than Western labels.',
  'Whether they are right for you depends on your BMI, waist, comorbidities and history — which is exactly what the eligibility check and a doctor visit sort out.',
  array['eligibility','medical']
),
(
  'stop-when-target-reached', 'I can stop the moment I hit my target weight', 'partly_true',
  'You can stop, but stopping abruptly without a maintenance plan is the most common route back to the starting weight.',
  'Post-treatment follow-up data show the steepest regain in the first six months after stopping, concentrated in people with no structured maintenance.',
  'Plan the exit with your doctor before you reach the target. This app''s vigilance stage exists precisely for that phase.',
  array['maintenance','relapse']
)
on conflict (id) do nothing;
