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
 *   and one steady scrim through a handoff.
 * @position Cross-browser proof; jsdom presents no dialog and contains no
 *   focus, so BottomSheetSwitcher.test.tsx can only assert the calls. WebKit
 *   here is desktop WebKit under Playwright, not iOS Safari.
 */

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

/** A finger drag over the backdrop; Chromium only (CDP), WebKit has no API. */
async function touchScrollDown(page: Page, browserName: string) {
  if (browserName !== 'chromium') {
    return;
  }
  const session = await page.context().newCDPSession(page);
  await session.send('Input.synthesizeScrollGesture', {
    x: 195,
    y: 120,
    yDistance: -300,
    gestureSourceType: 'touch',
    speed: 800,
  });
  await session.detach();
  await page.waitForTimeout(250);
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
  /** Page-clock ms since the second dialog opened; -1 before that. */
  sinceBothOpen: number;
  where: string;
  moved: boolean;
  insideInert: boolean;
  retained: {open: boolean; inert: boolean; ariaHidden: string | null} | null;
}> {
  return page.evaluate(name => {
    const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
    const clock = window as {__bothOpenAt?: number};
    const sinceBothOpen =
      clock.__bothOpenAt == null
        ? -1
        : Math.round(performance.now() - clock.__bothOpenAt);
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
      sinceBothOpen,
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

test('focus is inside the entering sheet as soon as both dialogs are open, and Tab reaches stops inside it for as long as the retained dialog is open, which stays inert and hidden through its fade, and inside the flow after the handoff', async ({
  page,
}) => {
  await mountScrollable(page);
  await openFlow(page);
  // Stamp the page clock the moment the second dialog opens, so the late
  // window below is measured from the handoff itself, not from when the
  // test runner got around to reading it on a slow run.
  await page.evaluate(() => {
    const clock = window as {__bothOpenAt?: number};
    clock.__bothOpenAt = undefined;
    const observer = new MutationObserver(() => {
      if (
        clock.__bothOpenAt == null &&
        document.querySelectorAll('dialog[open]').length >= 2
      ) {
        clock.__bothOpenAt = performance.now();
        observer.disconnect();
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['open'],
    });
  });
  await page.getByRole('button', {name: 'Continue', exact: true}).click();
  // Both dialogs are open for the handoff's ~650ms: the retained one holds
  // still, then fades from ~345ms, then closes. Step with Tab until it has
  // closed, reading open count, focus, and the retained dialog's attributes
  // in one evaluate per step: focus must land in the entering sheet's dialog
  // ("Notification frequency"), never in the retained one ("Set up
  // notifications") or the page, and the retained dialog must carry `inert`
  // and `aria-hidden` on every step it is still open, the fade included.
  await expect(page.locator('dialog[open]')).toHaveCount(2);
  // The entering sheet takes focus with its presentation, before any Tab:
  // the moment both dialogs are open, focus is inside "Notification
  // frequency" and outside every inert subtree. An entering sheet made
  // inert while it enters would leave focus on <body> for its first ~300ms.
  const atOpen = await handoffStep(page, OPENER);
  expect(atOpen.openCount).toBe(2);
  expect(atOpen.where, 'focus as soon as both dialogs are open').toBe(
    'Notification frequency',
  );
  expect(atOpen.insideInert, 'focus inside an inert subtree at open').toBe(
    false,
  );
  expect(atOpen.sinceBothOpen).toBeGreaterThanOrEqual(0);
  let midHandoffPresses = 0;
  let lateHandoffPresses = 0;
  let midHandoffStopsInside = 0;
  let lateHandoffStopsInside = 0;
  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    const step = await handoffStep(page, OPENER);
    if (step.openCount < 2 || step.retained?.open !== true) {
      break;
    }
    midHandoffPresses += 1;
    // "Late" is inside the retained dialog's fade (from ~345ms after both
    // opened), on the page's own clock.
    const isLate = step.sinceBothOpen > 400;
    if (isLate) {
      lateHandoffPresses += 1;
    }
    const label = `mid-handoff, Tab ${index + 1} at ${step.sinceBothOpen}ms`;
    expect(step.where, label).not.toBe('page');
    expect(step.where, label).not.toBe(OPENER);
    expect(['Notification frequency', 'body'], label).toContain(step.where);
    // A stop inside the entering sheet is a Tab that moved focus onto a
    // focusable element there, outside any inert subtree; focus merely left
    // where the presentation put it, inside a dialog that went inert, is not.
    expect(step.insideInert, `${label}: focus inside an inert subtree`).toBe(
      false,
    );
    if (step.where === 'Notification frequency' && step.moved) {
      midHandoffStopsInside += 1;
      if (isLate) {
        lateHandoffStopsInside += 1;
      }
    }
    expect(step.retained.inert, `${label}: retained dialog inert`).toBe(true);
    expect(step.retained.ariaHidden, `${label}: retained aria-hidden`).toBe(
      'true',
    );
    await page.waitForTimeout(40);
  }
  // Presses landed both before and during the retained dialog's fade, else
  // the test proved nothing about the handoff; and at least one of them
  // stopped inside the entering sheet, else an entering sheet that can never
  // take focus (every stop on the browser-UI `body` stop) would pass.
  expect(midHandoffPresses).toBeGreaterThan(2);
  expect(lateHandoffPresses).toBeGreaterThan(0);
  expect(midHandoffStopsInside).toBeGreaterThan(0);
  // ...and at least one of those stops landed inside the retained dialog's
  // fade (from ~345ms), so an entering sheet that went inert only while the
  // retained one fades would not pass.
  expect(lateHandoffStopsInside).toBeGreaterThan(0);

  await expect(page.locator('dialog[open]')).toHaveCount(1, {timeout: 3000});
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
  const samples = await page.evaluate(
    async () =>
      new Promise<number[]>(resolve => {
        const dims: number[] = [];
        const start = performance.now();
        const tick = () => {
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
          dims.push(Number((1 - combined).toFixed(3)));
          if (performance.now() - start < 1100) {
            requestAnimationFrame(tick);
          } else {
            resolve(dims);
          }
        };
        Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            'dialog[open]:not([inert]) button',
          ),
        )
          .find(button => button.textContent?.trim() === 'Continue')
          ?.click();
        requestAnimationFrame(tick);
      }),
  );
  expect(samples.length).toBeGreaterThan(20);
  const steady = samples[0];
  expect(steady).toBeGreaterThan(0.3);
  for (const dim of samples) {
    expect(dim).toBeGreaterThanOrEqual(steady * 0.9);
    expect(dim).toBeLessThanOrEqual(steady * 1.05);
  }
});
