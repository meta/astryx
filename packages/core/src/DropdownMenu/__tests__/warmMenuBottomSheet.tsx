// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file warmMenuBottomSheet.tsx
 * @input Uses DropdownMenu and Testing Library
 * @output Exports warmMenuBottomSheet, a test helper that resolves the lazily
 *   loaded touch sheet once
 * @position Test-only helper for suites that open a DropdownMenu bottom sheet
 *
 * DropdownMenu loads its touch sheet with React.lazy, so the first sheet
 * renders a tick after it opens. Opening one up front caches the resolved
 * modules on the lazy components, and every later sheet renders
 * synchronously. Call it from `beforeAll`.
 */

import {cleanup, render, screen} from '@testing-library/react';
import {DropdownMenu} from '../DropdownMenu';

export async function warmMenuBottomSheet(): Promise<void> {
  const {showModal, close} = HTMLDialogElement.prototype;
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  try {
    render(
      <DropdownMenu
        button={{label: 'Warm'}}
        presentation="bottom-sheet"
        isMenuOpen
        items={[{label: 'Warm item'}]}
      />,
    );
    // A cold import transforms the sheet's module graph; allow for it.
    await screen.findByText('Warm item', undefined, {timeout: 15000});
  } finally {
    cleanup();
    HTMLDialogElement.prototype.showModal = showModal;
    HTMLDialogElement.prototype.close = close;
  }
}
