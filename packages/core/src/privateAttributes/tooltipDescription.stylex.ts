// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tooltipDescription.stylex.ts
 * @input radius and border tokens
 * @output tooltipDescriptionProps, which mark a tooltip's hidden description,
 *   isTooltipDescription, which reads the mark, and groupEndStyles, the trailing-edge styles of ButtonGroup and InputGroup
 *   members, which skip that description when they find the last member
 * @position Owner module of the private tooltip-description attribute: the
 *   only file that writes its name or its selector. useTooltip marks the
 *   description; Button and InputGroup's group styles spread groupEndStyles.
 *   No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';
import {radiusVars} from '../theme/tokens.stylex';

/** Spread on a tooltip's hidden description, the sibling after its trigger. */
export const tooltipDescriptionProps = {
  'data-astryx-tooltip-description': '',
} as const;

/**
 * Whether `element` is a tooltip's description copy, the hidden element a
 * trigger's `aria-describedby` names before the tooltip first shows. A
 * caller's own element is never one, whatever its id.
 */
export function isTooltipDescription(element: Element): boolean {
  return element.hasAttribute('data-astryx-tooltip-description');
}

// The group's last member: the last sibling that is not layer infrastructure
// (a popover, a layer's inert template, a native dialog) or a tooltip's hidden
// description. Any other sibling still counts as a member, as `:last-child`
// did, so a caller's own element keeps the corners it had.
//
// `:nth-last-child(1 of …)`, not `:not(:has(~ …))`: the stylesheet is global,
// and WebKit re-evaluates a sibling-relative `:has()` against every earlier
// sibling on each insertion, so filling any container became quadratic. A
// member is never one of the skipped pieces, so being the last such sibling is
// the same as having none after it.
const IS_LAST_MEMBER =
  ':nth-last-child(1 of :not([popover]):not(template):not(dialog):not([data-astryx-tooltip-description]))';

// A direct child of an InputGroup with a member after it.
const GROUP_CHILD_FOLLOWED = `:where(.astryx-input-group > *):not(${IS_LAST_MEMBER})`;

const FORCED_COLORS = '@media (forced-colors: active)';

// Each property here keeps every one of its conditions, rest state included:
// the group style that spreads these sets none of them again.
export const groupEndStyles = stylex.create({
  /** A horizontal ButtonGroup member's trailing corners. */
  buttonGroupHorizontal: {
    borderStartEndRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
    borderEndEndRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
  },
  /** A vertical ButtonGroup member's trailing corners. */
  buttonGroupVertical: {
    borderEndStartRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
    borderEndEndRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
  },
  /** A horizontal solid member's forced-colors trailing edge. */
  forcedColorsEdgeHorizontal: {
    borderInlineEndWidth: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: '1px'},
    },
    borderInlineEndStyle: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'solid'},
    },
  },
  /** A vertical solid member's forced-colors trailing edge. */
  forcedColorsEdgeVertical: {
    borderBlockEndWidth: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: '1px'},
    },
    borderBlockEndStyle: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'solid'},
    },
  },
  /** The forced-colors trailing edge color, horizontal. */
  forcedColorsEdgeColorHorizontal: {
    borderInlineEndColor: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'ButtonText'},
    },
  },
  /** The forced-colors trailing edge color of `destructive`, horizontal. */
  forcedColorsEdgeColorHorizontalOnError: {
    borderInlineEndColor: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'CanvasText'},
    },
  },
  /** The forced-colors trailing edge color, vertical. */
  forcedColorsEdgeColorVertical: {
    borderBlockEndColor: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'ButtonText'},
    },
  },
  /** The forced-colors trailing edge color of `destructive`, vertical. */
  forcedColorsEdgeColorVerticalOnError: {
    borderBlockEndColor: {
      default: null,
      [IS_LAST_MEMBER]: {default: null, [FORCED_COLORS]: 'CanvasText'},
    },
  },
  /**
   * A Button addon's trailing corners in an InputGroup: square while a member
   * follows it. Only a direct child of the group adapts; Button sets this
   * style only on an addon that carries the group's member marker.
   */
  inputGroupAddon: {
    borderStartEndRadius: {
      default: null,
      [GROUP_CHILD_FOLLOWED]: 0,
    },
    borderEndEndRadius: {
      default: null,
      [GROUP_CHILD_FOLLOWED]: 0,
    },
  },
  /** An InputGroup input member's trailing corners. */
  inputGroupMember: {
    borderStartEndRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
    borderEndEndRadius: {
      default: 0,
      [IS_LAST_MEMBER]: radiusVars['--radius-element'],
    },
  },
});
