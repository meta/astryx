// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {resolvePublishedCdnVersion} from './cdn-version.mjs';

describe('resolvePublishedCdnVersion', () => {
  const metadata = {
    'dist-tags': {latest: '0.5.4', canary: '0.5.4-canary.abc1234'},
    versions: {
      '0.5.4': {},
      '0.5.4-canary.abc1234': {},
    },
  };

  it('keeps an exact published pin', () => {
    expect(resolvePublishedCdnVersion(metadata, '0.5.4-canary.abc1234')).toBe(
      '0.5.4-canary.abc1234',
    );
  });

  it('uses the stable latest tag when the release pin is unpublished', () => {
    expect(resolvePublishedCdnVersion(metadata, '0.6.0')).toBe('0.5.4');
  });

  it('does not trust a latest tag that is absent from published versions', () => {
    expect(
      resolvePublishedCdnVersion(
        {...metadata, 'dist-tags': {latest: '0.5.5'}},
        '0.6.0',
      ),
    ).toBeNull();
  });

  it('fails closed when registry metadata is unavailable', () => {
    expect(resolvePublishedCdnVersion(null, '0.6.0')).toBeNull();
    expect(resolvePublishedCdnVersion({}, '0.6.0')).toBeNull();
  });
});
