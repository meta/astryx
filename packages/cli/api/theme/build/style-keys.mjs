// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The keys in a theme's part blocks that Core cannot build as written:
 * a pseudo key that is no single selector, and a custom property whose name
 * Core renames.
 *
 * @input  a theme as the build holds it (raw defineTheme input or a resolved
 *         theme)
 * @output why a pseudo key or a part custom property cannot be built as
 *         written, and every such key in a theme, with its key path
 * @position Sits beside build.mjs and null-values.mjs (api/theme/build/).
 *           Core writes a pseudo key as selector text after the part's
 *           selector, and a part's property names in kebab case. A broken
 *           key makes the browser drop other rules or style other
 *           elements. The build warns each at its line, so a theme that
 *           built before still builds the same; the editor's judge refuses
 *           the same keys with the same reasons.
 */

import {cssTree} from '../../../foundation/runtime/css-tree.mjs';

/** @param {unknown} value @returns {value is Record<string, any>} */
const isBlock = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** The closer each opener in a selector waits for. */
const CLOSERS = /** @type {Record<string, string>} */ ({
  '(': ')',
  '[': ']',
  '{': '}',
});

/**
 * Why a pseudo key in a part's style block (`':hover'`,
 * `':nth-child(2n)'`) cannot be built, or null. The build writes the key as
 * it is after the part's selector, so the key must read as one selector
 * there. A parenthesis, bracket, quote or comment left open makes the
 * browser read on through the rules after it, and it drops them all. A
 * selector list puts the part's selector before its first member only, so
 * each later member styles every element it matches in the app.
 * @param {string} key
 * @returns {string | null}
 */
export function pseudoKeyProblem(key) {
  const t = cssTree();
  const T = t.tokenTypes;
  /** @type {string[]} */
  const open = [];
  /** @type {string | null} */
  let unclosed = null;
  /** @type {number[]} */
  const commas = [];
  t.tokenize(
    key,
    (
      /** @type {number} */ type,
      /** @type {number} */ start,
      /** @type {number} */ end,
    ) => {
      const text = key.slice(start, end);
      if (type === T.Function || type === T.LeftParenthesis) open.push('(');
      else if (type === T.LeftSquareBracket) open.push('[');
      else if (type === T.LeftCurlyBracket) open.push('{');
      else if (
        (type === T.RightParenthesis ||
          type === T.RightSquareBracket ||
          type === T.RightCurlyBracket) &&
        open.length > 0 &&
        CLOSERS[/** @type {string} */ (open.at(-1))] === text
      )
        open.pop();
      else if (type === T.Comma && open.length === 0) commas.push(start);
      else if (
        (type === T.String && (text.length < 2 || text.at(-1) !== text[0])) ||
        type === T.BadString
      )
        unclosed ??= 'a quote';
      else if (type === T.Comment && !/^\/\*[^]*\*\/$/.test(text))
        unclosed ??= 'a comment';
    },
  );
  const drops = `the build writes a selector the browser reads on through the rules after it, and it drops them all`;
  if (unclosed) return `${key} leaves ${unclosed} open, so ${drops}`;
  if (open.length > 0) {
    const closed =
      key +
      open
        .map(o => CLOSERS[o])
        .reverse()
        .join('');
    const what = open.at(-1) === '(' ? 'a parenthesis' : 'a bracket';
    return `${key} leaves ${what} open, so ${drops}${pseudoKeyProblem(closed) ? '' : `; did you mean '${closed}'?`}`;
  }
  try {
    t.parse(`.p${key}`, {context: 'selectorList'});
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return `${key} is no selector a browser reads (${reason.replace(/\.$/, '')}), so the build writes a rule the browser drops`;
  }
  if (commas.length === 0) return null;
  const members = [-1, ...commas]
    .map((at, i) => key.slice(at + 1, commas[i] ?? key.length).trim())
    .filter(Boolean);
  if (members.length < 2)
    return `${key} holds an empty selector, so the browser drops the rule${members[0] ? `: write '${members[0]}'` : ''}`;
  return `${key} is a selector list, and the build puts the part's selector before its first member only, so ${members.slice(1).join(', ')} would style every element ${members.length > 2 ? 'they match' : 'it matches'} in the app: give each its own key, ${members.map(m => `'${m}': {…}`).join(', ')}`;
}

/**
 * Why a custom property a part's block sets cannot be built as written, or
 * null. The build writes a part's property names in kebab case, and custom
 * properties are case-sensitive, so a name with capitals would be set under
 * another name than var() reads.
 * @param {string} name a key that starts with --
 * @returns {string | null}
 */
export function partCustomPropertyProblem(name) {
  if (!/[A-Z]/.test(name)) return null;
  const built = name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  const lower = /[a-z][A-Z]/.test(name) ? built : name.toLowerCase();
  return `${name} has capitals, and the build writes a part's property names in kebab case, so it would set ${built} while var(${name}) reads ${name} (custom properties are case-sensitive): name it in lower case, such as ${lower}, wherever the theme sets or reads it`;
}

/**
 * @typedef {{path: string[], why: string}} StyleKeyProblem
 */

/**
 * Every key in a part's style blocks that Core cannot build as written, on
 * the page, its surfaces (onDark, onLight) and the adaptation rules' values.
 * @param {Record<string, any>} theme
 * @returns {StyleKeyProblem[]}
 */
export function styleKeyProblems(theme) {
  /** @type {StyleKeyProblem[]} */
  const out = [];
  /** @param {any} node @param {string[]} at @param {number} depth */
  const block = (node, at, depth) => {
    if (!isBlock(node) || depth > 12) return;
    for (const [k, v] of Object.entries(node)) {
      const why = k.startsWith('--')
        ? v === undefined
          ? null
          : partCustomPropertyProblem(k)
        : k.startsWith(':') && isBlock(v)
          ? pseudoKeyProblem(k)
          : null;
      if (why) out.push({path: [...at, k], why});
      else block(v, [...at, k], depth + 1);
    }
  };
  /** @param {any} surface @param {string[]} at */
  const parts = (surface, at) => {
    if (!isBlock(surface) || !isBlock(surface.components)) return;
    for (const [name, styles] of Object.entries(surface.components))
      if (isBlock(styles))
        for (const [key, rules] of Object.entries(styles))
          block(rules, [...at, 'components', name, key], 0);
  };
  parts(theme, []);
  parts(theme.onDark ?? theme.__onDark, ['onDark']);
  parts(theme.onLight ?? theme.__onLight, ['onLight']);
  const rules = theme.adaptations?.rules ?? theme.__adaptations?.rules;
  if (Array.isArray(rules))
    rules.forEach((rule, i) =>
      parts(rule?.value, ['adaptations', 'rules', String(i), 'value']),
    );
  return out;
}
