// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file frames.ts
 * @input Uses a Playwright `Page`, a `Locator` for the element under test, and
 *   the engine's screencast (Chromium CDP `Page.startScreencast`; WebKit's
 *   `Screencast` domain)
 * @output `startScreencast` (timestamped composited frames), `markElement`
 *   (a marker outline the frames can find), `trackMarker` (per-frame marker
 *   box), `sampleRects` (per-rAF rect sampling), `frameStats`.
 * @position Frame evidence for motion proofs. The screencast is captured off
 *   the page's main thread, from what the compositor presents, so it keeps
 *   delivering frames while a script blocks the main thread: that is what makes
 *   the busy-main-thread proof possible. Rect sampling is the cheap path when
 *   the main thread is free.
 *
 * Marker tracking needs no image library: frames are decoded and scanned in a
 * scratch page of the same browser (createImageBitmap + canvas), so the
 * harness adds no dependency.
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
  /** Stops and returns every frame captured, in order. */
  stop(): Promise<CastFrame[]>;
}

export interface ScreencastOptions {
  /** Lossless frames by default: marker colours survive PNG, not JPEG. */
  readonly format?: 'png' | 'jpeg';
  readonly quality?: number;
}

/**
 * Starts capturing composited frames. Chromium delivers one per presented
 * frame (16.7 ms at 60 Hz), timestamped by the compositor; WebKit's own
 * screencast delivers one per composited update (about every 14 ms in the
 * Linux build), stamped on its monotonic clock and rebased here onto the wall
 * clock. Both keep delivering while the page's main thread is blocked, and
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
  {format = 'png', quality = 90}: ScreencastOptions,
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
    everyNthFrame: 1,
  });
  return {
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
  {quality = 90}: ScreencastOptions,
): Promise<Screencast> {
  const session = webkitPageSession(page);
  const frames: CastFrame[] = [];
  let generation = 0;
  const onFrame = (payload: unknown) => {
    const frame = payload as {data: string; timestamp: number};
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
  const wallAtStart = Date.now();
  return {
    async stop() {
      await session.send('Screencast.stopScreencast');
      session.off?.('Screencast.screencastFrame', onFrame);
      if (frames.length === 0) {
        return frames;
      }
      const ordered = inPresentationOrder(frames);
      // Rebase the monotonic stamps onto the wall clock (first frame ≈ start).
      const offset = wallAtStart - ordered[0].t;
      return ordered.map(f => ({...f, t: f.t + offset}));
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
}

/**
 * Finds the marker in every frame. Decoding runs in a scratch page of the same
 * browser, so neither the page under test nor Node needs an image decoder.
 */
export async function trackMarker(
  page: Page,
  frames: readonly CastFrame[],
  {
    rgb = MARKER_RGB,
    tolerance = 40,
  }: {rgb?: readonly [number, number, number]; tolerance?: number} = {},
): Promise<TrackedFrame[]> {
  const scratch = await page.context().newPage();
  try {
    const out: TrackedFrame[] = [];
    // Batches keep each evaluate payload moderate.
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const boxes = await scratch.evaluate(
        async ({batch: items, color, tol}) => {
          const results: {
            box: {x: number; y: number; width: number; height: number} | null;
            pixels: number;
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
            const {data, width, height} = context.getImageData(
              0,
              0,
              bitmap.width,
              bitmap.height,
            );
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            let pixels = 0;
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                const o = (y * width + x) * 4;
                if (
                  Math.abs(data[o] - color[0]) <= tol &&
                  Math.abs(data[o + 1] - color[1]) <= tol &&
                  Math.abs(data[o + 2] - color[2]) <= tol
                ) {
                  pixels += 1;
                  if (x < minX) {
                    minX = x;
                  }
                  if (x > maxX) {
                    maxX = x;
                  }
                  if (y < minY) {
                    minY = y;
                  }
                  if (y > maxY) {
                    maxY = y;
                  }
                }
              }
            }
            const scale = width / item.viewportWidth;
            results.push({
              box:
                pixels === 0
                  ? null
                  : {
                      x: minX / scale,
                      y: minY / scale,
                      width: (maxX - minX + 1) / scale,
                      height: (maxY - minY + 1) / scale,
                    },
              pixels,
            });
          }
          return results;
        },
        {
          batch: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          color: [...rgb],
          tol: tolerance,
        },
      );
      boxes.forEach((result, k) =>
        out.push({t: batch[k].t, box: result.box, pixels: result.pixels}),
      );
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
        const samples: {
          t: number;
          box: {x: number; y: number; width: number; height: number} | null;
          transform: string;
          opacity: number;
        }[] = [];
        const end = performance.now() + duration;
        const tick = (now: number) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          samples.push({
            t: performance.timeOrigin + now,
            box: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
            transform: style.transform,
            opacity: Number(style.opacity),
          });
          if (now < end) {
            requestAnimationFrame(tick);
          } else {
            resolve(samples);
          }
        };
        requestAnimationFrame(tick);
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
