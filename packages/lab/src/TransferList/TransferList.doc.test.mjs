// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {docs, docsDense} from './TransferList.doc.mjs';

// The dense overlay applies a description by the prop's whole name, so a key
// that names no documented prop is dropped and the prop shows its English text.
function unknownKeys(props, descriptions) {
  const names = new Set((props ?? []).map(prop => prop.name));
  return Object.keys(descriptions ?? {}).filter(key => !names.has(key));
}

describe('TransferList dense docs', () => {
  it('describe only documented TransferListSelector props', () => {
    expect(unknownKeys(docs.props, docsDense.propDescriptions)).toEqual([]);
  });

  it('describe only documented props of each member component', () => {
    for (const dense of docsDense.components ?? []) {
      const member = (docs.components ?? []).find(
        component => component.name === dense.name,
      );
      expect(
        unknownKeys(member?.props, dense.propDescriptions),
        dense.name,
      ).toEqual([]);
    }
  });
});
