// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Kbd.missingKeys.test.tsx
 * @input Kbd rendered with children or an array instead of a `keys` string
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; Kbd's required-prop error
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

async function loadKbd(): Promise<Loose> {
  return (await import('./Kbd')).Kbd as unknown as Loose;
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

const MESSAGE =
  'Kbd: `keys` must be a string of keys joined by "+", for example <Kbd keys="mod+k" />. Kbd does not read children.';

describe('Kbd without a keys string', () => {
  it('names the prop and the fix when given children', async () => {
    const Kbd = await loadKbd();
    expect(thrownBy(() => render(<Kbd>⌘K</Kbd>))).toBe(MESSAGE);
  });

  it('names the prop and the fix when given an array', async () => {
    const Kbd = await loadKbd();
    expect(thrownBy(() => render(<Kbd keys={['mod', 'k']} />))).toBe(MESSAGE);
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const Kbd = await loadKbd();
    expect(thrownBy(() => render(<Kbd>⌘K</Kbd>))).toBe(
      "Cannot read properties of undefined (reading 'split')",
    );
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = 'Kbd does not read children';
    expect(bundleCoreExport('Kbd/Kbd', 'Kbd', 'development')).toContain(phrase);
    expect(bundleCoreExport('Kbd/Kbd', 'Kbd', 'production')).not.toContain(
      phrase,
    );
  });
});
