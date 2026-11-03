// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ProgressBarTouch.a11y.chromium.spec.ts
 * @input Built ProgressBar stories in real Chromium with a coarse (touch)
 *   pointer (Web Animations seeking, CDP screencast)
 * @output Browser evidence that under a finger a value change runs as
 *   UIProgressView's setProgress(_:animated: true) does, and that a mouse
 *   keeps the theme's timing. Writes a storyboard to
 *   test-results/progress-bar-touch/.
 * @position Chromium proof for ProgressBar's touch presentation
 *
 * SYNC: Keep in step with ProgressBar.tsx (`styles.fill`, `fillEmpty`),
 * ProgressBarTouch.ts and motion/uikit/progressBar.ts.
 */

import fs from 'node:fs';
import path from 'node:path';
import {expect, test, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {formatMotionRoleValue} from '../../motion/roles';
import {progressBar} from '../../motion/uikit/progressBar';

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
    path.join('test-results', 'progress-bar-touch'),
);
const STORY = 'core-progressbar--default';
const VIEW = progressBar.progressView;
/** The progress.curves.fill role as CSS: linear. */
const FILL_CURVE = formatMotionRoleValue('curve', progressBar.curves.fill);
const DPR = 3;

test.use({
  viewport: {width: 402, height: 200},
  deviceScaleFactor: DPR,
  hasTouch: true,
  isMobile: true,
});

/** The default story at `value`, under a finger unless `coarse` is false. */
async function open(
  page: Page,
  value: number,
  {coarse = true, globals = ''} = {},
) {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${STORY}&viewMode=story${globals ? `&globals=${globals}` : ''}`,
  );
  await expect(page.getByRole('progressbar')).toBeVisible();
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(coarse);
  await setValue(page, value);
  await page.waitForTimeout(1200);
}

/** Re-renders the story with a new value and resolves once it rendered. */
async function setValue(page: Page, value: number) {
  await page.evaluate(
    async ({storyId, updatedArgs}) =>
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
        channel.emit('updateStoryArgs', {storyId, updatedArgs});
        setTimeout(resolve, 1500);
      }),
    {storyId: STORY, updatedArgs: {value}},
  );
}

/**
 * Sets a new value and pauses the fill's transition the moment it is created,
 * so its timing can be read and seeked. Resolves with the number of
 * transitions on the fill.
 */
async function changeAndPause(page: Page, value: number) {
  return page.evaluate(
    async ({storyId, updatedArgs}) =>
      new Promise<number>((resolve, reject) => {
        const onRun = (event: Event) => {
          const bar = document.querySelector('[role="progressbar"]');
          const fill = bar?.firstElementChild;
          if (fill == null || event.target !== fill) {
            return;
          }
          document.removeEventListener('transitionrun', onRun, true);
          const animations = fill.getAnimations();
          for (const animation of animations) {
            animation.pause();
          }
          resolve(animations.length);
        };
        document.addEventListener('transitionrun', onRun, true);
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
        setTimeout(() => reject(new Error('no transition started')), 3000);
      }),
    {storyId: STORY, updatedArgs: {value}},
  );
}

/** Leading edge of the fill, in px from the track's start, and its opacity. */
async function edge(page: Page) {
  return page.evaluate(() => {
    const track = document.querySelector('[role="progressbar"]') as Element;
    const fill = track.firstElementChild as Element;
    return {
      edge:
        fill.getBoundingClientRect().right - track.getBoundingClientRect().left,
      width: track.getBoundingClientRect().width,
      opacity: Number(getComputedStyle(fill).opacity),
    };
  });
}

test('a value change runs linearly for the progress.fillTrackMs role per whole track of the change', async ({
  page,
}) => {
  await open(page, 10);
  await changeAndPause(page, 90);
  const samples = await page.evaluate(() => {
    const track = document.querySelector('[role="progressbar"]') as Element;
    const fill = track.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    const duration = Number(transition.effect?.getTiming().duration);
    const out: {t: number; edge: number}[] = [];
    for (let i = 0; i <= 8; i += 1) {
      const t = (duration * i) / 8;
      transition.currentTime = Math.min(t, duration - 0.01);
      out.push({
        t,
        edge:
          fill.getBoundingClientRect().right -
          track.getBoundingClientRect().left,
      });
    }
    return {
      duration,
      easing: transition.effect?.getTiming().easing,
      width: track.getBoundingClientRect().width,
      out,
    };
  });
  expect(samples.duration).toBeCloseTo(0.8 * progressBar.fillTrackMs, 3);
  // The transition's own curve is linear (UIView.animate, curveLinear).
  expect([FILL_CURVE, 'linear']).toContain(samples.easing);
  for (const {t, edge: at} of samples.out) {
    const expected =
      samples.width *
      (0.1 + (0.8 * Math.min(t, samples.duration)) / samples.duration);
    expect(at, `edge at ${t} ms`).toBeCloseTo(expected, 0);
  }
});

test('a theme\u2019s tempo scales the move', async ({page}) => {
  // A theme with a tempo writes it beside its tokens. The move's duration is
  // the role times the share moved, times the tempo.
  await open(page, 10);
  await page.addStyleTag({content: ':root { --_astryx-motion-tempo: 1.5; }'});
  await changeAndPause(page, 90);
  const duration = await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    return Number(transition.effect?.getTiming().duration);
  });
  expect(duration).toBeCloseTo(1.5 * 0.8 * progressBar.fillTrackMs, 3);
});

test('with a mouse or trackpad the theme\u2019s timing and no minimum stay: touch work costs nothing under a fine pointer', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: {width: 402, height: 200},
    deviceScaleFactor: 3,
    hasTouch: false,
    isMobile: false,
  });
  const page = await context.newPage();
  await open(page, 10, {coarse: false});
  // A fine primary pointer in this context, before any check.
  expect(
    await page.evaluate(() => matchMedia('(pointer: coarse)').matches),
  ).toBe(false);
  const theme = await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const style = getComputedStyle(fill);
    return {
      duration: style.transitionDuration,
      easing: style.transitionTimingFunction,
    };
  });
  await changeAndPause(page, 90);
  const change = await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    return {
      duration: Number(transition.effect?.getTiming().duration),
      easing: String(transition.effect?.getTiming().easing),
    };
  });
  // The theme's `--duration-medium` and `--ease-standard`, not UIKit's
  // linear 0.8 s.
  const themeMs =
    Number.parseFloat(theme.duration) *
    (theme.duration.endsWith('ms') ? 1 : 1000);
  expect(change.duration).toBeCloseTo(themeMs, 0);
  expect(change.duration).not.toBeCloseTo(0.8 * progressBar.fillTrackMs, 0);
  expect(change.easing).toBe(theme.easing);
  expect(change.easing).not.toBe('linear');
  expect(change.easing).not.toBe(FILL_CURVE);
  // At 1% the fill is 1% of the track, with no two-track-height minimum.
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      animation.finish();
    }
  });
  await setValue(page, 1);
  await page.waitForTimeout(800);
  const box = await page.evaluate(() => {
    const track = document.querySelector('[role="progressbar"]') as Element;
    const fill = track.firstElementChild as Element;
    return {
      edge:
        fill.getBoundingClientRect().right - track.getBoundingClientRect().left,
      width: track.getBoundingClientRect().width,
    };
  });
  expect(box.edge).toBeCloseTo(box.width * 0.01, 0);
  await context.close();
});

test('a change mid-flight starts from where the fill is drawn, timed by the model change', async ({
  page,
}) => {
  await open(page, 10);
  await changeAndPause(page, 90);
  // Hold the first change halfway (50% drawn), then retarget to 30%.
  await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    transition.currentTime =
      Number(transition.effect?.getTiming().duration) / 2;
  });
  const before = await edge(page);
  expect(before.edge / before.width).toBeCloseTo(0.5, 2);
  await changeAndPause(page, 30);
  const retarget = await page.evaluate(() => {
    const track = document.querySelector('[role="progressbar"]') as Element;
    const fill = track.firstElementChild as Element;
    // A retarget replaces the running transition with a new one.
    const animations = fill.getAnimations();
    const transition = animations[animations.length - 1];
    transition.currentTime = 0;
    return {
      duration: Number(transition.effect?.getTiming().duration),
      start:
        fill.getBoundingClientRect().right - track.getBoundingClientRect().left,
      width: track.getBoundingClientRect().width,
    };
  });
  // Starts from the drawn 50%, not from the old value…
  expect(retarget.start / retarget.width).toBeCloseTo(0.5, 2);
  // …for 90 → 30 on the model: 0.6 of the track, 600 ms.
  expect(retarget.duration).toBeCloseTo(0.6 * progressBar.fillTrackMs, 3);
});

test('a change back to the value it just left keeps the model change\u2019s duration', async ({
  page,
}) => {
  await open(page, 10);
  await changeAndPause(page, 90);
  // Hold the first change halfway, then send it back to 10%. CSS shortens a
  // transition that reverses to its own start value, which would halve this
  // return.
  await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    transition.currentTime =
      Number(transition.effect?.getTiming().duration) / 2;
  });
  await changeAndPause(page, 10);
  const duration = await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const animations = fill.getAnimations();
    return Number(
      animations[animations.length - 1].effect?.getTiming().duration,
    );
  });
  // 90 → 10 on the model: 0.8 of the track, 800 ms.
  expect(duration).toBeCloseTo(0.8 * progressBar.fillTrackMs, 3);
});

test('under reduced motion a new value lands at once under a finger too', async ({
  page,
}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await open(page, 20);
  // Read the fill in the same task React commits the new value: a running
  // transition shows up there, before any frame could finish it.
  const state = await page.evaluate(
    async ({storyId}) =>
      new Promise<{running: number; edge: number}>(resolve => {
        const track = document.querySelector('[role="progressbar"]') as Element;
        const fill = track.firstElementChild as HTMLElement;
        const observer = new MutationObserver(() => {
          observer.disconnect();
          const t = track.getBoundingClientRect();
          resolve({
            running: fill.getAnimations().length,
            edge: (fill.getBoundingClientRect().right - t.left) / t.width,
          });
        });
        observer.observe(fill, {attributes: true, attributeFilter: ['style']});
        (
          window as unknown as {
            __STORYBOOK_ADDONS_CHANNEL__: {
              emit: (event: string, payload: unknown) => void;
            };
          }
        ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
          storyId,
          updatedArgs: {value: 80},
        });
      }),
    {storyId: STORY},
  );
  expect(state.running).toBe(0);
  expect(state.edge).toBeCloseTo(0.8, 2);
});

test('never narrower than two track heights above zero, transparent at zero', async ({
  page,
}) => {
  await open(page, 0);
  const trackHeight = await page.evaluate(
    () =>
      (
        document.querySelector('[role="progressbar"]') as Element
      ).getBoundingClientRect().height,
  );
  const minimum = VIEW.minimumFillHeights * trackHeight;
  const empty = await edge(page);
  expect(empty.opacity).toBe(VIEW.emptyFillAlpha);
  expect(empty.edge).toBeCloseTo(minimum, 1);
  await setValue(page, 1);
  await page.waitForTimeout(400);
  const tiny = await edge(page);
  expect(tiny.opacity).toBe(1);
  expect(tiny.edge).toBeCloseTo(minimum, 1);
  await setValue(page, 50);
  await page.waitForTimeout(800);
  const half = await edge(page);
  expect(half.edge).toBeCloseTo(half.width / 2, 0);
});

test('in RTL the minimum and the motion mirror', async ({page}) => {
  // The story's own direction: a real RTL region (Storybook keeps every
  // story inside its own \`dir\`).
  await open(page, 0, {globals: 'direction:rtl'});
  const measure = async () =>
    page.evaluate(() => {
      const track = document.querySelector('[role="progressbar"]') as Element;
      const fill = track.firstElementChild as Element;
      const t = track.getBoundingClientRect();
      const f = fill.getBoundingClientRect();
      // Visible length from the track's right (start) edge.
      return {length: t.right - Math.max(f.left, t.left), height: t.height};
    });
  await setValue(page, 1);
  await page.waitForTimeout(400);
  const tiny = await measure();
  expect(tiny.length).toBeCloseTo(VIEW.minimumFillHeights * tiny.height, 1);
  await changeAndPause(page, 81);
  const half = await page.evaluate(() => {
    const track = document.querySelector('[role="progressbar"]') as Element;
    const fill = track.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    transition.currentTime =
      Number(transition.effect?.getTiming().duration) / 2;
    const t = track.getBoundingClientRect();
    return {
      length: t.right - Math.max(fill.getBoundingClientRect().left, t.left),
      width: t.width,
      duration: Number(transition.effect?.getTiming().duration),
    };
  });
  // 1 → 81 is 0.8 of the track: 800 ms. It leaves from the drawn minimum,
  // so halfway sits midway between that and 81%, measured from the right.
  expect(half.duration).toBeCloseTo(0.8 * progressBar.fillTrackMs, 3);
  expect(half.length).toBeCloseTo((tiny.length + 0.81 * half.width) / 2, 0);
});

test('in forced colors under a finger the fill lands at once, sized to the value, its outline whole, in either direction', async ({
  page,
}) => {
  // Forced colors keep the fill's shape with a CanvasText outline, and the
  // track clips what it holds. So the fill is sized to the value there (still
  // at least two track heights above zero), not slid along the track. Sizing
  // is layout, which touch motion never animates, so the new size lands at
  // once.
  await page.emulateMedia({forcedColors: 'active'});
  for (const {globals, fromLeft} of [
    {globals: '', fromLeft: true},
    {globals: 'direction:rtl', fromLeft: false},
  ]) {
    await open(page, 0, {globals});
    for (const value of [1, 50]) {
      // Read the fill in the same task React commits the new value: a
      // transition would show up there, before any frame could finish it.
      const {track, fill, height, running} = await page.evaluate(
        async ({storyId, next}) =>
          new Promise<{
            track: {left: number; right: number};
            fill: {left: number; right: number};
            height: number;
            running: number;
          }>(resolve => {
            const bar = document.querySelector(
              '[role="progressbar"]',
            ) as Element;
            const child = bar.firstElementChild as HTMLElement;
            const observer = new MutationObserver(() => {
              observer.disconnect();
              const running = child.getAnimations().length;
              const t = bar.getBoundingClientRect();
              const f = child.getBoundingClientRect();
              resolve({
                track: {left: t.left, right: t.right},
                fill: {left: f.left, right: f.right},
                height: t.height,
                running,
              });
            });
            observer.observe(child, {
              attributes: true,
              attributeFilter: ['style'],
            });
            (
              window as unknown as {
                __STORYBOOK_ADDONS_CHANNEL__: {
                  emit: (event: string, payload: unknown) => void;
                };
              }
            ).__STORYBOOK_ADDONS_CHANNEL__.emit('updateStoryArgs', {
              storyId,
              updatedArgs: {value: next},
            });
          }),
        {storyId: STORY, next: value},
      );
      const label = `${globals || 'ltr'} ${value}%`;
      expect(running, `${label}: no transition runs`).toBe(0);
      const expected = Math.max(
        ((track.right - track.left) * value) / 100,
        VIEW.minimumFillHeights * height,
      );
      if (fromLeft) {
        expect(fill.left - track.left, label).toBeCloseTo(0, 0);
        expect(fill.right - fill.left, label).toBeCloseTo(expected, 0);
      } else {
        expect(track.right - fill.right, label).toBeCloseTo(0, 0);
        expect(fill.right - fill.left, label).toBeCloseTo(expected, 0);
      }
    }
  }
});

test('the fill keeps moving while a script holds the main thread', async ({
  page,
}) => {
  await open(page, 10);
  const frames: {t: number; edge: number}[] = [];
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
  const box = await page.getByRole('progressbar').boundingBox();
  if (box == null) {
    throw new Error('no track');
  }
  await cdp.send('Page.startScreencast', {
    format: 'png',
    maxWidth: 402 * DPR,
    maxHeight: 200 * DPR,
    everyNthFrame: 1,
  });
  await page.waitForTimeout(300);
  // A value change, one presented frame, then 700 ms of script.
  const busy = await page.evaluate(
    async ({storyId}) =>
      new Promise<{from: number; to: number}>(resolve => {
        const onStart = (event: Event) => {
          const bar = document.querySelector('[role="progressbar"]');
          if (bar == null || !bar.contains(event.target as Node)) {
            return;
          }
          document.removeEventListener('transitionstart', onStart, true);
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
        document.addEventListener('transitionstart', onStart, true);
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
      }),
    {storyId: STORY},
  );
  await page.waitForTimeout(300);
  await cdp.send('Page.stopScreencast');
  await Promise.all(acks);
  await cdp.detach();
  // A lost acknowledgement stalls the screencast and thins the frames.
  expect(ackFailures).toEqual([]);
  // Leading edge per frame, along the track's middle row.
  const scratch = await page.context().newPage();
  try {
    for (let i = 0; i < raw.length; i += 10) {
      const edges = await scratch.evaluate(
        async ({items, track}) => {
          const out: number[] = [];
          for (const item of items) {
            const bitmap = await createImageBitmap(
              await (await fetch(`data:image/png;base64,${item}`)).blob(),
            );
            const scale = bitmap.width / 402;
            const w = Math.round(track.width * scale);
            const canvas = new OffscreenCanvas(w, 1);
            const context = canvas.getContext('2d');
            if (context == null) {
              throw new Error('no 2d context');
            }
            context.drawImage(
              bitmap,
              Math.round(track.x * scale),
              Math.round((track.y + track.height / 2) * scale),
              w,
              1,
              0,
              0,
              w,
              1,
            );
            const {data} = context.getImageData(0, 0, w, 1);
            const at = (x: number) => [
              data[x * 4],
              data[x * 4 + 1],
              data[x * 4 + 2],
            ];
            const fill = at(Math.round(4 * scale));
            const rest = at(w - Math.round(4 * scale));
            const d = (a: number[], b: number[]) =>
              Math.abs(a[0] - b[0]) +
              Math.abs(a[1] - b[1]) +
              Math.abs(a[2] - b[2]);
            let edgeAt = 0;
            for (let x = 0; x < w; x += 1) {
              if (d(at(x), fill) < d(at(x), rest)) {
                edgeAt = x + 1;
              }
            }
            out.push(edgeAt / scale);
          }
          return out;
        },
        {items: raw.slice(i, i + 10).map(f => f.data), track: box},
      );
      edges.forEach((e, k) => frames.push({t: raw[i + k].t, edge: e}));
    }
  } finally {
    await scratch.close();
  }
  const inside = frames.filter(
    f => f.t >= busy.from + 20 && f.t <= busy.to - 20,
  );
  const positions = new Set(inside.map(f => Math.round(f.edge)));
  // Linear for 800 ms: it is still moving through the whole 700 ms block.
  expect(positions.size).toBeGreaterThanOrEqual(20);
  for (let i = 1; i < inside.length; i += 1) {
    expect(inside[i].edge).toBeGreaterThanOrEqual(inside[i - 1].edge - 1);
  }
});

test('storyboard: 10% to 90% under a finger @storyboard', async ({
  page,
}, testInfo) => {
  await open(page, 10);
  await changeAndPause(page, 90);
  const step = 1000 / 60;
  const shots: {t: number; edge: number; png: string}[] = [];
  const duration = await page.evaluate(() => {
    const fill = document.querySelector('[role="progressbar"]')
      ?.firstElementChild as Element;
    const [transition] = fill.getAnimations();
    return Number(transition.effect?.getTiming().duration);
  });
  for (let t = 0; t <= duration; t += step * 3) {
    const at = await page.evaluate(
      time => {
        const track = document.querySelector('[role="progressbar"]') as Element;
        const fill = track.firstElementChild as Element;
        const [transition] = fill.getAnimations();
        transition.currentTime = time;
        return (
          fill.getBoundingClientRect().right -
          track.getBoundingClientRect().left
        );
      },
      Math.min(t, duration - 0.01),
    );
    const png = (await page.getByRole('progressbar').screenshot()).toString(
      'base64',
    );
    shots.push({t: Math.round(t * 10) / 10, edge: at, png});
  }
  fs.mkdirSync(EVIDENCE, {recursive: true});
  fs.writeFileSync(
    path.join(EVIDENCE, 'progress-bar-touch-move.json'),
    JSON.stringify(
      {
        story: STORY,
        from: 10,
        to: 90,
        duration,
        frames: shots.map(({t, edge: e}) => ({
          t,
          edge: Math.round(e * 10) / 10,
        })),
      },
      null,
      1,
    ),
  );
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
        const w = decoded[0].width;
        const h = decoded[0].height + 6;
        const canvas = new OffscreenCanvas(w, decoded.length * h);
        const context = canvas.getContext('2d');
        if (context == null) {
          throw new Error('no 2d context');
        }
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        decoded.forEach((bitmap, i) => context.drawImage(bitmap, 0, i * h + 3));
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
      path.join(EVIDENCE, 'progress-bar-touch-move.png'),
      Buffer.from(png, 'base64'),
    );
    await testInfo.attach('progress-bar-touch-move.png', {
      path: path.join(EVIDENCE, 'progress-bar-touch-move.png'),
      contentType: 'image/png',
    });
  } finally {
    await sheet.close();
  }
  // The trace is the assertion (checked after it is written, so a failing
  // run still leaves its storyboard): equal steps of travel per equal time.
  const deltas = shots.slice(1).map((s, i) => s.edge - shots[i].edge);
  for (const delta of deltas.slice(0, -1)) {
    expect(delta).toBeCloseTo(deltas[0], 0);
  }
});
