// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Codemod: move isImeKeyEvent imports to the server-safe utilities path
 */

export const meta = {
  title: 'Move isImeKeyEvent imports to core utilities',
  description:
    'Moves `isImeKeyEvent` from the deprecated client-only hooks barrel to ' +
    'the canonical `@astryxdesign/core/utils` path.',
};

const SOURCE_MAP = new Map([
  ['@astryxdesign/core/hooks', '@astryxdesign/core/utils'],
  ['@xds/core/hooks', '@xds/core/utils'],
]);

/**
 * @param {import('../../../../authoring/codemod/type').AstryxCodemodFile} file
 * @param {import('../../../../authoring/codemod/type').CodemodTransformApi} api
 * @returns {string | null | undefined}
 */
export default function transformer(file, api) {
  if (!file.source.includes('isImeKeyEvent')) return undefined;

  const j = api.jscodeshift;
  const root = j(file.source);
  /** @type {Map<string, string[]>} */
  const moved = new Map();
  /** @type {any[]} */
  const emptiedHooksImports = [];
  let changed = false;

  root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
    const target = SOURCE_MAP.get(path.node.source.value);
    if (!target) return;

    /** @type {any[]} */
    const retained = [];
    let movedFromThisDeclaration = false;
    for (const specifier of path.node.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported?.name === 'isImeKeyEvent'
      ) {
        const locals = moved.get(target) ?? [];
        locals.push(specifier.local?.name ?? 'isImeKeyEvent');
        moved.set(target, locals);
        movedFromThisDeclaration = true;
        changed = true;
      } else {
        retained.push(specifier);
      }
    }
    path.node.specifiers = retained;
    if (movedFromThisDeclaration && retained.length === 0) {
      emptiedHooksImports.push(path);
    }
  });

  if (!changed) return undefined;

  // Remove only hooks imports emptied by the migration. Unrelated side-effect
  // imports also have zero specifiers and must remain untouched.
  for (const path of emptiedHooksImports) j(path).remove();

  for (const [target, localNames] of moved) {
    /** @type {any} */
    let existing = null;
    root.find(j.ImportDeclaration).forEach((/** @type {any} */ path) => {
      if (path.node.source.value !== target || existing != null) return;
      const specifiers = path.node.specifiers ?? [];
      const hasNamespace = specifiers.some(
        (/** @type {any} */ specifier) =>
          specifier.type === 'ImportNamespaceSpecifier',
      );
      // A value specifier cannot be appended to `import type`, and named
      // imports cannot share a declaration with a namespace import.
      if (path.node.importKind !== 'type' && !hasNamespace) existing = path;
    });

    const specifiers = [...new Set(localNames)].map(localName =>
      j.importSpecifier(
        j.identifier('isImeKeyEvent'),
        localName === 'isImeKeyEvent' ? null : j.identifier(localName),
      ),
    );

    if (existing) {
      const presentLocals = new Set(
        (existing.node.specifiers ?? [])
          .filter(
            (/** @type {any} */ specifier) =>
              specifier.type === 'ImportSpecifier',
          )
          .map(
            (/** @type {any} */ specifier) =>
              specifier.local?.name ?? specifier.imported?.name,
          ),
      );
      for (const specifier of specifiers) {
        const local = specifier.local?.name ?? specifier.imported.name;
        if (!presentLocals.has(local)) existing.node.specifiers.push(specifier);
      }
    } else {
      const declaration = j.importDeclaration(
        specifiers,
        j.stringLiteral(target),
      );
      root.get().node.program.body.unshift(declaration);
    }
  }

  return root.toSource({quote: 'single'});
}
