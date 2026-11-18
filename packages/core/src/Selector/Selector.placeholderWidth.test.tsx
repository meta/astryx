// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An input Selector's value keeps its one-line width as the field's
 * preferred width but sets no minimum: it may break anywhere and shows one
 * clamped line. Ghost and secondary triggers keep `nowrap`.
 */

import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {Selector} from './Selector';

const PLACEHOLDER = 'When are you thinking of launching this project?';
const OPTIONS = [
  {value: 'soon', label: 'Within a month'},
  {value: 'later', label: 'This year'},
];

describe('a Selector value', () => {
  it('in a field does not set the minimum width of its layout', () => {
    render(
      <Selector
        label="Launch"
        placeholder={PLACEHOLDER}
        options={OPTIONS}
        value=""
        onChange={() => {}}
      />,
    );
    const style = getComputedStyle(screen.getByText(PLACEHOLDER));
    expect(style.wordBreak).toBe('break-all');
    expect(style.whiteSpace).toBe('normal');
    expect(style.getPropertyValue('-webkit-line-clamp')).toBe('1');
  });

  it.each(['ghost', 'secondary'] as const)(
    'on a %s trigger keeps sizing it',
    variant => {
      render(
        <Selector
          label="Launch"
          variant={variant}
          placeholder={PLACEHOLDER}
          options={OPTIONS}
          value=""
          onChange={() => {}}
        />,
      );
      expect(getComputedStyle(screen.getByText(PLACEHOLDER)).contain).not.toBe(
        'inline-size',
      );
    },
  );
});
