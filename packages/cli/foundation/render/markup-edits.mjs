// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What changed in a rendered file's markup after the render, for
 * `astryx experimental render --reverse`. A render records the text of its
 * markup, in order; a reverse reads the text the file holds now and names
 * each run of text that differs, with where the old text sits in the restored
 * source when it appears there once. The restored source never takes these
 * changes: it is the page as rendered.
 *
 * @position foundation/render — used by render-page.mjs and the render subject
 */

import {decode, isEl, parseHtml} from './html-reader.mjs';

/** The most changes a reverse lists. */
export const MAX_EDITS = 50;

/** The longest piece of text a change shows. */
const MAX_TEXT = 300;

/** The largest table the text comparison builds before it gives up on detail. */
const MAX_CELLS = 4_000_000;

/**
 * The text of rendered markup, as the runs a reader sees: each text node with
 * its white space collapsed, empty ones left out, scripts and styles skipped.
 * @param {string} markup
 * @returns {string[]}
 */
export function textRuns(markup) {
  /** @type {string[]} */
  const runs = [];
  /** @param {import('./html-reader.mjs').Node} node @param {boolean} raw */
  const walk = (node, raw) => {
    if (!isEl(node)) {
      const text = (raw ? decode(node.text) : node.text).replace(/\s+/g, ' ').trim();
      if (text) runs.push(text);
      return;
    }
    if (node.tag === 'script' || node.tag === 'style') return;
    for (const child of node.children) walk(child, node.tag === 'textarea' || node.tag === 'title');
  };
  walk(parseHtml(markup), false);
  return runs;
}

/**
 * A piece of text as a change shows it: cut to MAX_TEXT characters.
 * @param {string} text
 */
export const clip = text => (text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text);

/**
 * @typedef {object} TextEdit
 * @property {string | null} was - The text as rendered; null for text added after the render.
 * @property {string | null} now - The text the file holds now; null for text removed.
 */

/**
 * The runs of text that differ between the markup as rendered and the markup
 * now, paired where one replaced another, whole (a caller that shows them
 * cuts them with {@link clip}).
 * @param {string[]} before
 * @param {string[]} after
 * @returns {{edits: TextEdit[], more: number}} at most MAX_EDITS changes, and how many more there are
 */
export function textEdits(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  /** @type {{removed: string[], added: string[]}[]} */
  const hunks = [];
  if (a.length * b.length > MAX_CELLS) {
    hunks.push({removed: a, added: b});
  } else {
    // Longest common subsequence over the changed middle; the common runs
    // split it into hunks of removed and added text.
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * width + j] =
          a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    /** @type {{removed: string[], added: string[]}} */
    let hunk = {removed: [], added: []};
    const close = () => {
      if (hunk.removed.length > 0 || hunk.added.length > 0) hunks.push(hunk);
      hunk = {removed: [], added: []};
    };
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      if (i < a.length && j < b.length && a[i] === b[j]) {
        close();
        i++;
        j++;
      } else if (j < b.length && (i === a.length || table[i * width + j + 1] >= table[(i + 1) * width + j])) {
        hunk.added.push(b[j++]);
      } else {
        hunk.removed.push(a[i++]);
      }
    }
    close();
  }
  /** @type {TextEdit[]} */
  const all = [];
  for (const {removed, added} of hunks) {
    const pairs = Math.max(removed.length, added.length);
    for (let k = 0; k < pairs; k++) {
      all.push({
        was: k < removed.length ? removed[k] : null,
        now: k < added.length ? added[k] : null,
      });
    }
  }
  return {edits: all.slice(0, MAX_EDITS), more: Math.max(0, all.length - MAX_EDITS)};
}

/**
 * A module's text with its white space collapsed the way a run of text's is,
 * and the line of the source each of its characters comes from; kept per
 * module, so every run is found in one pass over each.
 * @type {WeakMap<{file: string, text: string}, {text: string, lines: number[]}>}
 */
const collapsedModules = new WeakMap();

/** @param {{file: string, text: string}} module */
function collapsedOf(module) {
  let found = collapsedModules.get(module);
  if (!found) {
    let text = '';
    /** @type {number[]} */
    const lines = [];
    let line = 1;
    for (const part of module.text.split(/(\s+)/)) {
      if (part === '') continue;
      const space = /^\s/.test(part);
      text += space ? ' ' : part;
      for (let i = 0; i < (space ? 1 : part.length); i++) lines.push(line);
      line += part.split('\n').length - 1;
    }
    found = {text, lines};
    collapsedModules.set(module, found);
  }
  return found;
}

/**
 * Where a run of text sits in the restored source: the file and line where
 * it starts, when it appears exactly once across the files. A run is text
 * with its white space collapsed, and in source the same text may wrap
 * across lines (JSX joins them with one space), so the run is found in each
 * module's text collapsed the same way.
 * @param {string} text a whole run of text
 * @param {{file: string, text: string}[]} files the restored modules and JSON files
 * @returns {{file: string, line: number} | null}
 */
export function locate(text, files) {
  if (!text) return null;
  /** @type {{file: string, line: number} | null} */
  let found = null;
  for (const module of files) {
    const collapsed = collapsedOf(module);
    let at = collapsed.text.indexOf(text);
    while (at >= 0) {
      if (found) return null;
      found = {file: module.file, line: collapsed.lines[at]};
      at = collapsed.text.indexOf(text, at + 1);
    }
  }
  return found;
}
