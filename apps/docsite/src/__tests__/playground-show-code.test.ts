// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Playground "Show code" element printing tests.
 * @input React elements built from slot descriptors, including an SVG with a
 *   nested path, a childless component element and text children
 * @output Regression coverage that printed JSX keeps an element's children
 *   and that a childless element still self-closes.
 */

import {createElement} from 'react';
import {describe, expect, it} from 'vitest';
import {formatElementCode} from '../components/component-detail/formatElementCode';

function Icon() {
  return null;
}

function Text() {
  return null;
}

describe('playground Show code element printing', () => {
  it('prints an SVG slot element with its path', () => {
    const svg = createElement(
      'svg',
      {viewBox: '0 0 24 24', width: 6, height: 6, 'aria-hidden': true},
      createElement('path', {d: 'M5 13l4 4L19 7'}),
    );

    expect(formatElementCode(svg)).toBe(
      '<svg viewBox="0 0 24 24" width={6} height={6} aria-hidden={true}>' +
        '<path d="M5 13l4 4L19 7" /></svg>',
    );
  });

  it('prints every child of an array of children', () => {
    const svg = createElement('svg', {viewBox: '0 0 24 24'}, [
      createElement('path', {key: 'a', d: 'M1 1'}),
      createElement('path', {key: 'b', d: 'M2 2'}),
    ]);

    expect(formatElementCode(svg)).toBe(
      '<svg viewBox="0 0 24 24"><path d="M1 1" /><path d="M2 2" /></svg>',
    );
  });

  it('still self-closes an element without children', () => {
    const icon = createElement(Icon, {icon: 'check', size: 'sm'});

    expect(formatElementCode(icon)).toBe('<Icon icon="check" size="sm" />');
  });

  it('self-closes an element without props or children', () => {
    expect(formatElementCode(createElement(Icon))).toBe('<Icon />');
  });

  it('prints text children and escapes JSX braces in them', () => {
    const text = createElement(Text, null, 'Hello {name}');

    expect(formatElementCode(text)).toBe("<Text>Hello {'{'}name{'}'}</Text>");
  });

  it('prints a prop whose value is an element as JSX', () => {
    const text = createElement(Text, {
      startIcon: createElement(Icon, {icon: 'check'}),
    });

    expect(formatElementCode(text)).toBe(
      '<Text startIcon={<Icon icon="check" />} />',
    );
  });
});
