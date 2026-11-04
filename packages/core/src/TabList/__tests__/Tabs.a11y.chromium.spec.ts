// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Tabs.a11y.chromium.spec.ts
 * @input Uses the shared Tabs contract, Chromium harness, checked-in stories, inventory, and exact known failures
 * @output Real-browser and accessibility-tree evidence for explicit TabList Tabs parts
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
  TABS_PATTERN,
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
import {TABS_KNOWN_FAILURES} from './Tabs.a11y.known-failures';
import {
  TABS_BINDING_STATES,
  type TabsBindingRow,
  type TabsBindingState,
} from './Tabs.a11y.states';

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

function subjectFor(page: Page, state: TabsBindingRow): Locator {
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
  state: TabsBindingRow,
): Readonly<Record<string, Locator>> {
  const metadata = state as TabsBindingState;
  const root = page.locator('#storybook-root');
  return Object.fromEntries(
    Object.entries(metadata.relations ?? {}).map(([name, relation]) => [
      name,
      root.locator(relation.selector),
    ]),
  );
}

async function mountState(page: Page, state: TabsBindingRow): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await subjectFor(page, state).waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: TabsBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TABS_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TABS_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        subject: subjectFor(page, state),
        cdp,
        visibleLabel: state.facts.visibleLabel ? undefined : null,
        related: relatedFor(page, state),
      });
    },
  });
}

test('every binding fact matches the rendered semantic state', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];

  for (const state of TABS_BINDING_STATES) {
    await mountState(page, state);
    const subject = await createChromiumHarness({
      page,
      subject: subjectFor(page, state),
      cdp,
      related: relatedFor(page, state),
    }).subject();
    const computed = await subject.computed();

    const expectedRole =
      state.facts.part === 'tablist'
        ? 'tablist'
        : state.facts.part === 'tab'
          ? 'tab'
          : state.facts.active === false
            ? null
            : 'tabpanel';
    if (computed.role !== expectedRole) {
      wrong.push(
        `${state.id}: declares role=${expectedRole}, browser exposes ${computed.role}`,
      );
    }
    if (
      state.facts.selected != null &&
      computed.selected !== state.facts.selected
    ) {
      wrong.push(
        `${state.id}: declares selected=${state.facts.selected}, browser exposes ${computed.selected}`,
      );
    }
    if (
      state.facts.disabled != null &&
      computed.disabled !== state.facts.disabled
    ) {
      wrong.push(
        `${state.id}: declares disabled=${state.facts.disabled}, browser exposes ${computed.disabled}`,
      );
    }
  }

  expect(wrong).toEqual([]);
});

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of TABS_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(3 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(TABS_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}

test('every expectation is exercised by at least one bound state', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of TABS_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(TABS_KNOWN_FAILURES, results)).toEqual([]);
});
