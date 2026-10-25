// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useAnnounceRenderedText.adopters.test.tsx
 * @input Every core component that announces its own rendered content, with
 *   the shared own-content module replaced by a recorder
 * @output architecture:react-component-runtime INV10 test: each adopter hands
 *   its own-content announcement to the shared module and announces none of it
 *   itself
 * @position Shared adopter test for the own-content announcement module
 *
 * With the module replaced by a recorder that never announces, an adopter that
 * still announced its own content would be holding an Effect, observer, timer
 * or listener of its own for it, which INV10 rules out. The registry check at
 * the end keeps this list in step with every file that imports the module, so
 * a new adopter cannot skip the test.
 */

import fs from 'node:fs';
import path from 'node:path';
import {useEffect, useRef, type HTMLAttributes, type RefObject} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';

interface ModuleCall {
  isShown: boolean;
  text: string;
}

const calls: ModuleCall[] = [];
const announce = vi.hoisted(() => vi.fn());

vi.mock('./useAnnounceRenderedText', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnnounceRenderedText: (
    ref: RefObject<HTMLElement | null>,
    isShown: boolean,
  ) => {
    // Read after commit, the way the real module does.
    useEffect(() => {
      calls.push({isShown, text: ref.current?.textContent ?? ''});
    });
  },
}));
vi.mock('./AnnounceRenderedText', () => ({
  AnnounceRenderedText: (props: HTMLAttributes<HTMLDivElement>) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
      calls.push({isShown: true, text: ref.current?.textContent ?? ''});
    });
    return <div ref={ref} {...props} />;
  },
}));
vi.mock('./useAnnounce', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAnnounce: () => announce,
}));

const {EmptyState} = await import('../EmptyState');
const {ChatComposer} = await import('../Chat');
const {Selector} = await import('../Selector');
const {MultiSelector} = await import('../MultiSelector');
const {CommandPalette} = await import('../CommandPalette');
const {BaseTypeahead} = await import('../Typeahead/BaseTypeahead');
const {createStaticSource} = await import('../Typeahead/createStaticSource');

const source = createStaticSource([{id: 'apple', label: 'Apple'}]);

beforeEach(() => {
  calls.length = 0;
  announce.mockClear();
  // jsdom does not implement the modal dialog methods CommandPalette uses.
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * The adopter showed `text` through the module, and announced none of it
 * through its own channel calls.
 */
async function expectDelegated(text: string) {
  await waitFor(() =>
    expect(calls.some(call => call.isShown && call.text.includes(text))).toBe(
      true,
    ),
  );
  const own = announce.mock.calls.filter(([message]) =>
    String(message).includes(text),
  );
  expect(own).toEqual([]);
}

/** Each adopter, shown in the state where its own content appears. */
const ADOPTERS: Record<string, () => Promise<void>> = {
  'EmptyState/EmptyState.tsx': async () => {
    render(<EmptyState title="Nothing here" description="Add an item" />);
    await expectDelegated('Nothing here');
  },
  'Chat/ChatComposer.tsx': async () => {
    const composer = (status?: {
      type: 'error' | 'warning';
      message: string;
    }) => <ChatComposer onSubmit={() => {}} input={<div />} status={status} />;
    const {rerender} = render(composer());
    rerender(composer({type: 'error', message: 'Send failed'}));
    await expectDelegated('Send failed');
    rerender(composer({type: 'warning', message: 'Offline'}));
    await expectDelegated('Offline');
  },
  'Selector/Selector.tsx': async () => {
    render(
      <Selector
        label="Fruit"
        options={[] as string[]}
        value=""
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    await expectDelegated('No options');
  },
  'MultiSelector/MultiSelector.tsx': async () => {
    render(
      <MultiSelector
        label="Fruits"
        options={[] as string[]}
        value={[]}
        onChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    await expectDelegated('No options');
  },
  'CommandPalette/CommandPalette.tsx': async () => {
    render(
      <CommandPalette isOpen onOpenChange={() => {}} searchSource={source} />,
    );
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});
    await expectDelegated('No results');
  },
  'Typeahead/BaseTypeahead.tsx': async () => {
    render(
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});
    await expectDelegated('No results found');
  },
};

describe('own-content announcement adopters (react-component-runtime INV10)', () => {
  it.each(Object.entries(ADOPTERS))(
    '%s hands its own content to the shared module and announces none of it itself',
    async (_file, run) => {
      await run();
    },
  );

  it('covers every core file that imports the module', () => {
    const src = path.resolve(import.meta.dirname, '..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (
          /\.tsx?$/.test(entry.name) &&
          !/\.(test|spec|stories)\.tsx?$/.test(entry.name) &&
          /from '[./]*(hooks\/)?(useAnnounceRenderedText|AnnounceRenderedText)'/.test(
            fs.readFileSync(full, 'utf8'),
          )
        ) {
          importers.push(path.relative(src, full));
        }
      }
    };
    walk(src);
    const modules = [
      'hooks/useAnnounceRenderedText.ts',
      'hooks/AnnounceRenderedText.tsx',
    ];
    expect(
      importers
        .filter(file => !modules.includes(file))
        .map(file => file.split(path.sep).join('/'))
        .sort(),
    ).toEqual(Object.keys(ADOPTERS).sort());
  });
});
