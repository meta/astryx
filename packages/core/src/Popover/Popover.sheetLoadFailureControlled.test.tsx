// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Popover.sheetLoadFailureControlled.test.tsx
 * @input vitest (jsdom), Testing Library, Popover with its bottom-sheet module
 *   mocked to fail once, and jsdom stubs for <dialog>
 * @output Tests that a caller's open (a controlled open prop), whose sheet
 *   module fails to load, is closed through `onOpenChange(false)` and leaves
 *   the page rendered, also when the caller applies the open after the
 *   trigger's own load failed
 * @position Testing for lazyPopoverBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Component, type ReactNode} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// Every load fails.
const sheetImport = vi.hoisted(() => ({failures: 99, calls: 0}));

vi.mock('../BottomSheet/BottomSheet', async importOriginal => {
  sheetImport.calls += 1;
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

async function settle() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('Popover bottom sheet opened by the caller whose module fails to load', () => {
  it("closes the caller's open and keeps the page", async () => {
    const onOpenChange = vi.fn();
    render(
      <PageBoundary>
        <Popover
          label="Filters"
          presentation="bottom-sheet"
          isOpen
          onOpenChange={onOpenChange}
          content={<button type="button">Apply</button>}>
          <Button label="Filter">Filter</Button>
        </Popover>
      </PageBoundary>,
    );
    await settle();
    await settle();
    expect(screen.queryByText('The page failed')).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes a caller's open applied only after the trigger's load failed", async () => {
    const onOpenChange = vi.fn();
    const {rerender} = render(
      <PageBoundary>
        <Popover
          label="Filters"
          presentation="bottom-sheet"
          isOpen={false}
          onOpenChange={onOpenChange}
          content={<button type="button">Apply</button>}>
          <Button label="Filter">Filter</Button>
        </Popover>
      </PageBoundary>,
    );
    await settle();
    // The caller declines the trigger's open while the load fails.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', {name: 'Filter'}));
    });
    await settle();
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    // Then the caller opens the sheet itself.
    rerender(
      <PageBoundary>
        <Popover
          label="Filters"
          presentation="bottom-sheet"
          isOpen={true}
          onOpenChange={onOpenChange}
          content={<button type="button">Apply</button>}>
          <Button label="Filter">Filter</Button>
        </Popover>
      </PageBoundary>,
    );
    await settle();
    await settle();
    expect(screen.queryByText('The page failed')).toBeNull();
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
