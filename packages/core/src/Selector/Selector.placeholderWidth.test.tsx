// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An input Selector's placeholder keeps its one-line width as the field's
 * preferred width but sets no minimum: it may break anywhere and shows one
 * clamped line. A chosen value, and ghost and secondary triggers, keep
 * `nowrap`, so a lane sized from its content's minimum still reads it.
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
      expect(getComputedStyle(screen.getByText(PLACEHOLDER)).whiteSpace).toBe(
        'nowrap',
      );
    },
  );

  it('keeps nowrap for a chosen value in a field', () => {
    render(
      <Selector
        label="Launch"
        placeholder={PLACEHOLDER}
        options={OPTIONS}
        value="soon"
        onChange={() => {}}
      />,
    );
    // The trigger's value text, not the option of the same label.
    const value = screen
      .getAllByText('Within a month')
      .find(el => el.tagName === 'SPAN' && el.id !== '') as HTMLElement;
    expect(value).toBeDefined();
    expect(getComputedStyle(value).whiteSpace).toBe('nowrap');
    expect(value.getAttribute('dir')).toBe('auto');
  });
});
