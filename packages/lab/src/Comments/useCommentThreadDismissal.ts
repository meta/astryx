// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useCommentThreadDismissal.ts
 * @input Uses React, the shared layer dismissal stack (useLayerDismissal), the
 *   theme's motion and spacing tokens, the translator, and the Comments
 *   controller's reply and edit drafts
 * @output Exports useCommentThreadDismissal, unsavedDraftOf, and their types
 * @position Light dismissal for a CommentThread whose host passes `onDismiss`.
 *   A press outside the thread and an Escape no nested layer claimed both
 *   request dismissal; while the thread holds an unsaved draft, the first
 *   request shakes the thread, returns focus to the draft, and announces
 *   instead, and the next consecutive one dismisses.
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/lab/src/Comments/CommentThread.tsx
 * - /packages/lab/src/Comments/CommentThread.doc.mjs
 * - /packages/lab/src/Comments/CommentThread.test.tsx
 * - /packages/core/locales/en.json (@astryx.comments.unsavedDraft)
 *
 * ## Why the thread owns the outside press
 *
 * A host surface with native light dismiss (`popover="auto"`) closes before
 * script can veto it, so nothing can keep it open for a draft. The host turns
 * its own light and Escape dismissal off and hands the decision to the thread
 * through `onDismiss`.
 *
 * ## Inside versus outside
 *
 * React synthetic events bubble through portals, so the thread root's
 * pointer-down capture handler sees every press inside the thread, including
 * presses in layers it opened (the emoji picker, typeahead and action menus,
 * the delete and history dialogs) wherever they render. It marks that event;
 * the document listener, which runs after React's root listener, judges any
 * unmarked press as outside. Presses on the host surface around the thread
 * (its padding, its fallback close control) are inside too.
 *
 * The press acts on its pointer-up, as native light dismiss does, so a touch
 * that becomes a scroll (`pointercancel`) never dismisses.
 *
 * ## One layer at a time
 *
 * The thread registers on the shared layer stack, deeper than its host, and
 * wraps its content so layers it opens register deeper still. An Escape goes
 * to the top-most layer only, and an outside press counts only while the
 * thread is that layer: with the emoji picker open, the picker's own light
 * dismiss takes the press and the thread ignores it.
 */

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import type {AnnouncePoliteness} from '@astryxdesign/core/hooks';
import {useTranslator} from '@astryxdesign/core/i18n';
import {useLayerDismissal} from '@astryxdesign/core/Layer';
import {useTheme} from '@astryxdesign/core/theme';
import type {CommentsContextValue} from './CommentsContext';
import {commentAnchorId, replyComposerId} from './utils';

/** A reply or edit holding text the viewer would lose on dismissal. */
export type UnsavedDraft =
  | {kind: 'reply'; parentId: string; signature: string}
  | {kind: 'edit'; commentId: string; signature: string};

/**
 * The thread's unsaved draft, derived from the controller's state: a reply
 * holding more than its seeded mention, or an edit whose text differs from
 * the saved body. Whitespace alone is never a draft.
 */
export function unsavedDraftOf({
  replyTarget,
  replyDraft,
  editTarget,
}: Pick<
  CommentsContextValue,
  'replyTarget' | 'replyDraft' | 'editTarget'
>): UnsavedDraft | null {
  if (
    editTarget != null &&
    editTarget.value.trim() !== editTarget.comment.body.trim()
  ) {
    return {
      kind: 'edit',
      commentId: editTarget.comment.id,
      signature: `edit:${editTarget.comment.id}:${editTarget.value}`,
    };
  }
  if (replyTarget != null) {
    const typed = replyDraft.trim();
    if (typed !== '' && typed !== (replyTarget.seed ?? '').trim()) {
      return {
        kind: 'reply',
        parentId: replyTarget.parentId,
        signature: `reply:${replyTarget.parentId}:${replyDraft}`,
      };
    }
  }
  return null;
}

type RequestOutcome = 'dismissed' | 'guarded';

export interface CommentThreadDismissalOptions {
  /** The host's dismissal; `undefined` turns the whole behavior off. */
  onDismiss: (() => void) | undefined;
  /** The thread root: the boundary, the shake target, and the stack container. */
  rootRef: RefObject<HTMLElement | null>;
  /** The draft a dismissal would discard, derived during render. */
  draft: UnsavedDraft | null;
  /** The controller's announcer. */
  announce: (message: string, politeness?: AnnouncePoliteness) => void;
}

export interface CommentThreadDismissalReturn {
  /** Whether the thread owns its dismissal, so its content nests a layer. */
  isEnabled: boolean;
  /** The root's pointer-down capture handler: marks the press as inside. */
  onRootPointerDownCapture: (event: ReactPointerEvent<HTMLElement>) => void;
}

const DRAFT_INPUT_SELECTOR = [
  '[contenteditable="true"]',
  '[role="textbox"]',
  'textarea',
  'input:not([type="hidden"]):not([type="file"])',
].join(', ');

const DEFAULT_SHAKE_DURATION_MS = 410;
const DEFAULT_SHAKE_DISTANCE = '4px';

function parseDuration(value: string | undefined): number | null {
  const normalized = value?.trim() ?? '';
  const amount = Number.parseFloat(normalized);
  if (!Number.isFinite(amount)) {
    return null;
  }
  if (normalized.endsWith('ms')) {
    return amount;
  }
  return normalized.endsWith('s') ? amount * 1000 : null;
}

/** The top-layer host surface the thread renders in, such as a Popover. */
function hostSurfaceOf(root: HTMLElement): HTMLElement | null {
  return root.parentElement?.closest<HTMLElement>('[popover]') ?? null;
}

/** The control that toggles `host`, found through its `aria-controls`. */
function hostTriggerOf(doc: Document, host: HTMLElement): Element | null {
  if (host.id === '') {
    return null;
  }
  for (const element of doc.querySelectorAll('[aria-controls]')) {
    if (
      element.getAttribute('aria-controls')?.split(/\s+/).includes(host.id) ===
      true
    ) {
      return element;
    }
  }
  return null;
}

/**
 * Swallow the next `type` event of this gesture when `owns` its target. Lets
 * go at the next press or key so it can never reach a later gesture.
 */
function claimNext(
  doc: Document,
  type: 'mousedown' | 'click',
  owns: (target: EventTarget | null) => boolean,
): void {
  const release = () => {
    doc.removeEventListener(type, claim, true);
    doc.removeEventListener('pointerdown', release, true);
    doc.removeEventListener('keydown', release, true);
  };
  const claim = (event: Event) => {
    release();
    if (owns(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  doc.addEventListener(type, claim, true);
  doc.addEventListener('pointerdown', release, true);
  doc.addEventListener('keydown', release, true);
}

/** Focus the draft's input, keeping the viewer's caret or landing after the text. */
function focusDraftInput(root: HTMLElement, draft: UnsavedDraft): void {
  const doc = root.ownerDocument;
  const region = doc.getElementById(
    draft.kind === 'reply'
      ? replyComposerId(draft.parentId)
      : commentAnchorId(draft.commentId),
  );
  let input: HTMLElement | null = null;
  for (const candidate of region?.querySelectorAll<HTMLElement>(
    DRAFT_INPUT_SELECTOR,
  ) ?? []) {
    // A layer the composer opened (the picker's search field) is not the draft.
    const layer = candidate.closest('[popover], [role="dialog"]');
    if (layer == null || !region?.contains(layer)) {
      input = candidate;
      break;
    }
  }
  if (input == null) {
    root.focus();
    return;
  }
  const selection = doc.getSelection();
  const existing =
    selection != null &&
    selection.rangeCount > 0 &&
    input.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange()
      : null;
  input.focus();
  if (selection == null || input.getAttribute('contenteditable') !== 'true') {
    return;
  }
  // A bare focus() collapses an editable's caret to its start; restore the
  // viewer's caret, or land after the draft.
  let range = existing;
  if (range == null) {
    range = doc.createRange();
    range.selectNodeContents(input);
    range.collapse(false);
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function prefersReducedMotion(element: HTMLElement): boolean {
  return (
    element.ownerDocument.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches === true
  );
}

/**
 * Own light dismissal for a CommentThread: outside presses and unclaimed
 * Escape presses request it, and an unsaved draft turns the first request
 * into a shake, a focus move, and a polite announcement.
 */
export function useCommentThreadDismissal({
  onDismiss,
  rootRef,
  draft,
  announce,
}: CommentThreadDismissalOptions): CommentThreadDismissalReturn {
  const t = useTranslator();
  const {tokens} = useTheme();
  const isEnabled = onDismiss != null;
  // The draft the last request guarded. The next request dismisses only while
  // the draft still matches it; an edit or a press inside clears it.
  const guardedSignatureRef = useRef<string | null>(null);
  // The pointer-down the root last saw, compared by identity so a press whose
  // native propagation stopped short of the document cannot leak forward.
  const insidePressRef = useRef<Event | null>(null);
  const shakeRef = useRef<Animation | null>(null);

  const shake = (root: HTMLElement) => {
    shakeRef.current?.cancel();
    shakeRef.current = null;
    const duration =
      parseDuration(tokens['--duration-medium']) ?? DEFAULT_SHAKE_DURATION_MS;
    if (
      duration <= 0 ||
      typeof root.animate !== 'function' ||
      prefersReducedMotion(root)
    ) {
      return;
    }
    // Symmetric about the resting position, so it reads the same in RTL.
    const distance = tokens['--spacing-1'] ?? DEFAULT_SHAKE_DISTANCE;
    const at = (factor: number) => ({
      transform: `translateX(calc(${distance} * ${factor}))`,
    });
    try {
      const animation = root.animate(
        [at(0), at(-1), at(1), at(-0.5), at(0.5), at(0)],
        {duration, easing: 'ease-in-out', composite: 'add'},
      );
      shakeRef.current = animation;
      const forget = () => {
        if (shakeRef.current === animation) {
          shakeRef.current = null;
        }
      };
      animation.addEventListener('finish', forget);
      animation.addEventListener('cancel', forget);
    } catch {
      // Motion is progressive enhancement; focus and the announcement remain.
    }
  };

  const request = (): RequestOutcome => {
    if (draft == null || guardedSignatureRef.current === draft.signature) {
      guardedSignatureRef.current = null;
      onDismiss?.();
      return 'dismissed';
    }
    guardedSignatureRef.current = draft.signature;
    const root = rootRef.current;
    if (root != null) {
      shake(root);
      focusDraftInput(root, draft);
    }
    announce(t('@astryx.comments.unsavedDraft'), 'polite');
    return 'guarded';
  };

  // The document listeners run outside render and reach the latest draft
  // through this ref, as the composer's own listeners do.
  const latestRef = useRef<{
    request: () => RequestOutcome;
    wouldGuard: () => boolean;
  } | null>(null);
  latestRef.current = {
    request,
    wouldGuard: () =>
      draft != null && guardedSignatureRef.current !== draft.signature,
  };

  const {shouldDismissOnCloseRequest} = useLayerDismissal({
    isActive: isEnabled,
    onDismiss: () => void latestRef.current?.request(),
    getContainer: () => rootRef.current,
  });

  // External subscription: outside presses on the thread's document.
  useEffect(() => {
    if (!isEnabled) {
      return;
    }
    const doc = rootRef.current?.ownerDocument ?? document;
    let pending: {pointerId: number; trigger: Element | null} | null = null;

    const handlePointerDown = (event: PointerEvent) => {
      pending = null;
      const insidePress = insidePressRef.current;
      insidePressRef.current = null;
      if (insidePress === event || !event.isPrimary || event.button !== 0) {
        return;
      }
      const root = rootRef.current;
      const target = event.target;
      if (root == null || !(target instanceof Node) || root.contains(target)) {
        return;
      }
      const host = hostSurfaceOf(root);
      if (host?.contains(target) === true) {
        return;
      }
      // A layer above the thread (an open picker or menu) takes this press
      // through its own light dismiss.
      if (!shouldDismissOnCloseRequest()) {
        return;
      }
      const trigger = host == null ? null : hostTriggerOf(doc, host);
      pending = {
        pointerId: event.pointerId,
        trigger: trigger?.contains(target) === true ? trigger : null,
      };
      // A guarded press keeps focus and selection where they are.
      if (latestRef.current?.wouldGuard() === true) {
        claimNext(doc, 'mousedown', () => true);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (pending == null || event.pointerId !== pending.pointerId) {
        return;
      }
      const {trigger} = pending;
      pending = null;
      if (latestRef.current?.request() === 'guarded') {
        // The press was spent on the warning; it activates nothing.
        claimNext(doc, 'click', () => true);
      } else if (trigger != null) {
        // The host's trigger would reopen the surface this press just closed.
        claimNext(
          doc,
          'click',
          target => target instanceof Node && trigger.contains(target),
        );
      }
    };

    const handlePointerCancel = (event: PointerEvent) => {
      if (pending?.pointerId === event.pointerId) {
        pending = null;
      }
    };

    doc.addEventListener('pointerdown', handlePointerDown);
    doc.addEventListener('pointerup', handlePointerUp, true);
    doc.addEventListener('pointercancel', handlePointerCancel, true);
    return () => {
      doc.removeEventListener('pointerdown', handlePointerDown);
      doc.removeEventListener('pointerup', handlePointerUp, true);
      doc.removeEventListener('pointercancel', handlePointerCancel, true);
    };
  }, [isEnabled, rootRef, shouldDismissOnCloseRequest]);

  return {
    isEnabled,
    onRootPointerDownCapture: event => {
      if (!isEnabled) {
        return;
      }
      insidePressRef.current = event.nativeEvent;
      // A press inside re-arms the guard.
      guardedSignatureRef.current = null;
    },
  };
}
