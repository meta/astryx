// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageBubble.auditProvenance.test.ts
 * @input Local unstamped and CI exact-head provenance fixtures
 * @output Fail-open local execution and fail-closed CI provenance contracts
 * @position Focused regression tests for the Bubble browser evidence boundary
 */

import {describe, expect, it, vi} from 'vitest';
import {
  type BuildStampResponse,
  resolveChatMessageBubbleAuditProvenance,
} from './ChatMessageBubble.auditProvenance';

const HEAD = 'a'.repeat(40);
const OTHER_HEAD = 'b'.repeat(40);

function stamp(status: number, body = '') {
  return vi.fn(async (): Promise<BuildStampResponse> => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }));
}

describe('ChatMessageBubble audit provenance', () => {
  it('runs an ordinary local Storybook build without an exact-head stamp', async () => {
    const fetchStamp = stamp(404);

    await expect(
      resolveChatMessageBubbleAuditProvenance({
        checkoutSha: HEAD,
        storybookOrigin: 'http://127.0.0.1:6006',
        fetchStamp,
      }),
    ).resolves.toEqual({
      mode: 'local-unstamped',
      headSha: null,
      checkoutSha: HEAD,
      storybookSha: null,
      build: 'local-unstamped',
    });
    expect(fetchStamp).toHaveBeenCalledWith(
      'http://127.0.0.1:6006/astryx-build-sha.txt',
    );
  });

  it('fails closed when CI Storybook provenance is missing', async () => {
    await expect(
      resolveChatMessageBubbleAuditProvenance({
        checkoutSha: HEAD,
        expectedHeadSha: HEAD,
        storybookOrigin: 'http://127.0.0.1:6006',
        fetchStamp: stamp(404),
      }),
    ).rejects.toThrow(
      'exact-head evidence requires Storybook source provenance',
    );
  });

  it('fails closed when the CI Storybook stamp differs from the checkout', async () => {
    await expect(
      resolveChatMessageBubbleAuditProvenance({
        checkoutSha: HEAD,
        expectedHeadSha: HEAD,
        storybookOrigin: 'http://127.0.0.1:6006',
        fetchStamp: stamp(200, OTHER_HEAD),
      }),
    ).rejects.toThrow(
      `Storybook ${OTHER_HEAD} does not match checkout ${HEAD}`,
    );
  });

  it('records exact-head provenance only when CI head, checkout, and stamp match', async () => {
    await expect(
      resolveChatMessageBubbleAuditProvenance({
        checkoutSha: HEAD,
        expectedHeadSha: HEAD,
        storybookOrigin: 'http://127.0.0.1:6006',
        fetchStamp: stamp(200, `${HEAD}\n`),
      }),
    ).resolves.toEqual({
      mode: 'exact-head',
      headSha: HEAD,
      checkoutSha: HEAD,
      storybookSha: HEAD,
      build: HEAD,
    });
  });
});
