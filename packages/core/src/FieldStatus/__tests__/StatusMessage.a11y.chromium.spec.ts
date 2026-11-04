// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file StatusMessage.a11y.chromium.spec.ts
 * @input Uses the shared status-message contract, checked-in stories, Core state inventory, and exact known failures
 * @output Real-browser and accessibility-tree evidence for every current Core status-message binding
 * @position Browser migration lane; it makes no claim about assistive-technology speech or timing
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  STATUS_MESSAGE_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  formatReport,
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
import {CORE_STATUS_MESSAGE_KNOWN_FAILURES} from './StatusMessage.a11y.known-failures';
import {
  CORE_STATUS_MESSAGE_BINDING_STATES,
  type CoreStatusMessageBindingState,
} from './StatusMessage.a11y.states';

function transitionTestId(name: string): string {
  return `status-transition-${name}`;
}

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

const BOUND_SUBJECT_ATTRIBUTE = 'data-a11y-binding-subject';

function subjectFor(page: Page): Locator {
  return page.locator(`[${BOUND_SUBJECT_ATTRIBUTE}]`);
}

async function bindSubject(
  page: Page,
  state: CoreStatusMessageBindingState,
): Promise<void> {
  const facts = state.facts;
  const role = facts.kind === 'progressbar' ? 'progressbar' : facts.role;
  if (role == null) {
    throw new Error(
      `${state.id}: this component binding declares no public role`,
    );
  }
  const candidates = page.getByRole(role, {includeHidden: true});
  let target: Locator;
  if (facts.kind === 'progressbar') {
    target = page.getByRole(role, {includeHidden: true, name: facts.name});
  } else if (facts.messageSource === 'accessible-name') {
    target = page.getByRole(role, {
      includeHidden: true,
      name: facts.initialMessage,
    });
  } else {
    const texts = await candidates.evaluateAll(elements =>
      elements.map(element =>
        (element.textContent ?? '').replace(/\s+/g, ' ').trim(),
      ),
    );
    const indexes = texts.flatMap((text, index) =>
      text === facts.initialMessage ? [index] : [],
    );
    if (indexes.length !== 1) {
      throw new Error(
        `${state.id}: expected one ${role} subject in initial state, found ${indexes.length}`,
      );
    }
    target = candidates.nth(indexes[0]);
  }
  await expect(target).toHaveCount(1);
  await target.evaluate((element, attribute) => {
    element.setAttribute(attribute, '');
  }, BOUND_SUBJECT_ATTRIBUTE);
}

async function mountState(
  page: Page,
  state: CoreStatusMessageBindingState,
): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await page.locator('[data-a11y-ready="true"]').waitFor({state: 'attached'});
  await bindSubject(page, state);
  await subjectFor(page).waitFor({state: 'attached'});
  await expect(subjectFor(page)).toHaveCount(1);
  if ('focusSelector' in state) {
    await expect(page.locator(state.focusSelector)).toHaveAttribute(
      'aria-describedby',
      /\S+/,
    );
  }
}

async function transition(page: Page, name: string): Promise<void> {
  await page
    .getByTestId(transitionTestId(name))
    .evaluate(element => (element as HTMLElement).click());
  await page.evaluate(
    async () =>
      new Promise<void>(resolve =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CoreStatusMessageBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: STATUS_MESSAGE_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: CORE_STATUS_MESSAGE_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: subjectFor(page),
        related: {
          'focus-anchor': page.locator(
            'focusSelector' in state
              ? state.focusSelector
              : '[data-a11y-relation="focus-anchor"]',
          ),
        },
      });
    },
    transition: async name => transition(page, name),
  });
}

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of CORE_STATUS_MESSAGE_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(2 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(STATUS_MESSAGE_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised by at least one Core binding state', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of CORE_STATUS_MESSAGE_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(
    unmatchedKnownFailures(CORE_STATUS_MESSAGE_KNOWN_FAILURES, results),
  ).toEqual([]);
});
