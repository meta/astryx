// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useLayerKeyboardClearance.ts
 * @input Whether an anchor-mode layer is open, its element, and the keyboard
 *   module: its one height, and its layout guide for timing.
 * @output Exports `useLayerKeyboardClearance` and its result type,
 *   `keyboardClearanceCap`, `LAYER_ANCHORED_ATTRIBUTE`,
 *   `LAYER_KEYBOARD_CAP_PROPERTY`, `LAYER_KEYBOARD_OVERFLOW_PROPERTY` and
 *   `LAYER_KEYBOARD_CLEARANCE_PX`
 * @position Layer runtime, through the layer's touch module: the software
 *   keyboard's part of the viewport caps
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Layer/layerKeyboardClearance.ts
 * - /packages/core/src/Layer/settledBox.ts
 * - /packages/core/src/Layer/useLayerKeyboardClearance.test.tsx
 * - /packages/core/src/Layer/layerViewportInset.stylex.ts
 * - /docs/specs/AST-059-layer-viewport-inset/spec.md
 */

import {useCallback, useRef, useState, type RefObject} from 'react';
import {flushSync} from 'react-dom';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
// The keyboard module's own files, not its index. The index also re-exports
// BottomSheet's keyboard hook. An import through it would put that hook's
// on-demand code in every layered component.
import {getKeyboardLayoutGuide} from '../keyboard/keyboardLayoutGuide';
import {getKeyboardHeight} from '../keyboard/keyboardHeight';
import {timing} from '../motion/uikit/timing';
import {
  keyboardClearanceCap,
  LAYER_ANCHORED_ATTRIBUTE,
  LAYER_KEYBOARD_CLEARANCE_PX,
} from './layerKeyboardClearance';
import {settledBox} from './settledBox';
import {awaitBrowserClick} from '../utils/browserClickWait';
import {subscribeInput} from '../utils/inputStream';
import {layoutViewportHeight} from '../utils/layoutViewport';

export {
  keyboardClearanceCap,
  LAYER_ANCHORED_ATTRIBUTE,
  LAYER_KEYBOARD_CLEARANCE_PX,
} from './layerKeyboardClearance';

/**
 * The custom property each layer's style sets (useLayer.tsx's `keyboardCap`
 * style). It holds the largest block size that keeps the layer clear of the
 * keyboard while it caps the layer. Otherwise it sets no limit.
 */
export const LAYER_KEYBOARD_CAP_PROPERTY = '--_layer-keyboard-max-block-size';

/**
 * The custom property each layer's style sets beside the cap. It holds `auto`
 * while the keyboard caps the layer, and `visible` otherwise. A surface whose
 * own overflow measure makes it a scroll container reads it as its overflow.
 * So it scrolls from the commit that caps it.
 */
export const LAYER_KEYBOARD_OVERFLOW_PROPERTY = '--_layer-keyboard-overflow';

/**
 * Scrolls the nearest scroll container between `target` and `layer` the
 * least amount that shows `target` inside it.
 */
function keepInView(layer: HTMLElement, target: Element) {
  const view = layer.ownerDocument.defaultView;
  for (
    let box: HTMLElement | null = target.parentElement;
    box != null;
    box = box === layer ? null : box.parentElement
  ) {
    const overflowY = view?.getComputedStyle(box).overflowY;
    if (
      box.scrollHeight > box.clientHeight + 1 &&
      (overflowY === 'auto' || overflowY === 'scroll')
    ) {
      const outer = box.getBoundingClientRect();
      const inner = target.getBoundingClientRect();
      if (inner.bottom > outer.bottom) {
        box.scrollTop += inner.bottom - outer.bottom;
      } else if (inner.top < outer.top) {
        box.scrollTop -= outer.top - inner.top;
      }
      return;
    }
  }
}

/** What `useLayerKeyboardClearance` gives the layer runtime. */
export interface LayerKeyboardClearance {
  /** The block size that keeps the layer clear of the keyboard, or null. */
  readonly cap: number | null;
  /**
   * Follows a layer element the runtime swaps in while the layer is open.
   * The runtime calls it from its layer ref callback.
   */
  readonly followLayerElement: () => void;
}

/**
 * Keeps an open anchor-mode layer clear of the software keyboard. While a
 * software keyboard covers the bottom of the viewport, an anchored layer that
 * would run under it keeps its block-start edge. Its block size is capped so
 * that it ends `LAYER_KEYBOARD_CLEARANCE_PX` above the keyboard. The caller
 * applies the cap to the layer's own element (useLayer.tsx's `keyboardCap`).
 * Only a layer whose committed element carries `LAYER_ANCHORED_ATTRIBUTE`
 * (anchor positioning) is capped; other positionings own their geometry.
 */
export function useLayerKeyboardClearance(
  isOpen: boolean,
  layerRef: RefObject<HTMLElement | null>,
): LayerKeyboardClearance {
  const [cap, setCap] = useState<number | null>(null);
  // The cap the layer renders with, read by the measurement between commits.
  const capRef = useRef<number | null>(null);
  // Set while the layer is open: follows the runtime when it replaces the
  // layer element without closing it.
  const resyncRef = useRef<(() => void) | null>(null);

  // Syncs the cap with the software keyboard's layout guide and with the
  // open layer's element.
  useIsomorphicLayoutEffect(() => {
    const initial = layerRef.current;
    const win = initial?.ownerDocument.defaultView;
    if (!isOpen || initial == null || win == null) {
      return;
    }
    // The window, for the hoisted press handlers below.
    const view: Window = win;
    let isDisposed = false;
    const guide = getKeyboardLayoutGuide(win);
    // The element the cap and the press tracking are on. The runtime can
    // replace the layer element while it stays open; `sync` moves both to the
    // element the ref holds now.
    let layer: HTMLElement = initial;
    const sync = (): boolean => {
      const next = layerRef.current;
      if (next == null || next === layer) {
        return false;
      }
      layer.removeEventListener('pointerdown', handlePress, true);
      layer = next;
      layer.addEventListener('pointerdown', handlePress, true);
      return true;
    };
    // Renders the layer with `next` and returns once that commit has laid it
    // out, so the measurement after it reads the new box. Runs outside
    // React's own work: keyboard reports, timers, frames and native events.
    const commitCap = (next: number | null) => {
      if (isDisposed || capRef.current === next) {
        return;
      }
      capRef.current = next;
      // eslint-disable-next-line @eslint-react/dom-no-flush-sync -- the box is measured at its new size in the same task, before the frame paints
      flushSync(() => setCap(next));
      sync();
    };
    // Measured at the layer's own size, as the fallback order places it:
    // returns whether the layer is capped.
    const capFor = (inset: number): boolean => {
      commitCap(null);
      if (inset <= 0) {
        return false;
      }
      // In layout px, the box's and the keyboard's units: WebKit reports
      // `innerHeight` in the pinch-zoomed visual viewport's px.
      const viewport = layoutViewportHeight(win);
      const box = settledBox(layer);
      const height = keyboardClearanceCap(box, viewport, inset);
      if (height == null) {
        return false;
      }
      commitCap(height);
      // A layer too tall for the room below its trigger can sit higher, over
      // the trigger, where the viewport fit placed it. Shorter, it goes back
      // below the trigger: cap it again from where it starts now.
      const placed = settledBox(layer);
      if (placed.top > box.top + 1) {
        const again = keyboardClearanceCap(placed, viewport, inset);
        if (again != null) {
          commitCap(again);
        }
      }
      // The cap holds the block-start edge: below its trigger the top stays
      // and the bottom comes up. Placed above its trigger the layer holds its
      // bottom instead, which a shorter box cannot lift: leave it as it is.
      const limit = viewport - inset - LAYER_KEYBOARD_CLEARANCE_PX;
      if (settledBox(layer).bottom > limit + 1) {
        commitCap(null);
        return false;
      }
      return true;
    };

    const avoid = (inset: number) => {
      sync();
      if (!layer.hasAttribute(LAYER_ANCHORED_ATTRIBUTE)) {
        commitCap(null);
        return;
      }
      if (!capFor(inset)) {
        return;
      }
      // The composing component makes its surface a scroll container once it
      // overflows. That comes a frame later, as its observer reports the
      // smaller box. Keep the field being typed into in view after that.
      const focused = layer.ownerDocument.activeElement;
      if (focused != null && focused !== layer && layer.contains(focused)) {
        win.requestAnimationFrame(() =>
          win.requestAnimationFrame(() => {
            if (!isDisposed) {
              keepInView(layer, focused);
            }
          }),
        );
      }
    };

    let pending: number | null = null;
    const cancelPending = () => {
      if (pending != null) {
        win.clearTimeout(pending);
        pending = null;
      }
    };
    // A tap in the capped layer can blur the field it leaves (a button takes
    // focus on Android and in Chromium). The keyboard then starts down. The
    // full height must not come back between the tap's press and its click.
    // Otherwise the click lands on whatever moved under the finger. Such a
    // change waits for the browser's click after the lift (`awaitBrowserClick`).
    // The window's release subscriptions are held only while a press in the
    // layer is live.
    const pressed = new Set<number>();
    let deferred: (() => void) | null = null;
    let stopWaiting: (() => void) | null = null;
    let stopFollowing: (() => void) | null = null;
    const follow = () => {
      const stops = [
        subscribeInput(view, 'pointerup', handleRelease),
        subscribeInput(view, 'pointercancel', handleRelease),
      ];
      stopFollowing = () => {
        for (const stop of stops) {
          stop();
        }
      };
    };
    const unfollow = () => {
      stopFollowing?.();
      stopFollowing = null;
    };
    const runDeferred = () => {
      stopWaiting?.();
      stopWaiting = null;
      pressed.clear();
      unfollow();
      const run = deferred;
      deferred = null;
      run?.();
    };
    function handlePress(event: PointerEvent) {
      if (pressed.size === 0) {
        follow();
      }
      pressed.add(event.pointerId);
    }
    function handleRelease(event: PointerEvent) {
      if (!pressed.has(event.pointerId)) {
        return;
      }
      if (event.type === 'pointercancel') {
        runDeferred();
        return;
      }
      stopWaiting ??= awaitBrowserClick(layer, {
        onClicked: runDeferred,
        onNoClick: runDeferred,
      });
    }
    layer.addEventListener('pointerdown', handlePress, true);
    const unsubscribe = guide.subscribe(transition => {
      cancelPending();
      if (transition.animated && transition.to > transition.from) {
        // Rising: the keyboard covers the difference on its way up. A box's
        // height cannot change on the compositor, so the cap changes once,
        // when the keyboard arrives. Chrome draws Gboard's slide; Safari's
        // keyboard takes UIKit's notification duration.
        const arrival =
          transition.start +
          (guide.profile === 'chromium' && transition.curve != null
            ? transition.curve.durationMs
            : timing.keyboardNotificationMs);
        pending = win.setTimeout(
          () => {
            pending = null;
            avoid(transition.to);
          },
          Math.max(0, arrival - win.performance.now()),
        );
        return;
      }
      // Falling (it uncovers the full height as it goes) or at once; after
      // the click of a press in progress inside the layer.
      if (pressed.size > 0) {
        deferred = () => avoid(transition.to);
        return;
      }
      avoid(transition.to);
    });
    // Opened while a keyboard is up: capped in the task that opens it. So no
    // frame callback reads the layer uncapped, and no frame paints it so. The
    // runtime has shown the layer before this commit. A read here places it,
    // as the fallback order's read in the same task does. `flushSync` cannot
    // run inside a commit, so the cap runs in a microtask right after it.
    if (getKeyboardHeight(win) > 0) {
      win.queueMicrotask(() => {
        if (!isDisposed) {
          avoid(getKeyboardHeight(win));
        }
      });
    }
    // A layer element the runtime swaps in while the layer is open. The press
    // tracking moves to it in the commit that brings it. Its own box is read
    // in the next frame, before that frame paints: the runtime shows the new
    // element only after this call. Like a keyboard change, it waits for a
    // press in the layer to make its click. A rising keyboard's arrival reads
    // it instead.
    let swapped: number | null = null;
    resyncRef.current = () => {
      if (!sync() || swapped != null || getKeyboardHeight(win) <= 0) {
        return;
      }
      swapped = win.requestAnimationFrame(() => {
        swapped = null;
        if (isDisposed || pending != null) {
          return;
        }
        if (pressed.size > 0) {
          deferred = () => avoid(getKeyboardHeight(win));
          return;
        }
        avoid(getKeyboardHeight(win));
      });
    };
    return () => {
      isDisposed = true;
      resyncRef.current = null;
      if (swapped != null) {
        win.cancelAnimationFrame(swapped);
      }
      unsubscribe();
      cancelPending();
      stopWaiting?.();
      layer.removeEventListener('pointerdown', handlePress, true);
      unfollow();
      // A closed layer reopens at its own size.
      if (capRef.current != null) {
        capRef.current = null;
        setCap(null);
      }
    };
  }, [isOpen, layerRef]);

  const followLayerElement = useCallback(() => {
    resyncRef.current?.();
  }, []);
  return {cap: isOpen ? cap : null, followLayerElement};
}
