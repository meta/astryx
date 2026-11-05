// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createElement} from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {createStaticSource} from '@astryxdesign/core/Typeahead';
import {CommandPalette} from './CommandPalette';
import type * as ListModule from './CommandPaletteList';
import type {CommandPaletteListProps} from './CommandPaletteList';

const lookupWork = vi.hoisted(() => ({reads: [] as number[]}));

vi.mock('./CommandPaletteList', async importOriginal => {
  const actual = await importOriginal<typeof ListModule>();
  const {useCommandPaletteContext} = await import('./CommandPaletteContext');
  return {
    ...actual,
    CommandPaletteList: function ObservedList(props: CommandPaletteListProps) {
      const ctx = useCommandPaletteContext();
      return createElement(actual.CommandPaletteList, {
        ...props,
        onMouseOver(event) {
          // Observe the real handler's input, not a particular array method.
          // Install after index construction and restore before React renders:
          // this measures lookup work, not setup or option rendering.
          let reads = 0;
          const restorers = (ctx?.selectableItems ?? []).map(item => {
            const descriptor = Object.getOwnPropertyDescriptor(item, 'value')!;
            Object.defineProperty(item, 'value', {
              configurable: true,
              get(): string {
                reads++;
                return descriptor.value;
              },
            });
            return () => Object.defineProperty(item, 'value', descriptor);
          });
          try {
            props.onMouseOver?.(event);
          } finally {
            restorers.forEach(restore => restore());
            lookupWork.reads.push(reads);
          }
        },
      });
    },
  };
});

beforeEach(() => {
  lookupWork.reads = [];
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
});

describe('CommandPalette delegated mouseover performance', () => {
  it.each([50, 500])('bounds lookup work with %i items', async count => {
    const items = Array.from({length: count}, (_, index) => ({
      id: `item-${index}`,
      label: `Item ${index}`,
    }));
    const view = render(
      createElement(CommandPalette, {
        isOpen: true,
        onOpenChange: () => {},
        searchSource: createStaticSource(items),
      }),
    );
    // The options with {hidden: true}: the default query checks each one's
    // visibility through jsdom's getComputedStyle, its ancestors' included,
    // which takes seconds at 500 options (and many times that on a busy
    // machine), where this test measures lookup reads. The combobox query
    // below still checks that the open palette is visible.
    const allOptions = () => view.getAllByRole('option', {hidden: true});
    try {
      await waitFor(() => expect(allOptions()).toHaveLength(count));
      const options = allOptions();
      const targets = [0, count - 1, Math.floor(count / 2), 0];
      for (const index of targets) {
        const option = options[index];
        fireEvent.mouseOver(option);
        expect(view.getByRole('combobox')).toHaveAttribute(
          'aria-activedescendant',
          option.id,
        );
      }
      expect(lookupWork.reads).toHaveLength(targets.length);
      for (const reads of lookupWork.reads) {
        // A direct lookup may inspect the matched value, but must not scan
        // the list. The same fixed budget applies at both list sizes.
        expect(reads).toBeLessThanOrEqual(1);
      }
    } finally {
      view.unmount();
    }
  });
});
