// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useListUpdateMotion.ts
 * @input A List's element, whether it animates its changes, the touch
 *   presentation (utils/touchPresentation.ts), the row moves of
 *   utils/rowMotion.ts and the table spring (motion/uikit/list.ts, an
 *   internal constant)
 * @output `useListUpdateMotion`: after every commit that inserts, removes or
 *   reorders rows, the rows that stay slide from where they were to where
 *   they are, and inserted rows fade in once the rows crossing them have
 *   cleared and removed rows collapse in place, the way a UIKit table
 *   animates its updates; a row crossing rows that move the other way
 *   carries `TRAVELLING_ATTRIBUTE` for its slide
 * @position Internal interaction utility for any list root whose direct
 *   children are its rows; List calls it with `hasAnimatedChanges`
 *
 * UIKit's reference (iOS 26.2): a table's insert, delete, move and reload
 * animations and its batch updates all run on one critically damped spring
 * (`list.update.tableSpring`, response 0.3 s). A deleted cell collapses: its
 * height (content, separator and, after a swipe, its action) shrinks to 0
 * from the bottom while the rows below slide up on the same spring, the next
 * row's top edge always on its bottom edge.
 *
 * HOW IT RUNS, compositor only. After each commit the rows' layout positions
 * are read once (`offsetTop` inside the list, which ignores transforms) and
 * compared with the previous commit's (read again whenever the list's box
 * resizes in between, so a layout change no commit made never leaves them
 * stale): a row that moved is put back with an
 * inverse `translate` in the same frame and springs home; a row that is new
 * fades in on the same spring's clock (UIKit's `.fade` row animation). A
 * UIKit cell is opaque: a cell sliding over an inserted one hides it, and a
 * moved cell passes over its neighbours. Rows here have no background, so a
 * new row shows nothing until the rows crossing its band have carried their
 * labels half a row past its own, then fades in, arriving with them; and a
 * row sliding across rows that move the other way (the less common way, up
 * on a tie) rides above them for its slide with the list's surface behind it
 * (List/ListItem.tsx paints it). A removed row comes back for its exit as
 * a ghost (`GHOST_ATTRIBUTE`, inert and hidden from assistive tech) at its
 * place: a clipping box the row's old size whose bottom edge rises with the
 * next row's top. The box translates up by the row's height while the row
 * inside translates down by as much, so the content stays put and the clip
 * closes, compositor only; a ghost below another removed row rides up with
 * it. The ghost goes when its collapse ends, and at once, its motion
 * stopped, when the motion stops owning the list (hasAnimatedChanges off, a
 * mouse, an unmount): the layer's one transient exit copy
 * (`architecture:component-style-authoring` INV7), gone within a second on
 * the table spring. A row moved again mid-motion
 * keeps its velocity, and its curve: a layout shift never changes a running
 * motion's spring (a reorder's drop settles on its own), so the table spring
 * applies to rows at rest. Page content after the list is not the list's to move:
 * the list's height changes by layout at the commit (`spec:AST-094` FR5
 * forbids animating layout), so content after it takes its new place at
 * once, with no transient translate on it. A list that got shorter clips
 * its rows to its box (`overflow-y: clip`) while they move, so the rows
 * sliding up into the gap never paint over that content; a removed last
 * row's copy, outside the new box, is clipped with them. With motion off, nothing is read.
 *
 * Under reduced motion nothing travels (`design:reduced-motion`): every row
 * motion takes the animator's own Reduced Motion handling, so a removed row
 * fades out where it is, a new row fades in where it lands, and the rows
 * that move cross-fade into place.
 *
 * It runs under any finger (useTouchPresentation: a coarse primary pointer,
 * iOS and Android alike; one touch model). With a mouse (the theme's
 * presentation) nothing moves. A list root that
 * carries `data-astryx-reordering` (a drag session in progress) is left to
 * the reorder: its rows' places are remembered, nothing is moved.
 *
 * SYNC: When modified, update List/List.tsx and
 * List/__tests__/ListUpdates.interaction.browser.spec.ts.
 */

import {useRef, type RefObject} from 'react';
import * as stylex from '@stylexjs/stylex';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {animatorFor, type MotionCurve} from '../motion/animator';
import {solveSpring, toSpring, type SpringCurve} from '../motion/spring';
import {list} from '../motion/uikit/list';
import {
  animateRow,
  motionNow,
  motionOf,
  playRow,
  presentation,
  releaseMotion,
  springHome,
  stopRow,
} from '../utils/rowMotion';
import {observeResize} from '../utils/sharedResizeObserver';
import {useTouchPresentation} from '../utils/touchPresentation';

const SPRING = list.update.tableSpring;

/** Moves under half a pixel are layout noise, not updates. */
const MIN_MOVE_PX = 0.5;

/**
 * Written on a row that slides across rows moving the other way, for the
 * length of its slide: it rides above them with the list's surface behind it
 * (List/ListItem.tsx), as a UIKit cell, opaque and on top, passes over its
 * neighbours. Rows here have no background of their own.
 */
export const TRAVELLING_ATTRIBUTE = 'data-astryx-travelling';

/**
 * Marks a removed row's ghost: the clipping box its exit collapses in. Not a
 * row: the rows a commit compares never include it.
 */
export const GHOST_ATTRIBUTE = 'data-astryx-leaving';

const ghostStyles = stylex.create({
  ghost: {
    position: 'absolute',
    boxSizing: 'border-box',
    margin: 0,
    padding: 0,
    listStyle: 'none',
    overflow: 'hidden',
    pointerEvents: 'none',
  },
  // Its inline position is its static one (the list's content box, in
  // either direction); its block position, the row's old place.
  box: (top: string, inlineSize: string, blockSize: string) => ({
    insetBlockStart: top,
    inlineSize,
    blockSize,
  }),
});

/** A row's place after a commit: its top inside the list and its height. */
interface Box {
  readonly top: number;
  readonly height: number;
}

/** The rows after a commit, in order, with their boxes and the list's height. */
interface Layout {
  readonly rows: ReadonlyArray<HTMLElement>;
  readonly boxes: ReadonlyMap<HTMLElement, Box>;
  readonly height: number;
}

/**
 * Writes what the Web Animations running on `row` and its parts present
 * (a swipe's travel, on the compositor) as inline styles. A removed row is
 * detached from the document, which drops those animations, and the
 * removal's collapse re-inserts it: without this it would show its resting
 * state for the length of the collapse. Animations on pseudo-elements, or
 * that cannot write their values, are left alone.
 */
export function keepPresentation(row: HTMLElement): void {
  if (typeof row.getAnimations !== 'function') {
    return;
  }
  for (const animation of row.getAnimations({subtree: true})) {
    try {
      animation.commitStyles();
    } catch {
      // A pseudo-element's or an unrendered target's animation: nothing to
      // keep.
    }
  }
  // The parts' owners clean up after the row does, before React removes it,
  // and may reset what was just written (a swipe gives its row back its own
  // translation): keep it, for `ghostOf` to put back.
  const styled: (readonly [HTMLElement | SVGElement, string])[] = [];
  for (const part of [
    row,
    ...row.querySelectorAll<HTMLElement | SVGElement>('*'),
  ]) {
    if (part.style.length > 0) {
      styled.push([part, part.style.cssText]);
    }
  }
  keptStyles.set(row, styled);
}

/**
 * The inline styles of a leaving row and its parts as `keepPresentation`
 * left them, until the removal's exit puts the row back.
 */
const keptStyles = new WeakMap<
  HTMLElement,
  ReadonlyArray<readonly [HTMLElement | SVGElement, string]>
>();

/**
 * Puts a removed row back for its exit: inside a clipping box at its old
 * place (`box`, inside the list) spanning the list's content box, so the row
 * lays out inside it as it did in the list, before `next` (the first row that
 * followed it and is still there) so the rows around it keep their places in
 * the list's order. The box is inert and hidden from assistive tech.
 */
function ghostOf(
  element: HTMLElement,
  row: HTMLElement,
  box: Box,
  next: HTMLElement | null,
  wasLast: boolean,
): HTMLElement {
  const doc = element.ownerDocument;
  const ghost = doc.createElement(
    element.tagName === 'UL' || element.tagName === 'OL' ? 'li' : 'div',
  );
  ghost.setAttribute(GHOST_ATTRIBUTE, '');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  // Its containing block is the list when the list is positioned, else the
  // rows' offset parent above it.
  const style = getComputedStyle(element);
  const listed = row.offsetParent === element || style.position !== 'static';
  const top = box.top + (listed ? 0 : element.offsetTop);
  const width =
    element.clientWidth -
    (Number.parseFloat(style.paddingInlineStart) || 0) -
    (Number.parseFloat(style.paddingInlineEnd) || 0);
  const props = stylex.props(
    ghostStyles.ghost,
    ghostStyles.box(`${top}px`, `${width}px`, `${box.height}px`),
  );
  ghost.className = props.className ?? '';
  for (const [name, value] of Object.entries(props.style ?? {})) {
    ghost.style.setProperty(name, String(value));
  }
  ghost.append(row);
  if (!wasLast) {
    // The row keeps the divider a row that is not the last draws.
    const tail = doc.createElement('span');
    tail.hidden = true;
    ghost.append(tail);
  }
  element.insertBefore(ghost, next?.parentElement === element ? next : null);
  // The row's parts show what `keepPresentation` wrote as it left. Any
  // animation they still carry applies again now that they are back in the
  // document (a detached element reports none), and would fight that: stop
  // it.
  if (typeof row.getAnimations === 'function') {
    for (const animation of row.getAnimations({subtree: true})) {
      animation.cancel();
    }
  }
  // What an owner's cleanup reset after `keepPresentation` comes back: the
  // row shows what was on screen when it left.
  for (const [part, cssText] of keptStyles.get(row) ?? []) {
    part.style.cssText = cssText;
  }
  keptStyles.delete(row);
  return ghost;
}

/**
 * The sideways offset a row's own inline `translate` carries (a swipe that
 * moves the row itself, as `keepPresentation` kept it), in px, or 0.
 */
function sidewaysOffset(row: HTMLElement): number {
  const [x = ''] = row.style.translate.trim().split(/\s+/);
  const value = Number.parseFloat(x);
  return Number.isFinite(value) ? value : 0;
}

/** One row's slide in a commit: where its box was and is, inside the list. */
interface Slide {
  readonly row: HTMLElement;
  readonly from: number;
  readonly to: number;
  readonly height: number;
}

/**
 * The progress of the update spring (0 → 1) at which a row that just
 * appeared at `top` may start to fade in: once every row sliding across its
 * band has carried its label more than half a row past the new row's label,
 * so the two labels never overlap. (A UIKit cell sliding over an inserted
 * one hides it with its opaque background; rows here have none.)
 */
function clearedAt(
  top: number,
  height: number,
  slides: ReadonlyArray<Slide>,
): number {
  const center = top + height / 2;
  let cleared = 0;
  for (const slide of slides) {
    const distance = slide.to - slide.from;
    const start = slide.from + slide.height / 2;
    // Label centers half a row apart: the labels no longer overlap.
    const apart = (height + slide.height) / 4;
    const [enters, leaves] =
      distance > 0
        ? [
            (center - apart - start) / distance,
            (center + apart - start) / distance,
          ]
        : [
            (start - center - apart) / -distance,
            (start - center + apart) / -distance,
          ];
    if (enters < 1 && leaves > 0) {
      cleared = Math.max(cleared, Math.min(1, leaves));
    }
  }
  return cleared;
}

/**
 * A new row's fade on the update spring's clock: it holds `from` until the
 * spring's progress reaches `after` (the rows crossing its band have cleared
 * it), then follows the progress to 1, arriving with the rows around it.
 */
function fadeIn(
  from: number,
  progress: SpringCurve,
  duration: number,
  after: number,
): MotionCurve {
  // Always leave the fade a tenth of the way to run.
  const begin = Math.min(after, 0.9);
  const at = (t: number) => {
    if (t >= duration) {
      return 1;
    }
    const p = progress.value(Math.max(0, t));
    return (
      from + (1 - from) * Math.min(1, Math.max(0, (p - begin) / (1 - begin)))
    );
  };
  return {
    duration,
    at,
    velocity: t => {
      const step = 1e-3;
      const t0 = Math.max(0, t - step);
      return (at(t + step) - at(t0)) / (t + step - t0);
    },
  };
}

function rowsOf(element: HTMLElement): HTMLElement[] {
  return Array.from(element.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !child.hasAttribute(GHOST_ATTRIBUTE),
  );
}

/** The rows, each row's layout box inside the list, and the list's height. */
function readLayout(element: HTMLElement): Layout {
  const rows = rowsOf(element);
  const boxes = new Map<HTMLElement, Box>();
  for (const row of rows) {
    // Inside the list: content above it changing size moves no row.
    const base = row.offsetParent === element ? 0 : element.offsetTop;
    boxes.set(row, {top: row.offsetTop - base, height: row.offsetHeight});
  }
  return {rows, boxes, height: element.offsetHeight};
}

export function useListUpdateMotion(
  listRef: RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  const animates = useTouchPresentation().isTouch && enabled;
  /**
   * The rows and their layout boxes after the previous commit, or after the
   * last resize of the list since.
   */
  const layoutRef = useRef<Layout | null>(null);
  /** The removed rows' copies still collapsing, each with its row. */
  const ghostsRef = useRef(new Map<HTMLElement, HTMLElement>());
  /** The commit whose motions hold the list's clip; a newer one takes it. */
  const clipRef = useRef(0);

  // External system (`architecture:react-component-runtime` INV3): the rows'
  // shared motion animators (utils/rowMotion.ts), the list's clip, and the
  // removed rows' copies this effect adds to the list. Each commit reads the
  // rows' layout and moves them from where they were; the unmount cleanup
  // below stops them and removes the copies.
  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    // Motion off (no `hasAnimatedChanges`, or a mouse): read
    // nothing at all. The first commit after it turns on only records.
    if (element == null || !animates) {
      layoutRef.current = null;
      return;
    }
    const layout = readLayout(element);
    const {rows, boxes} = layout;
    const before = layoutRef.current;
    layoutRef.current = layout;
    // The first commit, or a reorder session that owns the rows: remember
    // where rows are, move nothing.
    if (before == null || element.hasAttribute('data-astryx-reordering')) {
      return;
    }
    const at = motionNow();
    const motions: Promise<unknown>[] = [];
    const slides: Slide[] = [];
    const entering: HTMLElement[] = [];
    for (const row of rows) {
      const now = boxes.get(row)?.top ?? 0;
      const was = before.boxes.get(row)?.top;
      if (was == null) {
        entering.push(row);
      } else if (Math.abs(was - now) >= MIN_MOVE_PX) {
        slides.push({row, from: was, to: now, height: row.offsetHeight});
      }
    }
    // Rows sliding both ways cross each other: the rows moving the less
    // common way (up, on a tie) ride above the rest for their slide.
    const up = slides.filter(slide => slide.to < slide.from);
    const down = slides.filter(slide => slide.to > slide.from);
    const travelling = new Set(
      up.length > 0 && down.length > 0
        ? up.length <= down.length
          ? up
          : down
        : [],
    );
    for (const slide of slides) {
      const {row} = slide;
      const rides = travelling.has(slide);
      if (rides) {
        row.setAttribute(TRAVELLING_ATTRIBUTE, '');
      }
      const slid = springHome(row, 'y', slide.from - slide.to, SPRING, at).then(
        arrived => {
          if (arrived) {
            releaseMotion(row, 'translate');
          }
          if (rides && motionOf(row, 'y') == null) {
            row.removeAttribute(TRAVELLING_ATTRIBUTE);
          }
        },
      );
      motions.push(slid);
    }
    if (entering.length > 0) {
      // The spring the slides run: new rows time their fade on its
      // progress.
      const progress = solveSpring(toSpring(SPRING), {
        from: 0,
        to: 1,
      });
      const duration = progress.settleTime(0.001);
      for (const row of entering) {
        // New: from the opacity it has (0 when new), once the rows crossing
        // its band have cleared it.
        const from = presentation(row, 'opacity', at);
        const start = from >= 1 ? 0 : from;
        const after = clearedAt(
          boxes.get(row)?.top ?? 0,
          row.offsetHeight,
          slides,
        );
        // From rest it starts with the slides, when the browser commits
        // them; a fade already running continues from the frame on screen.
        const fade = playRow(
          row,
          'opacity',
          fadeIn(start, progress, duration, after),
          SPRING,
          motionOf(row, 'opacity') == null ? undefined : at,
        ).finished.then(arrived => {
          if (arrived) {
            releaseMotion(row, 'opacity');
          }
        });
        motions.push(fade);
      }
    }
    // Removed rows collapse in place on the slides' spring, the row below
    // each glued to its bottom edge (UIKit's deleteRows).
    let removedAbove = 0;
    const ghosts = ghostsRef.current;
    for (const [index, row] of before.rows.entries()) {
      const box = before.boxes.get(row);
      if (row.isConnected || box == null) {
        continue;
      }
      const next =
        before.rows.slice(index + 1).find(later => later.isConnected) ?? null;
      const ghost = ghostOf(
        element,
        row,
        box,
        next,
        index === before.rows.length - 1,
      );
      const lift = removedAbove;
      removedAbove += box.height;
      // From rest, like the slides (springHome): the browser's commit sets
      // the start of all of them, so the edges meet on every frame. Under
      // reduced motion the removed row fades out where it is instead.
      // A row a swipe moved sideways on itself keeps that offset: the
      // removal's y joins it on the row's one animator, so the collapse
      // moves it down only.
      const across = sidewaysOffset(row);
      if (across !== 0) {
        animatorFor(row).set({x: across});
      }
      motions.push(
        animateRow(row, {y: box.height}, SPRING, {crossfadeAs: 'exit'})
          .finished,
      );
      // The copy leaves when its collapse ends (arrival or interruption).
      ghosts.set(ghost, row);
      motions.push(
        animateRow(ghost, {y: -(box.height + lift)}, SPRING, {
          crossfadeAs: 'exit',
        }).finished.then(() => {
          ghosts.delete(ghost);
          ghost.remove();
        }),
      );
    }
    // Content after the list took its new place by layout at this commit.
    // A list that got shorter clips its rows to its box until they rest, so
    // the rows sliding up into the gap never paint over that content; a clip
    // still held by a running motion stays with this commit's motions.
    if (
      motions.length > 0 &&
      (layout.height < before.height - MIN_MOVE_PX ||
        element.style.getPropertyValue('overflow-y') === 'clip')
    ) {
      const mine = ++clipRef.current;
      element.style.setProperty('overflow-y', 'clip');
      void Promise.all(motions).then(() => {
        if (clipRef.current === mine) {
          element.style.removeProperty('overflow-y');
        }
      });
    }
  });

  // External system (`architecture:react-component-runtime` INV3): the
  // removed rows' copies this hook put in the list, DOM outside React, and
  // the list's clip. When the motion stops owning the list (hasAnimatedChanges
  // off, a mouse, an unmount), each copy leaves at once with its motion
  // stopped, and the clip goes.
  useIsomorphicLayoutEffect(() => {
    if (!animates) {
      return;
    }
    const ghosts = ghostsRef.current;
    const element = listRef.current;
    return () => {
      clipRef.current += 1;
      element?.style.removeProperty('overflow-y');
      for (const [ghost, row] of ghosts) {
        stopRow(row, 'translate');
        stopRow(ghost, 'translate', 'opacity');
        ghost.remove();
      }
      ghosts.clear();
    };
  }, [listRef, animates]);

  // Layout that changes with no commit (a web font arriving, a rotation that
  // rewraps rows, a stylesheet or theme changing row heights, a row resizing
  // itself) would leave the places above stale, and the next update would
  // start its rows from where they no longer were: read them again whenever
  // the list's box changes size. External system
  // (`architecture:react-component-runtime` INV3): a resize observation of the
  // list's box, released by the cleanup.
  useIsomorphicLayoutEffect(() => {
    const element = listRef.current;
    if (element == null || !animates) {
      return;
    }
    return observeResize(element, () => {
      if (layoutRef.current == null) {
        return;
      }
      layoutRef.current = readLayout(element);
    });
  }, [listRef, animates]);
}
