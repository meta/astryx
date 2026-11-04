// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file useBusyAnnouncement.adopters.test.tsx
 * @input Uses vitest, @testing-library/react, BaseTypeahead, CommandPalette
 * @output Tests that search controls settle their busy start when a search ends
 * @position Testing; validates the settle wiring in useBusyAnnouncement adopters
 */

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {BaseTypeahead} from '../Typeahead/BaseTypeahead';
import {CommandPalette} from '../CommandPalette';
import {createStaticSource} from '../Typeahead/createStaticSource';

const settle = vi.hoisted(() => vi.fn());
vi.mock('./useBusyAnnouncement', () => ({
  useBusyAnnouncement: () => settle,
}));

const source = createStaticSource([
  {id: 'apple', label: 'Apple'},
  {id: 'banana', label: 'Banana'},
]);

// jsdom does not implement the modal dialog methods CommandPalette uses.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('busy-start settle wiring (AST-086 FR8)', () => {
  it("BaseTypeahead settles its busy start when a typed query's search settles", async () => {
    render(
      <BaseTypeahead
        searchSource={source}
        value={null}
        onChange={() => {}}
        debounceMs={0}
      />,
    );
    settle.mockClear();
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'Ap'}});
    await waitFor(() => expect(settle).toHaveBeenCalled());
    // An empty result is announced from the rendered row; it settles too.
    settle.mockClear();
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});
    await waitFor(() => expect(settle).toHaveBeenCalled());
  });

  it("CommandPalette settles its input busy start when a typed query's search settles", async () => {
    render(
      <CommandPalette isOpen onOpenChange={() => {}} searchSource={source} />,
    );
    await waitFor(() => expect(screen.getByText('Apple')).toBeInTheDocument());
    settle.mockClear();
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'ban'}});
    await waitFor(() => expect(settle).toHaveBeenCalled());
    settle.mockClear();
    fireEvent.change(screen.getByRole('combobox'), {target: {value: 'zzz'}});
    await waitFor(() => expect(settle).toHaveBeenCalled());
  });
});
