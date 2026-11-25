// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenu.sheetLoadFailureControlled.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu with its touch sheet
 *   module mocked to fail, and jsdom stubs for <dialog>
 * @output Tests that a caller's open (a controlled open prop), whose sheet
 *   module fails to load, is closed through `onOpenChange(false)` and leaves
 *   the page rendered
 * @position Testing for lazyMenuBottomSheet.ts
 */

import {act, render, screen} from '@testing-library/react';
import {Component, type ReactNode} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// Every load fails.
const sheetImport = vi.hoisted(() => ({failures: 99, calls: 0}));

vi.mock('./MenuBottomSheet', async importOriginal => {
  sheetImport.calls += 1;
  if (sheetImport.failures > 0) {
    sheetImport.failures -= 1;
    throw new TypeError('Failed to fetch dynamically imported module');
  }
  return importOriginal();
});

import {DropdownMenu} from './DropdownMenu';

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

describe('DropdownMenu bottom sheet opened by the caller whose module fails to load', () => {
  it("closes the caller's open and keeps the page", async () => {
    const onOpenChange = vi.fn();
    render(
      <PageBoundary>
        <DropdownMenu
          button={{label: 'Actions'}}
          presentation="bottom-sheet"
          isMenuOpen
          onOpenChange={onOpenChange}
          items={[{label: 'Rename'}]}
        />
      </PageBoundary>,
    );
    await settle();
    await settle();
    expect(screen.queryByText('The page failed')).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
