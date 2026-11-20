// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file marks/dotGLInteractive.tsx
 * @output WebGL scatter with GPU color-picking for O(1) nearest-point hover
 *
 * Each point gets a unique color encoding its index. On hover, readPixels
 * from an offscreen framebuffer decodes the hovered index — no JS iteration.
 *
 * Two GL contexts (visible + offscreen pick) plus their programs, buffers,
 * framebuffer, and pick texture are created once and reused. The pick texture
 * is re-allocated only when the drawing-buffer size changes, and everything is
 * released (both contexts eagerly lost) on unmount. Recovers from context loss.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import type {SeriesDef, ResolvedPoint} from '../types';
import type {ScaleBand} from 'd3-scale';
import {
  hexToGL,
  createProgram,
  registerContextLossHandlers,
  loseContext,
} from '../webgl';

export interface DotGLInteractiveOptions {
  color: string;
  size?: number;
  opacity?: number;
  /** Custom tooltip renderer. Receives datum and index. */
  renderTooltip?: (datum: Record<string, unknown>, index: number) => ReactNode;
}

/**
 * Extra radius (CSS px) added to each point in the pick pass only, so hover
 * feels "magnetic" — you don't have to land pixel-perfectly on a small dot.
 * The visible pass is unaffected, so dots still render at their real size.
 */
const HIT_PADDING = 16;

/** Encode a point index as an RGB color (supports up to 16.7M points) */
function indexToColor(i: number): [number, number, number] {
  const id = i + 1;
  return [
    ((id >> 16) & 0xff) / 255,
    ((id >> 8) & 0xff) / 255,
    (id & 0xff) / 255,
  ];
}

/** Decode an RGB pixel back to a point index. Returns -1 for background. */
function colorToIndex(r: number, g: number, b: number): number {
  if (r === 0 && g === 0 && b === 0) {
    return -1;
  }
  return ((r << 16) | (g << 8) | b) - 1;
}

// Visible pass
const VERT_VIS = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform float u_size;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = u_size;
  }
`;

const FRAG_VIS = `
  precision mediump float;
  uniform vec3 u_color;
  uniform float u_opacity;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (dot(coord, coord) > 0.25) discard;
    gl_FragColor = vec4(u_color, u_opacity);
  }
`;

// Pick pass — encode index as color
const VERT_PICK = `
  attribute vec2 a_position;
  attribute vec3 a_pickColor;
  uniform vec2 u_resolution;
  uniform float u_size;
  varying vec3 v_pickColor;
  void main() {
    vec2 clip = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
    gl_PointSize = u_size;
    v_pickColor = a_pickColor;
  }
`;

const FRAG_PICK = `
  precision mediump float;
  varying vec3 v_pickColor;
  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    if (dot(coord, coord) > 0.25) discard;
    gl_FragColor = vec4(v_pickColor, 1.0);
  }
`;

/**
 * Inline component — manages visible + pick canvases and hover state.
 */
function DotGLInteractiveCanvas({
  resolved,
  color,
  size,
  opacity,
  width,
  height,
  data,
  renderTooltip,
}: {
  resolved: ResolvedPoint[];
  color: string;
  size: number;
  opacity: number;
  width: number;
  height: number;
  data: Record<string, unknown>[];
  renderTooltip?: (datum: Record<string, unknown>, index: number) => ReactNode;
}) {
  const visHostRef = useRef<HTMLDivElement>(null);
  const pickHostRef = useRef<HTMLDivElement>(null);
  const visCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pickCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number>(-1);
  const [mousePos, setMousePos] = useState<{x: number; y: number} | null>(null);
  // Bumped on context restore to force the render effect to rebuild + repaint.
  const [contextEpoch, setContextEpoch] = useState(0);

  const visGLRef = useRef<{
    gl: WebGLRenderingContext;
    prog: WebGLProgram;
  } | null>(null);
  const visBufRef = useRef<WebGLBuffer | null>(null);
  const pickGLRef = useRef<{
    gl: WebGLRenderingContext;
    prog: WebGLProgram;
    fb: WebGLFramebuffer;
    tex: WebGLTexture;
    // Drawing-buffer size the pick texture is currently allocated for, and the
    // DPR it was built with — used to avoid needless re-allocation and to keep
    // hover pixel math consistent with the framebuffer.
    texW: number;
    texH: number;
    dpr: number;
  } | null>(null);
  const pickPosBufRef = useRef<WebGLBuffer | null>(null);
  const pickColBufRef = useRef<WebGLBuffer | null>(null);

  // Positions and pick colors are index-aligned with `resolved` (and thus with
  // `data`); do NOT drop entries here or hover decode would map to wrong rows.
  // Non-finite points get NaN clip positions and simply don't rasterize.
  const positions = useMemo(() => {
    const pos = new Float32Array(resolved.length * 2);
    for (let i = 0; i < resolved.length; i++) {
      pos[i * 2] = resolved[i].px;
      pos[i * 2 + 1] = resolved[i].py;
    }
    return pos;
  }, [resolved]);

  const pickColors = useMemo(() => {
    const colors = new Float32Array(resolved.length * 3);
    for (let i = 0; i < resolved.length; i++) {
      const [r, g, b] = indexToColor(i);
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }
    return colors;
  }, [resolved.length]);

  // Create both canvases in their hosts and wire context-loss recovery. The
  // canvases belong to this effect, not to React's tree. A context lost on
  // purpose stays lost, so when React runs the effects again on this instance
  // (StrictMode, a hidden and shown Activity), they start on fresh canvases.
  useEffect(() => {
    const visHost = visHostRef.current;
    const pickHost = pickHostRef.current;
    if (!visHost || !pickHost) {
      return;
    }
    const visCanvas = document.createElement('canvas');
    visCanvas.style.display = 'block';
    visCanvas.style.width = '100%';
    visCanvas.style.height = '100%';
    visCanvas.style.pointerEvents = 'none';
    const pickCanvas = document.createElement('canvas');
    pickCanvas.style.display = 'none';
    visHost.append(visCanvas);
    pickHost.append(pickCanvas);
    visCanvasRef.current = visCanvas;
    pickCanvasRef.current = pickCanvas;
    const unregisterVis = registerContextLossHandlers(
      visCanvas,
      () => {
        visGLRef.current = null;
        visBufRef.current = null;
      },
      () => setContextEpoch(e => e + 1),
    );
    const unregisterPick = registerContextLossHandlers(
      pickCanvas,
      () => {
        pickGLRef.current = null;
        pickPosBufRef.current = null;
        pickColBufRef.current = null;
      },
      () => setContextEpoch(e => e + 1),
    );
    return () => {
      unregisterVis();
      unregisterPick();
      visCanvas.remove();
      pickCanvas.remove();
      visCanvasRef.current = null;
      pickCanvasRef.current = null;
    };
  }, []);

  // Render both passes. Contexts, programs, buffers, framebuffer, and pick
  // texture are created once and reused; only vertex data + uniforms upload per
  // run, and the pick texture re-allocates only when the buffer size changes.
  useEffect(() => {
    if (width <= 0 || height <= 0) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const bufW = Math.max(1, Math.round(width * dpr));
    const bufH = Math.max(1, Math.round(height * dpr));

    // ── Visible pass ──
    const visCanvas = visCanvasRef.current;
    if (visCanvas) {
      if (visCanvas.width !== bufW) {
        visCanvas.width = bufW;
      }
      if (visCanvas.height !== bufH) {
        visCanvas.height = bufH;
      }

      if (!visGLRef.current) {
        const gl = visCanvas.getContext('webgl', {
          alpha: true,
          premultipliedAlpha: false,
          antialias: true,
        });
        const prog = gl ? createProgram(gl, VERT_VIS, FRAG_VIS) : null;
        if (gl && prog) {
          visGLRef.current = {gl, prog};
          visBufRef.current = null;
        }
      }

      const vis = visGLRef.current;
      if (vis && !vis.gl.isContextLost()) {
        const {gl, prog} = vis;
        if (!visBufRef.current) {
          visBufRef.current = gl.createBuffer();
        }
        const buf = visBufRef.current;
        if (buf) {
          gl.viewport(0, 0, visCanvas.width, visCanvas.height);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(prog);

          gl.bindBuffer(gl.ARRAY_BUFFER, buf);
          gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
          const aPos = gl.getAttribLocation(prog, 'a_position');
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          const [r, g, b] = hexToGL(color);
          gl.uniform2f(
            gl.getUniformLocation(prog, 'u_resolution'),
            width,
            height,
          );
          gl.uniform3f(gl.getUniformLocation(prog, 'u_color'), r, g, b);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_size'), size * dpr);
          gl.uniform1f(gl.getUniformLocation(prog, 'u_opacity'), opacity);

          gl.drawArrays(gl.POINTS, 0, positions.length / 2);
        }
      }
    }

    // ── Pick pass (offscreen framebuffer) ──
    const pickCanvas = pickCanvasRef.current;
    if (pickCanvas) {
      if (pickCanvas.width !== bufW) {
        pickCanvas.width = bufW;
      }
      if (pickCanvas.height !== bufH) {
        pickCanvas.height = bufH;
      }

      if (!pickGLRef.current) {
        const gl = pickCanvas.getContext('webgl', {
          alpha: false,
          premultipliedAlpha: false,
          antialias: false,
          preserveDrawingBuffer: true,
        });
        if (gl) {
          const prog = createProgram(gl, VERT_PICK, FRAG_PICK);
          const fb = gl.createFramebuffer();
          const tex = gl.createTexture();
          if (prog && fb && tex) {
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
            gl.framebufferTexture2D(
              gl.FRAMEBUFFER,
              gl.COLOR_ATTACHMENT0,
              gl.TEXTURE_2D,
              tex,
              0,
            );
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            pickGLRef.current = {gl, prog, fb, tex, texW: 0, texH: 0, dpr};
            pickPosBufRef.current = null;
            pickColBufRef.current = null;
          }
        }
      }

      const pick = pickGLRef.current;
      if (pick && !pick.gl.isContextLost()) {
        const {gl, prog, fb, tex} = pick;
        pick.dpr = dpr;

        // (Re)allocate the pick texture only when the buffer size changes.
        if (pick.texW !== pickCanvas.width || pick.texH !== pickCanvas.height) {
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            pickCanvas.width,
            pickCanvas.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
          );
          pick.texW = pickCanvas.width;
          pick.texH = pickCanvas.height;
        }

        if (!pickPosBufRef.current) {
          pickPosBufRef.current = gl.createBuffer();
        }
        if (!pickColBufRef.current) {
          pickColBufRef.current = gl.createBuffer();
        }
        const posBuf = pickPosBufRef.current;
        const colBuf = pickColBufRef.current;

        if (posBuf && colBuf) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
          gl.viewport(0, 0, pickCanvas.width, pickCanvas.height);
          gl.clearColor(0, 0, 0, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.disable(gl.BLEND);
          gl.useProgram(prog);

          gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
          gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
          const aPos = gl.getAttribLocation(prog, 'a_position');
          gl.enableVertexAttribArray(aPos);
          gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

          gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
          gl.bufferData(gl.ARRAY_BUFFER, pickColors, gl.STATIC_DRAW);
          const aCol = gl.getAttribLocation(prog, 'a_pickColor');
          gl.enableVertexAttribArray(aCol);
          gl.vertexAttribPointer(aCol, 3, gl.FLOAT, false, 0, 0);

          gl.uniform2f(
            gl.getUniformLocation(prog, 'u_resolution'),
            width,
            height,
          );
          gl.uniform1f(
            gl.getUniformLocation(prog, 'u_size'),
            (size + HIT_PADDING) * dpr,
          );

          gl.drawArrays(gl.POINTS, 0, positions.length / 2);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      }
    }
  }, [
    width,
    height,
    positions,
    pickColors,
    color,
    size,
    opacity,
    contextEpoch,
  ]);

  // Release both GL contexts and all their resources on unmount.
  useEffect(() => {
    return () => {
      const vis = visGLRef.current;
      if (vis) {
        const {gl, prog} = vis;
        if (visBufRef.current) {
          gl.deleteBuffer(visBufRef.current);
        }
        gl.deleteProgram(prog);
        loseContext(gl);
      }
      const pick = pickGLRef.current;
      if (pick) {
        const {gl, prog, fb, tex} = pick;
        if (pickPosBufRef.current) {
          gl.deleteBuffer(pickPosBufRef.current);
        }
        if (pickColBufRef.current) {
          gl.deleteBuffer(pickColBufRef.current);
        }
        gl.deleteFramebuffer(fb);
        gl.deleteTexture(tex);
        gl.deleteProgram(prog);
        loseContext(gl);
      }
      visGLRef.current = null;
      visBufRef.current = null;
      pickGLRef.current = null;
      pickPosBufRef.current = null;
      pickColBufRef.current = null;
    };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const pick = pickGLRef.current;
    if (!pick || pick.gl.isContextLost()) {
      return;
    }

    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) {
      return;
    }
    const ctm = e.currentTarget.getScreenCTM();
    if (!ctm) {
      return;
    }
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());

    // Use the DPR the pick framebuffer was built with so pixel math stays in
    // sync even if devicePixelRatio changed since the last render.
    const {gl, fb, dpr, texW, texH} = pick;
    const px = Math.floor(local.x * dpr);
    const py = Math.floor(local.y * dpr);
    if (px < 0 || py < 0 || px >= texW || py >= texH) {
      setHoverIndex(-1);
      setMousePos(null);
      return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const pixel = new Uint8Array(4);
    // Flip Y from top-origin CSS space to the framebuffer's bottom-left,
    // 0-indexed origin. `texH - 1 - py` (not `texH - py`) keeps the read in
    // [0, texH-1] — the bare `texH - py` reads one row too high and samples
    // out of bounds at the very top edge.
    gl.readPixels(px, texH - 1 - py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const idx = colorToIndex(pixel[0], pixel[1], pixel[2]);
    setHoverIndex(idx);
    setMousePos(idx >= 0 ? {x: local.x, y: local.y} : null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(-1);
    setMousePos(null);
  }, []);

  const datum =
    hoverIndex >= 0 && hoverIndex < data.length ? data[hoverIndex] : null;

  const defaultTooltip = (d: Record<string, unknown>, i: number) => (
    <div
      style={{display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12}}>
      <div style={{fontWeight: 600, color: 'var(--color-text-primary)'}}>
        Point {i}
      </div>
      {Object.entries(d).map(([k, v]) => (
        <div key={k}>
          <span style={{color: 'var(--color-text-secondary)'}}>{k}:</span>{' '}
          <span style={{fontWeight: 500}}>{String(v)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <g>
      <foreignObject
        x={0}
        y={0}
        width={width}
        height={height}
        style={{overflow: 'hidden'}}>
        <div ref={visHostRef} style={{width, height}} />
      </foreignObject>

      <foreignObject
        x={0}
        y={0}
        width={0}
        height={0}
        style={{overflow: 'hidden'}}>
        <div ref={pickHostRef} />
      </foreignObject>

      <rect
        x={0}
        y={0}
        width={width}
        height={height}
        fill="transparent"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />

      {datum && hoverIndex >= 0 && (
        <g pointerEvents="none">
          {/* Soft outer halo — reads on top of neighbouring points. */}
          <circle
            cx={positions[hoverIndex * 2]}
            cy={positions[hoverIndex * 2 + 1]}
            r={size / 2 + 7}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeOpacity={0.35}
          />
          {/* Solid marker with a white outline — unmistakable "you're on this
              point" affordance that stays visible on any background. */}
          <circle
            cx={positions[hoverIndex * 2]}
            cy={positions[hoverIndex * 2 + 1]}
            r={size / 2 + 2.5}
            fill={color}
            stroke="var(--color-background-body, #fff)"
            strokeWidth={2}
          />
        </g>
      )}

      {datum && mousePos && (
        <foreignObject
          x={mousePos.x + 12}
          y={Math.max(0, mousePos.y - 40)}
          width={200}
          height={120}
          pointerEvents="none"
          style={{overflow: 'visible'}}>
          <div
            style={{
              background: 'var(--color-background-popover)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              padding: '8px 12px',
              boxShadow: 'var(--shadow-med)',
              whiteSpace: 'nowrap',
              width: 'fit-content',
            }}>
            {renderTooltip
              ? renderTooltip(datum, hoverIndex)
              : defaultTooltip(datum, hoverIndex)}
          </div>
        </foreignObject>
      )}
    </g>
  );
}

/**
 * WebGL scatter with GPU color-picking hover. O(1) hit detection via offscreen
 * framebuffer — no JS iteration regardless of point count.
 *
 * @example
 * ```
 * series={[dotGLInteractive('value', {
 *   color: '#4f46e5',
 *   renderTooltip: (d, i) => <span>{d.name}: {d.value}</span>,
 * })]}
 * ```
 */
export function dotGLInteractive(
  dataKey: string,
  options: DotGLInteractiveOptions,
): SeriesDef {
  const {color} = options;
  const size = options.size ?? 6;
  const opacity = options.opacity ?? 0.8;
  const renderTooltip = options.renderTooltip;

  return {
    type: 'dotGLInteractive',
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
        <DotGLInteractiveCanvas
          resolved={resolved}
          color={color}
          size={size}
          opacity={opacity}
          width={ctx.width}
          height={ctx.height}
          data={ctx.data}
          renderTooltip={renderTooltip}
        />
      );
    },
  };
}
