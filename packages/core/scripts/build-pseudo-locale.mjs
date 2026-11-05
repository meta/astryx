#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file build-pseudo-locale.mjs
 * @description Generates packages/core/locales/pseudo.json from en.json for
 *   dev/test use. Each defaultMessage is wrapped in ⟦...⟧ markers and its
 *   letters are replaced with accented forms so untranslated strings are
 *   obviously visible in the UI and narrow-column layout bugs surface.
 *
 *   Placeholders like {name}, {count, plural, ...} are left INTACT so the
 *   ICU parser still works. Only literal letters are transformed.
 *
 * Usage:
 *   node packages/core/scripts/build-pseudo-locale.mjs
 *
 * Runs as part of the core build so pseudo.json stays in sync with en.json.
 */

import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EN_PATH = resolve(HERE, '..', 'locales', 'en.json');
const PSEUDO_PATH = resolve(HERE, '..', 'locales', 'pseudo.json');

const ACCENTED = {
  a: 'à', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ',
  i: 'í', j: 'ĵ', k: 'ķ', l: 'ł', m: 'ɱ', n: 'ñ', o: 'ó', p: 'þ',
  q: 'ɋ', r: 'ř', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ',
  y: 'ý', z: 'ž',
  A: 'À', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ',
  I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ł', M: 'Ṁ', N: 'Ñ', O: 'Ó', P: 'Þ',
  Q: 'Ǫ', R: 'Ř', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ',
  Y: 'Ý', Z: 'Ž',
};

export function pseudoTranslate(msg) {
  let out = '';
  let depth = 0;
  for (const ch of msg) {
    if (ch === '{') { depth++; out += ch; continue; }
    if (ch === '}') { depth--; out += ch; continue; }
    if (depth > 0) { out += ch; continue; }
    out += ACCENTED[ch] ?? ch;
  }
  return `\u27E6${out}\u27E7`;
}

export function createPseudoCatalog(en) {
  const pseudo = {};
  for (const [key, entry] of Object.entries(en)) {
    pseudo[key] = {defaultMessage: pseudoTranslate(entry.defaultMessage)};
  }
  return pseudo;
}

function main() {
  const en = JSON.parse(readFileSync(EN_PATH, 'utf8'));
  const pseudo = createPseudoCatalog(en);
  writeFileSync(PSEUDO_PATH, JSON.stringify(pseudo, null, 2) + '\n', 'utf8');
  console.log(`Built pseudo.json — ${Object.keys(pseudo).length} keys`);
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main();
}
