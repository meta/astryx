// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file TextInput.a11y.chromium.spec.ts
 * @input Uses the shared text-input contract, Chromium harness, checked-in
 *   TextInputA11y stories, state inventory, and exact known failures
 * @output Real-browser and accessibility-tree evidence for TextInput and TextArea
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
  TEXT_INPUT_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  formatReport,
  neverExercised,
  spokenWords,
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
import {TEXT_INPUT_KNOWN_FAILURES} from './TextInput.a11y.known-failures';
import {
  TEXT_INPUT_BINDING_STATES,
  type TextInputBindingRow,
} from './TextInput.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-text-input-subject]';
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

function subjectFor(page: Page): Locator {
  return page.locator('#storybook-root').locator(SUBJECT_SELECTOR);
}

async function mountState(
  page: Page,
  state: TextInputBindingRow,
): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await subjectFor(page).waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: TextInputBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TEXT_INPUT_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TEXT_INPUT_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({page, subject: subjectFor(page), cdp});
    },
  });
}

const FIELD_MARKERS = ['required', 'optional'];

function sameVisibleWords(rendered: string, claimed: string): boolean {
  const words = [...spokenWords(rendered)];
  const last = words[words.length - 1];
  if (last != null && FIELD_MARKERS.includes(last)) {
    words.pop();
  }
  const expected = spokenWords(claimed);
  return (
    words.length === expected.length &&
    words.every((word, index) => word === expected[index])
  );
}

test('the state inventory describes each visible label', async ({page}) => {
  test.setTimeout(4 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of TEXT_INPUT_BINDING_STATES) {
    await mountState(page, state);
    const subject = await createChromiumHarness({
      page,
      subject: subjectFor(page),
      cdp,
    }).subject();
    const rendered = await subject.visibleLabelText();
    const matches =
      state.visibleLabel == null
        ? rendered == null
        : rendered != null && sameVisibleWords(rendered, state.visibleLabel);
    if (!matches) {
      wrong.push(
        `${state.id}: inventory says ${JSON.stringify(state.visibleLabel)}, page renders ${JSON.stringify(rendered)}`,
      );
    }
  }
  expect(wrong).toEqual([]);
});

test('every state declaration matches the browser accessibility node', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of TEXT_INPUT_BINDING_STATES) {
    await mountState(page, state);
    const subject = await createChromiumHarness({
      page,
      subject: subjectFor(page),
      cdp,
    }).subject();
    const computed = await subject.computed();
    const observed = {
      role: state.facts.role == null ? null : computed.role,
      value: state.facts.value == null ? null : computed.value,
      multiline: computed.multiline,
      disabled: computed.disabled,
      readOnly: state.facts.disabled ? false : computed.readOnly,
      required: computed.required,
      invalid: computed.invalid,
      description:
        computed.description.trim() === '' ? null : computed.description,
    } as const;
    const expected = {
      role: state.facts.role,
      value: state.facts.value,
      multiline: state.facts.multiline,
      disabled: state.facts.disabled,
      readOnly: state.facts.readOnly,
      required: state.facts.required,
      invalid: state.facts.invalid,
      description: state.facts.description,
    } as const;
    for (const fact of Object.keys(expected) as (keyof typeof expected)[]) {
      if (observed[fact] !== expected[fact]) {
        wrong.push(
          `${state.id}: declares ${fact}=${String(expected[fact])}, browser exposes ${String(observed[fact])}`,
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

for (const state of TEXT_INPUT_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(3 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(TEXT_INPUT_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised and every known failure matches once', async ({
  page,
}) => {
  test.setTimeout(8 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TEXT_INPUT_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(TEXT_INPUT_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});
