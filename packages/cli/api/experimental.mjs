// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `@astryxdesign/cli/api/experimental`: the CLI's experimental
 * functions (spec:AST-017 FR21, FR27). Nothing here is part of the stable
 * `@astryxdesign/cli/api`; each function and type may change or be removed in
 * a patch release.
 *
 * @position api — the experimental entry beside api/index.mjs
 */

export {render} from './render/render.mjs';
export {
  themeEditNew,
  themeEditSet,
  themeEditShow,
  themeEditUndo,
  themeEditPreviewAdd,
  themeEditPreviewApp,
  themeEditPreviewList,
  themeEditPreviewRemove,
  themeEditHow,
} from './theme-edit/theme-edit.mjs';

// Types (runtime no-ops; tsc carries them into api/experimental.d.mts).
export * from './render/render.type.mjs';
export * from './theme-edit/theme-edit.type.mjs';
