// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file touch-sheet.ts
 * @input The touch sheets' shared confirmation, search-drag dismissal and
 *   draft rules
 * @output `@astryxdesign/core/internal/touch-sheet`: SheetConfirmation,
 *   useDismissSearchOnTouchDrag, hasSameSelection and nameSheetDraftChange,
 *   re-exported by name for Lab's sheets
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   same modules by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {SheetConfirmation} from './SheetConfirmation';
export type {SheetConfirmationProps} from './SheetConfirmation';
export {useDismissSearchOnTouchDrag} from './useDismissSearchOnTouchDrag';
export {hasSameSelection, nameSheetDraftChange} from './sheetDraft';
export type {SheetDraftChange} from './sheetDraft';
