// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.stylex.ts
 * @input Uses StyleX, and the room a host or its group declares on each side
 * @output `touchHitAreaStyles`: `layer` (the band, a host's `::after`), its
 *   halves `room` and `band`, `member` (a group member's room), `inline` (no
 *   sideways room), `rowEnd` (no block room in a row's end slot), and the
 *   group room styles. Each side grows toward 44 px, no further than its room.
 * @position Internal styles for the coarse-only touch band. The band sits
 *   below its host's content, in the host's own stacking context. The press
 *   check (utils/touchHitArea.ts) decides a band tap at its click.
 *   SYNC: utils/touchHitArea.ts and utils/touchHitArea.test.tsx.
 */

import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';

// StyleX reads these at build time, so they are spelled out.
const TOUCH = '@media (pointer: coarse)';
const ROOM = '22px';
// Inside a row's end slot the row's edge is the boundary: a control there
// grows no taller, and the row takes the taps above and below it.
const ROOM_BLOCK = 'var(--_hit-row-block, 22px)';
// A member's layer can render after it, inside the group, so the last member
// is the last child that is not a layer. SYNC: Button.tsx IS_LAST_ITEM.
const LAST = ':nth-last-child(1 of :not([popover]):not(template):not(dialog))';
// The percentages are of the host's padding box, the band's containing block.
// A host that draws a divider on its block end declares its width, so the
// band grows from the host's border box.
const DIVIDER = 'var(--_hit-border-block-end, 0px)';
const BLOCK_SHORTFALL = `min(0px, (100% + ${DIVIDER} - 44px) / 2)`;
const INLINE_SHORTFALL = 'min(0px, (100% - 44px) / 2)';

// The host is the band's containing block, so a host that is not positioned
// sets `position: relative`. A host decorates itself with a child: under a
// finger its `::after` is this band.
const BAND = {
  isolation: {default: null, [TOUCH]: 'isolate'},
  '::after': {
    content: {default: null, [TOUCH]: '""'},
    position: {default: null, [TOUCH]: 'absolute'},
    zIndex: {default: null, [TOUCH]: -1},
    insetBlockStart: {
      default: null,
      [TOUCH]: `max(calc(var(--_hit-room-block-start) * -1), ${BLOCK_SHORTFALL})`,
    },
    insetBlockEnd: {
      default: null,
      [TOUCH]: `calc(max(calc(var(--_hit-room-block-end) * -1), ${BLOCK_SHORTFALL}) - ${DIVIDER})`,
    },
    insetInlineStart: {
      default: null,
      [TOUCH]: `max(calc(var(--_hit-room-inline-start) * -1), ${INLINE_SHORTFALL})`,
    },
    insetInlineEnd: {
      default: null,
      [TOUCH]: `max(calc(var(--_hit-room-inline-end) * -1), ${INLINE_SHORTFALL})`,
    },
  },
} as const;

// Each host sets its own room, so a host inside a group member never takes
// the member's room.
const ROOM_SIDES = {
  '--_hit-room-block-start': ROOM_BLOCK,
  '--_hit-room-block-end': ROOM_BLOCK,
  '--_hit-room-inline-start': ROOM,
  '--_hit-room-inline-end': ROOM,
} as const;

export const touchHitAreaStyles = stylex.create({
  layer: {...ROOM_SIDES, ...BAND},
  room: ROOM_SIDES,
  band: BAND,
  // A group's member. Its root takes the group style of its axis and gap
  // token below: half the gap on that axis, the default room on the other.
  member: {
    '--_hit-room-block-start': {
      default: 'var(--_hit-group-block)',
      ':first-child': ROOM_BLOCK,
    },
    '--_hit-room-block-end': {
      default: 'var(--_hit-group-block)',
      [LAST]: ROOM_BLOCK,
    },
    '--_hit-room-inline-start': {
      default: 'var(--_hit-group-inline)',
      ':first-child': ROOM,
    },
    '--_hit-room-inline-end': {
      default: 'var(--_hit-group-inline)',
      [LAST]: ROOM,
    },
  },
  inline: {
    '--_hit-room-inline-start': '0px',
    '--_hit-room-inline-end': '0px',
  },
  // WebKit moves a tap toward a clickable element near it, and a field's
  // other parts, such as a chevron, are not clickable. So toward a part
  // beside it, the band of a control inside a field reaches only 2 px.
  besideParts: {
    '--_hit-room-inline-start': {default: '2px', ':first-child': ROOM},
    '--_hit-room-inline-end': {default: '2px', [LAST]: ROOM},
  },
  // A row's end slot: its controls get no block room.
  rowEnd: {'--_hit-row-block': '0px'},
  inlineGroup0: {
    '--_hit-group-inline': '0px',
    '--_hit-group-block': ROOM_BLOCK,
  },
  blockGroup0: {'--_hit-group-block': '0px', '--_hit-group-inline': ROOM},
  inlineGroupSpacing05: {
    '--_hit-group-inline': `calc(${spacingVars['--spacing-0-5']} / 2)`,
    '--_hit-group-block': ROOM_BLOCK,
  },
  blockGroupSpacing05: {
    '--_hit-group-block': `calc(${spacingVars['--spacing-0-5']} / 2)`,
    '--_hit-group-inline': ROOM,
  },
  inlineGroupSpacing1: {
    '--_hit-group-inline': `calc(${spacingVars['--spacing-1']} / 2)`,
    '--_hit-group-block': ROOM_BLOCK,
  },
  blockGroupSpacing1: {
    '--_hit-group-block': `calc(${spacingVars['--spacing-1']} / 2)`,
    '--_hit-group-inline': ROOM,
  },
  blockGroupSpacing2: {
    '--_hit-group-block': `calc(${spacingVars['--spacing-2']} / 2)`,
    '--_hit-group-inline': ROOM,
  },
  inlineGroupSpacing5: {
    '--_hit-group-inline': `calc(${spacingVars['--spacing-5']} / 2)`,
    '--_hit-group-block': ROOM_BLOCK,
  },
});
