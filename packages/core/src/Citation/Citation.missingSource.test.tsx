// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Citation.missingSource.test.tsx
 * @input Citation rendered with children instead of a `source`
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; Citation's required-prop error
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
  return (await import('./Citation')).Citation as unknown as Loose;
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

describe('Citation without a source', () => {
  it('names the prop and the fix', async () => {
    const Citation = await load();
    expect(
      thrownBy(() => render(<Citation number={1}>Annual report</Citation>)),
    ).toBe(
      "Citation: `source` is required, for example source={{title: 'Annual report', url: 'https://example.com/report'}}. Citation does not read children.",
    );
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const Citation = await load();
    expect(
      thrownBy(() => render(<Citation number={1}>Annual report</Citation>)),
    ).toBe("Cannot read properties of undefined (reading 'title')");
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = 'Citation does not read children';
    expect(
      bundleCoreExport('Citation/Citation', 'Citation', 'development'),
    ).toContain(phrase);
    expect(
      bundleCoreExport('Citation/Citation', 'Citation', 'production'),
    ).not.toContain(phrase);
  });
});
