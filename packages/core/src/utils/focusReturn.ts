// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusReturn.ts
 * @input The document's current active element and the shared interaction
 *   modality.
 * @output Focus ownership and availability through shadow hosts and frames
 *   (`ownsFocus`, `isFocusUnclaimed`); whether focus would be lost if a
 *   surface hid now; a focus move whose ring follows the last input; an
 *   overlay's focus return that never scrolls the page; the path that moves
 *   focus out of removed or hidden content; and the focus return that
 *   Popover, Dialog and DropdownMenu run as they close (`trackLayerFocus`,
 *   `restoreLayerFocus`).
 * @position Utility; used by the focus trap (Popover, Drawer), by Dialog,
 *   DropdownMenu, BottomSheet and disclosures that hide focused content, and
 *   by useFocusAcrossSwap. isFocusDetached lives in isFocusDetached.ts,
 *   outside this module.
 */

import {
  FOCUSABLE_SELECTOR,
  getFocusableElements,
  isVisiblyFocusable,
} from '../hooks/focusableSelector';
import {sharedState, sharedWeakMap} from './sharedRealm';
import {
  getInteractionModality,
  type InteractionModality,
} from './interactionModality';
import {isFocusDetached} from './isFocusDetached';
import {
  isElement,
  isHTMLElement,
  isModalDialog,
  isShadowRoot,
} from './nodeType';
import {devWarn} from './devWarning';

function focusRoot(node: Node): Document | ShadowRoot | null {
  const root = node.getRootNode();
  if (!('activeElement' in root)) {
    return null;
  }
  return root as Document | ShadowRoot;
}

/** Whether the element owns focus through its shadow hosts and frames. Internal. */
export function ownsFocus(element: Element): boolean {
  // An iframe can retain activeElement after focus leaves its document.
  const root = focusRoot(element);
  if (!root || root.activeElement !== element) {
    return false;
  }
  const owner = isShadowRoot(root) ? root.host : root.defaultView?.frameElement;
  return owner == null || ownsFocus(owner);
}

/** Whether a replacement can take focus without displacing another owner. Internal. */
export function isFocusUnclaimed(node: Node): boolean {
  let root = focusRoot(node);
  let surface: Element | null = null;
  while (root) {
    if (isShadowRoot(root)) {
      if (root.activeElement != null) {
        return (
          surface != null &&
          surface.contains(root.activeElement) &&
          ownsFocus(root.host)
        );
      }
      // A host fallback can be a caller's chosen focus target.
      // Do not restore focus when that ownership is ambiguous.
      surface = null;
      root = focusRoot(root.host);
    } else {
      if (!isFocusLost(surface, root)) {
        return false;
      }
      const frame = root.defaultView?.frameElement;
      if (frame == null) {
        return true;
      }
      surface = frame;
      root = focusRoot(frame);
    }
  }
  return false;
}

/**
 * True when focus would be lost if `surface` hid now: nothing is focused (see
 * isFocusDetached) or focus sits inside `surface`. Reads `surface`'s own
 * document, so a surface in an iframe or Picture-in-Picture window is
 * answered there. Internal: not exported from the utils barrel.
 */
export function isFocusLost(surface: Element | null, doc?: Document): boolean {
  const ownerDocument = doc ?? surface?.ownerDocument ?? document;
  return (
    isFocusDetached(ownerDocument) ||
    (surface != null && surface.contains(ownerDocument.activeElement))
  );
}

/** Where focus was, inside a container, before a change removed or hid content. */
export interface FocusWithin {
  readonly element: Element;
  readonly container: HTMLElement;
}

/**
 * The focused element, if it is inside `container`. A disclosure calls this
 * in the commit before the DOM changes (`LayoutChangeSnapshot`'s
 * `onBeforeChange`), and passes the result to `moveFocusLeftBehind` from a
 * layout effect of the same commit. Internal.
 */
export function noteFocusWithin(
  container: HTMLElement | null | undefined,
): FocusWithin | null {
  const active = container?.ownerDocument.activeElement;
  if (container == null || active == null || !container.contains(active)) {
    return null;
  }
  return {element: active, container};
}

/**
 * Moves focus noted by `noteFocusWithin` to `target` when the change lost it
 * (`isFocusLost`): it fell to the page because its element was removed, or
 * it is still inside `hidden`, content the change hid but kept, which the
 * browser is about to blur. Focus that survived the change, or that was never
 * inside, is not moved. The ring follows the last input, so the calling
 * component keeps modality tracking active
 * (`useInteractionModalityTracking()`). Returns whether focus moved. Internal.
 */
export function moveFocusLeftBehind(
  note: FocusWithin | null,
  target: HTMLElement | null | undefined,
  hidden: Element | null = null,
  options?: FocusOptions,
): boolean {
  if (
    note == null ||
    target == null ||
    !isFocusLost(hidden, note.container.ownerDocument)
  ) {
    return false;
  }
  focusForLastInputTemporarily(target, options);
  return target.ownerDocument.activeElement === target;
}

const temporaryFocus = sharedWeakMap<HTMLElement, () => void>(
  'utils/focus-return/temporary-focus',
  1,
);

/** Release only a temporary tab stop owned by this module. Internal. */
export function releaseTemporaryFocus(element: HTMLElement): void {
  temporaryFocus.get(element)?.();
}

/** Whether the element takes focus as it is, with no temporary tab stop. Internal. */
export function takesFocusAsIs(element: HTMLElement): boolean {
  return (
    element.hasAttribute('tabindex') ||
    element.tabIndex >= 0 ||
    element.isContentEditable ||
    element.matches(FOCUSABLE_SELECTOR)
  );
}

/** Focuses the element. A nonfocusable element gets a tab stop until blur or disposal. Internal. */
export function focusForLastInputTemporarily(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(element),
): () => void {
  releaseTemporaryFocus(element);
  if (takesFocusAsIs(element)) {
    focusForLastInput(element, options, modality);
    return () => {};
  }
  element.setAttribute('tabindex', '-1');
  const dispose = () => {
    if (temporaryFocus.get(element) !== dispose) {
      return;
    }
    temporaryFocus.delete(element);
    element.removeEventListener('blur', dispose);
    if (element.getAttribute('tabindex') === '-1') {
      element.removeAttribute('tabindex');
    }
  };
  temporaryFocus.set(element, dispose);
  focusForLastInput(element, options, modality);
  // Pointer-modality refocus can blur first; acquire cleanup after that move.
  if (element.ownerDocument.activeElement === element) {
    element.addEventListener('blur', dispose, {once: true});
  } else {
    dispose();
  }
  return dispose;
}

/**
 * Move focus programmatically so its ring follows the last input. After pointer input the browser's
 * focus option keeps the element from matching `:focus-visible`, which is the
 * one way to reach an element the overlay does not render: the consumer's
 * autofocus target, the control that opened a Dialog, or a menu trigger the
 * caller renders. Pass `options` (for example `preventScroll`) as to `focus()`.
 *
 * `modality` defaults to the last input in the element's own document: the
 * page's for an element on the page, and a second document's (a same-origin
 * iframe, a Document Picture-in-Picture window) for an element there, which
 * the component tracks by passing its element's ref to
 * `useInteractionModalityTracking`.
 *
 * Make sure modality tracking is active (`useInteractionModalityTracking()`)
 * in the component that calls this.
 */
export function focusForLastInput(
  element: HTMLElement,
  options?: FocusOptions,
  modality: InteractionModality = getInteractionModality(element),
): void {
  // A text-entry field paints its own focus treatment to show where typing
  // goes, and an extra blur there can run validation or mark it touched. The
  // field's own window: one in an iframe or a Picture-in-Picture window is
  // never an instance of the page's constructors.
  const view = element.ownerDocument.defaultView ?? window;
  const isTextEntry =
    element instanceof view.HTMLInputElement ||
    element instanceof view.HTMLTextAreaElement ||
    element instanceof view.HTMLSelectElement ||
    element.isContentEditable;
  if (isTextEntry || modality !== 'pointer') {
    if (options === undefined) {
      element.focus();
    } else {
      element.focus(options);
    }
    return;
  }
  // Focusing the element that already has focus does nothing, so a ring the
  // browser already drew would stay. WebKit draws one when its own focus
  // restoration (a dialog's close, a popover's hide) moves focus itself, so
  // clear that focus first.
  if (
    element.ownerDocument.activeElement === element &&
    element.matches(':focus-visible')
  ) {
    element.blur();
  }
  element.focus({...options, focusVisible: false});
}

/**
 * Returns focus to `opener` after an overlay closes, without a scroll and with
 * the ring the last input calls for. WebKit records the nearest focusable
 * ancestor of a tapped button as the opener, such as a `tabindex="-1"` main
 * region. A reveal of that region scrolls the page to its top edge.
 */
export function returnFocusForLastInput(
  opener: HTMLElement,
  modality?: InteractionModality,
): void {
  focusForLastInput(opener, {preventScroll: true}, modality);
}

/**
 * Prepares a focus repair for an open surface that may be removed while open
 * (rendered only while open, or removed with its view). Removing a `<dialog>`
 * runs no close and no browser focus return. Call this while the surface is
 * mounted: it reads the frame that hosts the surface now, because a removed
 * frame's document has no window. Call the returned function from the effect
 * cleanup with the repair to run.
 *
 * Once the commit has finished, the repair runs only when the surface really
 * left the document (StrictMode's simulated unmount keeps it) and the removal
 * lost focus, both in the surface's document and in the document that hosts
 * its frame. A control the user pressed outside the surface, or outside its
 * frame, keeps its focus, and so does a surface that took focus in the same
 * commit.
 */
export function prepareFocusRepairOnRemoval(
  surface: Element,
  options?: {
    /**
     * Skip the repair when focus already rested on the page body before the
     * commit's first removal: the removal did not lose that focus.
     */
    keepRestingFocus?: boolean;
  },
): (repair: () => void) => void {
  const host = surface.ownerDocument.defaultView?.frameElement ?? null;
  return repair => {
    if (
      options?.keepRestingFocus === true &&
      wasFocusDetachedBeforeRemoval(surface.ownerDocument)
    ) {
      return;
    }
    queueMicrotask(() => {
      if (surface.isConnected) {
        return;
      }
      if (isFocusLost(surface) && (host == null || isFocusLost(host))) {
        repair();
      }
    });
  };
}

// Whether focus rested on the page body when the current commit began
// removing surfaces, per document. One removal can drop focus before a later
// surface's cleanup runs, so every cleanup of the commit reads the first value.
const focusDetachedAtRemovalStart = sharedWeakMap<Document, boolean>(
  'utils/focus-return/focus-detached-at-removal-start',
  1,
);
function wasFocusDetachedBeforeRemoval(doc: Document): boolean {
  let wasDetached = focusDetachedAtRemovalStart.get(doc);
  if (wasDetached === undefined) {
    wasDetached = isFocusDetached(doc);
    focusDetachedAtRemovalStart.set(doc, wasDetached);
    queueMicrotask(() => focusDetachedAtRemovalStart.delete(doc));
  }
  return wasDetached;
}

/**
 * The focus repair above that returns focus to `opener` while the opener is
 * still on the page. Call the returned function from the effect cleanup with
 * the opener.
 */
export function prepareFocusReturnOnRemoval(
  surface: Element,
): (opener: Element | null) => void {
  const repairOnRemoval = prepareFocusRepairOnRemoval(surface);
  return opener => {
    repairOnRemoval(() => {
      if (opener != null && opener.isConnected) {
        returnFocusForLastInput(opener as HTMLElement);
      }
    });
  };
}

/** Where the opener sat among one ancestor's tab stops when its layer opened. */
interface OpenerPlace {
  readonly container: Element;
  readonly index: number;
}

/**
 * One open layer's focus return: its opener, the stand-ins for the opener,
 * and the layer that opened it. `trackLayerFocus` creates it as the layer
 * opens; `restoreLayerFocus` runs it as the layer starts to close.
 */
export interface LayerFocusRecord {
  /** The layer's root, read when focus return runs. */
  readonly getLayer: () => Element | null;
  /** The element focused when the layer opened. */
  readonly opener: HTMLElement | null;
  readonly getTrigger: () => HTMLElement | null;
  readonly getRestoreFallback: () => HTMLElement | null;
  readonly getAnchor: () => Element | null;
  readonly layerId: string | null;
  readonly ancestors: ReadonlyArray<Element>;
  readonly places: ReadonlyArray<OpenerPlace>;
  readonly parent: LayerFocusRecord | null;
  readonly focus: (element: HTMLElement) => void;
  readonly doc: Document;
  /** The layer's own document when it opened; it may differ from `doc`. */
  readonly layerDoc: Document;
  /** A layer it opened took over its chain when it closed. */
  inherited: LayerFocusRecord | null;
  hadFocusInside: boolean;
  /** Its opening is still to move focus in. */
  awaitsFocus: boolean;
  /**
   * The element outside the layer that focus is moving to, while the move
   * is in progress: from the layer's `blur` to the next `focusin`.
   */
  focusMovingTo: Element | null;
  isClosing: boolean;
  isDone: boolean;
  stopListening: () => void;
}

export interface TrackLayerFocusOptions {
  getLayer: () => Element | null;
  /** The opener when the caller knows it; else the element focused now. */
  opener?: HTMLElement | null;
  getTrigger?: () => HTMLElement | null;
  /** A component's own stand-in for an opener that is gone. */
  getRestoreFallback?: () => HTMLElement | null;
  getAnchor?: () => Element | null;
  /** The id the trigger's `aria-controls` names. */
  layerId?: string | null;
  /**
   * Moves focus to the chosen element. Defaults to a plain focus, with a
   * temporary tab stop when the element has none; the browser then decides
   * the ring.
   */
  focus?: (element: HTMLElement) => void;
  doc?: Document;
  /**
   * Opening moves focus into the layer whatever the caller does: a modal
   * `<dialog>`'s `showModal()` always does.
   */
  isFocusMovedInOnOpen?: boolean;
}

const openLayerRecords = sharedState(
  'utils/focus-return/open-layer-records',
  1,
  () => new Set<LayerFocusRecord>(),
);

// How many ancestors of the opener keep a record of its place. The nearest
// ones hold a remounted control's siblings; farther ones only cost a query
// over a larger subtree.
const RECORDED_PLACES = 4;

function tabStopsIn(container: Element): HTMLElement[] {
  return getFocusableElements(container as HTMLElement).filter(
    element => element.tabIndex >= 0 && !element.matches(':disabled'),
  );
}

function isPageRoot(element: Element): boolean {
  const doc = element.ownerDocument;
  return element === doc.body || element === doc.documentElement;
}

/** The open layer record whose layer holds `element`, innermost first. */
function recordHolding(element: Element | null): LayerFocusRecord | null {
  if (element == null) {
    return null;
  }
  let holder: LayerFocusRecord | null = null;
  for (const record of openLayerRecords) {
    const layer = record.getLayer();
    if (
      layer != null &&
      layer.contains(element) &&
      (holder == null || holder.getLayer()?.contains(layer) === true)
    ) {
      holder = record;
    }
  }
  return holder;
}

/**
 * Starts focus return for a layer that is opening. It records the opener, the
 * opener's place among its ancestors' tab stops, and the open layer that holds
 * the opener. Call it as the layer opens, before initial focus moves into it,
 * and call `restoreLayerFocus` as it starts to close.
 */
export function trackLayerFocus(
  options: TrackLayerFocusOptions,
): LayerFocusRecord {
  const doc =
    options.doc ??
    options.getLayer()?.ownerDocument ??
    (typeof document === 'undefined' ? null : document);
  if (doc == null) {
    throw new Error('trackLayerFocus needs a document');
  }
  const active = doc.activeElement;
  const fromFocus =
    isHTMLElement(active) && !isPageRoot(active) ? active : null;
  const opener = options.opener ?? fromFocus;
  const ancestors: Element[] = [];
  const places: OpenerPlace[] = [];
  for (
    let current = opener?.parentElement ?? null;
    current != null && !isPageRoot(current);
    current = current.parentElement
  ) {
    ancestors.push(current);
    if (ancestors.length <= RECORDED_PLACES && opener != null) {
      const index = tabStopsIn(current).indexOf(opener);
      if (index >= 0) {
        places.push({container: current, index});
      }
    }
  }
  const layer = options.getLayer();
  const record: LayerFocusRecord = {
    getLayer: options.getLayer,
    opener,
    getTrigger: options.getTrigger ?? (() => null),
    getRestoreFallback: options.getRestoreFallback ?? (() => null),
    getAnchor: options.getAnchor ?? (() => null),
    layerId: options.layerId ?? null,
    ancestors,
    places,
    parent: recordHolding(opener),
    focus: options.focus ?? focusReturnTarget,
    doc,
    layerDoc: layer?.ownerDocument ?? doc,
    inherited: null,
    hadFocusInside:
      options.isFocusMovedInOnOpen === true ||
      (layer != null && layer.contains(active)),
    awaitsFocus:
      options.isFocusMovedInOnOpen === true &&
      !(layer != null && layer.contains(active)),
    focusMovingTo: null,
    isClosing: false,
    isDone: false,
    stopListening: () => {},
  };
  const markFocusInside = (event: FocusEvent) => {
    record.focusMovingTo = null;
    const target = event.target;
    if (isElement(target) && record.getLayer()?.contains(target)) {
      record.hadFocusInside = true;
      record.awaitsFocus = false;
    }
  };
  // A close during a focus move sees nothing focused. The control outside the
  // layer takes focus when the move ends, so focus is not stranded. The
  // capture-phase `blur` reaches the document before the element's own `blur`
  // and `focusout` listeners, so a close from either sees the note.
  const markFocusMoving = (event: FocusEvent) => {
    const next = event.relatedTarget;
    const layer = record.getLayer();
    if (
      isElement(next) &&
      isElement(event.target) &&
      layer != null &&
      layer.contains(event.target) &&
      !layer.contains(next)
    ) {
      record.focusMovingTo = next;
      // A target that cannot take focus when the move ends gets no focusin.
      // Clear the note after one task.
      setTimeout(() => {
        if (record.focusMovingTo === next) {
          record.focusMovingTo = null;
        }
      }, 0);
    }
  };
  // The layer may render in another document than its opener (a same-origin
  // iframe, a Picture-in-Picture window): focus inside it is reported there.
  const docs = new Set<Document>([doc]);
  if (layer != null) {
    docs.add(layer.ownerDocument);
  }
  for (const each of docs) {
    each.addEventListener('focusin', markFocusInside, true);
    each.addEventListener('blur', markFocusMoving, true);
  }
  record.stopListening = () => {
    for (const each of docs) {
      each.removeEventListener('focusin', markFocusInside, true);
      each.removeEventListener('blur', markFocusMoving, true);
    }
  };
  openLayerRecords.add(record);
  return record;
}

/**
 * The default return move. A control takes a plain focus, which scrolls it
 * into view. A container that only stands in (an ancestor, `main`) takes
 * focus with no scroll: a reveal would jump the page to its top edge.
 */
function focusReturnTarget(element: HTMLElement): void {
  // A modality other than a pointer's takes the plain focus path.
  focusForLastInputTemporarily(
    element,
    takesFocusAsIs(element) ? undefined : {preventScroll: true},
    'keyboard',
  );
}

// A caller's own focus function may do a plain focus, which a nonfocusable
// fallback (an ancestor, `main`) ignores. Such a fallback gets a tab stop
// until it loses focus.
function focusCandidate(record: LayerFocusRecord, element: HTMLElement): void {
  if (record.focus === focusReturnTarget || takesFocusAsIs(element)) {
    record.focus(element);
    return;
  }
  element.setAttribute('tabindex', '-1');
  record.focus(element);
  const dispose = () => {
    if (element.getAttribute('tabindex') === '-1') {
      element.removeAttribute('tabindex');
    }
  };
  if (element.ownerDocument.activeElement === element) {
    element.addEventListener('blur', dispose, {once: true});
  } else {
    dispose();
  }
}

/** Whether `element` sits inside a layer that is closing or already closed. */
function isInsideClosingLayer(element: Element): boolean {
  for (const record of openLayerRecords) {
    if (record.isClosing && record.getLayer()?.contains(element)) {
      return true;
    }
  }
  return false;
}

function isRendered(element: Element): boolean {
  const checkVisibility = (
    element as Element & {
      checkVisibility?: (options?: {visibilityProperty?: boolean}) => boolean;
    }
  ).checkVisibility;
  if (typeof checkVisibility === 'function') {
    return checkVisibility.call(element, {visibilityProperty: true});
  }
  const view = element.ownerDocument.defaultView;
  for (
    let current: Element | null = element;
    current != null;
    current = current.parentElement
  ) {
    if (current.hasAttribute('hidden')) {
      return false;
    }
    // A popover's own display follows its open state, which an engine
    // without `checkVisibility` may not reflect in computed style; an open
    // layer that holds a candidate is not the reason to skip it.
    const style = view?.getComputedStyle(current);
    if (style?.display === 'none' && !current.hasAttribute('popover')) {
      return false;
    }
    if (current === element && style?.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

/**
 * Whether an open modal dialog makes `element` inert: it is outside every
 * modal dialog while one is open. The browser sets no `inert` attribute for
 * this, so `[inert]` alone does not find it.
 */
function isInertUnderModalDialog(element: Element): boolean {
  let hasModal = false;
  for (const dialog of element.ownerDocument.querySelectorAll('dialog[open]')) {
    if (isModalDialog(dialog)) {
      if (dialog.contains(element)) {
        return false;
      }
      hasModal = true;
    }
  }
  return hasModal;
}

/** Whether returned focus may land on `element`. */
function canTakeReturnedFocus(element: Element | null): element is HTMLElement {
  return (
    isHTMLElement(element) &&
    element.isConnected &&
    !isPageRoot(element) &&
    !element.matches(':disabled') &&
    // Inert, hidden and aria-hidden subtrees, and a dialog that is neither
    // shown (open, or shown as a popover) nor displayed in flow, judged as
    // the focus trap judges them.
    isVisiblyFocusable(element) &&
    !isInertUnderModalDialog(element) &&
    !isInsideClosingLayer(element) &&
    isRendered(element)
  );
}

/** How a development warning names the layer: by its id when it has one. */
function nameOf(record: LayerFocusRecord, layer: Element | null): string {
  const id = layer?.id || record.layerId;
  return id ? `layer "${id}"` : 'a layer';
}

/** The element itself when it takes focus, else its first tab stop. Internal. */
export function focusableWithin(element: Element | null): HTMLElement | null {
  if (element == null) {
    return null;
  }
  if (isHTMLElement(element) && takesFocusAsIs(element)) {
    return element;
  }
  return tabStopsIn(element)[0] ?? null;
}

function* candidatesOf(record: LayerFocusRecord): Generator<Element | null> {
  yield record.opener;
  // A trigger may be a wrapper around the control (Popover's anchor wrapper).
  yield focusableWithin(record.getTrigger());
  if (record.layerId != null && record.layerId !== '') {
    const escaped =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(record.layerId)
        : record.layerId;
    yield record.doc.querySelector(`[aria-controls="${escaped}"]`);
  }
  yield record.getRestoreFallback();
  yield focusableWithin(record.getAnchor());
  const place = record.places.find(({container}) => container.isConnected);
  if (place != null) {
    const stops = tabStopsIn(place.container);
    yield stops[place.index] ?? null;
    yield stops[place.index - 1] ?? null;
    yield stops[place.index + 1] ?? null;
    yield stops[0] ?? null;
  }
  // The nearest connected ancestor that can take focus: the caller's check
  // skips an inert or hidden one for the next.
  for (const ancestor of record.ancestors) {
    if (ancestor.isConnected) {
      yield ancestor;
    }
  }
}

function* fullChain(record: LayerFocusRecord): Generator<Element | null> {
  for (
    let current: LayerFocusRecord | null = record;
    current != null;
    current = current.inherited
  ) {
    yield* candidatesOf(current);
  }
  for (
    let current: LayerFocusRecord | null = record.parent;
    current != null;
    current = current.parent
  ) {
    if (!current.isClosing) {
      yield current.getLayer();
      break;
    }
  }
  yield record.doc.querySelector('main');
}

function endRecord(record: LayerFocusRecord): void {
  record.isDone = true;
  record.stopListening();
  openLayerRecords.delete(record);
}

/** Whether focus is inside the record's layer now. */
function holdsFocus(record: LayerFocusRecord): boolean {
  const layer = record.getLayer();
  const active = (layer?.ownerDocument ?? record.layerDoc).activeElement;
  return layer != null && active != null && layer.contains(active);
}

/**
 * Whether closing the layer now would strand focus: focus entered the layer
 * and is now inside it, inside another closing layer, or on nothing. Focus
 * that already left stays where it is.
 */
export function isLayerFocusStranded(record: LayerFocusRecord): boolean {
  const {doc} = record;
  const layer = record.getLayer();
  const active = doc.activeElement;
  const layerDoc = layer?.ownerDocument ?? record.layerDoc;
  const layerActive = layerDoc.activeElement;
  const isInside =
    layer != null && layerActive != null && layer.contains(layerActive);
  if (!(record.hadFocusInside || isInside)) {
    return false;
  }
  const movingTo = record.focusMovingTo;
  if (
    movingTo != null &&
    movingTo.isConnected &&
    canTakeReturnedFocus(movingTo)
  ) {
    return false;
  }
  // A layer in a frame holds the page's focus as the frame element's.
  const frameHost =
    layerDoc === doc ? null : (layerDoc.defaultView?.frameElement ?? null);
  return (
    isFocusDetached(doc) ||
    isInside ||
    (frameHost != null &&
      active === frameHost &&
      isFocusLost(layer, layerDoc)) ||
    (active != null && isInsideClosingLayer(active))
  );
}

/**
 * Returns focus as a layer starts to close. Runs once per record. Call it
 * while the layer still holds focus: in the popover's `beforetoggle` to
 * closed, or before a dialog's `close()`. The browser's own restore acts only
 * while focus is in the closing layer, so it then has nothing to do.
 */
export function restoreLayerFocus(
  record: LayerFocusRecord,
  options?: {
    /**
     * Whether focus was stranded just before the layer closed, read by a
     * caller that must close first: a modal `<dialog>` makes the rest of the
     * page inert until `close()`, so nothing outside it can take focus
     * earlier. The browser's restore may already have moved focus by now.
     */
    wasStranded?: boolean;
    /**
     * Warn in development when no candidate can take focus. Off for a layer
     * removed with its page or view, where an empty chain is expected.
     */
    warnsWhenNothingQualifies?: boolean;
    /**
     * Try only the opener, and leave the record open when it cannot take
     * focus, for a later full return. A removal that is still in progress
     * may be taking the other candidates away.
     */
    isOpenerOnly?: boolean;
  },
): boolean {
  if (record.isDone || record.isClosing) {
    return false;
  }
  if (options?.isOpenerOnly === true) {
    const {opener} = record;
    if (!isLayerFocusStranded(record) || !canTakeReturnedFocus(opener)) {
      return false;
    }
    record.isClosing = true;
    focusCandidate(record, opener);
    endRecord(record);
    return true;
  }
  const isStranded = options?.wasStranded ?? isLayerFocusStranded(record);
  record.isClosing = true;
  const {doc} = record;
  const layer = record.getLayer();
  if (!isStranded) {
    endRecord(record);
    return false;
  }
  // A layer this one opened takes over the chain, and runs it at its own
  // close. Only a layer that holds focus, or is opening and still to take
  // it, does. One that never took focus (a typeahead's result list), or that
  // focus has left, would drop the chain, so this layer runs it now.
  for (const other of openLayerRecords) {
    if (
      other !== record &&
      !other.isClosing &&
      other.parent === record &&
      (holdsFocus(other) || other.awaitsFocus)
    ) {
      other.inherited = record;
      endRecord(record);
      return false;
    }
  }
  for (const candidate of fullChain(record)) {
    if (canTakeReturnedFocus(candidate)) {
      focusCandidate(record, candidate);
      if (doc.activeElement === candidate) {
        endRecord(record);
        return true;
      }
    }
  }
  if (options?.warnsWhenNothingQualifies === false) {
    endRecord(record);
    return false;
  }
  devWarn(
    'focus return',
    `no element could take focus when ${nameOf(record, layer)} closed; focus is left where it is.`,
  );
  endRecord(record);
  return false;
}

/**
 * Moves focus out of a layer that hides without closing: to the first of
 * `first` that can take focus, then along the record's chain. The record
 * stays open for the layer's close.
 */
export function moveFocusOutOfHiddenLayer(
  record: LayerFocusRecord,
  first: ReadonlyArray<Element | null>,
): boolean {
  const layer = record.getLayer();
  for (const candidate of [...first, ...fullChain(record)]) {
    if (
      canTakeReturnedFocus(candidate) &&
      !(layer?.contains(candidate) ?? false)
    ) {
      focusCandidate(record, candidate);
      if (record.doc.activeElement === candidate) {
        return true;
      }
    }
  }
  devWarn(
    'focus return',
    `no element could take focus when ${nameOf(record, layer)} hid; focus falls to the page body.`,
  );
  return false;
}

/** Stops a record without moving focus: the layer unmounted before it opened. */
export function cancelLayerFocus(record: LayerFocusRecord): void {
  if (!record.isDone) {
    endRecord(record);
  }
}

/** Test seam: forgets every open record. Internal. */
export function resetLayerFocusRecordsForTests(): void {
  for (const record of openLayerRecords) {
    record.stopListening();
  }
  openLayerRecords.clear();
}
