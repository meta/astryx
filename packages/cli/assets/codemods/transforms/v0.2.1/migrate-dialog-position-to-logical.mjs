// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Migrate Dialog position left/right -> start/end
 * @see https://github.com/meta/astryx/pull/4568
 *
 * The Dialog `position` prop's physical `left`/`right` offsets are deprecated
 * in favor of the logical `start`/`end` offsets. `start`/`end` map to
 * `inset-inline-start` / `inset-inline-end`, so they MIRROR under RTL — a
 * dialog anchored to the inline-start edge stays on the start edge in both
 * LTR and RTL. The physical `left`/`right` still work (non-breaking) but never
 * mirror and will be removed in a future major.
 *
 * This codemod rewrites the inline object-literal `position` prop on <Dialog>:
 *   <Dialog position={{left: 20, right: 40, top: 10}} />
 *     ->
 *   <Dialog position={{start: 20, end: 40, top: 10}} />
 *
 * It renames only the `left` -> `start` and `right` -> `end` keys inside an
 * inline object literal passed to `position`. It is OPTIONAL: `left`/`right`
 * remain valid, so consumers can adopt at their own pace. It intentionally
 * does NOT touch:
 *   - a `position` whose value is a variable/identifier (can't see the shape),
 *   - a `left`/`right` key that already coexists with a `start`/`end` key
 *     (ambiguous intent — leave for a human),
 *   - `left`/`right` on any prop other than `position`, or on non-Dialog JSX.
 */

export const meta = {
  title: 'Migrate Dialog position left/right to logical start/end',
  description:
    'Rewrites <Dialog position={{left, right}}> to {{start, end}}. ' +
    'start/end map to inset-inline-start/end and mirror under RTL; the ' +
    'physical left/right are deprecated (still work, removed in a future ' +
    'major). Optional — adopt at your own pace.',
  pr: '#4568',
  isOptional: true,
};

/** Import sources that provide the Astryx Dialog component. */
const IMPORT_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/Dialog',
  '@xds/core',
  '@xds/core/Dialog',
]);

/** Component names whose `position` prop carries DialogPosition. */
const TARGET_IMPORTED_NAMES = new Set(['Dialog']);

/** Physical -> logical key rename for the position object. */
const KEY_RENAME = /** @type {Record<string, string>} */ ({
  left: 'start',
  right: 'end',
});

/**
 * Read a static (non-computed) object-property key name.
 * @param {any} key
 * @returns {string | null}
 */
function keyName(key) {
  if (!key) return null;
  if (key.type === 'Identifier') return key.name;
  if (key.type === 'Literal' || key.type === 'StringLiteral') return key.value;
  return null;
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

  // Track alias-aware local names for Dialog.
  const targetLocals = new Set();
  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    if (!IMPORT_SOURCES.has(path.node.source.value)) return;
    for (const spec of path.node.specifiers ?? []) {
      if (
        spec.type === 'ImportSpecifier' &&
        TARGET_IMPORTED_NAMES.has(spec.imported.name)
      ) {
        targetLocals.add(spec.local.name);
      }
    }
  });

  if (targetLocals.size === 0) return undefined;

  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ path) => {
    const name = path.node.name;
    const componentName = name.type === 'JSXIdentifier' ? name.name : null;
    if (!componentName || !targetLocals.has(componentName)) return;

    for (const attr of path.node.attributes ?? []) {
      if (attr.type !== 'JSXAttribute') continue;
      if (attr.name?.name !== 'position') continue;
      // position={{ ... }} — a JSXExpressionContainer wrapping an object.
      const value = attr.value;
      if (!value || value.type !== 'JSXExpressionContainer') continue;
      const obj = value.expression;
      if (!obj || obj.type !== 'ObjectExpression') continue;

      const props = obj.properties.filter(
        (/** @type {any} */ p) =>
          p.type === 'Property' || p.type === 'ObjectProperty',
      );
      const presentKeys = new Set(
        props.map((/** @type {any} */ p) => keyName(p.key)).filter(Boolean),
      );

      for (const prop of props) {
        if (prop.computed) continue;
        const physical = keyName(prop.key);
        if (!physical || !(physical in KEY_RENAME)) continue;
        const logical = KEY_RENAME[physical];
        // Skip if the logical key is already present — ambiguous, leave it.
        if (presentKeys.has(logical)) continue;

        if (prop.key.type === 'Identifier') {
          prop.key.name = logical;
        } else {
          prop.key.value = logical;
        }
        presentKeys.delete(physical);
        presentKeys.add(logical);
        hasChanges = true;
      }
    }
  });

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
