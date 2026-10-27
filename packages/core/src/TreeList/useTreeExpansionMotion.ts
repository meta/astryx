// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useTreeExpansionMotion.ts
 * @input A tree row's expanded state, the touch presentation
 *   (utils/touchPresentation.ts), the motion foundation's animator and the
 *   outline spring from the UIKit constants table (motion/uikit/list.ts)
 * @output `useTreeExpansionMotion`: whether a row renders its children, the
 *   ref its group attaches, and the expand and collapse played the way a UIKit
 *   outline list plays them, under any finger (useTouchPresentation: a
 *   coarse primary pointer, iOS and Android alike); with a mouse the
 *   children come and go in one frame, as before
 * @position TreeList internals; TreeListItem calls it for every row with
 *   children
 *
 * UIKit's reference (iOS 26.2, a UICollectionView list with outline
 * disclosure): on expand, the children slide down out from under the parent
 * as one block, inside a clip that grows with them; the rows below move down
 * with them; the disclosure chevron turns 90°; all on one critically damped
 * spring (`list.update.outlineSpring`, an internal constant), with no fade.
 * Collapse runs the same motion back: the children slide up under the parent
 * and leave when it ends.
 *
 * HOW IT RUNS, compositor only. The group keeps its final layout; it clips its
 * own box for the length of the motion, so its top edge (the parent row's
 * bottom) is the clip's edge, and its children translate as one block from
 * the group's height above it. Every row after the group in the tree
 * translates by how far the group's layout moves it (read once with the
 * group laid out and once without, utils/rowMotion.ts `layoutShifts`), the
 * group's height for rows in the tree's flow, so the rows below always meet
 * the block's bottom edge: the clip never has to move. Each element releases
 * its inline `translate` when its own spring arrives. The chevron turns by an additive
 * `rotate` over its final CSS transform. All of it is `translate` and
 * `rotate` played by the animator on the compositor, retargeted from the
 * value on screen when the row is toggled again mid-motion. A collapse keeps
 * the children rendered until the block has slid away; the commit that
 * removes them shifts the rows below back by the same amounts, so nothing
 * jumps. Page content after the tree is not the tree's to move: the tree's
 * height changes by layout at the commit that inserts or removes a group
 * (`spec:AST-094` FR5 forbids animating layout), so content after it takes
 * its new place at once, with no transient translate on it; only the tree's
 * own rows animate, inside its box. An unmount mid-motion leaves nothing
 * moved.
 *
 * Under reduced motion nothing travels (`design:reduced-motion`): every part
 * takes the animator's own Reduced Motion handling, so the children fade in
 * where they land and fade out where they are, and the rows below and
 * the chevron cross-fade into place.
 *
 * One touch model: an Android finger gets the same motion as an iOS one.
 * With a mouse (the theme's presentation) nothing moves: the children appear
 * and leave at once, as before. Leaving children are inert while they slide
 * away: focus, arrow keys and assistive technology skip them.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/TreeList/TreeListItem.tsx
 * - /packages/core/src/TreeList/__tests__/TreeListExpand.interaction.browser.spec.ts
 */

import {useCallback, useRef, useState} from 'react';
import {isRtlElement} from '../hooks/isRtlElement';
import {useIsomorphicLayoutEffect} from '../hooks/useIsomorphicLayoutEffect';
import {list} from '../motion/uikit/list';
import {
  layoutShifts,
  motionNow,
  releaseMotion,
  springHome,
  springTo,
  stopRow,
} from '../utils/rowMotion';
import {useTouchPresentation} from '../utils/touchPresentation';

const SPRING = list.update.outlineSpring;
/** The chevron turns a quarter turn between collapsed and expanded. */
const QUARTER_TURN = 90;

/** Every row after `group` in its tree, at each level up to the tree. */
function rowsAfter(group: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const tree = group.closest('[role="tree"]');
  let item = group.parentElement?.closest('li') ?? null;
  while (item != null && tree?.contains(item) === true) {
    for (
      let next = item.nextElementSibling;
      next != null;
      next = next.nextElementSibling
    ) {
      if (next instanceof HTMLElement) {
        rows.push(next);
      }
    }
    item = item.parentElement?.closest('li') ?? null;
  }
  return rows;
}

export interface TreeExpansionMotion {
  /** Render the children: expanded, or still sliding away. */
  readonly showsChildren: boolean;
  /** For the children's group (`ul[role="group"]`). */
  readonly groupRef: (element: HTMLUListElement | null) => void;
}

/** The row's own chevron glyph (`data-tree-chevron`), beside its group. */
function chevronOf(group: HTMLElement): HTMLElement | null {
  return (
    group.parentElement?.querySelector<HTMLElement>(
      ':scope > :not([role="group"]) [data-tree-chevron]',
    ) ?? null
  );
}

export function useTreeExpansionMotion(
  isExpanded: boolean,
): TreeExpansionMotion {
  const animates = useTouchPresentation().isTouch;
  const [shown, setShown] = useState(isExpanded);
  if (isExpanded && !shown) {
    setShown(true);
  }
  if (!isExpanded && shown && !animates) {
    setShown(false);
  }

  const groupElementRef = useRef<HTMLUListElement | null>(null);
  const previousRef = useRef({isExpanded, shown});
  /** The motion in flight; a newer one makes an older one's ending moot. */
  const generationRef = useRef(0);
  /** A motion is running: a toggle now retargets it instead of restarting. */
  const inFlightRef = useRef(false);
  /**
   * What the motion moves outside the group (the rows after it in the
   * tree), each with how far the group's layout moves it.
   */
  const movedRef = useRef<Map<HTMLElement, number>>(new Map());

  // External system (`architecture:react-component-runtime` INV3): the shared
  // motion animators (utils/rowMotion.ts) of the group's rows and of the rows
  // after it in the tree. A toggle starts them, a toggle mid-motion retargets
  // them, and the commit that removes the children stops them at rest; the
  // unmount cleanup below releases any still moving.
  useIsomorphicLayoutEffect(() => {
    const before = previousRef.current;
    previousRef.current = {isExpanded, shown};

    // The commit that removed the children moved each element below up by
    // its shift, where the collapse had already put it: it is at rest.
    if (before.shown && !shown) {
      for (const moved of movedRef.current.keys()) {
        stopRow(moved, 'translate');
      }
      movedRef.current = new Map();
      inFlightRef.current = false;
      return;
    }
    if (before.isExpanded === isExpanded || !animates) {
      return;
    }
    const element = groupElementRef.current;
    if (element == null) {
      return;
    }
    const at = motionNow();
    const mine = ++generationRef.current;
    const height = element.offsetHeight;
    const children = Array.from(element.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    );
    const justMounted = !before.shown;
    // The rows after the group in the tree, each by how far the group's
    // layout moves it. Content after the tree is not the tree's to move: it
    // takes its new place by layout. Kept as they are while a motion runs,
    // so a toggle mid-motion retargets the same rows.
    const moved =
      justMounted || !inFlightRef.current
        ? layoutShifts(element, rowsAfter(element))
        : movedRef.current;
    movedRef.current = moved;
    inFlightRef.current = true;
    // The clip: the group's own box, whose top edge is the parent row's
    // bottom, for the length of the motion.
    element.style.overflow = 'clip';

    const glyph = chevronOf(element);
    if (glyph != null) {
      // The class switch just turned the glyph's CSS transform a quarter
      // turn; start the additive turn from where it was and spring it home.
      const sign = isRtlElement(glyph) ? -1 : 1;
      void springHome(
        glyph,
        'rotate',
        (isExpanded ? -QUARTER_TURN : QUARTER_TURN) * sign,
        SPRING,
        at,
      ).then(arrived => {
        if (arrived && generationRef.current === mine) {
          releaseMotion(glyph, 'rotate');
        }
      });
    }

    // Each element is released from its own motion's arrival: by then this
    // module no longer tracks it, so its inline `translate` clears.
    const releaseOnArrival = (target: HTMLElement) => (arrived: boolean) => {
      if (arrived && generationRef.current === mine) {
        releaseMotion(target, 'translate');
      }
    };
    if (isExpanded) {
      // Out from under the parent: the block starts its own height up, each
      // element below starts where it was before the children took space.
      // Under reduced motion the children fade in where they land.
      const block = children.map(async child => {
        const arrived = await (justMounted
          ? springHome(child, 'y', -height, SPRING, at, 'entrance')
          : springTo(child, 0, SPRING, at, 'entrance'));
        releaseOnArrival(child)(arrived);
        return arrived;
      });
      for (const [target, shift] of moved) {
        void (
          justMounted
            ? springHome(target, 'y', -shift, SPRING, at)
            : springTo(target, 0, SPRING, at)
        ).then(releaseOnArrival(target));
      }
      void Promise.all(block).then(results => {
        if (generationRef.current !== mine || results.some(done => !done)) {
          return;
        }
        element.style.removeProperty('overflow');
        inFlightRef.current = false;
      });
      return;
    }

    // Back under the parent; each element below goes where the group's
    // removal will put it, following the block's bottom edge.
    // Under reduced motion the children fade out where they are.
    const block = children.map(async child =>
      springTo(child, -height, SPRING, at, 'exit'),
    );
    for (const [target, shift] of moved) {
      void springTo(target, -shift, SPRING, at);
    }
    void Promise.all(block).then(results => {
      if (generationRef.current !== mine || results.some(done => !done)) {
        return;
      }
      // The children sit a group's height up, hidden by the clip, until the
      // commit that removes them takes the group away with them: dropping
      // the clip first would show them over the parent row for a frame.
      setShown(false);
    });
  }, [isExpanded, shown, animates]);

  // External system (`architecture:react-component-runtime` INV3): the shared
  // motion animators of elements outside this row's render, the rows after
  // its group, which the effect above moves and releases. An unmount
  // mid-motion must leave none of them moved: stop them at rest, clear their
  // translate and the group's clip, and make any pending arrival moot.
  useIsomorphicLayoutEffect(
    () => () => {
      generationRef.current += 1;
      for (const moved of movedRef.current.keys()) {
        stopRow(moved, 'translate');
      }
      movedRef.current = new Map();
      groupElementRef.current?.style.removeProperty('overflow');
    },
    [],
  );

  const groupRef = useCallback((element: HTMLUListElement | null) => {
    groupElementRef.current = element;
  }, []);
  return {showsChildren: shown, groupRef};
}
