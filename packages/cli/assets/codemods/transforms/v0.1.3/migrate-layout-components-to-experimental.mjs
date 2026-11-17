// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: migrate astryx.config `layout.components` to
 * `experimental.xle.components`.
 *
 * The published 0.1.2 CLI read XLE app-component registration from
 * `astryx.config.*` under `layout.components`. The next release relocates this
 * to `experimental.xle.components`, validated by a strict schema that REJECTS
 * unknown keys — so any consumer that still has `layout.components` would
 * hard-error on upgrade. This codemod performs the straight relocation.
 *
 * The semantics are IDENTICAL between the old and new shapes; this is purely a
 * MOVE plus a string→object normalization. No meaning is changed:
 *
 *   OLD `layout.components` entry forms (from the 0.1.2 shim):
 *     - string `'X'`  → a NAMED import; the KEY is both the local name and the
 *       export name.
 *     - object `{ from, description?, default? }` → `default: true` means a
 *       default import; otherwise a named import (key = export name).
 *
 *   NEW `experimental.xle.components` entry shape (already shipped on the
 *   branch; unchanged here): `{ from, description?, default? }`, with the same
 *   semantics.
 *
 *   So the migration is:
 *     - string `'X'`                            → `{ from: 'X' }`
 *     - object `{ from, description?, default? }` → carried over UNCHANGED
 *       (from/description/default preserved, key order preserved).
 *
 * The transform recognizes the config default export as a bare object literal
 * (`export default { ... }`), a `createConfig({ ... })` call wrapping an object
 * literal (`export default createConfig({ ... })`), or an identifier bound by a
 * top-level `const` to either form (`const config = { ... }; export default
 * config;`, the shape generated configs use) when the binding is not
 * exported any other way and the default export is its only reference, so
 * nothing can mutate the object after its declaration. Anything else is not statically analyzable and the transform
 * THROWS with a clear
 * migrate-manually message (the unified config-codemod contract has no
 * structured-error return — `runConfigCodemod` surfaces a thrown `err.message`
 * as `{file, codemod, error}`).
 */

export const meta = {
  title: 'Migrate astryx.config layout.components to experimental.xle.components',
  description:
    'Relocates XLE app-component registration from the legacy ' +
    '`layout.components` config key to `experimental.xle.components`. String ' +
    'entries (`Name: "@/path"`) are normalized to `{ from: "@/path" }` ' +
    '(named import, key = export name); object entries are carried over ' +
    'unchanged (from/description/default preserved). Bails with a clear ' +
    'migrate-manually error when the config cannot be statically analyzed or ' +
    'when merging would be unsafe.',
  codemodType: 'config',
};

const MANUAL =
  'migrate layout.components to experimental.xle.components manually';

/**
 * @param {{source: string, path: string}} file
 * @param {{jscodeshift: Function}} api
 * @returns {string|null}
 */
/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  const defaultExports = root.find(j.ExportDefaultDeclaration);
  if (defaultExports.size() === 0) {
    throw new Error(
      `could not statically analyze astryx config (no default export); ${MANUAL}`,
    );
  }

  const declaration = defaultExports.paths()[0].node.declaration;

  // Resolve the config object literal from any supported form:
  //   export default { ... }
  //   export default createConfig({ ... })
  //   const config = { ... } | createConfig({ ... }); export default config;
  const configObject = resolveConfigObject(
    j,
    j.Identifier.check(declaration)
      ? findTopLevelConstInit(j, root, declaration)
      : declaration,
  );
  if (!configObject) {
    throw new Error(
      `could not statically analyze astryx config; ${MANUAL}`,
    );
  }

  // Locate the top-level `layout` property and its `components` value.
  const layoutProp = findObjectProperty(j, configObject, 'layout');
  if (!layoutProp) {
    return null; // no layout → nothing to migrate
  }
  if (!j.ObjectExpression.check(layoutProp.value)) {
    throw new Error(
      `astryx config \`layout\` is not an object literal; ${MANUAL}`,
    );
  }

  const componentsProp = findObjectProperty(j, layoutProp.value, 'components');
  if (!componentsProp) {
    return null; // no layout.components → nothing to migrate
  }
  if (!j.ObjectExpression.check(componentsProp.value)) {
    throw new Error(
      `astryx config \`layout.components\` is not an object literal; ${MANUAL}`,
    );
  }

  // `components` was the only documented `layout` key. Anything else is
  // unexpected and we cannot safely guess intent.
  const otherLayoutKeys = layoutProp.value.properties.filter(
    (/** @type {any} */ p) => p !== componentsProp,
  );
  if (otherLayoutKeys.length > 0) {
    throw new Error(
      `astryx config \`layout\` has keys other than \`components\`; ${MANUAL}`,
    );
  }

  // Build the migrated `components` object literal entry by entry.
  const migratedComponents = buildMigratedComponents(j, componentsProp.value);

  // Placement into `experimental.xle.components`.
  const experimentalProp = findObjectProperty(j, configObject, 'experimental');
  if (experimentalProp) {
    if (!j.ObjectExpression.check(experimentalProp.value)) {
      throw new Error(
        `astryx config \`experimental\` is not an object literal; ${MANUAL}`,
      );
    }
    const xleProp = findObjectProperty(j, experimentalProp.value, 'xle');
    if (xleProp) {
      // Can't safely merge into a pre-existing experimental.xle.
      throw new Error(
        `astryx config already defines \`experimental.xle\`; ${MANUAL}`,
      );
    }
    experimentalProp.value.properties.push(
      j.objectProperty(j.identifier('xle'), buildXleObject(j, migratedComponents)),
    );
  } else {
    configObject.properties.push(
      j.objectProperty(
        j.identifier('experimental'),
        j.objectExpression([
          j.objectProperty(j.identifier('xle'), buildXleObject(j, migratedComponents)),
        ]),
      ),
    );
  }

  // Remove the migrated data from `layout`. Since `components` was the only
  // key (asserted above), remove the entire `layout` property.
  configObject.properties = configObject.properties.filter(
    (/** @type {any} */ p) => p !== layoutProp,
  );

  return root.toSource();
}

/**
 * Resolve the wrapped config object literal from a default-export declaration.
 * Handles `{ ... }` and `createConfig({ ... })`.
 * @returns {any} the ObjectExpression node, or null if not analyzable
 */
function resolveConfigObject(/** @type {any} */ j, /** @type {any} */ declaration) {
  if (!declaration) return null;
  if (j.ObjectExpression.check(declaration)) {
    return declaration;
  }
  if (
    j.CallExpression.check(declaration) &&
    declaration.arguments.length >= 1 &&
    j.ObjectExpression.check(declaration.arguments[0])
  ) {
    return declaration.arguments[0];
  }
  return null;
}

/**
 * Find the initializer of the top-level, non-exported `const <name> = <init>`
 * declaration that the default-exported identifier refers to. `let`/`var`
 * bindings can be reassigned, so they are not treated as statically
 * analyzable. Neither is a binding exported any other way (`export const`,
 * `export { name }`, `export { name as other }`), since another module could
 * import and mutate it, nor one referenced anywhere besides its declaration
 * and the default export: a member write, an alias or a call argument could
 * change the object after its initializer. A named export specifier is such a
 * reference, so `hasOtherReference` rejects it.
 * @returns {any} the initializer node, or null if there is no such binding
 */
function findTopLevelConstInit(/** @type {any} */ j, /** @type {any} */ root, /** @type {any} */ exported) {
  const name = exported.name;
  for (const statement of root.get().node.program.body) {
    // `export const` is skipped on purpose: another module can import the
    // binding and mutate the object.
    if (
      !j.VariableDeclaration.check(statement) ||
      statement.kind !== 'const'
    ) {
      continue;
    }
    for (const declarator of statement.declarations) {
      if (
        j.VariableDeclarator.check(declarator) &&
        j.Identifier.check(declarator.id) &&
        declarator.id.name === name
      ) {
        return hasOtherReference(j, root, name, [declarator.id, exported])
          ? null
          : declarator.init ?? null;
      }
    }
  }
  return null;
}

/**
 * Whether any identifier named `name`, other than the `allowed` nodes, could
 * refer to the binding. Non-computed member properties (`x.name`) and object
 * keys (`{ name: 1 }`) name a property, not the binding, so they don't count;
 * every other occurrence (including a shadowing one) does.
 * @returns {boolean}
 */
function hasOtherReference(/** @type {any} */ j, /** @type {any} */ root, /** @type {string} */ name, /** @type {any[]} */ allowed) {
  return root
    .find(j.Identifier, {name})
    .some((/** @type {any} */ path) => {
      const node = path.node;
      if (allowed.includes(node)) return false;
      const parent = path.parent?.node;
      if (
        (j.MemberExpression.check(parent) ||
          j.OptionalMemberExpression.check(parent)) &&
        parent.property === node &&
        !parent.computed
      ) {
        return false;
      }
      if (
        (j.ObjectProperty.check(parent) || j.Property.check(parent)) &&
        parent.key === node &&
        !parent.computed &&
        !parent.shorthand
      ) {
        return false;
      }
      return true;
    });
}

/**
 * Find a (non-computed, non-spread) property on an object literal by key name.
 * Supports Identifier and string-literal keys.
 * @returns {any} the property node
 */
function findObjectProperty(/** @type {any} */ j, /** @type {any} */ objectExpression, /** @type {any} */ name) {
  return objectExpression.properties.find((/** @type {any} */ prop) => {
    if (
      !j.ObjectProperty.check(prop) &&
      !j.Property.check(prop)
    ) {
      return false;
    }
    if (prop.computed) return false;
    const key = prop.key;
    if (j.Identifier.check(key)) return key.name === name;
    if (j.StringLiteral.check(key)) return key.value === name;
    if (j.Literal.check(key)) return key.value === name;
    return false;
  });
}

/**
 * Build the migrated `components` ObjectExpression from the old one.
 * @returns {object} ObjectExpression
 */
function buildMigratedComponents(/** @type {any} */ j, /** @type {any} */ oldComponents) {
  const newProps = oldComponents.properties.map((/** @type {any} */ prop) => {
    if (
      (!j.ObjectProperty.check(prop) && !j.Property.check(prop)) ||
      prop.computed
    ) {
      throw new Error(
        `astryx config \`layout.components\` has a non-literal entry; ${MANUAL}`,
      );
    }

    const value = prop.value;

    // string `'X'` → `{ from: 'X' }`
    if (j.StringLiteral.check(value) || (j.Literal.check(value) && typeof value.value === 'string')) {
      return j.objectProperty(
        cloneKey(j, prop.key),
        j.objectExpression([
          j.objectProperty(j.identifier('from'), cloneStringLiteral(j, value)),
        ]),
      );
    }

    // object `{ from, description?, default? }` → carried over UNCHANGED
    if (j.ObjectExpression.check(value)) {
      return j.objectProperty(cloneKey(j, prop.key), value);
    }

    // anything else (identifier, call, ternary, etc.) → cannot safely migrate
    throw new Error(
      `astryx config \`layout.components\` entry is neither a string nor an ` +
        `object literal and cannot be safely migrated; ${MANUAL}`,
    );
  });

  return j.objectExpression(newProps);
}

/** Build `{ components: <obj> }` for `experimental.xle`. */
function buildXleObject(/** @type {any} */ j, /** @type {any} */ migratedComponents) {
  return j.objectExpression([
    j.objectProperty(j.identifier('components'), migratedComponents),
  ]);
}

/** Clone a property key node so we don't reuse a node across the tree. */
function cloneKey(/** @type {any} */ j, /** @type {any} */ key) {
  if (j.Identifier.check(key)) return j.identifier(key.name);
  if (j.StringLiteral.check(key)) return j.stringLiteral(key.value);
  if (j.Literal.check(key)) return j.literal(key.value);
  return key;
}

/** Build a fresh string literal preserving the original raw quoting if possible. */
function cloneStringLiteral(/** @type {any} */ j, /** @type {any} */ value) {
  if (j.StringLiteral.check(value)) return j.stringLiteral(value.value);
  return j.literal(value.value);
}
