// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file railMotion.ts
 * @input The rail's outer element, the animated-layout module's handle,
 *   motion and in-place swap (motion/animatedLayout.ts)
 * @output Exports `SideNavShellContext` (what AppShell lends its SideNav),
 *   `createRailLayout`, `snapshotRail` and `playRail`: the rail's collapse
 *   motion
 * @position Internal to SideNav (`component:SideNav` FR6, DEC-2); AppShell's
 *   content area moves through the context (`component:AppShell` FR17)
 *
 * Collapsing or expanding the rail plays one motion on one clock, the
 * `springs.settle` role the animated-layout module reads (`spec:AST-105`
 * FR4):
 * - Layout snaps to the final rail width at once; nothing animates a width.
 * - A collapse covers the old rail by a clip: the module's in-place swap
 *   (`spec:AST-105` FR8) holds the old, expanded rail as one transient copy
 *   and the clip closes it to the new width. The copy's text fades over the
 *   first 40%; the real collapsed rail, raised above the copy, fades in over
 *   the last 30%, so the real rail, icons only, is all that remains.
 * - An expand reveals the real rail by a clip from the old width, its text
 *   fading in over the last 60% so no label shows at the collapsed width,
 *   under the old, collapsed rail held by the same swap, which fades over the
 *   first 60%: the first frame is the frame before the click.
 * - In AppShell the rail's edge rides the content column's glide, frame by
 *   frame, so the two never part, also when a change interrupts a running
 *   one; the copy is laid in the row that holds both.
 * - A change made during a running motion starts from what the rail shows:
 *   its width, its labels' opacity and its collapsed icons' opacity, so the
 *   rail stays continuous.
 * - Every starting clip applies in the commit's layout effect, before the
 *   first frame paints.
 * - Under Reduce Motion it follows `design:reduced-motion`: opacity only
 *   under a coarse primary pointer (DR2), an immediate change otherwise
 *   (DR3). Without Web Animations, the change lands at once.
 *
 * SYNC: When modified, update SideNav.tsx, AppShell.tsx and
 * SideNavRailMotion.test.tsx.
 */

import {createContext} from 'react';
import {
  createAnimatedLayout,
  holdLayoutSwap,
  layoutMotionFor,
  playLayoutFrames,
  playLayoutSwap,
  type AnimatedLayout,
  type LayoutSwap,
} from '../motion/animatedLayout';

/** What AppShell lends its SideNav; outside AppShell, nothing. */
export interface SideNavShell {
  /** AppShell's own handle, whose area holds the rail and the content. */
  readonly animatedLayout: AnimatedLayout;
  /** The rail's outer element, which paints its background. */
  rail(): HTMLElement | null;
  /** The content column beside the rail, which glides. */
  column(): HTMLElement | null;
  /** In the commit, before the DOM changes: the content measures itself. */
  beforeRailChange(): void;
  /** After it, before paint: the content moves; returns what ends it. */
  afterRailChange(): () => void;
  /** The content lands where it is laid out, ending any running glide. */
  landContent(): void;
}

export const SideNavShellContext = createContext<SideNavShell | null>(null);
SideNavShellContext.displayName = 'SideNavShellContext';

/** A SideNav outside AppShell holds its own handle over its parent. */
export function createRailLayout(
  rail: () => HTMLElement | null,
): AnimatedLayout {
  return createAnimatedLayout(() => rail()?.parentElement ?? null);
}

/** What a rail shows: at rest, or partway through a motion. */
export interface RailShown {
  readonly width: number;
  /** The labels' opacity. */
  readonly labels: number;
  /** The collapsed rail's opacity (its icons). */
  readonly collapsed: number;
}

export interface RailSnapshot {
  readonly rail: HTMLElement;
  readonly railRect: DOMRect;
  /** What the rail shows when the change lands. */
  readonly shown: RailShown;
  /** The old rail, held by the swap. */
  readonly swap: LayoutSwap | null;
}

/** A playing rail motion. */
export interface RailMotion {
  /** Ends it at once (a new change, an unmount). */
  end(): void;
  /** What the rail shows now, or null once it has settled. */
  shown(): RailShown | null;
}

/**
 * Before the change commits: the old rail, where it was, and what it shows,
 * from a running motion or at rest.
 */
export function snapshotRail(
  rail: HTMLElement | null,
  handle: AnimatedLayout,
  running: RailShown | null,
  isCollapsed: boolean,
): RailSnapshot | null {
  if (rail == null || typeof rail.animate !== 'function') {
    return null;
  }
  const railRect = rail.getBoundingClientRect();
  return {
    rail,
    railRect,
    shown: running ?? {
      width: railRect.width,
      labels: isCollapsed ? 0 : 1,
      collapsed: isCollapsed ? 1 : 0,
    },
    swap: holdLayoutSwap(handle, rail),
  };
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/** The rail's own text: elements that hold a run of text directly. */
function textElements(rail: HTMLElement): Element[] {
  return Array.from(rail.querySelectorAll('*')).filter(element =>
    Array.from(element.childNodes).some(
      node => node.nodeType === 3 && node.textContent?.trim(),
    ),
  );
}

/** `element`'s ancestor (or itself) that sits directly in `host`. */
function childOf(host: Element, element: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = element;
  while (node != null && node.parentElement !== host) {
    node = node.parentElement;
  }
  return node;
}

const AT_REST: RailMotion = {end: () => {}, shown: () => null};

/**
 * After the change commits, before paint: play the rail's motion from the
 * snapshot, on the module's motion. With a `column` (in AppShell), the rail's
 * edge rides its glide.
 */
export function playRail(
  snapshot: RailSnapshot,
  current: HTMLElement | null,
  handle: AnimatedLayout,
  column: HTMLElement | null = null,
): RailMotion {
  const {railRect, swap, shown: from} = snapshot;
  // The rail as it is now: a resizable rail's nav remounts when its resize
  // wrapper comes and goes with the collapse.
  const rail = current?.isConnected === true ? current : snapshot.rail;
  if (!rail.isConnected) {
    return AT_REST;
  }
  const motion = layoutMotionFor(rail);
  const next = rail.getBoundingClientRect();
  if (motion.kind === 'instant' || Math.abs(next.width - from.width) < 0.5) {
    return AT_REST;
  }
  const isCollapse = next.width < from.width;
  // The labels and the collapsed icons over the motion's progress, from what
  // the rail showed.
  const labelsAt = (p: number) =>
    isCollapse
      ? from.labels * (1 - clamp(p / 0.4))
      : from.labels + (1 - from.labels) * clamp((p - 0.4) / 0.6);
  const collapsedAt = (p: number) =>
    isCollapse
      ? from.collapsed + (1 - from.collapsed) * clamp((p - 0.7) / 0.3)
      : from.collapsed * (1 - clamp(p / 0.6));
  const rtl = getComputedStyle(rail).direction === 'rtl';
  const sign = rtl ? -1 : 1;
  const inset = (px: number) =>
    rtl ? `inset(0px 0px 0px ${px}px)` : `inset(0px ${px}px 0px 0px)`;
  // The row that holds the rail and the column, or the rail's parent.
  const host =
    column?.parentElement != null && column.parentElement.contains(rail)
      ? column.parentElement
      : rail.parentElement;
  // Riding needs the swap: its frames carry the column's travel. Without one
  // (old content that cannot be copied) the clip follows the motion's curve.
  const rides = host != null && column?.parentElement === host && swap != null;
  // The width the rail shows over the motion: on the column's glide (its
  // travel so far added to where it started), or on the motion's curve.
  const widthAt = (p: number, ride: {x: number}) =>
    rides
      ? from.width + sign * ride.x
      : from.width + (next.width - from.width) * p;
  const now = () => Number(rail.ownerDocument.timeline?.currentTime ?? 0);
  const startedAt = now();
  const durationMs =
    motion.kind === 'spring' ? motion.progress.durationMs : motion.durationMs;
  const shown = (): RailShown | null => {
    const elapsed = now() - startedAt;
    if (elapsed >= durationMs) {
      return null;
    }
    const p =
      motion.kind === 'spring' ? 1 - motion.progress.remaining(elapsed) : 0;
    let width = from.width + (next.width - from.width) * p;
    if (rides && column != null) {
      // The rail's edge is the column's: read it where it shows.
      const edge = column.getBoundingClientRect();
      const own = rail.getBoundingClientRect();
      width = rtl ? own.right - edge.right : edge.left - own.left;
    }
    return {width, labels: labelsAt(p), collapsed: collapsedAt(p)};
  };
  const rideWith =
    rides && column != null
      ? {
          element: column,
          travel: {x: sign * (from.width - next.width), y: 0},
          isCopyMoved: false,
        }
      : undefined;
  // The copy keeps the rail's inline-start edge where the rail is now, so it
  // meets the real rail wherever SideNav sits (a centered rail moves).
  const at = DOMRect.fromRect({
    x: rtl ? next.right - railRect.width : next.left,
    y: next.top,
    width: railRect.width,
    height: railRect.height,
  });

  if (isCollapse) {
    // A collapse covers the old rail, held by the swap, from the width it
    // shows down to the new one; the real, collapsed rail fades in above it.
    if (swap == null || host == null) {
      return AT_REST;
    }
    const raised = childOf(host, rail);
    const restore =
      raised == null
        ? null
        : {
            position: raised.style.position,
            zIndex: raised.style.zIndex,
          };
    if (raised != null) {
      if (getComputedStyle(raised).position === 'static') {
        raised.style.position = 'relative';
      }
      raised.style.zIndex = '2';
    }
    const end = playLayoutSwap(
      {...swap, rect: at},
      {
        host,
        isOpaque: true,
        copy: (p, ride) => ({
          clipPath: inset(railRect.width - widthAt(p, ride)),
          opacity: 1 - clamp((p - 0.7) / 0.3),
        }),
        copyText: labelsAt,
        rideWith,
        onEnd: () => {
          if (raised != null && restore != null) {
            raised.style.position = restore.position;
            raised.style.zIndex = restore.zIndex;
          }
        },
        incoming: [{element: rail, frames: p => ({opacity: collapsedAt(p)})}],
      },
    );
    return {end, shown};
  }

  // An expand reveals the real rail from the width it showed, its text fading
  // in late, under the old, collapsed rail fading early.
  const incoming = [
    {
      element: rail,
      frames: (p: number, ride: {x: number}) => ({
        clipPath: inset(next.width - widthAt(p, ride)),
      }),
    },
    ...textElements(rail).map(element => ({
      element,
      frames: (p: number) => ({opacity: labelsAt(p)}),
    })),
  ];
  const end =
    swap != null && host != null
      ? playLayoutSwap(
          {...swap, rect: at},
          {
            host,
            isOpaque: true,
            copy: p => ({opacity: collapsedAt(p)}),
            rideWith,
            incoming,
          },
        )
      : playLayoutFrames(handle, incoming);
  return {end, shown};
}
