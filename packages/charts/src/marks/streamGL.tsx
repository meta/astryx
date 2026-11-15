// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/streamGL.tsx
 * @output WebGL streaming time-series line — ring buffer, canvas outside SVG
 *
 * Data is pushed imperatively via the returned handle, not from the static dataset.
 * The chart's xScale/yScale map pushed values to pixel coordinates.
 *
 * Draws are coalesced onto a single requestAnimationFrame so a burst of pushes
 * repaints once per frame. The GL context, program, and vertex buffer are made
 * once and reused; all are released (rAF cancelled, context eagerly lost) on
 * unmount. Redraws on resize / scale change and recovers from context loss.
 */

import {
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
  useState,
  type MutableRefObject,
} from 'react';
import type {SeriesDef} from '../types';
import {useChart} from '../ChartContext';
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

export interface StreamGLHandle {
  push(x: number, y: number): void;
  clear(): void;
}

export interface StreamGLOptions {
  color: string;
  bufferSize?: number;
  lineWidth?: number;
  opacity?: number;
  /** Ref to receive the push/clear handle */
  handleRef?: MutableRefObject<StreamGLHandle | null>;
}

const VERT = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  }
`;

const FRAG = `
  precision mediump float;
  uniform vec3 u_color;
  uniform float u_opacity;
  void main() {
    float a = u_opacity;
    gl_FragColor = vec4(u_color * a, a);
  }
`;

type StreamGLLocations = {
  aPosition: number;
  uResolution: WebGLUniformLocation | null;
  uColor: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
};

/**
 * Inline component — manages the ring buffer, canvas, and rAF draw loop.
 */
function StreamGLCanvas({
  color,
  bufferSize,
  lineWidth,
  opacity,
  width,
  height,
  handleRef,
}: {
  color: string;
  bufferSize: number;
  lineWidth: number;
  opacity: number;
  width: number;
  height: number;
  handleRef?: MutableRefObject<StreamGLHandle | null>;
}) {
  const {xScale, yScale} = useChart();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufRef = useRef<WebGLBuffer | null>(null);
  const locsRef = useRef<StreamGLLocations | null>(null);
  const markerRef = useRef<SVGGElement>(null);
  const rafRef = useRef<number | null>(null);
  // Bumped on context restore to force a rebuild + repaint.
  const [contextEpoch, setContextEpoch] = useState(0);

  // Ring buffer + a reusable scratch array for the pixel-space draw data. The
  // capacity is captured on the ring itself so head/count math stays consistent
  // even if the `bufferSize` prop changes (handled by the resize effect below).
  const ringRef = useRef({
    data: new Float32Array(bufferSize * 2),
    head: 0,
    count: 0,
    capacity: bufferSize,
  });
  const scratchRef = useRef<Float32Array>(new Float32Array(bufferSize * 2));

  // Re-allocate the ring if bufferSize changes (rare — resets the stream).
  useEffect(() => {
    const ring = ringRef.current;
    if (ring.capacity !== bufferSize) {
      ring.data = new Float32Array(bufferSize * 2);
      ring.head = 0;
      ring.count = 0;
      ring.capacity = bufferSize;
      scratchRef.current = new Float32Array(bufferSize * 2);
    }
  }, [bufferSize]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }
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

    if (!bufRef.current) {
      bufRef.current = gl.createBuffer();
    }
    const buffer = bufRef.current;
    if (!buffer) {
      return;
    }

    if (!locsRef.current) {
      locsRef.current = {
        aPosition: gl.getAttribLocation(program, 'a_position'),
        uResolution: gl.getUniformLocation(program, 'u_resolution'),
        uColor: gl.getUniformLocation(program, 'u_color'),
        uOpacity: gl.getUniformLocation(program, 'u_opacity'),
      };
    }
    const locs = locsRef.current;

    gl.viewport(0, 0, canvas.width, canvas.height);
    setupGLState(gl);

    const {data: ringData, head, count, capacity} = ringRef.current;
    if (count < 2) {
      // Buffer already cleared above — nothing to stroke yet.
      return;
    }

    const linearX = xScale as (v: number) => number;
    const drawBuf = scratchRef.current;
    for (let i = 0; i < count; i++) {
      const idx = ((head - count + i + capacity) % capacity) * 2;
      drawBuf[i * 2] = linearX(ringData[idx]);
      drawBuf[i * 2 + 1] = yScale(ringData[idx + 1]);
    }

    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      drawBuf.subarray(0, count * 2),
      gl.DYNAMIC_DRAW,
    );
    gl.enableVertexAttribArray(locs.aPosition);
    gl.vertexAttribPointer(locs.aPosition, 2, gl.FLOAT, false, 0, 0);

    const [r, g, b] = hexToGL(color);
    gl.uniform2f(locs.uResolution, width, height);
    gl.uniform3f(locs.uColor, r, g, b);
    gl.uniform1f(locs.uOpacity, opacity);

    gl.lineWidth(lineWidth);
    gl.drawArrays(gl.LINE_STRIP, 0, count);
  }, [width, height, color, lineWidth, opacity, xScale, yScale]);

  // Keep the latest draw reachable from the single coalesced rAF callback, so a
  // frame scheduled before a scale/size change still paints with current state.
  const drawRef = useRef(draw);
  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  // Coalesce redraws onto one rAF so a burst of pushes paints once per frame.
  // Stable identity keeps the imperative push/clear handle from churning.
  const scheduleDraw = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);

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
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        glRef.current = null;
        programRef.current = null;
        bufRef.current = null;
        locsRef.current = null;
      },
      () => setContextEpoch(e => e + 1),
    );
    return () => {
      unregister();
      detach?.();
    };
  }, [width, height]);

  // Size the canvas when the plot area changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) {
      return;
    }
    sizeCanvas(canvas, width, height);
  }, [width, height]);

  // Redraw the retained buffer when scales, size, or the GL context change so a
  // paused stream doesn't leave a stale frame after a resize or window slide.
  useEffect(() => {
    scheduleDraw();
  }, [draw, scheduleDraw, contextEpoch]);

  // Expose push/clear handle via ref.
  useImperativeHandle(
    handleRef as MutableRefObject<StreamGLHandle | null>,
    () => ({
      push(x: number, y: number) {
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          return;
        }
        const ring = ringRef.current;
        const idx = ring.head * 2;
        ring.data[idx] = x;
        ring.data[idx + 1] = y;
        ring.head = (ring.head + 1) % ring.capacity;
        ring.count = Math.min(ring.count + 1, ring.capacity);
        scheduleDraw();
      },
      clear() {
        const ring = ringRef.current;
        ring.head = 0;
        ring.count = 0;
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const gl = glRef.current;
        if (gl && !gl.isContextLost()) {
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
      },
    }),
    [scheduleDraw],
  );

  // Cancel any pending frame and release all GL resources on unmount.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const gl = glRef.current;
      if (gl) {
        if (bufRef.current) {
          gl.deleteBuffer(bufRef.current);
        }
        if (programRef.current) {
          gl.deleteProgram(programRef.current);
        }
        loseContext(gl);
      }
      glRef.current = null;
      programRef.current = null;
      bufRef.current = null;
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
 * WebGL streaming line. Data is pushed imperatively via handleRef,
 * not from the chart's static dataset. Internally uses a ring buffer.
 *
 * @example
 * ```
 * const streamRef = useRef<StreamGLHandle>(null);
 * // Push data points in a rAF loop or event handler:
 * streamRef.current?.push(Date.now(), value);
 *
 * <Chart series={[streamGL({color: '#10b981', handleRef: streamRef})]} />
 * ```
 */
export function streamGL(options: StreamGLOptions): SeriesDef {
  const {color} = options;
  const bufferSize = options.bufferSize ?? 500;
  const lineWidth = options.lineWidth ?? 2;
  const opacity = options.opacity ?? 1;
  const handleRef = options.handleRef;

  return {
    type: 'streamGL',
    key: 'stream',
    dataKeys: [],
    layout: {},

    // Streaming data is pushed, not in the static dataset
    resolve() {
      return [];
    },

    render(_resolved, ctx) {
      return (
        <StreamGLCanvas
          color={color}
          bufferSize={bufferSize}
          lineWidth={lineWidth}
          opacity={opacity}
          width={ctx.width}
          height={ctx.height}
          handleRef={handleRef}
        />
      );
    },
  };
}
