// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file Switch.a11y.chromium.spec.ts
 * @input Uses @playwright/test, @astryxdesign/a11y-spec (the switch contract,
 *   the Chromium harness, the runner, the Storybook server) and the checked-in
 *   Switch stories
 * @output The Chromium lane of Switch's binding to the shared switch pattern:
 *   the computed accessibility tree, real focus, and real activation.
 * @position The lane that carries most of this contract. jsdom cannot compute a
 *   role or a name, cannot resolve a tab sequence, and cannot turn a key press
 *   into an activation, so those outcomes are proven here or not at all.
 *
 * Run it with:
 *   pnpm storybook:build && npx playwright install chromium
 *   pnpm test:a11y-contract
 *
 * SYNC: States live in ./Switch.a11y.states.ts, known failures in
 *   ./Switch.a11y.known-failures.ts, both shared with the jsdom lane.
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {
  SWITCH_PATTERN,
  blockingResults,
  formatFailures,
  formatReport,
  neverExercised,
  checkAccessibilitySpec,
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
import {SWITCH_KNOWN_FAILURES} from './Switch.a11y.known-failures';
import {
  REMOTE_CONTROL_LABEL,
  SWITCH_BINDING_STATES,
  type SwitchBindingState,
} from './Switch.a11y.states';

let storybook: StaticServer;

test.beforeAll(async () => {
  storybook = await serveStorybook(
    process.env.ASTRYX_STORYBOOK_DIR ?? DEFAULT_STORYBOOK_DIR,
  );
});

test.afterAll(async () => {
  await storybook?.close();
});

/** Load the story and put it into the state this row describes. */
async function mountState(
  page: Page,
  state: SwitchBindingState,
): Promise<void> {
  await page.goto(
    `${storybook.origin}/iframe.html?id=${state.storyId}&viewMode=story`,
    {waitUntil: 'load'},
  );
  await holdMotionStill(page);
  const root = page.locator('#storybook-root');
  await root.getByRole('switch').waitFor({state: 'attached'});
  if (state.arrivesBy === 'controlled-update') {
    // Getting into this state is the owner's doing, not the user's: the story's
    // second control changes the value the switch is given. Doing it here, in
    // the mount, keeps every expectation about the switch.
    await root.getByRole('button', {name: REMOTE_CONTROL_LABEL}).click();
    // A mount precondition, not a contract claim: if the owner's change never
    // reached the control, every expectation below would be about a state this
    // binding is not in.
    await root
      .getByRole('switch', {checked: state.facts.checked})
      .waitFor({state: 'attached'});
  }
}

async function runState(
  page: Page,
  cdp: CDPSession,
  state: SwitchBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: SWITCH_PATTERN,
    binding: 'Switch',
    state: state.id,
    facts: state.facts,
    knownFailures: SWITCH_KNOWN_FAILURES,
    // Reload per expectation: each one starts from the state the story
    // renders, not from whatever the previous expectation toggled it to.
    mount: async () => {
      await mountState(page, state);
      return createChromiumHarness({
        page,
        subject: page.locator('#storybook-root').getByRole('switch'),
        cdp,
      });
    },
  });
}

/** Astryx renders these after the label text; they are not part of it. */
const FIELD_MARKERS = ['required', 'optional'];

/**
 * Whether the page renders exactly the label the inventory claims.
 *
 * Word-for-word, not a prefix or a substring: "Sync" must not pass for "Sync
 * photos", or a half-written entry would sit here unnoticed. The one allowance
 * is Astryx's own trailing field marker, which the component adds and the
 * inventory names the label without.
 */
function namesTheSameLabel(rendered: string, claimed: string): boolean {
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

/**
 * The inventory AST-021 FR2 asks for, checked against the page rather than
 * trusted. It is deliberately NOT part of the shared spec: a wrong entry
 * here is a stale inventory, and reporting it as a WCAG 2.5.3 failure would put
 * a metadata typo and a real accessibility defect in the same bucket.
 */
test('the state inventory describes the labels the page actually renders', async ({
  page,
}) => {
  const cdp = await page.context().newCDPSession(page);
  const wrong: string[] = [];
  for (const state of SWITCH_BINDING_STATES) {
    await mountState(page, state);
    const harness = createChromiumHarness({
      page,
      subject: page.locator('#storybook-root').getByRole('switch'),
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

// Each state's result, recorded by its own test below so the whole-suite check
// at the end reads it instead of measuring every state a second time. A state
// whose test did not run in this worker (a filtered run, or a worker restarted
// after a failure) is measured by the whole-suite check itself.
const recorded = new Map<string, BindingResult>();

for (const state of SWITCH_BINDING_STATES) {
  test(`Switch [${state.id}] — ${state.summary}`, async ({page}) => {
    const cdp = await page.context().newCDPSession(page);
    const result = await runState(page, cdp, state);
    recorded.set(state.id, result);
    const report = summarize(SWITCH_PATTERN, [result]);
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

test('every expectation is exercised by at least one bound state', async ({
  page,
}) => {
  // A whole-binding sweep: every state's result, read from its own test or,
  // when that test did not run in this worker, measured here (minutes of real
  // browser work in that case, so the budget stays).
  test.setTimeout(5 * 60 * 1000);
  const cdp = await page.context().newCDPSession(page);
  const results: BindingResult[] = [];
  for (const state of SWITCH_BINDING_STATES) {
    results.push(recorded.get(state.id) ?? (await runState(page, cdp, state)));
  }
  // An expectation that applies to nothing is not coverage, however green it
  // looks. This is the only place that can notice: the contract never sees the
  // states, so whether a condition matches a real one is a binding-side fact.
  expect(neverExercised(results)).toEqual([]);
  expect(unmatchedKnownFailures(SWITCH_KNOWN_FAILURES, results)).toEqual([]);
});
