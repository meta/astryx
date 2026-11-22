// Copyright (c) Meta Platforms, Inc. and affiliates.

import {render, screen} from '@testing-library/react';
import {useState} from 'react';
import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Dialog} from './Dialog';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

/** The reduced-motion preference the stubbed window reports, and its watchers. */
const reducedMotion = {matches: false, listeners: new Set<() => void>()};

/** Reports `prefers-reduced-motion: reduce` as `reduced`, and no other match. */
function stubReducedMotion(reduced: boolean) {
  reducedMotion.matches = reduced;
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const isReducedMotion = query === REDUCED_MOTION;
      return {
        get matches() {
          return isReducedMotion && reducedMotion.matches;
        },
        media: query,
        onchange: null,
        addEventListener: (_type: string, listener: () => void) => {
          if (isReducedMotion) {
            reducedMotion.listeners.add(listener);
          }
        },
        removeEventListener: (_type: string, listener: () => void) => {
          reducedMotion.listeners.delete(listener);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      };
    }),
  );
}

/** Changes the preference and tells its watchers, as the browser does. */
function changeReducedMotion(reduced: boolean) {
  reducedMotion.matches = reduced;
  for (const listener of [...reducedMotion.listeners]) {
    listener();
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
  });
});

afterEach(() => {
  reducedMotion.listeners.clear();
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

  it('reads the preference at each open, so a change while closed applies to the next open', () => {
    stubReducedMotion(true);
    render(<Opener />);
    const opener = screen.getByRole('button', {name: 'Open'});
    const read = vi.spyOn(opener, 'getBoundingClientRect');
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(read).not.toHaveBeenCalled();

    act(() => {
      screen
        .getByRole('dialog', {hidden: true})
        .dispatchEvent(new Event('cancel', {cancelable: true}));
    });
    expect(screen.getByRole('dialog', {hidden: true})).not.toHaveAttribute(
      'open',
    );

    stubReducedMotion(false);
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("aims an open full-screen dialog's entrance at its opener when it becomes standard", () => {
    stubReducedMotion(false);
    const {rerender} = render(<Opener variant="fullscreen" />);
    const opener = screen.getByRole('button', {name: 'Open'});
    const read = vi.spyOn(opener, 'getBoundingClientRect');
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(read).not.toHaveBeenCalled();

    rerender(<Opener />);
    expect(read).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog.style.getPropertyValue('--dialog-dir-x')).not.toBe('0px');
  });

  it('aims the entrance at its opener when reduced motion ends while the dialog is open', () => {
    stubReducedMotion(true);
    render(<Opener />);
    const opener = screen.getByRole('button', {name: 'Open'});
    const read = vi.spyOn(opener, 'getBoundingClientRect');
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(read).not.toHaveBeenCalled();

    act(() => {
      changeReducedMotion(false);
    });
    expect(read).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole('dialog', {hidden: true});
    expect(dialog.style.getPropertyValue('--dialog-dir-x')).not.toBe('0px');
  });
  it("does not read the opener under a theme's reduced-motion mark, with the setting off", () => {
    stubReducedMotion(false);
    document.documentElement.setAttribute('data-astryx-reduced-motion', '');
    try {
      expect(openAndCountOpenerReads()).toBe(0);
    } finally {
      document.documentElement.removeAttribute('data-astryx-reduced-motion');
    }
  });

  it("watches no setting under a theme's reduced-motion mark, whose entrance never travels", () => {
    stubReducedMotion(true);
    document.documentElement.setAttribute('data-astryx-reduced-motion', '');
    try {
      expect(openAndCountOpenerReads()).toBe(0);
      expect(reducedMotion.listeners.size).toBe(0);
    } finally {
      document.documentElement.removeAttribute('data-astryx-reduced-motion');
    }
  });

  it('watches the reduced-motion preference only while it is open under reduced motion', () => {
    stubReducedMotion(false);
    const {unmount} = render(<Opener />);
    const opener = screen.getByRole('button', {name: 'Open'});
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(reducedMotion.listeners.size).toBe(0);

    act(() => {
      screen
        .getByRole('dialog', {hidden: true})
        .dispatchEvent(new Event('cancel', {cancelable: true}));
    });
    stubReducedMotion(true);
    opener.focus();
    act(() => {
      opener.click();
    });
    expect(reducedMotion.listeners.size).toBe(1);

    act(() => {
      screen
        .getByRole('dialog', {hidden: true})
        .dispatchEvent(new Event('cancel', {cancelable: true}));
    });
    expect(reducedMotion.listeners.size).toBe(0);

    opener.focus();
    act(() => {
      opener.click();
    });
    expect(reducedMotion.listeners.size).toBe(1);
    unmount();
    expect(reducedMotion.listeners.size).toBe(0);
  });
});
