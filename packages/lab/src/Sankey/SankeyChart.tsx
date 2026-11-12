// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file SankeyChart.tsx
 * @output Root Sankey container — computes layout and provides context
 * @position Parent component; all Sankey marks are children
 *
 * When columns × minColumnWidth exceeds the container, the chart
 * scrolls horizontally rather than squishing columns together.
 *
 * Accessibility: the svg is exposed as a named image (role="img" + aria-label,
 * overridable via `label`) in both the scrolling and non-scrolling paths, and
 * small graphs are mirrored in a visually hidden From/To/Value table.
 */

import {type ReactNode, useCallback, useMemo, useState} from 'react';
import {VisuallyHidden} from '@astryxdesign/core/VisuallyHidden';
import {SankeyProvider} from './SankeyContext';
import {computeLayout} from './layout';
import type {SankeyNodeDatum, SankeyLinkDatum, SankeyColumn} from './types';

export interface SankeyChartProps {
  /** Node definitions */
  nodes: SankeyNodeDatum[];
  /** Link definitions */
  links: SankeyLinkDatum[];
  /**
   * Column definitions. Accepts either:
   * - Simple: `string[][]` — arrays of node IDs per column
   * - Rich: `SankeyColumnDef[]` — objects with `ids`, optional `label`
   * - Mixed: any combination
   *
   * If omitted, columns are auto-detected via topological sort.
   */
  columns?: SankeyColumn[];
  /** Chart height in px (default: 320) */
  height?: number;
  /** Node bar width in px (default: 20) */
  nodeWidth?: number;
  /** Vertical gap between sibling nodes (default: 14) */
  nodeGap?: number;
  /**
   * Override all node bar colors with a single CSS color.
   * Both SankeyNode and SankeyLabel read this from context
   * so labels adapt their text color for contrast.
   */
  nodeColor?: string;
  /**
   * Minimum width per column in px (default: 160).
   * When total min width exceeds the container, horizontal scrolling activates.
   */
  minColumnWidth?: number;
  /**
   * Accessible name for the chart, announced by screen readers. Applied to the
   * svg (`role="img"`) and, when the chart scrolls, to the focusable scroll
   * region. Pass a localized string to override the English default.
   *
   * @default 'Sankey chart'
   */
  label?: string;
  /** Chart contents */
  children: ReactNode;
}

/**
 * Maximum number of links for which the visually hidden data-table fallback is
 * rendered. Beyond this a table is more noise than signal, so larger charts
 * are name-only.
 */
const MAX_TABLE_LINKS = 100;

/** Resolve column count from raw column input or auto-detect from graph */
function resolveColumnCount(
  columns: SankeyColumn[] | undefined,
  nodes: SankeyNodeDatum[],
  links: SankeyLinkDatum[],
): number {
  if (columns) {
    return columns.length;
  }
  // Quick topological column count
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    outEdges.set(n.id, []);
  });
  links.forEach(l => {
    inDegree.set(l.target, (inDegree.get(l.target) || 0) + 1);
    outEdges.get(l.source)?.push(l.target);
  });
  const colMap = new Map<string, number>();
  const queue: string[] = [];
  nodes.forEach(n => {
    if (inDegree.get(n.id) === 0) {
      queue.push(n.id);
      colMap.set(n.id, 0);
    }
  });
  while (queue.length) {
    const id = queue.shift();
    if (id == null) {
      break;
    }
    const col = colMap.get(id) ?? 0;
    for (const tgt of outEdges.get(id) || []) {
      colMap.set(tgt, Math.max(colMap.get(tgt) || 0, col + 1));
      inDegree.set(tgt, (inDegree.get(tgt) || 0) - 1);
      if (inDegree.get(tgt) === 0) {
        queue.push(tgt);
      }
    }
  }
  return Math.max(...Array.from(colMap.values()), 0) + 1;
}

/**
 * Root component for Sankey/flow diagrams.
 *
 * Computes layout from nodes + links, exposes positions via context.
 * Width is responsive but enforces minColumnWidth — scrolls when needed.
 *
 * @example
 * ```
 * <SankeyChart
 *   nodes={nodes}
 *   links={links}
 *   columns={[
 *     {ids: ['a', 'b'], label: 'Source'},
 *     {ids: ['c', 'd'], label: 'Target'},
 *   ]}>
 *   <SankeyGrid />
 *   <SankeyLink />
 *   <SankeyNode />
 *   <SankeyLabel />
 * </SankeyChart>
 * ```
 */
export function SankeyChart({
  nodes,
  links,
  columns,
  height = 320,
  nodeWidth = 20,
  nodeGap = 14,
  nodeColor,
  minColumnWidth = 160,
  label = 'Sankey chart',
  children,
}: SankeyChartProps) {
  const [containerWidth, setContainerWidth] = useState(0);

  const observeContainerWidth = useCallback((container: HTMLDivElement) => {
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      setContainerWidth(w);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const colCount = useMemo(
    () => resolveColumnCount(columns, nodes, links),
    [columns, nodes, links],
  );

  const minWidth = colCount * minColumnWidth;
  const chartWidth = Math.max(containerWidth, minWidth);
  const needsScroll = containerWidth > 0 && chartWidth > containerWidth;

  const layout = useMemo(() => {
    if (containerWidth === 0) {
      return null;
    }
    return computeLayout(nodes, links, {
      width: chartWidth,
      height,
      nodeWidth,
      nodeGap,
      columns,
    });
  }, [
    nodes,
    links,
    chartWidth,
    height,
    nodeWidth,
    nodeGap,
    columns,
    containerWidth,
  ]);

  const ctx = useMemo(() => {
    if (!layout) {
      return null;
    }
    return {
      nodes: layout.nodes,
      links: layout.links,
      columns: layout.columns,
      width: chartWidth,
      height,
      valueScale: layout.valueScale,
      maxValue: layout.maxValue,
      nodeWidth,
      nodeColor,
    };
  }, [layout, chartWidth, height, nodeWidth, nodeColor]);

  const nodeLabelById = useMemo(
    () => new Map(nodes.map(n => [n.id, n.label || n.id])),
    [nodes],
  );
  const showDataTable = links.length > 0 && links.length <= MAX_TABLE_LINKS;

  return (
    <div ref={observeContainerWidth} style={{width: '100%'}}>
      {ctx && (
        <div
          role={needsScroll ? 'group' : undefined}
          aria-label={needsScroll ? label : undefined}
          tabIndex={needsScroll ? 0 : undefined}
          style={
            needsScroll ? {overflowX: 'auto', overflowY: 'hidden'} : undefined
          }>
          <svg
            role="img"
            aria-label={label}
            width={chartWidth}
            height={height}
            style={{overflow: 'visible', display: 'block'}}>
            <SankeyProvider value={ctx}>{children}</SankeyProvider>
          </svg>
        </div>
      )}
      {showDataTable && (
        <VisuallyHidden as="div">
          <table>
            <caption>{`${label} data`}</caption>
            <thead>
              <tr>
                <th scope="col">From</th>
                <th scope="col">To</th>
                <th scope="col">Value</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link, i) => (
                <tr key={i}>
                  <th scope="row">
                    {nodeLabelById.get(link.source) ?? link.source}
                  </th>
                  <td>{nodeLabelById.get(link.target) ?? link.target}</td>
                  <td>{String(link.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </VisuallyHidden>
      )}
    </div>
  );
}

SankeyChart.displayName = 'SankeyChart';
