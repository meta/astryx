// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file StatusMessage.a11y.test.tsx
 * @input Uses the shared status-message contract and current Core binding render map
 * @output Component-facing jsdom evidence through expectAccessibilitySpec
 * @position Fast migration lane; browser-owned outcomes remain explicitly unrun
 */

import {afterEach, describe, expect, it} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  STATUS_MESSAGE_PATTERN,
  expectAccessibilitySpec,
} from '@astryxdesign/a11y-spec';
import {__resetLiveRegionsForTest} from '../../hooks/useAnnounce';
import {CORE_STATUS_MESSAGE_KNOWN_FAILURES} from './StatusMessage.a11y.known-failures';
import {
  CORE_STATUS_MESSAGE_STATE_RENDERS,
  transitionTestId,
} from './StatusMessage.a11y.renders';
import {
  CORE_STATUS_MESSAGE_BINDING_STATES,
  CORE_STATUS_MESSAGE_EXCLUSIONS,
  type CoreStatusMessageBindingState,
} from './StatusMessage.a11y.states';

async function twoFrames(): Promise<void> {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function renderState(
  state: CoreStatusMessageBindingState,
): Promise<void> {
  render(CORE_STATUS_MESSAGE_STATE_RENDERS[state.id]());
  await waitFor(() =>
    expect(document.querySelector('[data-a11y-ready="true"]')).not.toBeNull(),
  );
}

function subjectFor(state: CoreStatusMessageBindingState): Element {
  const facts = state.facts;
  const role = facts.kind === 'progressbar' ? 'progressbar' : facts.role;
  if (role == null) {
    throw new Error(
      `${state.id}: this component binding declares no public role`,
    );
  }
  const matches =
    facts.kind === 'progressbar'
      ? screen.getAllByRole(role, {hidden: true, name: facts.name})
      : facts.messageSource === 'accessible-name'
        ? screen.getAllByRole(role, {
            hidden: true,
            name: facts.initialMessage,
          })
        : screen
            .getAllByRole(role, {hidden: true})
            .filter(
              element =>
                (element.textContent ?? '').replace(/\s+/g, ' ').trim() ===
                facts.initialMessage,
            );
  if (matches.length !== 1) {
    throw new Error(
      `${state.id}: expected one ${role} subject in initial state, found ${matches.length}`,
    );
  }
  return matches[0];
}

async function transition(name: string): Promise<void> {
  fireEvent.click(screen.getByTestId(transitionTestId(name)));
  await act(twoFrames);
}

function reset(): void {
  cleanup();
  __resetLiveRegionsForTest();
}

afterEach(reset);

describe('Core status-message bindings — jsdom lane', () => {
  it.each(
    CORE_STATUS_MESSAGE_BINDING_STATES.map(
      state =>
        [`${state.binding} [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: STATUS_MESSAGE_PATTERN,
      binding: state.binding,
      state: state.id,
      facts: state.facts,
      knownFailures: CORE_STATUS_MESSAGE_KNOWN_FAILURES,
      render: async () => renderState(state),
      subject: () => subjectFor(state),
      transition,
      cleanup: reset,
    });
  });
});

describe('Core status-message binding inventory', () => {
  it('names a distinct checked-in story for every bound state', () => {
    const stories = CORE_STATUS_MESSAGE_BINDING_STATES.map(
      state => state.storyId,
    );
    expect(new Set(stories).size).toBe(stories.length);
  });

  it('binds every named Core status-message owner', () => {
    expect(
      [
        ...new Set(
          CORE_STATUS_MESSAGE_BINDING_STATES.map(state => state.binding),
        ),
      ].sort(),
    ).toEqual([
      'FieldStatus announcement channel',
      'ProgressBar',
      'Spinner',
      'Toast announcement channel',
      'Toast card',
    ]);
  });

  it('records every adjacent non-status or separately owned surface explicitly', () => {
    expect(CORE_STATUS_MESSAGE_EXCLUSIONS.map(entry => entry.part)).toEqual([
      'visible validation text',
      'aria-hidden decorative spinner',
      'chat notice or date separator',
      'role=log transcript updates',
      'composer errors and tool-run states',
      'busy announcement',
      'focusable target-mark triggers and labels',
      'visual fill, track, animation, and status cadence',
    ]);
    expect(
      CORE_STATUS_MESSAGE_EXCLUSIONS.every(entry => entry.reason.length > 0),
    ).toBe(true);
  });
});
