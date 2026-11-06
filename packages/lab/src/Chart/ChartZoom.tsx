// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChartZoom.tsx
 * @output Scroll/pinch zoom + drag pan with optional toolbar.
 * @position Child of Chart; modifies x/yDomain via callbacks
 *
 * Zoom is aspect-ratio-normalized: both axes scale by the same visual
 * factor regardless of their domain ranges. Reset button restores
 * the domains of the first render.
 */

import {type CSSProperties, useCallback, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {IconButton} from '@astryxdesign/core/IconButton';
import {useChart} from './ChartContext';
import {isBandScale} from './utils';
import type {ScaleLinear} from 'd3-scale';

/** Toolbar position relative to the chart */
export type ZoomToolbarPosition =
  'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface ChartZoomProps {
  onXDomainChange?: (domain: [number, number]) => void;
  onYDomainChange?: (domain: [number, number]) => void;

  /**
   * Zoom speed factor per scroll tick. Higher = faster zoom.
   * @default 0.1
   */
  zoomSpeed?: number;

  /** Only zoom/pan the x-axis */
  xOnly?: boolean;
  /** Only zoom/pan the y-axis */
  yOnly?: boolean;

  /**
   * Show the zoom/pan toolbar.
   * Pass `false` to hide, or a position string to show at that corner.
   * @default 'top-right'
   */
  toolbar?: false | ZoomToolbarPosition;
}

// Chart toolbar icons (16x16 SVG)
function ZoomInIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

function ZoomOutIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round">
      <path d="M3 8h10" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M2 8a6 6 0 1 1 1.5 4M2 12V8h4" />
    </svg>
  );
}

export function ChartZoom({
  onXDomainChange,
  onYDomainChange,
  zoomSpeed = 0.1,
  xOnly = false,
  yOnly = false,
  toolbar = 'top-right',
}: ChartZoomProps) {
  const {width, height, xScale, yScale, svgRef} = useChart();

  const [initialDomains] = useState<{
    x: [number, number] | null;
    y: [number, number];
  }>(() => ({
    x: isBandScale(xScale)
      ? null
      : ((xScale as ScaleLinear<number, number>).domain() as [number, number]),
    y: yScale.domain() as [number, number],
  }));

  const dragRef = useRef<{
    startX: number;
    startY: number;
    xDomain: [number, number];
    yDomain: [number, number];
  } | null>(null);

  const pointersRef = useRef<Map<number, {x: number; y: number}>>(new Map());
  const pinchRef = useRef<{
    dist: number;
    xDomain: [number, number];
    yDomain: [number, number];
  } | null>(null);

  const getXDomain = useCallback(
    (): [number, number] =>
      isBandScale(xScale)
        ? [0, 0]
        : ((xScale as ScaleLinear<number, number>).domain() as [
            number,
            number,
          ]),
    [xScale],
  );

  // Zoom a single axis around a pivot point by a factor.
  // factor > 1 = zoom out, factor < 1 = zoom in.
  const zoomAxis = useCallback(
    (
      domain: [number, number],
      factor: number,
      pivot: number,
    ): [number, number] => {
      const [lo, hi] = domain;
      const range = hi - lo;
      const leftRatio = (pivot - lo) / range;
      const newRange = range * factor;
      return [pivot - newRange * leftRatio, pivot + newRange * (1 - leftRatio)];
    },
    [],
  );

  const zoomBy = useCallback(
    (factor: number, pivotX?: number, pivotY?: number) => {
      if (!yOnly && !isBandScale(xScale)) {
        const linear = xScale as ScaleLinear<number, number>;
        const [xMin, xMax] = linear.domain() as [number, number];
        const xPivot =
          pivotX != null ? linear.invert(pivotX) : (xMin + xMax) / 2;
        onXDomainChange?.(zoomAxis([xMin, xMax], factor, xPivot));
      }
      if (!xOnly) {
        const [yMin, yMax] = yScale.domain() as [number, number];
        const yPivot =
          pivotY != null ? yScale.invert(pivotY) : (yMin + yMax) / 2;
        onYDomainChange?.(zoomAxis([yMin, yMax], factor, yPivot));
      }
    },
    [xScale, yScale, onXDomainChange, onYDomainChange, xOnly, yOnly, zoomAxis],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      // A sideways wheel zooms nothing, so the page keeps its scroll.
      if (e.deltaY === 0) {
        return;
      }
      e.preventDefault();

      const surface = e.currentTarget as SVGRectElement;
      const svg = surface.ownerSVGElement;
      if (!svg) {
        return;
      }
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const local = pt.matrixTransform(surface.getScreenCTM()?.inverse());

      // Clamp delta to prevent trackpad acceleration from blowing out the domain.
      // A single tick should zoom by at most zoomSpeed (10% default).
      const clampedDelta =
        Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 50);
      const rawFactor = 1 + (clampedDelta / 50) * zoomSpeed;

      // Apply per-axis, normalizing by each axis's pixel-to-domain ratio
      // so both axes zoom at the same visual rate.
      if (!yOnly && !isBandScale(xScale)) {
        const linear = xScale as ScaleLinear<number, number>;
        const [xMin, xMax] = linear.domain() as [number, number];
        const xPivot = linear.invert(local.x);
        onXDomainChange?.(zoomAxis([xMin, xMax], rawFactor, xPivot));
      }

      if (!xOnly) {
        const [yMin, yMax] = yScale.domain() as [number, number];
        const yPivot = yScale.invert(local.y);
        onYDomainChange?.(zoomAxis([yMin, yMax], rawFactor, yPivot));
      }
    },
    [
      zoomSpeed,
      xScale,
      yScale,
      onXDomainChange,
      onYDomainChange,
      xOnly,
      yOnly,
      zoomAxis,
    ],
  );

  // React registers `wheel` as passive, so a React `onWheel` cannot stop the
  // page scrolling. The zoom surface's ref adds a native listener instead.
  const surfaceRef = useCallback(
    (surface: SVGRectElement) => {
      surface.addEventListener('wheel', handleWheel, {passive: false});
      return () => surface.removeEventListener('wheel', handleWheel);
    },
    [handleWheel],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      (e.target as Element).setPointerCapture(e.pointerId);
      e.preventDefault(); // prevent selection on touch
      pointersRef.current.set(e.pointerId, {x: e.clientX, y: e.clientY});

      if (pointersRef.current.size === 2) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        pinchRef.current = {
          dist,
          xDomain: getXDomain(),
          yDomain: yScale.domain() as [number, number],
        };
        dragRef.current = null;
      } else if (pointersRef.current.size === 1) {
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          xDomain: getXDomain(),
          yDomain: yScale.domain() as [number, number],
        };
      }
    },
    [getXDomain, yScale],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      pointersRef.current.set(e.pointerId, {x: e.clientX, y: e.clientY});

      if (pointersRef.current.size === 2 && pinchRef.current) {
        const pts = [...pointersRef.current.values()];
        const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const ratio = pinchRef.current.dist / dist;
        if (!yOnly && !isBandScale(xScale)) {
          const [xMin, xMax] = pinchRef.current.xDomain;
          const mid = (xMin + xMax) / 2;
          const half = ((xMax - xMin) / 2) * ratio;
          onXDomainChange?.([mid - half, mid + half]);
        }
        if (!xOnly) {
          const [yMin, yMax] = pinchRef.current.yDomain;
          const mid = (yMin + yMax) / 2;
          const half = ((yMax - yMin) / 2) * ratio;
          onYDomainChange?.([mid - half, mid + half]);
        }
      } else if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        if (!yOnly && !isBandScale(xScale)) {
          const [xMin, xMax] = dragRef.current.xDomain;
          const xShift = -(dx / width) * (xMax - xMin);
          onXDomainChange?.([xMin + xShift, xMax + xShift]);
        }
        if (!xOnly) {
          const [yMin, yMax] = dragRef.current.yDomain;
          const yShift = (dy / height) * (yMax - yMin);
          onYDomainChange?.([yMin + yShift, yMax + yShift]);
        }
      }
    },
    [xScale, width, height, onXDomainChange, onYDomainChange, xOnly, yOnly],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<SVGRectElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (pointersRef.current.size === 0) {
      dragRef.current = null;
    }
  }, []);

  const handleReset = useCallback(() => {
    if (initialDomains.x) {
      onXDomainChange?.(initialDomains.x);
    }
    onYDomainChange?.(initialDomains.y);
  }, [initialDomains, onXDomainChange, onYDomainChange]);

  // Toolbar portal target
  const portalTarget = svgRef.current?.parentElement;

  // Toolbar position styles
  const toolbarPositionStyle = (
    pos: ZoomToolbarPosition,
  ): React.CSSProperties => {
    const base: CSSProperties = {
      position: 'absolute',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      zIndex: 1,
    };
    switch (pos) {
      case 'top-right':
        return {...base, top: 8, right: 8};
      case 'top-left':
        return {...base, top: 8, left: 8};
      case 'bottom-right':
        return {...base, bottom: 8, right: 8};
      case 'bottom-left':
        return {...base, bottom: 8, left: 8};
    }
  };

  const zoomRectStyle: CSSProperties = {
    cursor: 'grab',
    touchAction: 'none',
    userSelect: 'none',
  };

  return (
    <>
      <g>
        <rect
          ref={surfaceRef}
          x={0}
          y={0}
          width={width}
          height={height}
          fill="transparent"
          style={zoomRectStyle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </g>

      {/* Toolbar — portaled to chart container for proper positioning */}
      {toolbar &&
        portalTarget &&
        createPortal(
          <div style={toolbarPositionStyle(toolbar)}>
            <IconButton
              label="Zoom in"
              icon={<ZoomInIcon />}
              variant="ghost"
              size="sm"
              onClick={() => zoomBy(1 / (1 + zoomSpeed))}
            />
            <IconButton
              label="Zoom out"
              icon={<ZoomOutIcon />}
              variant="ghost"
              size="sm"
              onClick={() => zoomBy(1 + zoomSpeed)}
            />
            <IconButton
              label="Reset zoom"
              icon={<ResetIcon />}
              variant="ghost"
              size="sm"
              onClick={handleReset}
            />
          </div>,
          portalTarget,
        )}
    </>
  );
}
