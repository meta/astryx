// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/dotGL.tsx
 * @output WebGL scatter — canvas overlay, single draw call
 *
 * GL context, program, and vertex buffer are created once and reused across
 * redraws; all are released (and the context eagerly lost) on unmount. Handles
 * context loss/restore and skips non-finite points.
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
  POINT_SIZE_COMPENSATION,
} from '../webgl';

export interface DotGLOptions {
  color: string;
  size?: number;
  opacity?: number;
}

const VERT = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform float u_size;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = u_size * ${POINT_SIZE_COMPENSATION.toFixed(6)};
  }
`;

const FRAG = `
  precision mediump float;
  uniform vec3 u_color;
  uniform float u_opacity;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float edge = 1.0 - smoothstep(0.48, 0.5, dist);
    float a = u_opacity * edge;
    gl_FragColor = vec4(u_color * a, a);
  }
`;

type DotGLLocations = {
  aPosition: number;
  uResolution: WebGLUniformLocation | null;
  uColor: WebGLUniformLocation | null;
  uSize: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
};

/**
 * Inline component returned by render() — owns the WebGL canvas lifecycle. The
 * canvas is mounted as a sibling of the SVG (via a marker <g>) for sharp Retina
 * output without foreignObject blur.
 */
function DotGLCanvas({
  resolved,
  color,
  size,
  opacity,
  width,
  height,
}: {
  resolved: ResolvedPoint[];
  color: string;
  size: number;
  opacity: number;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<DotGLLocations | null>(null);
  const markerRef = useRef<SVGGElement>(null);
  // Bumped on context restore to force the draw effect to rebuild + repaint.
  const [contextEpoch, setContextEpoch] = useState(0);

  const positions = useMemo(() => {
    const out: number[] = [];
    for (const p of resolved) {
      if (Number.isFinite(p.px) && Number.isFinite(p.py)) {
        out.push(p.px, p.py);
      }
    }
    return new Float32Array(out);
  }, [resolved]);

  // Mount the canvas outside the SVG and wire context-loss recovery. The canvas
  // element persists across resizes; only its DOM attachment is re-established.
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
        bufferRef.current = null;
        locsRef.current = null;
      },
      () => setContextEpoch(e => e + 1),
    );
    return () => {
      unregister();
      detach?.();
    };
  }, [width, height]);

  // Draw. The context, program, and buffer are created lazily once and reused;
  // only vertex data + uniforms are re-uploaded per redraw.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }

    const dpr = sizeCanvas(canvas, width, height);

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

    if (!bufferRef.current) {
      bufferRef.current = gl.createBuffer();
    }
    const buffer = bufferRef.current;
    if (!buffer) {
      return;
    }

    if (!locsRef.current) {
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, 'a_position'),
        uResolution: gl.getUniformLocation(program, 'u_resolution'),
        uColor: gl.getUniformLocation(program, 'u_color'),
        uSize: gl.getUniformLocation(program, 'u_size'),
        uOpacity: gl.getUniformLocation(program, 'u_opacity'),
      };
    }
    const locs = locsRef.current;

    gl.viewport(0, 0, canvas.width, canvas.height);
    setupGLState(gl);
    gl.useProgram(program);

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(locs.aPosition);
    gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);

    const [r, g, b] = hexToGL(color);
    gl.uniform2f(locs.uResolution, width, height);
    gl.uniform3f(locs.uColor, r, g, b);
    gl.uniform1f(locs.uSize, size * dpr);
    gl.uniform1f(locs.uOpacity, opacity);

    gl.drawArrays(gl.POINTS, 0, positions.length / 2);
  }, [width, height, color, size, opacity, positions, contextEpoch]);

  // Release all GL resources on unmount.
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (gl) {
        if (bufferRef.current) {
          gl.deleteBuffer(bufferRef.current);
        }
        if (programRef.current) {
          gl.deleteProgram(programRef.current);
        }
        loseContext(gl);
      }
      glRef.current = null;
      programRef.current = null;
      bufferRef.current = null;
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
 * WebGL scatter plot. Canvas mounted outside SVG for sharp Retina rendering.
 *
 * @example
 * ```
 * series={[dotGL('value', {color: '#4f46e5'})]}
 * ```
 */
export function dotGL(dataKey: string, options: DotGLOptions): SeriesDef {
  const {color} = options;
  const size = options.size ?? 6;
  const opacity = options.opacity ?? 0.8;

  return {
    type: 'dotGL',
    key: dataKey,
    dataKeys: [dataKey],
    layout: {},

    resolve(ctx) {
      const {data, xKey, xScale, yScale} = ctx;
      const points: ResolvedPoint[] = [];
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        let px: number;
        if ('bandwidth' in xScale) {
          px =
            ((xScale as ScaleBand<string>)(String(d[xKey])) ?? 0) +
            (xScale as ScaleBand<string>).bandwidth() / 2;
        } else {
          px = xScale(d[xKey] as number);
        }
        const v = typeof d[dataKey] === 'number' ? (d[dataKey] as number) : 0;
        points.push({px, py: yScale(v), py0: yScale(0), dataIndex: i});
      }
      return points;
    },

    render(resolved, ctx) {
      return (
        <DotGLCanvas
          resolved={resolved}
          color={color}
          size={size}
          opacity={opacity}
          width={ctx.width}
          height={ctx.height}
        />
      );
    },
  };
}
