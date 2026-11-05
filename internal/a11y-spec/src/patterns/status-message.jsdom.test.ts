// Copyright (c) Meta Platforms, Inc. and affiliates.
/** @vitest-environment jsdom */

/**
 * @file status-message.jsdom.test.ts
 * @input Uses plain-HTML status fixtures and the jsdom harness
 * @output Positive and negative proof for every DOM-owned status-message outcome
 * @position Fast self-test of the contract, not a component binding
 */

import {afterEach, describe, expect, it} from 'vitest';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {
  describeExpectation,
  requiredLayers,
  unansweredDimensions,
} from '../contract';
import {JSDOM_OBSERVES, createJsdomHarness} from '../harness/jsdom';
import {STATUS_MESSAGE_PATTERN} from './status-message';
import {
  STATUS_MESSAGE_CONFORMING_FIXTURES,
  STATUS_MESSAGE_MUTATIONS,
  STATUS_MESSAGE_SUBJECT_SELECTOR,
  statusMessageFixture,
  type StatusMessageFixture,
} from './status-message.fixtures';

const observableHere = STATUS_MESSAGE_PATTERN.expectations.filter(expectation =>
  requiredLayers(expectation).every(layer => JSDOM_OBSERVES.includes(layer)),
);

afterEach(() => {
  document.body.replaceChildren();
});

async function resultFor(
  target: StatusMessageFixture,
  expectation: string,
): Promise<ExpectationResult> {
  const container = document.createElement('div');
  document.body.append(container);
  let subjectElement: Element | null = null;
  const result = await checkAccessibilitySpec({
    spec: STATUS_MESSAGE_PATTERN,
    binding: 'fixture',
    state: target.id,
    facts: target.facts,
    only: [expectation],
    mount: async () => {
      container.innerHTML = target.html;
      const subject = container.querySelector(STATUS_MESSAGE_SUBJECT_SELECTOR);
      if (subject == null) {
        throw new Error(`fixture "${target.id}" marks no subject element`);
      }
      subjectElement = subject;
      return createJsdomHarness({subject});
    },
    transition: async name => {
      const transition =
        target.transitions?.[name as keyof typeof target.transitions];
      if (subjectElement == null || transition == null) {
        throw new Error(
          `fixture "${target.id}" supplies no "${name}" transition`,
        );
      }
      if (transition.removeSubject === true) {
        subjectElement.remove();
        return;
      }
      if (transition.replaceSubject === true) {
        const replacement = subjectElement.cloneNode(false) as Element;
        if (transition.attribute != null) {
          if (transition.value == null) {
            replacement.removeAttribute(transition.attribute);
          } else {
            replacement.setAttribute(transition.attribute, transition.value);
          }
        } else if (transition.value !== undefined) {
          replacement.textContent = transition.value;
        }
        subjectElement.replaceWith(replacement);
        return;
      }
      if (transition.pulse === true) {
        if (transition.attribute == null) {
          subjectElement.textContent = '';
        } else {
          subjectElement.setAttribute(transition.attribute, '');
        }
        await Promise.resolve();
      }
      if (transition.hiddenValue !== undefined) {
        const hidden = subjectElement.ownerDocument.createElement('span');
        hidden.setAttribute('aria-hidden', 'true');
        hidden.textContent = transition.hiddenValue;
        subjectElement.replaceChildren(hidden);
      }
      if (transition.attributes != null) {
        for (const [name, value] of Object.entries(transition.attributes)) {
          if (value == null) {
            subjectElement.removeAttribute(name);
          } else {
            subjectElement.setAttribute(name, value);
          }
        }
      }
      if (transition.value !== undefined) {
        if (transition.attribute == null) {
          subjectElement.textContent = transition.value;
        } else if (transition.value == null) {
          subjectElement.removeAttribute(transition.attribute);
        } else {
          subjectElement.setAttribute(transition.attribute, transition.value);
        }
        await Promise.resolve();
      }
    },
    unmount: () => {
      container.innerHTML = '';
    },
  });
  const found = result.results.find(
    candidate => candidate.expectation === expectation,
  );
  if (found == null) {
    throw new Error(`no result for ${expectation}`);
  }
  return found;
}

describe('status-message contract — completeness', () => {
  it('answers every checklist dimension', () => {
    expect(unansweredDimensions(STATUS_MESSAGE_PATTERN)).toEqual([]);
  });

  it('gives every expectation at least one deliberately violating fixture', () => {
    expect(
      STATUS_MESSAGE_PATTERN.expectations
        .filter(
          expectation =>
            (STATUS_MESSAGE_MUTATIONS[expectation.id] ?? []).length === 0,
        )
        .map(expectation => expectation.id),
    ).toEqual([]);
  });

  it('has no orphaned mutation ids or fixture ids', () => {
    const expectationIds = new Set(
      STATUS_MESSAGE_PATTERN.expectations.map(expectation => expectation.id),
    );
    expect(
      Object.keys(STATUS_MESSAGE_MUTATIONS).filter(
        id => !expectationIds.has(id),
      ),
    ).toEqual([]);
    for (const mutations of Object.values(STATUS_MESSAGE_MUTATIONS)) {
      for (const mutation of mutations) {
        expect(() => statusMessageFixture(mutation.fixture)).not.toThrow();
      }
    }
  });
});

describe.each(observableHere.map(expectation => [expectation] as const))(
  '%s',
  expectation => {
    it.each(STATUS_MESSAGE_CONFORMING_FIXTURES.map(id => [id] as const))(
      'passes against %s (or does not apply)',
      async id => {
        const result = await resultFor(
          statusMessageFixture(id),
          expectation.id,
        );
        expect(
          ['pass', 'not-applicable'],
          `${describeExpectation(expectation)}: ${result.detail ?? ''}`,
        ).toContain(result.status);
      },
    );

    it.each(
      (STATUS_MESSAGE_MUTATIONS[expectation.id] ?? []).map(
        mutation => [mutation.fixture, mutation.failureIncludes] as const,
      ),
    )(
      'fails against %s with the intended semantic detail',
      async (id, failureIncludes) => {
        const result = await resultFor(
          statusMessageFixture(id),
          expectation.id,
        );
        expect(
          result.status,
          `${describeExpectation(expectation)}: ${result.detail ?? ''}`,
        ).toBe('fail');
        expect(result.detail).toContain(failureIncludes);
      },
    );
  },
);
