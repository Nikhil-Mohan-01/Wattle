// Turns the Deep Cut bank (datasets + templates + hand-written prompts) into
// a large pool of prompts with complete answer lists.
//
// Template kinds (see docs/content.md):
// - attr, no value:  one prompt per distinct value ("Name a country in {value}")
// - attr + value:    one prompt for that value ("Name a landlocked country")
// - letter: true:    one prompt per first letter ("…starting with {letter}")
// - neither:         one prompt with the whole dataset
// A generated prompt is kept only if it has enough answers spread over
// enough tiers to make rarity interesting.
import { answerKey } from "./match";
import type { DeepCutPrompt } from "./server";

type AttrValue = string | string[];
export type BankItem = { name: string; aliases?: string[]; tier: number; attrs?: Record<string, AttrValue> };
export type BankTemplate = {
  id: string;
  dataset: string;
  prompt: string;
  attr?: string;
  value?: string;
  letter?: boolean;
};
export type DeepCutBank = {
  datasets: Record<string, BankItem[]>;
  templates: BankTemplate[];
  prompts?: unknown[];
};

export const MIN_ANSWERS = 6;
export const MIN_TIERS = 3;

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const has = (v: AttrValue | undefined, want: string) => (Array.isArray(v) ? v.includes(want) : v === want);
const values = (v: AttrValue | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function toPrompt(id: string, prompt: string, items: BankItem[]) {
  return {
    id,
    prompt,
    answers: items.map((it) => ({ text: it.name, tier: it.tier, ...(it.aliases?.length ? { aliases: it.aliases } : {}) })),
  };
}

/** All raw prompts a template produces, before validation and filtering. */
function expandTemplate(t: BankTemplate, items: BankItem[]) {
  if (t.letter) {
    const byLetter = new Map<string, BankItem[]>();
    for (const it of items) {
      const first = answerKey(it.name).charAt(0).toUpperCase();
      if (/^[A-Z]$/.test(first)) byLetter.set(first, [...(byLetter.get(first) ?? []), it]);
    }
    return [...byLetter].map(([letter, list]) =>
      toPrompt(`${t.id}-${letter.toLowerCase()}`, t.prompt.replace("{letter}", letter), list),
    );
  }
  if (t.attr && t.value !== undefined) {
    return [toPrompt(t.id, t.prompt.replace("{value}", t.value), items.filter((it) => has(it.attrs?.[t.attr!], t.value!)))];
  }
  if (t.attr) {
    const distinct = [...new Set(items.flatMap((it) => values(it.attrs?.[t.attr!])))];
    return distinct.map((v) =>
      toPrompt(`${t.id}-${slug(v)}`, t.prompt.replace("{value}", v), items.filter((it) => has(it.attrs?.[t.attr!], v))),
    );
  }
  return [toPrompt(t.id, t.prompt, items)];
}

/**
 * Expands the bank into validated prompts. Prompts that are too small, too
 * flat (too few tiers) or invalid are skipped; `validate` is the same check
 * hand-written prompts get.
 */
export function expandBank(
  raw: unknown,
  validate: (prompt: unknown) => DeepCutPrompt,
): { prompts: DeepCutPrompt[]; skipped: string[] } {
  const bank = raw as DeepCutBank;
  if (!bank || typeof bank !== "object" || typeof bank.datasets !== "object" || !Array.isArray(bank.templates)) {
    throw new Error('[deepcut-bank] expected { "datasets": {...}, "templates": [...] }');
  }
  const candidates: unknown[] = [];
  for (const t of bank.templates) {
    const items = bank.datasets[t.dataset];
    if (!Array.isArray(items)) throw new Error(`[deepcut-bank] template ${t.id}: unknown dataset ${t.dataset}`);
    candidates.push(...expandTemplate(t, items));
  }
  candidates.push(...(bank.prompts ?? []));

  const prompts: DeepCutPrompt[] = [];
  const skipped: string[] = [];
  const ids = new Set<string>();
  for (const c of candidates) {
    const id = String((c as { id?: unknown }).id ?? "?");
    try {
      const p = validate(c);
      if (ids.has(p.id)) throw new Error("duplicate id");
      if (p.answers.length < MIN_ANSWERS) throw new Error(`only ${p.answers.length} answers`);
      if (new Set(p.answers.map((a) => a.tier)).size < MIN_TIERS) throw new Error("too few tiers");
      ids.add(p.id);
      prompts.push(p);
    } catch (err) {
      skipped.push(`${id}: ${(err as Error).message}`);
    }
  }
  return { prompts, skipped };
}

// ---------------------------------------------------------------------------
// Learning rarity from real answers

/** Minimum correct answers to a prompt before real answers replace the bank's tiers. */
export const LEARN_MIN_ANSWERS = 30;

/** Tier for an answer given by `share` (0–1) of players who answered the prompt. */
export function tierForShare(share: number): 1 | 2 | 3 | 4 | 5 {
  if (share >= 0.2) return 1;
  if (share >= 0.08) return 2;
  if (share >= 0.03) return 3;
  if (share >= 0.01) return 4;
  return 5;
}

/**
 * Re-tiers a prompt's answers from how often players actually gave them.
 * Answers nobody has given become the rarest tier. Below LEARN_MIN_ANSWERS
 * total, the bank's tiers are kept.
 */
export function applyLearnedTiers(prompt: DeepCutPrompt, counts: Map<string, number>): DeepCutPrompt {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < LEARN_MIN_ANSWERS) return prompt;
  return {
    ...prompt,
    answers: prompt.answers.map((a) => ({ ...a, tier: tierForShare((counts.get(a.text) ?? 0) / total) })),
  };
}
