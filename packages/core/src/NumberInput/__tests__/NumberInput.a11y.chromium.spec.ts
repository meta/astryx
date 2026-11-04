// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/** Real-browser and accessibility-tree binding evidence for NumberInput. */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {
  SPINBUTTON_PATTERN,
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
import {NUMBER_INPUT_KNOWN_FAILURES} from './NumberInput.a11y.known-failures';
import {
  NUMBER_INPUT_A11Y_STATES,
  type NumberInputA11yRow,
} from './NumberInput.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-spinbutton-subject]';
let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => storybook?.close());

function storyUrl(id: string): string {
  return `${storybook.origin}/iframe.html?id=${id}&viewMode=story`;
}

async function mount(page: Page, state: NumberInputA11yRow): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await page.locator(SUBJECT_SELECTOR).waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: NumberInputA11yRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SPINBUTTON_PATTERN,
    binding: 'NumberInput',
    state: state.id,
    facts: state.facts,
    knownFailures: NUMBER_INPUT_KNOWN_FAILURES,
    mount: async () => {
      await mount(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: page.locator(SUBJECT_SELECTOR),
      });
    },
  });
}

test('the Chromium read-only omission remains exact visible debt', async ({
  page,
}) => {
  const state = NUMBER_INPUT_A11Y_STATES.find(
    candidate => candidate.id === 'read-only',
  );
  if (state == null) {
    throw new Error('missing NumberInput accessibility state: read-only');
  }
  const cdp = await page.context().newCDPSession(page);
  const result = await runState(page, cdp, state);
  const readOnly = result.results.find(
    candidate => candidate.expectation === 'spinbutton.readonly.exposed',
  );
  expect(readOnly?.status).toBe('known-failure');
  expect(readOnly?.knownFailure).toBe(NUMBER_INPUT_KNOWN_FAILURES[0]);
});

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of NUMBER_INPUT_A11Y_STATES) {
  test(`NumberInput [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(SPINBUTTON_PATTERN, [result]);
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised by at least one NumberInput state', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of NUMBER_INPUT_A11Y_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(NUMBER_INPUT_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});
