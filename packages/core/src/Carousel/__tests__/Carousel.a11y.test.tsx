// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file Carousel.a11y.test.tsx
 * @input Uses the shared Carousel contract and complete Carousel binding inventory
 * @output DOM-layer binding evidence; browser-owned outcomes remain explicitly unrun
 * @position Fast migration lane for Carousel container, slides, scroller, and control.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {
  CAROUSEL_PATTERN,
  checkAccessibilitySpec,
  createJsdomHarness,
  expectAccessibilitySpec,
  summarize,
  type BindingResult,
} from '@astryxdesign/a11y-spec';
import {CAROUSEL_KNOWN_FAILURES} from './Carousel.a11y.known-failures';
import {CAROUSEL_STATE_RENDERS} from './Carousel.a11y.renders';
import {
  CAROUSEL_BINDING_STATES,
  CAROUSEL_EXCLUSIONS,
  type CarouselBindingRow,
} from './Carousel.a11y.states';

function subjectFor(state: CarouselBindingRow): Element {
  if ('selector' in state.subject) {
    const element = document.querySelector(state.subject.selector);
    if (element == null) {
      throw new Error(`no subject for ${state.id}`);
    }
    return element;
  }
  return screen.getByRole(state.subject.role, {
    name: state.subject.name,
    hidden: true,
  });
}

function relatedFor(
  state: CarouselBindingRow,
): Readonly<Record<string, Element>> {
  return Object.fromEntries(
    Object.entries(state.relations ?? {}).map(([name, relation]) => {
      const element = document.querySelector(relation.selector);
      if (element == null) {
        throw new Error(`no related subject "${name}" for ${state.id}`);
      }
      return [name, element];
    }),
  );
}

async function checkState(state: CarouselBindingRow): Promise<BindingResult> {
  return checkAccessibilitySpec({
    spec: CAROUSEL_PATTERN,
    binding: 'Carousel',
    state: state.id,
    facts: state.facts,
    knownFailures: CAROUSEL_KNOWN_FAILURES,
    mount: async () => {
      render(CAROUSEL_STATE_RENDERS[state.id]());
      return createJsdomHarness({
        subject: subjectFor(state),
        related: relatedFor(state),
      });
    },
    unmount: cleanup,
  });
}

describe('the shared Carousel pattern, jsdom lane', () => {
  it.each(
    CAROUSEL_BINDING_STATES.map(
      state => [`Carousel [${state.id}]`, state.summary, state] as const,
    ),
  )('%s — %s', async (_id, _summary, state) => {
    await expectAccessibilitySpec({
      spec: CAROUSEL_PATTERN,
      binding: 'Carousel',
      state: state.id,
      facts: state.facts,
      knownFailures: CAROUSEL_KNOWN_FAILURES,
      render: () => {
        render(CAROUSEL_STATE_RENDERS[state.id]());
      },
      subject: () => subjectFor(state),
      related: () => relatedFor(state),
      cleanup,
    });
  });

  it('runs DOM expectations and reports higher layers as unrun', async () => {
    const results: BindingResult[] = [];
    for (const state of CAROUSEL_BINDING_STATES) {
      results.push(await checkState(state));
    }
    const report = summarize(CAROUSEL_PATTERN, results);
    expect(report.counts.pass).toBeGreaterThan(0);
    expect(report.unrunLayers).toEqual(['accessibility-tree', 'real-browser']);
    expect(report.counts.unexpectedPass).toBe(0);
  });
});

describe('the Carousel binding inventory', () => {
  it('names a distinct checked-in story for every state', () => {
    const ids = CAROUSEL_BINDING_STATES.map(state => state.storyId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records every excluded owner explicitly', () => {
    expect(CAROUSEL_EXCLUSIONS.every(row => row.owner && row.reason)).toBe(
      true,
    );
  });

  it('renders exactly one subject for every state', () => {
    for (const state of CAROUSEL_BINDING_STATES) {
      render(CAROUSEL_STATE_RENDERS[state.id]());
      expect(subjectFor(state), state.id).toBeTruthy();
      cleanup();
    }
  });
});
