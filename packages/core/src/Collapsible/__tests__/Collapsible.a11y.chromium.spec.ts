// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Collapsible.a11y.chromium.spec.ts
 * @input Uses the disclosure contract, Chromium harness, checked-in stories, and Collapsible state inventory
 * @output Real-browser proof for every standalone Collapsible disclosure state
 * @position Browser binding. It makes no speech, braille, or group-policy claim.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  DISCLOSURE_PATTERN,
  blockingResults,
  checkAccessibilitySpec,
  formatFailures,
  formatReport,
  neverExercised,
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
  COLLAPSIBLE_DISCLOSURE_STATES,
  type CollapsibleDisclosureState,
} from './Collapsible.a11y.states';

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

async function mountState(
  page: Page,
  state: CollapsibleDisclosureState,
): Promise<{subject: Locator; content: Locator}> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  const subject = root.getByRole('button', {name: state.label});
  await subject.waitFor({state: 'attached'});
  const id = await subject.getAttribute('aria-controls');
  if (id == null) {
    throw new Error(`Collapsible state "${state.id}" has no aria-controls`);
  }
  const content = root.locator(`[id="${id}"]`);
  await content.waitFor({state: 'attached'});
  return {subject, content};
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CollapsibleDisclosureState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: DISCLOSURE_PATTERN,
    binding: 'Collapsible.trigger',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      const {subject, content} = await mountState(page, state);
      return createChromiumHarness({
        page,
        cdp,
        subject,
        related: {content},
      });
    },
  });
}

test('the state inventory matches rendered disclosure facts', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of COLLAPSIBLE_DISCLOSURE_STATES) {
    const {subject, content} = await mountState(page, state);
    const expanded = (await subject.getAttribute('aria-expanded')) === 'true';
    const controls = (await subject.getAttribute('aria-controls')) != null;
    const visible = await content.isVisible();
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    let reachedByTab = false;
    for (let step = 0; step < 10 && !reachedByTab; step += 1) {
      await page.keyboard.press('Tab');
      reachedByTab = await subject.evaluate(
        element => element.ownerDocument.activeElement === element,
      );
    }
    const harness = createChromiumHarness({
      page,
      cdp,
      subject,
      related: {content},
    });
    const semanticSubject = await harness.subject();
    const beforeActivation = await semanticSubject.attribute('aria-expanded');
    await harness.click(semanticSubject, {ignoreAvailability: true});
    const afterActivation = await semanticSubject.attribute('aria-expanded');
    const operable = beforeActivation !== afterActivation;
    if (expanded !== state.facts.expanded) {
      wrong.push(
        `${state.id}: declares expanded=${state.facts.expanded}, page exposes ${expanded}`,
      );
    }
    if (visible !== state.facts.expanded) {
      wrong.push(
        `${state.id}: declares expanded=${state.facts.expanded}, content visibility is ${visible}`,
      );
    }
    if (controls !== state.facts.controls) {
      wrong.push(
        `${state.id}: declares controls=${state.facts.controls}, page exposes ${controls}`,
      );
    }
    if (reachedByTab !== state.facts.focusable) {
      wrong.push(
        `${state.id}: declares focusable=${state.facts.focusable}, Tab reachability is ${reachedByTab}`,
      );
    }
    if (operable !== state.facts.operable) {
      wrong.push(
        `${state.id}: declares operable=${state.facts.operable}, forced pointer activation changed state=${operable}`,
      );
    }
  }
  expect(wrong).toEqual([]);
});

test('every disclosure expectation is exercised by a Collapsible state', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of COLLAPSIBLE_DISCLOSURE_STATES) {
    results.push(await runState(page, cdp, state));
  }
  expect(neverExercised(results)).toEqual([]);
});

for (const state of COLLAPSIBLE_DISCLOSURE_STATES) {
  test(`Collapsible.trigger [${state.id}] — ${state.summary}`, async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(DISCLOSURE_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
