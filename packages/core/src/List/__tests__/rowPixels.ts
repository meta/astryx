// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowPixels.ts
 * @input Playwright pages and screencast frames from the interaction harness
 * @output `samplePixel` (one point's value in every screencast frame) and
 *   WebKit's video evidence: `installBeacon`, `blockBehindBeacon` (a main-thread
 *   beacon that marks the frames presented while script could not run) and
 *   `sampleVideo`
 * @position Test helper for the List interaction proofs (row press release,
 *   selection hold), which read a row's press strength from pixels
 */

import {readFile} from 'node:fs/promises';
import {chromium, type Page} from '@playwright/test';
import type {CastFrame} from '@astryxdesign/interaction-harness';

export interface PixelFrame {
  readonly t: number;
  /** Mean of the RGB channels at the probe point, 0–255. */
  readonly value: number;
}

/**
 * The probe point's value in every frame. Decoding runs in a scratch page of
 * the same browser (no image decoder in Node), like the harness's own marker
 * tracking.
 */
export async function samplePixel(
  page: Page,
  frames: ReadonlyArray<CastFrame>,
  probe: {x: number; y: number},
): Promise<PixelFrame[]> {
  const scratch = await page.context().newPage();
  try {
    const out: PixelFrame[] = [];
    for (let i = 0; i < frames.length; i += 12) {
      const batch = frames.slice(i, i + 12);
      const values = await scratch.evaluate(
        async ({items, at}) => {
          const results: number[] = [];
          for (const item of items) {
            const bitmap = await createImageBitmap(
              await (
                await fetch(`data:image/${item.format};base64,${item.data}`)
              ).blob(),
            );
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            const scale = bitmap.width / item.viewportWidth;
            const px = context.getImageData(
              Math.round(at.x * scale),
              Math.round(at.y * scale),
              1,
              1,
            ).data;
            results.push((px[0] + px[1] + px[2]) / 3);
          }
          return results;
        },
        {
          items: batch.map(f => ({
            data: f.data,
            format: f.format,
            viewportWidth: f.viewportWidth,
          })),
          at: probe,
        },
      );
      values.forEach((value, k) => out.push({t: batch[k].t, value}));
    }
    return out;
  } finally {
    await scratch.close();
  }
}

/** The beacon's size, CSS px, in the viewport's bottom-right corner. */
const BEACON = 40;

/**
 * Adds the main-thread beacon: a corner square the page paints grey, blue
 * while it is about to block, and green once script runs again. A recorded
 * frame showing blue was presented while script could not run.
 */
export async function installBeacon(page: Page): Promise<void> {
  await page.evaluate(size => {
    const beacon = document.createElement('div');
    beacon.id = 'beacon';
    Object.assign(beacon.style, {
      position: 'fixed',
      right: '0',
      bottom: '0',
      width: `${size}px`,
      height: `${size}px`,
      background: 'rgb(128, 128, 128)',
      zIndex: '2147483647',
    });
    document.body.append(beacon);
  }, BEACON);
}

/**
 * Paints the beacon blue, lets two frames commit it, blocks the main thread
 * for `ms`, then paints it green.
 */
export async function blockBehindBeacon(page: Page, ms: number): Promise<void> {
  await page.evaluate(
    async duration =>
      new Promise<void>(resolve => {
        const beacon = document.getElementById('beacon') as HTMLElement;
        beacon.style.background = 'rgb(0, 0, 255)';
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const end = performance.now() + duration;
            while (performance.now() < end) {
              // blocked
            }
            beacon.style.background = 'rgb(0, 200, 0)';
            resolve();
          }),
        );
      }),
    ms,
  );
}

/**
 * Arms the same block in the page for the next `event` (e.g. the lift's
 * `touchend`): beacon blue, two frames, the block, beacon green. Armed in
 * the page, the block starts two frames after the event with no
 * test-runner round trip in between, so a short motion cannot finish first.
 */
export async function blockBehindBeaconOn(
  page: Page,
  event: string,
  ms: number,
): Promise<void> {
  await page.evaluate(
    ({type, duration}) => {
      addEventListener(
        type,
        () => {
          const beacon = document.getElementById('beacon') as HTMLElement;
          beacon.style.background = 'rgb(0, 0, 255)';
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const end = performance.now() + duration;
              while (performance.now() < end) {
                // blocked
              }
              beacon.style.background = 'rgb(0, 200, 0)';
            }),
          );
        },
        {once: true, passive: true, capture: true},
      );
    },
    {type: event, duration: ms},
  );
}

export interface VideoSample {
  /** Video time, s. */
  readonly t: number;
  /** Mean of the RGB channels at the probe point, 0–255. */
  readonly value: number;
  readonly beacon: 'before' | 'blocked' | 'after';
}

/**
 * The probe point's value and the beacon's state every 10 ms of a recorded
 * video (Playwright's `recordVideo`, WebKit's frame evidence), decoded in a
 * Chromium page.
 */
export async function sampleVideo(
  videoPath: string,
  probe: {x: number; y: number},
  viewport: {width: number; height: number},
): Promise<VideoSample[]> {
  const webm = (await readFile(videoPath)).toString('base64');
  const decoder = await chromium.launch();
  try {
    const player = await decoder.newPage();
    return await player.evaluate(
      async ({at, data, beaconAt}) => {
        const element = document.createElement('video');
        element.muted = true;
        element.src = URL.createObjectURL(
          new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], {
            type: 'video/webm',
          }),
        );
        document.body.append(element);
        if (element.readyState < 1) {
          await new Promise(r =>
            element.addEventListener('loadedmetadata', r, {once: true}),
          );
        }
        element.pause();
        const canvas = document.createElement('canvas');
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        const context2d = canvas.getContext('2d', {
          willReadFrequently: true,
        }) as CanvasRenderingContext2D;
        const out: {
          t: number;
          value: number;
          beacon: 'before' | 'blocked' | 'after';
        }[] = [];
        const duration = Number.isFinite(element.duration)
          ? element.duration
          : 10;
        for (let t = 0; t < duration; t += 0.01) {
          element.currentTime = t;
          await new Promise(r =>
            element.addEventListener('seeked', r, {once: true}),
          );
          context2d.drawImage(element, 0, 0);
          const px = context2d.getImageData(at.x, at.y, 1, 1).data;
          const b = context2d.getImageData(beaconAt.x, beaconAt.y, 1, 1).data;
          const beacon =
            b[2] > 180 && b[0] < 80
              ? 'blocked'
              : b[1] > 150 && b[2] < 80
                ? 'after'
                : 'before';
          out.push({t, value: (px[0] + px[1] + px[2]) / 3, beacon});
        }
        return out;
      },
      {
        at: probe,
        data: webm,
        beaconAt: {
          x: viewport.width - BEACON / 2,
          y: viewport.height - BEACON / 2,
        },
      },
    );
  } finally {
    await decoder.close();
  }
}
