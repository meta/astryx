// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Focused contract tests for the checkout-wizard page template
 * @input Reads the shipped single-file template and its authored metadata
 * @output Guards validation, completion, postal, promo, and responsive contracts
 * @position CLI template regression coverage; runs in the node test project
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {doc} from '../../assets/templates/pages/checkout-wizard/template.doc.mjs';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(
  path.resolve(
    dirname,
    '../../assets/templates/pages/checkout-wizard/page.tsx',
  ),
  'utf8',
);

function postalRule(country) {
  const block = source.match(
    new RegExp(`\\n  ${country}: \\{([\\s\\S]*?)\\n  \\},`),
  )?.[1];
  const literal = block?.match(/pattern:\s*\/([^\n/]+)\/([a-z]*),/);
  if (!literal) {
    throw new Error(`Missing postal rule for ${country}`);
  }
  return new RegExp(literal[1], literal[2]);
}

describe('checkout wizard template contract', () => {
  it('uses the supported checkout category', () => {
    expect(doc.category).toBe('Form - Checkout');
  });

  it('validates every forward transition and focuses the first blocked field', () => {
    expect(source).toContain(
      'for (let candidate = step; candidate < index; candidate += 1)',
    );
    expect(source).toContain('errorsByStep[candidate]');
    expect(source).toContain('pendingFocusStepRef.current = firstInvalid');
    expect(source).toContain('\'[aria-invalid="true"]\'');
  });

  it('records a local completion outcome after valid payment details', () => {
    expect(source).toContain('setIsComplete(true)');
    expect(source).toContain('title="Order confirmed"');
    expect(source).toContain('No payment was sent.');
  });

  it('uses country-aware postal validation', () => {
    const us = postalRule('us');
    const ca = postalRule('ca');
    const uk = postalRule('uk');

    expect(us.test('10001')).toBe(true);
    expect(us.test('10001-1234')).toBe(true);
    expect(us.test('K1A 0B1')).toBe(false);

    expect(ca.test('K1A 0B1')).toBe(true);
    expect(ca.test('k1a0b1')).toBe(true);
    expect(ca.test('10001')).toBe(false);

    expect(uk.test('SW1A 1AA')).toBe(true);
    expect(uk.test('EC1A 1BB')).toBe(true);
    expect(uk.test('GIR 0AA')).toBe(true);
    expect(uk.test('10001')).toBe(false);
  });

  it('shows a terminal invalid-promo result instead of repeating Apply guidance', () => {
    expect(source).toContain("'That promo code is not valid.'");
    expect(source).toContain('promoInput.trim() && promoWasChecked');
  });

  it('responds to host width and puts the narrow summary first in DOM order', () => {
    expect(source).not.toContain('useMediaQuery');
    expect(source).toContain('new ResizeObserver');
    expect(source).toMatch(
      /\{isNarrow && <StackItem>\{summaryCard\}<\/StackItem>\}[\s\S]*?<StackItem size="fill">/,
    );
  });
});
