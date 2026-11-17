// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.missingProps.test.tsx
 * @input Tokenizer, PowerSearch, PowerSearchFilterEditor, PowerSearchToken, TypeaheadItem, ComplexSelector rendered without a required prop
 * @output In development, the error names the component, the prop and the
 *   fix. In production, the components behave as they did before, and their
 *   bundles carry no check or message.
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
  name: string;
  module: string;
  load: () => Promise<Loose>;
  element: (C: Loose) => ReactElement;
  message: string;
}[] = [
  {
    name: 'Tokenizer',
    module: 'Tokenizer/Tokenizer',
    load: async () =>
      (await import('./Tokenizer')).Tokenizer as unknown as Loose,
    element: C => <C label="Tags" onChange={() => {}} />,
    message:
      'Tokenizer: `value` must be an array of the selected items, for example value={selected} with onChange={setSelected} and useState([]).',
  },
  {
    name: 'PowerSearch',
    module: 'PowerSearch/PowerSearch',
    load: async () =>
      (await import('../PowerSearch/PowerSearch'))
        .PowerSearch as unknown as Loose,
    element: C => <C value={[]} onChange={() => {}} />,
    message:
      'PowerSearch: `config` is required: the fields people can filter by, for example config={{fields: [...]}}.',
  },
  {
    name: 'PowerSearchFilterEditor',
    module: 'PowerSearch/PowerSearchFilterEditor',
    load: async () =>
      (await import('../PowerSearch/PowerSearchFilterEditor'))
        .PowerSearchFilterEditor as unknown as Loose,
    element: C => <C onSave={() => {}} onCancel={() => {}} />,
    message:
      'PowerSearchFilterEditor: `config` is required: the same config as the PowerSearch it edits.',
  },
  {
    name: 'PowerSearchToken',
    module: 'PowerSearch/PowerSearchToken',
    load: async () =>
      (await import('../PowerSearch/PowerSearchToken'))
        .PowerSearchToken as unknown as Loose,
    element: C => <C />,
    message:
      'PowerSearchToken: `config` is required: the same config as the PowerSearch it belongs to.',
  },
  {
    name: 'TypeaheadItem',
    module: 'Typeahead/TypeaheadItem',
    load: async () =>
      (await import('../Typeahead/TypeaheadItem'))
        .TypeaheadItem as unknown as Loose,
    element: C => <C />,
    message:
      "TypeaheadItem: `item` is required: the item to show, for example item={{id: 'nyc', label: 'New York'}}.",
  },
  {
    name: 'ComplexSelector',
    module: 'ComplexSelector/ComplexSelector',
    load: async () =>
      (await import('../ComplexSelector/ComplexSelector'))
        .ComplexSelector as unknown as Loose,
    element: C => (
      <C label="Color" value={null} onChange={() => {}}>
        Pick
      </C>
    ),
    message:
      'ComplexSelector: `children` must be a function that renders the picker, for example {(value, onChange, close) => <MyPicker value={value} onChange={onChange} />}.',
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

describe.each(CASES)('$name without its required prop', c => {
  it('names the prop and the fix', async () => {
    expect(thrownBy(c.element(await c.load()))).toBe(c.message);
  });

  it('keeps the production behavior', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.resetModules();
    const message = thrownBy(c.element(await c.load()));
    expect(message).not.toBeNull();
    expect(message).not.toBe(c.message);
  });

  it('keeps the message in a development bundle only', () => {
    const phrase = c.message.slice(c.message.indexOf('`'));
    expect(bundleCoreExport(c.module, c.name, 'development')).toContain(
      phrase.slice(phrase.indexOf(' ') + 1),
    );
    expect(bundleCoreExport(c.module, c.name, 'production')).not.toContain(
      phrase.slice(phrase.indexOf(' ') + 1),
    );
  });
});
