// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Button.a11y.chromium.spec.ts
 * @input Uses @playwright/test, @astryxdesign/a11y-spec (the button contract,
 *   the Chromium harness, the static Storybook server), and the checked-in
 *   ButtonA11y stories
 * @output The real-browser lane of every binding to the shared button pattern:
 *   computed role, name and description, native activation by pointer, Enter
 *   and Space, pointer cancellation, tab reachability, and inertness.
 * @position The half of the binding jsdom cannot honestly reach
 *   (`docs/specs/AST-013/spec.md`: a browser claim is made in a browser).
 *
 * Each state drives a checked-in story rather than a page this file builds, so
 * the reproduction path for any failure is a URL a person can open
 * (`docs/specs/AST-009/spec.md` FR30). Each story counts its own activations,
 * which is what the contract reads through the binding's `activations()` seam —
 * a button's action leaves no trace on the button itself.
 *
 * SYNC: States live in ./Button.a11y.states.ts, known failures in
 *   ./Button.a11y.known-failures.ts, both shared with the jsdom lane.
 */

import {
  expect,
  test,
  type CDPSession,
  type Locator,
  type Page,
} from '@playwright/test';
import {
  BUTTON_PATTERN,
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
import {BUTTON_KNOWN_FAILURES} from './Button.a11y.known-failures';
import {
  BUTTON_BINDING_STATES,
  BUTTON_PATTERN_EXCLUSIONS,
  type ButtonBindingRow,
  type ButtonBindingState,
} from './Button.a11y.states';

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

/** Load the story this state names and wait for its control to exist. */
async function mountState(page: Page, state: ButtonBindingRow): Promise<void> {
  await page.goto(storyUrl(state.storyId), {waitUntil: 'load'});
  await holdMotionStill(page);
  await page
    .locator('#storybook-root')
    .getByRole('button')
    .first()
    .waitFor({state: 'attached'});
}

/**
 * How many times this story's own handler has run.
 *
 * The story publishes the count as an attribute, so this reads a fact the story
 * renders rather than instrumenting the page from the test — which means a
 * person opening the story sees the same number the contract does.
 */
async function activationsOn(page: Page): Promise<number> {
  const raw = await page
    .locator('[data-a11y-activations]')
    .first()
    .getAttribute('data-a11y-activations');
  return Number(raw ?? '0');
}

function pointerTargetFor(
  page: Page,
  state: ButtonBindingRow,
): Locator | undefined {
  const selector = (state as ButtonBindingState).pointerTargetSelector;
  return selector == null ? undefined : page.locator(selector).first();
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: ButtonBindingRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: BUTTON_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: BUTTON_KNOWN_FAILURES,
    // Reload per expectation: each one starts from the state the story renders,
    // not from whatever the previous expectation left behind.
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        subject: page.locator('#storybook-root').getByRole('button').first(),
        pointerTarget: pointerTargetFor(page, state),
        cdp,
      });
    },
    activations: async () => activationsOn(page),
  });
}

/**
 * Whether the page renders exactly the label the inventory claims, word for
 * word — a prefix test would accept "Save" for "Save changes" and let a
 * half-written entry sit here unnoticed.
 */
function namesTheSameLabel(rendered: string, claimed: string): boolean {
  const words = spokenWords(rendered);
  const expected = spokenWords(claimed);
  return (
    words.length === expected.length &&
    words.every((word, index) => word === expected[index])
  );
}

/**
 * The inventory AST-021 FR2 asks for, checked against the page rather than
 * trusted. Deliberately NOT part of the shared spec: a wrong entry here is a
 * stale inventory, and reporting it as a WCAG 2.5.3 failure would put a metadata
 * typo and a real accessibility defect in the same bucket.
 */
test('the state inventory describes the labels the page actually renders', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of BUTTON_BINDING_STATES) {
    await mountState(page, state);
    const harness = createChromiumHarness({
      page,
      subject: page.locator('#storybook-root').getByRole('button').first(),
      cdp,
    });
    const rendered = await (await harness.subject()).visibleLabelText();
    const matches =
      state.visibleLabel == null
        ? rendered == null
        : rendered != null && namesTheSameLabel(rendered, state.visibleLabel);
    if (!matches) {
      wrong.push(
        `${state.id}: inventory says ${JSON.stringify(state.visibleLabel)}, page renders ${JSON.stringify(rendered)}`,
      );
    }
  }
  expect(wrong).toEqual([]);
});

/**
 * Every applicability fact, checked against the page.
 *
 * An applicability fact can switch a REQUIRED expectation off — declare a state
 * available and `unavailable.inert` never runs; declare it unfocusable and the
 * keyboard outcomes never run. So a binding that described itself wrongly could
 * quietly opt out of the gates that matter most, and nothing else in this
 * system would notice: the contract reads facts, it does not audit them.
 *
 * A mismatch is a stale inventory unless the row lists it in
 * `declaredNotDelivered` with a known-failure record behind it. Listing a fact
 * that actually matches fails too, so the escape cannot be padded.
 */
test('every applicability fact matches what the page exposes', async ({
  page,
}) => {
  test.setTimeout(3 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of BUTTON_BINDING_STATES) {
    await mountState(page, state);
    const subject = page.locator('#storybook-root').getByRole('button').first();
    const harness = createChromiumHarness({page, subject, cdp});
    const computed = await (await harness.subject()).computed();
    // Focusability means REACHABLE BY TAB, which is what the expectations mean
    // by it. `element.focus()` succeeds on a `tabindex="-1"` control no Tab will
    // ever reach, so measuring it that way would call a real gap a match.
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
    const observed: Record<'unavailable' | 'focusable' | 'described', boolean> =
      {
        unavailable: computed.disabled,
        focusable: reachedByTab,
        // Whether supporting text really is attached, which gates two required
        // expectations. `operable` has no counterpart here: it means "pressing
        // this is MEANT to act", and observing it would mean running the very
        // expectations this check exists to protect.
        described: computed.description.trim() !== '',
      };
    // `as const satisfies` keeps each row's literal type, so an optional field
    // is absent from the union member of a row that omits it. The interface is
    // the shape to read it through.
    const excused = (state as ButtonBindingState).declaredNotDelivered ?? [];
    for (const fact of ['unavailable', 'focusable', 'described'] as const) {
      const matches = state.facts[fact] === observed[fact];
      const excuse = excused.find(entry => entry.fact === fact);
      if (!matches && excuse == null) {
        wrong.push(
          `${state.id}: declares ${fact}=${state.facts[fact]}, page exposes ${observed[fact]} — either the declaration is stale, or this is a real gap that needs a known-failure record and a declaredNotDelivered entry`,
        );
      }
      if (matches && excuse != null) {
        wrong.push(
          `${state.id}: lists ${fact} as declared-but-not-delivered, yet the page delivers it — remove the entry and its known-failure record`,
        );
      }
      // An excuse with no record behind it is an unowned exception, which is
      // exactly what AST-021 FR8 prohibits.
      if (
        excuse != null &&
        !BUTTON_KNOWN_FAILURES.some(
          record =>
            record.expectation === excuse.owned && record.state === state.id,
        )
      ) {
        wrong.push(
          `${state.id}: excuses ${fact} against "${excuse.owned}", but no known-failure record names that expectation for this state`,
        );
      }
    }
  }
  expect(wrong).toEqual([]);
});

/**
 * The exclusions, checked in a real engine. An excluded part is only honestly
 * excluded while it really does present the other pattern's semantics — the day
 * one of these computes as a button, this contract owns it.
 */
test('every excluded part presents the semantics its exclusion claims', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const exclusion of BUTTON_PATTERN_EXCLUSIONS) {
    await page.goto(storyUrl(exclusion.storyId), {waitUntil: 'load'});
    const subject = page
      .locator('#storybook-root')
      .getByRole(exclusion.presentsRole)
      .first();
    await subject.waitFor({state: 'attached'});
    const harness = createChromiumHarness({page, subject, cdp});
    const {role} = await (await harness.subject()).computed();
    if (role !== exclusion.presentsRole) {
      wrong.push(
        `${exclusion.id}: excluded as a ${exclusion.presentsRole}, but the browser computes "${role}"`,
      );
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
  for (const state of BUTTON_BINDING_STATES) {
    // One mount per STATE, not per expectation. The per-state tests above take
    // the expensive isolated path; this one only asks WHICH expectations ran,
    // never whether they passed, and that answer does not depend on starting
    // each expectation from a fresh page. Reloading 14 times per state instead
    // would turn a ten-second check into a ten-minute one for no extra truth.
    let mounted = false;
    results.push(
      await checkAccessibilitySpec({
        spec: BUTTON_PATTERN,
        binding: state.binding,
        state: state.id,
        facts: state.facts,
        knownFailures: BUTTON_KNOWN_FAILURES,
        mount: async () => {
          if (!mounted) {
            await mountState(page, state);
            mounted = true;
          }
          return createChromiumHarness({
            page,
            subject: page
              .locator('#storybook-root')
              .getByRole('button')
              .first(),
            pointerTarget: pointerTargetFor(page, state),
            cdp,
          });
        },
        activations: async () => activationsOn(page),
      }),
    );
  }
  // An expectation that applies to nothing is not coverage, however green it
  // looks. This is the only place that can notice: the contract never sees the
  // states, so whether a condition matches a real one is a binding-side fact.
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(BUTTON_KNOWN_FAILURES, results)).toEqual([]);
});

for (const state of BUTTON_BINDING_STATES) {
  test(`${state.binding} [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    const report = summarize(BUTTON_PATTERN, [result]);
    // eslint-disable-next-line no-console -- the report is this run's artifact
    console.log(formatReport(report));

    expect(formatFailures(blockingResults([result]))).toBe('');
    // Every layer this contract assigns is observable here, so a state that
    // reports one as unrun means the harness lost a capability, not that the
    // outcome is covered.
    expect(report.unrunLayers).toEqual([]);
    expect(report.counts.unexpectedPass).toBe(0);
  });
}
