// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file AlertDialog.a11y.test.tsx
 * @input ALERT_DIALOG_PATTERN bound to AlertDialog's representative states
 * @output jsdom-lane proof of the DOM expectation (the description reference) and an honest "unrun" report for the browser layers
 * @position Binding test for component:AlertDialog AR1 (the Chromium spec covers the rest)
 */

import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  ALERT_DIALOG_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {renderAlertDialogState} from './AlertDialog.a11y.renders';
import {
  ALERT_DIALOG_BINDING_STATES,
  ALERT_DIALOG_CANCEL_LABEL,
  ALERT_DIALOG_EXCLUSIONS,
  ALERT_DIALOG_OPEN_LABEL,
  type AlertDialogBindingState,
} from './AlertDialog.a11y.states';

// jsdom has no native dialog methods; the DOM lane only needs the open flag.
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

function surface(): HTMLElement {
  const element = document.querySelector('dialog');
  if (element == null) {
    throw new Error('no dialog element rendered');
  }
  return element;
}

function related(): Record<string, HTMLElement> {
  const message = document.getElementById(
    surface().getAttribute('aria-describedby') ?? '',
  );
  const cancel = screen.getByRole('button', {
    name: ALERT_DIALOG_CANCEL_LABEL,
    hidden: true,
  });
  return {
    message: message ?? document.body,
    cancel,
  };
}

function openSurface(): void {
  fireEvent.click(screen.getByRole('button', {name: ALERT_DIALOG_OPEN_LABEL}));
}

async function checkState(
  state: AlertDialogBindingState,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: ALERT_DIALOG_PATTERN,
    binding: 'AlertDialog',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(renderAlertDialogState(state));
      openSurface();
      return createJsdomHarness({subject: surface(), related: related()});
    },
    unmount: cleanup,
  });
}

describe('AlertDialog — alert dialog pattern, jsdom lane', () => {
  it.each(
    ALERT_DIALOG_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: ALERT_DIALOG_PATTERN,
      binding: 'AlertDialog',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(renderAlertDialogState(state));
      },
      subject: () => surface(),
      related: () => related(),
      cleanup,
    });
  });

  it('runs the DOM layer and reports the browser-owned outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of ALERT_DIALOG_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(ALERT_DIALOG_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('AlertDialog binding inventory', () => {
  it('gives every representative state a distinct checked-in story', () => {
    const stories = ALERT_DIALOG_BINDING_STATES.map(state => state.storyId);
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('keeps modal mechanics and the inline preview explicitly owned elsewhere', () => {
    expect(ALERT_DIALOG_EXCLUSIONS.map(exclusion => exclusion.id)).toEqual([
      'modal-mechanics',
      'inline-preview',
    ]);
    for (const exclusion of ALERT_DIALOG_EXCLUSIONS) {
      expect(exclusion.owner.length, exclusion.id).toBeGreaterThan(20);
      expect(exclusion.reason.length, exclusion.id).toBeGreaterThan(80);
    }
  });

  it('renders the opener, the surface, its message and Cancel for every state', () => {
    for (const state of ALERT_DIALOG_BINDING_STATES) {
      render(renderAlertDialogState(state));
      openSurface();
      expect(surface(), state.id).toBeTruthy();
      expect(related().message, state.id).not.toBe(document.body);
      expect(related().cancel, state.id).toBeTruthy();
      cleanup();
    }
  });
});
