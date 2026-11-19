// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PowerSearch.missingProps.test.tsx
 * @input PowerSearch, PowerSearchFilterEditor, PowerSearchToken rendered without a required prop
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the component throws as it did before, and the
 *   bundle carries no check or message.
 * @position Tests; required-prop errors
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {cleanup, render} from '@testing-library/react';
import type {ComponentType, ReactElement, ReactNode} from 'react';
import {bundleCoreExport} from '../utils/__tests__/devBundle';

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

type Loose = ComponentType<Record<string, unknown> & {children?: ReactNode}>;

const CASES: {
  id: string;
  name: string;
  module: string;
  load: () => Promise<Loose>;
  element: (C: Loose) => ReactElement;
  message: string;
  productionMessage: string;
}[] = [
  {
    id: 'PowerSearch config',
    name: 'PowerSearch',
    module: 'PowerSearch/PowerSearch',
    load: async () =>
      (await import('./PowerSearch')).PowerSearch as unknown as Loose,
    element: C => <C filters={[]} onChange={() => {}} />,
    message:
      'PowerSearch: `config` is required: the fields people can filter by, for example config={{fields: [...]}}.',
    productionMessage: "Cannot read properties of undefined (reading 'fields')",
  },
  {
    id: 'PowerSearch filters',
    name: 'PowerSearch',
    module: 'PowerSearch/PowerSearch',
    load: async () =>
      (await import('./PowerSearch')).PowerSearch as unknown as Loose,
    element: C => <C config={{fields: []}} onChange={() => {}} />,
    message:
      'PowerSearch: `filters` must be an array of the applied filters, for example filters={filters} with onChange={setFilters} and useState([]).',
    productionMessage: "Cannot read properties of undefined (reading 'map')",
  },
  {
    id: 'PowerSearchFilterEditor',
    name: 'PowerSearchFilterEditor',
    module: 'PowerSearch/PowerSearchFilterEditor',
    load: async () =>
      (await import('./PowerSearchFilterEditor'))
        .PowerSearchFilterEditor as unknown as Loose,
    element: C => <C onSave={() => {}} onCancel={() => {}} />,
    message:
      'PowerSearchFilterEditor: `config` is required: the same config as the PowerSearch it edits.',
    productionMessage: "Cannot read properties of undefined (reading 'fields')",
  },
  {
    id: 'PowerSearchToken',
    name: 'PowerSearchToken',
    module: 'PowerSearch/PowerSearchToken',
    load: async () =>
      (await import('./PowerSearchToken')).PowerSearchToken as unknown as Loose,
    element: C => <C />,
    message:
      'PowerSearchToken: `config` is required: the same config as the PowerSearch it belongs to.',
    productionMessage: "Cannot read properties of undefined (reading 'fields')",
  },
];

/** The message a render throws, or null when it does not throw. */
function thrownBy(element: ReactElement): string | null {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(element);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/** The part of the message the component passes to devPropError. */
function phraseOf(message: string): string {
  const afterProp = message.slice(
    message.indexOf('`', message.indexOf('`') + 1) + 1,
  );
  return afterProp.trim();
}

describe.each(CASES)('$id without its required prop', c => {
  it('names the prop and the fix', async () => {
    expect(thrownBy(c.element(await c.load()))).toBe(c.message);
  });

  it('throws in production as it did before', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    expect(thrownBy(c.element(await c.load()))).toBe(c.productionMessage);
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = phraseOf(c.message);
    expect(bundleCoreExport(c.module, c.name, 'development')).toContain(phrase);
    expect(bundleCoreExport(c.module, c.name, 'production')).not.toContain(
      phrase,
    );
  });
});
