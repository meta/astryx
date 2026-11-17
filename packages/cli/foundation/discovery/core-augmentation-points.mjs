// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The interfaces a Core declares for themes to widen by declaration
 *   merging (`interface ButtonVariantMap`), and the prop axes they widen.
 * @input  a Core package root, a public subpath name, a prop name
 * @output the subpath's declarations, whether it declares an interface, and
 *   the interface that widens a component prop's values
 * @position Read by theme build (api/theme/build/build.mjs), which augments
 *   these interfaces, and by render (api/render/_adapter.mjs), which does not
 *   check a prop whose values a theme can widen.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** @type {Map<string, string>} */
const declarationCache = new Map();

/**
 * The type declarations `@astryxdesign/core/<pascalName>` exposes: the shipped
 * `dist/<pascalName>/index.d.ts` (what a consumer's TypeScript sees), else the
 * `src/<pascalName>/index.ts` of a source checkout. With `includeTypes`, the
 * subpath's `types` file is read too. Returns '' when nothing is found.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {string}
 */
export function readComponentDeclarations(coreRoot, pascalName, options = {}) {
  const includeTypes = options.includeTypes === true;
  const cacheKey = `${coreRoot}:${pascalName}:${includeTypes ? 'with-types' : 'index-only'}`;
  const cached = declarationCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let contents = '';
  if (coreRoot) {
    const candidateSets = [
      [path.join(coreRoot, 'dist', pascalName, 'index.d.ts')],
      [path.join(coreRoot, 'src', pascalName, 'index.ts')],
    ];
    if (includeTypes) {
      candidateSets[0].push(
        path.join(coreRoot, 'dist', pascalName, 'types.d.ts'),
      );
      candidateSets[1].push(path.join(coreRoot, 'src', pascalName, 'types.ts'));
    }
    for (const files of candidateSets) {
      if (!fs.existsSync(files[0])) continue;
      for (const file of files) {
        try {
          if (fs.existsSync(file))
            contents += fs.readFileSync(file, 'utf-8') + '\n';
        } catch {
          // An unreadable file adds nothing.
        }
      }
      if (contents) break;
    }
  }
  declarationCache.set(cacheKey, contents);
  return contents;
}

/**
 * Whether `@astryxdesign/core/<pascalName>` declares the interface
 * `interfaceName`, which module augmentation can widen. A closed literal union
 * (`ButtonSize`) is not an extension point. A type re-export does not count:
 * augmentation widens only the module that declares the interface, so
 * augmenting a barrel that re-exports it makes a dead sibling interface.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} interfaceName
 * @param {{includeTypes?: boolean}} [options]
 * @returns {boolean}
 */
export function componentHasAugmentableInterface(
  coreRoot,
  pascalName,
  interfaceName,
  options,
) {
  const declarations = readComponentDeclarations(coreRoot, pascalName, options);
  if (!declarations) return false;
  return new RegExp(String.raw`\binterface\s+${interfaceName}\b`).test(
    declarations,
  );
}

/**
 * Extension points whose public module and interface do not follow the usual
 * `<Component><Prop>Map` convention, keyed `<Component>.<prop>`. TextType
 * reads CustomTextTypes from the theme module.
 * @type {Record<string, {moduleName: string, interfaceName: string, includeTypes?: boolean}>}
 */
export const AUGMENTATION_OVERRIDES = {
  'Text.type': {
    moduleName: 'theme',
    interfaceName: 'CustomTextTypes',
    includeTypes: true,
  },
};

/**
 * The convention-breaking extension point of `<pascalName prop>` when the
 * Core declares it, as `{moduleName, interfaceName}`; null when the prop has
 * no such entry or the Core does not declare it.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{moduleName: string, interfaceName: string} | null}
 */
export function overrideAugmentationPoint(coreRoot, pascalName, prop) {
  const override = Object.hasOwn(
    AUGMENTATION_OVERRIDES,
    `${pascalName}.${prop}`,
  )
    ? AUGMENTATION_OVERRIDES[`${pascalName}.${prop}`]
    : null;
  if (!override) return null;
  return componentHasAugmentableInterface(
    coreRoot,
    override.moduleName,
    override.interfaceName,
    {
      includeTypes: override.includeTypes,
    },
  )
    ? {moduleName: override.moduleName, interfaceName: override.interfaceName}
    : null;
}

/**
 * The interface a theme widens to add values to component `pascalName`'s prop
 * `prop`, when the Core declares one: the convention-breaking entry of
 * {@link AUGMENTATION_OVERRIDES}, else `<Component><Prop>Map` in the
 * component's own subpath. Null when the prop's values are closed.
 * @param {string | null} coreRoot the Core package root
 * @param {string} pascalName
 * @param {string} prop
 * @returns {{moduleName: string, interfaceName: string} | null}
 */
export function propAugmentationPoint(coreRoot, pascalName, prop) {
  if (Object.hasOwn(AUGMENTATION_OVERRIDES, `${pascalName}.${prop}`)) {
    return overrideAugmentationPoint(coreRoot, pascalName, prop);
  }
  const interfaceName = `${pascalName}${prop.charAt(0).toUpperCase()}${prop.slice(1)}Map`;
  return componentHasAugmentableInterface(coreRoot, pascalName, interfaceName)
    ? {moduleName: pascalName, interfaceName}
    : null;
}
