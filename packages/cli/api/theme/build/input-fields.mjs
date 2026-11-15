// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fields Core's theme input takes, read from its type
 *       declarations, and the fields a theme source writes that Core does
 *       not take.
 * @input The text of Core's theme type declarations; a theme module's
 *        source.
 * @output inputFieldsFrom(): the fields; sourceFieldProblems(): each
 *         misspelled field a source writes, with its line and the field it
 *         is near.
 * @position Shared by the editor, which refuses a misspelled field, and by
 *           theme build, which warns it: defineTheme() drops a field it does
 *           not take, so only the source shows it.
 */

import {parse as parseModule} from '@babel/parser';
import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';

/**
 * The fields Core's `defineTheme()` input takes, read from the type
 * declarations of the installed Core, so the editor names a misspelled
 * field by the fields that Core has.
 * @typedef {object} InputFields
 * @property {string[]} theme - A theme input's fields (and a defined theme's, which a spread carries).
 * @property {string[]} surface - An `onDark`/`onLight` block's fields.
 * @property {string[]} typography - The typography block's fields.
 * @property {string[]} role - A typography role's fields.
 * @property {string[]} scale - The type scale's fields.
 * @property {string[]} levels - The heading levels a role's `weights` takes.
 */

/** The declaration files beside Core's built theme module that declare its input. */
export const INPUT_DECLARATION_FILES = [
  'defineTheme.d.ts',
  'onMediaTokens.d.ts',
  'types.d.ts',
];

/**
 * The fields Core's theme input takes, from the text of its type
 * declarations (each of INPUT_DECLARATION_FILES, in order); null when one is
 * missing or does not parse.
 * @param {Array<string | null>} declarations
 * @returns {InputFields | null}
 */
export function inputFieldsFrom(declarations) {
  /** @type {Map<string, any>} */
  const interfaces = new Map();
  if (declarations.length !== INPUT_DECLARATION_FILES.length) return null;
  for (const text of declarations) {
    if (text == null) return null;
    /** @type {any} */
    let ast;
    try {
      ast = parseModule(text, {
        sourceType: 'module',
        plugins: [['typescript', {dts: true}]],
      });
    } catch {
      return null;
    }
    for (const node of ast.program.body) {
      const decl =
        node.type === 'ExportNamedDeclaration' ? node.declaration : node;
      if (decl?.type === 'TSInterfaceDeclaration')
        interfaces.set(decl.id.name, decl.body.body);
    }
  }
  /** @param {any[] | undefined} members */
  const names = members =>
    (members ?? [])
      .filter(m => m.type === 'TSPropertySignature')
      .map(m => m.key?.name ?? m.key?.value)
      .filter(k => typeof k === 'string');
  /** @param {string} iface @param {string} name */
  const member = (iface, name) =>
    (interfaces.get(iface) ?? []).find(
      (/** @type {any} */ m) => (m.key?.name ?? m.key?.value) === name,
    );
  const theme = names(interfaces.get('DefineThemeInput'));
  const surface = names(interfaces.get('OnMediaOverrides'));
  const typography = names(interfaces.get('TypographyConfig'));
  const role = names(interfaces.get('TypographyRole'));
  if (!theme.length || !surface.length || !typography.length || !role.length)
    return null;
  const scaleType = member('TypographyConfig', 'scale')?.typeAnnotation
    ?.typeAnnotation;
  /** The numeric literals a type names (the levels of `Record<1 | 2, …>`). @param {any} node @returns {string[]} */
  const numbers = node => {
    if (!node || typeof node !== 'object') return [];
    if (
      node.type === 'TSLiteralType' &&
      node.literal?.type === 'NumericLiteral'
    )
      return [String(node.literal.value)];
    return Object.entries(node)
      .filter(([k]) => k !== 'loc' && k !== 'start' && k !== 'end')
      .flatMap(([, v]) => (Array.isArray(v) ? v.flatMap(numbers) : numbers(v)));
  };
  return {
    theme: [...new Set([...theme, ...names(interfaces.get('DefinedTheme'))])],
    surface,
    typography,
    role,
    scale: scaleType?.type === 'TSTypeLiteral' ? names(scaleType.members) : [],
    levels: numbers(member('TypographyRole', 'weights')?.typeAnnotation),
  };
}

/**
 * The field a misspelled one is near: the same name in other letters, or
 * one or two edits from it. Null when none is.
 * @param {string} name
 * @param {string[]} fields
 * @returns {string | null}
 */
function nearField(name, fields) {
  const typed = name.toLowerCase();
  const limit = typed.length > 5 ? 2 : 1;
  let best = null;
  let bestDistance = Infinity;
  for (const field of fields) {
    if (field.startsWith('__')) continue;
    const d = levenshteinDistance(typed, field.toLowerCase(), limit, {
      swaps: true,
    });
    if (d <= limit && d < bestDistance) {
      best = field;
      bestDistance = d;
    }
  }
  return best;
}

/** The wrappers a value can sit in and keep its place (`as`, `satisfies`, parentheses). */
const WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'ParenthesizedExpression',
]);

/** @param {any} node @returns {any} */
const unwrap = node => {
  let n = node;
  while (n && WRAPPERS.has(n.type)) n = n.expression;
  return n;
};

/** @param {any} p @returns {string | null} */
const keyOf = p =>
  p.type !== 'ObjectProperty' || p.computed
    ? null
    : p.key.type === 'Identifier'
      ? p.key.name
      : p.key.type === 'StringLiteral'
        ? p.key.value
        : null;

/**
 * Each field a theme source writes that Core's theme input does not take:
 * in the object given to `defineTheme()` or exported as the default with a
 * name, and in
 * its `onDark`, `onLight` and `typography` blocks, each with its line and
 * the field it is near. A field written through a spread or a computed key
 * is not judged.
 * @param {string} source
 * @param {InputFields} fields
 * @returns {Array<{path: string[], line: number | null, why: string}>}
 */
export function sourceFieldProblems(source, fields) {
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(source, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx', 'decorators-legacy', 'importAttributes'],
    });
  } catch {
    return [];
  }
  /** @type {any[]} */
  const inputs = [];
  /** @param {any} node */
  const find = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(find);
      return;
    }
    const callee = node.type === 'CallExpression' ? node.callee : null;
    const name =
      callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression' && !callee.computed
          ? callee.property?.name
          : null;
    if (name === 'defineTheme') {
      const arg = unwrap(node.arguments?.[0]);
      if (arg?.type === 'ObjectExpression') inputs.push(arg);
    }
    // A plain object exported as the default is a theme when it has its
    // name (one that holds themes by name is no theme input).
    if (node.type === 'ExportDefaultDeclaration') {
      const value = unwrap(node.declaration);
      if (
        value?.type === 'ObjectExpression' &&
        value.properties.some((/** @type {any} */ p) => keyOf(p) === 'name')
      )
        inputs.push(value);
    }
    for (const [k, v] of Object.entries(node))
      if (
        k !== 'loc' &&
        k !== 'start' &&
        k !== 'end' &&
        v &&
        typeof v === 'object'
      )
        find(v);
  };
  find(ast.program);
  /** @type {Array<{path: string[], line: number | null, why: string}>} */
  const out = [];
  /**
   * @param {any} object
   * @param {string[]} at
   * @param {string[]} takes
   * @param {(k: string, near: string | null) => string} why
   * @returns {Map<string, any>} the value of each field it takes
   */
  const check = (object, at, takes, why) => {
    /** @type {Map<string, any>} */
    const values = new Map();
    for (const p of object.properties) {
      const k = keyOf(p);
      if (k == null) continue;
      if (takes.includes(k)) {
        values.set(k, unwrap(p.value));
        continue;
      }
      out.push({
        path: [...at, k],
        line: p.loc?.start?.line ?? null,
        why: why(k, nearField(k, takes)),
      });
    }
    return values;
  };
  const did = (/** @type {string | null} */ near) =>
    near ? `; did you mean ${near}?` : '';
  for (const input of inputs) {
    const top = check(
      input,
      [],
      fields.theme,
      (k, near) =>
        `${k} is no field defineTheme takes, so the build reads nothing from it${did(near)}`,
    );
    for (const surface of ['onDark', 'onLight']) {
      const block = top.get(surface);
      if (block?.type === 'ObjectExpression')
        check(
          block,
          [surface],
          fields.surface,
          (k, near) =>
            `${k} is no field ${surface} takes, so the build reads nothing from it${did(near)}`,
        );
    }
    const typography = top.get('typography');
    if (typography?.type !== 'ObjectExpression') continue;
    const roles = check(
      typography,
      ['typography'],
      fields.typography,
      (k, near) =>
        `${k} is no field typography takes (${fields.typography.join(', ')}), so Core builds nothing from it${did(near)}`,
    );
    for (const [role, block] of roles) {
      if (block?.type !== 'ObjectExpression') continue;
      const takes = role === 'scale' ? fields.scale : fields.role;
      if (!takes.length) continue;
      check(
        block,
        ['typography', role],
        takes,
        (k, near) =>
          `${k} is no field typography.${role} takes (${takes.join(', ')}), so Core builds nothing from it${did(near)}`,
      );
    }
  }
  return out;
}
