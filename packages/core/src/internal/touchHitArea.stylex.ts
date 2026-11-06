// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.stylex.ts
 * @input Uses StyleX and the insets that utils/hitArea.ts writes on a host
 * @output Exports `touchHitAreaStyles.layer`, a host's invisible hit band
 *   under a coarse pointer, and `touchHitAreaStyles.layerBelowChildren`, the
 *   same band drawn below the host's children
 * @position Internal styling utility for Button (and so the input clear
 *   button), CheckboxInput, RadioListItem, List rows, InfoTip,
 *   SegmentedControl segments and the press-tracking groups. Each keeps its
 *   insets live with `useTouchHitArea` (utils/touchHitArea.ts).
 *
 * The band is the host's `::after`, grown past each edge by the measured
 * inset. A clip path cuts out the host's box, so its content keeps its taps.
 * A tap on the band lands on the host. Button draws the band on its content
 * wrapper instead, which leaves its own `::after` to callers. The insets then
 * reach the wrapper by inheritance, a tap on the band lands on that
 * descendant, and the watch has `ownsDescendantTouches` off. A host whose children fill its box,
 * such as a press-tracking group, takes `layerBelowChildren`. That band is its
 * `::before`, so its positioned children paint over the clip path's edge, and
 * the pixels on their own edges stay theirs. SYNC: utils/hitArea.ts
 * HIT_INSET_PROPERTIES, utils/touchHitArea.ts and utils/touchHitArea.test.tsx.
 */

import * as stylex from '@stylexjs/stylex';

// StyleX reads these at build time, so they are spelled out.
const TOUCH = '@media (pointer: coarse)';
// The insets are measured in the viewport, so the sides are physical.
const TOP = 'var(--astryx-hit-inset-top, 0px)';
const RIGHT = 'var(--astryx-hit-inset-right, 0px)';
const BOTTOM = 'var(--astryx-hit-inset-bottom, 0px)';
const LEFT = 'var(--astryx-hit-inset-left, 0px)';
// The insets start at the host's border box, but the band's offsets start at
// its padding box. So a host that draws a border declares its width on that
// side, 0 by default. It declares it on its own `::after`, so content inside
// the host never inherits it.
const BORDER_TOP = 'var(--_hit-border-top, 0px)';
const BORDER_RIGHT = 'var(--_hit-border-right, 0px)';
const BORDER_BOTTOM = 'var(--_hit-border-bottom, 0px)';
const BORDER_LEFT = 'var(--_hit-border-left, 0px)';

// The host is the band's containing block, so a host that is not positioned
// sets `position: relative`. The band has no z-index of its own. Inside a
// List, which isolates its rows, ListItem raises it. Under a finger the host's
// `::after`, or `::before` below its children, is this band, so decorate the
// host with a child.
const BAND = {
  content: {default: null, [TOUCH]: '""'},
  position: {default: null, [TOUCH]: 'absolute'},
  inset: {
    default: null,
    [TOUCH]: `calc((${TOP} + ${BORDER_TOP}) * -1) calc((${RIGHT} + ${BORDER_RIGHT}) * -1) calc((${BOTTOM} + ${BORDER_BOTTOM}) * -1) calc((${LEFT} + ${BORDER_LEFT}) * -1)`,
  },
  // The outer rectangle, then the host's box as an even-odd hole.
  clipPath: {
    default: null,
    [TOUCH]: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${LEFT} ${TOP}, calc(100% - ${RIGHT}) ${TOP}, calc(100% - ${RIGHT}) calc(100% - ${BOTTOM}), ${LEFT} calc(100% - ${BOTTOM}), ${LEFT} ${TOP})`,
  },
} as const;

export const touchHitAreaStyles = stylex.create({
  layer: {
    '::after': BAND,
  },
  layerBelowChildren: {
    '::before': BAND,
  },
});
