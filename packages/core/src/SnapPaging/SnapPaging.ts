// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file SnapPaging.ts
 * @input The shared pager, each child's own animator and the
 *   writing-direction read
 * @output `useSnapPaging`: UIKit paging on Carousel's row of snap items, under
 *   a finger and on a trackpad swipe, for every pointer
 * @position Public, from `@astryxdesign/core/SnapPaging` and the root. The
 *   only module that brings the pager to Carousel
 */

import {useRef, useState} from 'react';
import {createPager, type PagerAnimator} from '../hooks/usePager';
import {isRtlElement} from '../hooks/isRtlElement';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {animatorFor, type MotionHandle} from '../motion/animator';
import {observeMutations} from '../utils/sharedMutationObserver';
import {observeResize} from '../utils/sharedResizeObserver';
import {
  type HeldRowListener,
  makeSnapPaging,
  rowScale,
  type SnapPages,
  type SnapPaging,
  type SnapPagingAttachment,
  type SnapPagingOptions,
  snapPages,
} from './snapPagingValue';

export type {SnapPaging, SnapPagingOptions} from './snapPagingValue';

/**
 * Snap paging for Carousel: `<Carousel hasSnap={useSnapPaging()}>`. Carousel
 * attaches the value to its scroll area. A flick moves one view by default, or
 * one item with `{pages: 'item'}`. The same value lasts for the component's
 * life, so a render attaches nothing again; a new `pages` applies from the
 * next flick.
 *
 * @example
 * ```
 * <Carousel hasSnap={useSnapPaging({pages: 'item'})}>{cards}</Carousel>
 * ```
 */
export function useSnapPaging(options: SnapPagingOptions = {}): SnapPaging {
  const optionsRef = useRef(options);
  // Syncs optionsRef with the committed render, so a new `pages` applies from
  // the next flick. It is written at commit: a render that React discards
  // must not leave its options behind.
  useIsomorphicLayoutEffect(() => {
    optionsRef.current = options;
  });
  const [value] = useState(() => {
    const live: SnapPagingOptions = {
      get pages() {
        return optionsRef.current.pages;
      },
    };
    return makeSnapPaging((element, onHeld) =>
      attachPaging(element, live, onHeld),
    );
  });
  return value;
}

/**
 * The view pages from stop `anchor`. Each lies on the stop nearest one view
 * on from the last, and at least one stop on.
 */
function viewPages(
  stops: ReadonlyArray<number>,
  anchor: number,
  width: number,
): number[] {
  const nearest = (to: number) => {
    let best = 0;
    for (let i = 1; i < stops.length; i++) {
      if (Math.abs(stops[i] - to) < Math.abs(stops[best] - to)) {
        best = i;
      }
    }
    return best;
  };
  const pages = [stops[anchor]];
  for (let i = anchor; i < stops.length - 1;) {
    i = Math.max(nearest(stops[i] + width), i + 1);
    pages.push(stops[i]);
  }
  for (let i = anchor; i > 0;) {
    i = Math.min(nearest(stops[i] - width), i - 1);
    pages.unshift(stops[i]);
  }
  return pages;
}

/** One handle for the same motion on every child. */
function combined(handles: ReadonlyArray<MotionHandle>): MotionHandle {
  const [lead] = handles;
  return {
    properties: lead.properties,
    finished: Promise.all(handles.map(async handle => handle.finished)).then(
      results => results.every(Boolean),
    ),
    started: lead.started,
    value: (property, time) => lead.value(property, time),
    velocity: (property, time) => lead.velocity(property, time),
    curve: property => lead.curve(property),
    retarget: (to, transition, options) =>
      combined(handles.map(handle => handle.retarget(to, transition, options))),
    stop: () => {
      for (const handle of handles) {
        handle.stop();
      }
    },
  };
}

/**
 * The track the pager moves. At rest the row scrolls natively, and the
 * position is its scroll offset. A gesture takes the row over: its scroll
 * offset holds, and every child moves by the same translate from there. The
 * settle hands the position back to native scrolling.
 */
function childTrack(element: HTMLElement, onHeld?: HeldRowListener) {
  let isMoving = false;
  let heldOffset = 0;
  let heldTravel = 0;
  // The direction and the lead child, read at the takeover, so a frame of the
  // hold reads no style or layout.
  let heldSign = 1;
  let lead: HTMLElement | null = null;
  let followFrame = 0;
  // The row's travel, the children's span and the row's width at the
  // takeover. A resize while the row is held moves the travel by the change in
  // span and width.
  let takeoverTravel = 0;
  let heldSpan = 0;
  let heldWidth = 0;
  // The row's own inline snap type, back at the hand-back.
  let ownSnapType = '';
  const children = () =>
    Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  const isRtl = () => isRtlElement(element);
  // The pager's x for a position, and what a child's translate adds to it. A
  // held row keeps the direction it was taken over with.
  const sign = () => (isMoving ? heldSign : isRtl() ? -1 : 1);
  const xOf = (position: number) => -sign() * position;
  const nativePosition = () => Math.abs(element.scrollLeft);
  const padding = () => {
    const style = getComputedStyle(element);
    const left = Number.parseFloat(style.scrollPaddingLeft) || 0;
    const right = Number.parseFloat(style.scrollPaddingRight) || 0;
    return isRtl() ? {start: right, end: left} : {start: left, end: right};
  };
  const toChild = (x: number) => x + sign() * heldOffset;

  function position(): number {
    const first = children()[0];
    if (!isMoving || first == null) {
      return nativePosition();
    }
    return -sign() * (animatorFor(first).get('x') - sign() * heldOffset);
  }

  // Reports where the held row is shown, once a frame, from the lead child's
  // own animator.
  function follow(): void {
    if (onHeld == null || !isMoving) {
      return;
    }
    const offset =
      lead == null
        ? heldOffset
        : -heldSign * (animatorFor(lead).get('x') - heldSign * heldOffset);
    onHeld({offset, travel: heldTravel});
    followFrame = requestAnimationFrame(follow);
  }

  // Every child carries the same translate, so a held row's span is its
  // layout's.
  function span(): number {
    const items = children();
    if (items.length === 0) {
      return 0;
    }
    let start = Infinity;
    let end = -Infinity;
    for (const child of items) {
      const rect = child.getBoundingClientRect();
      start = Math.min(start, rect.left);
      end = Math.max(end, rect.right);
    }
    return (end - start) / rowScale(element, element.getBoundingClientRect());
  }

  // A resize while the row is held moves its travel with the row's width and
  // the children's span. A frame of the hold reads the result, not the row.
  function remeasure(): void {
    if (!isMoving) {
      return;
    }
    const nextSpan = span();
    const nextWidth = element.clientWidth;
    const native = nativePosition();
    // WebKit truncates a fractional scroll offset, so the travel stays a whole
    // number of pixels, as the scroll width is. It rounds once, from the
    // takeover, so a resize over many frames adds up no rounding.
    heldTravel = Math.max(
      0,
      Math.round(
        takeoverTravel + (nextSpan - heldSpan) - (nextWidth - heldWidth),
      ),
    );
    // A shorter travel clamps the row's own scroll offset. The children take
    // up the clamp, so the row still shows where the pager holds it.
    if (native !== heldOffset) {
      const at = position();
      heldOffset = native;
      place(at);
    }
  }

  // A held row's translate widens its overflow, so its travel is the one it
  // was taken over with, moved by any resize since.
  function travel(): number {
    return isMoving
      ? heldTravel
      : Math.max(0, element.scrollWidth - element.clientWidth);
  }

  function pages(): SnapPages {
    return snapPages(element, position(), travel());
  }

  function stops(): number[] {
    return pages().stops;
  }

  function viewWidth(): number {
    const {start, end} = padding();
    return Math.max(1, element.clientWidth - start - end);
  }

  function place(at: number): void {
    const x = toChild(xOf(at));
    for (const child of children()) {
      const animator = animatorFor(child);
      // A set reads the element's style back, so a child already there
      // gets none.
      if (animator.get('x') !== x) {
        animator.set({x});
      }
    }
  }

  function takeOver(): void {
    if (isMoving) {
      return;
    }
    // Every read comes before the first write, so the takeover forces no
    // layout of its own.
    const offset = nativePosition();
    const rowTravel = Math.max(0, element.scrollWidth - element.clientWidth);
    const rowSign = isRtl() ? -1 : 1;
    const items = children();
    const rowSpan = span();
    const rowWidth = element.clientWidth;
    heldOffset = offset;
    heldTravel = rowTravel;
    takeoverTravel = rowTravel;
    heldSpan = rowSpan;
    heldWidth = rowWidth;
    heldSign = rowSign;
    lead = items[0] ?? null;
    isMoving = true;
    // A snap type would snap the row again as its children move.
    ownSnapType = element.style.getPropertyValue('scroll-snap-type');
    element.style.setProperty('scroll-snap-type', 'none');
    // Each child's animator gives it a layer while it moves and takes the layer
    // away after the motion. So the takeover writes no will-change itself.
    place(heldOffset);
    follow();
  }

  // `beforeSnap` runs once the children are back in place and before the
  // row's snap type returns, so the hand-back's scroll snaps on what it
  // writes.
  function handBack(beforeSnap?: () => void): void {
    if (!isMoving) {
      return;
    }
    const at = position();
    for (const child of children()) {
      const animator = animatorFor(child);
      animator.stop(['x']);
      animator.set({x: 0});
      child.style.removeProperty('translate');
    }
    isMoving = false;
    beforeSnap?.();
    if (ownSnapType === '') {
      element.style.removeProperty('scroll-snap-type');
    } else {
      element.style.setProperty('scroll-snap-type', ownSnapType);
    }
    element.scrollTo({left: isRtl() ? -at : at, behavior: 'instant'});
    if (onHeld != null) {
      cancelAnimationFrame(followFrame);
      onHeld({offset: at, travel: heldTravel});
      onHeld(null);
    }
  }

  const animator: PagerAnimator = {
    get(property, time) {
      const first = children()[0];
      if (!isMoving || first == null) {
        return property === 'x' ? xOf(nativePosition()) : 0;
      }
      const value = animatorFor(first).get(property, time);
      return property === 'x' ? value - sign() * heldOffset : value;
    },
    getVelocity(property, time) {
      const first = children()[0];
      return isMoving && first != null
        ? animatorFor(first).getVelocity(property, time)
        : 0;
    },
    set(values, options) {
      if (!isMoving) {
        return;
      }
      const shifted =
        values.x == null ? values : {...values, x: toChild(values.x)};
      for (const child of children()) {
        animatorFor(child).set(shifted, options);
      }
    },
    stop(properties) {
      if (!isMoving) {
        return;
      }
      for (const child of children()) {
        animatorFor(child).stop(properties);
      }
    },
    play(curves, options) {
      takeOver();
      const offset = sign() * heldOffset;
      const x = curves.x;
      const shifted =
        x == null
          ? curves
          : {
              ...curves,
              x: {...x, at: (t: number) => x.at(t) + offset},
            };
      const items = children();
      const handles = (items.length > 0 ? items : [element]).map(child =>
        animatorFor(child).play(shifted, options),
      );
      return combined(handles);
    },
  };

  return {
    animator,
    get isMoving() {
      return isMoving;
    },
    position,
    travel,
    remeasure,
    pages,
    stops,
    viewWidth,
    place,
    takeOver,
    handBack,
  };
}

/**
 * The pager on the row's children. A finger, a pen or a trackpad swipe takes
 * the row over, and the settle gives it back. A mouse drag and a mouse wheel
 * leave the row to native scrolling.
 */
function attachPaging(
  element: HTMLElement,
  options: SnapPagingOptions,
  onHeld?: HeldRowListener,
): SnapPagingAttachment {
  const track = childTrack(element, onHeld);
  // A child's animator reads its stylesheet's will-change in a later task. So
  // a press that moves the row reads no style in its own task.
  for (const child of Array.from(element.children)) {
    if (child instanceof HTMLElement) {
      animatorFor(child);
    }
  }
  // The stop that view pages count from, set when a gesture takes over.
  let anchor = 0;
  // The row's stops and view width, read before a takeover's first write.
  let measured: {stops: number[]; viewWidth: number} | null = null;
  // Native snap skips each item whose stop the end's page takes. So a wheel,
  // a key or a scroll rests on the same pages as a flick. Each skipped item
  // gets its own inline value and priority back when its stop leaves the
  // end's page or the paging detaches.
  const skipped = new Map<HTMLElement, {value: string; priority: string}>();
  const skip = (items: ReadonlyArray<Element>) => {
    for (const [item, own] of skipped) {
      if (!items.includes(item)) {
        skipped.delete(item);
        if (own.value === '') {
          item.style.removeProperty('scroll-snap-align');
        } else {
          item.style.setProperty('scroll-snap-align', own.value, own.priority);
        }
      }
    }
    for (const item of items) {
      if (item instanceof HTMLElement && !skipped.has(item)) {
        skipped.set(item, {
          value: item.style.getPropertyValue('scroll-snap-align'),
          priority: item.style.getPropertyPriority('scroll-snap-align'),
        });
        item.style.setProperty('scroll-snap-align', 'none');
      }
    }
  };
  // The skip follows the stops at rest, at most once a frame. A change while
  // the paging holds the row waits for the hand-back, which writes it before
  // the row snaps again.
  let resnapFrame: number | null = null;
  let isResnapDue = false;
  const resnap = () => {
    if (track.isMoving) {
      isResnapDue = true;
      return;
    }
    resnapFrame ??= requestAnimationFrame(() => {
      resnapFrame = null;
      if (track.isMoving) {
        isResnapDue = true;
        return;
      }
      isResnapDue = false;
      skip(track.pages().skipped);
    });
  };
  const takeOverShown = (at: number) => {
    // Every read comes before the takeover's first write.
    const stops = track.stops();
    const viewWidth = track.viewWidth();
    anchor = stops.reduce(
      (best, stop, i) =>
        Math.abs(stop - at) < Math.abs(stops[best] - at) ? i : best,
      0,
    );
    measured = {stops, viewWidth};
    pager.setOptions({});
    measured = null;
    // The pager learns its page while the row is at rest, which moves
    // nothing. The takeover then holds the row where it is shown.
    pager.goTo(pager.nearestPage(at), {
      animated: false,
      reason: 'controlled',
    });
    track.takeOver();
  };
  const pager = createPager(
    {
      count: 1,
      pages: 'children',
      // A trackpad swipe is a scroll, not a pointer, so it pages whatever
      // the pointer kinds.
      panOptions: {allowedPointerTypes: ['touch', 'pen']},
      measurePages: () => {
        // A resize while the row is held moves its travel first.
        track.remeasure();
        const stops = measured?.stops ?? track.stops();
        // Native snap follows the new stops. The skip writes in a later
        // frame, so this read stays ahead of any write.
        resnap();
        return (options.pages ?? 'view') === 'item'
          ? stops
          : viewPages(
              stops,
              Math.min(anchor, stops.length - 1),
              measured?.viewWidth ?? track.viewWidth(),
            );
      },
      shouldBeginPan: () => {
        // The finger catches the row where it is shown.
        if (!track.isMoving) {
          takeOverShown(track.position());
        }
        return true;
      },
      onSettle: () => {
        if (!pager.isDragging && !pager.isSettling) {
          track.handBack(
            isResnapDue
              ? () => {
                  isResnapDue = false;
                  skip(track.pages().skipped);
                }
              : undefined,
          );
        }
      },
    },
    {animator: track.animator},
  );
  const detach = pager.attach(element, element);
  // Items that change while the row keeps its size move the stops too.
  let unobserveItems: (() => void)[] = [];
  const observeItems = () => {
    for (const unobserve of unobserveItems) {
      unobserve();
    }
    unobserveItems = Array.from(element.children, item =>
      observeResize(item, resnap),
    );
  };
  const unobserveList = observeMutations(element, {childList: true}, () => {
    observeItems();
    resnap();
  });
  observeItems();
  return {
    detach: () => {
      detach();
      pager.dispose();
      unobserveList();
      for (const unobserve of unobserveItems) {
        unobserve();
      }
      if (resnapFrame != null) {
        cancelAnimationFrame(resnapFrame);
        resnapFrame = null;
      }
      track.handBack();
      skip([]);
    },
    move: target => {
      // A finger on the row keeps it.
      if (pager.isDragging) {
        return;
      }
      // The target reads the row too, so every read comes before the
      // takeover's first write.
      const at = track.position();
      const end = track.travel();
      const to = Math.min(Math.max(target(at, end), 0), end);
      // A move from rest is the pager's own too. So a touch catches it as it
      // catches a settle, and the release rests on a page.
      if (!track.isMoving) {
        takeOverShown(at);
      }
      pager.goTo(pager.nearestPage(to), {offset: to});
    },
    moveHeld: target => {
      if (!track.isMoving) {
        return false;
      }
      // A finger on the row keeps it.
      if (!pager.isDragging) {
        const end = track.travel();
        const to = Math.min(Math.max(target(track.position(), end), 0), end);
        // The pager's own move: a finger on the row stops it at the touch.
        pager.goTo(pager.nearestPage(to), {offset: to});
      }
      return true;
    },
  };
}
