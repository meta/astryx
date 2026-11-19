// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: Remove TabList orientation prop
 * @see https://github.com/meta/astryx/issues/4231
 *
 * As of v0.2.0, TabList no longer accepts an `orientation` prop. The prop
 * was misleading: it only drove the keyboard-hint badge, not a real vertical
 * layout. Arrow-key navigation already accepted both horizontal and vertical
 * axes unconditionally (orientation: 'both' in useListFocus), so passing
 * orientation="vertical" had no meaningful effect. Removing it prevents
 * consumers from assuming a vertical tab-strip layout exists when it does not.
 *
 * Migration: simply delete every `orientation` attribute on <TabList>.
 * No behavior changes. The hint badge defaults to horizontal arrows, which
 * matches what the navigation has always done.
 */

export const meta = {
  title: 'Remove TabList orientation prop (misleading no-op)',
  description:
    'The `orientation` prop is removed from TabList in v0.2.0. It did not ' +
    'produce a vertical tab strip; it only changed the keyboard-hint arrow ' +
    'badge. Arrow navigation already accepted both axes regardless. This ' +
    'codemod strips the prop from all <TabList> usages. No behavior change.',
  pr: '#4231',
};

/** Import sources that provide the Astryx TabList component. */
const IMPORT_SOURCES = new Set([
  '@astryxdesign/core',
  '@astryxdesign/core/TabList',
  '@xds/core',
  '@xds/core/TabList',
]);

/** Component names that had the orientation prop. */
const TARGET_IMPORTED_NAMES = new Set(['TabList']);

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let hasChanges = false;

  // Track alias-aware local names for the target components.
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

  // Remove every `orientation` JSX attribute from target component elements.
  root.find(j.JSXOpeningElement).forEach((/** @type {any} */ path) => {
    const name = path.node.name;
    const componentName = name.type === 'JSXIdentifier' ? name.name : null;
    if (!componentName || !targetLocals.has(componentName)) return;

    const before = path.node.attributes.length;
    path.node.attributes = path.node.attributes.filter(
      (/** @type {any} */ attr) =>
        !(attr.type === 'JSXAttribute' && attr.name?.name === 'orientation'),
    );
    if (path.node.attributes.length !== before) {
      hasChanges = true;
    }
  });

  if (!hasChanges) return undefined;
  return root.toSource({quote: 'single'});
}
