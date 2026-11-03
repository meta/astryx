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
import {
  makeSnapPaging,
  type SnapPaging,
  type SnapPagingAttachment,
  type SnapPagingOptions,
  snapStops,
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
    return makeSnapPaging(element => attachPaging(element, live));
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
function childTrack(element: HTMLElement) {
  let isMoving = false;
  let heldOffset = 0;
  let heldTravel = 0;
  // The row's own inline snap type, back at the hand-back.
  let ownSnapType = '';
  const children = () =>
    Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
  const isRtl = () => isRtlElement(element);
  // The pager's x for a position, and what a child's translate adds to it.
  const sign = () => (isRtl() ? -1 : 1);
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

  function stops(): number[] {
    const end = isMoving
      ? heldTravel
      : Math.max(0, element.scrollWidth - element.clientWidth);
    return snapStops(element, position(), end);
  }

  function viewWidth(): number {
    const {start, end} = padding();
    return Math.max(1, element.clientWidth - start - end);
  }

  function place(at: number): void {
    for (const child of children()) {
      animatorFor(child).set({x: toChild(xOf(at))});
    }
  }

  function takeOver(): void {
    if (isMoving) {
      return;
    }
    heldOffset = nativePosition();
    heldTravel = Math.max(0, element.scrollWidth - element.clientWidth);
    isMoving = true;
    // A snap type would snap the row again as its children move.
    ownSnapType = element.style.getPropertyValue('scroll-snap-type');
    element.style.setProperty('scroll-snap-type', 'none');
    // A flick moves one view at most: the items within a view of the
    // viewport get their own layers, and no others.
    const box = element.getBoundingClientRect();
    for (const child of children()) {
      const rect = child.getBoundingClientRect();
      if (
        rect.right >= box.left - box.width &&
        rect.left <= box.right + box.width
      ) {
        child.style.setProperty('will-change', 'transform');
      }
    }
    place(heldOffset);
  }

  function handBack(): void {
    if (!isMoving) {
      return;
    }
    const at = position();
    for (const child of children()) {
      const animator = animatorFor(child);
      animator.stop(['x']);
      animator.set({x: 0});
      child.style.removeProperty('translate');
      child.style.removeProperty('will-change');
    }
    isMoving = false;
    if (ownSnapType === '') {
      element.style.removeProperty('scroll-snap-type');
    } else {
      element.style.setProperty('scroll-snap-type', ownSnapType);
    }
    element.scrollTo({left: isRtl() ? -at : at, behavior: 'instant'});
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
): SnapPagingAttachment {
  const track = childTrack(element);
  // The stop that view pages count from, set when a gesture takes over.
  let anchor = 0;
  const pager = createPager(
    {
      count: 1,
      pages: 'children',
      // A trackpad swipe is a scroll, not a pointer, so it pages whatever
      // the pointer kinds.
      panOptions: {allowedPointerTypes: ['touch', 'pen']},
      measurePages: () => {
        const stops = track.stops();
        return (options.pages ?? 'view') === 'item'
          ? stops
          : viewPages(
              stops,
              Math.min(anchor, stops.length - 1),
              track.viewWidth(),
            );
      },
      shouldBeginPan: () => {
        if (!track.isMoving) {
          const at = track.position();
          const stops = track.stops();
          anchor = stops.reduce(
            (best, stop, i) =>
              Math.abs(stop - at) < Math.abs(stops[best] - at) ? i : best,
            0,
          );
          track.takeOver();
          pager.setOptions({});
          pager.goTo(pager.nearestPage(at), {
            animated: false,
            reason: 'controlled',
          });
          // The finger catches the row where it is shown.
          track.place(at);
        }
        return true;
      },
      onSettle: () => {
        if (!pager.isDragging && !pager.isSettling) {
          track.handBack();
        }
      },
    },
    {animator: track.animator},
  );
  const detach = pager.attach(element, element);
  return {
    detach: () => {
      detach();
      pager.dispose();
      track.handBack();
    },
    moveHeld: target => {
      if (!track.isMoving) {
        return false;
      }
      // A finger on the row keeps it.
      if (!pager.isDragging) {
        const end = Math.max(0, element.scrollWidth - element.clientWidth);
        const to = Math.min(Math.max(target(track.position()), 0), end);
        // The pager's own move: a finger catches it as it catches a settle.
        pager.goTo(pager.nearestPage(to), {offset: to});
      }
      return true;
    },
  };
}
