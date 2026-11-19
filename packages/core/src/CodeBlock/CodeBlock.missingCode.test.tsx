// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeBlock.missingCode.test.tsx
 * @input CodeBlock rendered with children instead of a `code` string
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; CodeBlock's required-prop error
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import type {ComponentType, ReactNode} from 'react';
import {bundleCoreExport} from '../utils/__tests__/devBundle';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

type Loose = ComponentType<Record<string, unknown> & {children?: ReactNode}>;

async function load(): Promise<Loose> {
  return (await import('./CodeBlock')).CodeBlock as unknown as Loose;
}

/** The message a render throws, or null when it does not throw. */
function thrownBy(render: () => unknown): string | null {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

describe('CodeBlock without a code string', () => {
  it('names the prop and the fix', async () => {
    const CodeBlock = await load();
    expect(
      thrownBy(() => render(<CodeBlock language="ts">const a = 1;</CodeBlock>)),
    ).toBe(
      'CodeBlock: `code` must be a string, for example <CodeBlock code="const a = 1;" language="ts" />. CodeBlock does not read children.',
    );
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const CodeBlock = await load();
    expect(
      thrownBy(() => render(<CodeBlock language="ts">const a = 1;</CodeBlock>)),
    ).toBe("Cannot read properties of undefined (reading 'split')");
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = 'CodeBlock does not read children';
    expect(
      bundleCoreExport('CodeBlock/CodeBlock', 'CodeBlock', 'development'),
    ).toContain(phrase);
    expect(
      bundleCoreExport('CodeBlock/CodeBlock', 'CodeBlock', 'production'),
    ).not.toContain(phrase);
  });
});
