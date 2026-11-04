// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.stylex.ts
 * @input StyleX and the insets utils/hitArea.ts writes on a watched element
 *   (`--astryx-hit-inset-{top,right,bottom,left}`, HIT_INSET_PROPERTIES)
 * @output `touchHitAreaStyles.layer`: an element's invisible hit layer under a
 *   finger, for the coarse-only 44 px target
 * @position Internal styling utility. A host composes the layer and keeps its
 *   insets live with `useTouchHitArea` (utils/touchHitArea.ts). List rows use
 *   it.
 *
 * SYNC: When modified, update utils/hitArea.ts's HIT_INSET_PROPERTIES,
 * utils/touchHitArea.ts and touchHitArea.test.tsx.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * The touch gate (utils/touchQueries.ts TOUCH_QUERY), spelled exactly as
 * the query it mirrors because StyleX evaluates it at build time.
 */
const TOUCH = '@media (pointer: coarse)';

// Under a coarse primary pointer, a host's hit target grows toward the touch
// target where its neighbors leave room. Nothing moves and nothing repaints.
// utils/hitArea.ts measures how far on each side. It stops at half the gap to
// the nearest neighboring target, and at 0 where they touch.
//
// The layer is the host's `::after`, grown past the host's edges by those
// insets. The insets are 0 until the first measurement, so first paint and
// server rendering never overlap a neighbor. The host is the layer's
// containing block, so a host that is not positioned sets `position:
// relative`. The insets start at the host's border box, but the layer's
// offsets start at its padding box. So a host that draws a border declares
// its width on that side (`--_hit-border-{top,right,bottom,left}`, 0 by
// default). It declares it on its own `::after`, so content inside the host
// never inherits it. A divided list row declares its divider's width.
//
// A clip path cuts the host's own box out of the layer. So the host's content
// and controls keep their taps, and a tap in the band goes to the host. The
// layer has no z-index of its own. A later sibling that is positioned with no
// z-index paints and hit-tests over it. Inside a List, which isolates its
// rows, the layer takes `z-index: 1`, so a later row cannot cover it. A host
// outside such a container raises nothing, so its band never passes a
// page-level sticky header. The host itself keeps no isolation and no
// z-index, so at rest it is no stacking context. A swipeable row is a
// stacking context, so it raises itself.
//
// Under a finger the host's `::after` is this layer, so decorate the host
// with a child. The insets are measured in the viewport, so the inline edges
// are physical: a left inset grows the left edge in either direction. StyleX
// evaluates property names at build time, so they are spelled out, and
// touchHitArea.test.tsx checks them against HIT_INSET_PROPERTIES.
export const touchHitAreaStyles = stylex.create({
  layer: {
    '::after': {
      content: {default: null, [TOUCH]: '""'},
      position: {default: null, [TOUCH]: 'absolute'},
      top: {
        default: null,
        [TOUCH]:
          'calc((var(--astryx-hit-inset-top, 0px) + var(--_hit-border-top, 0px)) * -1)',
      },
      bottom: {
        default: null,
        [TOUCH]:
          'calc((var(--astryx-hit-inset-bottom, 0px) + var(--_hit-border-bottom, 0px)) * -1)',
      },
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: the insets are measured in the viewport, so the left inset grows the left edge in either direction
      left: {
        default: null,
        [TOUCH]:
          'calc((var(--astryx-hit-inset-left, 0px) + var(--_hit-border-left, 0px)) * -1)',
      },
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: the insets are measured in the viewport, so the right inset grows the right edge in either direction
      right: {
        default: null,
        [TOUCH]:
          'calc((var(--astryx-hit-inset-right, 0px) + var(--_hit-border-right, 0px)) * -1)',
      },
      // Only the band past the host: the outer rectangle, then the host's
      // border box as an even-odd hole. So the host's content stays on top
      // for taps.
      clipPath: {
        default: null,
        [TOUCH]:
          'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, var(--astryx-hit-inset-left, 0px) var(--astryx-hit-inset-top, 0px), calc(100% - var(--astryx-hit-inset-right, 0px)) var(--astryx-hit-inset-top, 0px), calc(100% - var(--astryx-hit-inset-right, 0px)) calc(100% - var(--astryx-hit-inset-bottom, 0px)), var(--astryx-hit-inset-left, 0px) calc(100% - var(--astryx-hit-inset-bottom, 0px)), var(--astryx-hit-inset-left, 0px) var(--astryx-hit-inset-top, 0px))',
      },
    },
  },
});
