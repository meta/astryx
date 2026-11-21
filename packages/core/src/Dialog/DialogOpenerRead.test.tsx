// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render, screen} from '@testing-library/react';
import {useState} from 'react';
import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Dialog} from './Dialog';

/** Reports `prefers-reduced-motion: reduce` as `reduced`, and no other match. */
function stubReducedMotion(reduced: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: reduced && query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );
}

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function Opener({variant}: {variant?: 'fullscreen'}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <Dialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        aria-label="Details"
        variant={variant}>
        <p>Body</p>
      </Dialog>
    </>
  );
}

/** Opens the dialog from its opener and returns the opener's box reads. */
function openAndCountOpenerReads(variant?: 'fullscreen') {
  render(<Opener variant={variant} />);
  const opener = screen.getByRole('button', {name: 'Open'});
  const read = vi.spyOn(opener, 'getBoundingClientRect');
  opener.focus();
  act(() => {
    opener.click();
  });
  return read.mock.calls.length;
}

describe("Dialog reads its opener's box only for an entrance that uses it (architecture:react-component-runtime INV18)", () => {
  it('reads the opener once for a standard dialog with full motion, the entrance that travels from it', () => {
    stubReducedMotion(false);
    expect(openAndCountOpenerReads()).toBe(1);
  });

  it('does not read the opener for a full-screen dialog, whose entrance fades in place', () => {
    stubReducedMotion(false);
    expect(openAndCountOpenerReads('fullscreen')).toBe(0);
  });

  it('does not read the opener under reduced motion, where the entrance does not travel', () => {
    stubReducedMotion(true);
    expect(openAndCountOpenerReads()).toBe(0);
  });
});
