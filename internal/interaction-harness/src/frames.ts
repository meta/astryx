// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.ts
 * @input Uses a Playwright `Page`, a `Locator` for the element under test, and
 *   the engine's screencast (Chromium CDP `Page.startScreencast`; WebKit's
 *   `Screencast` domain)
 * @output `startScreencast` (timestamped composited frames), `markElement`
 *   (a marker outline the frames can find) and `trackMarker` (per-frame
 *   marker box and the cast's position step). `trackMarkers` tracks several
 *   colors from one decode of each frame. Also `colorBlockPx` (a frame's color
 *   resolution), `sampleRects` (per-rAF rect sampling) and `frameStats`.
 *   `requireFrames` gives a proof its frames, or fails it by name when the
 *   page drew too few.
 * @position Frame evidence for motion proofs. The screencast is captured off
 *   the page's main thread, from what the compositor presents, so it keeps
 *   delivering frames while a script blocks the main thread: that is what makes
 *   the busy-main-thread proof possible. Rect sampling is the cheap path when
 *   the main thread is free.
 *
 * Marker tracking needs no image library: frames are decoded and scanned in a
 * scratch page of the same browser (createImageBitmap + canvas), so the
 * harness adds no dependency.
 * With `subpixel`, the read places the marker under a pixel, from its
 * anti-aliased edges (Chromium's PNG cast).
 *
 * SYNC: Keep the README's frame-evidence section equal to what this measures.
 */

import type {CDPSession, Locator, Page} from '@playwright/test';
import {webkitPageSession} from './touch';

export interface CastFrame {
  /** Presentation time, epoch ms (the compositor's frame timestamp). */
  readonly t: number;
  /** Base64 PNG/JPEG. */
  readonly data: string;
  readonly format: 'png' | 'jpeg';
  /** CSS px of the viewport the frame shows. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface Screencast {
  /**
   * Frames captured so far: wait for the first one to know the cast saw the
   * page before an animation starts (`busyWindowProof` then knows its at-rest
   * position).
   */
  frameCount(): number;
  /** Stops and returns every frame captured, in order. */
  stop(): Promise<CastFrame[]>;
}

export interface ScreencastOptions {
  /** Lossless frames by default: marker colours survive PNG, not JPEG. */
  readonly format?: 'png' | 'jpeg';
  readonly quality?: number;
  /**
   * Keep one presented frame in this many (default 1, every frame): a slower
   * evidence channel, like a loaded machine's screencast, for proving that a
   * verdict does not depend on the screencast's rate.
   */
  readonly everyNthFrame?: number;
}

/**
 * Starts capturing composited frames. Chromium delivers one per presented
 * frame (16.7 ms at 60 Hz), timestamped by the compositor; WebKit's own
 * screencast delivers one per composited update (about every 14 ms in the
 * Linux build), stamped on CLOCK_MONOTONIC and rebased here onto the wall
 * clock by that clock's measured offset, so both engines share the page's
 * timeline. Both keep delivering while the page's main thread is blocked, and
 * neither sends a frame when nothing on screen changed.
 */
export async function startScreencast(
  page: Page,
  options: ScreencastOptions = {},
): Promise<Screencast> {
  const name = page.context().browser()?.browserType().name();
  const viewport = page.viewportSize() ?? {width: 0, height: 0};
  if (name === 'chromium') {
    return chromiumScreencast(page, viewport, options);
  }
  if (name === 'webkit') {
    return webkitScreencast(page, viewport, options);
  }
  throw new Error(
    `startScreencast: unsupported browser ${name ?? '(unknown)'}`,
  );
}

async function chromiumScreencast(
  page: Page,
  viewport: {width: number; height: number},
  {format = 'png', quality = 90, everyNthFrame = 1}: ScreencastOptions,
): Promise<Screencast> {
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const frames: CastFrame[] = [];
  const onFrame = (frame: {
    data: string;
    sessionId: number;
    metadata: {timestamp?: number; deviceWidth: number; deviceHeight: number};
  }) => {
    frames.push({
      t: (frame.metadata.timestamp ?? Date.now() / 1000) * 1000,
      data: frame.data,
      format,
      viewportWidth: frame.metadata.deviceWidth || viewport.width,
      viewportHeight: frame.metadata.deviceHeight || viewport.height,
    });
    cdp
      .send('Page.screencastFrameAck', {sessionId: frame.sessionId})
      .catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  // One CSS px per frame px keeps decoding cheap; everyNthFrame 1 = every presented frame.
  await cdp.send('Page.startScreencast', {
    format,
    quality,
    maxWidth: viewport.width,
    maxHeight: viewport.height,
    everyNthFrame,
  });
  return {
    frameCount: () => frames.length,
    async stop() {
      await cdp.send('Page.stopScreencast');
      cdp.off('Page.screencastFrame', onFrame);
      await cdp.detach().catch(() => {});
      return inPresentationOrder(frames);
    },
  };
}

async function webkitScreencast(
  page: Page,
  viewport: {width: number; height: number},
  {quality = 90, everyNthFrame = 1}: ScreencastOptions,
): Promise<Screencast> {
  const session = webkitPageSession(page);
  const frames: CastFrame[] = [];
  let generation = 0;
  let delivered = 0;
  const onFrame = (payload: unknown) => {
    const frame = payload as {data: string; timestamp: number};
    // WebKit's screencast has no everyNthFrame: keep one frame in N here.
    delivered += 1;
    if ((delivered - 1) % everyNthFrame !== 0) {
      session
        .send('Screencast.screencastFrameAck', {generation})
        .catch(() => {});
      return;
    }
    frames.push({
      // WebKit stamps frames in seconds on the monotonic clock; rebased below.
      t: frame.timestamp * 1000,
      data: frame.data,
      format: 'jpeg',
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    });
    session.send('Screencast.screencastFrameAck', {generation}).catch(() => {});
  };
  session.on('Screencast.screencastFrame', onFrame);
  const started = (await session.send('Screencast.startScreencast', {
    width: viewport.width,
    height: viewport.height,
    toolbarHeight: 0,
    quality,
  })) as {generation: number};
  generation = started.generation;
  // WebKit stamps frames in seconds on CLOCK_MONOTONIC, which this process
  // shares: rebase them by the wall clock's offset from that clock, sampled
  // together. (Taking the first frame as the start shifted every frame earlier
  // by however long that frame took to come, 60–100 ms on a busy page.)
  const wallMinusMonotonic = Date.now() - Number(process.hrtime.bigint()) / 1e6;
  return {
    frameCount: () => frames.length,
    async stop() {
      await session.send('Screencast.stopScreencast');
      session.off?.('Screencast.screencastFrame', onFrame);
      if (frames.length === 0) {
        return frames;
      }
      return inPresentationOrder(frames).map(f => ({
        ...f,
        t: f.t + wallMinusMonotonic,
      }));
    },
  };
}

/**
 * Frames sorted by their presentation timestamp. A loaded machine can deliver
 * screencast frames out of order (a frame stamped 35 ms arriving after one
 * stamped 46 ms); judged in arrival order, a steadily moving element would
 * appear to step backwards.
 */
export function inPresentationOrder<T extends {readonly t: number}>(
  frames: readonly T[],
): T[] {
  return [...frames].sort((a, b) => a.t - b.t);
}

/** The marker colour: magenta never occurs in Astryx themes. */
export const MARKER_RGB: readonly [number, number, number] = [255, 0, 255];

export interface MarkerOptions {
  readonly rgb?: readonly [number, number, number];
  /**
   * `chip` (default): a small square child pinned inside the element's
   * top-left corner, above every sibling (z-index max), so nothing the
   * component paints can cover it. The element must be its containing block:
   * a static element is made `position: relative` while marked.
   * `outline`: an inset outline on the element itself (no DOM insertion), for
   * elements that cannot take a child; children with their own layers can
   * cover parts of it.
   */
  readonly mode?: 'chip' | 'outline';
  /** Chip size or outline width, CSS px. */
  readonly size?: number;
  /** Chip inset from the element's top-left corner, CSS px. */
  readonly inset?: number;
}

/**
 * Marks the element so screencast frames can find it: the mark moves, scales
 * and fades with the element's own layer and never changes its layout.
 * Returns an undo.
 */
export async function markElement(
  locator: Locator,
  options: MarkerOptions = {},
): Promise<() => Promise<void>> {
  const {
    rgb = MARKER_RGB,
    mode = 'chip',
    size = mode === 'chip' ? 16 : 6,
    inset = 8,
  } = options;
  const id = `m${Math.random().toString(36).slice(2, 8)}`;
  await locator.evaluate(
    (element, {id: markerId, color, size: px, inset: offset, mode: kind}) => {
      const el = element as HTMLElement;
      el.setAttribute('data-harness-marker', markerId);
      if (kind === 'outline') {
        const style = document.createElement('style');
        style.setAttribute('data-harness-marker-style', markerId);
        style.textContent = `[data-harness-marker="${markerId}"]{outline:${px}px solid rgb(${color.join(',')}) !important;outline-offset:-${px}px !important;}`;
        document.head.append(style);
        return;
      }
      if (getComputedStyle(el).position === 'static') {
        el.setAttribute('data-harness-marker-position', el.style.position);
        el.style.position = 'relative';
      }
      const chip = document.createElement('div');
      chip.setAttribute('data-harness-marker-chip', markerId);
      chip.setAttribute('aria-hidden', 'true');
      chip.style.cssText = `position:absolute;top:${offset}px;left:${offset}px;width:${px}px;height:${px}px;background:rgb(${color.join(',')});z-index:2147483647;pointer-events:none;`;
      el.append(chip);
    },
    {id, color: [...rgb], size, inset, mode},
  );
  return async () => {
    await locator.page().evaluate(markerId => {
      const el = document.querySelector<HTMLElement>(
        `[data-harness-marker="${markerId}"]`,
      );
      if (el?.hasAttribute('data-harness-marker-position')) {
        el.style.position =
          el.getAttribute('data-harness-marker-position') ?? '';
        el.removeAttribute('data-harness-marker-position');
      }
      el?.removeAttribute('data-harness-marker');
      document
        .querySelector(`[data-harness-marker-chip="${markerId}"]`)
        ?.remove();
      document
        .querySelector(`[data-harness-marker-style="${markerId}"]`)
        ?.remove();
    }, id);
  };
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TrackedFrame {
  /** Epoch ms. */
  readonly t: number;
  /** The marker's bounding box in CSS px, or null when it is not on screen. */
  readonly box: Box | null;
  /** Marker pixels found (a fading element finds fewer at the same tolerance). */
  readonly pixels: number;
  /**
   * The cast's position step at this frame, CSS px per axis: one block of
   * the frame's color resolution (`colorBlockPx`) over the bitmap's scale to
   * the viewport. `trackMarker` sets it only for the default marker
   * (`MARKER_RGB`), whose edges were measured on these blocks: 2 px in
   * WebKit's JPEG cast, whose 4:2:0 chroma holds color in 2 by 2 pixel
   * blocks, and 1 px in Chromium's PNG cast, both at the viewport's size.
   * Another color carries none: a cyan control in the same WebKit frames
   * moves by odd px. A sub-pixel read (`subpixel`) carries its own step,
   * `SUBPIXEL_STEP_PX`, whatever the color.
   */
  readonly step?: {readonly x: number; readonly y: number};
}

/**
 * The step of a sub-pixel marker read, CSS px. On Chromium's PNG cast, a
 * layer that a transform puts between pixels shows anti-aliased edges. The
 * read places the marker from them. A 10 px slide over 60 frames read 0.164
 * to 0.169 px a frame, where it moves 0.167 px. Identical frames read
 * identical positions. The step sits well above that spread.
 */
export const SUBPIXEL_STEP_PX = 0.05;

/**
 * The bitmap pixels per block of a cast frame's color resolution, per axis:
 * 1 for a PNG; for a JPEG, its chroma subsampling, read from the frame header
 * (4:2:0 holds color in 2 by 2 blocks, 4:2:2 in 2 by 1, 4:4:4 in 1 by 1).
 */
export function colorBlockPx(
  data: string,
  format: 'png' | 'jpeg',
): {x: number; y: number} {
  if (format === 'png') {
    return {x: 1, y: 1};
  }
  const bytes = Buffer.from(data, 'base64');
  // Segments follow the start-of-image marker, each FF, a marker byte and a
  // big-endian length that counts itself, up to a frame header (SOF0-SOF15,
  // which leave out C4, C8 and CC).
  let i = 2;
  while (i + 4 <= bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      const count = bytes[i + 9];
      const factors = Array.from(
        {length: count},
        (_, k) => bytes[i + 11 + 3 * k],
      );
      const horizontal = factors.map(f => f >> 4);
      const vertical = factors.map(f => f & 15);
      // The most subsampled component sets the color's resolution.
      return {
        x: Math.max(...horizontal) / Math.min(...horizontal),
        y: Math.max(...vertical) / Math.min(...vertical),
      };
    }
    i += 2 + bytes.readUInt16BE(i + 2);
  }
  throw new Error('colorBlockPx: the JPEG has no frame header (SOF)');
}

/**
 * Finds the marker in every frame. Decoding runs in a scratch page of the same
 * browser, so neither the page under test nor Node needs an image decoder.
 * With `region` (CSS px), only that part of each frame is searched. On a
 * loaded machine, a search of every pixel can take longer than the test.
 *
 * With `subpixel`, the box comes from the marker's anti-aliased edges, not
 * its whole pixels. Each pixel near the marker counts by its color's share of
 * the way from the background to the marker's color. The box sits on the
 * centroid of those weights. The background is read from a ring 2 px outside
 * the marker, so the marker must be opaque on a plain background. Use the
 * default chip marker: an outline marker's window holds the element's own
 * content. Only a PNG cast keeps those edges: a JPEG frame throws.
 */
export async function trackMarker(
  page: Page,
  frames: readonly CastFrame[],
  {
    rgb = MARKER_RGB,
    tolerance = 40,
    region,
    subpixel = false,
  }: {
    rgb?: readonly [number, number, number];
    tolerance?: number;
    region?: Box;
    subpixel?: boolean;
  } = {},
): Promise<TrackedFrame[]> {
  const [tracked] = await trackMarkers(page, frames, {
    colors: [rgb],
    tolerance,
    region,
    subpixel,
  });
  return tracked;
}

/**
 * `trackMarker` for several colors at once. Each frame is decoded once and
 * searched for every color, so a proof that tracks a marker and a control
 * decodes each frame once. Returns one track per color, in order.
 */
export async function trackMarkers(
  page: Page,
  frames: readonly CastFrame[],
  {
    colors,
    tolerance = 40,
    region,
    subpixel = false,
  }: {
    colors: readonly (readonly [number, number, number])[];
    tolerance?: number;
    region?: Box;
    subpixel?: boolean;
  },
): Promise<TrackedFrame[][]> {
  if (subpixel && frames.some(f => f.format !== 'png')) {
    throw new Error(
      "trackMarkers: subpixel needs a PNG cast; a JPEG frame's chroma blocks hide the marker's edges",
    );
  }
  const isDefaultMarker = colors.map(rgb =>
    rgb.every((value, i) => value === MARKER_RGB[i]),
  );
  const scratch = await page.context().newPage();
  try {
    const out: TrackedFrame[][] = colors.map(() => []);
    // Batches keep each evaluate payload moderate.
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const results = await scratch.evaluate(
        async ({batch: items, palette, tol, area, sub}) => {
          const found: {
            boxes: ({
              x: number;
              y: number;
              width: number;
              height: number;
            } | null)[];
            pixels: number[];
            scale: number;
          }[] = [];
          for (const item of items) {
            const blob = await (
              await fetch(`data:image/${item.format};base64,${item.data}`)
            ).blob();
            const bitmap = await createImageBitmap(blob);
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const scale = bitmap.width / item.viewportWidth;
            const left = area == null ? 0 : Math.floor(area.x * scale);
            const top = area == null ? 0 : Math.floor(area.y * scale);
            const right =
              area == null
                ? bitmap.width
                : Math.min(
                    bitmap.width,
                    Math.ceil((area.x + area.width) * scale),
                  );
            const bottom =
              area == null
                ? bitmap.height
                : Math.min(
                    bitmap.height,
                    Math.ceil((area.y + area.height) * scale),
                  );
            const {data, width, height} = context.getImageData(
              left,
              top,
              right - left,
              bottom - top,
            );
            const minX = palette.map(() => Infinity);
            const minY = palette.map(() => Infinity);
            const maxX = palette.map(() => -Infinity);
            const maxY = palette.map(() => -Infinity);
            const pixels = palette.map(() => 0);
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                const o = (y * width + x) * 4;
                for (let c = 0; c < palette.length; c += 1) {
                  const color = palette[c];
                  if (
                    Math.abs(data[o] - color[0]) <= tol &&
                    Math.abs(data[o + 1] - color[1]) <= tol &&
                    Math.abs(data[o + 2] - color[2]) <= tol
                  ) {
                    pixels[c] += 1;
                    if (x < minX[c]) {
                      minX[c] = x;
                    }
                    if (x > maxX[c]) {
                      maxX[c] = x;
                    }
                    if (y < minY[c]) {
                      minY[c] = y;
                    }
                    if (y > maxY[c]) {
                      maxY[c] = y;
                    }
                  }
                }
              }
            }
            // The marker's box from its anti-aliased edges: each pixel counts
            // by its color's share of the way from the background to the
            // marker's. The background is the median of a ring 2 px out.
            const fine = (c: number) => {
              const x0 = Math.max(0, minX[c] - 2);
              const x1 = Math.min(width - 1, maxX[c] + 2);
              const y0 = Math.max(0, minY[c] - 2);
              const y1 = Math.min(height - 1, maxY[c] + 2);
              const ring: number[][] = [[], [], []];
              for (let y = y0; y <= y1; y += 1) {
                for (let x = x0; x <= x1; x += 1) {
                  if (x === x0 || x === x1 || y === y0 || y === y1) {
                    const o = (y * width + x) * 4;
                    for (let k = 0; k < 3; k += 1) {
                      ring[k].push(data[o + k]);
                    }
                  }
                }
              }
              const background = ring.map(values => {
                const sorted = values.sort((a, b) => a - b);
                return sorted[Math.floor(sorted.length / 2)];
              });
              const toward = palette[c].map((v, k) => v - background[k]);
              const span = toward.reduce((sum, v) => sum + v * v, 0);
              if (span < 30 * 30) {
                throw new Error(
                  `trackMarkers: the marker's color lies within ${Math.sqrt(span).toFixed(0)} of its background, too close to read under a pixel`,
                );
              }
              let total = 0;
              let sumX = 0;
              let sumY = 0;
              const rows: number[] = [];
              const columns = new Array<number>(x1 - x0 + 1).fill(0);
              for (let y = y0; y <= y1; y += 1) {
                let row = 0;
                for (let x = x0; x <= x1; x += 1) {
                  const o = (y * width + x) * 4;
                  let dot = 0;
                  for (let k = 0; k < 3; k += 1) {
                    dot += (data[o + k] - background[k]) * toward[k];
                  }
                  const weight = Math.min(1, Math.max(0, dot / span));
                  total += weight;
                  sumX += weight * (x + 0.5);
                  sumY += weight * (y + 0.5);
                  row += weight;
                  columns[x - x0] += weight;
                }
                if (y > minY[c] && y < maxY[c]) {
                  rows.push(row);
                }
              }
              const median = (values: number[], fallback: number) => {
                if (values.length === 0) {
                  return fallback;
                }
                const sorted = [...values].sort((a, b) => a - b);
                return sorted[Math.floor(sorted.length / 2)];
              };
              const markerWidth = median(rows, maxX[c] - minX[c] + 1);
              const markerHeight = median(
                columns.filter((_, i) => x0 + i > minX[c] && x0 + i < maxX[c]),
                maxY[c] - minY[c] + 1,
              );
              return {
                x: (left + sumX / total - markerWidth / 2) / scale,
                y: (top + sumY / total - markerHeight / 2) / scale,
                width: markerWidth / scale,
                height: markerHeight / scale,
              };
            };
            found.push({
              boxes: palette.map((_, c) =>
                pixels[c] === 0
                  ? null
                  : sub
                    ? fine(c)
                    : {
                        x: (left + minX[c]) / scale,
                        y: (top + minY[c]) / scale,
                        width: (maxX[c] - minX[c] + 1) / scale,
                        height: (maxY[c] - minY[c] + 1) / scale,
                      },
              ),
              pixels,
              scale,
            });
          }
          return found;
        },
        {
          batch: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          palette: colors.map(rgb => [...rgb]),
          tol: tolerance,
          area: region ?? null,
          sub: subpixel,
        },
      );
      results.forEach((result, k) => {
        const block = isDefaultMarker.some(Boolean)
          ? colorBlockPx(batch[k].data, batch[k].format)
          : null;
        colors.forEach((_, c) => {
          out[c].push(
            subpixel
              ? {
                  t: batch[k].t,
                  box: result.boxes[c],
                  pixels: result.pixels[c],
                  step: {x: SUBPIXEL_STEP_PX, y: SUBPIXEL_STEP_PX},
                }
              : isDefaultMarker[c] && block != null
                ? {
                    t: batch[k].t,
                    box: result.boxes[c],
                    pixels: result.pixels[c],
                    step: {
                      x: block.x / result.scale,
                      y: block.y / result.scale,
                    },
                  }
                : {
                    t: batch[k].t,
                    box: result.boxes[c],
                    pixels: result.pixels[c],
                  },
          );
        });
      });
    }
    return out;
  } finally {
    await scratch.close();
  }
}

export interface RectSample {
  /** Epoch ms of the rAF callback. */
  readonly t: number;
  readonly box: Box | null;
  readonly transform: string;
  readonly opacity: number;
}

/**
 * Samples the element's rect, transform and opacity on every animation frame
 * for `durationMs`. Main-thread sampling: it stops while the main thread is
 * blocked, which is the point of the screencast path above.
 */
export async function sampleRects(
  locator: Locator,
  durationMs: number,
): Promise<RectSample[]> {
  return locator.evaluate(
    (element, duration) =>
      new Promise<
        {
          t: number;
          box: {x: number; y: number; width: number; height: number} | null;
          transform: string;
          opacity: number;
        }[]
      >(resolve => {
        // The harness's own waits run on the real timers: a frozen timer gate
        // (story.ts) holds only the page's.
        const gate = (
          window as unknown as {
            __harnessTimerGate?: {
              frame?: typeof requestAnimationFrame;
              now?: () => number;
            };
          }
        ).__harnessTimerGate;
        const frame = gate?.frame ?? window.requestAnimationFrame.bind(window);
        // The deadline reads the real clock, which a page freeze does not stop.
        const realNow = gate?.now ?? (() => performance.now());
        const samples: {
          t: number;
          box: {x: number; y: number; width: number; height: number} | null;
          transform: string;
          opacity: number;
        }[] = [];
        // A frame's time is the page's. After a page freeze it trails real
        // time by the frozen span, which the stamp adds back.
        const freeze = (
          window as unknown as {__harnessFreeze?: {offset: number}}
        ).__harnessFreeze;
        const end = realNow() + duration;
        const tick = (now: number) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          samples.push({
            t: performance.timeOrigin + now + (freeze?.offset ?? 0),
            box: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
            transform: style.transform,
            opacity: Number(style.opacity),
          });
          if (realNow() < end) {
            frame(tick);
          } else {
            resolve(samples);
          }
        };
        frame(tick);
      }),
    durationMs,
  );
}

export interface FrameStats {
  readonly frames: number;
  /** Frames whose tracked value differs from the frame before. */
  readonly changed: number;
  /** Longest stretch without a change inside the window (an open stall at its end included), ms. */
  readonly longestStallMs: number;
  /** Median spacing between frames, ms. */
  readonly medianFrameMs: number;
  readonly monotonic: boolean;
  readonly first: number | null;
  readonly last: number | null;
}

/** Summarises per-frame values (e.g. the marker's y) inside a time window. */
export function frameStats(
  samples: readonly {readonly t: number; readonly value: number | null}[],
  window: {readonly from: number; readonly to: number} = {
    from: -Infinity,
    to: Infinity,
  },
  epsilon = 0.25,
): FrameStats {
  const inside = samples.filter(
    s => s.t >= window.from && s.t <= window.to && s.value != null,
  ) as {t: number; value: number}[];
  let changed = 0;
  let increasing = 0;
  let decreasing = 0;
  let stallStart = inside[0]?.t ?? 0;
  let longestStallMs = 0;
  for (let i = 1; i < inside.length; i += 1) {
    const delta = inside[i].value - inside[i - 1].value;
    if (Math.abs(delta) > epsilon) {
      changed += 1;
      if (delta > 0) {
        increasing += 1;
      } else {
        decreasing += 1;
      }
      longestStallMs = Math.max(longestStallMs, inside[i].t - stallStart);
      stallStart = inside[i].t;
    }
  }
  // A stall still open when the window closes counts too: a frozen animation never changes at all.
  if (inside.length > 0) {
    longestStallMs = Math.max(
      longestStallMs,
      inside[inside.length - 1].t - stallStart,
    );
  }
  const gaps = inside
    .slice(1)
    .map((s, i) => s.t - inside[i].t)
    .sort((a, b) => a - b);
  return {
    frames: inside.length,
    changed,
    longestStallMs,
    medianFrameMs: gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0,
    monotonic: increasing === 0 || decreasing === 0,
    first: inside[0]?.value ?? null,
    last: inside[inside.length - 1]?.value ?? null,
  };
}

/**
 * A gap between two frames the page drew, ms, past which the page counts as
 * starved: about three frames at 60 Hz.
 */
export const FRAME_STARVATION_MS = 50;

const framesDrawn = (count: number) =>
  `${count} ${count === 1 ? 'frame' : 'frames'}`;

/** A proof's frames when the page drew too few of them. */
export interface FrameShortfall {
  /** The harness function that needed the frames (default `requireFrames`). */
  readonly by?: string;
  /** What the frames had to show. */
  readonly during: string;
  /** The frames the page drew during it. */
  readonly frames: number;
  /** The frames the proof needs. */
  readonly min: number;
  /**
   * The longest gap between frames around them, ms; Infinity when the page
   * drew fewer than two frames.
   */
  readonly longestGapMs: number;
}

/**
 * The page drew too few frames for a proof, because it was starved of
 * frames: no frame came for longer than `FRAME_STARVATION_MS`. A loaded
 * machine does that, and so does a long task on the page. Such a run proves
 * nothing about the motion, so it fails, and the error says why.
 */
export class FrameStarvationError extends Error {
  readonly numbers: FrameShortfall;
  constructor(numbers: FrameShortfall) {
    super(
      `${numbers.by ?? 'requireFrames'}: the page drew ${framesDrawn(numbers.frames)} while ${numbers.during}, where the proof needs ${numbers.min}. ${Number.isFinite(numbers.longestGapMs) ? `No frame came for ${numbers.longestGapMs.toFixed(1)} ms` : 'No second frame came'}: the page was starved of frames (a loaded machine, or a long task on the page), so the run proves nothing about the motion`,
    );
    this.name = 'FrameStarvationError';
    this.numbers = numbers;
  }
}

/**
 * The samples that `where` selects from the page's own per-frame `samples`
 * (an rAF trace), when there are at least `min` of them. Else the proof
 * fails. The error is `FrameStarvationError` when no frame came for longer
 * than `FRAME_STARVATION_MS` around the selected samples. Otherwise the
 * motion did not last that long, and the error says so. `during` names what
 * the frames had to show.
 */
export function requireFrames<T extends {readonly t: number}>(
  samples: readonly T[],
  {
    min,
    during,
    where = () => true,
  }: {
    readonly min: number;
    readonly during: string;
    readonly where?: (sample: T) => boolean;
  },
): T[] {
  const selected = samples.filter(where);
  if (selected.length >= min) {
    return selected;
  }
  // The gaps from the frame before the first selected sample to the frame
  // after the last one. With none selected, every gap counts.
  const first = selected.length > 0 ? samples.indexOf(selected[0]) : 0;
  const last =
    selected.length > 0
      ? samples.indexOf(selected[selected.length - 1])
      : samples.length - 1;
  const around = samples.slice(Math.max(0, first - 1), last + 2);
  // With fewer than two frames there is no gap to measure. The page drew one
  // frame at most in the whole sample, so it was starved.
  const longestGapMs =
    around.length < 2
      ? Number.POSITIVE_INFINITY
      : Math.max(...around.slice(1).map((sample, i) => sample.t - around[i].t));
  const numbers = {during, frames: selected.length, min, longestGapMs};
  if (longestGapMs > FRAME_STARVATION_MS) {
    throw new FrameStarvationError(numbers);
  }
  throw new Error(
    `requireFrames: the page drew ${framesDrawn(selected.length)} while ${during}, where the proof needs ${min}. No frame came more than ${FRAME_STARVATION_MS} ms after the one before: the motion did not last that long`,
  );
}
