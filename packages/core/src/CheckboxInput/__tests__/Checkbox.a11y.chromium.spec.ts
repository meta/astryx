// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y audit CheckboxList, CheckboxListItem

/**
 * @file Checkbox.a11y.chromium.spec.ts
 * @input Uses the shared checkbox contract, Chromium harness, checked-in
 *   CheckboxA11y stories, state inventory, and exact known failures
 * @output Real-browser and accessibility-tree evidence for every current
 *   checkbox-bearing Astryx component part, including state restored after a
 *   menu's expected pointer dismissal.
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
  CHECKBOX_PATTERN,
  blockingResults,
  formatFailures,
  formatReport,
  neverExercised,
  unmatchedKnownFailures,
  checkAccessibilitySpec,
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
import {CHECKBOX_KNOWN_FAILURES} from './Checkbox.a11y.known-failures';
import {
  CHECKBOX_BINDING_STATES,
  type CheckboxBindingRow,
  type CheckboxBindingState,
} from './Checkbox.a11y.states';

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

function subjectFor(page: Page, state: CheckboxBindingRow): Locator {
  return page
    .locator('#storybook-root')
    .getByRole(state.facts.role, {includeHidden: true})
    .first();
}

async function mountState(
  page: Page,
  state: CheckboxBindingRow,
): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  if ((state as CheckboxBindingState).opensMenu === true) {
    await root.getByRole('button', {name: 'View options'}).click();
  }
  await subjectFor(page, state).waitFor({state: 'attached'});
}

function visibleLabelFor(
  page: Page,
  state: CheckboxBindingRow,
): Locator | undefined {
  const selector = (state as CheckboxBindingState).visibleLabelSelector;
  return selector == null ? undefined : page.locator(selector).first();
}

function pointerTargetFor(
  page: Page,
  state: CheckboxBindingRow,
): Locator | undefined {
  const selector = (state as CheckboxBindingState).pointerTargetSelector;
  return selector == null ? undefined : page.locator(selector).first();
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: CheckboxBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: CHECKBOX_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: CHECKBOX_KNOWN_FAILURES,
    mount: async () => {
      await mountState(page, state);
      const harness = createChromiumHarness({
        page,
        subject: subjectFor(page, state),
        pointerTarget: pointerTargetFor(page, state),
        cdp,
        visibleLabel: visibleLabelFor(page, state),
      });
      if ((state as CheckboxBindingState).opensMenu !== true) {
        return harness;
      }
      return {
        ...harness,
        abortedPress: async subject => {
          await harness.abortedPress(subject);
          const item = subjectFor(page, state);
          await item.waitFor({state: 'hidden'});
          await page
            .locator('#storybook-root')
            .getByRole('button', {name: 'View options'})
            .click();
          await item.waitFor({state: 'visible'});
        },
      };
    },
  });
}

const FIELD_MARKERS = ['required', 'optional'];

function sameWords(rendered: string, claimed: string): boolean {
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
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of CHECKBOX_BINDING_STATES) {
    await mountState(page, state);
    const harness = createChromiumHarness({
      page,
      subject: subjectFor(page, state),
      cdp,
      visibleLabel: visibleLabelFor(page, state),
    });
    const rendered = await (await harness.subject()).visibleLabelText();
    const matches =
      state.visibleLabel == null
        ? rendered == null
        : rendered != null && sameWords(rendered, state.visibleLabel);
    if (!matches) {
      wrong.push(
        `${state.id}: inventory says ${JSON.stringify(state.visibleLabel)}, page renders ${JSON.stringify(rendered)}`,
      );
    }
  }
  expect(wrong).toEqual([]);
});

test('every applicability fact matches what the page exposes', async ({
  page,
}) => {
  test.setTimeout(4 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of CHECKBOX_BINDING_STATES) {
    await mountState(page, state);
    const locator = subjectFor(page, state);
    const harness = createChromiumHarness({
      page,
      subject: locator,
      pointerTarget: pointerTargetFor(page, state),
      cdp,
    });
    const contractSubject = await harness.subject();
    const computed = await contractSubject.computed();
    await harness.click(contractSubject, {ignoreAvailability: true});
    const afterPointer = (await contractSubject.computed()).checked;
    const operable = afterPointer !== computed.checked;
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    let reachedByTab = false;
    for (let step = 0; step < 10 && !reachedByTab; step += 1) {
      await page.keyboard.press('Tab');
      reachedByTab = await locator.evaluate(
        element => element.ownerDocument.activeElement === element,
      );
    }
    const expectedChecked =
      state.facts.checked === 'mixed'
        ? 'mixed'
        : state.facts.checked
          ? 'true'
          : 'false';
    const required =
      (await locator.getAttribute('required')) != null ||
      (await locator.getAttribute('aria-required')) === 'true';
    const readOnly = (await locator.getAttribute('aria-readonly')) === 'true';
    const observed = {
      role: computed.role,
      checked: computed.checked,
      disabled: computed.disabled,
      description:
        computed.description.trim() === '' ? null : computed.description,
      focusable: reachedByTab,
      required,
      readOnly,
      invalid: computed.invalid,
      operable,
    } as const;
    const expected = {
      role: state.facts.role,
      checked: expectedChecked,
      disabled: state.facts.disabled,
      description: state.facts.description,
      focusable: state.facts.focusable,
      required: state.facts.required,
      readOnly: state.facts.readOnly,
      invalid: state.facts.invalid,
      operable: state.facts.operable,
    } as const;
    const excused = (state as CheckboxBindingState).declaredNotDelivered ?? [];
    for (const fact of Object.keys(expected) as (keyof typeof expected)[]) {
      if (fact === 'focusable' && state.facts.role === 'menuitemcheckbox') {
        // A menu composite owns its roving focus. This contract deliberately
        // makes no claim about whether the item is reachable by page Tab order.
        continue;
      }
      const matches = expected[fact] === observed[fact];
      const excuse = excused.find(entry => entry.fact === fact);
      // Operability and focusability have their own real-browser expectations,
      // including advisory ones. Let those results carry their declared
      // enforcement instead of turning this inventory cross-check into a hidden
      // required gate. The remaining facts feed required semantic expectations,
      // so an unexplained mismatch there still means the binding inventory lies.
      const reportsThroughExpectation =
        fact === 'operable' || fact === 'focusable';
      if (!matches && excuse == null && !reportsThroughExpectation) {
        wrong.push(
          `${state.id}: declares ${fact}=${String(expected[fact])}, page exposes ${String(observed[fact])}`,
        );
      }
      if (matches && excuse != null) {
        wrong.push(
          `${state.id}: lists ${fact} as declared-but-not-delivered, yet the page delivers it`,
        );
      }
      if (
        excuse != null &&
        !CHECKBOX_KNOWN_FAILURES.some(
          record =>
            record.expectation === excuse.owned && record.state === state.id,
        )
      ) {
        wrong.push(
          `${state.id}: excuses ${fact} against "${excuse.owned}", but no exact known-failure record owns it`,
        );
      }
    }
  }
  expect(wrong).toEqual([]);
});

test('every expectation is exercised by at least one bound state', async ({
  page,
}) => {
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of CHECKBOX_BINDING_STATES) {
    let mounted = false;
    results.push(
      await checkAccessibilitySpec({
        spec: CHECKBOX_PATTERN,
        binding: state.binding,
        state: state.id,
        facts: state.facts,
        knownFailures: CHECKBOX_KNOWN_FAILURES,
        mount: async () => {
          if (!mounted) {
            await mountState(page, state);
            mounted = true;
          }
          return createChromiumHarness({
            page,
            subject: subjectFor(page, state),
            cdp,
            visibleLabel: visibleLabelFor(page, state),
          });
        },
      }),
    );
  }
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(CHECKBOX_KNOWN_FAILURES, results)).toEqual([]);
});

test('CheckboxInput keeps supporting text out of its accessible name', async ({
  page,
}) => {
  const state = CHECKBOX_BINDING_STATES.find(
    candidate => candidate.id === 'input-described',
  );
  if (state == null) {
    throw new Error('missing input-described binding state');
  }
  const cdp = await page.context().newCDPSession(page);
  await mountState(page, state);
  const subject = await createChromiumHarness({
    page,
    subject: subjectFor(page, state),
    cdp,
  }).subject();
  const computed = await subject.computed();
  expect(computed.name).toBe('Share usage data');
  expect(computed.description).toBe('Help improve the product');
});

for (const state of CHECKBOX_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    test.setTimeout(2 * 60 * 1000);
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(CHECKBOX_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));
    expect(formatFailures(blockingResults([result]))).toBe('');
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
