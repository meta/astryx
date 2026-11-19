// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DateRangeInput.dateValue.test.tsx
 * @input DateRangeInput rendered with Date objects in `value`
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; DateRangeInput's required-prop error
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
  return (await import('./DateRangeInput')).DateRangeInput as unknown as Loose;
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

describe('DateRangeInput with Date objects', () => {
  it('names the prop and the fix', async () => {
    const DateRangeInput = await load();
    expect(
      thrownBy(() =>
        render(
          <DateRangeInput
            label="Dates"
            value={{start: new Date(2026, 0, 1), end: new Date(2026, 0, 31)}}
            onChange={() => {}}
          />,
        ),
      ),
    ).toBe(
      "DateRangeInput: `value` must be null or {start, end} with ISO date strings, for example value={{start: '2026-01-01', end: '2026-01-31'}}. Pass strings, not Date objects.",
    );
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const DateRangeInput = await load();
    expect(
      thrownBy(() =>
        render(
          <DateRangeInput
            label="Dates"
            value={{start: new Date(2026, 0, 1), end: new Date(2026, 0, 31)}}
            onChange={() => {}}
          />,
        ),
      ),
    ).toBe('str.split is not a function');
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = 'Pass strings, not Date objects';
    expect(
      bundleCoreExport(
        'DateRangeInput/DateRangeInput',
        'DateRangeInput',
        'development',
      ),
    ).toContain(phrase);
    expect(
      bundleCoreExport(
        'DateRangeInput/DateRangeInput',
        'DateRangeInput',
        'production',
      ),
    ).not.toContain(phrase);
  });
});
