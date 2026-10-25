// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/carousel|packages/core/src/Carousel/|apps/storybook/stories/CarouselA11y)

/**
 * @file Carousel.a11y.chromium.spec.ts
 * @input Uses the shared Carousel contract, Chromium harness, checked-in stories, and binding inventory
 * @output Real-browser and accessibility-tree evidence for Carousel semantics and focus
 * @position Browser lane required by AST-013; it makes no real-AT claim.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  CAROUSEL_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  neverExercised,
  summarize,
  unmatchedKnownFailures,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {
  createChromiumHarness,
  holdMotionStill,
} from '@astryxdesign/a11y-spec/chromium';
import {
  DEFAULT_STORYBOOK_DIR,
  serveStorybook,
  type StaticServer,
} from '@astryxdesign/a11y-spec/storybook';
import {CAROUSEL_KNOWN_FAILURES} from './Carousel.a11y.known-failures';
import {
  CAROUSEL_BINDING_STATES,
  type CarouselBindingRow,
} from './Carousel.a11y.states';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

function storyUrl(storyId: string): string {
  return `${storybook.origin}/iframe.html?id=${storyId}&viewMode=story`;
}

function subjectFor(page: Page, state: CarouselBindingRow): Locator {
  const root = page.locator('#storybook-root');
  if ('selector' in state.subject) {
    return root.locator(state.subject.selector);
  }
  return root.getByRole(state.subject.role, {
    name: state.subject.name,
    includeHidden: true,
  });
}

function relatedFor(
  page: Page,
  state: CarouselBindingRow,
): Readonly<Record<string, Locator>> {
  const root = page.locator('#storybook-root');
  return Object.fromEntries(
    Object.entries(state.relations ?? {}).map(([name, relation]) => [
      name,
      root.locator(relation.selector),
    ]),
  );
}

async function mountState(
  page: Page,
  state: CarouselBindingRow,
): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await subjectFor(page, state).waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CarouselBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: CAROUSEL_PATTERN,
    binding: 'Carousel',
    state: state.id,
    facts: state.facts,
    knownFailures: CAROUSEL_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        subject: subjectFor(page, state),
        cdp,
        related: relatedFor(page, state),
      });
    },
  });
}

function bindingState(id: string): CarouselBindingRow {
  const state = CAROUSEL_BINDING_STATES.find(candidate => candidate.id === id);
  if (state == null) {
    throw new Error(`no Carousel binding state "${id}"`);
  }
  return state;
}

test('every expectation is exercised by at least one Carousel state', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of CAROUSEL_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(CAROUSEL_KNOWN_FAILURES, results)).toEqual([]);
});

for (const state of CAROUSEL_BINDING_STATES) {
  test(`Carousel [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(CAROUSEL_PATTERN, [result]);
    // Required rows block (AST-020 FR9); advisory rows and exact known
    // failures report.
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
  });
}

test('the off-screen binding is outside the scroll viewport but remains exposed', async ({
  page,
}) => {
  const state = bindingState('slide-offscreen');
  await mountState(page, state);
  const slide = subjectFor(page, state);
  const scroller = page.locator(
    '[data-testid="carousel-a11y"] > .astryx-carousel-scroller',
  );
  const [slideBox, scrollerBox] = await Promise.all([
    slide.boundingBox(),
    scroller.boundingBox(),
  ]);
  if (slideBox == null || scrollerBox == null) {
    throw new Error(
      'the off-screen geometry fixture did not render measurable boxes',
    );
  }
  expect(slideBox.x).toBeGreaterThanOrEqual(scrollerBox.x + scrollerBox.width);
  const cdp = await page.context().newCDPSession(page);
  const result = await runState(page, cdp, state);
  expect(
    result.results.find(
      row => row.expectation === 'carousel.slide.offscreen-exposed',
    )?.status,
  ).toBe('pass');
});

test('the scroll container pans from the keyboard and honors reduced motion', async ({
  page,
}) => {
  const state = bindingState('scroller-keyboard');
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  const scroller = subjectFor(page, state);
  await scroller.focus();
  expect(
    await scroller.evaluate(
      element => getComputedStyle(element).scrollBehavior,
    ),
  ).toBe('auto');
  const before = await scroller.evaluate(element => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => scroller.evaluate(element => element.scrollLeft))
    .toBeGreaterThan(before);
});
