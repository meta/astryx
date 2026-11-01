// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Grid.tsx
 * @input Uses React, stylex, spacing tokens
 * @output Exports Grid component, GridProps, and GridColumns
 * @position Grid component; provides CSS Grid-based layout
 *
 * SYNC: When modified, update these files to stay in sync:
 * - /packages/core/src/Grid/Grid.doc.mjs
 * - /packages/core/src/Grid/Grid.test.tsx
 * - /apps/storybook/stories/Grid.stories.tsx
 * - /packages/cli/assets/templates/blocks/components/Grid/ (showcase blocks)
 */

import type {ReactNode} from 'react';
import type {BaseProps} from '../BaseProps';
import * as stylex from '@stylexjs/stylex';
import {spacingVars} from '../theme/tokens.stylex';
import type {SpacingStep} from '../utils/types';
import type {SizeValue} from '../utils/types';
import {mergeProps} from '../utils';
import {themeProps} from '../utils/themeProps';

/**
 * Grid alignment options for align-items and justify-items.
 */

export type GridAlignment = 'start' | 'center' | 'end' | 'stretch';

/**
 * Column configuration for Grid.
 *
 * A number means exactly N `1fr` tracks at every width; it never reflows, so
 * `columns={4}` on a phone renders four narrow tracks. A child's minimum
 * content can widen its track beyond an equal fraction. For columns that reflow
 * on small screens, use the object form: `{minWidth: 240, max: 4}` renders at
 * most four columns, each at least 240px, and fewer when the container is
 * narrower.
 *
 * - `number` — exactly N `1fr` tracks (e.g. `columns={3}`); never reflows
 * - `object` — responsive columns based on minimum child width:
 *   - `minWidth` — minimum width (px) for each column track
 *   - `repeat` — `'fill'` (default) preserves empty tracks for consistent widths;
 *     `'fit'` collapses empty tracks so items stretch to fill
 *   - `max` — caps the maximum number of columns. The grid stretches to 100%
 *     of its parent and the columns that are present always fill the row, so a
 *     layout collapsing to a single column on mobile stretches to full width
 *     (no dead space on the right).
 */
export type GridColumns =
  | number
  | {
      minWidth: number;
      max?: number;
      repeat?: 'fill' | 'fit';
    };

export interface GridProps extends BaseProps<HTMLDivElement> {
  /** Ref forwarded to the root element */
  ref?: React.Ref<HTMLDivElement>;
  /**
   * Column configuration. A number creates exactly N `1fr` tracks and never
   * reflows; a child's minimum content may widen its track. For columns that
   * reflow on small screens, use `{minWidth, max}`.
   * - `number` — exactly N `1fr` tracks at every width
   * - `{minWidth, max?, repeat?}` — responsive columns with a px floor and an
   *   optional cap
   *
   * @see GridColumns
   */
  columns?: GridColumns;

  /**
   * Width of the grid container.
   * Numbers are treated as pixels, strings are used as-is (e.g., '100%').
   */
  width?: SizeValue;

  /**
   * Height of the grid container.
   * Numbers are treated as pixels, strings are used as-is (e.g., '100%').
   */
  height?: SizeValue;

  /**
   * Maximum width of the grid container.
   * Numbers are treated as pixels, strings are used as-is (e.g., '100%').
   */
  maxWidth?: SizeValue;

  /**
   * Minimum height of the grid container.
   * Numbers are treated as pixels, strings are used as-is (e.g., '100%').
   */
  minHeight?: SizeValue;

  /**
   * Spacing between all grid items (both row and column).
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  gap?: SpacingStep;

  /**
   * Spacing between rows. Overrides gap for rows.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  rowGap?: SpacingStep;

  /**
   * Spacing between columns. Overrides gap for columns.
   * Accepts numeric spacing steps: 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10.
   */
  columnGap?: SpacingStep;

  /**
   * Height of each implicit row track in pixels.
   * Sets `grid-auto-rows` — use with `GridSpan rows={N}` to create
   * masonry-style layouts where items span varying numbers of rows.
   *
   * @example
   * ```
   * <Grid columns={3} rowHeight={80} gap={3}>
   *   <GridSpan rows={4}>Tall</GridSpan>
   *   <GridSpan rows={2}>Short</GridSpan>
   * </Grid>
   * ```
   */
  rowHeight?: number;

  /**
   * Vertical alignment of grid items (align-items).
   * @default 'stretch'
   */
  align?: GridAlignment;

  /**
   * Horizontal alignment of grid items (justify-items).
   * @default 'stretch'
   */
  justify?: GridAlignment;

  /**
   * Content to render inside the grid.
   */
  children?: ReactNode;
}

const baseStyles = stylex.create({
  grid: {
    display: 'grid',
  },
});

// Dynamic track values compile to CSS variables + a class-level declaration
// (grid-template-columns: var(--x)) instead of a raw inline style, so
// consumer `xstyle` overrides — including ones inside @media queries — can
// still win. A raw inline `grid-template-columns` would beat any class.
const dynamicStyles = stylex.create({
  templateColumns: (value: string) => ({
    gridTemplateColumns: value,
  }),
  autoRows: (value: number) => ({
    gridAutoRows: `${value}px`,
  }),
});

const alignStyles = stylex.create({
  start: {
    alignItems: 'start',
  },
  center: {
    alignItems: 'center',
  },
  end: {
    alignItems: 'end',
  },
  stretch: {
    alignItems: 'stretch',
  },
});

const justifyStyles = stylex.create({
  start: {
    justifyItems: 'start',
  },
  center: {
    justifyItems: 'center',
  },
  end: {
    justifyItems: 'end',
  },
  stretch: {
    justifyItems: 'stretch',
  },
});

const gapStyles = stylex.create({
  0: {
    gap: spacingVars['--spacing-0'],
  },
  0.5: {
    gap: spacingVars['--spacing-0-5'],
  },
  1: {
    gap: spacingVars['--spacing-1'],
  },
  1.5: {
    gap: spacingVars['--spacing-1-5'],
  },
  2: {
    gap: spacingVars['--spacing-2'],
  },
  3: {
    gap: spacingVars['--spacing-3'],
  },
  4: {
    gap: spacingVars['--spacing-4'],
  },
  5: {
    gap: spacingVars['--spacing-5'],
  },
  6: {
    gap: spacingVars['--spacing-6'],
  },
  8: {
    gap: spacingVars['--spacing-8'],
  },
  10: {
    gap: spacingVars['--spacing-10'],
  },
});

const rowGapStyles = stylex.create({
  0: {
    rowGap: spacingVars['--spacing-0'],
  },
  0.5: {
    rowGap: spacingVars['--spacing-0-5'],
  },
  1: {
    rowGap: spacingVars['--spacing-1'],
  },
  1.5: {
    rowGap: spacingVars['--spacing-1-5'],
  },
  2: {
    rowGap: spacingVars['--spacing-2'],
  },
  3: {
    rowGap: spacingVars['--spacing-3'],
  },
  4: {
    rowGap: spacingVars['--spacing-4'],
  },
  5: {
    rowGap: spacingVars['--spacing-5'],
  },
  6: {
    rowGap: spacingVars['--spacing-6'],
  },
  8: {
    rowGap: spacingVars['--spacing-8'],
  },
  10: {
    rowGap: spacingVars['--spacing-10'],
  },
});

const columnGapStyles = stylex.create({
  0: {
    columnGap: spacingVars['--spacing-0'],
  },
  0.5: {
    columnGap: spacingVars['--spacing-0-5'],
  },
  1: {
    columnGap: spacingVars['--spacing-1'],
  },
  1.5: {
    columnGap: spacingVars['--spacing-1-5'],
  },
  2: {
    columnGap: spacingVars['--spacing-2'],
  },
  3: {
    columnGap: spacingVars['--spacing-3'],
  },
  4: {
    columnGap: spacingVars['--spacing-4'],
  },
  5: {
    columnGap: spacingVars['--spacing-5'],
  },
  6: {
    columnGap: spacingVars['--spacing-6'],
  },
  8: {
    columnGap: spacingVars['--spacing-8'],
  },
  10: {
    columnGap: spacingVars['--spacing-10'],
  },
});

/**
 * Spacing token CSS var names for gap calculation in track-max expressions.
 */
const spacingVarNames: Record<SpacingStep, string> = {
  0: '--spacing-0',
  0.5: '--spacing-0-5',
  1: '--spacing-1',
  1.5: '--spacing-1-5',
  2: '--spacing-2',
  3: '--spacing-3',
  4: '--spacing-4',
  5: '--spacing-5',
  6: '--spacing-6',
  8: '--spacing-8',
  10: '--spacing-10',
};

/**
 * Build a grid-template-columns value that caps the column *count* at `max`
 * while still letting the columns that are actually present stretch to fill
 * the row.
 *
 * The cap lives on the track's **min** size, not its max: each track is at
 * least `perColumn = (100% - (max-1) * gap) / max`, so more than `max` columns
 * can never fit. The track **max** stays `1fr`, so whenever fewer than `max`
 * columns fit (most importantly a lone column on mobile) they still grow to
 * fill the whole row — no dead space on the right.
 *
 * The track min is `max(minWidth, perColumn)` so an explicit `minWidth` is
 * still honored, wrapped in `min(100%, …)` so a single column on a viewport
 * narrower than `minWidth`/`perColumn` shrinks to the container instead of
 * overflowing it.
 */
function buildCappedTemplate(
  minWidth: number,
  maxCols: number,
  repeatMode: 'auto-fill' | 'auto-fit',
  gap: SpacingStep | undefined,
  columnGap: SpacingStep | undefined,
): string {
  const gapVar =
    columnGap != null
      ? spacingVarNames[columnGap]
      : gap != null
        ? spacingVarNames[gap]
        : null;

  // perColumn = (100% - (maxCols - 1) * gap) / maxCols — the width a track
  // would have if exactly `maxCols` columns were present. Used as a floor so
  // the grid never fits more than `maxCols` columns.
  const perColumn = gapVar
    ? `calc((100% - ${maxCols - 1} * var(${gapVar})) / ${maxCols})`
    : `calc(100% / ${maxCols})`;

  // Track min caps the count; track max stays 1fr so present columns fill.
  const trackMin = `min(100%, max(${minWidth}px, ${perColumn}))`;

  return `repeat(${repeatMode}, minmax(${trackMin}, 1fr))`;
}

/**
 * Grid component for CSS Grid-based layouts.
 *
 * Supports fixed-column and responsive layouts via the `columns` prop:
 * - `columns={3}` — fixed 3-column grid
 * - `columns={{minWidth: 280}}` — responsive auto-fill (consistent widths)
 * - `columns={{minWidth: 280, repeat: 'fit'}}` — responsive auto-fit (stretch)
 * - `columns={{minWidth: 280, max: 4}}` — responsive, capped at 4 columns
 *
 * @example
 * ```
 * <Grid columns={3} gap={4}>
 *   <Item />
 *   <Item />
 *   <Item />
 * </Grid>
 * ```
 */
export function Grid({
  columns,
  rowHeight,
  width,
  height,
  maxWidth,
  minHeight,
  gap,
  rowGap,
  columnGap,
  align,
  justify,
  xstyle,
  className,
  style,
  children,
  ref,
  ...props
}: GridProps) {
  // Determine grid-template-columns value
  let gridTemplateColumns: string;

  if (typeof columns === 'object' && columns != null) {
    // Responsive API: columns={{minWidth, max?, repeat?}}
    const repeatMode = columns.repeat === 'fit' ? 'auto-fit' : 'auto-fill';

    if (columns.max != null && columns.max > 0) {
      // Cap column count by limiting each track's max size
      gridTemplateColumns = buildCappedTemplate(
        columns.minWidth,
        columns.max,
        repeatMode,
        gap,
        columnGap,
      );
    } else {
      gridTemplateColumns = `repeat(${repeatMode}, minmax(${columns.minWidth}px, 1fr))`;
    }
  } else if (typeof columns === 'number' && columns > 0) {
    // Fixed columns mode
    gridTemplateColumns = `repeat(${columns}, 1fr)`;
  } else {
    // Default to 1 column if nothing specified
    gridTemplateColumns = '1fr';
  }

  // Build inline style for dynamic values. Track templates go through
  // dynamicStyles (CSS-var indirection) so xstyle/@media overrides work;
  // width/height stay inline as explicit caller-set dimensions.
  const inlineStyle: React.CSSProperties = {
    ...(width != null && {
      width: typeof width === 'number' ? `${width}px` : width,
    }),
    ...(height != null && {
      height: typeof height === 'number' ? `${height}px` : height,
    }),
    ...(maxWidth != null && {
      maxWidth: typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth,
    }),
    ...(minHeight != null && {
      minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
    }),
  };

  // For themeProps, extract numeric columns value for variant tracking
  const columnsVariant =
    typeof columns === 'number'
      ? columns
      : typeof columns === 'object'
        ? undefined
        : undefined;

  return (
    <div
      ref={ref}
      {...props}
      {...mergeProps(
        themeProps('grid', {columns: columnsVariant, gap, align, justify}),
        stylex.props(
          baseStyles.grid,
          dynamicStyles.templateColumns(gridTemplateColumns),
          rowHeight != null && dynamicStyles.autoRows(rowHeight),
          gap != null && gapStyles[gap],
          rowGap != null && rowGapStyles[rowGap],
          columnGap != null && columnGapStyles[columnGap],
          align != null && alignStyles[align],
          justify != null && justifyStyles[justify],
          xstyle,
        ),
        className,
        {...style, ...inlineStyle},
      )}>
      {children}
    </div>
  );
}

Grid.displayName = 'Grid';
