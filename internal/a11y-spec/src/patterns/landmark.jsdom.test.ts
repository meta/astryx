// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/** Contract self-tests for Landmark DOM expectations and completeness. */

import {afterEach, describe, expect, it} from 'vitest';
import {
  citeSource,
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {LANDMARK_PATTERN} from './landmark';
import {
  CONFORMING_LANDMARK_FIXTURES,
  LANDMARK_CONTENT_SELECTOR,
  LANDMARK_MUTATIONS,
  LANDMARK_PEER_SELECTOR,
  LANDMARK_SUBJECT_SELECTOR,
  landmarkFixture,
  type LandmarkFixture,
} from './landmark.fixtures';

afterEach(() => document.body.replaceChildren());

async function resultsFor(target: LandmarkFixture) {
  const container = document.createElement('div');
  document.body.append(container);
  const run = await checkAccessibilitySpec({
    spec: LANDMARK_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(LANDMARK_SUBJECT_SELECTOR);
      const content = container.querySelector(LANDMARK_CONTENT_SELECTOR);
      if (subject == null || content == null) {
        throw new Error(
          `fixture "${target.id}" is missing its landmark or content`,
        );
      }
      const related: Record<string, Element> = {content};
      container
        .querySelectorAll(LANDMARK_PEER_SELECTOR)
        .forEach((peer, index) => {
          related[`peer-${index}`] = peer;
        });
      return createJsdomHarness({subject, related});
    },
    unmount: () => {
      container.innerHTML = '';
    },
  });
  return run.results;
}

function resultFor(
  results: readonly ExpectationResult[],
  id: string,
): ExpectationResult {
  const found = results.find(result => result.expectation === id);
  if (found == null) {
    throw new Error(`no result for ${id}`);
  }
  return found;
}

const observableHere = LANDMARK_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

describe('Landmark contract — completeness', () => {
  it('answers every completeness dimension', () => {
    expect(unansweredDimensions(LANDMARK_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      LANDMARK_PATTERN.expectations
        .filter(
          expectation =>
            (LANDMARK_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has an expectation for every mutation it records', () => {
    const ids = new Set(
      LANDMARK_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(Object.keys(LANDMARK_MUTATIONS).filter(id => !ids.has(id))).toEqual(
      [],
    );
  });

  it('keeps the APG-only repeated-label outcome advisory', () => {
    const peers = LANDMARK_PATTERN.expectations.find(
      expectation => expectation.id === 'landmark.peers.distinct-names',
    );
    expect(peers?.enforcement).toBe('advisory');
    expect(
      LANDMARK_PATTERN.expectations
        .filter(expectation => expectation.id !== peers?.id)
        .every(expectation => expectation.enforcement === 'required'),
    ).toBe(true);
  });
});

describe('Landmark contract — the jsdom harness stays within its evidence boundary', () => {
  it('runs DOM expectations and reports accessibility-tree expectations as unrun', async () => {
    const results = await resultsFor(landmarkFixture('conforming-labelled'));
    expect(results.some(result => result.status === 'pass')).toBe(true);
    const unrun = results.filter(result => result.status === 'unrun');
    expect(unrun.length).toBeGreaterThan(0);
    for (const result of unrun) {
      expect(result.missingLayers).toContain('accessibility-tree');
    }
  });
});

describe.each(observableHere.map(expectation => [expectation.id] as const))(
  '%s',
  id => {
    const expectation = LANDMARK_PATTERN.expectations.find(
      candidate => candidate.id === id,
    )!;

    it.each(CONFORMING_LANDMARK_FIXTURES.map(name => [name] as const))(
      'passes against %s (or does not apply to it)',
      async name => {
        const result = resultFor(await resultsFor(landmarkFixture(name)), id);
        expect(
          ['pass', 'not-applicable'],
          `${id} against ${name}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each((LANDMARK_MUTATIONS[id] ?? []).map(name => [name] as const))(
      'fails against %s, which removes its outcome',
      async name => {
        const result = resultFor(await resultsFor(landmarkFixture(name)), id);
        expect(result.status, `${id} against ${name}`).toBe('fail');
        expect(result.detail ?? '').not.toBe('');
      },
    );

    it('carries its id and primary source into every result description', async () => {
      const target = landmarkFixture(
        LANDMARK_MUTATIONS[id]?.[0] ?? CONFORMING_LANDMARK_FIXTURES[0]!,
      );
      const result = resultFor(await resultsFor(target), id);
      expect(result.description).toContain(id);
      expect(result.description).toContain(citeSource(expectation.sources[0]));
      expect(describeExpectation(expectation)).toBe(result.description);
    });
  },
);
