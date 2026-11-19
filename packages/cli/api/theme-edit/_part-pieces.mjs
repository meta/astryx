// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A part's own looks and pieces, read from what Core documents about
 * its components: the values of a numbered look ("display headings"), and
 * one answer for a clause on that whole family.
 * @position api/theme-edit — read by _how-question.mjs; reads lengths with
 *   _settings.mjs's lengthPx
 */

import {lengthPx} from './_settings.mjs';

/**
 * Every value of a numbered look family a part draws ("display headings":
 * display-1 to display-3): the values its prop takes, as its component's
 * doc types them, and any more Core's data saw it drawn in. Sorted.
 * @param {string} family the value without its number, "display"
 * @param {string[]} typed the values the prop's documented type lists
 * @param {string[]} drawn the values Core's data saw
 * @returns {string[]}
 */
export function numberedLookValues(family, typed, drawn) {
  return [...new Set([...typed, ...drawn])]
    .filter(v => v.startsWith(`${family}-`) && /-\d+$/.test(v))
    .sort((a, b) => Number(/\d+$/.exec(a)?.[0]) - Number(/\d+$/.exec(b)?.[0]));
}

/**
 * A clause on a plural family ("heavy display headings", and "make them
 * blue" after it) is one answer: its drafts, one per look, become the
 * first one, a sequence of each look's first option, in order, with
 * repeated steps said once; the looks' other options (a whole-theme dial
 * offered beside a look's own line) stay out of it, so it changes only the
 * family. The text names each look. A size said for
 * the family is the largest look's: the others scale by the steps between
 * their sizes now (`sizeOf`), so the type scale keeps its shape.
 * Changes `drafts` in place.
 * @template {{text: string, options: object[][], sequence?: boolean}} D
 * @template {{parts: Array<{on: string, when?: string}>}} C
 * @param {D[]} drafts
 * @param {(d: D) => C | undefined} clauseOf
 * @param {C[]} clauses
 * @param {Array<{on: string, whens: string[]}>} families
 * @param {(when: string, on: string) => number | null} sizeOf a look's size
 *   now on the family's part, in px
 */
export function oneAnswerPerFamily(drafts, clauseOf, clauses, families, sizeOf) {
  for (const c of clauses) {
    const fam = families.find(
      f => c.parts.filter(p => p.on === f.on && f.whens.includes(p.when ?? '')).length > 1,
    );
    if (!fam) continue;
    // (Each draft's look, from its own lines; a look with no draft that
    // writes anything, "bigger" from a clamp() size, is left out and said.)
    const lookOf = (/** @type {D} */ d) =>
      /** @type {any[]} */ (d.options[0] ?? []).find(st => fam.whens.includes(st?.when))?.when;
    const kept = fam.whens.filter(w =>
      drafts.some(d => clauseOf(d) === c && d.options.length && lookOf(d) === w),
    );
    const mine = kept.map(
      w => /** @type {D} */ (drafts.find(d => clauseOf(d) === c && d.options.length && lookOf(d) === w)),
    );
    if (mine.length < 2) continue;
    const [head, ...rest] = mine;
    const scaled = scaleFamilySizes(mine, kept, w => sizeOf(w, fam.on));
    const seen = new Set();
    head.options = [
      mine
        .flatMap(d => d.options[0] ?? [])
        .filter(st => !seen.has(JSON.stringify(st)) && seen.add(JSON.stringify(st))),
    ];
    head.sequence = true;
    const [attr] = kept[0].split(':');
    const level = (/** @type {string} */ w) => w.split(':')[1];
    head.text = head.text.replace(
      `(${kept[0].replace(':', ' ')})`,
      `(${attr} ${kept.map(level).join(', ')})`,
    );
    if (scaled) head.text += `; ${scaled}`;
    const left = fam.whens.filter(w => !kept.includes(w));
    if (left.length) {
      const noLength = left.every(w => !sizeOf(w, fam.on));
      head.text += `; ${left.map(level).join(', ')} not changed${noLength ? `: ${left.length > 1 ? 'their sizes are' : 'its size is'} no length now (a clamp() or calc() size), so no step can be taken from ${left.length > 1 ? 'them' : 'it'}` : ''}`;
    }
    drafts.splice(0, drafts.length, ...drafts.filter(d => !rest.includes(d)));
  }
}

/** A step's size in px, or null. @param {unknown} v */
const pxOf = v => lengthPx(String(v));

/**
 * A size in px written in the unit of `like` (px, rem or em).
 * @param {number} px
 * @param {unknown} like
 */
const inUnitOf = (px, like) => {
  const unit = /(rem|em)\s*$/i.exec(String(like))?.[1]?.toLowerCase();
  return unit ? `${Number((px / 16).toFixed(3))}${unit}` : `${Math.round(px)}px`;
};

/**
 * Scale the size steps of a family's drafts, one draft per look in the
 * order of `whens`: the size said is the largest look's, and every other
 * look's size is that size times the ratio of its size now to the largest
 * look's size now, in the unit said. Says what it wrote, or that the steps
 * cannot be kept when a look's size now is unknown; null when no size is
 * said.
 * @param {Array<{options: object[][]}>} drafts
 * @param {string[]} whens
 * @param {(when: string) => number | null} sizeOf
 * @returns {string | null}
 */
function scaleFamilySizes(drafts, whens, sizeOf) {
  const isSize = (/** @type {any} */ st) =>
    (st.thing === 'font-size' || /^--text-[\w-]+-size$/.test(st.thing)) && pxOf(st.value) != null;
  const now = whens.map(w => sizeOf(w));
  if (!drafts.some(d => d.options.flat().some(isSize))) return null;
  const level = (/** @type {string} */ w) => w.split(':')[1];
  // (A look whose size now is no length, a clamp() or calc(), leaves the
  // steps unknown: each look takes the size said, and the answer says so.)
  const unknown = whens.filter((_, i) => !now[i]);
  if (unknown.length)
    return `each look takes the size said: the steps between them cannot be kept, since ${unknown
      .map(level)
      .join(', ')}'s size now is no length (a clamp() or calc() size)`;
  const top = now.indexOf(Math.max(.../** @type {number[]} */ (now)));
  const said = drafts[top]?.options.flat().find(isSize);
  if (!said) return null;
  const value = /** @type {any} */ (said).value;
  const px = /** @type {number} */ (pxOf(value));
  const sizes = now.map(n => (px * /** @type {number} */ (n)) / /** @type {number} */ (now[top]));
  const written = sizes.map(v => inUnitOf(v, value));
  drafts.forEach((d, i) => {
    for (const o of d.options) for (const st of o) if (isSize(st)) /** @type {any} */ (st).value = written[i];
  });
  return `${level(whens[top])} ${written[top]}, the others scaled to keep the steps between them (${whens
    .map((w, i) => (i === top ? '' : `${level(w)} ${written[i]}`))
    .filter(Boolean)
    .join(', ')})`;
}
