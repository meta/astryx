// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Fast DOM binding for Layout regions against the shared Landmark contract. */

import {cleanup, render} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  LANDMARK_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {LAYOUT_LANDMARK_A11Y_RENDERS} from './Layout.a11y.renders';
import {
  LAYOUT_LANDMARK_A11Y_EXCLUSIONS,
  LAYOUT_LANDMARK_A11Y_STATES,
  type LayoutLandmarkA11yRow,
} from './Layout.a11y.states';

const SUBJECT_SELECTOR = '[data-a11y-landmark]';
const CONTENT_SELECTOR = '[data-a11y-landmark-content]';
const PEER_SELECTOR = '[data-a11y-landmark-peer]';

function subjectFor(): HTMLElement {
  const subjects = document.querySelectorAll(SUBJECT_SELECTOR);
  if (subjects.length !== 1 || !(subjects[0] instanceof HTMLElement)) {
    throw new Error(
      `binding rendered ${subjects.length} landmark subjects instead of one`,
    );
  }
  return subjects[0];
}

function relatedFor(): Record<string, Element> {
  const content = document.querySelector(CONTENT_SELECTOR);
  if (content == null) {
    throw new Error('binding rendered no landmark content');
  }
  const related: Record<string, Element> = {content};
  document.querySelectorAll(PEER_SELECTOR).forEach((peer, index) => {
    related[`peer-${index}`] = peer;
  });
  return related;
}

async function checkState(
  state: LayoutLandmarkA11yRow,
): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: LANDMARK_PATTERN,
    binding: 'Layout regions',
    state: state.id,
    facts: state.facts,
    mount: async () => {
      render(LAYOUT_LANDMARK_A11Y_RENDERS[state.id]());
      return createJsdomHarness({
        subject: subjectFor(),
        related: relatedFor(),
      });
    },
    unmount: cleanup,
  });
}

describe('the shared Landmark pattern, jsdom lane', () => {
  it.each(
    LAYOUT_LANDMARK_A11Y_STATES.map(
      state => [`Layout regions [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: LANDMARK_PATTERN,
      binding: 'Layout regions',
      state: state.id,
      facts: state.facts,
      render: () => {
        render(LAYOUT_LANDMARK_A11Y_RENDERS[state.id]());
      },
      subject: subjectFor,
      related: relatedFor,
      cleanup,
    });
  });

  it('runs DOM expectations and reports accessibility-tree outcomes as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of LAYOUT_LANDMARK_A11Y_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(LANDMARK_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the Layout regions landmark inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = LAYOUT_LANDMARK_A11Y_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('binds only states that declare a landmark role and label', () => {
    for (const state of LAYOUT_LANDMARK_A11Y_STATES) {
      expect(state.facts.label, state.id).not.toBeNull();
    }
  });

  it('binds each Layout region component at least once', () => {
    expect(
      [
        ...new Set(LAYOUT_LANDMARK_A11Y_STATES.map(state => state.region)),
      ].sort(),
    ).toEqual(['LayoutContent', 'LayoutFooter', 'LayoutHeader', 'LayoutPanel']);
  });

  it('records every adjacent exclusion with an owner and reason', () => {
    expect(
      LAYOUT_LANDMARK_A11Y_EXCLUSIONS.every(row => row.owner && row.reason),
    ).toBe(true);
  });

  it('matches the declared role, label, and peer inventory', () => {
    for (const state of LAYOUT_LANDMARK_A11Y_STATES) {
      render(LAYOUT_LANDMARK_A11Y_RENDERS[state.id]());
      const subject = subjectFor();
      expect(subject.getAttribute('role'), state.id).toBe(state.facts.role);
      expect(subject.getAttribute('aria-label'), state.id).toBe(
        state.facts.label,
      );
      const peers = document.querySelectorAll(PEER_SELECTOR);
      expect(peers.length, state.id).toBe(state.facts.sameRolePeers);
      peers.forEach(peer =>
        expect(peer.getAttribute('role'), state.id).toBe(state.facts.role),
      );
      cleanup();
    }
  });
});
