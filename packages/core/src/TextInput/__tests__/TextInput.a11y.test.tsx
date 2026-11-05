// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file TextInput.a11y.test.tsx
 * @input Uses the shared text-input contract and real TextInput/TextArea renders
 * @output DOM-layer binding evidence with exact known failures
 * @position Fast component-facing migration lane; browser-owned outcomes are unrun.
 */

import {describe, expect, it} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import {
  TEXT_INPUT_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  unmatchedKnownFailures,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {TEXT_INPUT_KNOWN_FAILURES} from './TextInput.a11y.known-failures';
import {TEXT_INPUT_STATE_RENDERS} from './TextInput.a11y.renders';
import {
  TEXT_INPUT_BINDING_EXCLUSIONS,
  TEXT_INPUT_BINDING_STATES,
  type TextInputBindingRow,
} from './TextInput.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-text-input-subject]';

function subjectFor(): HTMLInputElement | HTMLTextAreaElement {
  const subject = document.querySelector(SUBJECT_SELECTOR);
  if (!(
    subject instanceof HTMLInputElement ||
    subject instanceof HTMLTextAreaElement
  )) {
    throw new Error('binding did not render one native text-control subject');
  }
  return subject;
}

async function expectState(state: TextInputBindingRow): Promise<void> {
  await expectAccessibilitySpec({
    spec: TEXT_INPUT_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TEXT_INPUT_KNOWN_FAILURES,
    render: () => {
      render(TEXT_INPUT_STATE_RENDERS[state.id]());
    },
    subject: subjectFor,
    cleanup,
  });
}

async function checkState(state: TextInputBindingRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: TEXT_INPUT_PATTERN,
    binding: state.binding,
    state: state.id,
    facts: state.facts,
    knownFailures: TEXT_INPUT_KNOWN_FAILURES,
    mount: async () => {
      render(TEXT_INPUT_STATE_RENDERS[state.id]());
      return createJsdomHarness({subject: subjectFor()});
    },
    unmount: cleanup,
  });
}

describe('the shared text-input pattern, jsdom lane', () => {
  it.each(
    TEXT_INPUT_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs DOM expectations and reports higher layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of TEXT_INPUT_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(TEXT_INPUT_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.counts.knownFailure).toBe(2);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
    expect(unmatchedKnownFailures(TEXT_INPUT_KNOWN_FAILURES, results)).toEqual(
      [],
    );
  });
});

describe('the text-input binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = TEXT_INPUT_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds both native component controls', () => {
    expect(
      [
        ...new Set(TEXT_INPUT_BINDING_STATES.map(state => state.binding)),
      ].sort(),
    ).toEqual(['TextArea', 'TextInput']);
  });

  it('renders exactly one actual native subject for every state', () => {
    for (const state of TEXT_INPUT_BINDING_STATES) {
      render(TEXT_INPUT_STATE_RENDERS[state.id]());
      expect(subjectFor(), state.id).toBeTruthy();
      expect(document.querySelectorAll(SUBJECT_SELECTOR)).toHaveLength(1);
      cleanup();
    }
  });

  it('records every adjacent exclusion with an owner and reason', () => {
    expect(TEXT_INPUT_BINDING_EXCLUSIONS.length).toBeGreaterThan(0);
    expect(
      TEXT_INPUT_BINDING_EXCLUSIONS.every(
        exclusion => exclusion.owner.length > 0 && exclusion.reason.length > 0,
      ),
    ).toBe(true);
  });
});
