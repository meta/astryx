// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Dialog.a11y.test.tsx
 * @input Uses the shared modal-dialog contract, @testing-library/react, and the
 *   actual Dialog binding render map
 * @output Dialog's jsdom binding through expectAccessibilitySpec
 * @position Fast DOM-semantics lane. Browser-owned focus, top-layer, inertness,
 *   and computed-tree outcomes run in Dialog.a11y.chromium.spec.ts.
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {
  MODAL_DIALOG_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {DIALOG_MODAL_KNOWN_FAILURES} from './Dialog.a11y.known-failures';
import {renderDialogModalState} from './Dialog.a11y.renders';
import {
  DIALOG_CONTRACT_OPEN_LABEL,
  DIALOG_MODAL_BINDING_STATES,
  type DialogModalBindingState,
} from './Dialog.a11y.states';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

function renderState(state: DialogModalBindingState): void {
  render(renderDialogModalState(state));
  fireEvent.click(
    screen.getByRole('button', {name: DIALOG_CONTRACT_OPEN_LABEL}),
  );
}

function dialogSubject(): HTMLElement {
  return screen.getByRole('dialog', {hidden: true});
}

async function expectState(state: DialogModalBindingState): Promise<void> {
  await expectAccessibilitySpec({
    spec: MODAL_DIALOG_PATTERN,
    binding: 'Dialog',
    state: state.id,
    facts: state.facts,
    knownFailures: DIALOG_MODAL_KNOWN_FAILURES,
    render: () => renderState(state),
    subject: dialogSubject,
    cleanup,
  });
}

async function checkState(
  state: DialogModalBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: MODAL_DIALOG_PATTERN,
    binding: 'Dialog',
    state: state.id,
    facts: state.facts,
    knownFailures: DIALOG_MODAL_KNOWN_FAILURES,
    mount: async () => {
      renderState(state);
      return createJsdomHarness({subject: dialogSubject()});
    },
    unmount: cleanup,
  });
}

describe('Dialog — the shared modal-dialog pattern, jsdom lane', () => {
  it.each(
    DIALOG_MODAL_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s (%s)', async (_id, _summary, state) => {
    await expectState(state);
  });

  it('runs DOM semantics and reports browser-owned layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of DIALOG_MODAL_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(MODAL_DIALOG_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});
