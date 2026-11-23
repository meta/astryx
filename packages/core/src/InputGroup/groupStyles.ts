// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file groupStyles.ts
 * @input Uses StyleX, theme tokens, and the group end-cap styles of
 *   privateAttributes/tooltipDescription.stylex.ts
 * @output Exports shared group-aware styles for InputGroup children
 * @position Shared styles consumed by InputGroup-compatible controls and addons
 */

import * as stylex from '@stylexjs/stylex';
import {radiusVars, borderVars} from '../theme/tokens.stylex';
import {groupEndStyles} from '../privateAttributes/tooltipDescription.stylex';

/**
 * The internal marker every InputGroup member sets on the element that carries
 * its group styles: compatible inputs, Button addons and InputGroupText. The
 * group's edge rules name members by it instead of a universal selector. Not
 * public API.
 */
export const inputGroupItemProps = {
  'data-astryx-input-group-item': '',
} as const;
const MEMBER = '[data-astryx-input-group-item]';

// The trailing edge, which finds the last member past layer pieces and a
// tooltip's hidden description, comes from groupEndStyles: a caller's own
// element after a member still counts as following it.

// Button consumes InputGroup context anywhere below the group, including buttons
// inside an input's own implementation. Keep the visual adaptation on direct
// children so internal clear, calendar, and disclosure actions stay unchanged.
const DIRECT_INPUT_GROUP_ADDON = `:where(.astryx-input-group > ${MEMBER})`;
const DIRECT_INPUT_GROUP_ADDON_FOCUS_VISIBLE = `${DIRECT_INPUT_GROUP_ADDON}:focus-visible`;
const DIRECT_INPUT_GROUP_ADDON_NOT_FIRST = `${DIRECT_INPUT_GROUP_ADDON}:not(:first-child)`;

const baseGroupStyles = stylex.create({
  buttonAddon: {
    borderStartStartRadius: {
      default: null,
      [DIRECT_INPUT_GROUP_ADDON_NOT_FIRST]: 0,
    },
    borderEndStartRadius: {
      default: null,
      [DIRECT_INPUT_GROUP_ADDON_NOT_FIRST]: 0,
    },
    height: {
      default: null,
      [DIRECT_INPUT_GROUP_ADDON]: '100%',
    },
    // Keep the keyboard ring above the adjacent group member at the shared edge.
    zIndex: {
      default: null,
      [DIRECT_INPUT_GROUP_ADDON_FOCUS_VISIBLE]: 2,
    },
  },
  inGroup: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    marginInlineStart: {
      default: `calc(-1 * ${borderVars['--border-width']})`,
      ':first-child': 0,
    },
    borderStartStartRadius: {
      default: 0,
      ':first-child': radiusVars['--radius-element'],
    },
    borderEndStartRadius: {
      default: 0,
      ':first-child': radiusVars['--radius-element'],
    },
    // Input wrappers already sit at z-index 1. A focused member goes one
    // higher, so an unfocused input beside it cannot cover its focus ring.
    ':focus-within': {
      zIndex: 2,
    },
  },
});

/**
 * The group styles, each with its trailing edge (groupEndStyles) right after
 * it, so a caller sets both in the same order as one style.
 */
export const groupStyles = {
  ...baseGroupStyles,
  buttonAddon: [baseGroupStyles.buttonAddon, groupEndStyles.inputGroupAddon],
  inGroup: [baseGroupStyles.inGroup, groupEndStyles.inputGroupMember],
} as const;
