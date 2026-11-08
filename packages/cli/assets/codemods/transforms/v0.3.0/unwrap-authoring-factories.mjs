// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: unwrap the removed authoring `create*` factories.
 *
 * v0.3.0 removes the authoring factories. Authoring is now types + parsers: an
 * author writes a plain object and stamps its `type` directly. This transform
 * rewrites factory calls imported from the retired Astryx authoring entrypoints
 * to the plain object the factory used to return, then drops the now-dead
 * factory imports:
 *
 *   createConfig(o) / createIntegration(o)        -> o        (no discriminant)
 *   createComponentDoc(o)                         -> { ...o, type: 'component' }
 *   createFunctionDoc(o)                          -> { ...o, type: 'function' }
 *   createDoc(o)                                  -> { ...o, type: 'generic' }
 *   createPageTemplate(o)                         -> { ...o, type: 'page' }
 *   createBlockTemplate(o)                        -> { ...o, type: 'block' }
 *   createCodemod(o)                              -> { ...o, type: 'code' }
 *   createConfigCodemod(o)                        -> { ...o, type: 'config' }
 *
 * When the argument is an object literal the `type` is added (or overwritten) as
 * a property in place — the common `export default createComponentDoc({ ... })`
 * form becomes a clean stamped literal. When the argument is anything else
 * (a variable, a spread), it is wrapped `{ ...arg, type: '...' }` so runtime
 * semantics match the old stamp-only factory exactly.
 *
 * Import aliases are followed (`import {createDoc as mk}` → calls to `mk`), and
 * the factory specifiers are removed afterward (the whole import statement goes
 * if nothing else was imported from it). Same-named imports from other packages
 * remain untouched. Run this BEFORE `migrate-authoring-imports`, which repoints
 * the surviving type imports.
 */

export const meta = {
  title: 'Unwrap authoring create* factories into plain stamped objects',
  description:
    'Rewrites createConfig/createIntegration/createComponentDoc/' +
    'createFunctionDoc/createDoc/createPageTemplate/createBlockTemplate/' +
    'createCodemod/createConfigCodemod calls to the plain object they returned ' +
    '(stamping the doc/template/codemod `type` discriminant), and removes the ' +
    'now-dead factory imports. Authoring is types + parsers in v0.3.0 — there ' +
    'are no factories.',
  pr: '#4612',
  fileExtensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'],
};

/** Legacy Astryx authoring entrypoints that exported the removed factories. */
const AUTHORING_SOURCES = new Set([
  '@astryxdesign/cli/config',
  '@astryxdesign/cli/doc',
  '@astryxdesign/cli/integration',
  '@astryxdesign/cli/template',
  '@astryxdesign/cli/codemod',
  '@astryxdesign/core/authoring',
  '@astryxdesign/core/config',
]);

/**
 * Factory name → the `type` discriminant it stamped, or `null` for the config /
 * integration factories, which were pure typed-identity (no discriminant).
 */
const FACTORY_STAMPS = new Map([
  ['createConfig', null],
  ['createIntegration', null],
  ['createComponentDoc', 'component'],
  ['createFunctionDoc', 'function'],
  ['createDoc', 'generic'],
  ['createPageTemplate', 'page'],
  ['createBlockTemplate', 'block'],
  ['createCodemod', 'code'],
  ['createConfigCodemod', 'config'],
]);

/**
 * Add or overwrite a `type: '<kind>'` property on an object literal, in place.
 * @param {any} j
 * @param {any} objExpr an ObjectExpression node
 * @param {string} kind
 */
function stampObjectType(j, objExpr, kind) {
  const isTypeKey = (/** @type {any} */ prop) => {
    if (
      (!j.ObjectProperty.check(prop) && !j.Property.check(prop)) ||
      prop.computed
    ) {
      return false;
    }
    const key = prop.key;
    if (j.Identifier.check(key)) return key.name === 'type';
    if (j.StringLiteral.check(key)) return key.value === 'type';
    if (j.Literal.check(key)) return key.value === 'type';
    return false;
  };
  const existing = objExpr.properties.find(isTypeKey);
  if (existing) {
    existing.value = j.stringLiteral(kind);
    // A shorthand `{type}` (i.e. `type: type`) prints as just its value, so
    // overwriting `.value` alone would emit `{'component'}` — invalid. Force
    // the explicit `type: '<kind>'` form.
    existing.shorthand = false;
    existing.key = j.identifier('type');
  } else {
    objExpr.properties.push(
      j.objectProperty(j.identifier('type'), j.stringLiteral(kind)),
    );
  }
}

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  // Map each local binding (honoring `as` aliases) to its canonical factory
  // name, so calls to aliased factories are still rewritten.
  /** @type {Map<string, string>} */
  const localToFactory = new Map();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    if (!AUTHORING_SOURCES.has(path.node.source.value)) return;
    for (const spec of path.node.specifiers ?? []) {
      if (spec.type !== 'ImportSpecifier') continue;
      const importedName = spec.imported?.name;
      if (importedName && FACTORY_STAMPS.has(importedName)) {
        localToFactory.set(spec.local?.name ?? importedName, importedName);
      }
    }
  });

  if (localToFactory.size === 0) return undefined;

  // Rewrite each factory call to the plain (stamped) object.
  root.find(j.CallExpression).forEach((/** @type {any} */ path) => {
    const callee = path.node.callee;
    if (callee.type !== 'Identifier') return;
    const canonical = localToFactory.get(callee.name);
    if (!canonical) return;

    const kind = FACTORY_STAMPS.get(canonical);
    const arg = path.node.arguments[0];

    /** @type {any} */
    let replacement;
    if (!arg) {
      // createX() with no argument. The factory imports are removed below, so
      // leaving the call would dangle a reference to a deleted binding. Emit the
      // object the factory produced from no input: an empty object for the
      // pure config/integration factories, or a stamp-only `{type: '<kind>'}`.
      replacement =
        kind == null
          ? j.objectExpression([])
          : j.objectExpression([
              j.objectProperty(j.identifier('type'), j.stringLiteral(kind)),
            ]);
    } else if (kind == null) {
      // config / integration: pure unwrap.
      replacement = arg;
    } else if (j.ObjectExpression.check(arg)) {
      stampObjectType(j, arg, kind);
      replacement = arg;
    } else {
      // Non-literal argument: preserve stamp semantics with a spread.
      replacement = j.objectExpression([
        j.spreadElement(arg),
        j.objectProperty(j.identifier('type'), j.stringLiteral(kind)),
      ]);
    }

    j(path).replaceWith(replacement);
    hasChanges = true;
  });

  // Drop the now-dead factory import specifiers; remove any import statement
  // left empty.
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    if (!AUTHORING_SOURCES.has(path.node.source.value)) return;
    const specs = path.node.specifiers ?? [];
    const kept = specs.filter(
      (/** @type {any} */ spec) =>
        !(
          spec.type === 'ImportSpecifier' &&
          FACTORY_STAMPS.has(spec.imported?.name)
        ),
    );
    if (kept.length === specs.length) return;
    hasChanges = true;
    if (kept.length === 0) {
      j(path).remove();
    } else {
      path.node.specifiers = kept;
    }
  });

  return hasChanges ? root.toSource({quote: 'single'}) : undefined;
}
