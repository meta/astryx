// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tour.ts
 * @input Core's popover hook, and its layer, focus-order and DOM helpers
 * @output `@astryxdesign/core/internal/tour`: named re-exports for Lab's Tour
 * @position An internal entry for Astryx's own packages. It is outside the
 *   public API and its compatibility promise, and the
 *   `@astryx/no-core-internal-import` lint rule allows it only in Core and
 *   Lab. Core components import the same modules by relative path.
 *
 * SYNC: When modified, update scripts/sync-exports.js.
 */
export {usePopoverInternal} from '../Popover/usePopover';
export {layerClickBoundary} from '../Layer/layerClickBoundary';
export {getActiveModalOutlet} from '../Layer/modalOutlet';
export {
  getFocusableElements,
  readsPopoverSource,
} from '../hooks/focusableSelector';
export {focusRegionAround, precedes} from '../hooks/useFocusTrap';
export {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
export {matchesMediaQuery} from '../utils/coarsePointer';
export {containsAlongFlatTree, deepActiveElement} from '../utils/flatTree';
export {takesFocusAsIs} from '../utils/focusReturn';
export {
  isHTMLElement,
  isModalDialog,
  isShownAsPopover,
} from '../utils/nodeType';
