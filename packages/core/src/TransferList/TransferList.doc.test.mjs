// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import * as transferListDoc from './TransferList.doc.mjs';
import * as transferListSelectorDoc from './TransferListSelector.doc.mjs';

// The dense overlay applies a description by the prop's whole name, so a key
// that names no documented prop is dropped and the prop shows its English text.
function unknownKeys(props, descriptions) {
  const names = new Set((props ?? []).map(prop => prop.name));
  return Object.keys(descriptions ?? {}).filter(key => !names.has(key));
}

describe.each([
  ['TransferList', transferListDoc],
  ['TransferListSelector', transferListSelectorDoc],
])('%s dense docs', (name, {docs, docsDense}) => {
  it('describe only documented props', () => {
    expect(docs.name).toBe(name);
    expect(unknownKeys(docs.props, docsDense.propDescriptions)).toEqual([]);
  });
});
