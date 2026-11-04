// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file activationGuard.ts
 * @input Row render props, row element and event target
 * @output Private handler finalization and native-control/label/disclosure boundaries
 * @position Private activation/parent seam; reuses the canonical interactive catalog
 */
import {isLayerSurface} from '../../../Layer/layerSurfacePress';
import {
  innermostInteractive,
  INTERACTIVE_SELECTORS,
} from '../../../hooks/useClickableContainer';

export {
  withRowActivationFinalizer,
  finalizeRowActivation,
} from '../../tableRowActivation';

export function isRowActivationGesture(
  row: HTMLTableRowElement,
  target: EventTarget | null,
): boolean {
  const view = row.ownerDocument.defaultView;
  if (!view || !(target instanceof view.Node) || !row.contains(target)) {
    return false;
  }
  const element =
    target instanceof view.Element ? target : target.parentElement;
  if (
    !element ||
    (element instanceof view.HTMLElement && element.isContentEditable)
  ) {
    return false;
  }
  // Activation also yields to readonly controls and native label/disclosure
  // boundaries; the shared container predicate deliberately permits readonly.
  if (
    innermostInteractive(element, row, ancestor => {
      const editable = ancestor.getAttribute('contenteditable')?.toLowerCase();
      return (
        ancestor.matches(INTERACTIVE_SELECTORS) ||
        isLayerSurface(ancestor) ||
        ancestor.localName === 'tr' ||
        ancestor.localName === 'summary' ||
        (ancestor instanceof view.HTMLLabelElement &&
          ancestor.control !== null) ||
        editable === '' ||
        editable === 'true' ||
        editable === 'plaintext-only'
      );
    }) !== null
  ) {
    return false;
  }
  return true;
}
