// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.stylex.ts
 * @input Uses StyleX and the insets utils/hitArea.ts writes on a watched
 *   element (`--astryx-hit-inset-{top,right,bottom,left}`,
 *   HIT_INSET_PROPERTIES)
 * @output Exports `touchHitAreaStyles.layer`: an element's invisible hit
 *   layer under a finger (`spec:AST-094` FR43's coarse-only 44 px target)
 * @position Internal styling utility; a host composes
 *   `touchHitAreaStyles.layer` and keeps its insets live with
 *   `useTouchHitArea` (utils/touchHitArea.ts). List rows (ListItem) use it.
 *
 * Under a coarse primary pointer an element's hit target grows toward the
 * touch target where its neighbors leave room, with no visual change and no
 * layout change. The shared utility (utils/hitArea.ts) measures how far:
 * toward the touch target on each side, stopping at half the gap to the
 * nearest neighboring target, 0 where they touch. This is the layer that
 * reads its insets: the host's `::after`, grown past the host's edges by
 * them, and 0 until the first measurement, so first paint and server
 * rendering never overlap a neighbor. The host is the layer's containing
 * block: a host that is not positioned sets `position: relative` itself.
 *
 * The layer is clipped to the band past the host's own box (an even-odd clip
 * path whose hole is the host), so the host's content and its own controls
 * keep their taps, and a tap in the band resolves to the host. It paints
 * nothing and leaves the host's stacking as it was, with no isolation and no
 * z-index: a list row's press layer (utils/rowPressLayer.ts) relies on a row
 * at rest being no stacking context. With a mouse none of it applies.
 *
 * Under a finger the host's `::after` is this layer, so decorate the host
 * with a child instead. The insets are measured in the viewport, so the
 * inline edges are physical: a left inset grows the left edge in either
 * direction. The property names are spelled out because StyleX evaluates them
 * at build time; touchHitArea.test.tsx checks them against
 * HIT_INSET_PROPERTIES.
 *
 * SYNC: When modified, update utils/hitArea.ts's HIT_INSET_PROPERTIES,
 * utils/touchHitArea.ts and touchHitArea.test.tsx.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * The touch gate (utils/touchPresentation.ts TOUCH_QUERY), spelled exactly as
 * the query it mirrors because StyleX evaluates it at build time.
 */
const TOUCH = '@media (pointer: coarse)';

export const touchHitAreaStyles = stylex.create({
  layer: {
    '::after': {
      content: {default: null, [TOUCH]: '""'},
      position: {default: null, [TOUCH]: 'absolute'},
      top: {
        default: null,
        [TOUCH]: 'calc(var(--astryx-hit-inset-top, 0px) * -1)',
      },
      bottom: {
        default: null,
        [TOUCH]: 'calc(var(--astryx-hit-inset-bottom, 0px) * -1)',
      },
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: the insets are measured in the viewport, so the left inset grows the left edge in either direction
      left: {
        default: null,
        [TOUCH]: 'calc(var(--astryx-hit-inset-left, 0px) * -1)',
      },
      // eslint-disable-next-line @astryx/no-physical-properties -- intentional: the insets are measured in the viewport, so the right inset grows the right edge in either direction
      right: {
        default: null,
        [TOUCH]: 'calc(var(--astryx-hit-inset-right, 0px) * -1)',
      },
      // Only the band past the host: the outer rectangle, then the host's own
      // box as a hole (even-odd), so the host's content stays on top for taps.
      clipPath: {
        default: null,
        [TOUCH]:
          'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, var(--astryx-hit-inset-left, 0px) var(--astryx-hit-inset-top, 0px), calc(100% - var(--astryx-hit-inset-right, 0px)) var(--astryx-hit-inset-top, 0px), calc(100% - var(--astryx-hit-inset-right, 0px)) calc(100% - var(--astryx-hit-inset-bottom, 0px)), var(--astryx-hit-inset-left, 0px) calc(100% - var(--astryx-hit-inset-bottom, 0px)), var(--astryx-hit-inset-left, 0px) var(--astryx-hit-inset-top, 0px))',
      },
    },
  },
});
