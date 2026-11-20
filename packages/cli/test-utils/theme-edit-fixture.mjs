// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Helpers the `experimental theme` test files share: a refusal read
 * as code, message and suggested commands, file reads under the fixture
 * project, the package.json of a fixture app whose template pages can be
 * added, and what a built stylesheet gives a property in one color mode.
 *
 * @position test-utils — used by api/theme-edit/*.test.mjs
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * What a refused command says: its code, message and the commands it
 * suggests. Throws when `fn` is not refused.
 * @param {() => Promise<unknown>} fn
 * @returns {Promise<{code: string, message: string, run: string[]}>}
 */
export async function refusal(fn) {
  try {
    await fn();
  } catch (e) {
    const err = /** @type {any} */ (e);
    return {
      code: err.code,
      message: String(err.message),
      run: (err.suggestions ?? []).map((/** @type {any} */ s) => s.name),
    };
  }
  throw new Error('expected a refusal');
}

/**
 * Reads under the fixture project, which a test file makes in `beforeAll`.
 * @param {() => string} root the project folder, read at each call
 */
export function projectFiles(root) {
  return {
    /** @param {string} rel */
    read: rel => fs.readFileSync(path.join(root(), rel), 'utf8'),
    /** @param {string} rel */
    exists: rel => fs.existsSync(path.join(root(), rel)),
  };
}

/**
 * The package.json of a fixture app that names the packages the template
 * pages import, so ranked pages can be added.
 * @param {{stylex?: boolean, packageManager?: string}} [opts] `stylex`:
 *   name the StyleX runtime too; `packageManager`: the field, which makes
 *   suggested install commands the same whatever runs the tests
 */
export function appPackages(opts = {}) {
  return {
    name: 'app',
    private: true,
    type: 'module',
    ...(opts.packageManager ? {packageManager: opts.packageManager} : {}),
    dependencies: {
      '@astryxdesign/core': '*',
      '@heroicons/react': '*',
      ...(opts.stylex ? {'@stylexjs/stylex': '*'} : {}),
      'lucide-react': '*',
      recharts: '*',
    },
  };
}

/**
 * What a built theme stylesheet gives a property on a selector in one
 * color mode: the value of the selector's rule for that mode (a style
 * key's `@light`/`@dark` block), else that mode's half of the selector's
 * own rule; undefined when the theme gives none, so Core's own applies.
 * @param {string} css a built theme stylesheet
 * @param {string} selector a component rule's selector, as built
 * @param {string} prop a CSS property, kebab-case
 * @param {'light' | 'dark'} mode
 * @returns {string | undefined}
 */
export function modeValue(css, selector, prop, mode) {
  /** @param {string} sel */
  const read = sel => {
    const i = css.indexOf(`${sel} {`);
    if (i < 0) return undefined;
    const rule = css.slice(i, css.indexOf('}', i));
    return new RegExp(`(?:^|[\\s;{])${prop}: ([^;]+);`).exec(rule)?.[1];
  };
  // The mode conditions sit on the selector before its pseudo-classes.
  let nesting = 0;
  let at = selector.length;
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (c === '[' || c === '(') nesting++;
    else if (c === ']' || c === ')') nesting--;
    else if (c === ':' && nesting === 0) {
      at = i;
      break;
    }
  }
  const own = read(
    `:is(${selector.slice(0, at)}):where(:scope[data-theme="${mode}"] *):where(:not(:scope [data-astryx-media] *))${selector.slice(at)}`,
  );
  if (own != null) return own;
  const plain = read(selector);
  const pair = /^light-dark\((.*)\)$/s.exec(plain?.trim() ?? '')?.[1];
  if (pair == null) return plain;
  let depth = 0;
  for (let i = 0; i < pair.length; i++) {
    if (pair[i] === '(') depth++;
    else if (pair[i] === ')') depth--;
    else if (pair[i] === ',' && depth === 0)
      return (mode === 'light' ? pair.slice(0, i) : pair.slice(i + 1)).trim();
  }
  return plain;
}
