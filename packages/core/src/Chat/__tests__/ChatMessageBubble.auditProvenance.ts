// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ChatMessageBubble.auditProvenance.ts
 * @input Checkout SHA, optional reviewed head, and the served Storybook stamp
 * @output Truthful local or exact-head provenance for browser evidence
 * @position Pure provenance boundary shared by the Bubble browser audit and tests
 */

export interface BuildStampResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface ChatMessageBubbleAuditProvenance {
  mode: 'exact-head' | 'checkout-bound' | 'local-unstamped';
  headSha: string | null;
  checkoutSha: string;
  storybookSha: string | null;
  build: string;
}

interface ResolveAuditProvenanceOptions {
  checkoutSha: string;
  expectedHeadSha?: string;
  storybookOrigin: string;
  fetchStamp?: (url: string) => Promise<BuildStampResponse>;
}

/**
 * Bind CI evidence to one reviewed tree while leaving an ordinary local
 * Storybook build runnable without making an exact-head claim it cannot prove.
 */
export async function resolveChatMessageBubbleAuditProvenance({
  checkoutSha,
  expectedHeadSha,
  storybookOrigin,
  fetchStamp = async url => fetch(url),
}: ResolveAuditProvenanceOptions): Promise<ChatMessageBubbleAuditProvenance> {
  const expectedHead = expectedHeadSha?.trim() || null;
  if (expectedHead != null && checkoutSha !== expectedHead) {
    throw new Error(
      `ChatMessageBubble evidence checkout ${checkoutSha} does not match reviewed head ${expectedHead}`,
    );
  }

  const response = await fetchStamp(`${storybookOrigin}/astryx-build-sha.txt`);
  const storybookSha = response.ok ? (await response.text()).trim() : null;

  if (expectedHead != null) {
    if (storybookSha == null) {
      throw new Error(
        `ChatMessageBubble exact-head evidence requires Storybook source provenance (HTTP ${response.status})`,
      );
    }
    if (storybookSha !== checkoutSha) {
      throw new Error(
        `ChatMessageBubble Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
      );
    }
    return {
      mode: 'exact-head',
      headSha: expectedHead,
      checkoutSha,
      storybookSha,
      build: storybookSha,
    };
  }
  if (storybookSha != null && storybookSha !== checkoutSha) {
    throw new Error(
      `ChatMessageBubble Storybook ${storybookSha} does not match checkout ${checkoutSha}`,
    );
  }
  if (storybookSha != null) {
    return {
      mode: 'checkout-bound',
      headSha: null,
      checkoutSha,
      storybookSha,
      build: storybookSha,
    };
  }
  return {
    mode: 'local-unstamped',
    headSha: null,
    checkoutSha,
    storybookSha: null,
    build: 'local-unstamped',
  };
}
