// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file layerStack.ts
 * @input Uses the isImeKeyEvent predicate from utils/ime
 * @output Exports the shared layer dismissal stack: registration, top-most
 *   ordering, the Escape listener on each document that holds a layer, and its
 *   internal local-event dispatcher
 * @position Internal to the Layer system; consumed by useLayerDismissal, which
 *   is what overlays actually call. Not exported from the package root.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/useLayerDismissal.ts
 * - /packages/core/src/Layer/useLayerDismissal.test.tsx
 *
 * ## Why one stack
 *
 * Every overlay used to own its own Escape listener, so one press dismissed
 * every open layer (a popover inside a Dialog closed both; a Modal opened from
 * inside another Modal closed both). Patching this per primitive produced
 * parallel registries — the focus-trap Escape stack, Drawer's LIFO registry,
 * useScrollLock's counter. This module is the single registry those collapse
 * into. One press dismisses exactly one layer.
 *
 * ## Only the top layer acts
 *
 * The stack owns ONE `keydown` listener per document and routes the press to
 * the top-most layer itself. Overlays do not listen; they register and say what
 * they want done. The alternative — every layer listens and filters itself out
 * — is what forces `stopPropagation()` choreography between element-level and
 * document-level listeners, and it silently breaks whenever a layer forgets.
 *
 * ## One listener per document
 *
 * A layer can live in a document other than the one this module was loaded
 * in: an app may render into a same-origin iframe or a Document
 * Picture-in-Picture window through a portal. A key press reaches only the
 * document it happened in, so the listener goes on the layer's own document —
 * its container's `ownerDocument` — with that document's first layer, and comes
 * off with its last. A layer that names no container counts as the global
 * `document`'s.
 *
 * The top-most layer is chosen among the layers of the document the press
 * arrived in, the way each document keeps its own browser top layer. A press in
 * one window never reaches past it to dismiss a layer in another, and one press
 * still dismisses exactly one layer.
 *
 * ## Bubble phase, not capture
 *
 * The listener is on the BUBBLE phase so content inside a layer can claim the
 * press first, either by `stopPropagation()` (the press never reaches the
 * document listener) or by `preventDefault()` (we see it and stand down).
 * A host whose public event prop can stop propagation may route the still-
 * unprevented event through `dispatchLayerEscapeKeyDown` at its own boundary;
 * the same stack still chooses the owner. Editors are why `preventDefault()`
 * remains the explicit cancellation signal: their own Escape action must win.
 *
 * ## The stack, not the browser, decides
 *
 * When the stack handles a press it calls `preventDefault()`, which suppresses
 * the browser's own close-watcher behavior — both `<dialog>`'s `cancel` event
 * and `popover="auto"` light-dismiss (verified in Chromium; the default action
 * runs after propagation, so a bubble-phase `preventDefault` still beats it).
 * That is deliberate: the native top layer only covers `showModal()` and
 * `popover="auto"`, so relying on it would leave non-modal `show()` drawers,
 * `popover="manual"` layers, and older browsers on a second, differently-behaved
 * code path. One code path, one ordering, everywhere.
 *
 * ## An Escape that cancels an IME composition
 *
 * That press is not a dismissal, so no layer acts on it — but the stack still
 * claims it, because an unclaimed Escape is exactly what makes the browser
 * raise a close request, and that request dismisses the layer through its
 * `cancel` handler on the same keypress. Claiming is the whole fix; the guard
 * that only returns measures identically to no guard at all.
 *
 * Close requests that arrive with no keydown to read — the Android back
 * gesture, the platform close watcher — are answered by the hosts, which ask
 * `isTextComposing()` through `useLayerDismissal`.
 */

import {isImeKeyEvent} from '../utils/ime';

/**
 * What a layer does with an Escape press that reaches it.
 *
 * - `'close'` — dismiss this layer and consume the press. One Escape closes
 *   exactly this layer. The default, and correct for every dismissible layer:
 *   modals, popovers, menus, comboboxes, and hover layers alike.
 * - `'block'` — consume the press WITHOUT dismissing. For a layer that requires
 *   an explicit choice (`Dialog purpose="required"`): Escape must not dismiss
 *   it, and must not fall through and dismiss something behind it either.
 *
 * There is deliberately no "dismiss but let the press continue" variant. Escape
 * affects exactly one layer, always — a rule with no per-component exceptions
 * is one users can predict. Hover layers were the tempting exception (the user
 * never opened the tip, so why should it eat their press?), but guessing wrong
 * that way is destructive: someone dismissing a stray tooltip over a form would
 * lose the whole dialog. Guessing wrong the other way costs one keystroke.
 */
export type LayerEscapeBehavior = 'close' | 'block';

export interface LayerStackEntry {
  /**
   * Identity for removal; also the equality check for top-most, and the key
   * `seq` is assigned against so a layer keeps its place across re-registration.
   */
  token: object;
  /**
   * Nesting depth from the React tree (see LayerDepthContext), NOT the DOM.
   * Context flows through portals and is known during render, so it is correct
   * for layers that portal out and for an inner + outer layer that open in the
   * same commit — the case where effect order lies, because React runs child
   * effects before parent effects.
   */
  depth: number;
  /**
   * Monotonic registration order; breaks ties between unrelated layers. For a
   * layer that registers when it opens this is open order; a hover layer
   * registers at mount and answers `isPresent` instead, so for two of those it
   * is mount order rather than which one appeared first.
   *
   * Keyed to `token`, not to the registration, because a layer re-registers
   * whenever its behavior or depth changes and must not overtake the layers
   * above it.
   */
  seq: number;
  behavior: LayerEscapeBehavior;
  /**
   * The layer's container element, read lazily at press time. Used to break
   * ties between layers the React tree reports at the same depth — a raw
   * `useFocusTrap` cannot wrap its content in a depth provider (it renders
   * nothing), so DOM containment is the only nesting signal those have — and,
   * once at registration, to find the document the layer lives in.
   */
  getContainer?: () => HTMLElement | null;
  /**
   * Whether the layer is really on screen right now, asked at press time.
   *
   * Registration alone is not proof: a layer whose open state lives in React
   * state can lag a frame behind the DOM, so gating registration on that state
   * drops presses that arrive in the gap. Such layers register for their whole
   * lifetime and answer this from the DOM instead. Omit it to mean "registered
   * means present", which is true for layers that register on open.
   */
  isPresent?: () => boolean;
  dismiss: () => void;
}

/** An entry and the document it was registered in. */
interface DocumentEntry extends LayerStackEntry {
  /** The layer's document; null only where there is no DOM at all. */
  ownerDocument: Document | null;
}

const entries: DocumentEntry[] = [];
// Registration order per layer identity. `useLayerDismissal` keeps one token
// through effect re-registration while an active layer changes depth or behavior
// — a Dialog whose `purpose` flips while open, a focus trap that moves — and
// through StrictMode's setup/cleanup replay. Counting those registrations would
// hand the layer a fresh, higher seq and promote it above layers opened over it.
// A genuine inactive -> active cycle receives a new token in the hook, matching
// the browser top layer's show order.
let seqByToken = new WeakMap<object, number>();
let nextSeq = 0;
// How many registered layers live in each document: the listeners go on a
// document with its first layer and come off with its last.
const layerCountByDocument = new Map<Document, number>();

function seqFor(token: object): number {
  const existing = seqByToken.get(token);
  if (existing !== undefined) {
    return existing;
  }
  const seq = nextSeq++;
  seqByToken.set(token, seq);
  return seq;
}

/**
 * Order two entries: positive when `a` is above `b`, negative when below.
 * Three keys, each earning its place:
 *
 * 1. **Depth.** The layer nested inside the other is on top. This is what makes
 *    an inner-and-outer pair that mount in the SAME commit come out right;
 *    registration order alone gets it backwards, because React runs child
 *    effects before parent effects.
 * 2. **DOM containment.** Depth only moves when a layer wraps its content in a
 *    `LayerDepthProvider`, which a bare `useFocusTrap` cannot do — it renders
 *    nothing. For those, containment recovers the nesting the tree did not
 *    report.
 * 3. **Registration order.** For unrelated layers, the one whose current active
 *    cycle registered later is on top, matching how the browser's own top layer
 *    stacks. Effect re-registration within that active cycle keeps its place so
 *    depth or behavior changes cannot jump the queue; a close/reopen cycle gets
 *    a fresh identity from `useLayerDismissal` and moves to the top.
 *
 * Modality is deliberately NOT a key. Ranking modals above everything sounds
 * right and is not: a hover tip shown inside a modal renders on top of it, so
 * a modal-first rule would hand the press to the dialog and strand the tip.
 * Nesting already covers the case modality was meant to catch — a layer opened
 * from inside another is deeper, modal or not.
 *
 * Note this is a PARTIAL order: containment relates only nested pairs. Callers
 * must resolve the top with a pairwise max scan, never `Array.sort`, whose
 * result is undefined for a non-transitive comparator.
 */
function compareEntries(a: LayerStackEntry, b: LayerStackEntry): number {
  if (a.depth !== b.depth) {
    return a.depth - b.depth;
  }
  const aEl = a.getContainer?.() ?? null;
  const bEl = b.getContainer?.() ?? null;
  if (aEl != null && bEl != null && aEl !== bEl) {
    if (bEl.contains(aEl)) {
      return 1;
    }
    if (aEl.contains(bEl)) {
      return -1;
    }
  }
  return a.seq - b.seq;
}

function isPresentEntry(entry: LayerStackEntry): boolean {
  return entry.isPresent?.() ?? true;
}

// The documents in which a text composition is running. Tracked from
// composition events because the DOM offers no way to ask.
const composingDocuments = new Set<Document>();

/**
 * Whether the user is part-way through composing text with an IME.
 *
 * The stack reads this to decide what an Escape means, and layers read it
 * through `useLayerDismissal`'s `shouldDismissOnCloseRequest` for the close
 * requests that arrive without a keydown to inspect — the Android back
 * gesture, the platform close watcher, or a composing Escape whose keydown
 * never reached this listener because content stopped it. Mid-composition,
 * those are far more likely to be the user backing out of a half-formed
 * character than a request to dismiss a layer, and guessing wrong that way
 * costs them everything they have typed into it.
 *
 * Scope, deliberately page-wide: a composition in a field behind a non-modal
 * layer also suppresses that layer's close requests. It is one keypress to
 * recover from, and the alternative — matching the composing element against
 * a layer's container — cannot work for the layers that do not have one.
 *
 * A composition already running when a document's first layer registers is
 * invisible here: the listeners go on with the stack's own. Page-wide means
 * every document that holds a layer.
 */
export function isTextComposing(): boolean {
  return composingDocuments.size > 0;
}

// The listeners sit on documents, so the current target is the document the
// composition runs in.
function handleCompositionStart(event: Event): void {
  composingDocuments.add(event.currentTarget as Document);
}

// Focus leaving the field ends the composition too. Clearing on blur as well
// means a compositionend this listener never sees cannot leave the flag stuck
// on, swallowing every later close request.
function handleCompositionEnd(event: Event): void {
  composingDocuments.delete(event.currentTarget as Document);
}

/**
 * The top-most present layer of `doc`, or null when nothing is on screen
 * there.
 */
function topPresentEntry(doc: Document | null): DocumentEntry | null {
  let top: DocumentEntry | null = null;
  for (const entry of entries) {
    if (entry.ownerDocument !== doc || !isPresentEntry(entry)) {
      continue;
    }
    if (top == null || compareEntries(entry, top) > 0) {
      top = entry;
    }
  }
  return top;
}

/**
 * Whether `token` identifies the top-most layer of its own document. Overlays
 * that still own a dismissal channel the stack does not model yet
 * (outside-press, swipe) can gate on this so every channel agrees on who is on
 * top.
 */
export function isTopmostLayer(token: object): boolean {
  const entry = entries.find(candidate => candidate.token === token);
  return entry != null && topPresentEntry(entry.ownerDocument) === entry;
}

/** The global document, or null where there is no DOM. */
function globalDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

/**
 * The document a key press happened in: its target's, or the target itself
 * when the press was dispatched at a document. Read from `nodeType` rather
 * than `instanceof`, which names this module's window and so misses a node
 * of another one.
 */
function documentOfEvent(event: Event): Document | null {
  const target = event.target as Node | null;
  if (target == null) {
    return null;
  }
  return target.nodeType === 9 ? (target as Document) : target.ownerDocument;
}

/**
 * Resolve an Escape press against the layers of `doc`. Returns whether it was
 * handled.
 */
function dispatchEscape(doc: Document | null): boolean {
  const top = topPresentEntry(doc);
  if (top == null) {
    return false;
  }
  if (top.behavior === 'block') {
    return true;
  }
  top.dismiss();
  return true;
}

/**
 * Resolve a keydown through the shared stack immediately.
 *
 * The document listener is the normal path. A host may call this at its own
 * element boundary after a consumer handler when that handler can stop
 * propagation before the event reaches `document`. The same stack still picks
 * the owner, and `preventDefault()` records the decision so a bubbling event is
 * not handled twice.
 */
export function dispatchLayerEscapeKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') {
    return;
  }
  const doc = documentOfEvent(event) ?? globalDocument();
  // An IME user pressing Escape is cancelling a composition, not dismissing a
  // layer. Claim the press anyway, then stand down: left unclaimed, the browser
  // raises its own close request, which arrives at a layer's `cancel` handler
  // and dismisses it on this very keypress — measured in Chromium, where a
  // guard that only returns behaves exactly like no guard at all. Claim it only
  // while a layer is on screen; with nothing to protect, the press is not ours.
  if (isImeKeyEvent(event)) {
    if (topPresentEntry(doc) != null) {
      event.preventDefault();
    }
    return;
  }
  // Content inside a layer already claimed this press (see the bubble-phase
  // note in the file header). Honor it and leave the default action alone.
  if (event.defaultPrevented) {
    return;
  }
  if (dispatchEscape(doc)) {
    // Suppress the browser's own close-watcher so it cannot dismiss a second
    // layer behind our back. Propagation is left alone: consumers may
    // legitimately listen for Escape on window, and the stack's decision is
    // already recorded in defaultPrevented.
    event.preventDefault();
  }
}

function startListening(doc: Document): void {
  doc.addEventListener('keydown', dispatchLayerEscapeKeyDown);
  doc.addEventListener('compositionstart', handleCompositionStart, true);
  doc.addEventListener('compositionend', handleCompositionEnd, true);
  doc.addEventListener('blur', handleCompositionEnd, true);
}

function stopListening(doc: Document): void {
  doc.removeEventListener('keydown', dispatchLayerEscapeKeyDown);
  doc.removeEventListener('compositionstart', handleCompositionStart, true);
  doc.removeEventListener('compositionend', handleCompositionEnd, true);
  doc.removeEventListener('blur', handleCompositionEnd, true);
  composingDocuments.delete(doc);
}

/**
 * Add a layer to the stack for as long as it is active. Returns the unregister
 * function; callers own calling it.
 */
export function registerLayer(entry: Omit<LayerStackEntry, 'seq'>): () => void {
  // The document the layer lives in: its container's, else the global one.
  const ownerDocument =
    entry.getContainer?.()?.ownerDocument ?? globalDocument();
  const full: DocumentEntry = {
    ...entry,
    seq: seqFor(entry.token),
    ownerDocument,
  };
  entries.push(full);
  if (ownerDocument != null) {
    const count = layerCountByDocument.get(ownerDocument) ?? 0;
    layerCountByDocument.set(ownerDocument, count + 1);
    if (count === 0) {
      startListening(ownerDocument);
    }
  }

  return () => {
    const index = entries.indexOf(full);
    if (index === -1) {
      return;
    }
    entries.splice(index, 1);
    if (ownerDocument == null) {
      return;
    }
    const count = layerCountByDocument.get(ownerDocument) ?? 1;
    if (count > 1) {
      layerCountByDocument.set(ownerDocument, count - 1);
      return;
    }
    layerCountByDocument.delete(ownerDocument);
    stopListening(ownerDocument);
  };
}

/** Test-only: drop all entries and detach every listener. */
export function resetLayerStackForTests(): void {
  entries.length = 0;
  seqByToken = new WeakMap();
  nextSeq = 0;
  for (const doc of layerCountByDocument.keys()) {
    stopListening(doc);
  }
  layerCountByDocument.clear();
  composingDocuments.clear();
}
