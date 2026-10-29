// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenizer-presentation.ts
 * @input Tokenizer's sheet-capable signature
 * @output `@astryxdesign/core/internal/tokenizer-presentation`: the Tokenizer
 *   with its `presentation` options reachable, for Astryx's own packages
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise
 *   (spec:AST-017 FR21), versioned in lockstep with Core, and allowed only in
 *   Core and Lab by the `@astryx/no-core-internal-import` lint rule
 *   (architecture:react-component-runtime INV13). The sheet presentation is
 *   implemented but not yet exposed: the public `TokenizerProps` offers no
 *   `experimental.presentation` while its user experience is being finished
 *   (`component:Tokenizer` DEC-3, implementation gap), and every public field
 *   renders the popover presentation. Named re-exports only.
 *
 * SYNC: When modified, update tokenizer-presentation.test.ts and
 * scripts/sync-exports.js.
 */
export {TokenizerWithPresentation} from '../Tokenizer/Tokenizer';
export type {
  TokenizerPresentationOptions,
  TokenizerWithPresentationProps,
} from '../Tokenizer/Tokenizer';
