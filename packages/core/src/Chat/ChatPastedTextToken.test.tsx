// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatPastedTextToken.test.tsx
 * @input Uses React Testing Library, ChatPastedTextToken, InternationalizationProvider
 * @output Verifies catalog-backed pasted-text counts and deterministic English fallback
 */

import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {InternationalizationProvider} from '../i18n';
import en from '../../locales/en.json';
import {ChatPastedTextToken} from './ChatPastedTextToken';

describe('ChatPastedTextToken', () => {
  it.each([
    {text: '', label: '0 chars'},
    {text: 'a', label: '1 chars'},
    {text: 'hello', label: '5 chars'},
    {text: 'a\nb', label: '2 lines, 3 chars'},
  ])(
    'preserves the English count label for $text without a provider',
    ({text, label}) => {
      render(<ChatPastedTextToken text={text} />);
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it('keeps 21 lines distinct from exactly one line in a Slavic locale', () => {
    render(
      <InternationalizationProvider
        locale="ru"
        messages={{
          ru: {
            '@astryx.chat.pastedText.label':
              en['@astryx.chat.pastedText.label'],
          },
        }}>
        <ChatPastedTextToken text={'a\n'.repeat(20) + 'a'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('21 lines, 41 chars')).toBeInTheDocument();
  });

  it('updates both count branches when the provider changes', () => {
    const overrides = {
      fr: {
        '@astryx.chat.pastedText.label':
          '{lines, plural, =1 {{chars, plural, one {un caractère} other {{chars} caractères}}} other {{chars, plural, one {un caractère} other {{chars} caractères}} sur {lines} lignes}}',
      },
    };
    const {rerender} = render(
      <InternationalizationProvider locale="fr" overrides={overrides}>
        <ChatPastedTextToken text="hello" />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('5 caractères')).toBeInTheDocument();
    rerender(
      <InternationalizationProvider locale="fr" overrides={overrides}>
        <ChatPastedTextToken text={'a\nb'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('3 caractères sur 2 lignes')).toBeInTheDocument();
    rerender(
      <InternationalizationProvider locale="en" overrides={overrides}>
        <ChatPastedTextToken text={'a\nb'} />
      </InternationalizationProvider>,
    );
    expect(screen.getByText('2 lines, 3 chars')).toBeInTheDocument();
  });
});
