// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file popoverOperations.ts
 * @input Popover API events (`beforetoggle`, `toggle`) and the layers' own show/hide calls
 * @output The per-document ledger of popover operations in flight, and the deferral of a show that arrives inside one
 * @position Internal to the layer runtime; used by useLayer
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/useLayer.tsx
 * - /packages/core/src/Layer/popoverOperations.test.ts
 */

/**
 * Popover operations in flight, per document.
 *
 * The Popover API refuses to show a popover while the document is in the
 * middle of showing or hiding ANY popover: `showPopover()` throws an
 * `InvalidStateError` ("Invalid to show a popover during another show
 * operation"; Chromium 150+, where 149 still accepts such a show).
 * Hiding a popover restores focus to the element that had it —
 * synchronously, inside that window — so a focus-driven layer on the element
 * receiving focus (a tooltip on the trigger that just closed a popover) asks
 * to show while the hide is still running.
 *
 * Two kinds of operation are counted:
 *
 * - The layers' own shows and hides pass through `runPopoverOperation`, so
 *   their windows are known exactly: a `show()` that arrives inside one is
 *   deferred ahead of asking the browser.
 * - A hide the browser runs on its own — an Escape its close watcher answers,
 *   a light dismiss, an `auto` popover evicted by another one opening — never
 *   passes through here. It is observable from its element's events:
 *   `beforetoggle` fires synchronously as the hide starts, and `toggle` in a
 *   task once it has ended; `observeBrowserHide` counts it between the two.
 *   That window is wider than the engine's, which ends when the hide returns,
 *   so a show inside it is asked of the browser first and deferred only when
 *   the browser refuses it: a light dismiss at `pointerup` followed by a show
 *   at `click` in the same gesture still opens at once.
 *
 * A deferred show waits in `afterPopoverOperations` and replays, one
 * microtask each, once the document's last operation of either kind has
 * ended and the script that started it has unwound.
 */
const ownOperationsByDocument = new WeakMap<Document, number>();
const browserHidesByDocument = new WeakMap<Document, number>();
const settledCallbacksByDocument = new WeakMap<Document, (() => void)[]>();

function count(map: WeakMap<Document, number>, doc: Document, delta: number) {
  map.set(doc, Math.max(0, (map.get(doc) ?? 0) + delta));
}

function anyInFlight(doc: Document): boolean {
  return (
    (ownOperationsByDocument.get(doc) ?? 0) > 0 ||
    (browserHidesByDocument.get(doc) ?? 0) > 0
  );
}

function ended(doc: Document): void {
  if (!anyInFlight(doc) && settledCallbacksByDocument.has(doc)) {
    // The operation's own script is still on the stack (the `finally` of a
    // `runPopoverOperation`, a `toggle` listener): replay once it has unwound.
    queueMicrotask(() => replaySettled(doc));
  }
}

function replaySettled(doc: Document): void {
  if (anyInFlight(doc)) {
    // Another operation started before the replay ran; its end replays.
    return;
  }
  const callbacks = settledCallbacksByDocument.get(doc);
  if (callbacks == null) {
    return;
  }
  settledCallbacksByDocument.delete(doc);
  // One microtask each: a replay that throws reaches the page on its own and
  // leaves the ones after it to run.
  for (const callback of callbacks) {
    queueMicrotask(callback);
  }
}

/** Runs `operation`, counting it as one of the layers' own popover operations in `doc`. */
export function runPopoverOperation(
  doc: Document,
  operation: () => void,
): void {
  count(ownOperationsByDocument, doc, 1);
  try {
    operation();
  } finally {
    count(ownOperationsByDocument, doc, -1);
    ended(doc);
  }
}

/** Whether one of the layers' own shows or hides is running in `doc`: a show asked now would be refused. */
export function isPopoverOperationInFlight(doc: Document): boolean {
  return (ownOperationsByDocument.get(doc) ?? 0) > 0;
}

/**
 * Whether a hide the browser runs itself is counted in `doc`. The count
 * outlasts the engine's own window (it ends at the element's `toggle`, a task
 * later), so a show asked inside it may well succeed; one the browser refuses
 * is deferred to the count's end.
 */
export function isBrowserHideInFlight(doc: Document): boolean {
  return (browserHidesByDocument.get(doc) ?? 0) > 0;
}

/** Popovers whose browser-run hide is being counted, so one hide is counted once. */
const browserHidesInFlight = new WeakSet<Element>();

/**
 * Counts a hide the browser runs itself. Called as the element's `beforetoggle`
 * fires, which the hide dispatches synchronously as it starts; the count ends
 * at the element's `toggle`, which the browser queues for the task after the
 * hide, and in any case at the next task: the hide is synchronous, so the task
 * after it is past the window even when the element has left the document and
 * its `toggle` never arrives. Calling it again for the same hide is a no-op.
 */
export function observeBrowserHide(popover: HTMLElement): void {
  if (browserHidesInFlight.has(popover)) {
    return;
  }
  browserHidesInFlight.add(popover);
  const doc = popover.ownerDocument;
  count(browserHidesByDocument, doc, 1);
  const view = doc.defaultView ?? globalThis;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const finish = () => {
    if (done) {
      return;
    }
    done = true;
    popover.removeEventListener('toggle', finish);
    if (timer != null) {
      view.clearTimeout(timer);
      timer = null;
    }
    browserHidesInFlight.delete(popover);
    count(browserHidesByDocument, doc, -1);
    ended(doc);
  };
  popover.addEventListener('toggle', finish);
  timer = view.setTimeout(finish, 0);
}

/**
 * Runs `callback` once no popover operation of either kind is in flight in
 * `doc`: at once when none is, otherwise in its own microtask after the last
 * one has ended and the script that started it has unwound.
 */
export function afterPopoverOperations(
  doc: Document,
  callback: () => void,
): void {
  if (!anyInFlight(doc)) {
    callback();
    return;
  }
  const callbacks = settledCallbacksByDocument.get(doc);
  if (callbacks == null) {
    settledCallbacksByDocument.set(doc, [callback]);
  } else {
    callbacks.push(callback);
  }
}
