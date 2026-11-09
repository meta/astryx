// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Component-facing jsdom binding for ChatTypingIndicator's status-message states. */

import {describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {
  STATUS_MESSAGE_PATTERN,
  expectAccessibilitySpec,
} from '@astryxdesign/a11y-spec';
import {CHAT_TYPING_STATUS_KNOWN_FAILURES} from './ChatTypingIndicator.a11y.known-failures';
import {
  CHAT_TYPING_STATUS_STATE_RENDERS,
  transitionTestId,
} from './ChatTypingIndicator.a11y.renders';
import {
  CHAT_TYPING_STATUS_BINDING_STATES,
  CHAT_TYPING_STATUS_EXCLUSIONS,
  type ChatTypingStatusBindingState,
} from './ChatTypingIndicator.a11y.states';

async function transition(name: string): Promise<void> {
  fireEvent.click(screen.getByTestId(transitionTestId(name)));
  await act(async () => Promise.resolve());
}

function subjectFor(state: ChatTypingStatusBindingState): Element {
  const facts = state.facts;
  if (facts.kind !== 'live-region' || facts.role == null) {
    throw new Error(
      `${state.id}: this component binding declares no public role`,
    );
  }
  const matches = screen
    .getAllByRole(facts.role, {hidden: true})
    .filter(
      element =>
        (element.textContent ?? '').replace(/\s+/g, ' ').trim() ===
        facts.initialMessage,
    );
  if (matches.length !== 1) {
    throw new Error(
      `${state.id}: expected one ${facts.role} subject in initial state, found ${matches.length}`,
    );
  }
  return matches[0];
}

describe('ChatTypingIndicator status-message binding — jsdom lane', () => {
  it.each(
    CHAT_TYPING_STATUS_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: STATUS_MESSAGE_PATTERN,
      binding: state.binding,
      state: state.id,
      facts: state.facts,
      knownFailures: CHAT_TYPING_STATUS_KNOWN_FAILURES,
      render: () => {
        render(CHAT_TYPING_STATUS_STATE_RENDERS[state.id]());
      },
      subject: () => subjectFor(state),
      transition,
      cleanup,
    });
  });

  it('records equivalent and separately owned states explicitly', () => {
    expect(CHAT_TYPING_STATUS_EXCLUSIONS.map(entry => entry.part)).toEqual([
      'omitted names',
      'indicator mounted with names',
      'clearing the names',
      'typing-dot animation and reduced motion',
      'transcript log announcements',
    ]);
  });
});
