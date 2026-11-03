// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file claimFocusMoves.ts
 * @input A document, and a caller's pick of the focus moves it claims
 * @output claimFocusMoves
 * @position Shared by BottomSheet/useMobileKeyboard.ts and Lab's SearchField
 *   (through internal/touch.ts), which keep the browser from revealing a
 *   field by panning the page
 *
 * SYNC: When modified, update claimFocusMoves.test.ts.
 */

/**
 * Claims each focus move whose destination `pick` returns, before the
 * browser's own focus step. The move's `blur` comes in the capture phase
 * ahead of that step and names the destination in `relatedTarget`. Focusing
 * the destination there with preventScroll leaves the step nothing to
 * reveal. `pick` returns null to leave a move to the browser. Returns the
 * unsubscribe.
 */
export function claimFocusMoves(
  doc: Document,
  pick: (event: FocusEvent) => HTMLElement | null,
): () => void {
  const onBlur = (event: FocusEvent) => {
    const destination = pick(event);
    if (destination != null && destination !== doc.activeElement) {
      destination.focus({preventScroll: true});
    }
  };
  // `blur` does not bubble: only the capture phase hears every move.
  doc.addEventListener('blur', onBlur, true);
  return () => doc.removeEventListener('blur', onBlur, true);
}
