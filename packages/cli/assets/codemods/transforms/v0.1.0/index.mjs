// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file v0.1.0 transform manifest
 *
 * Lists all codemods for the v0.1.0 release in the order they should run.
 */

import dropXdsPrefixImports, {
  meta as dropXdsPrefixImportsMeta,
} from './drop-xds-prefix-imports.mjs';

import migrateXdsModuleSpecifiers, {
  meta as migrateXdsModuleSpecifiersMeta,
} from './migrate-xds-module-specifiers.mjs';

import migrateXdsDeclareModule, {
  meta as migrateXdsDeclareModuleMeta,
} from './migrate-xds-declare-module.mjs';

import migrateXdsCssSurfaces, {
  meta as migrateXdsCssSurfacesMeta,
} from './migrate-xds-css-surfaces.mjs';

export default [
  {
    // XDS-prefix migration. Mandatory in v0.1.0: the release
    // dropped the prefixed compatibility aliases (useXDSTheme, XDSButton,
    // XDSIconRegistry, ...), so consumers upgrading from 0.0.x MUST rewrite
    // prefixed imports to their bare names.
    //
    // Ordered BEFORE migrate-xds-module-specifiers so it sees `@xds/core`
    // imports (its source matcher) and un-prefixes the identifiers first;
    // the specifier codemod then rewrites the paths to `@astryxdesign/core`.
    // The runner preserves this array order (see runner.mjs).
    name: 'drop-xds-prefix-imports',
    transform: dropXdsPrefixImports,
    meta: dropXdsPrefixImportsMeta,
  },
  {
    name: 'migrate-xds-module-specifiers',
    transform: migrateXdsModuleSpecifiers,
    meta: migrateXdsModuleSpecifiersMeta,
  },
  {
    // Cleans up TypeScript `declare module "@xds/core/..."` augmentations,
    // which reference the package by string specifier and so are dead after
    // the scope rename. Mandatory in v0.1.0. Ordered AFTER the specifier
    // codemod: it uses the same @xds -> @astryxdesign mapping and repairs an
    // adjacent surface the specifier codemod does not visit (module-decl ids
    // are not import/export/require sources).
    name: 'migrate-xds-declare-module',
    transform: migrateXdsDeclareModule,
    meta: migrateXdsDeclareModuleMeta,
  },
  {
    // Rewrites consumer CSS surfaces broken by the v0.1.0 DOM-namespace rename
    // (core no longer dual-emits `xds-*`): the `.xds-*` class-selector prefix,
    // `[data-xds-*]` attribute selectors, and `@layer xds-*` layer names all
    // become their `astryx-*` forms. Mandatory in v0.1.0.
    name: 'migrate-xds-css-surfaces',
    transform: migrateXdsCssSurfaces,
    meta: migrateXdsCssSurfacesMeta,
  },
];
