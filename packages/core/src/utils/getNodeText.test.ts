// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createElement} from 'react';
import {describe, expect, it} from 'vitest';

import {getNodeText} from './getNodeText';

describe('getNodeText', () => {
  it('reads strings, numbers and element children, joined with spaces', () => {
    expect(getNodeText('Name')).toBe('Name');
    expect(getNodeText(42)).toBe('42');
    expect(getNodeText(createElement('span', null, 'Amount (EUR)'))).toBe(
      'Amount (EUR)',
    );
    expect(getNodeText(['Total', createElement('b', null, 3)])).toBe('Total 3');
  });

  it('yields nothing for empty nodes and text a component renders from other props', () => {
    for (const node of [null, undefined, true, false, []])
      {expect(getNodeText(node)).toBe('');}
    const Labelled = ({label}: {label: string}) => label;
    expect(getNodeText(createElement(Labelled, {label: 'Hidden'}))).toBe('');
  });
});
