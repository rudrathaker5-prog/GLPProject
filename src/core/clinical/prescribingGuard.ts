/**
 * Post-generation guard: catches a model that gives dose advice anyway.
 *
 * The agent is instructed in eight different ways never to prescribe. This is
 * the backstop for when it does it regardless.
 *
 * WHY THE PATTERNS LOOK LIKE THIS
 *
 * The first version matched `\w+\s?\d*\s?(mg|mcg|units)`. `\d*` matches digits
 * only, so it could not cross a decimal point — and **every** real GLP-1 dose
 * is decimal: semaglutide titrates 0.25 → 0.5 → 1.0 → 1.7 → 2.4 mg. The one
 * output guard in a GLP-1 app was inert for the entire drug class it exists to
 * cover. "You should take semaglutide 0.5 mg from Monday" sailed through.
 *
 * So: doses are matched as `\d+(?:\.\d+)?`, a directive verb may sit up to a
 * short distance from the number rather than immediately beside it, and dose
 * *changes* are caught even with no number at all ("step up your dose").
 *
 * Over-matching is deliberate. A false positive appends one cautious sentence
 * to a reply; a false negative hands a patient a dose instruction from a
 * language model. Those costs are not comparable, so this leans hard toward
 * catching things.
 *
 * MIRRORED in supabase/functions/_shared/safety.ts — the two copies are held
 * byte-identical by a test (prescribingGuard.test.ts). Edit both, or neither.
 */

/** A number followed by a dose unit: 2 mg, 0.25mg, 1.7 mg, 20 units. */
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
