// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file bottomSheetStack.ts
 * @input Uses the DOM (dialog elements, document order) and focusForLastInput
 * @output Exports the private bottom-sheet stack registry: registration of
 *   sheet hosts (modal sheets stack; non-modal sheets are a group of their
 *   own, hosted as manual popovers), open-order ranking with tree-order
 *   ties, native top-layer reconciliation, one view per host (top, covered,
 *   recede depth, scrim ownership, blocking), the replace handoff between a
 *   sheet closing and a sheet opening in the same update, and the native
 *   show/hide and focus helpers the hosts share
 * @position Internal to BottomSheet; consumed by the standalone host in
 *   BottomSheet.tsx and by BottomSheetSwitcher. Not exported from the package
 *   root, and no public API reaches it.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/BottomSheet/BottomSheet.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.tsx
 * - /packages/core/src/BottomSheet/BottomSheetStacking.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheetReplace.test.tsx
 * - /packages/core/src/BottomSheet/BottomSheet.doc.mjs
 * - /apps/storybook/stories/BottomSheetReplace.stories.tsx
 *
 * ## Why a registry and not a component
 *
 * Every modal sheet keeps its own native `<dialog>` and its own open state. A
 * sheet opened while another sheet is open is a stacked sheet: the browser's
 * top layer already paints the later `showModal()` above the earlier one, and
 * the later modal dialog already blocks the earlier one. What the browser does
 * NOT know is that the two dialogs are sheets of one stack, so this registry
 * supplies the rest: which sheet is on top, how far back each covered sheet
 * recedes, whose `::backdrop` is the one visible scrim, and when the native
 * order would come out wrong (several sheets opening in one commit) it puts
 * the top layer right before the frame paints. Nothing here is a public
 * surface; the hosts call it from their commit-phase effects only.
 *
 * ## Order is open order, ties are tree order
 *
 * Each open cycle of a sheet gets a rank: the batch it opened in, then a
 * running sequence. A batch is one React commit: registrations that arrive
 * between two seals belong to the same commit, because the hosts seal in
 * passive effects and React runs every pending passive effect before the next
 * commit's layout effects (and flushes them synchronously after a sync
 * commit). Later batch is higher. Within one batch there is no open order, so
 * document order of the dialog elements decides: a sheet before the sheets
 * rendered in its content, siblings in the order they are written. That is the
 * order the first painted frame of a deep link must show, and effect order
 * (child first) gets it backwards; the rank is read at compare time, after
 * every registration of the commit has arrived, so it does not.
 *
 * ## The top layer is reconciled, not trusted
 *
 * The registry remembers the order it called `showModal()` in. After every
 * change it computes the order the ranks want; where the two diverge it closes
 * the dialogs from the first divergence up and shows them again in rank order.
 * That happens inside the commit, before paint, so a deep link whose inner
 * sheet registered first is repaired without a frame in between. A sheet that
 * closes and reopens gets a new rank and is re-shown on top the same way;
 * only the dialogs that have to move up are re-shown, the rest keep their
 * place, their backdrop and any motion in flight.
 *
 * ## A replace is a move the person makes from one sheet to the next
 *
 * One sheet closing and another opening in the same commit, where the closing
 * sheet was the top open sheet of its stack (no other open sheet above it,
 * the opening sheet aside) and the interaction came from inside it (the
 * control last pressed — or, with no fresh press, the focused element — was
 * in its dialog), is a replace: the person is moving from one step to the
 * next, not stacking one on the other. The registry then runs the handoff a BottomSheetSwitcher runs
 * between its steps, on the two standalone dialogs: the entering sheet rises
 * above the retained one; a taller retained sheet moves down to meet it; the
 * retained sheet fades only after both motions complete, then its dialog
 * closes and the entering sheet takes over the scrim in the same frame. The
 * retained sheet is inert at once, keeps no place in the dismissal order, and
 * lends its opener to the sheet replacing it, so closing the flow later
 * returns focus to where the flow began. A covered sheet closing (not the
 * top), a sheet closing in a different update from the open, or a close and
 * an open driven from a control outside the closing sheet (two owners acting
 * in one update) is never a replace, so a push over a stack and a pop out of
 * one keep their motion and their own openers. Non-modal sheets
 * (`hasScrim={false}`) replace each other too: they are hosted as manual
 * popovers, so the top layer orders them, but they are a group of their own
 * that never stacks, recedes, or owns a scrim.
 *
 * ## One state per page, per document
 *
 * The state lives on `globalThis` so that two copies of this module on one
 * page that speak the same stack protocol version share one stack (see
 * StackState); everything the stack reads and writes across commits — the
 * entries, each document's shown order, which documents have the press
 * listeners, the deferred non-modal sheets and their watchers, the element to
 * keep focused across a re-show — is in that shared state and none of it is
 * per copy. The one module-level value is the engine probe's answer, a fact
 * about the browser that every copy measures alike. A copy on another
 * protocol version keeps a stack of its own. Within a state, each document is
 * its own stack: a sheet portaled into another document has that document's
 * top layer, focus and order.
 */

import {notifyTopLayerEntry} from '../Layer/modalOutlet';
import {focusForLastInput} from '../utils/focusReturn';

export interface BottomSheetStackView {
  /** Another modal sheet is presented alongside this one. */
  readonly isStacked: boolean;
  /** This sheet is the open sheet that is on top. */
  readonly isTop: boolean;
  /** This sheet is open with at least one open sheet above it. */
  readonly isCovered: boolean;
  /** Open sheets above this one; drives how far the sheet recedes. */
  readonly depth: number;
  /** This sheet's `::backdrop` is the one visible scrim of the stack. */
  readonly ownsScrim: boolean;
  /**
   * This sheet took the scrim over from a sheet below it that is still
   * sliding out, so its backdrop must appear at once rather than fade in.
   */
  readonly isScrimHandoff: boolean;
  /**
   * This sheet is covered and contains no presented sheet, so its whole
   * dialog can be marked inert and hidden from assistive technology.
   */
  readonly isBlocked: boolean;
  /**
   * This sheet is closing and an open sheet above it owns the scrim now, so
   * its own backdrop must leave at once rather than fade: the dim is the
   * other sheet's from this frame on, and two backdrops would double it.
   */
  readonly isScrimTakenOver: boolean;
  /**
   * This closed sheet is being replaced by the sheet opened in the same
   * update: it stays in place (`covered`), moves down to the entering sheet's
   * top edge (`aligning`), or fades (`fading`), instead of sliding out.
   */
  readonly replacedMotion: BottomSheetReplacedMotion | null;
  /** How far down a replaced sheet moves to meet the entering sheet, in px. */
  readonly alignmentOffset: number;
  /** This open sheet is replacing the sheet that closed in the same update. */
  readonly isReplacing: boolean;
}

export type BottomSheetReplacedMotion = 'covered' | 'aligning' | 'fading';

/** The motions a host's panel reports to the registry during a replace. */
export type BottomSheetReplaceMotion =
  'entering' | 'aligning' | 'fading' | 'exiting';

export const BOTTOM_SHEET_STACK_DEFAULT_VIEW: BottomSheetStackView = {
  isStacked: false,
  isTop: false,
  isCovered: false,
  depth: 0,
  ownsScrim: false,
  isScrimHandoff: false,
  isBlocked: false,
  isScrimTakenOver: false,
  replacedMotion: null,
  alignmentOffset: 0,
  isReplacing: false,
};

/**
 * Why the registry moves focus into a sheet: it was shown on top (`open`), a
 * close above it revealed it (`reveal`), or it is replacing the sheet the
 * person was in (`replace`: focus follows the person from one step to the
 * next, whatever the native host did with it).
 */
export type BottomSheetFocusReason = 'open' | 'reveal' | 'replace';

/** The sheets of one document's modal stack that close in the same update. */
interface ClosingGroup {
  /** Bottom to top. */
  members: Entry[];
  /** Members whose dialogs have not left the top layer yet. */
  pending: Set<Entry>;
  /** The bottom-most member's return target, read when the group is sealed. */
  returnTarget: HTMLElement | null;
  /** Focus has been returned for this group. */
  reported?: boolean;
}

export interface BottomSheetStackRegistration {
  /** Stable identity of the host component instance. */
  key: object;
  /** The host's native dialog. */
  getElement: () => HTMLDialogElement | null;
  /**
   * The element whose place in the tree orders this level against the other
   * sheets of its commit, when it is not the dialog itself: a switcher flow
   * is realized by whichever step dialog is active, so its flow wrapper — the
   * one element that contains every step — stands for it, and a handoff
   * cannot reorder the flow against a sheet opened in the same commit.
   */
  getTreeAnchor?: () => Element | null;
  /** Present the dialog modally (`showModal()`), capturing the opener first. */
  show: () => void;
  /** Take the dialog out of the top layer (`close()`) for a re-show. */
  hide: () => void;
  /** Move focus into the sheet: shown on top, or revealed by a close above. */
  focus: (reason: BottomSheetFocusReason) => void;
  /**
   * Where focus returns when this sheet closes the stack: its explicit
   * final-focus target, else the element that opened it. Read by the
   * registry when several sheets close in one update.
   */
  getReturnTarget?: () => HTMLElement | null;
  /** Receive this host's view whenever it changes. */
  onView: (view: BottomSheetStackView) => void;
  /**
   * What a host must supply to take part in a replace. A host without it (a
   * switcher flow, which replaces its own steps) is never paired.
   */
  replaceable?: BottomSheetReplaceable;
}

export interface BottomSheetReplaceable {
  /** The host's visual panel, measured for the replace alignment. */
  getPanel: () => HTMLElement | null;
  /** The element focus returns to when the sheet closes the flow. */
  getOpener: () => HTMLElement | null;
  /** Adopt the replaced sheet's opener, so the flow closes back to it. */
  setOpener: (opener: HTMLElement | null) => void;
  /** The replace is over: this replaced sheet is hidden and its dialog closed. */
  finish: () => void;
}

interface Rank {
  batch: number;
  seq: number;
}

interface ReplaceState {
  /** The sheet that opened in the same update and now stands in for this one. */
  replacer: Entry;
  motion: BottomSheetReplacedMotion;
  alignmentOffset: number;
  isAlignmentComplete: boolean;
  isEnteringComplete: boolean;
}

interface Entry extends BottomSheetStackRegistration {
  rank: Rank;
  isOpen: boolean;
  /** The document whose top layer this sheet's dialog is in. */
  doc: Document;
  /**
   * Modal sheets stack with each other; non-modal sheets (`hasScrim={false}`)
   * form their own group per document: they never stack, recede or own a
   * scrim, but they replace each other and keep their top-layer order.
   */
  isModal: boolean;
  view: BottomSheetStackView;
  /** Set on a closed sheet while another sheet replaces it. */
  replace: ReplaceState | null;
  /** Set on an open sheet while it replaces the sheet that closed with it. */
  replacing: Entry | null;
  /**
   * Reopened while it was being replaced: its panel is already in place, so
   * when it replaces in turn its entrance is complete the moment it starts.
   */
  isEnteringInPlace: boolean;
}

const ALIGNMENT_THRESHOLD_PX = 1;

/**
 * The registry's state. One per JavaScript realm, shared by every copy of this
 * module in it that speaks the same stack protocol version: two copies of
 * the package on one page (two bundles, a dev server serving the same file
 * under two URLs, a micro-frontend) must see one stack, or each would show
 * its own sheets over the other's with two scrims and no order. The state
 * lives on `globalThis` under a symbol that names the protocol version
 * (STACK_PROTOCOL_VERSION), so a copy on another version finds no state of
 * its own and keeps a stack of its own; the shape it carries is the guard
 * against a key collision.
 */
interface StackState {
  shape: number;
  entries: Entry[];
  // The order the presented entries were shown in, per group (one document's
  // modal sheets, one document's non-modal sheets): each document has its
  // own top layer, and the two groups never reorder each other.
  shownOrder: WeakMap<Document, {modal: Entry[]; nonModal: Entry[]}>;
  // Documents that have the press listeners, each with the function that
  // removes them: one set per document, installed with the document's first
  // registered sheet and removed when its last one leaves (the listeners
  // feed this shared state, so a second copy must not add another set).
  listenedDocuments: WeakMap<Document, () => void>;
  // The open/close flips of the current batch (one commit); a replace pairs
  // one of each. Cleared with the seal.
  batchOpened: Entry[];
  batchClosed: Entry[];
  // The control the person acted from, for the batch's first flip: the
  // target of the last pointer or key press in the document (recorded in the
  // capture phase, so it is known whether or not the press moved focus — a
  // non-modal sheet takes no focus, and some browsers do not focus a clicked
  // button), else where focus was, read before any dialog of this commit is
  // shown. A replace is recognised by it.
  batchActor: Element | null;
  // The target is held weakly: a press on an element that has since been
  // removed and dropped must not keep it alive until the next press.
  lastPress: WeakMap<Document, {target: WeakRef<Element>; at: number}>;
  // Retained sheets whose replacer closed in this batch; dropped once the
  // batch's pairing is known, unless the batch reopened them.
  pendingDrops: Entry[];
  // A replacer that still owes the move of focus into itself (done once its
  // dialog is shown).
  pendingReplaceFocus: Entry | null;
  // The pair this batch made, and the opener the replacer had before it
  // adopted the replaced sheet's: a later flip of the same commit (a third
  // sheet closing or opening) makes the tally no longer one close and one
  // open, and the pair is undone — the commit is then several sheets
  // changing, which keep their own push and pop motion.
  batchPair: {
    replaced: Entry;
    replacer: Entry;
    replacerOpener: HTMLElement | null;
  } | null;
  // Modal sheets closing together in one update ("Close all"): focus returns
  // once, from the bottom-most of them, after the last of them has left the
  // top layer. Sealed from `batchClosed` when the batch ends.
  closingTogether: Map<Entry, ClosingGroup>;
  // Rank persists across a StrictMode replay (unregister and register in one
  // synchronous pass) so the replay cannot promote a sheet. A rank marked
  // closed is spent: the next open takes a new one.
  rankByKey: WeakMap<
    object,
    Rank & {isClosed: boolean; detachedBatch: number | null}
  >;
  currentBatch: number;
  nextSeq: number;
  isBatchDirty: boolean;
  isSealScheduled: boolean;
  // The element a step present blurred while the person was in a sheet above
  // the flow; the next top-layer reconcile lands focus on it again. Per
  // document, within one commit.
  focusToKeep: WeakMap<Document, HTMLElement>;
  // Non-modal sheets presented by `show()` because a modal outside them was
  // open, waiting to enter the top layer, with the watchers that look again
  // (see deferTopLayerEntry).
  deferredTopLayer: WeakMap<Document, DeferredTopLayer>;
}

interface DeferredTopLayer {
  deferred: Map<HTMLDialogElement, HTMLElement | null>;
  blockers: WeakSet<HTMLDialogElement>;
  removals: MutationObserver | null;
  /** Removes the document `close` listener; set while anything waits. */
  stopListeningForClose: (() => void) | null;
}

/**
 * The stack protocol version: the shape and meaning of Entry, the
 * registration, the batch/seal protocol and the shared listeners. Copies of
 * the package on one page share one stack per document when they speak the
 * same protocol (`component:BottomSheet` PR1); the version is part of the
 * document-global key, so a copy on another protocol finds no state of its
 * own version and keeps a stack of its own — two independent stacks, each
 * ordering only the sheets its copy renders, never a shared state read with
 * the wrong shape. Bump it whenever any of those change.
 */
const STACK_PROTOCOL_VERSION = 8;
const STACK_STATE_KEY = Symbol.for(
  `astryx.bottomSheetStack.v${STACK_PROTOCOL_VERSION}`,
);
const STACK_STATE_SHAPE = STACK_PROTOCOL_VERSION;

function createStackState(): StackState {
  return {
    shape: STACK_STATE_SHAPE,
    entries: [],
    shownOrder: new WeakMap(),
    listenedDocuments: new WeakMap(),
    batchOpened: [],
    batchClosed: [],
    batchActor: null,
    batchPair: null,
    lastPress: new WeakMap(),
    pendingDrops: [],
    pendingReplaceFocus: null,
    closingTogether: new Map(),
    rankByKey: new WeakMap(),
    currentBatch: 0,
    nextSeq: 0,
    isBatchDirty: false,
    isSealScheduled: false,
    focusToKeep: new WeakMap(),
    deferredTopLayer: new WeakMap(),
  };
}

function acquireStackState(): StackState {
  const holder = globalThis as {[STACK_STATE_KEY]?: StackState};
  const shared = holder[STACK_STATE_KEY];
  if (shared != null) {
    // The key names the version, so a state found under it is this
    // protocol's; the shape check is the guard against a key collision.
    return shared.shape === STACK_STATE_SHAPE ? shared : createStackState();
  }
  const created = createStackState();
  holder[STACK_STATE_KEY] = created;
  return created;
}

const state = acquireStackState();

function takeRank(): Rank {
  state.isBatchDirty = true;
  scheduleSeal();
  return {batch: state.currentBatch, seq: state.nextSeq++};
}

function scheduleSeal(): void {
  // Backstop for a commit whose hosts run no passive effect afterwards (a
  // subtree React just hid). A later task is always a later batch.
  if (state.isSealScheduled || typeof queueMicrotask !== 'function') {
    return;
  }
  state.isSealScheduled = true;
  queueMicrotask(() => {
    state.isSealScheduled = false;
    sealBottomSheetBatch();
  });
}

/**
 * End the current batch. Hosts call it from a passive effect, which React runs
 * after every layout effect of the same commit and before the next commit;
 * registrations on either side of it are therefore different open orders.
 */
export function sealBottomSheetBatch(): void {
  flushPendingDrops();
  sealClosingGroups();
  if (state.isBatchDirty) {
    state.currentBatch += 1;
    state.isBatchDirty = false;
  }
  state.batchOpened = [];
  state.batchClosed = [];
  state.batchActor = null;
  state.batchPair = null;
}

/**
 * Two or more modal sheets of one stack closing in the same update with no
 * sheet of that stack left open and nothing opening: "Close all". Each one
 * would return focus on its own, at depth 0, to an opener that is either
 * inside a dialog that is closing with it or on a page that is still inert
 * behind the other modals — so none of them can. The group returns focus
 * once instead, from its bottom-most sheet, after the last of its dialogs
 * has left the top layer. A single sheet closing, a non-modal sheet, and a
 * batch that also opens a sheet are not groups: their own close handles
 * focus (the replace and the pop have their own rules).
 */
function sealClosingGroups(): void {
  if (state.batchOpened.length > 0) {
    return;
  }
  const closingModal = state.batchClosed.filter(
    entry => entry.isModal && entry.replace == null && entry.replacing == null,
  );
  if (closingModal.length < 2) {
    return;
  }
  const byDoc = new Map<Document, Entry[]>();
  for (const entry of closingModal) {
    const list = byDoc.get(entry.doc) ?? [];
    list.push(entry);
    byDoc.set(entry.doc, list);
  }
  for (const [doc, closing] of byDoc) {
    if (closing.length < 2) {
      continue;
    }
    const stack = sortedEntries(doc, true);
    if (stack.some(entry => entry.isOpen)) {
      // Sheets remain open beneath: the pops return into the revealed sheet
      // through the ordinary close path.
      continue;
    }
    const members = stack.filter(entry => closing.includes(entry));
    const bottom = members[0];
    const group: ClosingGroup = {
      members,
      pending: new Set(members),
      returnTarget: bottom.getReturnTarget?.() ?? null,
    };
    for (const entry of members) {
      state.closingTogether.set(entry, group);
    }
  }
}

/**
 * Whether `key` closes as part of a "Close all" group. Its host then leaves
 * the top layer without returning focus itself; the registry returns it
 * once the whole group has left.
 */
export function isClosingTogether(key: object): boolean {
  const entry = state.entries.find(candidate => candidate.key === key);
  return entry != null && state.closingTogether.has(entry);
}

function completeClosingGroup(group: ClosingGroup): void {
  if (group.pending.size > 0 || group.reported) {
    return;
  }
  group.reported = true;
  const target = group.returnTarget;
  if (target != null && target.isConnected) {
    focusForLastInput(target);
  }
}

/**
 * A member of a "Close all" group has left the top layer. When it is the
 * last one, focus returns to the group's target: the bottom-most sheet's
 * final-focus target or opener, now that no modal dialog stands in the way.
 */
export function reportClosedTogether(key: object): void {
  const entry = state.entries.find(candidate => candidate.key === key);
  const group = entry == null ? undefined : state.closingTogether.get(entry);
  if (entry == null || group == null) {
    return;
  }
  leaveClosingGroup(entry, group);
}

function leaveClosingGroup(entry: Entry, group: ClosingGroup): void {
  state.closingTogether.delete(entry);
  group.pending.delete(entry);
  completeClosingGroup(group);
}

/**
 * Remember the last press in a document: a pointer down, a click (pointer,
 * touch, keyboard activation or code: it is what runs the handler that flips
 * the sheets) or a key down. One capture-phase listener per event per
 * document, installed with the first sheet registered in it; the target is
 * kept weakly.
 */
function listenForPresses(doc: Document): void {
  if (state.listenedDocuments.has(doc)) {
    return;
  }
  const record = (event: Event) => {
    if (event.target instanceof Element) {
      state.lastPress.set(doc, {
        target: new WeakRef(event.target),
        at: Date.now(),
      });
    }
  };
  doc.addEventListener('pointerdown', record, true);
  doc.addEventListener('click', record, true);
  doc.addEventListener('keydown', record, true);
  state.listenedDocuments.set(doc, () => {
    doc.removeEventListener('pointerdown', record, true);
    doc.removeEventListener('click', record, true);
    doc.removeEventListener('keydown', record, true);
    state.lastPress.delete(doc);
  });
}

/**
 * The document's last registered sheet left: nothing feeds the press record
 * any more, so the listeners go (`architecture:react-component-runtime`
 * INV5: a subscription lives as long as what reads it). The next sheet to
 * register in the document installs them again.
 */
function stopListeningForPresses(doc: Document): void {
  if (state.entries.some(entry => entry.doc === doc)) {
    return;
  }
  const remove = state.listenedDocuments.get(doc);
  if (remove != null) {
    state.listenedDocuments.delete(doc);
    remove();
  }
}

/**
 * A press is the actor of a flip only while it is fresh: the handler a press
 * runs flips the sheets within the same task, milliseconds later. A flip
 * that arrives later (a step change after a save resolves) is not that
 * press's doing, and reads focus instead. A press is also spent once the
 * sheet it landed in has been replaced or has closed — its target sits in
 * an inert or no longer presented dialog — or once a replace has consumed
 * it: a step advanced by code shortly after a Submit press (a "Processing"
 * interstitial) is then judged by where focus is, inside the step, and
 * hands off as DEP-0015 promises.
 */
const PRESS_ACTOR_WINDOW_MS = 1000;

function actorFor(doc: Document, flipping: Entry): Element | null {
  const press = state.lastPress.get(doc);
  const target = press?.target.deref();
  if (
    press != null &&
    target != null &&
    target.isConnected &&
    Date.now() - press.at <= PRESS_ACTOR_WINDOW_MS &&
    !isPressSpent(target, flipping)
  ) {
    return target;
  }
  return doc.activeElement;
}

/**
 * A press is spent when the sheet it landed in was already closed or
 * replaced before this flip — not the sheet this very flip is closing, which
 * is the ordinary replace made from inside it.
 */
function isPressSpent(target: Element, flipping: Entry): boolean {
  const owning = state.entries.find(entry => {
    const element = entry.getElement();
    return (
      entry.doc === flipping.doc && element != null && element.contains(target)
    );
  });
  if (owning == null || owning === flipping) {
    return false;
  }
  return !owning.isOpen || owning.replace != null;
}

/** Record a flip of the current batch, and who acted if it is the first. */
function recordFlip(entry: Entry, flip: 'opened' | 'closed'): void {
  if (state.batchOpened.length === 0 && state.batchClosed.length === 0) {
    state.batchActor = actorFor(entry.doc, entry);
  }
  (flip === 'opened' ? state.batchOpened : state.batchClosed).push(entry);
}

function compareRank(a: Entry, b: Entry): number {
  if (a.rank.batch !== b.rank.batch) {
    return a.rank.batch - b.rank.batch;
  }
  // One commit: tree order. A dialog that precedes another in document order
  // (including one that contains the other) is below it.
  const aEl = a.getTreeAnchor?.() ?? a.getElement();
  const bEl = b.getTreeAnchor?.() ?? b.getElement();
  if (aEl != null && bEl != null && aEl !== bEl) {
    const position = aEl.compareDocumentPosition(bEl);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
  }
  return a.rank.seq - b.rank.seq;
}

/** The sheets of one group (document + modality), bottom to top. */
function sortedEntries(doc: Document, isModal: boolean): Entry[] {
  return state.entries
    .filter(entry => entry.doc === doc && entry.isModal === isModal)
    .sort(compareRank);
}

/** The sheets `entry` shares a group with, bottom to top. */
function groupOf(entry: Entry): Entry[] {
  return sortedEntries(entry.doc, entry.isModal);
}

/** The shown order of one group, read from or written to the shared state. */
function getShownOrder(doc: Document, isModal: boolean): Entry[] {
  const orders = state.shownOrder.get(doc);
  if (orders == null) {
    return [];
  }
  return isModal ? orders.modal : orders.nonModal;
}
function setShownOrder(doc: Document, isModal: boolean, order: Entry[]): void {
  const orders = state.shownOrder.get(doc) ?? {modal: [], nonModal: []};
  if (isModal) {
    orders.modal = order;
  } else {
    orders.nonModal = order;
  }
  state.shownOrder.set(doc, orders);
}

function isSameView(a: BottomSheetStackView, b: BottomSheetStackView): boolean {
  return (
    a.isStacked === b.isStacked &&
    a.isTop === b.isTop &&
    a.isCovered === b.isCovered &&
    a.depth === b.depth &&
    a.ownsScrim === b.ownsScrim &&
    a.isScrimHandoff === b.isScrimHandoff &&
    a.isBlocked === b.isBlocked &&
    a.isScrimTakenOver === b.isScrimTakenOver &&
    a.replacedMotion === b.replacedMotion &&
    a.alignmentOffset === b.alignmentOffset &&
    a.isReplacing === b.isReplacing
  );
}

function computeViews(order: Entry[], isModal: boolean): void {
  const changed: Entry[] = [];
  if (!isModal) {
    // Non-modal sheets never stack: no recede, no scrim, no top-layer order
    // against modal sheets. Their view carries only the replace a pair of
    // them may be running.
    for (const entry of order) {
      const view: BottomSheetStackView = {
        ...BOTTOM_SHEET_STACK_DEFAULT_VIEW,
        replacedMotion: entry.replace?.motion ?? null,
        alignmentOffset: entry.replace?.alignmentOffset ?? 0,
        isReplacing: entry.replacing != null,
      };
      if (!isSameView(entry.view, view)) {
        entry.view = view;
        changed.push(entry);
      }
    }
    for (const entry of changed) {
      entry.onView(entry.view);
    }
    return;
  }
  const openEntries = order.filter(entry => entry.isOpen);
  const top = openEntries[openEntries.length - 1] ?? null;
  // A replaced sheet keeps the scrim while it is retained; the sheet replacing
  // it takes the scrim over, instantly, when the replaced sheet leaves.
  const owner =
    order.find(entry => entry.isOpen || entry.replace != null) ?? null;
  order.forEach((entry, index) => {
    let depth = 0;
    for (let above = index + 1; above < order.length; above += 1) {
      // The sheet replacing this one stands in its place, not above it.
      if (order[above].isOpen && order[above] !== entry.replace?.replacer) {
        depth += 1;
      }
    }
    const isCovered = entry.isOpen && depth > 0;
    const element = entry.getElement();
    const containsPresented =
      element != null &&
      order.some(other => {
        const otherElement = other.getElement();
        return (
          other !== entry &&
          otherElement != null &&
          element.contains(otherElement)
        );
      });
    const ownsScrim = entry === owner;
    const isScrimHandoff =
      ownsScrim &&
      entry.isOpen &&
      order.slice(0, index).some(below => !below.isOpen);
    const view: BottomSheetStackView = {
      isStacked: order.length > 1,
      isTop: entry === top,
      isCovered,
      depth,
      ownsScrim,
      isScrimHandoff,
      isBlocked: isCovered && !containsPresented,
      isScrimTakenOver: !entry.isOpen && owner != null && owner !== entry,
      replacedMotion: entry.replace?.motion ?? null,
      alignmentOffset: entry.replace?.alignmentOffset ?? 0,
      isReplacing: entry.replacing != null,
    };
    if (!isSameView(entry.view, view)) {
      entry.view = view;
      changed.push(entry);
    }
  });
  for (const entry of changed) {
    entry.onView(entry.view);
  }
}

/**
 * Present a switcher step's dialog modally with no focus to return to.
 * showModal() records the element focused at that moment and close() moves
 * focus back to it, in Chromium and WebKit even when focus is in another
 * dialog by then. For a step that element is the control that advanced the
 * flow (Continue, Back) or the flow's opener, and the dialog closes a fade
 * later, while the user is in the next step: the return would pull focus
 * off the active panel with no user action. Blurring first leaves nothing
 * recorded, so the close moves nothing; the entering step then focuses its
 * own panel, and the switcher returns focus to the opener itself when the
 * flow ends. The blur happens in the same task as the present, so no frame
 * paints without focus.
 */
export function presentStepModally(dialog: HTMLDialogElement): void {
  const doc = dialog.ownerDocument;
  const focused = doc.activeElement;
  if (focused instanceof HTMLElement && focused !== doc.body) {
    // Focus in another open dialog that does not contain this step — a sheet
    // stacked over the flow, with the person typing in it while code moves
    // the flow on — is theirs to keep: the registry puts that sheet back on
    // top right after this and lands focus on this element again.
    const focusedDialog = focused.closest('dialog');
    if (
      focusedDialog != null &&
      focusedDialog !== dialog &&
      !focusedDialog.contains(dialog) &&
      !dialog.contains(focusedDialog) &&
      isSheetHostPresented(focusedDialog)
    ) {
      state.focusToKeep.set(doc, focused);
    }
    focused.blur();
  }
  dialog.showModal();
}

/**
 * Present a switcher dialog whose backdrop must start, and stay, clear: the
 * opacity is set with the scrim transition pinned to 0s, the dialog is
 * presented, and the pin is lifted only after a style flush has applied the
 * clear backdrop, so no frame eases from a previous backdrop value.
 */
export function presentWithClearScrim(dialog: HTMLDialogElement): void {
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', '0');
  presentStepModally(dialog);
  if (typeof getComputedStyle === 'function') {
    void getComputedStyle(dialog, '::backdrop').opacity;
  }
  dialog.style.removeProperty('--_sheet-scrim-duration');
}

/** The pending restore of a dialog's scrim transition; one per host. */
export interface BottomSheetScrimWrite {
  frame: number | null;
}

/**
 * Write a dialog's scrim opacity. A change while the dialog is up is a change
 * of scrim owner, and lands with no transition at all: a `0.01s` duration
 * still paints one frame at the old value, which reads as a dip or, with the
 * old owner's backdrop still fading, as a doubled dim. The pin
 * (`--_sheet-scrim-duration: 0s`, inline) stays for two animation frames
 * (two nested `requestAnimationFrame`s: the first frame paints the new value,
 * the second confirms it is on screen before the stylesheet's duration
 * returns). Hosts cancel the pending restore with `cancelScrimWrite` when
 * they unmount.
 */
export function writeScrimOpacity(
  dialog: HTMLDialogElement | null,
  opacity: '0' | '1',
  pending: BottomSheetScrimWrite,
): void {
  if (dialog == null) {
    return;
  }
  if (
    !dialog.open ||
    dialog.style.getPropertyValue('--_sheet-scrim-opacity') === opacity
  ) {
    dialog.style.setProperty('--_sheet-scrim-opacity', opacity);
    return;
  }
  dialog.style.setProperty('--_sheet-scrim-duration', '0s');
  dialog.style.setProperty('--_sheet-scrim-opacity', opacity);
  cancelScrimWrite(pending);
  pending.frame = requestAnimationFrame(() => {
    pending.frame = requestAnimationFrame(() => {
      pending.frame = null;
      dialog.style.removeProperty('--_sheet-scrim-duration');
    });
  });
}

export function cancelScrimWrite(pending: BottomSheetScrimWrite): void {
  if (pending.frame != null) {
    cancelAnimationFrame(pending.frame);
    pending.frame = null;
  }
}

/**
 * Whether a sheet's dialog is presented by the browser: as a modal dialog
 * (`open`), as a manual popover (a non-modal sheet in the top layer), or by
 * `show()` (a non-modal sheet below the Popover API support floor).
 */
export function isSheetHostPresented(
  dialog: HTMLDialogElement | null,
): boolean {
  if (dialog == null) {
    return false;
  }
  if (dialog.open) {
    return true;
  }
  try {
    return dialog.matches(':popover-open');
  } catch {
    // jsdom and pre-Popover browsers do not recognise :popover-open.
    return false;
  }
}

/**
 * Whether a modal dialog that does not contain `element` is open in its
 * document. Such a modal makes everything outside it inert, so a non-modal
 * sheet outside it must not paint above it.
 */
export function hasOpenModalOutside(element: Element): boolean {
  return openModalsOutside(element).length > 0;
}

/** The open modal dialogs that do not contain `element`; see above. */
function openModalsOutside(element: Element): HTMLDialogElement[] {
  const blockers: HTMLDialogElement[] = [];
  for (const dialog of Array.from(
    element.ownerDocument.querySelectorAll<HTMLDialogElement>('dialog[open]'),
  )) {
    if (dialog === element || dialog.contains(element)) {
      continue;
    }
    // A modal on its way out (a closing sheet keeps its dialog modal through
    // the exit animation, inert and hidden) blocks nothing any more: it is
    // gone for this decision.
    if (
      dialog.hasAttribute('inert') ||
      dialog.getAttribute('aria-hidden') === 'true'
    ) {
      continue;
    }
    if (isModalDialog(dialog)) {
      blockers.push(dialog);
    }
  }
  return blockers;
}

/**
 * Non-modal sheets presented by `show()` because a modal outside them was
 * open, waiting to enter the top layer once it has gone. Per document, with
 * one `close` listener per document: any dialog closing is a reason to look
 * again, and so is every sheet-stack update (a closing modal sheet turns
 * inert before its dialog closes). An open modal removed from the document
 * fires no `close` — a `{isEditing && <Dialog isOpen>}` that unmounts while
 * open — so while anything waits, a mutation observer watches removals too
 * and looks again when a removed subtree held one of the dialogs that caused
 * a deferral. Those blockers are recorded at defer time: `:modal` is the
 * mark that matters, and it leaves with the dialog's top-layer membership,
 * so it cannot be read off a removed node (nor can `aria-modal`, which a
 * `showModal()` host such as MobileNav or Lightbox does not set).
 */

function deferTopLayerEntry(
  dialog: HTMLDialogElement,
  panel: HTMLElement | null,
  blockers: ReadonlyArray<HTMLDialogElement>,
): void {
  const doc = dialog.ownerDocument;
  let entry = state.deferredTopLayer.get(doc);
  if (entry == null) {
    entry = {
      deferred: new Map(),
      blockers: new WeakSet(),
      removals: null,
      stopListeningForClose: null,
    };
    state.deferredTopLayer.set(doc, entry);
  }
  if (entry.stopListeningForClose == null) {
    // Installed with the first deferral and removed with the last promotion
    // (`architecture:react-component-runtime` INV5), like the observer below.
    const onClose = () => {
      promoteDeferredNonModal(doc);
    };
    doc.addEventListener('close', onClose, true);
    entry.stopListeningForClose = () => {
      doc.removeEventListener('close', onClose, true);
    };
  }
  entry.deferred.set(dialog, panel);
  for (const blocker of blockers) {
    entry.blockers.add(blocker);
  }
  if (entry.removals == null && typeof MutationObserver === 'function') {
    const {blockers: known} = entry;
    const observer = new MutationObserver(records => {
      if (records.some(record => removedABlocker(record, known))) {
        promoteDeferredNonModal(doc);
      }
    });
    observer.observe(doc, {childList: true, subtree: true});
    entry.removals = observer;
  }
}

function removedABlocker(
  record: MutationRecord,
  blockers: WeakSet<HTMLDialogElement>,
): boolean {
  for (const node of Array.from(record.removedNodes)) {
    if (!(node instanceof Element)) {
      continue;
    }
    const dialogs =
      node instanceof HTMLDialogElement
        ? [node]
        : Array.from(node.querySelectorAll<HTMLDialogElement>('dialog'));
    if (dialogs.some(dialog => blockers.has(dialog))) {
      return true;
    }
  }
  return false;
}

/**
 * Move every waiting non-modal sheet whose outside modals have all gone into
 * the top layer: it leaves `show()` and is presented again as a manual
 * popover, announcing its entry so global hosts re-enter above it. Focus
 * stays where it was.
 */
export function promoteDeferredNonModal(doc: Document): void {
  const entry = state.deferredTopLayer.get(doc);
  if (entry == null || entry.deferred.size === 0) {
    return;
  }
  const {deferred} = entry;
  for (const [dialog, panel] of Array.from(deferred)) {
    if (!dialog.isConnected || !dialog.open) {
      deferred.delete(dialog);
      continue;
    }
    const blockers = openModalsOutside(dialog);
    if (blockers.length > 0) {
      // Still waiting, maybe on a modal that was not there at defer time (one
      // Dialog replaced by another in a single update): it is a blocker now,
      // and its removal must be a reason to look again too.
      for (const blocker of blockers) {
        entry.blockers.add(blocker);
      }
      continue;
    }
    deferred.delete(dialog);
    const activeElement = doc.activeElement;
    dialog.close();
    showSheetHostNonModal(dialog, panel);
    if (
      doc.activeElement !== activeElement &&
      activeElement instanceof HTMLElement &&
      activeElement.isConnected
    ) {
      activeElement.focus({preventScroll: true});
    }
  }
  if (deferred.size === 0) {
    releaseDeferralWatchers(entry);
  }
}

function releaseDeferralWatchers(entry: DeferredTopLayer): void {
  entry.removals?.disconnect();
  entry.removals = null;
  entry.stopListeningForClose?.();
  entry.stopListeningForClose = null;
}

function isModalDialog(dialog: HTMLDialogElement): boolean {
  // `:modal` is the browser's own answer (every browser with the Popover
  // API has it). jsdom answers false to it for every dialog, so the modal
  // hosts' own `aria-modal="true"` (Dialog, a scrim BottomSheet) decides
  // there.
  try {
    if (dialog.matches(':modal')) {
      return true;
    }
  } catch {
    // An engine without :modal; fall through to the attribute.
  }
  return dialog.getAttribute('aria-modal') === 'true';
}

/**
 * Present a non-modal sheet: in the top layer as a manual popover where the
 * Popover API exists (Tier 2 and up), so later sheets order above earlier
 * ones and no page-level z-index is needed; by `show()` below that floor.
 * A manual popover has no light dismiss, no backdrop and no focus or scroll
 * side effects, so the non-modal contract is otherwise unchanged.
 *
 * A non-modal sheet shown while a modal dialog that does not contain it is
 * open (a modal sheet, a Dialog) is inert under that modal, so it is not put
 * in the top layer — there it would paint above the modal while a press on
 * it lands on the modal beneath — and is presented by `show()` instead, in
 * page stacking order beneath the modal, with no page-level z-index; once
 * the last such modal has gone it is presented again in the top layer
 * (`promoteDeferredNonModal`). A non-modal sheet rendered inside the modal's
 * content is not inert and enters the top layer at once.
 */
export function showSheetHostNonModal(
  dialog: HTMLDialogElement,
  panel: HTMLElement | null,
): void {
  if (typeof dialog.showPopover !== 'function') {
    dialog.show();
    return;
  }
  const blockers = openModalsOutside(dialog);
  if (blockers.length > 0) {
    dialog.show();
    deferTopLayerEntry(dialog, panel, blockers);
    return;
  }
  // Both native paths run the engine's focusing steps, and engines differ.
  // Chromium's `show()` lands on the first focusable area in tree order,
  // the panel (`tabindex="-1"`, no focus ring), while its `showPopover()`
  // skips such containers and lands on the first control; Firefox lands on
  // the first control on both paths. The sheet must focus as it did with
  // `show()` in the engine at hand, and no control may be focused and
  // blurred on the way (a field validating on blur would show its error on
  // open). So the popover's focusing steps are pointed at the panel first:
  // `autofocus` on the panel for the duration of `showPopover()` makes it
  // the steps' autofocus delegate in every engine, and the panel is where a
  // container-focusing engine's `show()` lands. Where the engine's `show()`
  // skips the container and lands on the first control, focus moves from
  // the panel to that control once — a focus on the control, no blur.
  const doc = dialog.ownerDocument;
  const hadAutofocus = panel?.hasAttribute('autofocus') ?? false;
  if (panel != null && !hadAutofocus) {
    panel.setAttribute('autofocus', '');
  }
  try {
    dialog.showPopover();
  } finally {
    if (panel != null && !hadAutofocus) {
      panel.removeAttribute('autofocus');
    }
  }
  // The sheet is now the newest top-layer entry: global hosts shown before
  // it (the toast viewport) re-enter above it, as they do above a modal.
  notifyTopLayerEntry();
  if (
    panel != null &&
    doc.activeElement === panel &&
    !nativeShowFocusesContainer(dialog)
  ) {
    firstSequentiallyFocusable(panel)?.focus({preventScroll: true});
  }
}

/**
 * The first element inside `root`, in tree order, that sequential focus
 * navigation reaches: focusable, with a tab index of zero or more, not
 * disabled, not inert, and rendered. This is where an engine whose
 * `show()` skips programmatically focusable containers lands.
 */
function firstSequentiallyFocusable(root: HTMLElement): HTMLElement | null {
  const candidates = root.querySelectorAll<HTMLElement>(
    'a[href], area[href], button, input, select, textarea, iframe, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]',
  );
  for (const candidate of Array.from(candidates)) {
    if (candidate === root || candidate.tabIndex < 0) {
      continue;
    }
    if (
      (candidate as HTMLButtonElement).disabled === true ||
      candidate.closest('[inert]') != null ||
      candidate.getAttribute('type') === 'hidden' ||
      candidate.hidden ||
      (typeof candidate.checkVisibility === 'function' &&
        !candidate.checkVisibility())
    ) {
      continue;
    }
    return candidate;
  }
  return null;
}

let showFocusesContainer: boolean | null = null;

/**
 * Whether this engine's `dialog.show()` focusing steps land on a
 * programmatically focusable container (`tabindex="-1"`) that comes before
 * the first control — Chromium does, Firefox skips it. Measured once, on a
 * throwaway non-modal dialog that is shown, read and removed inside one
 * task (no paint); focus is put back where it was. The probe lives inside
 * `host`, the sheet's own dialog, which is in the top layer and interactive
 * at this point (a lone sheet, or one inside the open modal's content): a
 * probe appended to the body could sit under an open modal's inertness,
 * where `show()` moves no focus, and cache the wrong answer for the page.
 */
function nativeShowFocusesContainer(host: HTMLDialogElement): boolean {
  if (showFocusesContainer != null) {
    return showFocusesContainer;
  }
  const doc = host.ownerDocument;
  const activeBefore = doc.activeElement;
  const probe = doc.createElement('dialog');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;inset:auto;opacity:0;pointer-events:none';
  const container = doc.createElement('div');
  container.tabIndex = -1;
  const control = doc.createElement('button');
  control.type = 'button';
  container.appendChild(control);
  probe.appendChild(container);
  host.appendChild(probe);
  try {
    probe.show();
    showFocusesContainer = doc.activeElement === container;
    probe.close();
  } catch {
    showFocusesContainer = true;
  } finally {
    probe.remove();
    if (
      doc.activeElement !== activeBefore &&
      activeBefore instanceof HTMLElement &&
      activeBefore.isConnected
    ) {
      activeBefore.focus({preventScroll: true});
    }
  }
  return showFocusesContainer;
}

/** Leave the native host, whichever one presents the sheet. */
export function hideSheetHost(dialog: HTMLDialogElement): void {
  const entry = state.deferredTopLayer.get(dialog.ownerDocument);
  if (entry != null && entry.deferred.delete(dialog)) {
    if (entry.deferred.size === 0) {
      releaseDeferralWatchers(entry);
    }
  }
  if (
    dialog.hasAttribute('popover') &&
    typeof dialog.hidePopover === 'function'
  ) {
    try {
      dialog.hidePopover();
    } catch {
      // Not showing as a popover (the show() fallback); nothing to hide here.
    }
  }
  if (dialog.open) {
    dialog.close();
  }
}

/**
 * Close a dialog without letting the browser move focus. `close()` returns
 * focus to the element that was focused when `showModal()` ran; with another
 * sheet still open on top, that would pull focus out of the sheet the person
 * is using (a re-show that repairs the top-layer order, a covered sheet
 * closing from code, a replaced sheet leaving). Focus stays where it is; the
 * caller decides where it goes next, if anywhere.
 */
export function closeDialogKeepingFocus(
  dialog: HTMLDialogElement | null,
): void {
  if (dialog == null || !isSheetHostPresented(dialog)) {
    return;
  }
  const doc = dialog.ownerDocument;
  const activeElement = doc.activeElement;
  hideSheetHost(dialog);
  if (
    doc.activeElement !== activeElement &&
    activeElement instanceof HTMLElement &&
    activeElement.isConnected
  ) {
    activeElement.focus({preventScroll: true});
  }
}

/**
 * Pair the one close and the one open of this batch as a replace. A replace
 * is a move the person makes from one sheet to the next, and that is what
 * the conditions check:
 *
 * - exactly one sheet closed and exactly one opened in this update;
 * - both are standalone sheets of one group — one document, both modal or
 *   both non-modal (a switcher flow replaces its own steps and is never
 *   paired);
 * - the closing sheet was the top sheet of its stack once the opening sheet
 *   is set aside — a covered sheet closing while a sheet opens is a pop
 *   beneath a push;
 * - neither dialog contains the other — a sheet in another's content closes
 *   with it, it does not replace it;
 * - the interaction came from inside the closing sheet: the control the
 *   person last pressed (or, with no recent press, the element focused when
 *   this update's first flip arrived, before any dialog of the update was
 *   shown) is in its dialog, or nowhere (a control that left with the step).
 *   A close and an open driven from a control outside the closing sheet are
 *   two unrelated owners acting in one update, so the sheets keep their own
 *   openers and their own push and pop motion.
 *
 * The opening sheet then adopts the closing sheet's opener: its own opener
 * is inside the sheet that is leaving, and the flow began where the closing
 * sheet's did.
 */
function detectReplace(): void {
  if (state.batchOpened.length !== 1 || state.batchClosed.length !== 1) {
    // A pair made earlier in this commit, before a third flip arrived, is
    // undone: the commit's final tally decides, and several sheets changing
    // in one update keep their own push and pop motion.
    undoBatchPair();
    return;
  }
  const [replacer] = state.batchOpened;
  const [replaced] = state.batchClosed;
  if (state.batchPair != null && state.batchPair.replaced === replaced) {
    return;
  }
  if (
    replaced === replacer ||
    replaced.replaceable == null ||
    replacer.replaceable == null ||
    replaced.doc !== replacer.doc ||
    replaced.isModal !== replacer.isModal ||
    replaced.replace?.replacer === replacer ||
    !replacer.isOpen ||
    replaced.isOpen
  ) {
    return;
  }
  const replacedElement = replaced.getElement();
  const replacerElement = replacer.getElement();
  if (
    replacedElement == null ||
    replacerElement == null ||
    replacedElement.contains(replacerElement) ||
    replacerElement.contains(replacedElement)
  ) {
    return;
  }
  const wasTop = !groupOf(replaced).some(
    other =>
      other !== replacer &&
      other !== replaced &&
      other.isOpen &&
      compareRank(other, replaced) > 0,
  );
  if (!wasTop) {
    return;
  }
  const actor = state.batchActor;
  const actedFromReplaced =
    actor == null ||
    actor === replaced.doc.body ||
    replacedElement.contains(actor);
  if (!actedFromReplaced) {
    return;
  }
  // A third sheet the closing sheet was itself replacing is dropped at once,
  // the way a switcher drops a step that is left mid-handoff. The sheet it
  // was replacing may instead be the one coming back now (a reversal): then
  // the roles swap and nothing is dropped.
  if (replaced.replacing != null && replaced.replacing !== replacer) {
    finishReplace(replaced.replacing);
  }
  if (replaced.replace != null) {
    replaced.replace.replacer.replacing = null;
  }
  if (replacer.replace != null) {
    replacer.replace = null;
  }
  replaced.replace = {
    replacer,
    motion: 'covered',
    alignmentOffset: 0,
    isAlignmentComplete: false,
    isEnteringComplete: false,
  };
  replacer.replacing = replaced;
  state.batchPair = {
    replaced,
    replacer,
    replacerOpener: replacer.replaceable.getOpener(),
  };
  // The press that made this replace is consumed by it.
  state.lastPress.delete(replacer.doc);
  replacer.replaceable.setOpener(replaced.replaceable.getOpener());
  state.pendingReplaceFocus = replacer;
}

/**
 * Undo the pair this batch made: the replaced sheet is an ordinary closing
 * sheet again, the replacer an ordinary opening one with its own opener, and
 * no focus is owed. Called when a later flip of the same commit changes the
 * tally, before the commit paints.
 */
function undoBatchPair(): void {
  const pair = state.batchPair;
  if (pair == null) {
    return;
  }
  state.batchPair = null;
  const {replaced, replacer, replacerOpener} = pair;
  if (replaced.replace?.replacer === replacer) {
    replaced.replace = null;
  }
  if (replacer.replacing === replaced) {
    replacer.replacing = null;
  }
  replacer.replaceable?.setOpener(replacerOpener);
  if (state.pendingReplaceFocus === replacer) {
    state.pendingReplaceFocus = null;
  }
}

/**
 * The person moves from the replaced step to the entering one, so focus
 * does too, and it lands on the step's `data-autofocus` descendant when it
 * has one. The dialog is shown by now, so the native focusing steps have
 * run: a modal replacer's `showModal()` put focus on the entering panel, a
 * non-modal replacer's `showPopover()` may have left it where it was (Safari;
 * the replaced step is inert from this frame). Either way the placement runs
 * after them — focus sitting on the panel, or anywhere that is not the
 * `data-autofocus` descendant, is the native steps' doing, not the
 * person's, so it does not count as placed. Only focus the person already
 * moved to a control inside the entering step is left alone.
 */
function focusPendingReplacer(): void {
  const replacer = state.pendingReplaceFocus;
  if (replacer == null) {
    return;
  }
  const element = replacer.getElement();
  if (element == null || !isSheetHostPresented(element)) {
    return;
  }
  state.pendingReplaceFocus = null;
  replacer.focus('replace');
}

/**
 * End a replace: the replaced sheet is hidden and its dialog closed; the
 * views computed next hand the scrim to the sheet that replaced it, which
 * takes it in the same frame. Focus stays where it is.
 */
function finishReplace(replaced: Entry): void {
  const replace = replaced.replace;
  if (replace == null) {
    return;
  }
  const {replacer} = replace;
  replaced.replace = null;
  if (replacer.replacing === replaced) {
    replacer.replacing = null;
  }
  replaced.hide();
  replaced.replaceable?.finish();
}

function alignmentOffsetForPanels(
  enteringPanel: HTMLElement | null,
  retainedPanel: HTMLElement | null,
): number {
  if (enteringPanel == null || retainedPanel == null) {
    return 0;
  }
  // The positioner is where the entering sheet will rest; the panel itself
  // is still rising from below the viewport.
  const enteringTop =
    enteringPanel.parentElement?.getBoundingClientRect().top ??
    enteringPanel.getBoundingClientRect().top;
  return Math.max(0, enteringTop - retainedPanel.getBoundingClientRect().top);
}

/**
 * A host's panel reports the start and end of its motions here. During a
 * replace they drive the handoff: when the entering sheet starts to rise, a
 * taller retained sheet starts moving down to its top edge; the retained
 * sheet fades once both have finished; when the fade ends the replace is over.
 */
export function reportBottomSheetMotion(
  key: object,
  event: 'start' | 'complete',
  motion: BottomSheetReplaceMotion,
): void {
  const entry = state.entries.find(candidate => candidate.key === key);
  if (entry == null) {
    return;
  }
  if (motion === 'entering') {
    const replaced = entry.replacing;
    const replace = replaced?.replace ?? null;
    if (replaced == null || replace == null || replace.replacer !== entry) {
      return;
    }
    if (event === 'start') {
      if (replace.motion !== 'covered') {
        return;
      }
      const alignmentOffset = alignmentOffsetForPanels(
        entry.replaceable?.getPanel() ?? null,
        replaced.replaceable?.getPanel() ?? null,
      );
      if (alignmentOffset > ALIGNMENT_THRESHOLD_PX) {
        replace.motion = 'aligning';
        replace.alignmentOffset = alignmentOffset;
        replace.isAlignmentComplete = false;
      }
      // A sheet that came back while fading is already where it belongs:
      // its entrance is over as soon as it starts, like a switcher step's.
      if (entry.isEnteringInPlace) {
        entry.isEnteringInPlace = false;
        replace.isEnteringComplete = true;
        if (replace.motion !== 'aligning') {
          replace.motion = 'fading';
        }
      } else if (replace.motion === 'covered') {
        return;
      }
    } else {
      replace.isEnteringComplete = true;
      if (replace.motion === 'aligning' && !replace.isAlignmentComplete) {
        return;
      }
      replace.motion = 'fading';
    }
    update(entry.doc, entry.isModal);
    return;
  }
  const replace = entry.replace;
  if (replace == null || event !== 'complete') {
    return;
  }
  if (motion === 'aligning' && replace.motion === 'aligning') {
    if (replace.isEnteringComplete) {
      replace.motion = 'fading';
    } else {
      replace.isAlignmentComplete = true;
    }
    update(entry.doc, entry.isModal);
  } else if (motion === 'fading' && replace.motion === 'fading') {
    finishReplace(entry);
    update(entry.doc, entry.isModal);
  }
}

/**
 * Make a document's top layer match the ranked order. The top layer is
 * append-only, so a dialog can only move up, by closing and showing it again:
 * the longest prefix of the wanted order that the shown order already
 * contains, in order, is kept, and every dialog after it is re-shown in
 * order (closing them from the top first). A deep link whose inner sheet
 * registered first therefore re-shows inner and outer; a sheet that must
 * rise above the sheets shown after it re-shows only itself, so a retained
 * sheet beneath it keeps its backdrop and any motion in flight. Runs inside
 * the commit, so a wrong intermediate order never paints. Focus moves into
 * the top open sheet when anything was shown — unless the person was already
 * in a sheet that is only re-shown to keep its place (a switcher flow it
 * covers changed step from code, say): the element they were in, a field
 * being typed in, is the dialog's focus delegate for that `showModal()` and
 * is focused again right after it, so the keystrokes that follow still land
 * there. The top layer is append-only, so the re-show has to close the dialog
 * first and the field sees one blur and one focus; nothing shorter exists.
 */
function reconcileTopLayer(
  doc: Document,
  isModal: boolean,
  order: Entry[],
): void {
  const shownOrder = getShownOrder(doc, isModal);
  const presentable = order.filter(entry => {
    const element = entry.getElement();
    return element != null && element.isConnected;
  });
  let kept = 0;
  let cursor = 0;
  while (kept < presentable.length) {
    const next = shownOrder.indexOf(presentable[kept], cursor);
    if (next === -1) {
      break;
    }
    cursor = next + 1;
    kept += 1;
  }
  const keptEntries = new Set(presentable.slice(0, kept));
  const reshown = presentable.slice(kept);
  const keptActive = activeElementToKeep(doc, reshown);
  let didShow = false;
  for (let index = shownOrder.length - 1; index >= 0; index -= 1) {
    if (!keptEntries.has(shownOrder[index])) {
      shownOrder[index].hide();
    }
  }
  for (const entry of reshown) {
    const delegate =
      keptActive != null && entry.getElement()?.contains(keptActive)
        ? keptActive
        : null;
    // The native focusing steps follow an `autofocus` delegate, so the
    // re-shown dialog lands on the element the person was in instead of its
    // first focusable area; the attribute is the dialog's for this call only.
    const hadAutofocus = delegate?.hasAttribute('autofocus') ?? false;
    if (delegate != null && !hadAutofocus) {
      delegate.setAttribute('autofocus', '');
    }
    entry.show();
    if (delegate != null && !hadAutofocus) {
      delegate.removeAttribute('autofocus');
    }
    didShow = true;
  }
  setShownOrder(doc, isModal, presentable);
  if (!didShow) {
    return;
  }
  // A dialog shown again (closed and re-shown to keep its place) went back
  // into the top layer above everything shown before, a global host's
  // popover hosted inside it included: that popover still reads as showing
  // but paints beneath the dialog now. Hosts re-enter the top layer in
  // place, as they do above a non-modal surface that just entered, so toasts
  // raised in the re-shown sheet still paint above it. A first show needs
  // none of this: the outlet it supplies moves the hosts.
  if (reshown.some(entry => shownOrder.includes(entry))) {
    notifyTopLayerEntry();
  }
  if (keptActive != null && keptActive.isConnected) {
    if (doc.activeElement !== keptActive) {
      keptActive.focus({preventScroll: true});
    }
    return;
  }
  const openEntries = presentable.filter(entry => entry.isOpen);
  openEntries[openEntries.length - 1]?.focus('open');
}

/**
 * The element to keep focused across a re-show: the document's active
 * element when it is inside an open sheet that is about to be re-shown.
 */
function activeElementToKeep(
  doc: Document,
  reshown: ReadonlyArray<Entry>,
): HTMLElement | null {
  const remembered = state.focusToKeep.get(doc);
  state.focusToKeep.delete(doc);
  const current = doc.activeElement;
  const active =
    remembered != null && remembered.isConnected
      ? remembered
      : current instanceof HTMLElement && current !== doc.body
        ? current
        : null;
  if (active == null) {
    return null;
  }
  for (const entry of reshown) {
    const element = entry.getElement();
    if (entry.isOpen && element != null && element.contains(active)) {
      return active;
    }
  }
  return null;
}

function update(doc: Document, isModal: boolean): void {
  detectReplace();
  // A drop can land as soon as the batch has both of its flips: the pairing
  // is decided then, and anything left `replace`d is a retained sheet whose
  // replacer left the flow.
  if (state.batchOpened.length > 0 && state.batchClosed.length > 0) {
    flushPendingDrops();
  }
  const order = sortedEntries(doc, isModal);
  computeViews(order, isModal);
  reconcileTopLayer(doc, isModal, order);
  state.focusToKeep.delete(doc);
  focusPendingReplacer();
  promoteDeferredNonModal(doc);
}

/**
 * Join the stack for as long as the sheet is presented. Call from a layout
 * effect; the returned function leaves the stack (also from its cleanup).
 * `isOpen` is the controlled open state; a presented sheet whose `isOpen` is
 * false is sliding out and keeps its place without counting as a layer.
 */
export function registerBottomSheet(
  registration: BottomSheetStackRegistration,
  isOpen: boolean,
  isModal: boolean = true,
): () => void {
  const {key} = registration;
  const remembered = state.rankByKey.get(key);
  let rank: Rank;
  if (
    remembered != null &&
    !remembered.isClosed &&
    // A StrictMode replay unregisters and registers again in one synchronous
    // pass, before any seal; the rank is kept so the replay cannot reorder.
    // A sheet React hid (Suspense, Activity) and later revealed comes back in
    // a later batch and re-presents on top, like a fresh open.
    (remembered.detachedBatch == null ||
      remembered.detachedBatch === state.currentBatch)
  ) {
    rank = {batch: remembered.batch, seq: remembered.seq};
    remembered.detachedBatch = null;
  } else {
    rank = takeRank();
    state.rankByKey.set(key, {
      ...rank,
      isClosed: !isOpen,
      detachedBatch: null,
    });
  }
  const doc = registration.getElement()?.ownerDocument ?? document;
  listenForPresses(doc);
  const entry: Entry = {
    ...registration,
    rank,
    isOpen,
    doc,
    isModal,
    view: BOTTOM_SHEET_STACK_DEFAULT_VIEW,
    replace: null,
    replacing: null,
    isEnteringInPlace: false,
  };
  state.entries.push(entry);
  if (isOpen && rank.batch === state.currentBatch && state.isBatchDirty) {
    recordFlip(entry, 'opened');
  }
  update(entry.doc, entry.isModal);

  return () => {
    const index = state.entries.indexOf(entry);
    if (index === -1) {
      return;
    }
    state.entries.splice(index, 1);
    stopListeningForPresses(entry.doc);
    setShownOrder(
      entry.doc,
      entry.isModal,
      getShownOrder(entry.doc, entry.isModal).filter(shown => shown !== entry),
    );
    state.batchOpened = state.batchOpened.filter(other => other !== entry);
    state.batchClosed = state.batchClosed.filter(other => other !== entry);
    state.pendingDrops = state.pendingDrops.filter(other => other !== entry);
    if (state.pendingReplaceFocus === entry) {
      state.pendingReplaceFocus = null;
    }
    if (
      state.batchPair?.replaced === entry ||
      state.batchPair?.replacer === entry
    ) {
      state.batchPair = null;
    }
    // A member of a "Close all" group leaving the registry has left for
    // good: a host that unmounts mid-exit never sends its motion report, so
    // leaving is its completion. Reported after `hide()` below, once its
    // dialog is out of the top layer, so the return focus has nothing modal
    // in its way; a host that still reports afterwards finds nothing to do.
    const closingGroup = state.closingTogether.get(entry);
    if (entry.replace != null) {
      entry.replace.replacer.replacing = null;
      entry.replace = null;
    }
    if (entry.replacing != null) {
      // The sheet it was replacing is left as an ordinary closing sheet.
      entry.replacing.replace = null;
      entry.replacing = null;
    }
    // A sheet that leaves while its dialog is still open was hidden by React
    // (Suspense, Activity) or is unmounting: a modal dialog with no box would
    // keep blocking the page, so it leaves the top layer here.
    entry.hide();
    if (closingGroup != null) {
      leaveClosingGroup(entry, closingGroup);
    }
    const current = state.rankByKey.get(key);
    if (current != null) {
      current.detachedBatch = state.currentBatch;
      state.isBatchDirty = true;
      scheduleSeal();
    }
    entry.view = BOTTOM_SHEET_STACK_DEFAULT_VIEW;
    entry.onView(entry.view);
    update(entry.doc, entry.isModal);
  };
}

/**
 * The dialog that realizes a level changed: a switcher flow handed off to a
 * step with its own dialog, which its host presented on top of the top layer
 * in this same commit. The level keeps its rank; the registry records the new
 * dialog as the most recently shown and puts the sheets that belong above it
 * back on top before paint. A level on its own, or already on top, is left
 * alone.
 */
export function notifyBottomSheetHostChanged(key: object): void {
  const entry = state.entries.find(candidate => candidate.key === key);
  if (entry == null || !entry.isModal) {
    return;
  }
  const element = entry.getElement();
  if (element == null || !isSheetHostPresented(element)) {
    return;
  }
  const shown = getShownOrder(entry.doc, true).filter(
    shownEntry => shownEntry !== entry,
  );
  shown.push(entry);
  setShownOrder(entry.doc, true, shown);
  update(entry.doc, true);
}

/**
 * Report the controlled open state of a registered sheet. Closing keeps the
 * sheet's place while it slides out; reopening takes a new rank, so the sheet
 * returns on top.
 */
export function setBottomSheetOpen(key: object, isOpen: boolean): void {
  const entry = state.entries.find(candidate => candidate.key === key);
  if (entry == null || entry.isOpen === isOpen) {
    return;
  }
  entry.isOpen = isOpen;
  const remembered = state.rankByKey.get(key);
  if (isOpen) {
    if (state.closingTogether.has(entry)) {
      const group = state.closingTogether.get(entry);
      state.closingTogether.delete(entry);
      group?.pending.delete(entry);
    }
    entry.rank = takeRank();
    state.rankByKey.set(key, {
      ...entry.rank,
      isClosed: false,
      detachedBatch: null,
    });
    recordFlip(entry, 'opened');
    // Reopened while being replaced: it is a sheet again, not a fading one.
    if (entry.replace != null) {
      entry.replace.replacer.replacing = null;
      entry.replace = null;
      entry.isEnteringInPlace = true;
    }
  } else {
    if (remembered != null) {
      remembered.isClosed = true;
    }
    state.isBatchDirty = true;
    scheduleSeal();
    recordFlip(entry, 'closed');
    entry.isEnteringInPlace = false;
    // A replacing sheet that closes drops the sheet it was replacing, the way
    // a switcher hides a retained step when the flow is left — unless that
    // sheet is the one coming back in this same update (Continue pressed
    // during a Back handoff), which `detectReplace` pairs as the reverse
    // replace. The other flips of this commit may not have arrived yet, so
    // the drop waits for the seal; a paired sheet is no longer `replace`d by
    // then and is left alone.
    if (entry.replacing != null) {
      state.pendingDrops.push(entry.replacing);
    }
  }
  update(entry.doc, entry.isModal);
}

/**
 * Drop the retained sheets whose replacer closed in this batch and that no
 * replace of this batch took back. Runs when the batch is sealed and, before
 * that, whenever a pairing has been decided, so the drop lands in the same
 * commit as the close that caused it.
 */
function flushPendingDrops(): void {
  if (state.pendingDrops.length === 0) {
    return;
  }
  const drops = state.pendingDrops;
  state.pendingDrops = [];
  for (const replaced of drops) {
    const replacer = replaced.replace?.replacer;
    if (replacer != null && !replacer.isOpen) {
      finishReplace(replaced);
    }
  }
}

/**
 * The open sheet directly beneath `key`: its dialog, and a way to move focus
 * into it. Null when nothing open is beneath. A closing top sheet asks this
 * to return focus into the sheet it reveals.
 */
export function getBottomSheetBeneath(
  key: object,
): {element: HTMLDialogElement; focus: () => void} | null {
  const own = state.entries.find(entry => entry.key === key);
  if (own == null) {
    return null;
  }
  const order = groupOf(own);
  for (let below = order.indexOf(own) - 1; below >= 0; below -= 1) {
    const entry = order[below];
    const element = entry.getElement();
    if (entry.isOpen && element != null) {
      return {element, focus: () => entry.focus('reveal')};
    }
  }
  return null;
}

// preventScroll on both: presenting a sheet must not scroll the page to reveal
// what it just focused. For an autofocused field that reveal is the mobile
// keyboard's, and it moves the document under a fixed sheet; useMobileKeyboard
// brings the field into view within the sheet instead.
/**
 * Move focus into a sheet panel. Focus already inside the sheet stays put:
 * on `open` the native host has normally run its own focusing steps, which
 * land on the panel (`tabindex="-1"`), so a `data-autofocus` descendant is
 * reached only where the host moved nothing (a stubbed host, or a browser
 * whose focusing steps skipped the sheet) — the released behavior. On
 * `replace` the entering step takes focus whatever its modality and whatever
 * the host did, a `data-autofocus` descendant first; on `reveal` the panel
 * itself takes focus, with a ring only after keyboard input.
 */
export function focusSheetPanel(
  panel: HTMLElement | null,
  reason: BottomSheetFocusReason,
  isModal: boolean,
): void {
  if (panel == null) {
    return;
  }
  // A covered sheet takes no focus: its dialog is inert (the stack marks it
  // so, and a modal above it blocks it in the browser anyway), so a step that
  // enters beneath a sheet on top — a covered switcher flow changing step from
  // code — leaves the person where they are, in the sheet on top.
  const host = panel.closest('dialog');
  if (
    host != null &&
    (host.hasAttribute('inert') || host.getAttribute('aria-hidden') === 'true')
  ) {
    return;
  }
  // Focus already inside this sheet's own content stays put. Focus inside a
  // sheet rendered within this content (a closing nested sheet) does not
  // count: that sheet's dialog is leaving, and this one is being revealed.
  // On a replace entry the native focusing steps have just run and may have
  // put focus on the panel itself; that is not a placement, so only focus on
  // a control inside the panel (the person's, or the field this placement
  // chose) stays put.
  const activeElement = panel.ownerDocument.activeElement;
  const isInsidePanel =
    activeElement != null &&
    panel.contains(activeElement) &&
    activeElement.closest('dialog') === panel.closest('dialog');
  if (isInsidePanel && (reason !== 'replace' || activeElement !== panel)) {
    return;
  }
  if (reason === 'reveal') {
    focusForLastInput(panel);
    return;
  }
  const autofocus = panel.querySelector<HTMLElement>('[data-autofocus]');
  if (autofocus != null) {
    autofocus.focus({preventScroll: true});
  } else if (!isInsidePanel && (isModal || reason === 'replace')) {
    // A lone non-modal sheet takes no focus on open; the step replacing the
    // one the person was in does, so the keyboard stays in the flow. Focus
    // the native steps already put on the panel needs no second focus().
    panel.focus({preventScroll: true});
  }
}

/** Test-only: the presented sheets' dialogs, bottom to top, with their views. */
export function getBottomSheetStackForTests(
  doc: Document = document,
  isModal: boolean = true,
): ReadonlyArray<{
  element: HTMLDialogElement | null;
  isOpen: boolean;
  view: BottomSheetStackView;
}> {
  return sortedEntries(doc, isModal).map(entry => ({
    element: entry.getElement(),
    isOpen: entry.isOpen,
    view: entry.view,
  }));
}

/** Test-only: forget every sheet and start the batch counter over. */
export function resetBottomSheetStackForTests(): void {
  showFocusesContainer = null;
  // The press listeners go with the entries they served.
  for (const entry of state.entries) {
    const remove = state.listenedDocuments.get(entry.doc);
    if (remove != null) {
      state.listenedDocuments.delete(entry.doc);
      remove();
    }
  }
  state.entries.length = 0;
  state.shownOrder = new WeakMap();
  state.batchOpened = [];
  state.batchClosed = [];
  state.batchActor = null;
  state.pendingDrops = [];
  state.pendingReplaceFocus = null;
  state.closingTogether = new Map();
  state.currentBatch = 0;
  state.nextSeq = 0;
  state.isBatchDirty = false;
  state.isSealScheduled = false;
  state.focusToKeep = new WeakMap();
  // Deferral watchers on the test document go with the deferrals they
  // served (a WeakMap cannot be walked; the test document is the one place
  // a test can have deferred into).
  const deferral = state.deferredTopLayer.get(document);
  if (deferral != null) {
    releaseDeferralWatchers(deferral);
  }
  state.deferredTopLayer = new WeakMap();
}

/** Test-only: the shared state's key, shape and protocol version, for the two-copies tests. */
export const BOTTOM_SHEET_STACK_STATE_FOR_TESTS = {
  key: STACK_STATE_KEY,
  shape: STACK_STATE_SHAPE,
  protocolVersion: STACK_PROTOCOL_VERSION,
  keyFor: (version: number) =>
    Symbol.for(`astryx.bottomSheetStack.v${version}`),
  /** Whether the document has the press listeners installed. */
  isListeningForPresses: (doc: Document) => state.listenedDocuments.has(doc),
};
