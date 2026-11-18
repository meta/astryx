// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's own looks and pieces, read from what Core documents about
 * its components: the values of a numbered look ("display headings"), and
 * one answer for a clause on that whole family.
 * @position api/theme-edit — a leaf with no imports, read by _how-question.mjs
 */

/**
 * Every value of a numbered look family a part draws ("display headings":
 * display-1 to display-3): the values its prop takes, as its component's
 * doc types them, and any more Core's data saw it drawn in. Sorted.
 * @param {string} family the value without its number, "display"
 * @param {string} propType the prop's documented type
 * @param {string[]} drawn the values Core's data saw
 * @returns {string[]}
 */
export function numberedLookValues(family, propType, drawn) {
  const typed = [...propType.matchAll(/'([\w-]+)'/g)].map(x => x[1]);
  return [...new Set([...typed, ...drawn])]
    .filter(v => v.startsWith(`${family}-`) && /-\d+$/.test(v))
    .sort();
}

/**
 * A clause on a plural family ("heavy display headings", and "make them
 * blue" after it) is one answer: its drafts, one per look, become the
 * first one, which runs every look's steps in order and names each look.
 * Changes `drafts` in place.
 * @template {{text: string, options: object[][], sequence?: boolean}} D
 * @template {{parts: Array<{on: string, when?: string}>}} C
 * @param {D[]} drafts
 * @param {(d: D) => C | undefined} clauseOf
 * @param {C[]} clauses
 * @param {Array<{on: string, whens: string[]}>} families
 */
export function oneAnswerPerFamily(drafts, clauseOf, clauses, families) {
  for (const c of clauses) {
    const fam = families.find(
      f => c.parts.filter(p => p.on === f.on && f.whens.includes(p.when ?? '')).length > 1,
    );
    const mine = fam ? drafts.filter(d => clauseOf(d) === c && d.options.length) : [];
    if (!fam || mine.length < 2) continue;
    const [head, ...rest] = mine;
    head.options = [mine.flatMap(d => d.options[0]), ...head.options.slice(1)];
    head.sequence = true;
    const [attr] = fam.whens[0].split(':');
    head.text = head.text.replace(
      `(${fam.whens[0].replace(':', ' ')})`,
      `(${attr} ${fam.whens.map(w => w.split(':')[1]).join(', ')})`,
    );
    drafts.splice(0, drafts.length, ...drafts.filter(d => !rest.includes(d)));
  }
}
