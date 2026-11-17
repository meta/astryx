// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RadialTooltip.tsx
 * @output Hover tooltip for radial charts (pie/donut/spider)
 * @position Child of RadialChart; reads geometry from radial context
 *
 * Uses the Astryx Layer system for top-layer rendering.
 * Hit-tests pointer position against slices (pie/donut) or axis proximity (spider).
 * Portals the popover div outside the SVG into the chart container.
 */

'use client';

import {
  useState,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import {createPortal} from 'react-dom';
import {useLayer} from '@astryxdesign/core/Layer';
import {useRadial, useRadialInteractive} from './RadialContext';

export interface RadialTooltipDatum {
  /** The slice key or axis name */
  label: string;
  /** The numeric value */
  value: number;
  /** For pie/donut: the percentage of total */
  percentage?: number;
  /** Index in the dataset */
  index: number;
}

export interface RadialTooltipProps {
  /**
   * Custom render function for tooltip content.
   * Receives the hovered slice/point info.
   *
   * @default Renders label, value, and percentage
   */
  render?: (datum: RadialTooltipDatum) => ReactNode;

  /**
   * Whether to highlight the hovered slice by scaling it outward.
   * @default true
   */
  highlight?: boolean;

  /**
   * Highlight offset in pixels (how far the slice pushes out).
   * @default 6
   */
  highlightOffset?: number;
}

/**
 * Tooltip for radial charts. Detects which slice the pointer is over
 * using polar coordinate math and renders a tooltip in the top layer.
 *
 * @example
 * ```
 * <RadialChart data={data} valueKey="revenue" labelKey="region" height={400}>
 *   <RadialSlice colors={colors} />
 *   <RadialTooltip />
 * </RadialChart>
 * ```
 */
export function RadialTooltip({
  render,
  highlight = true,
  highlightOffset = 6,
}: RadialTooltipProps) {
  const {
    cx,
    cy,
    radius,
    innerRadius,
    slices,
    mode,
    data,
    axes,
    angleByAxis,
    axisDomains,
  } = useRadial();
  const interactive = useRadialInteractive();

  const [hoverState, setHoverState] = useState<RadialTooltipDatum | null>(null);
  const [tooltipCoords, setTooltipCoords] = useState({x: 0, y: 0});
  const svgRef = useRef<SVGSVGElement | null>(null);
  const portalRef = useRef<HTMLElement | null>(null);
  const active = useRef(false);

  const layer = useLayer({mode: 'fixed'});
  const {hide} = layer;

  // Resolve SVG + portal target from the <g> mount
  const gRef = useCallback((el: SVGGElement | null) => {
    if (el) {
      svgRef.current = el.ownerSVGElement;
      portalRef.current = el.ownerSVGElement?.parentElement ?? null;
    }
  }, []);

  const hitTestPie = useCallback(
    (localX: number, localY: number): RadialTooltipDatum | null => {
      if (!slices || slices.length === 0) {
        return null;
      }

      const dx = localX - cx;
      const dy = localY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius || dist < innerRadius) {
        return null;
      }

      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) {
        angle += 2 * Math.PI;
      }

      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];
        if (angle >= slice.startAngle && angle <= slice.endAngle) {
          return {
            label: slice.key,
            value: slice.value,
            percentage: slice.percentage,
            index: i,
          };
        }
      }

      return null;
    },
    [slices, cx, cy, radius, innerRadius],
  );

  const hitTestSpider = useCallback(
    (localX: number, localY: number): RadialTooltipDatum | null => {
      if (!axes || !angleByAxis || !axisDomains) {
        return null;
      }

      const dx = localX - cx;
      const dy = localY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius + 20) {
        return null;
      }

      const angle = Math.atan2(dy, dx);
      let nearestAxis = axes[0];
      let minAngleDist = Infinity;

      for (const [key, axisAngle] of angleByAxis) {
        let diff = Math.abs(angle - axisAngle);
        if (diff > Math.PI) {
          diff = 2 * Math.PI - diff;
        }
        if (diff < minAngleDist) {
          minAngleDist = diff;
          nearestAxis = key;
        }
      }

      if (minAngleDist > Math.PI / axes.length) {
        return null;
      }

      let bestIdx = 0;
      let bestVal = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i][nearestAxis];
        if (typeof v === 'number' && v > bestVal) {
          bestVal = v;
          bestIdx = i;
        }
      }

      return {
        label: nearestAxis,
        value: bestVal,
        index: bestIdx,
      };
    },
    [axes, angleByAxis, axisDomains, cx, cy, radius, data],
  );

  const updateTooltip = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      const svg = svgRef.current;
      if (!svg) {
        return;
      }

      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const ctm = svg.getScreenCTM()?.inverse();
      if (!ctm) {
        return;
      }
      const local = pt.matrixTransform(ctm);

      const hit =
        mode === 'pie'
          ? hitTestPie(local.x, local.y)
          : hitTestSpider(local.x, local.y);

      if (hit) {
        setHoverState(hit);
        setTooltipCoords({x: e.clientX + 12, y: e.clientY - 8});
        layer.show();
      } else {
        setHoverState(null);
        layer.hide();
      }
    },
    [mode, hitTestPie, hitTestSpider, layer],
  );

  // Touch: tap to show, drag to scrub
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (interactive && e.pointerType !== 'mouse') {
        e.preventDefault();
        active.current = true;
        updateTooltip(e);
      }
    },
    [interactive, updateTooltip],
  );

  // Mouse: hover. Touch: drag (only if active).
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGCircleElement>) => {
      if (e.pointerType !== 'mouse' && (!interactive || !active.current)) {
        return;
      }
      updateTooltip(e);
    },
    [interactive, updateTooltip],
  );

  // Touch: lift to dismiss
  const handlePointerUp = useCallback(() => {
    if (active.current) {
      active.current = false;
      setHoverState(null);
      hide();
    }
  }, [hide]);

  // Sync the top-layer popover with touch interaction availability.
  useLayoutEffect(() => {
    if (!interactive) {
      handlePointerUp();
    }
  }, [interactive, handlePointerUp]);

  const handlePointerLeave = useCallback(() => {
    if (!active.current) {
      setHoverState(null);
      layer.hide();
    }
  }, [layer]);

  const defaultRender = (d: RadialTooltipDatum) => (
    <div
      style={{display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12}}>
      <div style={{fontWeight: 600}}>{d.label}</div>
      <div>
        <span style={{color: 'var(--color-text-secondary)'}}>Value:</span>{' '}
        <span style={{fontWeight: 500}}>{d.value.toLocaleString()}</span>
      </div>
      {d.percentage != null && (
        <div>
          <span style={{color: 'var(--color-text-secondary)'}}>Share:</span>{' '}
          <span style={{fontWeight: 500}}>
            {Math.round(d.percentage * 100)}%
          </span>
        </div>
      )}
    </div>
  );

  const highlightSlice =
    highlight && hoverState && mode === 'pie' && slices?.[hoverState.index];

  return (
    <>
      <g ref={gRef}>
        {/* Event capture — circle covering the chart area, no pointer capture */}
        <circle
          cx={cx}
          cy={cy}
          r={radius + 10}
          fill="transparent"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />

        {/* Highlight: translate hovered slice outward */}
        {highlightSlice && (
          <g
            transform={(() => {
              const midAngle =
                (highlightSlice.startAngle + highlightSlice.endAngle) / 2;
              const tx = Math.cos(midAngle) * highlightOffset;
              const ty = Math.sin(midAngle) * highlightOffset;
              return `translate(${tx},${ty})`;
            })()}
            pointerEvents="none"
            opacity={0.3}>
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke="var(--color-border-emphasized)"
              strokeWidth={2}
            />
          </g>
        )}
      </g>

      {/* Tooltip in top layer — portaled outside SVG */}
      {portalRef.current &&
        createPortal(
          layer.render(
            hoverState ? (
              <div
                style={{
                  background: 'var(--color-background-popover)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  boxShadow: 'var(--shadow-med)',
                  whiteSpace: 'nowrap',
                  width: 'fit-content',
                  pointerEvents: 'none',
                }}>
                {render ? render(hoverState) : defaultRender(hoverState)}
              </div>
            ) : null,
            {x: tooltipCoords.x, y: tooltipCoords.y},
          ),
          portalRef.current,
        )}
    </>
  );
}
