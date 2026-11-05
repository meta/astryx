// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Button.a11y.test.tsx
 * @input Uses @astryxdesign/a11y-spec (the button contract, the jsdom harness,
 *   the runner), @testing-library/react, and the shared binding inventory with
 *   its renderings
 * @output The jsdom lane of every binding to the shared button pattern.
 * @position Binds Button, IconButton, ClickableCard, SideNavCollapseButton, and
 *   ChatSendButton to the reusable contract at the layers jsdom can honestly
 *   observe. The accessibility-tree and real-browser layers are bound in
 *   Button.a11y.chromium.spec.ts, and this lane reports them as unrun rather
 *   than pretending markup proves them.
 *
 * What is NOT here is as deliberate as what is. Callback payloads, icon
 * resolution, composer wiring, elevation and styling stay in each component's
 * own suite: those are that component's contract, not the button pattern's
 * (`docs/specs/AST-021/spec.md` FR5).
 *
 * SYNC: States live in ./Button.a11y.states.ts, known failures in
 *   ./Button.a11y.known-failures.ts, both shared with the Chromium lane.
 */

import {describe, expect, it} from 'vitest';
import {cleanup, render, screen} from '@testing-library/react';
import {
  BUTTON_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {BUTTON_KNOWN_FAILURES} from './Button.a11y.known-failures';
import {
  BUTTON_EXCLUSION_RENDERS,
  BUTTON_STATE_RENDERS,
} from './Button.a11y.renders';
import {
  BUTTON_BINDING_STATES,
  BUTTON_PATTERN_EXCLUSIONS,
  type ButtonBindingRow,
} from './Button.a11y.states';

/**
 * The control the pattern is about.
 *
 * Every binding resolves the same way — by role — and that is the point: a
 * ClickableCard puts its role and name on a visually hidden button inside the
 * card rather than on the card itself, and asking for the role finds it without
 * this test knowing anything about that structure.
 */
function subjectFor(): Element {
  return screen.getByRole('button', {hidden: true});
}

async function expectState(state: ButtonBindingRow): Promise<void> {
  let activations = 0;
  await expectAccessibilitySpec({
    spec: BUTTON_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: BUTTON_KNOWN_FAILURES,
    render: () => {
      activations = 0;
      render(
        BUTTON_STATE_RENDERS[state.id](() => {
          activations += 1;
        }),
      );
    },
    subject: subjectFor,
    cleanup,
    activations: async () => activations,
  });
}

async function checkState(state: ButtonBindingRow): Promise<BindingResult> {
  let activations = 0;
  return checkAccessibilitySpec({
    spec: BUTTON_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: BUTTON_KNOWN_FAILURES,
    mount: async () => {
      activations = 0;
      render(
        BUTTON_STATE_RENDERS[state.id](() => {
          activations += 1;
        }),
      );
      return createJsdomHarness({subject: subjectFor()});
    },
    unmount: cleanup,
    activations: async () => activations,
  });
}

describe('the shared button pattern, jsdom lane', () => {
  it.each(
    BUTTON_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs the DOM layer here and reports the higher layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of BUTTON_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(BUTTON_PATTERN, results);

    // Something actually ran, or this lane would prove nothing at all.
    expect(report.counts.pass).toBeGreaterThan(0);
    // And what it could not see is named, not quietly counted as covered.
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('parts this pattern deliberately does not cover', () => {
  it('a Button given href presents link semantics, not a button', () => {
    render(BUTTON_EXCLUSION_RENDERS['button-as-link'](() => {}));
    // The exclusion is only honest while it stays true: if this ever renders a
    // button, the pattern owns it and the inventory is wrong.
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('link', {name: 'Read the guide'})).toBeTruthy();
    cleanup();
  });

  it('a ClickableCard given href presents link semantics, not a button', () => {
    render(BUTTON_EXCLUSION_RENDERS['clickable-card-as-link'](() => {}));
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByRole('link', {name: 'Open billing settings'}),
    ).toBeTruthy();
    cleanup();
  });

  it('records a reason and a story for every exclusion', () => {
    expect(BUTTON_PATTERN_EXCLUSIONS.length).toBeGreaterThan(0);
    for (const exclusion of BUTTON_PATTERN_EXCLUSIONS) {
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(40);
      expect(exclusion.storyId, exclusion.id).toContain(
        'a11y-button-pattern--',
      );
    }
  });
});

describe('the state inventory', () => {
  it('names a distinct story for every state', () => {
    const ids = BUTTON_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers every component the queue binds to this pattern', () => {
    const bound = new Set(BUTTON_BINDING_STATES.map(state => state.binding));
    expect([...bound].sort()).toEqual([
      'Button',
      'ChatSendButton',
      'ClickableCard',
      'IconButton',
      'SideNavCollapseButton',
    ]);
  });

  it('renders in jsdom, and presents one button, for every state', () => {
    // The visible-label half of the inventory is checked in Chromium, not here:
    // whether a label is VISIBLE takes layout, and a loading Button keeps its
    // text in the DOM while hiding it, so textContent would answer the wrong
    // question.
    for (const state of BUTTON_BINDING_STATES) {
      expect(() => {
        render(BUTTON_STATE_RENDERS[state.id](() => {}));
      }, state.id).not.toThrow();
      expect(subjectFor(), state.id).toBeTruthy();
      cleanup();
    }
  });
});
