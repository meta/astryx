// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Theme.missingTheme.test.tsx
 * @input Theme rendered without a `theme`
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; Theme's required-prop error
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
  return (await import('./Theme')).Theme as unknown as Loose;
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

describe('Theme without a theme', () => {
  it('names the prop and the fix', async () => {
    const Theme = await load();
    expect(thrownBy(() => render(<Theme>Page</Theme>))).toBe(
      "Theme: `theme` is required: a theme from defineTheme() or a theme package, for example <Theme theme={neutralTheme}> with import {neutralTheme} from '@astryxdesign/theme-neutral'. For the default look, leave out <Theme>.",
    );
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const Theme = await load();
    expect(thrownBy(() => render(<Theme>Page</Theme>))).toBe(
      "Cannot read properties of undefined (reading 'name')",
    );
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = 'For the default look, leave out <Theme>';
    expect(bundleCoreExport('theme/Theme', 'Theme', 'development')).toContain(
      phrase,
    );
    expect(
      bundleCoreExport('theme/Theme', 'Theme', 'production'),
    ).not.toContain(phrase);
  });
});
