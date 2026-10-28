// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file dialog-context.ts
 * @input Dialog's internal context hook
 * @output `@astryxdesign/core/internal/dialog-context`: `useDialogContext`,
 *   for Astryx's own packages
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise
 *   (spec:AST-017 FR21), versioned in lockstep with Core, and allowed only in
 *   Core and Lab by the `@astryx/no-core-internal-import` lint rule
 *   (architecture:react-component-runtime INV13). Lab's DialogHeroHeader reads
 *   the Dialog's title id and inline state through it, so it names the dialog
 *   and requests title focus the way DialogHeader does. Named re-exports only.
 *
 * SYNC: When modified, update dialog-context.test.ts and
 * scripts/sync-exports.js.
 */
export {useDialogContext} from '../Dialog/DialogContext';
