// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file railMotion.ts
 * @input The rail's outer element, the animated-layout module's handle,
 *   motion and two-state edge reveal (motion/animatedLayout.ts)
 * @output Exports `SideNavShellContext` (what AppShell lends its SideNav),
 *   `createRailLayout`, `snapshotRail` and `playRail`: the rail's collapse
 *   motion
 * @position Internal to SideNav (`component:SideNav` FR6, DEC-2); AppShell's
 *   content area moves through the context (`component:AppShell` FR17)
 *
 * Collapsing or expanding the rail plays one motion on one clock, the
 * `springs.settle` role the animated-layout module reads (`spec:AST-105`
 * FR4). The rail is FR9's edge reveal in its inline two-state form, which
 * the module produces (`architecture:react-component-runtime` INV12): layout
 * snaps to the final rail width at once, nothing animates a width, and the
 * module clips the rail's inline-end edge from the width it shows to the new
 * one. A collapse covers the old, expanded rail, held as one transient copy,
 * with the real collapsed rail raised above it; an expand reveals the real
 * rail under the old, collapsed one. In AppShell that edge rides the content
 * column's glide, frame by frame, so the two never part, also when a change
 * interrupts a running one. Every starting clip applies in the commit's
 * layout effect, before the first frame paints. Under Reduce Motion it
 * follows `design:reduced-motion`: opacity only under a coarse primary
 * pointer (DR2), an immediate change otherwise (DR3). Without Web
 * Animations, the change lands at once.
 *
 * What this file adds is the rail's own fades, on the same progress:
 * - A collapse fades the copy's text over the first 40% and the copy over
 *   the last 30%, while the real collapsed rail, its icons, fades in over the
 *   last 30%, so the real rail, icons only, is all that remains.
 * - An expand fades the real rail's text in over the last 60%, so no label
 *   shows at the collapsed width, while the old, collapsed rail fades over
 *   the first 60%: the first frame is the frame before the click.
 * - A change made during a running motion starts from what the rail shows:
 *   its width, its labels' opacity and its collapsed icons' opacity, so the
 *   rail stays continuous.
 *
 * SYNC: When modified, update SideNav.tsx, AppShell.tsx and
 * SideNavRailMotion.test.tsx.
 */

import {createContext} from 'react';
import {
  createAnimatedLayout,
  holdLayoutEdge,
  playLayoutEdge,
  type AnimatedLayout,
  type LayoutEdgeHold,
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
  /** The old rail, held for the module's edge reveal. */
  readonly hold: LayoutEdgeHold;
  /** The old rail as one transient copy, or null when it cannot be held. */
  readonly swap: LayoutSwap | null;
  /** What the rail shows when the change lands. */
  readonly shown: RailShown;
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
  // The rail's edge is the one beside the content, its inline end.
  const hold = holdLayoutEdge(handle, rail, {
    edge: 'inline-end',
    shown: running?.width ?? null,
  });
  if (hold == null) {
    return null;
  }
  return {
    hold,
    swap: hold.swap,
    shown: running ?? {
      width: hold.extent,
      labels: isCollapsed ? 0 : 1,
      collapsed: isCollapsed ? 1 : 0,
    },
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
  const {shown: from} = snapshot;
  let isCollapse = false;
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
  const motion = playLayoutEdge(snapshot.hold, current, handle, {
    edge: 'inline-end',
    rideWith: column,
    parts: (isConceal, rail) => {
      isCollapse = isConceal;
      return isConceal
        ? {
            // The old rail's text fades early, the copy late, as the real
            // collapsed rail, raised above it, fades in.
            copyOpacity: p => 1 - clamp((p - 0.7) / 0.3),
            copyText: labelsAt,
            incoming: [
              {element: rail, frames: p => ({opacity: collapsedAt(p)})},
            ],
          }
        : {
            // The old, collapsed rail fades early; the real rail's text, late.
            copyOpacity: collapsedAt,
            incoming: textElements(rail).map(element => ({
              element,
              frames: (p: number) => ({opacity: labelsAt(p)}),
            })),
          };
    },
  });
  return {
    end: motion.end,
    shown: () => {
      const now = motion.shown();
      return now == null
        ? null
        : {
            width: now.extent,
            labels: labelsAt(now.progress),
            collapsed: collapsedAt(now.progress),
          };
    },
  };
}
