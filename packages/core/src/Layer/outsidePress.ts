// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file outsidePress.ts
 * @input Listens for pointerdown, pointerup and pointercancel on a document
 * @output Exports watchOutsidePress
 * @position Internal to Layer; the outside-press dismissal for a manual
 *   popover whose owner decides what counts as inside (a combobox's field
 *   and its list). Not exported from the package.
 *
 * A press closes the layer only when it starts and ends outside, as native
 * light dismiss does: a pointerdown outside is remembered, the pointerup that
 * follows closes the layer if it is outside too, and a pointercancel (the
 * browser took the gesture for a scroll or a pinch) forgets it. Inside is
 * judged on the event's composed path, so a field or list inside a shadow
 * root, which the document sees as its shadow host, is still inside.
 */

/**
 * Watch the owner's document for a press outside, until the returned function
 * is called. The caller stops it when its layer hides and when it unmounts.
 *
 * @param owner - The element that owns the layer (the field); its document is
 *   watched.
 * @param isInside - Whether a press with this composed path is inside.
 * @param onOutside - Called once for each press that starts and ends outside.
 * @returns Stops watching.
 */
export function watchOutsidePress(
  owner: Element,
  isInside: (path: ReadonlyArray<EventTarget>) => boolean,
  onOutside: () => void,
): () => void {
  const doc = owner.ownerDocument;
  let startedOutside = false;

  // Capture phase, so a press whose target stops propagation is still seen.
  const handleDown = (event: PointerEvent) => {
    startedOutside = !isInside(event.composedPath());
  };
  const handleUp = (event: PointerEvent) => {
    const wasOutside = startedOutside;
    startedOutside = false;
    if (wasOutside && !isInside(event.composedPath())) {
      onOutside();
    }
  };
  const handleCancel = () => {
    startedOutside = false;
  };

  doc.addEventListener('pointerdown', handleDown, true);
  doc.addEventListener('pointerup', handleUp, true);
  doc.addEventListener('pointercancel', handleCancel, true);
  return () => {
    doc.removeEventListener('pointerdown', handleDown, true);
    doc.removeEventListener('pointerup', handleUp, true);
    doc.removeEventListener('pointercancel', handleCancel, true);
  };
}
