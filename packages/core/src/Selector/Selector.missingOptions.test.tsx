// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Selector.missingOptions.test.tsx
 * @input Selector and MultiSelector rendered without an `options` array
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component behaves as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; the Selector family's required-prop errors
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

async function load(): Promise<Record<string, Loose>> {
  const [{Selector}, {MultiSelector}] = await Promise.all([
    import('./Selector'),
    import('../MultiSelector/MultiSelector'),
  ]);
  return {
    Selector: Selector as unknown as Loose,
    MultiSelector: MultiSelector as unknown as Loose,
  };
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

const MODULES: Record<string, string> = {
  Selector: 'Selector/Selector',
  MultiSelector: 'MultiSelector/MultiSelector',
};
const PHRASE = 'does not read <option> children';

describe.each(['Selector', 'MultiSelector'])('%s without options', name => {
  it('names the component, the prop and the fix when given <option> children', async () => {
    const Component = (await load())[name];
    const message = thrownBy(() =>
      render(
        <Component label="City" value={null} onChange={() => {}}>
          <option value="nyc">New York</option>
        </Component>,
      ),
    );
    expect(message).toBe(
      `${name}: \`options\` must be an array of options, for example options={[{value: 'nyc', label: 'New York'}]}. ${name} does not read <option> children.`,
    );
  });

  it('names the prop when options is an object', async () => {
    const Component = (await load())[name];
    const message = thrownBy(() =>
      render(
        <Component
          label="City"
          options={{nyc: 'New York'}}
          value={null}
          onChange={() => {}}
        />,
      ),
    );
    expect(message).toMatch(new RegExp(`^${name}: \`options\` must be`));
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const Component = (await load())[name];
    const message = thrownBy(() =>
      render(<Component label="City" value={null} onChange={() => {}} />),
    );
    expect(message).toBe('options is not iterable');
  });

  it('keeps the message in a development bundle only', () => {
    expect(bundleCoreExport(MODULES[name], name, 'development')).toContain(
      PHRASE,
    );
    expect(bundleCoreExport(MODULES[name], name, 'production')).not.toContain(
      PHRASE,
    );
  });
});
