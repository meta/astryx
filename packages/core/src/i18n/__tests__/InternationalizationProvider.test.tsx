// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file InternationalizationProvider.test.tsx
 * @input packages/core/src/i18n/InternationalizationProvider.tsx, useTranslator,
 *   useDirection, useLocale
 * @output Unit tests for the provider's update and nesting contract
 * @position Colocated tests; targets re-rendering when messages, overrides, or
 *   dir change (locale is covered by useLocale/useTranslator tests) and a nested
 *   provider replacing rather than merging its parent's context.
 */

import {describe, expect, test} from 'vitest';
import {render} from '@testing-library/react';
import {InternationalizationProvider} from '../InternationalizationProvider';
import {useDirection} from '../useDirection';
import {useLocale} from '../useLocale';
import {useTranslator} from '../useTranslator';
import type {MessagesByLocale, Overrides} from '../types';

const NEXT = '@astryx.pagination.next';
const APP_KEY = '@myapp.save';

function Probe() {
  const t = useTranslator();
  return (
    <>
      <span data-testid="next">{t(NEXT)}</span>
      <span data-testid="app">{t(APP_KEY)}</span>
      <span data-testid="locale">{useLocale()}</span>
      <span data-testid="dir">{useDirection()}</span>
    </>
  );
}

const FR_MESSAGES: MessagesByLocale = {
  fr: {[APP_KEY]: {defaultMessage: 'Enregistrer'}},
};
const FR_MESSAGES_V2: MessagesByLocale = {
  fr: {[APP_KEY]: {defaultMessage: 'Sauvegarder'}},
};
const FR_OVERRIDES: Overrides = {fr: {[NEXT]: 'Suivant'}};
const FR_OVERRIDES_V2: Overrides = {fr: {[NEXT]: 'Page suivante'}};

describe('InternationalizationProvider — re-rendering', () => {
  test('re-renders consumers when messages change', () => {
    const {getByTestId, rerender} = render(
      <InternationalizationProvider locale="fr" messages={FR_MESSAGES}>
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('app').textContent).toBe('Enregistrer');

    rerender(
      <InternationalizationProvider locale="fr" messages={FR_MESSAGES_V2}>
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('app').textContent).toBe('Sauvegarder');
  });

  test('re-renders consumers when overrides change', () => {
    const {getByTestId, rerender} = render(
      <InternationalizationProvider locale="fr" overrides={FR_OVERRIDES}>
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('next').textContent).toBe('Suivant');

    rerender(
      <InternationalizationProvider locale="fr" overrides={FR_OVERRIDES_V2}>
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('next').textContent).toBe('Page suivante');
  });

  test('re-renders consumers when dir changes', () => {
    const {getByTestId, rerender} = render(
      <InternationalizationProvider locale="en" dir="rtl">
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('dir').textContent).toBe('rtl');

    rerender(
      <InternationalizationProvider locale="en" dir="ltr">
        <Probe />
      </InternationalizationProvider>,
    );
    expect(getByTestId('dir').textContent).toBe('ltr');
  });
});

describe('InternationalizationProvider — nesting', () => {
  test('a nested provider replaces the parent context instead of merging it', () => {
    const {getByTestId} = render(
      <InternationalizationProvider
        locale="fr"
        dir="rtl"
        messages={FR_MESSAGES}
        overrides={FR_OVERRIDES}>
        <InternationalizationProvider locale="fr">
          <Probe />
        </InternationalizationProvider>
      </InternationalizationProvider>,
    );
    // Locale is the child's own; direction derives from it, not the parent's
    // explicit rtl; parent overrides and catalogs do not leak into the child.
    expect(getByTestId('locale').textContent).toBe('fr');
    expect(getByTestId('dir').textContent).toBe('ltr');
    expect(getByTestId('next').textContent).toBe('Go to next page');
    expect(getByTestId('app').textContent).toBe(APP_KEY);
  });

  test('a nested provider can narrow the locale for one subtree', () => {
    const {getByTestId} = render(
      <InternationalizationProvider locale="fr" overrides={FR_OVERRIDES}>
        <InternationalizationProvider locale="de">
          <Probe />
        </InternationalizationProvider>
      </InternationalizationProvider>,
    );
    expect(getByTestId('locale').textContent).toBe('de');
    // No de override or catalog: shipped English wins.
    expect(getByTestId('next').textContent).toBe('Go to next page');
  });
});
