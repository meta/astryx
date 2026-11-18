// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * An input Selector takes the width its field gives it and ellipsizes its
 * value, so a long placeholder never sets how wide the field must be. Ghost
 * and secondary triggers size to their value.
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
    expect(getComputedStyle(screen.getByText(PLACEHOLDER)).contain).toBe(
      'inline-size',
    );
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
