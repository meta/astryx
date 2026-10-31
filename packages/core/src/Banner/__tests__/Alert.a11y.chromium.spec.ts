// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y scope ^(internal/a11y-spec/src/patterns/status-message\.|internal/a11y-spec/src/harness|packages/core/src/Banner/|packages/core/src/Button/|packages/core/src/Tooltip/|apps/storybook/stories/AlertA11y)

/** Real-browser and accessibility-tree binding for Banner's urgent alert states. */

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
import {BANNER_ALERT_KNOWN_FAILURES} from './Alert.a11y.known-failures';
import {
  BANNER_ALERT_BINDING_STATES,
  type BannerAlertBindingState,
} from './Alert.a11y.states';

function transitionTestId(name: string): string {
  return `alert-transition-${name}`;
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

const BOUND_SUBJECT_ATTRIBUTE = 'data-a11y-binding-subject';

function subjectFor(page: Page): Locator {
  return page.locator(`[${BOUND_SUBJECT_ATTRIBUTE}]`);
}

async function mountState(
  page: Page,
  state: BannerAlertBindingState,
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${state.storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  await page.locator('[data-a11y-ready="true"]').waitFor({state: 'attached'});
  const candidates = page.getByRole('alert', {includeHidden: true});
  const count = await candidates.count();
  if (count !== 1) {
    throw new Error(`${state.id}: expected one alert subject, found ${count}`);
  }
  await candidates.first().evaluate((element, attribute) => {
    element.setAttribute(attribute, '');
  }, BOUND_SUBJECT_ATTRIBUTE);
  await expect(subjectFor(page)).toHaveCount(1);
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
  state: BannerAlertBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: STATUS_MESSAGE_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: BANNER_ALERT_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject: subjectFor(page),
        related: {
          'focus-anchor': page.locator('[data-a11y-relation="focus-anchor"]'),
        },
      });
    },
    transition: async name => transition(page, name),
  });
}

test('all Banner alert states have no unmatched known failure', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of BANNER_ALERT_BINDING_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(unmatchedKnownFailures(BANNER_ALERT_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});

for (const state of BANNER_ALERT_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(STATUS_MESSAGE_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
