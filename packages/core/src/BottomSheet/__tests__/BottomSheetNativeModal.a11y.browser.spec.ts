// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file BottomSheetNativeModal.a11y.browser.spec.ts
 * @input The `Core/BottomSheetSwitcher` stories in a built Storybook, and
 *   real Chromium/WebKit wheel, keyboard, and pointer input.
 * @output Browser evidence for a flow whose every sheet owns a native modal
 *   dialog: the flow's one page scroll lock (the shared hook, as Dialog)
 *   holding while two sheet dialogs are open through a handoff and under a
 *   Core Dialog opened from a step, never released between steps nor when
 *   that Dialog closes, and the page's offset restored after the exit; Tab landing inside the entering sheet's dialog
 *   as soon as both dialogs are open and on Tab stops for as long as the
 *   retained dialog is open beneath it (its fade included), never the page
 *   once the handoff is done, by the browser's own containment, with the
 *   retained dialog carrying `inert` and `aria-hidden` on every step it is
 *   open; Escape and
 *   the backdrop dismissing by purpose with focus returned to the opener;
 *   and one steady scrim through a handoff. The handoff cases hold it phase
 *   by phase with the interaction harness (sheet panel transitions stretched
 *   and held, the page's timers frozen), so neither depends on how fast the
 *   machine runs.
 * @position Cross-browser proof; jsdom presents no dialog and contains no
 *   focus, so BottomSheetSwitcher.test.tsx can only assert the calls. WebKit
 *   here is desktop WebKit under Playwright, not iOS Safari.
 */

import {expect, test, type Locator, type Page} from '@playwright/test';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {
  freezeTimers,
  holdAnimations,
  installTimerGate,
  releaseAnimations,
  seekAnimations,
  thawTimers,
  waitForRest,
  watchAnimations,
} from '@astryxdesign/interaction-harness';

let storybook: StaticServer;
test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});
test.afterAll(async () => {
  await storybook?.close();
});

test.use({viewport: {width: 390, height: 844}, hasTouch: true});

const OPENER = 'Set up notifications';

/**
 * Open a switcher story with the flow closed and the page made scrollable:
 * a tall spacer below the story, scrolled part way down, so a lock that
 * fails would show as a change in `scrollY`.
 */
async function mountScrollable(page: Page, story = 'hug-content') {
  await page.goto(
    `${storybook.origin}/iframe.html?id=core-bottomsheetswitcher--${story}&viewMode=story`,
  );
  // The story's play function opens the flow; start from closed.
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.id = 'spacer';
    spacer.style.height = '3000px';
    document.body.appendChild(spacer);
    const counter = window as {__scrollEvents?: number};
    counter.__scrollEvents = 0;
    window.addEventListener('scroll', () => {
      counter.__scrollEvents = (counter.__scrollEvents ?? 0) + 1;
    });
    window.scrollTo(0, 300);
  });
  expect(await page.evaluate(() => window.scrollY)).toBe(300);
}

/**
 * The shared lock's pin on <body>, and the page's offset as the lock sees
 * it: while pinned, `scrollY` reads 0 and the saved offset is `top`; after
 * release, `scrollY` is the restored offset. `scrollEvents` counts window
 * scroll events since `resetScrollCounter`: a lock released and re-acquired
 * between steps restores the offset and pins again, which fires one.
 */
async function lockState(page: Page): Promise<{
  position: string;
  top: string;
  scrollY: number;
  scrollEvents: number;
}> {
  return page.evaluate(() => ({
    position: document.body.style.position,
    top: document.body.style.top,
    scrollY: window.scrollY,
    scrollEvents: (window as {__scrollEvents?: number}).__scrollEvents ?? 0,
  }));
}

/**
 * Zero the counter once the events already owed have arrived: the spacer
 * scroll in `mountScrollable` and the lock's own pin (300 → 0) each fire one
 * window `scroll` event, and WebKit delivers them late on a cold run.
 */
async function resetScrollCounter(page: Page) {
  await page
    .waitForFunction(
      () => ((window as {__scrollEvents?: number}).__scrollEvents ?? 0) >= 2,
      undefined,
      {timeout: 3000},
    )
    .catch(() => {});
  await page.evaluate(() => {
    (window as {__scrollEvents?: number}).__scrollEvents = 0;
  });
}

async function wheelDown(page: Page) {
  // Over the top of the viewport: the backdrop when a modal sheet is open,
  // the page otherwise.
  await page.mouse.move(195, 80);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(250);
}

/**
 * A finger drag up the backdrop, 300 px in 12 moves, as dispatched touch events
 * (CDP `Input.dispatchTouchEvent`); Chromium only, WebKit has no API here.
 * `Input.synthesizeScrollGesture` delivered the touchstart and touchend but no
 * touchmove, so the page never saw the finger move; the check below fails
 * unless the moves reach the page.
 */
async function touchScrollDown(page: Page, browserName: string) {
  if (browserName !== 'chromium') {
    return;
  }
  await page.evaluate(() => {
    const w = window as {__touchMoves?: number};
    w.__touchMoves = 0;
    document.addEventListener(
      'touchmove',
      () => {
        w.__touchMoves = (w.__touchMoves ?? 0) + 1;
      },
      {capture: true, passive: true},
    );
  });
  const session = await page.context().newCDPSession(page);
  const finger = (y: number) => [{x: 195, y, id: 1}];
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: finger(420),
  });
  for (let i = 1; i <= 12; i++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: finger(420 - i * 25),
    });
  }
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await session.detach();
  await page.waitForTimeout(250);
  expect(
    await page.evaluate(() => (window as {__touchMoves?: number}).__touchMoves),
    'the finger moved over the backdrop: touchmove reached the page',
  ).toBeGreaterThan(0);
}

/**
 * Open the flow from its opener without scrolling the page: a pointer click
 * would first scroll the opener into view, and the lock tests need the page
 * to stay where it was scrolled. The opener is focused first, as a real
 * activation would leave it, so focus return has somewhere to go.
 */
async function openFlow(page: Page) {
  await page.evaluate(name => {
    const opener = Array.from(document.querySelectorAll('button')).find(
      button => button.textContent?.trim() === name,
    );
    opener?.focus({preventScroll: true});
    opener?.click();
  }, OPENER);
  await expect(page.getByRole('dialog', {name: OPENER})).toBeVisible();
  await page.waitForTimeout(500);
}

test('the flow holds one page scroll lock through a handoff and under a Core Dialog opened from a step, never released between steps, and restores the offset after the exit', async ({
  page,
  browserName,
}) => {
  await mountScrollable(page, 'dialog-from-step');
  await openFlow(page);
  let state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.top).toBe('-300px');
  await resetScrollCounter(page);

  await page.getByRole('button', {name: 'Continue', exact: true}).click();
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.top).toBe('-300px');
  // Wheel and finger over the backdrop with both dialogs open: the pinned
  // page does not move.
  await wheelDown(page);
  await touchScrollDown(page, browserName);
  state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.top).toBe('-300px');
  expect(state.scrollY).toBe(0);
  await expect(page.locator('dialog[open]')).toHaveCount(1, {timeout: 3000});
  // One lock for the flow: the handoff released nothing, so the page never
  // scrolled back and forth between steps.
  state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.scrollEvents).toBe(0);

  // A Core Dialog opened from the step, as a builder would, takes the same
  // shared lock a second time; closing it must give back only its own hold,
  // leaving the flow's pin in place with the saved offset untouched.
  await page.getByRole('button', {name: 'Reset', exact: true}).click();
  const resetDialog = page.getByRole('dialog', {name: 'Reset frequency?'});
  await expect(resetDialog).toBeVisible();
  await wheelDown(page);
  state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.top).toBe('-300px');
  expect(state.scrollY).toBe(0);
  await page.getByRole('button', {name: 'Keep', exact: true}).click();
  await expect(resetDialog).toBeHidden();
  await page.waitForTimeout(400);
  state = await lockState(page);
  expect(state.position).toBe('fixed');
  expect(state.top).toBe('-300px');
  expect(state.scrollY).toBe(0);
  expect(state.scrollEvents).toBe(0);
  await wheelDown(page);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // The Dialog returned focus into the step, so Escape closes the flow.
  await expect(page.locator('dialog[open]')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0, {timeout: 3000});
  state = await lockState(page);
  expect(state.position).toBe('');
  expect(state.top).toBe('');
  expect(state.scrollY).toBe(300);
  // The page scrolls again.
  await wheelDown(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);
});

/**
 * One synchronous read per step: how many sheet dialogs are open, where focus
 * is (and whether it moved since the last read and sits outside any inert
 * subtree), and whether the retained dialog (by accessible name) still
 * carries `inert` and `aria-hidden`. Read together so a close between two
 * reads cannot make a stale attribute look like a regression, or hide one.
 */
async function handoffStep(
  page: Page,
  retainedName: string,
): Promise<{
  openCount: number;
  where: string;
  moved: boolean;
  insideInert: boolean;
  retained: {open: boolean; inert: boolean; ariaHidden: string | null} | null;
}> {
  return page.evaluate(name => {
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const active = document.activeElement;
    const tracker = window as {__lastActive?: Element | null};
    const moved = active !== tracker.__lastActive;
    tracker.__lastActive = active;
    const insideInert = active?.closest('[inert]') != null;
    const activeDialog = active?.closest('dialog') ?? null;
    const where =
      active == null || active === document.body
        ? 'body'
        : activeDialog == null
          ? 'page'
          : (activeDialog.getAttribute('aria-label') ?? '?');
    const retainedDialog = Array.from(document.querySelectorAll('dialog')).find(
      dialog => dialog.getAttribute('aria-label') === name,
    );
    return {
      openCount: openDialogs.length,
      where,
      moved,
      insideInert,
      retained:
        retainedDialog == null
          ? null
          : {
              open: retainedDialog.hasAttribute('open'),
              inert: retainedDialog.hasAttribute('inert'),
              ariaHidden: retainedDialog.getAttribute('aria-hidden'),
            },
    };
  }, retainedName);
}

/** How long a held phase's panel transitions are stretched to run, ms. */
const HELD_RUN_MS = 1_000_000;

/** The sheet the flow's Continue presents over the opener's. */
const ENTERING = 'Notification frequency';

/**
 * Prepares the switcher's handoff to be held phase by phase, so however busy
 * the machine, nothing moves it on until the test ends a phase. Once the open
 * sheet is at rest, panel transitions are stretched to `HELD_RUN_MS` and the
 * page's timers are frozen (the panels' backstop for a `transitionend` that
 * never comes among them). On a busy runner a 300ms transition can run out
 * before a hold sent from the test reaches it, a round trip later; a
 * stretched one is still near its start when held, and the tests read it by
 * progress, so its length doesn't change what they read. From here on, every
 * `::backdrop` transition is listed in `window.__backdropRuns`.
 */
async function prepareHandoffHold(page: Page) {
  await waitForRest(page.locator('dialog[open]'));
  await page.addStyleTag({
    content: `.astryx-bottom-sheet { transition-duration: ${HELD_RUN_MS}ms !important; }`,
  });
  await page.evaluate(() => {
    const runs: string[] = [];
    (window as unknown as {__backdropRuns: string[]}).__backdropRuns = runs;
    document.addEventListener(
      'transitionrun',
      event => {
        // WebKit runs a `::backdrop` transition on the dialog itself, with an
        // empty `pseudoElement`; these dialogs run no opacity transition of
        // their own.
        if (
          event.pseudoElement === '::backdrop' ||
          (event.target instanceof HTMLDialogElement &&
            event.propertyName === 'opacity')
        ) {
          const label = (event.target as Element).getAttribute('aria-label');
          runs.push(`${label}: ${event.propertyName}`);
        }
      },
      true,
    );
  });
  await installTimerGate(page);
  await freezeTimers(page);
}

/** The sheet panel inside the dialog labelled `label`. */
function sheetPanel(page: Page, label: string): Locator {
  return page.locator(`dialog[aria-label="${label}"] .astryx-bottom-sheet`);
}

/**
 * Runs `action`, which starts the handoff's next phase, waits until a
 * `property` transition runs on each of `movers` (the sheet panels that move
 * in that phase), and holds every running animation. Both sheet dialogs are
 * open through every phase.
 */
async function holdPhase(
  page: Page,
  movers: Locator[],
  property: 'transform' | 'opacity',
  action: () => Promise<void>,
) {
  const watches = [];
  for (const mover of movers) {
    watches.push(await watchAnimations(mover));
  }
  await action();
  for (const watch of watches) {
    const started = await watch.started({timeout: 10_000});
    expect(started.map(animation => animation.name)).toContain(property);
  }
  await holdAnimations(page);
  await expect(page.locator('dialog[open]')).toHaveCount(2);
}

/**
 * Holds the handoff's slide: the entering sheet slides in over the retained
 * one, which moves to line up with it.
 */
async function holdSlide(page: Page) {
  await holdPhase(
    page,
    [sheetPanel(page, ENTERING), sheetPanel(page, OPENER)],
    'transform',
    async () => startHandoff(page),
  );
}

/**
 * Ends the held slide (its `transitionend` moves the flow on) and holds the
 * retained sheet's fade.
 */
async function holdFade(page: Page) {
  await holdPhase(page, [sheetPanel(page, OPENER)], 'opacity', async () =>
    releaseAnimations(page, {finish: true}),
  );
}

/**
 * Starts the handoff: clicks the open sheet's Continue with `click()`, which
 * calls its handler at once. A pointer press would first run its own frames
 * and timers, which the frozen gate holds, and the handoff would not start.
 */
async function startHandoff(page: Page) {
  await page.evaluate(() => {
    Array.from(
      document.querySelectorAll<HTMLButtonElement>(
        'dialog[open]:not([inert]) button',
      ),
    )
      .find(button => button.textContent?.trim() === 'Continue')
      ?.click();
  });
}

/**
 * Presses Tab six times while a handoff phase is held, checking every step:
 * both dialogs open, focus in the entering sheet's dialog or on the
 * browser-UI `body` stop (never the page or the retained dialog) and outside
 * any inert subtree, and the retained dialog `inert` and `aria-hidden`.
 * Returns how many presses stopped inside the entering sheet.
 */
async function tabThroughHeldPhase(page: Page, phase: string) {
  let stopsInside = 0;
  for (let index = 0; index < 6; index += 1) {
    await page.keyboard.press('Tab');
    const step = await handoffStep(page, OPENER);
    const label = `${phase}, Tab ${index + 1}`;
    expect(step.openCount, label).toBe(2);
    expect(step.retained?.open, `${label}: retained dialog open`).toBe(true);
    expect(step.where, label).not.toBe('page');
    expect(step.where, label).not.toBe(OPENER);
    expect([ENTERING, 'body'], label).toContain(step.where);
    // A stop inside the entering sheet is a Tab that moved focus onto a
    // focusable element there, outside any inert subtree; focus merely left
    // where the presentation put it, inside a dialog that went inert, is not.
    expect(step.insideInert, `${label}: focus inside an inert subtree`).toBe(
      false,
    );
    expect(step.retained?.inert, `${label}: retained dialog inert`).toBe(true);
    expect(step.retained?.ariaHidden, `${label}: retained aria-hidden`).toBe(
      'true',
    );
    if (step.where === ENTERING && step.moved) {
      stopsInside += 1;
    }
  }
  return stopsInside;
}

test('focus is inside the entering sheet as soon as both dialogs are open, and Tab reaches stops inside it for as long as the retained dialog is open, which stays inert and hidden through its fade, and inside the flow after the handoff', async ({
  page,
}) => {
  await mountScrollable(page);
  await openFlow(page);
  await prepareHandoffHold(page);
  // The handoff, held phase by phase: the entering sheet slides in over the
  // retained one, then the retained one fades, then it closes. Focus must
  // land in the entering sheet's dialog ("Notification frequency"), never in
  // the retained one ("Set up notifications") or the page, and the retained
  // dialog must carry `inert` and `aria-hidden` on every step it is still
  // open, the fade included.
  await holdSlide(page);
  // The entering sheet takes focus with its presentation, before any Tab:
  // the moment both dialogs are open, focus is inside "Notification
  // frequency" and outside every inert subtree. An entering sheet made inert
  // while it enters would leave focus on <body> through its slide.
  const atOpen = await handoffStep(page, OPENER);
  expect(atOpen.openCount).toBe(2);
  expect(atOpen.where, 'focus as soon as both dialogs are open').toBe(ENTERING);
  expect(atOpen.insideInert, 'focus inside an inert subtree at open').toBe(
    false,
  );
  const slideStops = await tabThroughHeldPhase(page, 'slide');
  await holdFade(page);
  const fadeStops = await tabThroughHeldPhase(page, 'fade');
  await releaseAnimations(page, {finish: true});
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  await thawTimers(page);
  // At least one Tab in each phase stopped inside the entering sheet, else an
  // entering sheet that can never take focus (every stop on the browser-UI
  // `body` stop), or one inert only while the retained sheet fades, passes.
  expect(slideStops).toBeGreaterThan(0);
  expect(fadeStops).toBeGreaterThan(0);

  let stopsInside = 0;
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press('Tab');
    const step = await handoffStep(page, OPENER);
    expect(step.where, `after the handoff, Tab ${index + 1}`).not.toBe('page');
    expect(['Notification frequency', 'body']).toContain(step.where);
    expect(step.insideInert, `after the handoff, Tab ${index + 1}`).toBe(false);
    if (step.where === 'Notification frequency' && step.moved) {
      stopsInside += 1;
    }
  }
  expect(stopsInside).toBeGreaterThan(0);
});

test('Escape and a backdrop tap dismiss an info flow and return focus to the opener', async ({
  page,
}) => {
  await mountScrollable(page);
  const opener = page.getByRole('button', {name: OPENER});
  await openFlow(page);
  await page.getByRole('button', {name: 'Continue', exact: true}).click();
  await page.waitForTimeout(900);

  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0, {timeout: 3000});
  await expect(opener).toBeFocused();

  await openFlow(page);
  await page.mouse.click(195, 60);
  await expect(page.locator('dialog[open]')).toHaveCount(0, {timeout: 3000});
  await expect(opener).toBeFocused();
});

test('one steady scrim through a handoff: no dip and no double dim', async ({
  page,
}) => {
  await mountScrollable(page);
  await openFlow(page);
  await prepareHandoffHold(page);
  // Every modal dialog's backdrop together: 1 - (1 - a1)(1 - a2)…, each `a`
  // the backdrop color's alpha times its opacity.
  const combinedDim = async () =>
    page.evaluate(() => {
      let combined = 1;
      for (const dialog of document.querySelectorAll('dialog[open]')) {
        if (!dialog.matches(':modal')) {
          continue;
        }
        const style = getComputedStyle(dialog, '::backdrop');
        const match = /rgba?\(([^)]+)\)/.exec(style.backgroundColor);
        const parts = match
          ? match[1].split(/[,/]\s*|\s+/).filter(Boolean)
          : [];
        const alpha = parts.length === 4 ? Number(parts[3]) : 1;
        combined *= 1 - alpha * Number(style.opacity);
      }
      return Number((1 - combined).toFixed(3));
    });
  // The held phase read from 0 to 100% of its run in 5% steps.
  const readHeldPhase = async () => {
    const dims: number[] = [];
    for (let step = 0; step <= 20; step += 1) {
      await seekAnimations(page, (HELD_RUN_MS * step) / 20);
      dims.push(await combinedDim());
    }
    return dims;
  };
  const steady = await combinedDim();
  expect(steady).toBeGreaterThan(0.3);
  await holdSlide(page);
  const slide = await readHeldPhase();
  await holdFade(page);
  const fade = await readHeldPhase();
  // The retained dialog closes and the entering one takes the scrim.
  await releaseAnimations(page, {finish: true});
  await expect(page.locator('dialog[open]')).toHaveCount(1);
  const after = await combinedDim();
  // Every `::backdrop` transition the handoff ran, and any the page has made
  // but not yet announced (its `transitionrun` comes with the next frame).
  // WebKit reports one on the dialog itself, with an empty `pseudoElement`.
  const backdropRuns = await page.evaluate(() => [
    ...(window as unknown as {__backdropRuns: string[]}).__backdropRuns,
    ...document.getAnimations().flatMap(animation => {
      const effect = animation.effect as KeyframeEffect | null;
      const target = effect?.target ?? null;
      const property =
        'transitionProperty' in animation ? animation.transitionProperty : null;
      return effect?.pseudoElement === '::backdrop' ||
        (target instanceof HTMLDialogElement && property === 'opacity')
        ? [`${target?.getAttribute('aria-label')}: running`]
        : [];
    }),
  ]);
  await thawTimers(page);
  // No backdrop fades through the handoff, the takeover included: a scrim
  // handed over with a fade would dip between two reads.
  expect(backdropRuns).toEqual([]);
  for (const dim of [...slide, ...fade, after]) {
    expect(dim).toBeGreaterThanOrEqual(steady * 0.9);
    expect(dim).toBeLessThanOrEqual(steady * 1.05);
  }
});
