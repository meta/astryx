// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {readLiveNumberDraft} from '../lib/useLiveNumberInput';

describe('readLiveNumberDraft', () => {
  it('returns an in-range machine number for live preview', () => {
    expect(readLiveNumberDraft('12.5', {min: 0, max: 20})).toBe(12.5);
  });

  it('rejects unreadable and non-integral drafts', () => {
    expect(readLiveNumberDraft('1·234', {})).toBeNull();
    expect(readLiveNumberDraft('3.5', {isIntegerOnly: true})).toBeNull();
  });

  it('leaves empty and out-of-range drafts to NumberInput commit policy', () => {
    expect(readLiveNumberDraft('', {})).toBeNull();
    expect(readLiveNumberDraft('100', {max: 10})).toBeNull();
  });
});
