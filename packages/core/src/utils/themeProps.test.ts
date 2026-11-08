// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {themeDataAttributes, themeProps} from './themeProps';

describe('themeProps', () => {
  it('returns the stable target class for a component', () => {
    expect(themeProps('card').className).toBe('astryx-card');
  });

  it('emits only the stable target class while reflecting props and state', () => {
    expect(
      themeProps('button', {variant: 'secondary', size: 'sm'}).className,
    ).toBe('astryx-button');
    expect(themeProps('switch', {checked: 'checked'}).className).toBe(
      'astryx-switch',
    );
  });

  it('does not turn numeric values into classes', () => {
    expect(themeProps('heading', {level: 1}).className).toBe('astryx-heading');
    expect(themeProps('heading', {level: '3'}).className).toBe(
      'astryx-heading',
    );
  });

  it('ignores nullish reflected values in the class name', () => {
    expect(
      themeProps('button', {variant: 'primary', size: undefined}).className,
    ).toBe('astryx-button');
  });

  it('reflects visual props as data attributes', () => {
    expect(
      themeDataAttributes({variant: 'secondary', size: 'sm', level: 2}),
    ).toEqual({
      'data-variant': 'secondary',
      'data-size': 'sm',
      'data-level': '2',
    });
  });

  it('kebab-cases data attribute names', () => {
    expect(themeDataAttributes({listStyle: 'ordered'})).toEqual({
      'data-list-style': 'ordered',
    });
  });

  it('omits nullish data attributes', () => {
    expect(themeDataAttributes({variant: 'primary', size: null})).toEqual({
      'data-variant': 'primary',
    });
  });

  it('returns the stable target and canonical data attributes together', () => {
    expect(themeProps('button', {variant: 'primary', size: 'sm'})).toEqual({
      className: 'astryx-button',
      'data-variant': 'primary',
      'data-size': 'sm',
    });
  });
});
