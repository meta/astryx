// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file edgeCompensation.stylex.ts
 * @input Uses @stylexjs/stylex
 * @output StyleX utilities for container-driven edge compensation
 * @position Layout utility; used by containers (Toolbar, Banner, etc.)
 *
 * ## Container-Driven Edge Compensation
 *
 * Interactive components with transparent padding (ghost buttons, tabs)
 * create excess visual space at container edges. The container's padding + the
 * component's own transparent padding doubles up.
 *
 * The solution is fully container-driven:
 *
 * 1. **Components** mark themselves with `data-astryx-edge-comp` (a passive
 *    data attribute — no styles attached).
 * 2. **Containers** use `:has(> [data-astryx-edge-comp]:first-child)` and
 *    `:has(> [data-astryx-edge-comp]:last-child)` to detect edge-adjacent
 *    compensatable items and apply negative margin to their slot wrappers.
 *
 * The container owns both the detection and the adjustment. Components
 * just declare eligibility.
 *
 * SYNC: When modified, update /packages/core/src/Layout/Layout.doc.mjs
 */

import * as stylex from '@stylexjs/stylex';

/**
 * The data attribute that edge-compensatable components apply.
 * Ghost buttons, tabs, and other transparent-padding components
 * render this attribute so containers can detect them via `:has()`.
 */
export const EDGE_COMP_ATTR = 'data-astryx-edge-comp';

/**
 * Container-side edge compensation styles.
 *
 * Apply to slot wrapper divs. The slot detects whether its first/last
 * child is an edge-compensatable component and pulls its own margin
 * inward by the specified inset amount.
 *
 * @example
 * ```tsx
 * <div {...stylex.props(
 *   styles.startSlot,
 *   edgeCompSlot.inset(spacingVars['--spacing-2']),
 * )}>
 *   {startContent}
 * </div>
 * ```
 */
export const edgeCompSlot = stylex.create({
  inset: (amount: string) => ({
    marginInlineStart: {
      default: null,
      [`:has(> [${EDGE_COMP_ATTR}]:first-child)`]: `calc(-1 * ${amount})`,
    },
    marginInlineEnd: {
      default: null,
      [`:has(> [${EDGE_COMP_ATTR}]:last-child)`]: `calc(-1 * ${amount})`,
    },
  }),
});
