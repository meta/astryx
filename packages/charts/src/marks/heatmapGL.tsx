// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/heatmapGL.tsx
 * @output WebGL heatmap — 2D grid of colored cells on canvas
 *
 * Cell geometry is memoized; GL context, program, and the position/color
 * buffers are created once and reused across redraws, then released (context
 * eagerly lost) on unmount. Handles context loss/restore and empty/NaN data.
 */

import {useRef, useEffect, useMemo, useState} from 'react';
import type {SeriesDef, ResolvedPoint} from '../types';
import type {ScaleBand} from 'd3-scale';
import {
  hexToGL,
  getWebGLContext,
  setupGLState,
  sizeCanvas,
  mountCanvasOverSVG,
  createProgram,
  registerContextLossHandlers,
  loseContext,
} from '../webgl';

export interface HeatmapGLOptions {
  xKey: string;
  yKey: string;
  valueKey: string;
  colorRange: string[];
  domain?: [number, number];
  cellGap?: number;
}

const VERT = `
  attribute vec2 a_position;
  attribute vec3 a_color;
  uniform vec2 u_resolution;
  varying vec3 v_color;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    v_color = a_color;
  }
`;

const FRAG = `
  precision mediump float;
  varying vec3 v_color;
  void main() {
    gl_FragColor = vec4(v_color, 1.0);
  }
`;

function sampleRamp(
  ramp: [number, number, number][],
  t: number,
): [number, number, number] {
  if (ramp.length === 0) {
    return [0, 0, 0];
  }
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  if (ramp.length === 1) {
    return ramp[0];
  }
  const s = c * (ramp.length - 1);
  const lo = Math.floor(s);
  const hi = Math.min(lo + 1, ramp.length - 1);
  const f = s - lo;
  return [
    ramp[lo][0] + f * (ramp[hi][0] - ramp[lo][0]),
    ramp[lo][1] + f * (ramp[hi][1] - ramp[lo][1]),
    ramp[lo][2] + f * (ramp[hi][2] - ramp[lo][2]),
  ];
}

type HeatmapGLLocations = {
  aPosition: number;
  aColor: number;
  uResolution: WebGLUniformLocation | null;
};

/**
 * Inline component — manages the heatmap WebGL canvas. Rows use the chart's
 * shared y band scale so cells stay aligned with the left axis' category labels.
 */
function HeatmapGLCanvas({
  data,
  xKey,
  yKey,
  valueKey,
  xScale,
  yBandScale,
  colorRange,
  domain: domainProp,
  cellGap,
  width,
  height,
}: {
  data: Record<string, unknown>[];
  xKey: string;
  yKey: string;
  valueKey: string;
  xScale: ScaleBand<string>;
  yBandScale: ScaleBand<string>;
  colorRange: string[];
  domain?: [number, number];
  cellGap: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const posBufferRef = useRef<WebGLBuffer | null>(null);
  const colBufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<HeatmapGLLocations | null>(null);
  const markerRef = useRef<SVGGElement>(null);
  // Bumped on context restore to force the draw effect to rebuild + repaint.
  const [contextEpoch, setContextEpoch] = useState(0);

  const ramp = useMemo(() => colorRange.map(hexToGL), [colorRange]);

  const domain = useMemo((): [number, number] => {
    if (domainProp) {
      return domainProp;
    }
    let min = Infinity,
      max = -Infinity;
    for (const d of data) {
      const v = d[valueKey];
      if (typeof v === 'number' && Number.isFinite(v)) {
        if (v < min) {
          min = v;
        }
        if (v > max) {
          max = v;
        }
      }
    }
    // No finite values → neutral [0, 1] so t/ramp math never yields NaN.
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 1];
    }
    return [min, max];
  }, [data, valueKey, domainProp]);

  // Build interleaved triangle geometry (2 triangles/cell) + per-vertex colors.
  // Memoized so redraws (resize, context restore) don't re-walk the dataset.
  const geometry = useMemo(() => {
    const positions: number[] = [];
    const colors: number[] = [];
    const [dMin, dMax] = domain;
    const range = dMax - dMin || 1;
    const gap = cellGap;
    const xBW = xScale.bandwidth();
    const yBW = yBandScale.bandwidth();
    // Heatmap cells fill their full slot (step), not just the band width. The
    // shared x-scale carries bar-style padding (~0.2), so sizing cells to the
    // bandwidth leaves gaps between columns while the local y-scale stays tight —
    // an asymmetric, sparse grid. Sizing to the step and centering on the band
    // keeps cells contiguous (a real heatmap); cellGap alone controls spacing.
    const xStep = typeof xScale.step === 'function' ? xScale.step() : xBW;
    const yStep = yBandScale.step();

    for (const d of data) {
      const xVal = xScale(String(d[xKey]));
      const yVal = yBandScale(String(d[yKey]));
      if (xVal == null || yVal == null) {
        continue;
      }

      const raw = d[valueKey];
      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
      const t = (v - dMin) / range;
      const [r, g, b] = sampleRamp(ramp, t);

      const xc = xVal + xBW / 2;
      const yc = yVal + yBW / 2;
      const x0 = xc - xStep / 2 + gap / 2;
      const x1 = xc + xStep / 2 - gap / 2;
      const y0 = yc - yStep / 2 + gap / 2;
      const y1 = yc + yStep / 2 - gap / 2;

      positions.push(x0, y0, x1, y0, x0, y1, x1, y0, x1, y1, x0, y1);
      for (let i = 0; i < 6; i++) {
        colors.push(r, g, b);
      }
    }

    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      vertexCount: positions.length / 2,
    };
  }, [data, xKey, yKey, valueKey, xScale, yBandScale, domain, ramp, cellGap]);

  // Mount the canvas outside the SVG and wire context-loss recovery.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return;
    }
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    const detach = mountCanvasOverSVG(marker, canvas, width, height);
    const unregister = registerContextLossHandlers(
      canvas,
      () => {
        glRef.current = null;
        programRef.current = null;
        posBufferRef.current = null;
        colBufferRef.current = null;
        locsRef.current = null;
      },
      () => setContextEpoch(e => e + 1),
    );
    return () => {
      unregister();
      detach?.();
    };
  }, [width, height]);

  // Draw. Context, program, and both buffers are created once and reused.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }

    sizeCanvas(canvas, width, height);

    if (!glRef.current) {
      glRef.current = getWebGLContext(canvas);
    }
    const gl = glRef.current;
    if (!gl || gl.isContextLost()) {
      return;
    }

    if (!programRef.current) {
      programRef.current = createProgram(gl, VERT, FRAG);
      locsRef.current = null;
    }
    const program = programRef.current;
    if (!program) {
      return;
    }

    if (!posBufferRef.current) {
      posBufferRef.current = gl.createBuffer();
    }
    if (!colBufferRef.current) {
      colBufferRef.current = gl.createBuffer();
    }
    const posBuffer = posBufferRef.current;
    const colBuffer = colBufferRef.current;
    if (!posBuffer || !colBuffer) {
      return;
    }

    if (!locsRef.current) {
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, 'a_position'),
        aColor: gl.getAttribLocation(program, 'a_color'),
        uResolution: gl.getUniformLocation(program, 'u_resolution'),
      };
    }
    const locs = locsRef.current;

    gl.viewport(0, 0, canvas.width, canvas.height);
    setupGLState(gl);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locs.aPosition);
    gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, colBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geometry.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locs.aColor);
    gl.vertexAttribPointer(locs.aColor, 3, gl.FLOAT, false, 0, 0);

    gl.uniform2f(locs.uResolution, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, geometry.vertexCount);
  }, [geometry, width, height, contextEpoch]);

  // Release all GL resources on unmount.
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (gl) {
        if (posBufferRef.current) {
          gl.deleteBuffer(posBufferRef.current);
        }
        if (colBufferRef.current) {
          gl.deleteBuffer(colBufferRef.current);
        }
        if (programRef.current) {
          gl.deleteProgram(programRef.current);
        }
        loseContext(gl);
      }
      glRef.current = null;
      programRef.current = null;
      posBufferRef.current = null;
      colBufferRef.current = null;
      locsRef.current = null;
      // A context lost on purpose stays lost, and the canvas would hand it
      // back. If the effects run again on this instance (StrictMode, a
      // hidden and shown Activity), they mount a fresh canvas instead.
      canvasRef.current = null;
    };
  }, []);

  if (width <= 0 || height <= 0) {
    return null;
  }
  return <g ref={markerRef} />;
}

/**
 * WebGL heatmap. Renders a 2D grid of colored cells using triangles.
 *
 * The rows are categorical: declaring `layout.yBandKey` makes the chart build a
 * shared y band scale over `yKey`, so a left `<ChartAxis>` renders the row
 * labels aligned to each cell (instead of a meaningless linear value axis).
 * Columns use the chart's x band scale.
 *
 * @example
 * ```
 * series={[heatmapGL({
 *   xKey: 'hour', yKey: 'day', valueKey: 'count',
 *   colorRange: ['#f0f9ff', '#1e40af'],
 * })]}
 * ```
 */
export function heatmapGL(options: HeatmapGLOptions): SeriesDef {
  const {xKey, yKey, valueKey, colorRange} = options;
  const cellGap = options.cellGap ?? 1;

  return {
    type: 'heatmapGL',
    key: `heatmap-${valueKey}`,
    // The value drives cell COLOR, not a linear y-domain — no data keys keeps the
    // heatmap out of the shared linear y-scale / left axis / value tooltip.
    // `yBandKey` makes the chart build a categorical y band scale over the rows
    // so the left axis shows the row labels aligned to each cell.
    dataKeys: [],
    layout: {yBandKey: yKey},

    resolve(ctx) {
      // The canvas handles its own cell layout; resolve only exposes row/column
      // centers (for hover) using the shared band scales.
      const {data, xScale, yBandScale} = ctx;
      const points: ResolvedPoint[] = [];
      if (!('bandwidth' in xScale) || !yBandScale) {
        return points;
      }
      const xs = xScale as ScaleBand<string>;
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        const px = (xs(String(d[xKey])) ?? 0) + xs.bandwidth() / 2;
        const py =
          (yBandScale(String(d[yKey])) ?? 0) + yBandScale.bandwidth() / 2;
        points.push({px, py, py0: py, dataIndex: i});
      }
      return points;
    },

    render(_resolved, ctx) {
      // Needs a categorical x (columns) and the shared y band scale (rows).
      if (!('bandwidth' in ctx.xScale) || !ctx.yBandScale) {
        return null;
      }
      return (
        <HeatmapGLCanvas
          data={ctx.data}
          xKey={xKey}
          yKey={yKey}
          valueKey={valueKey}
          xScale={ctx.xScale as ScaleBand<string>}
          yBandScale={ctx.yBandScale}
          colorRange={colorRange}
          domain={options.domain}
          cellGap={cellGap}
          width={ctx.width}
          height={ctx.height}
        />
      );
    },
  };
}
