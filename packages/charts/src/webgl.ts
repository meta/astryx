// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file webgl.ts
 * @output Shared WebGL utilities for chart components
 * @position Internal helpers; consumed by all GL mark components
 *
 * Provides:
 * - Canvas mounting outside SVG (avoids foreignObject DPR blur)
 * - Premultiplied alpha setup (correct compositing over page)
 * - Shader compilation helpers
 * - Smoothstep circle fragment for crisp point sprites
 * - Hex-to-GL color conversion via the shared @astryxdesign/core/utils/color
 *   parsers (fallback instead of NaN)
 * - Context-loss registration + eager context teardown helpers
 */

import {parseHex, toGLFloats} from '@astryxdesign/core/utils';

/** Compile a WebGL shader, returns null on failure */
export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  src: string,
): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) {
    return null;
  }
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

/** Link a vertex + fragment shader into a program */
export function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) {
    // One shader may have compiled while the other failed — free the survivor
    // so the failure path never leaks a shader object.
    if (vs) {
      gl.deleteShader(vs);
    }
    if (fs) {
      gl.deleteShader(fs);
    }
    return null;
  }
  const p = gl.createProgram();
  if (!p) {
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return null;
  }
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  // The shaders are now linked into the program; flag them for deletion so the
  // GPU frees them once the program is deleted instead of leaving them attached
  // (and allocated) for the program's whole lifetime.
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    gl.deleteProgram(p);
    return null;
  }
  return p;
}

/**
 * Parse a hex color to [r, g, b] floats in 0-1.
 *
 * Accepts `#rgb`, `#rgba`, `#rrggbb`, and `#rrggbbaa`, with or without the
 * leading `#` (any alpha byte is ignored). Non-hex input — CSS custom
 * properties, `rgb()`, named colors, or malformed strings — returns a neutral
 * fallback rather than producing NaN, so the GPU never receives a bad uniform.
 */
export function hexToGL(hex: string): [number, number, number] {
  return toGLFloats(parseHex(hex));
}

/** DPR with 2x supersampling for crisp circles. SSR-safe (falls back to 2). */
export function getCanvasDPR(): number {
  const base = typeof window !== 'undefined' ? window.devicePixelRatio : 0;
  return (base || 2) * 2;
}

/**
 * Create or get a WebGL context with correct alpha settings.
 * Uses premultiplied alpha for correct compositing over the page.
 */
export function getWebGLContext(
  canvas: HTMLCanvasElement,
): WebGLRenderingContext | null {
  return canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
  });
}

/**
 * Set up standard GL state for chart rendering:
 * - Clear with transparent
 * - Enable premultiplied alpha blending
 */
export function setupGLState(gl: WebGLRenderingContext): void {
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

/**
 * Size a canvas for sharp rendering, accounting for DPR.
 * Returns the DPR used.
 */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): number {
  const dpr = getCanvasDPR();
  // The drawing buffer must be a positive integer — a 0-sized (or fractional)
  // buffer makes GL viewport/draw calls silently fail.
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${Math.max(0, width)}px`;
  canvas.style.height = `${Math.max(0, height)}px`;
  return dpr;
}

/**
 * Mount a canvas as an absolute-positioned sibling to an SVG element.
 * Automatically aligns with the SVG marker's position — no manual margin
 * offset needed. This is a Tier 1 guarantee: the canvas lands exactly
 * where the SVG content area is, regardless of chart margins or transforms.
 *
 * Call from a useEffect. Returns a cleanup function.
 */
export function mountCanvasOverSVG(
  svgMarker: SVGGraphicsElement,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): (() => void) | undefined {
  const svg = svgMarker.ownerSVGElement;
  if (!svg) {
    return;
  }
  const parent = svg.parentElement;
  if (!parent) {
    return;
  }

  if (getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }

  canvas.style.position = 'absolute';
  canvas.style.pointerEvents = 'none';

  // Compute offset from the SVG marker's actual screen position.
  // The marker sits inside the chart's <g transform="translate(margin)">
  // so its bounding rect includes the margin offset automatically.
  // This is a Tier 1 guarantee — we derive position from the SVG, not from props.
  const parentRect = parent.getBoundingClientRect();
  const markerCTM = svgMarker.getScreenCTM();
  if (markerCTM) {
    canvas.style.left = `${markerCTM.e - parentRect.left}px`;
    canvas.style.top = `${markerCTM.f - parentRect.top}px`;
  } else {
    canvas.style.left = '0';
    canvas.style.top = '0';
  }
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  parent.appendChild(canvas);

  return () => {
    if (canvas.parentElement === parent) {
      parent.removeChild(canvas);
    }
  };
}

/**
 * Register WebGL context-loss/restore handlers on a canvas.
 *
 * Calling `preventDefault()` on the lost event is REQUIRED — without it the
 * browser will never fire `webglcontextrestored`. `onLost` should drop any
 * cached GL handles (they are all invalid after loss); `onRestored` should
 * trigger a rebuild + redraw.
 *
 * Returns a cleanup that removes both listeners.
 */
export function registerContextLossHandlers(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const handleLost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost, false);
    canvas.removeEventListener('webglcontextrestored', onRestored, false);
  };
}

/**
 * Eagerly release a WebGL context and its GPU resources on teardown.
 *
 * Browsers cap the number of live contexts (~16), so freeing on unmount rather
 * than waiting for GC prevents "too many active WebGL contexts" failures when
 * many charts mount/unmount over a session.
 */
export function loseContext(gl: WebGLRenderingContext): void {
  const ext = gl.getExtension('WEBGL_lose_context');
  if (ext) {
    ext.loseContext();
  }
}

/**
 * GLSL fragment for premultiplied-alpha circle with smoothstep AA.
 * Use in fragment shaders that render point sprites.
 *
 * Expects:
 * - varying float v_alpha (the final alpha before edge AA)
 * - uniform vec3 u_color
 *
 * Returns: gl_FragColor with premultiplied alpha
 */
export const CIRCLE_FRAG_BODY = `
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);
    if (dist > 0.5) discard;
    float edge = 1.0 - smoothstep(0.48, 0.5, dist);
    float a = v_alpha * edge;
    gl_FragColor = vec4(u_color * a, a);
`;

/**
 * Smoothstep compensation factor for gl_PointSize.
 * The visible circle radius is 0.48 of the point sprite (smoothstep starts there),
 * so we scale up by 1/0.96 to match SVG circle radius exactly.
 */
export const POINT_SIZE_COMPENSATION = 1.0 / 0.96;
