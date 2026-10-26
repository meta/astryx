// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file bareFixture.ts
 * @input Nothing: bundled by esbuild and injected into a blank page
 * @output A page with nothing attached: the document's gesture host and the
 *   recognizers on `window.__api`, for a test to attach what it needs, and
 *   `window.__pageTouch`, the count of touch listeners on the window and the
 *   document right now
 * @position Browser fixture of gestures.browser.spec.ts for the checks that
 *   need a page with no other gesture on it (FR19, FR24); test-only
 */

import {getGestureHost} from '../../GestureHost';
import {LongPressGestureRecognizer} from '../../LongPressGestureRecognizer';
import {PanGestureRecognizer} from '../../PanGestureRecognizer';
import {lockSelection} from '../../selectionLock';

declare global {
  interface Window {
    __pageTouch: number;
    __api: {
      host: ReturnType<typeof getGestureHost>;
      LongPressGestureRecognizer: typeof LongPressGestureRecognizer;
      PanGestureRecognizer: typeof PanGestureRecognizer;
      lockSelection: typeof lockSelection;
    };
  }
}

// The touch listeners on the window and the document, as the engine sees
// them: what makes the page pay for touches.
window.__pageTouch = 0;
const live = new Set<string>();
const listenerIds = new WeakMap<object, number>();
let nextListenerId = 1;
function keyOf(
  target: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | EventListenerOptions,
): string {
  let id = listenerIds.get(listener);
  if (id == null) {
    id = nextListenerId++;
    listenerIds.set(listener, id);
  }
  const capture =
    typeof options === 'boolean' ? options : (options?.capture ?? false);
  return [target === window ? 'window' : 'document', type, capture, id].join();
}
// Playwright's own hit-target interceptors listen on the window too; they
// are the harness's, not the page's.
const isPageTouch = (target: EventTarget, type: string) =>
  (target === window || target === document) &&
  type.startsWith('touch') &&
  !(new Error().stack ?? '').includes('InjectedScript');
const addListener = EventTarget.prototype.addEventListener;
const removeListener = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | AddEventListenerOptions,
) {
  if (listener != null && isPageTouch(this, type)) {
    live.add(keyOf(this, type, listener, options));
    window.__pageTouch = live.size;
  }
  addListener.call(this, type, listener, options);
};
EventTarget.prototype.removeEventListener = function (
  this: EventTarget,
  type: string,
  listener: EventListenerOrEventListenerObject | null,
  options?: boolean | EventListenerOptions,
) {
  if (listener != null && isPageTouch(this, type)) {
    live.delete(keyOf(this, type, listener, options));
    window.__pageTouch = live.size;
  }
  removeListener.call(this, type, listener, options);
};

document.body.style.margin = '0';
window.__api = {
  host: getGestureHost(document),
  LongPressGestureRecognizer,
  PanGestureRecognizer,
  lockSelection,
};
