// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ModalAnnounceProvider.tsx
 * @input Uses React context, effects and the exposure and delivery
 *   internals of useAnnounce
 * @output Exports ModalAnnounceProvider, the element every Astryx component
 *   that owns a native <dialog> renders around its content
 * @position Core a11y internal (spec:AST-086 FR14). Its own module so only
 *   the modals' bundles carry it: a component that calls useAnnounce but
 *   renders no modal does not load the provider.
 *
 * SYNC: not exported from /packages/core/src/hooks/index.ts.
 */

import {
  use,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  forgetPresented,
  handOffUnexposed,
  isExposed,
  notePresented,
  releaseAllHeld,
} from './modalAnnounce';
import {ModalAnnounceContext, type ModalAnnounceScope} from './useAnnounce';
import {useIsomorphicLayoutEffect} from './useIsomorphicLayoutEffect';

/**
 * Rendered by every Astryx component that owns a native `<dialog>` (Dialog,
 * BottomSheet, Drawer, Lightbox; CommandPalette through Dialog), around the
 * dialog's content, so `useAnnounce` beneath it routes into that dialog while
 * it is open as a modal. The provider watches the dialog's `open`, `inert`
 * and `aria-hidden` attributes: when the dialog stops being exposed, any
 * message its containers hold that assistive technology has not had yet is
 * handed to the channel exposed then — the modal on top, or the shared
 * channel — and the same happens when the provider unmounts with the dialog
 * still open. A dialog closed and shown again in one task is exposed again
 * by the time the change is seen, so its words stay (a hand-over, not a
 * close).
 *
 * Internal: imported by path inside the package; not exported from the hooks
 * barrel or the package entry.
 */
export function ModalAnnounceProvider({
  dialogRef,
  isOpen,
  children,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /**
   * The owner's intent for this render: open as a modal (or presented as a
   * modal step). A non-modal surface — a scrimless Drawer shown with
   * `showPopover()`, a scrimless sheet — passes `false`: it is not an FR14
   * modal, and callers inside it route as the page does.
   */
  isOpen: boolean;
  children: ReactNode;
}): ReactNode {
  const parent = use(ModalAnnounceContext);
  const scope = useMemo<ModalAnnounceScope>(
    () => ({dialogRef, isOpen: false, parent}),
    [dialogRef, parent],
  );
  // The intent is read at call time, not rendered: the scope keeps its
  // identity across opens and closes, so `useAnnounce`'s function does too.
  // A layout effect runs before any content's passive effect, so a message
  // announced from a mount effect in the opening commit sees the intent.
  useIsomorphicLayoutEffect(() => {
    scope.isOpen = isOpen;
  }, [scope, isOpen]);
  // The presentation watch is a session: it starts when the owner intends
  // the dialog open (or finds it already open), follows `open`, `inert` and
  // `aria-hidden` through the exit, and ends once the dialog has really
  // closed, or when the provider unmounts. A closed dialog at rest — a
  // preloaded sheet, a Drawer never shown — holds no observer
  // (`architecture:react-component-runtime` INV5).
  const sessionRef = useRef<{
    dialog: HTMLDialogElement;
    stop: () => void;
  } | null>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog == null || sessionRef.current != null) {
      return;
    }
    if (!isOpen && !dialog.open) {
      return;
    }
    notePresented(dialog);
    let wasOpen = dialog.open;
    const end = () => {
      presentation.disconnect();
      forgetPresented(dialog);
      sessionRef.current = null;
    };
    const stop = () => presentation.disconnect();
    const onPresentationChange = () => {
      // The order is the top-layer order: only `open` being set moves a
      // dialog up it. A dialog turning inert or aria-hidden for its exit
      // keeps its place, so the step the person went back to stays on top.
      if (dialog.open !== wasOpen) {
        wasOpen = dialog.open;
        notePresented(dialog);
      }
      if (!isExposed(dialog)) {
        handOffUnexposed(dialog);
      }
      // Closed for real, or exposed again after an exit that was called
      // off: whatever waited for this moment — held by this dialog, or by
      // one this dialog was covering — goes out.
      if (!dialog.open || isExposed(dialog)) {
        releaseAllHeld();
      }
      // Closed for real: the session is over until the next open intent. A
      // dialog closed and shown again in one task is open again by the time
      // the change is seen, so its session goes on.
      if (!dialog.open) {
        end();
      }
    };
    const presentation = new MutationObserver(onPresentationChange);
    presentation.observe(dialog, {
      attributes: true,
      attributeFilter: ['open', 'inert', 'aria-hidden'],
    });
    sessionRef.current = {dialog, stop};
  }, [dialogRef, isOpen]);
  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session == null) {
        return;
      }
      sessionRef.current = null;
      session.stop();
      // Unmounted while open: no close event, no attribute change — the
      // words would otherwise stay in a detached container. Handed off
      // before this dialog leaves the order, so the next channel is found
      // from where it stood.
      handOffUnexposed(session.dialog);
      forgetPresented(session.dialog);
      releaseAllHeld();
    },
    [],
  );
  return <ModalAnnounceContext value={scope}>{children}</ModalAnnounceContext>;
}
