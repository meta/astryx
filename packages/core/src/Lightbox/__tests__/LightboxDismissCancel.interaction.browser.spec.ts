// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file LightboxDismissCancel.interaction.browser.spec.ts
 * @input The built "Default" Lightbox story on the phone project, real
 *   touch input and the interaction harness
 * @output Proofs for the drags that do not dismiss, against Photos' measured
 *   cancel rule. The viewer stays open, the photo springs back on
 *   `springs.settle` and the backdrop and controls return. They also cover
 *   Reduce Motion, a blocked main thread and a storyboard.
 * @position Interaction tests for Lightbox (browser), beside
 *   LightboxDismiss.interaction.browser.spec.ts
 */

import {
  expect,
  test,
  type Locator,
  type Page,
} from '@astryxdesign/a11y-spec/playwright';
import {
  armHold,
  blockMainThread,
  busyWindowProof,
  compareCurve,
  CONTROL_RGB,
  curveOf,
  drag,
  frames,
  markElement,
  MARKER_RGB,
  openStory,
  releaseAnimations,
  sampleCurve,
  startBusyControl,
  startScreencast,
  timeline,
  touchDriver,
  type TouchDriver,
  type TouchScript,
  touchStoryboard,
  trackMarkers,
  waitForRest,
  withStorybook,
  writeEvidence,
} from '@astryxdesign/interaction-harness';

const storybook = withStorybook(test);

/** The pan's begin threshold: travel before it is the finger's alone. */
const THRESHOLD = 10;
/**
 * `springs.settle` (response 0.5 s, critically damped) as a stiffness at mass
 * 1: (2π / 0.5 s)².
 */
const SETTLE_K = ((2 * Math.PI) / 0.5) ** 2;

/**
 * A critically damped spring towards 0 from `from` with velocity `v0`
 * (units/s), at `ms` milliseconds.
 */
function criticallyDamped(stiffness: number, from: number, v0 = 0) {
  const omega = Math.sqrt(stiffness);
  return (ms: number) => {
    const t = ms / 1000;
    return (from + (v0 + omega * from) * t) * Math.exp(-omega * t);
  };
}

function photoSvg(width: number, height: number): string {
  let squares = '';
  for (let y = 0; y < height; y += 50) {
    for (let x = 0; x < width; x += 50) {
      if ((x + y) % 100 === 0) {
        squares += `<rect x="${x}" y="${y}" width="50" height="50"/>`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><rect width="${width}" height="${height}" fill="#fff"/><g fill="#000">${squares}</g><circle cx="${width / 2}" cy="${height / 2}" r="${height / 8}" fill="#d22"/></svg>`;
}

interface Viewer {
  driver: TouchDriver;
  dialog: Locator;
  photo: Locator;
  centre: {x: number; y: number};
  photoState: () => Promise<{x: number; y: number; scale: number}>;
  backdropAlpha: () => Promise<number>;
  closeAlpha: () => Promise<number>;
}

async function openViewer(page: Page): Promise<Viewer> {
  await page.route(/\/sample-[a-z]+-\d+x\d+[^/]*\.svg/, async route =>
    route.fulfill({contentType: 'image/svg+xml', body: photoSvg(3000, 2000)}),
  );
  await openStory(page, storybook(), 'core-lightbox--default');
  const driver = await touchDriver(page);
  const trigger = page.getByRole('button', {name: 'Open lightbox'});
  const box = await trigger.boundingBox();
  if (box == null) {
    throw new Error('no trigger');
  }
  await driver.tap({x: box.x + box.width / 2, y: box.y + box.height / 2});
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const photo = dialog.locator('img').first();
  await expect
    .poll(async () =>
      photo.evaluate(el => (el as HTMLImageElement).naturalWidth),
    )
    .toBe(3000);
  await waitForRest(photo);
  const rect = await photo.boundingBox();
  if (rect == null) {
    throw new Error('no photo');
  }
  return {
    driver,
    dialog,
    photo,
    centre: {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2},
    photoState: async () =>
      photo.evaluate(el => {
        const style = getComputedStyle(el);
        const [x = '0', y = '0'] =
          style.translate === 'none' ? [] : style.translate.split(' ');
        return {
          x: parseFloat(x),
          y: parseFloat(y),
          scale: style.scale === 'none' ? 1 : parseFloat(style.scale),
        };
      }),
    backdropAlpha: async () =>
      dialog.evaluate(el =>
        parseFloat(getComputedStyle(el, '::backdrop').opacity),
      ),
    closeAlpha: async () =>
      dialog
        .locator('[data-lightbox-chrome]')
        .first()
        .evaluate(el => parseFloat(getComputedStyle(el).opacity)),
  };
}

/** Down by `dy`, then quickly back up by `up`: released moving up. */
function pullThenFlickUp(
  from: {x: number; y: number},
  dy: number,
  up: number,
): TouchScript {
  const down = {x: from.x, y: from.y + dy};
  return drag(from, down, {durationMs: 400})
    .slice(0, -1)
    .concat(
      drag(down, {x: down.x, y: down.y - up}, {durationMs: 60})
        .slice(1)
        .map(f => ({...f, t: f.t + 420})),
    );
}

/** Down by `dy`, then back to `travel` past the pan's threshold, held still. */
function pullThenReturn(
  from: {x: number; y: number},
  dy: number,
  travel: number,
): TouchScript {
  const down = {x: from.x, y: from.y + dy};
  return drag(from, down, {durationMs: 300})
    .slice(0, -1)
    .concat(
      drag(
        down,
        {x: down.x, y: from.y + THRESHOLD + travel},
        {durationMs: 300, restMs: 150},
      )
        .slice(1)
        .map(f => ({...f, t: f.t + 320})),
    );
}

/**
 * Plays `script` and returns the return it starts: its translateY and scale
 * curves, and how long it runs. The hold judges the motions the test reads.
 * The return runs half a second. A hold sent after the lift can arrive after
 * it ends on a busy machine. So the page holds it itself as it starts.
 */
async function heldReturn(
  page: Page,
  v: Viewer,
  script: TouchScript,
  judged: ReadonlyArray<'translate' | 'scale'>,
) {
  const {photo} = v;
  const hold = await armHold(page, photo, {
    judges: judged.map(property => ({target: photo, property})),
  });
  await v.driver.play(script);
  const held = await hold.held();
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = await sampleCurve(photo, timeline(duration));
  await releaseAnimations(page);
  return {
    held,
    duration,
    y: curveOf(samples, 'translateY'),
    scale: curveOf(samples, 'scaleX'),
  };
}

/** The viewer stays open, the photo at rest at the fitted size, all faded back. */
async function expectRestored(v: Viewer) {
  await waitForRest(v.photo);
  await expect(v.dialog).toBeVisible();
  expect(await v.photoState()).toEqual({x: 0, y: 0, scale: 1});
  await expect.poll(v.backdropAlpha).toBeCloseTo(1, 2);
  await expect.poll(v.closeAlpha).toBeCloseTo(1, 2);
}

test('released moving up, the photo springs back on springs.settle and the viewer stays open', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  const back = await heldReturn(page, v, pullThenFlickUp(v.centre, 150, 60), [
    'translate',
    'scale',
  ]);
  // The size returns from rest. The position carries the finger's upward
  // velocity, read from the first two samples as one unknown. The rest of the
  // curve must follow springs.settle.
  const size = compareCurve(
    back.scale,
    t => 1 + criticallyDamped(SETTLE_K, back.scale[0].value - 1)(t),
    0.002,
  );
  const omega = Math.sqrt(SETTLE_K);
  const [s0, s1] = back.y;
  const t1 = (s1.t - s0.t) / 1000;
  const v0 =
    (s1.value * Math.exp(omega * t1) - s0.value) / t1 - omega * s0.value;
  const position = compareCurve(
    back.y,
    t => criticallyDamped(SETTLE_K, s0.value, v0)(t - s0.t),
    0.75,
  );
  await writeEvidence(
    'curves/lightbox-dismiss-cancel-up',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {back, v0, size, position},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(back.y[0].value).toBeGreaterThan(40);
  expect(back.scale[0].value).toBeLessThan(0.99);
  expect(size.maxError, JSON.stringify(size.worst)).toBeLessThanOrEqual(0.002);
  expect(position.maxError, JSON.stringify(position.worst)).toBeLessThanOrEqual(
    0.75,
  );
  await expectRestored(v);
});

test('brought back within 10 pt of the start and held still, it springs back from rest', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  const back = await heldReturn(page, v, pullThenReturn(v.centre, 120, 4), [
    'translate',
  ]);
  const position = compareCurve(
    back.y,
    criticallyDamped(SETTLE_K, back.y[0].value),
    0.25,
  );
  await writeEvidence(
    'curves/lightbox-dismiss-cancel-return',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {back, position},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(back.y[0].value).toBeGreaterThan(2);
  expect(position.maxError, JSON.stringify(position.worst)).toBeLessThanOrEqual(
    0.25,
  );
  await expectRestored(v);
});

test('the backdrop keeps its blur at rest and fades without it while it moves', async ({
  page,
}) => {
  const v = await openViewer(page);
  const filter = async () =>
    v.dialog.evaluate(el => {
      const style = getComputedStyle(
        el,
        '::backdrop',
      ) as CSSStyleDeclaration & {webkitBackdropFilter?: string};
      return style.backdropFilter || style.webkitBackdropFilter || 'none';
    });
  expect(await filter()).toBe('blur(2px)');
  // On a 2-core limit a full-viewport blur repainted every frame of the fade
  // drops frames, so the drag fades the backdrop without it.
  let during: string | null = null;
  let moves = 0;
  await v.driver.play(pullThenReturn(v.centre, 120, 4), {
    onEvent: async step => {
      moves += step.type === 'touchMove' ? 1 : 0;
      if (step.type === 'touchMove' && moves === 10 && during == null) {
        during = await filter();
      }
    },
  });
  expect(during).toBe('none');
  await expectRestored(v);
  await expect.poll(filter).toBe('blur(2px)');
});

test('an 18 px flick down closes: its projected travel passes the commit point (FR36)', async ({
  page,
}) => {
  const v = await openViewer(page);
  // About 8 pt past the pan's threshold, quickly: short of the 10 pt commit
  // point, but the release velocity carries its projection past it.
  await v.driver.play(
    drag(
      v.centre,
      {x: v.centre.x, y: v.centre.y + 18},
      {durationMs: 40, restMs: 0},
    ),
  );
  await expect(v.dialog).toBeHidden();
});

test('without zoom, a dragged photo draws outside its own box', async ({
  page,
}) => {
  const v = await openViewer(page);
  let clipping: string[] | null = null;
  let moves = 0;
  await v.driver.play(
    drag(
      v.centre,
      {x: v.centre.x, y: v.centre.y + 120},
      {durationMs: 600, restMs: 150},
    ),
    {
      onEvent: async step => {
        moves += step.type === 'touchMove' ? 1 : 0;
        if (step.type === 'touchMove' && moves === 12 && clipping == null) {
          // Every box between the photo and the dialog (which clips at the
          // screen's edge) lets the moved photo show.
          clipping = await v.photo.evaluate(el => {
            const found: string[] = [];
            for (
              let box = el.parentElement;
              box != null && box.tagName !== 'DIALOG';
              box = box.parentElement
            ) {
              if (getComputedStyle(box).overflow !== 'visible') {
                found.push(box.className);
              }
            }
            return found;
          });
        }
      },
    },
  );
  expect(clipping).toEqual([]);
});

test('a slow short drag released below the threshold springs back', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  // 8 pt past the pan's threshold, slowly, held still: below the 10 pt a
  // release needs to dismiss.
  const back = await heldReturn(
    page,
    v,
    drag(
      v.centre,
      {x: v.centre.x, y: v.centre.y + THRESHOLD + 8},
      {durationMs: 600, restMs: 150},
    ),
    ['translate'],
  );
  const position = compareCurve(
    back.y,
    criticallyDamped(SETTLE_K, back.y[0].value),
    0.25,
  );
  await writeEvidence(
    'curves/lightbox-dismiss-cancel-short',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {back, position},
        null,
        1,
      ),
    },
    testInfo,
  );
  expect(back.y[0].value).toBeGreaterThan(4);
  expect(position.maxError, JSON.stringify(position.worst)).toBeLessThanOrEqual(
    0.25,
  );
  await expectRestored(v);
});

test('under Reduce Motion a cancelled drag returns by a fade of 200 ms or less, with no travel', async ({
  page,
}) => {
  // Under reduced motion, what a touch release starts fades in place. It never
  // moves or scales on its way back.
  await page.emulateMedia({reducedMotion: 'reduce'});
  const v = await openViewer(page);
  // The fade runs 200 ms. A hold sent after the lift can arrive after it ends
  // on a busy machine. So the page holds it itself as it starts.
  const hold = await armHold(page, v.photo, {
    judges: {target: v.photo, property: 'opacity'},
  });
  await v.driver.play(pullThenFlickUp(v.centre, 150, 60));
  const held = await hold.held();
  const duration = Math.max(...held.map(a => a.curveEndMs));
  const samples = await sampleCurve(v.photo, timeline(duration));
  await releaseAnimations(page);
  expect(duration).toBeLessThanOrEqual(205);
  const ys = samples.map(s => s.transform.translateY);
  const from = ys[0];
  const to = ys.at(-1) ?? from;
  for (const y of ys) {
    expect(Math.min(Math.abs(y - from), Math.abs(y - to))).toBeLessThan(0.5);
  }
  await waitForRest(v.photo);
  await expect(v.dialog).toBeVisible();
  await expectRestored(v);
});

test('the cancel keeps moving every frame while the main thread is blocked', async ({
  page,
}, testInfo) => {
  const v = await openViewer(page);
  await markElement(v.photo, {mode: 'outline'});
  // A compositor-only control animation in the same window: what the
  // compositor presented while the main thread spun, on this machine.
  await startBusyControl(page);
  const cast = await startScreencast(page);
  // Blocked inside the page once the return runs on the compositor, 16 ms in,
  // as the dismissal's proof is. The page already waits when the lift starts
  // the return. A block asked for after the drag's script returns lands later
  // in the return on a busy machine, and leaves less of it to judge.
  const blocking = blockMainThread(page, 600, {
    during: v.photo,
    minProgressMs: 16,
  });
  // Pulled 300 px, so the return is long enough to judge on a loaded runner.
  await v.driver.play(pullThenFlickUp(v.centre, 300, 60));
  const block = await blocking;
  // A few frames after the block, so the screencast holds its end.
  await frames(page, 6);
  const castFrames = await cast.stop();
  const [tracked, control] = await trackMarkers(page, castFrames, {
    colors: [MARKER_RGB, CONTROL_RGB],
  });
  // The spring slows hard at its end. Near the end each 60 Hz frame moves it
  // about 0.18 of what remains (2π / 0.5 s, critically damped). So within
  // about 5.6 cast steps of its end a frame moves less than one step, and
  // the cast shows plateaus there. Judging stops six cast steps from the end.
  const proof = busyWindowProof(
    tracked,
    {from: block.from, to: block.to},
    {axis: 'y', settledWithinSteps: 6, control},
  );
  await writeEvidence(
    'busy-main-thread/lightbox-dismiss-cancel',
    {
      [`${testInfo.project.name}.json`]: JSON.stringify(
        {block, proof, control},
        null,
        1,
      ),
    },
    testInfo,
  );
  // Judged against the control. A two-core runner's software compositor and
  // the screencast share the core the block spins on. So every compositor
  // animation presents fewer frames there, the control's too. The photo keeps
  // pace with the control, and a main-thread animation would not.
  expect(proof.verdict.failures).toEqual([]);
  expect(proof.monotonic).toBe(true);
  await expectRestored(v);
});

test(
  'storyboard: a cancelled drag',
  {tag: '@storyboard'},
  async ({page}, testInfo) => {
    const v = await openViewer(page);
    const down = {x: v.centre.x, y: v.centre.y + 150};
    // A storyboard plays the script at its own pace, and WebKit reads each
    // event at the time it arrives. So a release's velocity is not the
    // script's there. The drag comes back to 4 pt past the pan's threshold,
    // short of the 10 pt commit point, so its place alone cancels it.
    const back = {x: down.x, y: v.centre.y + THRESHOLD + 4};
    const script: TouchScript = drag(v.centre, down, {
      durationMs: 300,
      hz: 20,
    })
      .slice(0, -1)
      .concat(
        drag(down, back, {durationMs: 150, hz: 20})
          .slice(1)
          .map(f => ({...f, t: f.t + 320})),
      );
    const board = await touchStoryboard(page, v.driver, script, {
      name: 'lightbox-drag-cancel',
      measure: async () => {
        const s = await v.photoState();
        return {
          y: +s.y.toFixed(1),
          scale: +s.scale.toFixed(3),
          backdrop: +(await v.backdropAlpha()).toFixed(2),
        };
      },
      columns: 5,
      cellScale: 0.35,
    });
    await board.write(testInfo);
  },
);
