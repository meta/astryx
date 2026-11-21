// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The fields Core's theme input takes, read from its type
 *       declarations, and the fields a theme source writes that Core does
 *       not take.
 * @input The text of Core's theme type declarations; a theme module's
 *        source.
 * @output inputFieldsFrom(): the fields; sourceFieldProblems(): each
 *         misspelled field a source writes, with its line and the field it
 *         is near; sourceTypography() and sourceInputField(): the values it
 *         writes in its typography (or another input field).
 * @position Shared by the editor, which refuses a misspelled field, and by
 *           theme build, which warns it: defineTheme() drops a field it does
 *           not take, so only the source shows it.
 */

import {babelParse as parseModule} from '../../../foundation/runtime/lazy-dependencies.mjs';
import {levenshteinDistance} from '../../../foundation/text/levenshtein.mjs';
import {sourcePlugins} from './source-syntax.mjs';
import {entriesNotRead} from './written-values.mjs';
import {UNREAD} from './typography-values.mjs';

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

/**
 * The field a property or method writes (`onLoad() {}` is a field too).
 * @param {any} p
 * @returns {string | null}
 */
const keyOf = p =>
  (p.type !== 'ObjectProperty' && p.type !== 'ObjectMethod') || p.computed
    ? null
    : p.key.type === 'Identifier'
      ? p.key.name
      : p.key.type === 'StringLiteral'
        ? p.key.value
        : p.key.type === 'NumericLiteral'
          ? String(p.key.value)
          : null;

/**
 * @typedef {{file: string, source: string}} SourceFile
 * @typedef {(from: string, specifier: string) => SourceFile | null} LoadSource
 *   the source of the module a relative import names, or null
 */

/** The specifiers Core's defineTheme() is imported from. */
const CORE_THEME = /^@astryxdesign\/core(?:\/theme)?$/;

/**
 * One module of a theme's sources, read for what a field check follows: its
 * consts, its imports and its exports.
 * @param {SourceFile} sourceFile
 */
function readModule({file, source}) {
  /** @type {any} */
  let ast;
  try {
    ast = parseModule(source, {
      sourceType: 'unambiguous',
      plugins: sourcePlugins(file),
    });
  } catch {
    return null;
  }
  /** @type {Map<string, any>} */
  const consts = new Map();
  /** @type {Map<string, {specifier: string, imported: string}>} */
  const imports = new Map();
  /** @type {Map<string, any>} the value each name exports, by its name */
  const exported = new Map();
  /** @type {Array<{specifier: string, names: Map<string, string> | null}>} exports of another module (null: all of them) */
  const reExports = [];
  /** @type {Set<string>} the local names of Core's defineTheme */
  const defineNames = new Set(['defineTheme']);
  for (const st of ast.program.body) {
    const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (decl?.type === 'VariableDeclaration')
      for (const d of decl.declarations)
        if (d.id?.type === 'Identifier' && d.init) {
          consts.set(d.id.name, d.init);
          if (decl !== st) exported.set(d.id.name, d.init);
        }
    // A top-level assignment gives a name its value from there on: the
    // last one is the value the module ends with.
    const assigned =
      st.type === 'ExpressionStatement' &&
      st.expression?.type === 'AssignmentExpression' &&
      st.expression.operator === '=' &&
      st.expression.left?.type === 'Identifier'
        ? st.expression
        : null;
    if (assigned) consts.set(assigned.left.name, assigned.right);
    if (st.type === 'ImportDeclaration' && st.importKind !== 'type') {
      const specifier = String(st.source.value);
      for (const x of st.specifiers) {
        const imported =
          x.type === 'ImportDefaultSpecifier'
            ? 'default'
            : x.type === 'ImportSpecifier'
              ? (x.imported.name ?? x.imported.value)
              : null;
        if (imported == null) continue;
        imports.set(x.local.name, {specifier, imported});
        if (CORE_THEME.test(specifier) && imported === 'defineTheme')
          defineNames.add(x.local.name);
      }
    }
    if (st.type === 'ExportDefaultDeclaration')
      exported.set('default', st.declaration);
    if (st.type === 'ExportNamedDeclaration' && !st.declaration) {
      if (st.source) {
        /** @type {Map<string, string>} */
        const names = new Map();
        for (const x of st.specifiers)
          if (x.type === 'ExportSpecifier')
            names.set(
              x.exported.name ?? x.exported.value,
              x.local.name ?? x.local.value,
            );
        reExports.push({specifier: String(st.source.value), names});
      } else
        for (const x of st.specifiers)
          if (x.type === 'ExportSpecifier')
            exported.set(x.exported.name ?? x.exported.value, {
              type: 'Identifier',
              name: x.local.name,
            });
    }
    if (st.type === 'ExportAllDeclaration')
      reExports.push({specifier: String(st.source.value), names: null});
  }
  return {file, ast, consts, imports, exported, reExports, defineNames};
}

/**
 * The objects a theme's sources give as theme input, each with the module
 * that writes it: every object given to Core's `defineTheme()` (by any
 * local name it is imported as) or exported as the default with a name,
 * followed where the source holds it in a const or imports it from a
 * relative module, and in a module the theme file re-exports. With
 * `objectOf`, which follows a value the same way.
 * @param {SourceFile} entry
 * @param {LoadSource} load
 */
function themeInputs(entry, load) {
  /** @type {Map<string, ReturnType<typeof readModule>>} */
  const modules = new Map();
  /** @param {SourceFile} sf */
  const moduleOf = sf => {
    if (!modules.has(sf.file)) modules.set(sf.file, readModule(sf));
    return modules.get(sf.file) ?? null;
  };
  /**
   * The module a relative import of `mod` names, read.
   * @param {any} mod @param {string} specifier
   */
  const imported = (mod, specifier) => {
    if (!specifier.startsWith('.')) return null;
    const sf = load(mod.file, specifier);
    return sf ? moduleOf(sf) : null;
  };
  /**
   * The object literal a value is, following consts and relative imports,
   * with the module that writes it; null when it is no literal the source
   * shows.
   * @param {any} node @param {any} mod @param {number} [depth]
   * @returns {{node: any, mod: any} | null}
   */
  const objectOf = (node, mod, depth = 0) =>
    objectsOf(node, mod, depth)[0] ?? null;
  /**
   * Every object literal a value can be, following consts and relative
   * imports, with the module that writes each: a member of an object or an
   * element of an array the source writes (`all.a`, `list[0]`), each branch
   * of a ternary or a `||`/`??`, and each object `Object.assign` merges.
   * Empty when the source shows none.
   * @param {any} node @param {any} mod @param {number} [depth]
   * @returns {Array<{node: any, mod: any}>}
   */
  const objectsOf = (node, mod, depth = 0) => {
    const value = unwrap(node);
    if (!value || depth > 8) return [];
    if (value.type === 'ObjectExpression') return [{node: value, mod}];
    if (value.type === 'ConditionalExpression')
      return [
        ...objectsOf(value.consequent, mod, depth + 1),
        ...objectsOf(value.alternate, mod, depth + 1),
      ];
    if (value.type === 'LogicalExpression')
      return [
        ...objectsOf(value.left, mod, depth + 1),
        ...objectsOf(value.right, mod, depth + 1),
      ];
    if (
      value.type === 'CallExpression' &&
      value.callee?.type === 'MemberExpression' &&
      !value.callee.computed &&
      value.callee.object?.type === 'Identifier' &&
      value.callee.object.name === 'Object' &&
      value.callee.property?.name === 'assign'
    )
      return value.arguments.flatMap((/** @type {any} */ a) =>
        objectsOf(a, mod, depth + 1),
      );
    if (value.type === 'MemberExpression') {
      const key = value.computed
        ? value.property?.type === 'StringLiteral' ||
          value.property?.type === 'NumericLiteral'
          ? String(value.property.value)
          : null
        : value.property?.name;
      if (key == null) return [];
      // A member of a module a dynamic import loads is that module's export.
      const ns = namespaceOf(value.object, mod, depth + 1);
      if (ns) {
        const found = exportOf(ns, key, depth + 1);
        return found ? [found] : [];
      }
      const list = arrayOf(value.object, mod, depth + 1);
      if (list && /^\d+$/.test(key)) {
        const element = list.node.elements[Number(key)];
        return element ? objectsOf(element, list.mod, depth + 1) : [];
      }
      return objectsOf(value.object, mod, depth + 1).flatMap(holder => {
        const p = holder.node.properties.find(
          (/** @type {any} */ x) =>
            x.type === 'ObjectProperty' && keyOf(x) === key,
        );
        return p ? objectsOf(p.value, holder.mod, depth + 1) : [];
      });
    }
    if (value.type !== 'Identifier') return [];
    if (mod.consts.has(value.name))
      return objectsOf(mod.consts.get(value.name), mod, depth + 1);
    const from = mod.imports.get(value.name);
    if (!from) return [];
    const other = imported(mod, from.specifier);
    const found = other ? exportOf(other, from.imported, depth + 1) : null;
    return found ? [found] : [];
  };
  /**
   * The module a value is, when it is what a dynamic import of a relative
   * module gives (`await import('./in')`), following the consts of its
   * module; null otherwise.
   * @param {any} node @param {any} mod @param {number} depth
   * @returns {any}
   */
  const namespaceOf = (node, mod, depth) => {
    let value = unwrap(node);
    if (value?.type === 'AwaitExpression') value = unwrap(value.argument);
    if (!value || depth > 8) return null;
    const source =
      value.type === 'ImportExpression'
        ? value.source
        : value.type === 'CallExpression' && value.callee?.type === 'Import'
          ? value.arguments?.[0]
          : null;
    if (source?.type === 'StringLiteral')
      return imported(mod, String(source.value));
    return value.type === 'Identifier' && mod.consts.has(value.name)
      ? namespaceOf(mod.consts.get(value.name), mod, depth + 1)
      : null;
  };
  /**
   * The array literal a value is, following the consts of its module.
   * @param {any} node @param {any} mod @param {number} depth
   * @returns {{node: any, mod: any} | null}
   */
  const arrayOf = (node, mod, depth) => {
    const value = unwrap(node);
    if (!value || depth > 8) return null;
    if (value.type === 'ArrayExpression') return {node: value, mod};
    return value.type === 'Identifier' && mod.consts.has(value.name)
      ? arrayOf(mod.consts.get(value.name), mod, depth + 1)
      : null;
  };
  /**
   * The object literal a module exports under a name.
   * @param {any} mod @param {string} name @param {number} depth
   * @returns {{node: any, mod: any} | null}
   */
  const exportOf = (mod, name, depth) => {
    if (depth > 8) return null;
    if (mod.exported.has(name))
      return objectOf(mod.exported.get(name), mod, depth);
    for (const re of mod.reExports) {
      const local = re.names ? re.names.get(name) : name;
      if (local == null) continue;
      const other = imported(mod, re.specifier);
      const found = other && exportOf(other, local, depth + 1);
      if (found) return found;
    }
    return null;
  };
  /** @type {Array<{node: any, mod: any}>} */
  const inputs = [];
  /** @type {Set<any>} */
  const seen = new Set();
  /** @param {{node: any, mod: any} | null} input */
  const add = input => {
    if (input && !seen.has(input.node)) {
      seen.add(input.node);
      inputs.push(input);
    }
  };
  /** @type {Set<string>} */
  const scanned = new Set();
  /** @param {any} mod @param {number} depth */
  const scan = (mod, depth) => {
    if (!mod || scanned.has(mod.file) || depth > 4) return;
    scanned.add(mod.file);
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
          ? mod.defineNames.has(callee.name)
            ? 'defineTheme'
            : null
          : callee?.type === 'MemberExpression' && !callee.computed
            ? callee.property?.name
            : null;
      if (name === 'defineTheme')
        for (const value of objectsOf(node.arguments?.[0], mod)) add(value);
      // A plain object exported as the default is a theme when it, or an
      // object merged into it, has its name (one that holds themes by name
      // is no theme input).
      if (node.type === 'ExportDefaultDeclaration') {
        const values = objectsOf(node.declaration, mod);
        if (
          values.some(value =>
            value.node.properties.some(
              (/** @type {any} */ p) => keyOf(p) === 'name',
            ),
          )
        )
          for (const value of values) add(value);
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
    find(mod.ast.program);
    // A theme file that re-exports its theme from another module, or
    // exports a theme it imports, builds that module's theme.
    for (const re of mod.reExports)
      scan(imported(mod, re.specifier), depth + 1);
    for (const value of mod.exported.values())
      scan(importedBy(value, mod), depth + 1);
  };
  /**
   * The module a value is imported from, following the consts that hold
   * it (`export const t = x`, with x imported); null when it is not
   * imported from a relative module.
   * @param {any} node @param {any} mod @param {number} [depth]
   * @returns {any}
   */
  const importedBy = (node, mod, depth = 0) => {
    const value = unwrap(node);
    if (value?.type !== 'Identifier' || depth > 8) return null;
    if (mod.consts.has(value.name))
      return importedBy(mod.consts.get(value.name), mod, depth + 1);
    const from = mod.imports.get(value.name);
    return from ? imported(mod, from.specifier) : null;
  };
  scan(moduleOf(entry), 0);
  /**
   * The literal a value is, following the consts of its module.
   * @param {any} node @param {any} mod @param {number} [depth]
   * @returns {any}
   */
  const literalOf = (node, mod, depth = 0) => {
    const value = unwrap(node);
    if (value?.type !== 'Identifier' || depth > 8) return value;
    return mod.consts.has(value.name)
      ? literalOf(mod.consts.get(value.name), mod, depth + 1)
      : value;
  };
  return {inputs, objectOf, literalOf};
}

/**
 * Each field a theme's sources write that Core's theme input does not take,
 * each with its file, its line and the field it is near: in every object
 * given to Core's `defineTheme()` (by any local name it is imported as) or
 * exported as the default with a name, and in its `onDark`, `onLight` and
 * `typography` blocks. An object is followed where the source holds it in a
 * const or imports it from a relative module, and a module the theme file
 * re-exports is read too. A field written through a spread or a computed key
 * is not judged.
 * @param {SourceFile} entry
 * @param {InputFields} fields
 * @param {LoadSource} load
 * @returns {Array<{path: string[], file: string, line: number | null, why: string}>}
 */
export function sourceFieldProblems(entry, fields, load) {
  const {inputs, objectOf, literalOf} = themeInputs(entry, load);
  /** @type {Array<{path: string[], file: string, line: number | null, why: string}>} */
  const out = [];
  /** @type {Set<any>} the objects a check is inside, for a spread that reaches back */
  const checking = new Set();
  /**
   * @param {{node: any, mod: any}} object
   * @param {string[]} at
   * @param {string[]} takes
   * @param {(k: string, near: string | null) => string} why
   * @param {boolean} [values_] whether each field holds a CSS value (a
   *   typography role's), so a BigInt written there is named
   * @returns {Map<string, {node: any, mod: any}>} the object each field it takes holds
   */
  const check = (object, at, takes, why, values_ = false) => {
    /** @type {Map<string, {node: any, mod: any}>} */
    const values = new Map();
    if (checking.has(object.node)) return values;
    checking.add(object.node);
    for (const p of object.node.properties) {
      // A spread's fields are fields of this object, where the source shows
      // the object it spreads.
      if (p.type === 'SpreadElement') {
        const spread = objectOf(p.argument, object.mod);
        if (spread)
          for (const [k, v] of check(spread, at, takes, why, values_))
            values.set(k, v);
        continue;
      }
      const k = keyOf(p);
      if (k == null) continue;
      const literal =
        p.type === 'ObjectProperty' ? literalOf(p.value, object.mod) : null;
      // A Map or a Set: defineTheme reads an object's own keys.
      if (
        takes.includes(k) &&
        literal?.type === 'NewExpression' &&
        literal.callee?.type === 'Identifier' &&
        ['Map', 'Set', 'WeakMap', 'WeakSet'].includes(literal.callee.name)
      ) {
        out.push({
          path: [...at, k],
          file: object.mod.file,
          line: p.loc?.start?.line ?? null,
          why: entriesNotRead(k, literal.callee.name),
        });
        continue;
      }
      if (values_ && takes.includes(k) && literal?.type === 'BigIntLiteral') {
        out.push({
          path: [...at, k],
          file: object.mod.file,
          line: p.loc?.start?.line ?? null,
          why: `${k} holds ${literal.value}n, a BigInt, which is no CSS value: give it a CSS value in quotes, such as '${literal.value}'`,
        });
        continue;
      }
      if (takes.includes(k)) {
        const value = objectOf(p.value, object.mod);
        if (value) values.set(k, value);
        continue;
      }
      out.push({
        path: [...at, k],
        file: object.mod.file,
        line: p.loc?.start?.line ?? null,
        why: why(k, nearField(k, takes)),
      });
    }
    checking.delete(object.node);
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
      if (block)
        check(
          block,
          [surface],
          fields.surface,
          (k, near) =>
            `${k} is no field ${surface} takes, so the build reads nothing from it${did(near)}`,
        );
    }
    const typography = top.get('typography');
    if (!typography) continue;
    const roles = check(
      typography,
      ['typography'],
      fields.typography,
      (k, near) =>
        `${k} is no field typography takes (${fields.typography.join(', ')}), so Core builds nothing from it${did(near)}`,
    );
    for (const [role, block] of roles) {
      const takes = role === 'scale' ? fields.scale : fields.role;
      if (!takes.length) continue;
      check(
        block,
        ['typography', role],
        takes,
        (k, near) =>
          `${k} is no field typography.${role} takes (${takes.join(', ')}), so Core builds nothing from it${did(near)}`,
        true,
      );
    }
  }
  return out;
}

/**
 * Each field the loaded theme input holds that Core's theme input does not
 * take, by its key path, as {@link sourceFieldProblems} words it: the input
 * the build hands defineTheme, whatever expression in the source made it (a
 * member, an array element, a call's result). A key with two underscores
 * (`__onDark`) is the theme's own data, not a field.
 * @param {any} input the theme input as loaded
 * @param {InputFields} fields
 * @returns {Array<{path: string[], why: string}>}
 */
export function inputFieldProblems(input, fields) {
  /** @type {Array<{path: string[], why: string}>} */
  const out = [];
  const did = (/** @type {string | null} */ near) =>
    near ? `; did you mean ${near}?` : '';
  /** @param {any} value */
  const block = value =>
    value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  /**
   * @param {any} object
   * @param {string[]} at
   * @param {string[]} takes
   * @param {(k: string, near: string | null) => string} why
   */
  const check = (object, at, takes, why) => {
    for (const k of Object.keys(object)) {
      if (k.startsWith('__') || takes.includes(k)) continue;
      out.push({path: [...at, k], why: why(k, nearField(k, takes))});
    }
  };
  const top = block(input);
  if (!top) return out;
  check(
    top,
    [],
    fields.theme,
    (k, near) =>
      `${k} is no field defineTheme takes, so the build reads nothing from it${did(near)}`,
  );
  for (const surface of ['onDark', 'onLight']) {
    const value = block(top[surface]);
    if (value)
      check(
        value,
        [surface],
        fields.surface,
        (k, near) =>
          `${k} is no field ${surface} takes, so the build reads nothing from it${did(near)}`,
      );
  }
  const typography = block(top.typography);
  if (!typography) return out;
  check(
    typography,
    ['typography'],
    fields.typography,
    (k, near) =>
      `${k} is no field typography takes (${fields.typography.join(', ')}), so Core builds nothing from it${did(near)}`,
  );
  for (const role of Object.keys(typography)) {
    if (!fields.typography.includes(role)) continue;
    const value = block(typography[role]);
    const takes = role === 'scale' ? fields.scale : fields.role;
    if (!value || !takes.length) continue;
    check(
      value,
      ['typography', role],
      takes,
      (k, near) =>
        `${k} is no field typography.${role} takes (${takes.join(', ')}), so Core builds nothing from it${did(near)}`,
    );
  }
  return out;
}

/**
 * A theme source's typography as the plain values it writes: text,
 * numbers (signed too) and arrays, in nested blocks, followed through the consts of the
 * theme file. A value written as anything else (a call, a name from another
 * module) is UNREAD, and a block with a spread of one is marked UNREAD, so
 * a judge never reads it as missing. Null when the source writes none.
 * @param {string} source
 * @param {string} [file] the source's file name, which says whether it is
 *   read with JSX
 * @returns {unknown}
 */
export function sourceTypography(source, file = '') {
  return sourceInputField(source, file, 'typography');
}

/**
 * One field of a theme source's input (`typography`, `radius`) as the plain
 * values it writes, read as sourceTypography() reads typography.
 * @param {string} source
 * @param {string} file the source's file name
 * @param {string} field
 * @returns {unknown}
 */
export function sourceInputField(source, file, field) {
  const {inputs, objectOf} = themeInputs({file, source}, () => null);
  /** @param {any} node @param {any} mod @returns {any} */
  const plain = (node, mod) => {
    const n = unwrap(node);
    if (!n) return UNREAD;
    if (n.type === 'StringLiteral' || n.type === 'NumericLiteral')
      return n.value;
    if (n.type === 'TemplateLiteral' && n.expressions.length === 0)
      return n.quasis.map((/** @type {any} */ q) => q.value.cooked).join('');
    // A signed number (-100, +500) is a number as written.
    if (
      n.type === 'UnaryExpression' &&
      (n.operator === '-' || n.operator === '+') &&
      unwrap(n.argument)?.type === 'NumericLiteral'
    )
      return (n.operator === '-' ? -1 : 1) * unwrap(n.argument).value;
    if (n.type === 'ArrayExpression')
      return n.elements.map((/** @type {any} */ e) =>
        e?.type === 'SpreadElement' ? UNREAD : plain(e, mod),
      );
    const object = objectOf(n, mod);
    if (!object) return UNREAD;
    /** @type {Record<string | symbol, any>} */
    const out = {};
    for (const p of object.node.properties) {
      if (p.type === 'SpreadElement') {
        const spread = plain(p.argument, object.mod);
        if (spread && typeof spread === 'object') Object.assign(out, spread);
        else out[UNREAD] = true;
        continue;
      }
      const k = keyOf(p);
      if (k == null || p.type !== 'ObjectProperty') {
        out[UNREAD] = true;
        continue;
      }
      out[k] = plain(p.value, object.mod);
    }
    return out;
  };
  for (const input of inputs) {
    const p = input.node.properties.find(
      (/** @type {any} */ x) =>
        x.type === 'ObjectProperty' && keyOf(x) === field,
    );
    const v = p ? plain(p.value, input.mod) : UNREAD;
    if (v !== UNREAD) return v;
  }
  return null;
}
