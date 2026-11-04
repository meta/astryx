// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file selectable-card.ts
 * @input SelectableCard's internal input context, the Field input styling
 *   rule and the aria id joiner
 * @output `@astryxdesign/core/internal/selectable-card`:
 *   SelectableCardInputContext, useFieldInputStyling and joinAriaIDs,
 *   re-exported by name
 *   for Lab's SelectableCardGroup
 * @position An internal entry reserved for Astryx's own packages:
 *   undocumented, outside the public API and its compatibility promise,
 *   versioned in lockstep with Core, and allowed only in Core and Lab by the
 *   `@astryx/no-core-internal-import` lint rule. Core components import the
 *   same modules by relative path. Named re-exports only.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {SelectableCardInputContext} from '../SelectableCard/selectableCardInput';
export type {SelectableCardInput} from '../SelectableCard/selectableCardInput';
export {useFieldInputStyling} from '../Field/fieldParts';
export {joinAriaIDs} from '../utils/inputAria';
