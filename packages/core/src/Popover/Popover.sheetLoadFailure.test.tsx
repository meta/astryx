// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Popover.sheetLoadFailure.test.tsx
 * @input vitest (jsdom), Testing Library, Popover with its bottom-sheet module
 *   mocked to fail once, and jsdom stubs for <dialog>
 * @output Tests that a failed load of the sheet's module leaves the page
 *   rendered, closes the open, and that the next open loads the sheet
 * @position Testing for lazyPopoverBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Component, type ReactNode} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// The load at rest fails, then the load for the first open.
const sheetImport = vi.hoisted(() => ({failures: 2}));

vi.mock('../BottomSheet/BottomSheet', async importOriginal => {
  if (sheetImport.failures > 0) {
    sheetImport.failures -= 1;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return importOriginal();
});

import {Button} from '../Button/Button';
import {Popover} from './Popover';

class PageBoundary extends Component<
  {children: ReactNode},
  {hasFailed: boolean}
> {
  state = {hasFailed: false};
  static getDerivedStateFromError(): {hasFailed: boolean} {
    return {hasFailed: true};
  }
  render(): ReactNode {
    return this.state.hasFailed ? <p>The page failed</p> : this.props.children;
  }
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = vi.fn();
    Element.prototype.releasePointerCapture = vi.fn();
  }
  window.scrollTo = vi.fn();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

const trigger = () => screen.getByRole('button', {name: 'Filter'});
const sheetDialog = () =>
  document.querySelector<HTMLDialogElement>('dialog[aria-label="Filters"]');

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('Popover bottom sheet whose module fails to load', () => {
  it('keeps the page and closes the open; a later open asks the loader again', async () => {
    render(
      <PageBoundary>
        <Popover
          label="Filters"
          presentation="bottom-sheet"
          content={<button type="button">Apply</button>}>
          <Button label="Filter">Filter</Button>
        </Popover>
      </PageBoundary>,
    );
    await settle();
    await act(async () => {
      fireEvent.click(trigger());
    });
    await settle();
    expect(screen.queryByText('The page failed')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      fireEvent.click(trigger());
    });
    // A cold import transforms the sheet's module graph; allow for it.
    const dialog = await vi.waitFor(
      () => {
        const element = sheetDialog();
        expect(element).toHaveAttribute('open');
        return element!;
      },
      {timeout: 15000},
    );
    expect(dialog.querySelector('button')).toHaveTextContent('Apply');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
