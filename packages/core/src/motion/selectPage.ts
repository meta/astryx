// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectPage.ts
 * @input A release (position, velocity), the page size and count, the
 *   current page
 * @output Exports `selectPage`: the page a paging release settles on
 * @position UIScrollView paging (`isPagingEnabled`) on the release policy
 *   (resolveSnapPoint.ts). Pure: no DOM, no React
 *
 * SYNC: When modified, update selectPage.test.ts.
 */

import type {SnapSelection} from './projection';
import {resolveSnapPoint} from './resolveSnapPoint';
import {scroll} from './uikit/scroll';

/**
 * UIScrollView paging (`isPagingEnabled`): the page a release settles on, at
 * most one page from `currentPage`, chosen by projecting the release with
 * the paging projection rate (uikit/scroll.ts; a GUESS until measured).
 * Pages are `pageSize` apart starting at 0.
 */
export function selectPage({
  position,
  velocity,
  pageSize,
  pageCount,
  currentPage,
  rate = scroll.paging.projectionRate,
}: {
  position: number;
  velocity: number;
  pageSize: number;
  pageCount: number;
  currentPage: number;
  rate?: number;
}): SnapSelection {
  const points = Array.from(
    {length: Math.max(1, pageCount)},
    (_, i) => i * pageSize,
  );
  // The release policy (resolveSnapPoint.ts), with the paging rate as the
  // seconds of velocity it projects, no flick and one page per release.
  const {index, projected} = resolveSnapPoint({
    points,
    position,
    velocity,
    flickThreshold: Infinity,
    projection: {seconds: rate / (1 - rate) / 1000},
    fromIndex: currentPage,
    maxSteps: 1,
  });
  return {index, value: points[index], projected};
}
