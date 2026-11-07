// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file TreeListBranches.tsx
 * @input Uses React, StyleX, theme tokens
 * @output Exports TreeListBranches component (internal)
 * @position Presentational component for tree connector lines; consumed by TreeListItem.tsx
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/TreeList/TreeListItem.tsx
 * - /packages/cli/assets/templates/blocks/components/TreeList/ (showcase blocks)
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, spacingVars} from '../theme/tokens.stylex';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

const LINE_WIDTH = 1;
const GUIDE_COLUMN_WIDTH = spacingVars['--spacing-5'];

/**
 * The guide owns its alignment to the chevron column. Its 20px container starts
 * where centering it on the natural 16px chevron leaves it after the row's 8px
 * inline padding: 8px + 16px / 2 - 20px / 2 = 6px.
 */
const GUIDE_COLUMN_START = `calc(${spacingVars['--spacing-2']} + ${spacingVars['--spacing-4']} / 2 - ${GUIDE_COLUMN_WIDTH} / 2)`;

/** Per-level indent width. Reads the public, themeable `--tree-list-indent`
 * lever set on the tree-list root (default `--spacing-4`, 16px), so the guide
 * lines stay aligned with the row indent when a theme retunes the step. */
const LEVEL_INDENT = 'var(--tree-list-indent)';

const styles = stylex.create({
  // Rows span the full width of the list and carry their indent inside, so
  // the guide columns sit inside the row boxes of deeper rows. Lift the guides
  // above the rows so a hovered or selected row's fill never breaks the line,
  // and let pointer input fall through to the row underneath.
  container: {
    height: '100%',
    position: 'absolute',
    width: GUIDE_COLUMN_WIDTH,
    zIndex: 1,
    pointerEvents: 'none',
  },
  verticalLine: {
    borderRadius: 1,
    insetInlineStart: 0,
    margin: 'auto',
    position: 'absolute',
    insetInlineEnd: 0,
    width: LINE_WIDTH,
    backgroundColor: colorVars['--color-border-emphasized'],
  },
  // Guide segment spanning the full <li>. The row box's inter-row gap now lives
  // INSIDE the <li> (as `padding-block` on the row wrapper), so `height: 100%`
  // already covers it — the segment only needs the original `1px` to bridge the
  // hairline into the next contiguous sibling so the connector reads as one
  // continuous line. Independent of `--tree-list-row-gap`: the gap is absorbed
  // by the <li> height, not added on top here.
  verticalFull: {
    height: 'calc(100% + 1px)',
  },
  // Last-in-group connector: nothing sits below, so the segment must not run
  // through the row wrapper's bottom `padding-block` (`--tree-list-row-gap` / 2)
  // into empty space. Clamp it back by that half-gap so it ends exactly at the
  // row box's bottom edge. At the default `--spacing-0-5` gap this trims the
  // 1px of bottom padding; at `0px` it is exactly `100%` — no overhang at any
  // gap.
  verticalLast: {
    height: 'calc(100% - var(--tree-list-row-gap, 0px) / 2)',
  },
});

// =============================================================================
// Types
// =============================================================================

interface TreeListBranchesProps {
  ancestorsIsLast: ReadonlyArray<boolean>;
  isLast: boolean;
  nestedLevel: number;
}

// =============================================================================
// Components
// =============================================================================

/**
 * Renders vertical lines showing parent-child relationships in the tree.
 * Positioned in a full-height container to span the entire item including children.
 *
 * The line element carries the stable `astryx-tree-list-guide` theme target so a
 * theme can recolor or hide the connectors via `defineTheme` (e.g.
 * `backgroundColor` or `display: 'none'`) instead of hiding the built-in guides
 * and reimplementing them.
 */
export function TreeListBranches({
  ancestorsIsLast,
  isLast,
  nestedLevel,
}: TreeListBranchesProps) {
  return (
    <>
      {ancestorsIsLast.map((ancestorIsLast, level) => {
        const branchOffset = `calc(${GUIDE_COLUMN_START} + ${level} * ${LEVEL_INDENT})`;
        return (
          // Skip the level that the current-item connector occupies
          // (nestedLevel - 1), since that position is rendered below
          // with the correct terminus/continuation style.
          !ancestorIsLast &&
          level !== nestedLevel - 1 && (
            <div
              // eslint-disable-next-line @eslint-react/no-array-index-key -- tree branch levels are fixed positional connectors
              key={level}
              {...mergeProps(stylex.props(styles.container), {
                style: {
                  insetInlineStart: branchOffset,
                },
              })}>
              <div
                {...mergeProps(
                  themeProps('tree-list-guide'),
                  stylex.props(styles.verticalLine, styles.verticalFull),
                )}
              />
            </div>
          )
        );
      })}
      {nestedLevel > 0 && (
        <div
          {...mergeProps(stylex.props(styles.container), {
            style: {
              insetInlineStart: `calc(${GUIDE_COLUMN_START} + ${nestedLevel - 1} * ${LEVEL_INDENT})`,
            },
          })}>
          <div
            {...mergeProps(
              themeProps('tree-list-guide'),
              // The last item in a group has no sibling below, so its connector
              // is clamped to the row box's bottom edge (verticalLast) instead
              // of bridging into the inter-row gap — no overhang into empty
              // space. Every other row bridges the gap (verticalFull) so the
              // line stays continuous down to the next sibling.
              stylex.props(
                styles.verticalLine,
                isLast ? styles.verticalLast : styles.verticalFull,
              ),
            )}
          />
        </div>
      )}
    </>
  );
}

TreeListBranches.displayName = 'TreeListBranches';
