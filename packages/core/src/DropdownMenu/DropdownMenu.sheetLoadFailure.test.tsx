// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file DropdownMenu.sheetLoadFailure.test.tsx
 * @input vitest (jsdom), Testing Library, DropdownMenu with its touch sheet
 *   module mocked to fail twice, and jsdom stubs for <dialog>
 * @output Tests that a failed load of the menu sheet leaves the page rendered,
 *   closes the open, and that the next open shows the sheet and its actions
 * @position Testing for lazyMenuBottomSheet.ts
 */

import {act, fireEvent, render, screen} from '@testing-library/react';
import {Component, type ReactNode} from 'react';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// The load at rest fails, then the load for the first open.
const sheetImport = vi.hoisted(() => ({failures: 2}));

vi.mock('./MenuBottomSheet', async importOriginal => {
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

describe('DropdownMenu bottom sheet whose module fails to load', () => {
  it('keeps the page and closes the open; a later open asks the loader again', async () => {
    render(
      <PageBoundary>
        <DropdownMenu
          button={{label: 'Actions'}}
          presentation="bottom-sheet"
          items={[{label: 'Rename'}]}
        />
      </PageBoundary>,
    );
    const trigger = () => screen.getByRole('button', {name: 'Actions'});
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
    await screen.findByText('Rename', undefined, {timeout: 15000});
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });
});
