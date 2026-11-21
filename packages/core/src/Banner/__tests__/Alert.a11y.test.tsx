// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Alert.a11y.test.tsx
 * @input Uses the shared status-message contract and Banner alert-state render map
 * @output Component-facing jsdom evidence for Banner's actual alert states
 * @position Fast AST-021 migration lane; browser-owned outcomes remain explicitly unrun
 */

import {describe, expect, it} from 'vitest';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';
import {
  STATUS_MESSAGE_PATTERN,
  expectAccessibilitySpec,
} from '@astryxdesign/a11y-spec';
import {BANNER_ALERT_KNOWN_FAILURES} from './Alert.a11y.known-failures';
import {
  BANNER_ALERT_STATE_RENDERS,
  transitionTestId,
} from './Alert.a11y.renders';
import {
  BANNER_ALERT_BINDING_STATES,
  BANNER_ALERT_EXCLUSIONS,
  type BannerAlertBindingState,
} from './Alert.a11y.states';

async function transition(name: string): Promise<void> {
  fireEvent.click(screen.getByTestId(transitionTestId(name)));
  await act(async () => Promise.resolve());
}

function subjectFor(state: BannerAlertBindingState): Element {
  const matches = screen.getAllByRole('alert', {hidden: true});
  if (matches.length !== 1) {
    throw new Error(
      `${state.id}: expected one alert subject, found ${matches.length}`,
    );
  }
  return matches[0];
}

describe('Banner alert binding — jsdom lane', () => {
  it.each(
    BANNER_ALERT_BINDING_STATES.map(
      state => [state.id, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: STATUS_MESSAGE_PATTERN,
      binding: state.binding,
      state: state.id,
      facts: state.facts,
      knownFailures: BANNER_ALERT_KNOWN_FAILURES,
      render: () => {
        render(BANNER_ALERT_STATE_RENDERS[state.id]());
      },
      subject: () => subjectFor(state),
      transition,
      cleanup,
    });
  });

  it('records the adjacent Banner states that keep separate owners', () => {
    expect(BANNER_ALERT_EXCLUSIONS.map(entry => entry.part)).toEqual([
      'non-alert and status-to-role selection',
      'disclosure and action control behavior',
      'spoken announcement output and timing',
    ]);
  });
});
