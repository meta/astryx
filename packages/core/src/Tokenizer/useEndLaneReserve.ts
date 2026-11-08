// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file useEndLaneReserve.ts
 * @input Uses React and the shared ResizeObserver
 * @output Exports useEndLaneReserve, which keeps a field's input clear of the
 *   absolutely-positioned lane at its inline end
 * @position Tokenizer internal. Tokenizer parks its clear button, end content
 *   and busy indicator in one absolutely-positioned lane at the field's
 *   inline end, and this keeps the input's text and caret clear of it.
 *
 *   It lives here, beside its one caller, rather than in `Field/` with the
 *   shared field internals — deliberately. A measured reserve is Tokenizer's
 *   workaround for a constraint only Tokenizer has: its lane must stay pinned
 *   to the field's first row while tokens wrap below it, so it cannot be in
 *   flow, and an out-of-flow box reserves nothing. Every other field, this
 *   one's own Typeahead included, puts its end controls in flow as flex
 *   siblings the way TextInput does, which needs no measuring at all. Filed
 *   under `Field/` this read as shared infrastructure and invited the next
 *   field to reach for it; that is the wrong default.
 *
 * SYNC: When modified, update this header and the caller:
 * - /packages/core/src/Tokenizer/Tokenizer.tsx
 */

import {useCallback} from 'react';
import * as stylex from '@stylexjs/stylex';
import {observeResize} from '../utils/sharedResizeObserver';

/**
 * The measured lane width, published on the field wrapper and read by the
 * input through inheritance. A custom property is the point of the design: it
 * carries a measurement into CSS without carrying it through React, so a lane
 * that grows or shrinks repaints without re-rendering the field.
 */
const LANE_RESERVE_VAR = '--_tokenizer-end-lane-reserve';

// Keep the input's text and caret out from under the lane.
//
// The input's content box already stops one wrapper padding short of the
// border, and the lane is inset from that same border — so what is left for
// the input to clear is the lane's inset plus its width, less the padding it
// already has, plus a padding's worth of gap so the text does not touch the
// glyph. The two paddings cancel, which is why this reads as inset + width.
//
// The variable carries the WHOLE reserve, not just the width, so its absence
// means "no lane" rather than "a lane of zero width": with no lane up, the
// fallback resolves the padding to 0 and the input keeps its full content box.
// That is what lets every input state read the property without knowing whether
// a search is running. The rule stays static either way — it is never
// regenerated as the lane changes.
const reserveStyles = stylex.create({
  reserve: {
    paddingInlineEnd: `var(${LANE_RESERVE_VAR}, 0px)`,
  },
});

/**
 * Keep a field's input clear of the lane at its inline end.
 *
 * The lane is absolutely positioned — it has to be, because these wrappers
 * wrap, and an in-flow sibling gets pushed onto a second row by a token — and
 * an out-of-flow box reserves no space by definition. There is no CSS that
 * makes one do so: the input cannot see a sibling's width. So the lane is
 * measured, and the input spends the measurement as padding.
 *
 * What the lane holds is not a fixed set: a clear button that comes and goes
 * with the value, a busy indicator that comes and goes with the search, and
 * arbitrary `endContent`. Measuring covers all of it, including the
 * combinations, and needs no constant kept in step with what renders.
 *
 * **The measurement never enters React state.** It is written to a custom
 * property on the field wrapper and inherited by the input. Held in state, it
 * cost the field a second commit every time the lane changed size — once when
 * the spinner arrived and again when it left — doubling the field's renders
 * across a search for a value no JavaScript ever reads. The observation is
 * shared as well: `observeResize` batches every field on the page into one
 * callback per frame instead of one observer each.
 *
 * Takes the lane's inset from the field's inline-end border, as the CSS
 * expression that positions it. Returns a ref callback for the lane, and the
 * ordinary input reserve style. With tokens, Tokenizer's field wrapper reads the
 * same custom property directly so every token row, and the input after the
 * last token, stops before the lane.
 * With no lane mounted the variable is absent and either rule resolves to its
 * no-lane fallback, so neither path needs to know whether a search is running.
 */
export function useEndLaneReserve(
  laneInset: string,
): [(node: HTMLElement | null) => void, stylex.StyleXStyles] {
  const laneRef = useCallback(
    (node: HTMLElement | null) => {
      if (node == null) {
        return;
      }
      // The lane's parent: the field wrapper in both callers, and an ancestor
      // of the input either way, which is what inheritance needs.
      const host = node.parentElement;

      const unobserve = observeResize(node, () => {
        // `offsetWidth`, not `getBoundingClientRect().width`. The rect is in
        // VIEWPORT space — it carries every CSS transform between this element
        // and the root — while the padding it feeds is in the element's own
        // LOCAL space. Under `scale(.5)` the rect reads half the lane's real
        // width and the input reserves half of what it needs, so the query runs
        // under the controls again; under `scale(2)` it reads double and the
        // caret sits in a gap twice the lane's width. Measured in Chromium on a
        // 123px lane in a 280px field: at `scale(.5)` the rect published 61.48px
        // and the spinner covered 14px of the input's content box; at `scale(2)`
        // it published 245.91px, leaving a 125.95px gap and growing the field
        // from 32px to 55px tall. `offsetWidth` is the untransformed border-box
        // width, so it reports 123 at every scale — the number this padding is
        // actually denominated in.
        //
        // It is already an integer, which is the rounding the old `Math.ceil`
        // was there for: a fractional width left as-is reserves a hair too
        // little and the glyph's last subpixel column lands on the caret.
        const width = node.offsetWidth;
        if (width > 0) {
          host?.style.setProperty(
            LANE_RESERVE_VAR,
            `calc(${laneInset} + ${width}px)`,
          );
        } else {
          // A mounted but empty lane (no end content, no clear, not searching)
          // claims nothing.
          host?.style.removeProperty(LANE_RESERVE_VAR);
        }
      });

      // React 19 runs a ref callback's return value as its cleanup, so the
      // observer is released exactly when the lane unmounts.
      return () => {
        unobserve();
        // The room the lane claimed goes back to the input. Removing beats
        // setting 0px: the rule's fallback is already that, and this leaves no
        // stale property behind on the DOM.
        host?.style.removeProperty(LANE_RESERVE_VAR);
      };
    },
    [laneInset],
  );

  return [laneRef, reserveStyles.reserve];
}
