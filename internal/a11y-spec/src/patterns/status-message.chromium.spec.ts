// Copyright (c) Meta Platforms, Inc. and affiliates.
// @pr-a11y release-only

/**
 * @file status-message.chromium.spec.ts
 * @input Uses plain-HTML status fixtures and the Chromium accessibility tree
 * @output Positive and negative proof for every browser-owned status-message outcome
 * @position Real-browser self-test of the contract, not a component binding
 */

import {expect, test, type CDPSession, type Page} from '@playwright/test';
import {checkAccessibilitySpec, type ExpectationResult} from '../check';
import {describeExpectation, requiredLayers} from '../contract';
import {CHROMIUM_OBSERVES, createChromiumHarness} from '../harness/chromium';
import {STATUS_MESSAGE_PATTERN} from './status-message';
import {
  STATUS_MESSAGE_CONFORMING_FIXTURES,
  STATUS_MESSAGE_MUTATIONS,
  STATUS_MESSAGE_SUBJECT_SELECTOR,
  statusMessageFixture,
  type StatusMessageFixture,
} from './status-message.fixtures';

async function applyTransition(
  page: Page,
  target: StatusMessageFixture,
  name: string,
): Promise<void> {
  const transition =
    target.transitions?.[name as keyof typeof target.transitions];
  if (transition == null) {
    throw new Error(`fixture "${target.id}" supplies no "${name}" transition`);
  }
  const subject = page.locator(STATUS_MESSAGE_SUBJECT_SELECTOR);
  if (transition.removeSubject === true) {
    await subject.evaluate(node => node.remove());
    return;
  }
  if (transition.replaceSubject === true) {
    await subject.evaluate((node, next) => {
      const replacement = node.cloneNode(false) as Element;
      if (next.attribute != null) {
        if (next.value == null) {
          replacement.removeAttribute(next.attribute);
        } else {
          replacement.setAttribute(next.attribute, next.value);
        }
      } else if (next.value !== undefined) {
        replacement.textContent = next.value;
      }
      node.replaceWith(replacement);
    }, transition);
    return;
  }
  if (transition.pulse === true) {
    await subject.evaluate((node, attribute) => {
      if (attribute == null) {
        node.textContent = '';
      } else {
        node.setAttribute(attribute, '');
      }
    }, transition.attribute ?? null);
    await page.evaluate(
      () =>
        new Promise<void>(resolve => requestAnimationFrame(() => resolve())),
    );
  }
  if (transition.hiddenValue !== undefined) {
    await subject.evaluate((node, value) => {
      const hidden = node.ownerDocument.createElement('span');
      hidden.setAttribute('aria-hidden', 'true');
      hidden.textContent = value;
      node.replaceChildren(hidden);
    }, transition.hiddenValue);
  }
  if (transition.attributes != null) {
    await subject.evaluate((node, attributes) => {
      for (const [name, value] of Object.entries(attributes)) {
        if (value == null) {
          node.removeAttribute(name);
        } else {
          node.setAttribute(name, value);
        }
      }
    }, transition.attributes);
  }
  if (transition.value !== undefined) {
    await subject.evaluate((node, next) => {
      if (next.attribute == null) {
        node.textContent = next.value ?? '';
      } else if (next.value == null) {
        node.removeAttribute(next.attribute);
      } else {
        node.setAttribute(next.attribute, next.value);
      }
    }, transition);
  }
  if (transition.focusSelector != null) {
    await page.locator(transition.focusSelector).focus();
  }
}

async function resultsFor(
  page: Page,
  cdp: CDPSession,
  target: StatusMessageFixture,
  only?: readonly string[],
): Promise<readonly ExpectationResult[]> {
  return (
    await checkAccessibilitySpec({
      spec: STATUS_MESSAGE_PATTERN,
      binding: 'fixture',
      state: target.id,
      facts: target.facts,
      only,
      mount: async () => {
        await page.setContent(target.html);
        return createChromiumHarness({
          page,
          cdp,
          subject: page.locator(STATUS_MESSAGE_SUBJECT_SELECTOR),
          related: {
            'focus-anchor': page.locator('[data-a11y-relation="focus-anchor"]'),
          },
        });
      },
      transition: name => applyTransition(page, target, name),
    })
  ).results;
}

test.describe('status-message contract — conforming fixtures', () => {
  for (const fixtureId of STATUS_MESSAGE_CONFORMING_FIXTURES) {
    test(`${fixtureId}: every applicable expectation passes`, async ({
      page,
    }) => {
      const cdp = await page.context().newCDPSession(page);
      const results = await resultsFor(
        page,
        cdp,
        statusMessageFixture(fixtureId),
      );
      expect(
        results
          .filter(
            result =>
              result.status !== 'pass' && result.status !== 'not-applicable',
          )
          .map(result => `${result.expectation}: ${result.detail ?? ''}`),
      ).toEqual([]);
    });
  }

  test('a replacement node can satisfy every required semantic outcome', async ({
    page,
  }) => {
    const cdp = await page.context().newCDPSession(page);
    const fixture = statusMessageFixture('violating-replaced-region');
    const requiredIds = STATUS_MESSAGE_PATTERN.expectations
      .filter(expectation => expectation.enforcement === 'required')
      .map(expectation => expectation.id);
    const required = await resultsFor(page, cdp, fixture, requiredIds);
    expect(
      required
        .filter(
          result =>
            result.status !== 'pass' && result.status !== 'not-applicable',
        )
        .map(result => `${result.expectation}: ${result.detail ?? ''}`),
    ).toEqual([]);
  });
});

test.describe('status-message contract — deliberately violating fixtures', () => {
  for (const expectation of STATUS_MESSAGE_PATTERN.expectations) {
    if (
      !requiredLayers(expectation).every(layer =>
        CHROMIUM_OBSERVES.includes(layer),
      )
    ) {
      continue;
    }
    for (const mutation of STATUS_MESSAGE_MUTATIONS[expectation.id] ?? []) {
      test(`${describeExpectation(expectation)} — fails against ${mutation.fixture}`, async ({
        page,
      }) => {
        const cdp = await page.context().newCDPSession(page);
        const [result] = await resultsFor(
          page,
          cdp,
          statusMessageFixture(mutation.fixture),
          [expectation.id],
        );
        expect(result?.status, result?.detail ?? 'no result').toBe('fail');
        expect(result?.detail).toContain(mutation.failureIncludes);
      });
    }
  }
});
