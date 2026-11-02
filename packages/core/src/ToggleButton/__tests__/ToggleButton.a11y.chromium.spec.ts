// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^internal/a11y-spec/src/patterns/toggle-button

/**
 * @file ToggleButton.a11y.chromium.spec.ts
 * @input Uses the reusable toggle-button contract and checked-in Storybook states
 * @output Accessibility-tree and real-browser evidence for ToggleButton
 * @position Component binding; jsdom covers only the DOM layer.
 *
 * SYNC: States and story IDs live in ToggleButton.a11y.states.ts and
 *   apps/storybook/stories/ToggleButtonPatternA11y.stories.tsx.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {
  TOGGLE_BUTTON_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  formatReport,
  neverExercised,
  spokenWords,
  summarize,
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
import {
  TOGGLE_BUTTON_BINDING_STATES,
  type ToggleButtonBindingRow,
} from './ToggleButton.a11y.states';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

async function mountState(
  page: Page,
  state: ToggleButtonBindingRow,
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${state.storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page
    .locator('#storybook-root')
    .getByRole('button')
    .first()
    .waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: ToggleButtonBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TOGGLE_BUTTON_PATTERN,
    binding: 'ToggleButton',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator('#storybook-root').getByRole('button').first(),
      });
    },
  });
}

function namesTheSameLabel(rendered: string, claimed: string): boolean {
  const words = spokenWords(rendered);
  const expected = spokenWords(claimed);
  return (
    words.length === expected.length &&
    words.every((word, index) => word === expected[index])
  );
}

test('the state inventory matches rendered labels and applicability facts', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of TOGGLE_BUTTON_BINDING_STATES) {
    await mountState(page, state);
    const locator = page.locator('#storybook-root').getByRole('button').first();
    const harness = createChromiumHarness({page, cdp, subject: locator});
    const subject = await harness.subject();
    const computed = await subject.computed();
    const rendered = await subject.visibleLabelText();
    const labelMatches =
      state.visibleLabel == null
        ? rendered == null
        : rendered != null && namesTheSameLabel(rendered, state.visibleLabel);
    if (!labelMatches) {
      wrong.push(
        `${state.id}: inventory label ${JSON.stringify(state.visibleLabel)}, rendered ${JSON.stringify(rendered)}`,
      );
    }

    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    let reachedByTab = false;
    for (let step = 0; step < 10 && !reachedByTab; step += 1) {
      await page.keyboard.press('Tab');
      reachedByTab = await locator.evaluate(
        element => element.ownerDocument.activeElement === element,
      );
    }
    const observed = {
      unavailable: computed.disabled,
      focusable: reachedByTab,
      described: computed.description.trim() !== '',
    };
    for (const fact of ['unavailable', 'focusable', 'described'] as const) {
      if (observed[fact] !== state.facts[fact]) {
        wrong.push(
          `${state.id}: declares ${fact}=${state.facts[fact]}, browser exposes ${observed[fact]}`,
        );
      }
    }
  }
  expect(wrong).toEqual([]);
});

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of TOGGLE_BUTTON_BINDING_STATES) {
  test(`ToggleButton [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(TOGGLE_BUTTON_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's evidence
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised by at least one ToggleButton state', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TOGGLE_BUTTON_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
});
