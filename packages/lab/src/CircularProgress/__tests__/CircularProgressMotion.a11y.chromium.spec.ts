// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CircularProgressMotion.a11y.chromium.spec.ts
 * @input Built CircularProgress stories in real Chromium (Web Animations
 *   seeking, CDP screencast, tracing)
 * @output Browser evidence that a determinate value change keeps moving while
 *   a script holds the main thread and paints nothing per frame, that the
 *   ring at rest draws what the stroked circle drew, and that the arc stays
 *   one piece as it crosses 6 o'clock. Writes a storyboard (contact sheet +
 *   JSON trace) to test-results/circular-progress-motion/.
 * @position Chromium proof for CircularProgress's compositor fill; the iOS
 *   Safari side is a simulator recording attached to the pull request.
 *
 * SYNC: Keep in step with CircularProgress.tsx (`styles.fill` and the
 * keyframes of a value change).
 */

import fs from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

const EVIDENCE = path.resolve(
  process.env.ASTRYX_MOTION_EVIDENCE ??
    path.join('test-results', 'circular-progress-motion'),
);
const STORY = 'lab-circularprogress--default';
const DPR = 3;
// The lg ring: 64px across, a 5px stroke.
const DIAMETER = 64;
const STROKE = 5;

test.use({viewport: {width: 240, height: 160}, deviceScaleFactor: DPR});

type Box = {x: number; y: number; width: number; height: number};

async function open(page: Page, value: number) {
  await page.goto(`${storybook.origin}/iframe.html?id=${STORY}&viewMode=story`);
  await expect(page.getByRole('progressbar')).toBeVisible();
  await setArgs(page, {value, size: 'lg'});
  await page.waitForTimeout(800);
}

/** Re-renders the story with new args and resolves once it rendered. */
async function setArgs(page: Page, updatedArgs: Record<string, unknown>) {
  await page.evaluate(
    async ({storyId, args}) =>
      new Promise<void>(resolve => {
        const channel = (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
              once: (event: string, handler: () => void) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__;
        channel.once('storyRendered', () => resolve());
        channel.emit('updateStoryArgs', {storyId, updatedArgs: args});
        setTimeout(resolve, 1500);
      }),
    {storyId: STORY, args: updatedArgs},
  );
}

/** Sets a value and pauses the change's animations the moment they start. */
async function changeAndPause(page: Page, value: number) {
  return page.evaluate(
    async ({storyId, updatedArgs}) =>
      new Promise<number>((resolve, reject) => {
        const before = new Set(document.getAnimations());
        const poll = () => {
          const fresh = document
            .getAnimations()
            .filter(animation => !before.has(animation));
          if (fresh.length >= 4) {
            for (const animation of fresh) {
              animation.pause();
            }
            resolve(fresh.length);
            return;
          }
          requestAnimationFrame(poll);
        };
        (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
          storyId,
          updatedArgs,
        });
        requestAnimationFrame(poll);
        setTimeout(() => reject(new Error('no animation started')), 3000);
      }),
    {storyId: STORY, updatedArgs: {value}},
  );
}

/** Seeks every running change animation to `time` (ms). */
async function seek(page: Page, time: number) {
  await page.evaluate(t => {
    for (const animation of document.getAnimations()) {
      const duration = Number(animation.effect?.getTiming().duration);
      animation.currentTime = Math.min(t, duration - 0.01);
    }
  }, time);
}

async function ringBox(page: Page): Promise<Box> {
  const box = await page.getByRole('progressbar').boundingBox();
  if (box == null) {
    throw new Error('no ring');
  }
  return box;
}

/** The fill and track colors as rgb triples, read from the page. */
async function colors(page: Page) {
  return page.evaluate(() => {
    const parse = (value: string) =>
      (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const fill = document.querySelector(
      '.astryx-circular-progress-fill',
    ) as Element;
    const track = document.querySelector(
      '.astryx-circular-progress-track',
    ) as Element;
    return {
      fill: parse(getComputedStyle(fill).stroke),
      track: parse(getComputedStyle(track).stroke),
    };
  });
}

/**
 * For each degree clockwise from 12 o'clock, whether the ring's centerline is
 * drawn in the fill color in the given screenshot (PNGs of the ring box).
 */
async function inkByDegree(
  page: Page,
  shots: string[],
  palette: {fill: number[]; track: number[]},
): Promise<boolean[][]> {
  const scratch = await page.context().newPage();
  try {
    return await scratch.evaluate(
      async ({items, fill, track, diameter, stroke}) => {
        const out: boolean[][] = [];
        for (const item of items) {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${item}`)).blob(),
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          if (context == null) {
            throw new Error('no 2d context');
          }
          context.drawImage(bitmap, 0, 0);
          const {data, width} = context.getImageData(
            0,
            0,
            bitmap.width,
            bitmap.height,
          );
          const scale = bitmap.width / diameter;
          const r = ((diameter - stroke) / 2) * scale;
          const c = (diameter / 2) * scale;
          const d = (a: number[], b: number[]) =>
            Math.abs(a[0] - b[0]) +
            Math.abs(a[1] - b[1]) +
            Math.abs(a[2] - b[2]);
          const row: boolean[] = [];
          for (let degree = 0; degree < 360; degree += 1) {
            const angle = (degree * Math.PI) / 180;
            const x = Math.round(c + r * Math.sin(angle));
            const y = Math.round(c - r * Math.cos(angle));
            const i = (y * width + x) * 4;
            const pixel = [data[i], data[i + 1], data[i + 2]];
            row.push(d(pixel, fill) < d(pixel, track));
          }
          out.push(row);
        }
        return out;
      },
      {items: shots, ...palette, diameter: DIAMETER, stroke: STROKE},
    );
  } finally {
    await scratch.close();
  }
}

/**
 * How many separate pieces are inked around the ring, and the degree where
 * the piece starting at 12 o'clock ends (the arc's leading end; -1 if 12
 * o'clock is not inked). The start cap reaches a few degrees back past 12,
 * so pieces are counted around the circle.
 */
function span(row: boolean[]): {pieces: number; last: number} {
  if (row.every(Boolean)) {
    return {pieces: 1, last: 359};
  }
  let pieces = 0;
  for (let degree = 0; degree < 360; degree += 1) {
    if (row[degree] && !row[(degree + 359) % 360]) {
      pieces += 1;
    }
  }
  let last = -1;
  if (row[0]) {
    last = 0;
    while (last < 359 && row[last + 1]) {
      last += 1;
    }
  }
  return {pieces, last};
}

test('a value change keeps moving while a script holds the main thread', async ({
  page,
}) => {
  await open(page, 10);
  const box = await ringBox(page);
  const palette = await colors(page);
  const cdp = await page.context().newCDPSession(page);
  const raw: {t: number; data: string}[] = [];
  const acks: Promise<unknown>[] = [];
  const ackFailures: string[] = [];
  cdp.on('Page.screencastFrame', frame => {
    raw.push({
      t: (frame.metadata.timestamp ?? Date.now() / 1000) * 1000,
      data: frame.data,
    });
    acks.push(
      cdp
        .send('Page.screencastFrameAck', {sessionId: frame.sessionId})
        .catch((error: unknown) => {
          ackFailures.push(String(error));
        }),
    );
  });
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 240 * DPR,
    maxHeight: 160 * DPR,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(300);
  // A value change, one presented frame, then 700 ms of script.
  const busy = await page.evaluate(
    async ({storyId}) =>
      new Promise<{from: number; to: number}>(resolve => {
        const before = new Set(document.getAnimations());
        const poll = () => {
          if (document.getAnimations().filter(a => !before.has(a)).length < 4) {
            requestAnimationFrame(poll);
            return;
          }
          requestAnimationFrame(() =>
            setTimeout(() => {
              const from = performance.timeOrigin + performance.now();
              const end = performance.now() + 700;
              while (performance.now() < end) {
                // hold
              }
              resolve({from, to: performance.timeOrigin + performance.now()});
            }),
          );
        };
        (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
          storyId,
          updatedArgs: {value: 90},
        });
        requestAnimationFrame(poll);
      }),
    {storyId: STORY},
  );
  await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');
  await Promise.all(acks);
  await cdp.detach();
  // A lost acknowledgement stalls the screencast and thins the frames.
  expect(ackFailures).toEqual([]);
  // Crop each frame to the ring, then read how far the arc reaches.
  const scratch = await page.context().newPage();
  let crops: string[];
  try {
    crops = await scratch.evaluate(
      async ({items, ring}) => {
        const out: string[] = [];
        for (const item of items) {
          const bitmap = await createImageBitmap(
            await (await fetch(`data:image/png;base64,${item}`)).blob(),
          );
          const scale = bitmap.width / 240;
          const canvas = new OffscreenCanvas(
            Math.round(ring.width * scale),
            Math.round(ring.height * scale),
          );
          const context = canvas.getContext('2d');
          if (context == null) {
            throw new Error('no 2d context');
          }
          context.drawImage(
            bitmap,
            Math.round(ring.x * scale),
            Math.round(ring.y * scale),
            canvas.width,
            canvas.height,
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const blob = await canvas.convertToBlob({type: 'image/png'});
          const bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = '';
          for (const byte of bytes) {
            binary += String.fromCharCode(byte);
          }
          out.push(btoa(binary));
        }
        return out;
      },
      {items: raw.map(f => f.data), ring: box},
    );
  } finally {
    await scratch.close();
  }
  const rows = await inkByDegree(page, crops, palette);
  const frames = rows.map((row, i) => ({t: raw[i].t, ...span(row)}));
  const inside = frames.filter(
    f => f.t >= busy.from + 20 && f.t <= busy.to - 20,
  );
  // The change lasts the theme's 410 ms, so it moves through most of the
  // block, one piece the whole way, and lands at 90%.
  const reaches = new Set(inside.map(f => f.last));
  expect(reaches.size).toBeGreaterThanOrEqual(10);
  for (const frame of inside) {
    expect(frame.pieces, `pieces at ${frame.t}`).toBe(1);
  }
  for (let i = 1; i < inside.length; i += 1) {
    expect(inside[i].last).toBeGreaterThanOrEqual(inside[i - 1].last - 1);
  }
  expect(
    Math.abs(frames[frames.length - 1].last - 0.9 * 360),
  ).toBeLessThanOrEqual(6);
});

test('a value change lays out and paints nothing per frame', async ({
  page,
  browser,
}) => {
  await open(page, 20);
  // Stretch the theme's duration so the trace sits wholly inside the change.
  await page.evaluate(() =>
    (
      document.querySelector('.astryx-circular-progress-fill') as HTMLElement
    ).style.setProperty('--duration-medium', '3000ms'),
  );
  await setArgs(page, {value: 80});
  await page.waitForTimeout(200);
  await browser.startTracing(page, {
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
  });
  await page.waitForTimeout(1000);
  const moving = await page.evaluate(() =>
    document.getAnimations().some(a => a.playState === 'running'),
  );
  const trace = JSON.parse((await browser.stopTracing()).toString()) as {
    traceEvents: {
      name: string;
      ph: string;
      pid: number;
      tid: number;
      args?: {name?: string};
    }[];
  };
  const mainThreads = new Set(
    trace.traceEvents
      .filter(e => e.ph === 'M' && e.name === 'thread_name')
      .filter(e => e.args?.name === 'CrRendererMain')
      .map(e => `${e.pid}:${e.tid}`),
  );
  const count = (name: string) =>
    trace.traceEvents.filter(
      e => e.name === name && mainThreads.has(`${e.pid}:${e.tid}`),
    ).length;
  // A full second of the change: nothing lays out or paints. A
  // stroke-dashoffset transition repainted every frame (36 paints in 410 ms).
  expect(moving).toBe(true);
  expect(count('Layout')).toBe(0);
  expect(count('Paint')).toBe(0);
});

test('at rest the ring draws what the stroked circle drew', async ({
  page,
}, testInfo) => {
  await open(page, 0);
  const palette = await colors(page);
  // The stroked circle the fill used to be, drawn beside the ring with the
  // same colors: a round-capped arc from 12 o'clock.
  const values = [0, 1, 10, 25, 49, 50, 51, 75, 99, 100];
  const results: {value: number; iou: number}[] = [];
  const pairs: {ours: string; reference: string}[] = [];
  for (const value of values) {
    await setArgs(page, {value});
    await page.waitForTimeout(600);
    await page.evaluate(
      ({p, fill, track, diameter, stroke}) => {
        document.getElementById('reference')?.remove();
        const r = (diameter - stroke) / 2;
        const c = diameter / 2;
        const circumference = 2 * Math.PI * r;
        const holder = document.createElement('div');
        holder.id = 'reference';
        holder.style.cssText =
          'position:fixed;left:160px;top:40px;width:64px;height:64px;background:inherit';
        holder.innerHTML = `<svg width="${diameter}" height="${diameter}" viewBox="0 0 ${diameter} ${diameter}" style="display:block;transform:rotate(-90deg)"><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgb(${track.join(',')})" stroke-width="${stroke}"/><circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="rgb(${fill.join(',')})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference * (1 - p)}"/></svg>`;
        document.body.appendChild(holder);
      },
      {p: value / 100, ...palette, diameter: DIAMETER, stroke: STROKE},
    );
    const ours = (await page.getByRole('progressbar').screenshot()).toString(
      'base64',
    );
    const reference = (
      await page.locator('#reference svg').screenshot()
    ).toString('base64');
    pairs.push({ours, reference});
    const scratch = await page.context().newPage();
    try {
      const iou = await scratch.evaluate(
        async ({a, b, fill, track}) => {
          const decode = async (item: string) => {
            const bitmap = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${item}`)).blob(),
            );
            const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(bitmap, 0, 0);
            return context.getImageData(0, 0, bitmap.width, bitmap.height);
          };
          const [x, y] = await Promise.all([decode(a), decode(b)]);
          const d = (data: Uint8ClampedArray, i: number, c: number[]) =>
            Math.abs(data[i] - c[0]) +
            Math.abs(data[i + 1] - c[1]) +
            Math.abs(data[i + 2] - c[2]);
          let both = 0;
          let either = 0;
          for (let i = 0; i < x.data.length; i += 4) {
            const inX = d(x.data, i, fill) < d(x.data, i, track) / 2;
            const inY = d(y.data, i, fill) < d(y.data, i, track) / 2;
            if (inX && inY) {
              both += 1;
            }
            if (inX || inY) {
              either += 1;
            }
          }
          return either === 0 ? 1 : both / either;
        },
        {a: ours, b: reference, ...palette},
      );
      results.push({value, iou});
    } finally {
      await scratch.close();
    }
  }
  await testInfo.attach('ring-parity.json', {
    body: JSON.stringify(results),
    contentType: 'application/json',
  });
  // Evidence: the stroked circle (top) and the ring (bottom) at each value.
  const sheet = await page.context().newPage();
  try {
    const png = await sheet.evaluate(async items => {
      const decode = async (item: string) =>
        createImageBitmap(
          await (await fetch(`data:image/png;base64,${item}`)).blob(),
        );
      const rows = await Promise.all(
        items.map(async ({ours, reference}) => ({
          ours: await decode(ours),
          reference: await decode(reference),
        })),
      );
      const w = rows[0].ours.width + 12;
      const h = rows[0].ours.height + 12;
      const canvas = new OffscreenCanvas(rows.length * w, 2 * h);
      const context = canvas.getContext('2d');
      if (context == null) {
        throw new Error('no 2d context');
      }
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      rows.forEach(({ours, reference}, i) => {
        context.drawImage(reference, i * w + 6, 6);
        context.drawImage(ours, i * w + 6, h + 6);
      });
      const blob = await canvas.convertToBlob({type: 'image/png'});
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      return btoa(binary);
    }, pairs);
    fs.mkdirSync(EVIDENCE, {recursive: true});
    fs.writeFileSync(
      path.join(EVIDENCE, 'circular-progress-parity.png'),
      Buffer.from(png, 'base64'),
    );
    fs.writeFileSync(
      path.join(EVIDENCE, 'circular-progress-parity.json'),
      JSON.stringify(results, null, 1),
    );
  } finally {
    await sheet.close();
  }
  for (const {value, iou} of results) {
    expect(iou, `IoU at ${value}%`).toBeGreaterThanOrEqual(0.97);
  }
});

test("a shrinking change keeps the arc solid as it crosses 6 o'clock", async ({
  page,
}) => {
  // 80% back to 20%, on the theme's easing: the left half-ring must be fully
  // opaque whenever it draws part of the arc (turned past 180deg), and hide
  // at once as the arc passes 6 o'clock. It used to fade out over the sample
  // before the crossing, drawing a lighter band between the end cap and 6
  // o'clock for a frame.
  await open(page, 80);
  // Linear over 300 ms, so the crossing falls exactly on one of the
  // animation's samples (where the old code read the arc as already hidden).
  await page.addStyleTag({
    content:
      '.astryx-circular-progress-fill{transition-timing-function:linear!important;transition-duration:300ms!important}',
  });
  await changeAndPause(page, 20);
  const duration = await page.evaluate(() =>
    Number(document.getAnimations()[0]?.effect?.getTiming().duration),
  );
  expect(duration).toBe(300);
  const samples: {time: number; angle: number; opacity: number}[] = [];
  for (let t = 0; t <= duration; t += duration / 300) {
    await seek(page, t);
    samples.push({
      time: t,
      ...(await page.evaluate(() => {
        const [, left] = Array.from(
          document.querySelectorAll<HTMLElement>(
            '.astryx-circular-progress-fill > span > span',
          ),
        );
        const style = getComputedStyle(left);
        const m = new DOMMatrix(style.transform);
        const angle = ((Math.atan2(m.b, m.a) * 180) / Math.PI + 360) % 360;
        return {angle, opacity: Number(style.opacity)};
      })),
    });
  }
  const showing = samples.filter(s => s.angle > 180.5);
  expect(showing.length).toBeGreaterThan(0);
  for (const {time, angle, opacity} of showing) {
    expect(
      opacity,
      `at ${time.toFixed(1)} ms, turned ${angle.toFixed(1)}deg`,
    ).toBe(1);
  }
  // It ends hidden, below half.
  expect(samples[samples.length - 1].opacity).toBe(0);
});

test("below half nothing of the left half-ring shows at 6 o'clock", async ({
  page,
}) => {
  // The left half-ring parks 4deg short of 6 o'clock until the value passes
  // half, inside the right half, which its own half clips away: no hairline
  // or sliver may show just left of 6 o'clock, at any size.
  await open(page, 0);
  const palette = await colors(page);
  for (const size of ['sm', 'md', 'lg'] as const) {
    // (Below 45% the end cap stays clear of the center line.)
    for (const value of [1, 10, 25, 40]) {
      await setArgs(page, {value, size});
      await page.waitForTimeout(400);
      const shot = (await page.getByRole('progressbar').screenshot()).toString(
        'base64',
      );
      const scratch = await page.context().newPage();
      try {
        const stray = await scratch.evaluate(
          async ({item, fill, track}) => {
            const bitmap = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${item}`)).blob(),
            );
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
            const d = (i: number, c: number[]) =>
              Math.abs(data[i] - c[0]) +
              Math.abs(data[i + 1] - c[1]) +
              Math.abs(data[i + 2] - c[2]);
            // The ring's bottom band, from a quarter of the way in to just
            // left of the center line: where a parked half-ring's end would
            // leak.
            let count = 0;
            const center = width / 2;
            for (let y = Math.floor(height * 0.8); y < height; y += 1) {
              for (let x = Math.floor(width * 0.25); x < center - 1; x += 1) {
                const i = (y * width + x) * 4;
                if (d(i, fill) < d(i, track)) {
                  count += 1;
                }
              }
            }
            return count;
          },
          {item: shot, ...palette},
        );
        expect(stray, `${size} at ${value}%`).toBe(0);
      } finally {
        await scratch.close();
      }
    }
  }
});

test("the arc stays one piece as it crosses 6 o'clock", async ({page}) => {
  await open(page, 20);
  const palette = await colors(page);
  await changeAndPause(page, 80);
  const duration = await page.evaluate(() =>
    Number(document.getAnimations()[0]?.effect?.getTiming().duration),
  );
  const shots: string[] = [];
  const times: number[] = [];
  for (let t = 0; t <= duration; t += duration / 40) {
    await seek(page, t);
    times.push(t);
    shots.push(
      (await page.getByRole('progressbar').screenshot()).toString('base64'),
    );
  }
  const rows = await inkByDegree(page, shots, palette);
  const reaches: number[] = [];
  rows.forEach((row, i) => {
    const {pieces, last} = span(row);
    expect(pieces, `pieces at ${Math.round(times[i])} ms`).toBe(1);
    reaches.push(last);
  });
  // It starts at 20% and ends at 80%, passing 6 o'clock on the way.
  expect(Math.abs(reaches[0] - 72)).toBeLessThanOrEqual(6);
  expect(Math.abs(reaches[reaches.length - 1] - 288)).toBeLessThanOrEqual(6);
  expect(reaches.some(r => r > 170 && r < 190)).toBe(true);
});

/**
 * Sets a value and returns how many Web Animations the page started in the
 * half second after it (counted as `animate()` calls, so a short animation
 * that has already finished still counts).
 */
async function animationsStartedBy(page: Page, value: number) {
  return page.evaluate(
    async ({storyId, updatedArgs}) =>
      new Promise<number>(resolve => {
        let started = 0;
        const native = Element.prototype.animate;
        Element.prototype.animate = function (...args) {
          started += 1;
          return native.apply(this, args);
        };
        (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
          storyId,
          updatedArgs,
        });
        setTimeout(() => {
          Element.prototype.animate = native;
          resolve(started);
        }, 500);
      }),
    {storyId: STORY, updatedArgs: {value}},
  );
}

for (const pointer of ['a mouse', 'a finger'] as const) {
  test.describe(`under reduced motion, with ${pointer}`, () => {
    test.use(
      pointer === 'a finger'
        ? {hasTouch: true, isMobile: true}
        : {hasTouch: false, isMobile: false},
    );

    test('a new value moves over the theme\u2019s duration, as without', async ({
      page,
    }) => {
      // Progress indicators sit outside design:reduced-motion's scope; a
      // change times its four layers by the theme's duration in either motion
      // setting, as the stroke's transition did.
      await page.emulateMedia({reducedMotion: 'reduce'});
      await open(page, 10);
      expect(
        await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
      ).toBe(pointer === 'a finger');
      expect(await animationsStartedBy(page, 90)).toBe(4);
      await page.emulateMedia({reducedMotion: 'no-preference'});
      expect(await animationsStartedBy(page, 30)).toBe(4);
    });
  });
}

test('a change keeps the theme\u2019s duration and easing', async ({page}) => {
  await open(page, 20);
  const palette = await colors(page);
  // The tokens the stroked circle's transition used, still declared on the
  // fill and read back when a change starts.
  const theme = await page.evaluate(() => {
    const fill = document.querySelector(
      '.astryx-circular-progress-fill',
    ) as HTMLElement;
    const style = getComputedStyle(fill);
    return {
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
    };
  });
  await changeAndPause(page, 80);
  const timing = await page.evaluate(easing => {
    const [first] = document.getAnimations();
    const duration = Number(first?.effect?.getTiming().duration);
    // The theme's easing, evaluated by the browser through a detached animation.
    const probe = new Animation(
      new KeyframeEffect(null, null, {duration: 1000, easing, fill: 'both'}),
    );
    const eased = [0.25, 0.5, 0.75].map(t => {
      probe.currentTime = t * 1000;
      return probe.effect?.getComputedTiming().progress ?? t;
    });
    return {duration, eased};
  }, theme.easing);
  const tokenMs =
    Number.parseFloat(theme.duration) *
    (theme.duration.endsWith('ms') ? 1 : 1000);
  expect(timing.duration).toBeCloseTo(tokenMs, 0);
  // The arc reaches where the theme's easing puts it at each quarter.
  const shots: string[] = [];
  for (const t of [0.25, 0.5, 0.75]) {
    await seek(page, t * timing.duration);
    shots.push(
      (await page.getByRole('progressbar').screenshot()).toString('base64'),
    );
  }
  const rows = await inkByDegree(page, shots, palette);
  // The leading round cap reaches half the stroke past the arc's end.
  const cap = (STROKE / 2 / ((DIAMETER - STROKE) / 2)) * (180 / Math.PI);
  rows.forEach((row, i) => {
    const expected = 360 * (0.2 + 0.6 * timing.eased[i]) + cap;
    const {last} = span(row);
    expect(
      Math.abs(last - expected),
      `quarter ${i + 1}: ${last}°`,
    ).toBeLessThanOrEqual(4);
  });
});

test('storyboard: 20% to 80% @storyboard', async ({page}, testInfo) => {
  await open(page, 20);
  await changeAndPause(page, 80);
  const duration = await page.evaluate(() =>
    Number(document.getAnimations()[0]?.effect?.getTiming().duration),
  );
  const step = 1000 / 60;
  const shots: {t: number; png: string}[] = [];
  for (let t = 0; t <= duration + step; t += step * 2) {
    await seek(page, t);
    shots.push({
      t: Math.round(t * 10) / 10,
      png: (await page.getByRole('progressbar').screenshot()).toString(
        'base64',
      ),
    });
  }
  fs.mkdirSync(EVIDENCE, {recursive: true});
  const sheet = await page.context().newPage();
  try {
    const png = await sheet.evaluate(
      async items => {
        const decoded = await Promise.all(
          items.map(async item =>
            createImageBitmap(
              await (await fetch(`data:image/png;base64,${item}`)).blob(),
            ),
          ),
        );
        const w = decoded[0].width + 12;
        const h = decoded[0].height + 12;
        const columns = 8;
        const canvas = new OffscreenCanvas(
          columns * w,
          Math.ceil(decoded.length / columns) * h,
        );
        const context = canvas.getContext('2d');
        if (context == null) {
          throw new Error('no 2d context');
        }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        decoded.forEach((bitmap, i) =>
          context.drawImage(
            bitmap,
            (i % columns) * w + 6,
            Math.floor(i / columns) * h + 6,
          ),
        );
        const blob = await canvas.convertToBlob({type: 'image/png'});
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (const byte of bytes) {
          binary += String.fromCharCode(byte);
        }
        return btoa(binary);
      },
      shots.map(s => s.png),
    );
    fs.writeFileSync(
      path.join(EVIDENCE, 'circular-progress-move.png'),
      Buffer.from(png, 'base64'),
    );
    fs.writeFileSync(
      path.join(EVIDENCE, 'circular-progress-move.json'),
      JSON.stringify(
        {story: STORY, from: 20, to: 80, duration, frames: shots.map(s => s.t)},
        null,
        1,
      ),
    );
    await testInfo.attach('circular-progress-move.png', {
      path: path.join(EVIDENCE, 'circular-progress-move.png'),
      contentType: 'image/png',
    });
  } finally {
    await sheet.close();
  }
});
