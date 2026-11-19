// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavFocus.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav + AppShell + SideNav
 * @output Regression tests for focus restoration when the drawer closes
 * @position Testing; validates the focus restore in MobileNav.tsx
 *
 * Repro for the umbrella accessibility issue (#3343): closing the drawer
 * dropped focus to `<body>` instead of returning it to the element that
 * opened the drawer.
 *
 * jsdom has NO `<dialog>` implementation at all — `HTMLDialogElement.prototype`
 * exposes only `open`, with no `show`/`showModal`/`close` (verified on
 * jsdom 27.4.0). The other MobileNav suites polyfill those two methods as
 * plain attribute toggles, which means focus never moves in the first place
 * and the defect is invisible.
 *
 * These tests model the two halves of real browser behaviour explicitly:
 * - `showModal()` runs the dialog focusing steps, so focus moves INTO the
 *   drawer. Without this the bug cannot reproduce.
 * - `close()` does NOT hand focus back. That is the behaviour reported
 *   against Safari 26.5.2, and it is what the component must not depend on.
 *
 * The native close is deferred past the slide-out (#4290), and the restore has
 * to follow it: while a modal <dialog> holds the top layer the rest of the
 * document is inert, so `focus()` on the opener is silently dropped. jsdom has
 * no top layer and cannot reproduce that, so these tests pin the call order
 * and the timing directly instead.
 *
 * SYNC: When MobileNav.tsx's focus handling changes, update these tests.
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import {useState} from 'react';
import {render, screen, fireEvent, act} from '@testing-library/react';
import {MobileNav} from './MobileNav';
import {AppShell} from '../AppShell/AppShell';
import {SideNav, SideNavItem, SideNavSection} from '../SideNav';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';

beforeAll(() => {
  // Model the dialog focusing steps: showModal() moves focus into the dialog.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    const target = this.querySelector<HTMLElement>('[tabindex]');
    target?.focus();
  };
  // Deliberately does NOT restore focus — mirrors the reported Safari
  // behaviour the component must not rely on.
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// AppShell needs its breakpoint query to match, but a blanket `matches: true`
// would also match `prefers-reduced-motion`, which caps the close delay at 0.
// The restore has to wait for that delay, so keep the real one in play.
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
  stubMatchMedia({reduceMotion: false});
});

afterEach(() => {
  document.documentElement.style.overflow = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Controlled standalone harness with a real trigger button. */
function StandaloneHarness({onMounted}: {onMounted?: () => void} = {}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="trigger"
        onClick={() => {
          onMounted?.();
          setIsOpen(true);
        }}>
        Open nav
      </button>
      <MobileNav
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        side="start"
        data-testid="nav">
        <a href="/home" data-testid="nav-link">
          Home
        </a>
      </MobileNav>
    </>
  );
}

/** Standalone harness whose whole subtree — trigger included — can unmount. */
function UnmountHarness() {
  const [isMounted, setIsMounted] = useState(true);
  return (
    <>
      <button
        type="button"
        data-testid="unmount"
        onClick={() => setIsMounted(false)}>
        Unmount
      </button>
      {isMounted ? <StandaloneHarness /> : null}
    </>
  );
}

/** The drawer alone can unmount; the trigger stays in the document. */
function DrawerUnmountHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasDrawer, setHasDrawer] = useState(true);
  return (
    <>
      <button
        type="button"
        data-testid="trigger"
        onClick={() => setIsOpen(true)}>
        Open nav
      </button>
      <button
        type="button"
        data-testid="unmount-drawer"
        onClick={() => setHasDrawer(false)}>
        Unmount drawer
      </button>
      {hasDrawer ? (
        <MobileNav
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          side="start"
          data-testid="nav">
          <span>Content</span>
        </MobileNav>
      ) : null}
    </>
  );
}

/** Removes the trigger from the DOM in the same commit that closes the drawer. */
function DetachHarness() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasTrigger, setHasTrigger] = useState(true);
  return (
    <>
      {hasTrigger ? (
        <button
          type="button"
          data-testid="trigger"
          onClick={() => setIsOpen(true)}>
          Open nav
        </button>
      ) : null}
      <button
        type="button"
        data-testid="detach"
        onClick={() => {
          setHasTrigger(false);
          setIsOpen(false);
        }}>
        Detach
      </button>
      <MobileNav isOpen={isOpen} onOpenChange={setIsOpen} side="start">
        <span>Content</span>
      </MobileNav>
    </>
  );
}

/** Opens the drawer without ever focusing the button that opens it. */
function BodyHarness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="programmatic"
        onClick={() => setIsOpen(v => !v)}>
        Toggle
      </button>
      <MobileNav isOpen={isOpen} onOpenChange={setIsOpen} side="start">
        <span>Content</span>
      </MobileNav>
    </>
  );
}

function AppShellHarness() {
  return (
    <AppShell
      sideNav={
        <SideNav>
          <SideNavSection title="Test" isHeaderHidden>
            <SideNavItem label="Home" />
          </SideNavSection>
        </SideNav>
      }
      mobileNav={{breakpoint: 'md'}}>
      <div>Content</div>
    </AppShell>
  );
}

/** Opens the standalone drawer from a focused trigger and returns the trigger. */
function openFromTrigger(): HTMLElement {
  const trigger = screen.getByTestId('trigger');
  trigger.focus();
  fireEvent.click(trigger);
  // showModal() pulled focus into the drawer.
  expect(trigger).not.toHaveFocus();
  return trigger;
}

function clickDrawerClose() {
  fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
}

describe('MobileNav focus restoration', () => {
  it('returns focus to the trigger when the drawer closes (standalone)', () => {
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the hamburger toggle when the AppShell drawer closes', () => {
    vi.useFakeTimers();
    try {
      render(<AppShellHarness />);

      const toggle = screen.getByRole('button', {name: /open navigation/i});
      toggle.focus();
      fireEvent.click(toggle);

      expect(toggle).not.toHaveFocus();

      // Inside AppShell the drawer sits in an <Activity> that hides on close,
      // so the native close is the unmount-style teardown, not the delayed
      // timer. Focus still has to come back, and still only after close().
      const closeSpy = vi.spyOn(HTMLDialogElement.prototype, 'close');
      const focusSpy = vi.spyOn(toggle, 'focus');

      fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(document.activeElement).not.toBe(document.body);
      expect(toggle).toHaveFocus();
      expect(closeSpy).toHaveBeenCalled();
      expect(focusSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
        closeSpy.mock.invocationCallOrder[0],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores focus only after the native dialog has closed', () => {
    // Load-bearing ordering contract. Browsers hold the rest of the document
    // inert while a modal <dialog> is open, so focusing the trigger before
    // close() would be silently dropped — the exact class of failure this fix
    // exists to remove. jsdom has no top layer and cannot reproduce that, so
    // assert the call order directly instead. Restoring when `isOpen` flips
    // (in an effect or its cleanup) instead of after the deferred close()
    // breaks this.
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();

      const closeSpy = vi.spyOn(HTMLDialogElement.prototype, 'close');
      const focusSpy = vi.spyOn(trigger, 'focus');

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(closeSpy).toHaveBeenCalled();
      expect(focusSpy).toHaveBeenCalled();
      expect(focusSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
        closeSpy.mock.invocationCallOrder[0],
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the delayed close before restoring focus', () => {
    // The close is deferred so the slide-out can play (250ms cap outside
    // reduced motion). Until it runs the dialog is still modal and the trigger
    // is inert, so an early restore would be a silent no-op in a browser.
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();
      const closeSpy = vi.spyOn(HTMLDialogElement.prototype, 'close');

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(closeSpy).not.toHaveBeenCalled();
      expect(screen.getByTestId('nav')).toHaveAttribute('open');
      expect(trigger).not.toHaveFocus();

      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps focus in the drawer when it is reopened before the delayed close', () => {
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();
      const focusSpy = vi.spyOn(trigger, 'focus');

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      // Reopened while the close was still pending: the dialog never closed,
      // so there is nothing to hand focus back from.
      fireEvent.click(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId('nav')).toHaveAttribute('open');
      expect(focusSpy).not.toHaveBeenCalled();
      expect(trigger).not.toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the original opener after a reopen interrupted the close', () => {
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      // The reopen happens with focus inside the drawer. That element must
      // not replace the opener the drawer captured on the way in.
      fireEvent.click(trigger);
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(trigger).not.toHaveFocus();

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(screen.getByTestId('nav')).not.toHaveAttribute('open');
      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores focus when the drawer unmounts while its delayed close is pending', () => {
    vi.useFakeTimers();
    try {
      render(<DrawerUnmountHarness />);
      const trigger = openFromTrigger();
      const closeSpy = vi.spyOn(HTMLDialogElement.prototype, 'close');
      const focusSpy = vi.spyOn(trigger, 'focus');

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(closeSpy).not.toHaveBeenCalled();

      // Unmounting cancels the timer and closes the dialog on the spot. Focus
      // goes back to the trigger from that close, and only after it.
      fireEvent.click(screen.getByTestId('unmount-drawer'));

      expect(screen.queryByTestId('nav')).toBeNull();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveFocus();
      expect(focusSpy.mock.invocationCallOrder[0]).toBeGreaterThan(
        closeSpy.mock.invocationCallOrder[0],
      );

      // The cancelled timer must not fire a second close later.
      act(() => {
        vi.advanceTimersByTime(400);
      });
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns focus to the trigger even when focus moved inside the drawer first', () => {
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();

      // User tabs to a link inside the drawer before dismissing it.
      const link = screen.getByTestId('nav-link');
      link.focus();
      expect(link).toHaveFocus();

      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('restores focus when the drawer is closed via Escape', () => {
    vi.useFakeTimers();
    try {
      render(<StandaloneHarness />);
      const trigger = openFromTrigger();

      const dialog = screen.getByTestId('nav');
      fireEvent(
        dialog,
        new Event('cancel', {bubbles: false, cancelable: true}),
      );
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(trigger).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not throw when the drawer unmounts while still open', () => {
    vi.useFakeTimers();
    try {
      render(<UnmountHarness />);
      openFromTrigger();

      // Unmounting the whole drawer subtree also takes the trigger with it —
      // the restore must not throw and must not force focus onto a detached
      // node.
      expect(() => {
        fireEvent.click(screen.getByTestId('unmount'));
        act(() => {
          vi.advanceTimersByTime(400);
        });
      }).not.toThrow();
      expect(document.activeElement).toBe(document.body);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not throw when the trigger is removed before the drawer closes', () => {
    vi.useFakeTimers();
    try {
      render(<DetachHarness />);
      const trigger = openFromTrigger();

      // jsdom silently ignores focus() on a detached node, so assert the call
      // is never made rather than assert on activeElement.
      const triggerFocus = vi.spyOn(trigger, 'focus');
      expect(() => {
        fireEvent.click(screen.getByTestId('detach'));
        act(() => {
          vi.advanceTimersByTime(400);
        });
      }).not.toThrow();
      expect(screen.queryByTestId('trigger')).toBeNull();
      expect(triggerFocus).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('leaves focus alone when nothing was focused before opening', () => {
    vi.useFakeTimers();
    try {
      render(<BodyHarness />);

      // fireEvent.click does not focus, so <body> is the "trigger" the drawer
      // sees when it opens — there is nothing meaningful to restore to.
      expect(document.activeElement).toBe(document.body);
      fireEvent.click(screen.getByTestId('programmatic'));
      act(() => {
        vi.advanceTimersByTime(400);
      });

      // jsdom treats <body> as a non-focusable area, so body.focus() is a
      // silent no-op there and an activeElement assertion cannot tell the two
      // implementations apart. Spy on the call itself — in a real browser
      // body.focus() DOES blur whatever is focused.
      const bodyFocus = vi.spyOn(document.body, 'focus');
      clickDrawerClose();
      act(() => {
        vi.advanceTimersByTime(400);
      });

      expect(bodyFocus).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
