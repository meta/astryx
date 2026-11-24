// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createElement, Fragment} from 'react';
import {describe, expect, it} from 'vitest';

import {getNodeText} from './getNodeText';

describe('getNodeText', () => {
  it('reads strings, numbers and element children as they render', () => {
    expect(getNodeText('Name')).toBe('Name');
    expect(getNodeText(42)).toBe('42');
    expect(getNodeText(createElement('span', null, 'Amount (EUR)'))).toBe(
      'Amount (EUR)',
    );
    expect(getNodeText(['Total ', createElement('b', null, 3)])).toBe(
      'Total 3',
    );
  });

  it('joins inline elements with the text beside them', () => {
    expect(getNodeText(['un', createElement('b', null, 'like'), 'ly'])).toBe(
      'unlikely',
    );
    expect(getNodeText([createElement('strong', null, 'March 1'), '.'])).toBe(
      'March 1.',
    );
    expect(
      getNodeText(
        createElement(Fragment, null, 'H', createElement('sub', null, 2), 'O'),
      ),
    ).toBe('H2O');
    expect(getNodeText([42, '%'])).toBe('42%');
  });

  it('keeps a block element, a line break and a component apart from the text beside them', () => {
    expect(
      getNodeText([
        createElement('strong', null, 'Update ready'),
        createElement('div', null, 'Restart to apply'),
      ]),
    ).toBe('Update ready Restart to apply');
    expect(getNodeText(['Line one', createElement('br'), 'Line two'])).toBe(
      'Line one Line two',
    );
    const Name = ({children}: {children: string}) => children;
    expect(getNodeText(['Owner', createElement(Name, null, 'Ada')])).toBe(
      'Owner Ada',
    );
    expect(getNodeText(['Saved ', createElement('p', null, 'now')])).toBe(
      'Saved now',
    );
  });

  it('keeps a block apart from the text beside it when an inline element holds it', () => {
    expect(
      getNodeText([
        'x',
        createElement('span', null, createElement('div', null, 'A')),
        'y',
      ]),
    ).toBe('x A y');
    expect(
      getNodeText([
        'Total',
        createElement('span', null, '12', createElement('div', null, 'items')),
        'left',
      ]),
    ).toBe('Total12 items left');
    expect(
      getNodeText([
        'Saved',
        createElement('span', null, createElement('br')),
        'now',
      ]),
    ).toBe('Saved now');
    // An inline element that holds only inline text still joins it.
    expect(
      getNodeText([
        'un',
        createElement('span', null, createElement('b', null, 'like')),
        'ly',
      ]),
    ).toBe('unlikely');
  });

  it('yields nothing for empty nodes and text a component renders from other props', () => {
    for (const node of [null, undefined, true, false, []]) {
      expect(getNodeText(node)).toBe('');
    }
    const Labelled = ({label}: {label: string}) => label;
    expect(getNodeText(createElement(Labelled, {label: 'Hidden'}))).toBe('');
  });
});
