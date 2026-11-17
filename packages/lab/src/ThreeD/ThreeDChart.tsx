// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ThreeDChart.tsx
 * @output Root 3D chart container — projected SVG with depth sorting,
 *   accessible name, pointer + keyboard camera controls, and pausable
 *   auto-rotation (respects prefers-reduced-motion)
 * @position Parent component; all 3D marks read from its context
 */

import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {ThreeDProvider} from './ThreeDContext';
import type {Camera, ProjectedPoint} from './types';

export interface ThreeDChartProps {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  zKey: string;
  xDomain?: [number, number];
  yDomain?: [number, number];
  zDomain?: [number, number];
  height?: number;
  azimuth?: number;
  elevation?: number;
  interactive?: boolean;
  /**
   * Auto-rotate speed in degrees per frame (default: 0 = off).
   *
   * Rotation pauses while the chart is hovered or focused, and is disabled
   * entirely when the user has `prefers-reduced-motion: reduce` set. Pass 0
   * (or omit) to turn it off.
   */
  autoRotate?: number;
  /**
   * Accessible label for the chart. Defaults to a description derived from
   * the data keys, e.g. "3D chart of sales by month and region".
   */
  label?: string;
  children: ReactNode;
}

/** Degrees the camera rotates per arrow-key press. */
const KEYBOARD_STEP_DEGREES = 10;

function computeDomain(
  data: Record<string, unknown>[],
  key: string,
): [number, number] {
  let min = Infinity,
    max = -Infinity;
  for (const d of data) {
    const v = d[key];
    if (typeof v === 'number') {
      if (v < min) {
        min = v;
      }
      if (v > max) {
        max = v;
      }
    }
  }
  return [min === Infinity ? 0 : min, max === -Infinity ? 1 : max];
}

export function ThreeDChart({
  data,
  xKey,
  yKey,
  zKey,
  xDomain: xDomainProp,
  yDomain: yDomainProp,
  zDomain: zDomainProp,
  height = 400,
  azimuth: azimuthProp = 35,
  elevation: elevationProp = 25,
  interactive = false,
  autoRotate = 0,
  label,
  children,
}: ThreeDChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const prefersReducedMotion = useMediaQuery(
    '(prefers-reduced-motion: reduce)',
  );
  const [camera, setCamera] = useState<Camera>({
    azimuth: azimuthProp,
    elevation: elevationProp,
  });
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startAz: number;
    startEl: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!containerRef.current) {
      return;
    }
    const obs = new ResizeObserver(e => {
      if (e[0]) {
        setContainerWidth(e[0].contentRect.width);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const width = containerWidth;
  const xDomain = xDomainProp ?? computeDomain(data, xKey);
  const yDomain = yDomainProp ?? computeDomain(data, yKey);
  const zDomain = zDomainProp ?? computeDomain(data, zKey);

  const normalize = useCallback((value: number, domain: [number, number]) => {
    const range = domain[1] - domain[0];
    return range === 0 ? 0.5 : (value - domain[0]) / range;
  }, []);

  // Projection: normalized [0,1]^3 → 2D pixel coords
  // SYNC: This math is replicated in ThreeDScatterGL's vertex shader.
  // Both must produce identical output. Verified by projection.test.ts.
  // If you change this, update the shader and re-run the parity tests.
  const project = useMemo(() => {
    const azRad = (camera.azimuth * Math.PI) / 180;
    const elRad = (camera.elevation * Math.PI) / 180;
    const cosAz = Math.cos(azRad),
      sinAz = Math.sin(azRad);
    const cosEl = Math.cos(elRad),
      sinEl = Math.sin(elRad);
    const scale = Math.min(width, height) * 0.35;
    const cx = width / 2,
      cy = height / 2;

    return (nx: number, ny: number, nz: number): ProjectedPoint => {
      const x = nx - 0.5,
        y = ny - 0.5,
        z = nz - 0.5;
      const x1 = x * cosAz + z * sinAz;
      const z1 = -x * sinAz + z * cosAz;
      const y1 = y * cosEl - z1 * sinEl;
      const z2 = y * sinEl + z1 * cosEl;
      return {px: cx + x1 * scale, py: cy - y1 * scale, depth: z2};
    };
  }, [camera.azimuth, camera.elevation, width, height]);

  const handleStart = useCallback(
    (clientX: number, clientY: number) => {
      if (!interactive) {
        return;
      }
      dragRef.current = {
        startX: clientX,
        startY: clientY,
        startAz: camera.azimuth,
        startEl: camera.elevation,
      };
    },
    [interactive, camera],
  );

  const handleMove = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) {
      return;
    }
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    setCamera({
      azimuth: dragRef.current.startAz + dx * 0.5,
      elevation: Math.max(
        -89,
        Math.min(89, dragRef.current.startEl - dy * 0.5),
      ),
    });
  }, []);

  const handleEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Keyboard camera: arrow keys rotate yaw/pitch with the same clamps as
  // pointer drag (WCAG 2.1.1 — every pointer operation needs a keyboard
  // equivalent). preventDefault stops the page from scrolling while focused.
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<SVGSVGElement>) => {
      if (!interactive) {
        return;
      }
      let deltaAzimuth = 0;
      let deltaElevation = 0;
      switch (e.key) {
        case 'ArrowLeft':
          deltaAzimuth = -KEYBOARD_STEP_DEGREES;
          break;
        case 'ArrowRight':
          deltaAzimuth = KEYBOARD_STEP_DEGREES;
          break;
        case 'ArrowUp':
          deltaElevation = KEYBOARD_STEP_DEGREES;
          break;
        case 'ArrowDown':
          deltaElevation = -KEYBOARD_STEP_DEGREES;
          break;
        default:
          return;
      }
      e.preventDefault();
      setCamera(prev => ({
        azimuth: prev.azimuth + deltaAzimuth,
        elevation: Math.max(-89, Math.min(89, prev.elevation + deltaElevation)),
      }));
    },
    [interactive],
  );

  // Auto-rotation — throttled to ~20fps to avoid overwhelming React with
  // re-renders. Disabled under prefers-reduced-motion (WCAG 2.3.3) and
  // paused while the chart is hovered or focused (WCAG 2.2.2).
  const rotationActive =
    autoRotate !== 0 && !prefersReducedMotion && !hovered && !focused;
  useEffect(() => {
    if (!rotationActive) {
      return;
    }
    let raf: number;
    let lastUpdate = 0;
    const interval = 50; // ms between React updates (~20fps)
    const tick = (now: number) => {
      if (!dragRef.current && now - lastUpdate >= interval) {
        const elapsed = lastUpdate === 0 ? interval : now - lastUpdate;
        lastUpdate = now;
        const degrees = autoRotate * (elapsed / 16.67); // normalize to 60fps equivalent
        setCamera(prev => ({...prev, azimuth: prev.azimuth + degrees}));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, rotationActive]);

  const ctx = useMemo(
    () => ({
      width,
      height,
      data,
      xKey,
      yKey,
      zKey,
      project,
      xDomain,
      yDomain,
      zDomain,
      normalize,
      camera,
    }),
    [
      width,
      height,
      data,
      xKey,
      yKey,
      zKey,
      project,
      xDomain,
      yDomain,
      zDomain,
      normalize,
      camera,
    ],
  );

  const containerStyle: CSSProperties = {
    width: '100%',
    touchAction: interactive ? 'none' : undefined,
    userSelect: interactive ? 'none' : undefined,
  };

  const accessibleLabel = label ?? `3D chart of ${yKey} by ${xKey} and ${zKey}`;
  // Focusable when there is something keyboard users can do with it:
  // rotate the camera (interactive) or pause the auto-rotation.
  const focusable = interactive || autoRotate !== 0;

  return (
    <div ref={containerRef} style={containerStyle}>
      {containerWidth > 0 && (
        <svg
          role="img"
          aria-label={accessibleLabel}
          tabIndex={focusable ? 0 : undefined}
          width={containerWidth}
          height={height}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onMouseEnter={() => setHovered(true)}
          onMouseDown={e => handleStart(e.clientX, e.clientY)}
          onMouseMove={e => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={() => {
            setHovered(false);
            handleEnd();
          }}
          onTouchStart={e => {
            const t = e.touches[0];
            if (t) {
              handleStart(t.clientX, t.clientY);
            }
          }}
          onTouchMove={e => {
            const t = e.touches[0];
            if (t) {
              handleMove(t.clientX, t.clientY);
            }
          }}
          onTouchEnd={handleEnd}
          style={{
            cursor: interactive ? 'grab' : undefined,
            touchAction: interactive ? 'none' : undefined,
          }}>
          <ThreeDProvider value={ctx}>{children}</ThreeDProvider>
        </svg>
      )}
    </div>
  );
}
