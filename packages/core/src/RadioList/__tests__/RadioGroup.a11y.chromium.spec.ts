// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file RadioGroup.a11y.chromium.spec.ts
 * @input Uses the shared radio-group contract, Chromium harness, checked-in stories, inventory, and exact known failures
 * @output Real-browser and accessibility-tree evidence for every current bound
 *   radio-group part, including state restored after a menu's expected pointer
 *   dismissal
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
  RADIO_GROUP_PATTERN,
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
import {RADIO_GROUP_KNOWN_FAILURES} from './RadioGroup.a11y.known-failures';
import {
  RADIO_GROUP_BINDING_STATES,
  type RadioGroupBindingRow,
  type RadioGroupBindingState,
} from './RadioGroup.a11y.states';

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

function subjectFor(page: Page, state: RadioGroupBindingRow): Locator {
  return page
    .locator('#storybook-root')
    .getByRole(state.facts.role, {
      name: state.subjectName,
      includeHidden: true,
    })
    .first();
}

function relatedFor(
  page: Page,
  state: RadioGroupBindingRow,
): Readonly<Record<string, Locator>> {
  const metadata = state as RadioGroupBindingState;
  return Object.fromEntries(
    Object.entries(metadata.relations ?? {}).map(([relation, option]) => [
      relation,
      page
        .locator('#storybook-root')
        .getByRole(option.role, {name: option.name, includeHidden: true})
        .first(),
    ]),
  );
}

async function mountState(
  page: Page,
  state: RadioGroupBindingRow,
): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  if ((state as RadioGroupBindingState).opensMenu === true) {
    await root.getByRole('button', {name: 'Sort options'}).click();
  }
  await subjectFor(page, state).waitFor({state: 'attached'});
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: RadioGroupBindingRow,
): Promise<BindingResult> {
  let mounted = false;
  return checkAccessibilitySpec({
    spec: RADIO_GROUP_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: RADIO_GROUP_KNOWN_FAILURES,
    mount: async () => {
      if (!mounted || state.facts.selection === 'none') {
        await mountState(page, state);
        mounted = true;
      }
      const harness = createChromiumHarness({
        page,
        subject: subjectFor(page, state),
        cdp,
        visibleLabel: state.facts.visibleLabel ? undefined : null,
        related: relatedFor(page, state),
      });
      if ((state as RadioGroupBindingState).opensMenu !== true) {
        return harness;
      }
      return {
        ...harness,
        abortedPress: async subject => {
          await harness.abortedPress(subject);
          const option = subjectFor(page, state);
          await option.waitFor({state: 'hidden'});
          await page
            .locator('#storybook-root')
            .getByRole('button', {name: 'Sort options'})
            .click();
          await option.waitFor({state: 'visible'});
        },
      };
    },
  });
}

test('every binding fact matches the rendered semantic state', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];

  for (const state of RADIO_GROUP_BINDING_STATES) {
    await mountState(page, state);
    const harness = createChromiumHarness({
      page,
      subject: subjectFor(page, state),
      cdp,
      related: relatedFor(page, state),
    });
    const subject = await harness.subject();
    const computed = await subject.computed();

    if (computed.role !== state.facts.role) {
      wrong.push(
        `${state.id}: declares role=${state.facts.role}, browser exposes ${computed.role}`,
      );
    }
    if (
      state.facts.checked != null &&
      computed.checked !== (state.facts.checked ? 'true' : 'false')
    ) {
      wrong.push(
        `${state.id}: declares checked=${state.facts.checked}, browser exposes ${computed.checked}`,
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
    const description =
      computed.description.trim() === '' ? null : computed.description;
    if (description !== state.facts.description) {
      wrong.push(
        `${state.id}: declares description=${JSON.stringify(state.facts.description)}, browser exposes ${JSON.stringify(description)}`,
      );
    }
    const required =
      (await subject.attribute('required')) != null ||
      (await subject.attribute('aria-required')) === 'true';
    if (required !== state.facts.required) {
      wrong.push(
        `${state.id}: declares required=${state.facts.required}, page exposes ${required}`,
      );
    }
    if (computed.invalid !== state.facts.invalid) {
      wrong.push(
        `${state.id}: declares invalid=${state.facts.invalid}, browser exposes ${computed.invalid}`,
      );
    }

    await harness.resetFocus();
    let reachedByTab = false;
    for (let step = 0; step < 10 && !reachedByTab; step += 1) {
      await harness.press('Tab');
      reachedByTab =
        state.facts.part === 'group'
          ? await subject.containsFocus()
          : await subject.isFocused();
    }
    if (reachedByTab !== state.facts.tabReachable) {
      wrong.push(
        `${state.id}: declares tabReachable=${state.facts.tabReachable}, page exposes ${reachedByTab}`,
      );
    }
  }

  expect(wrong).toEqual([]);
});

test('every expectation is exercised by at least one bound state', async ({
  page,
}) => {
  test.setTimeout(6 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of RADIO_GROUP_BINDING_STATES) {
    let mounted = false;
    results.push(
      await checkAccessibilitySpec({
        spec: RADIO_GROUP_PATTERN,
        binding: state.binding,
        state: state.id,
        facts: state.facts,
        knownFailures: RADIO_GROUP_KNOWN_FAILURES,
        mount: async () => {
          if (!mounted || state.facts.selection === 'none') {
            await mountState(page, state);
            mounted = true;
          }
          return createChromiumHarness({
            page,
            subject: subjectFor(page, state),
            cdp,
            visibleLabel: state.facts.visibleLabel ? undefined : null,
            related: relatedFor(page, state),
          });
        },
      }),
    );
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(RADIO_GROUP_KNOWN_FAILURES, results)).toEqual(
    [],
  );
});

for (const state of RADIO_GROUP_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(3 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(RADIO_GROUP_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
