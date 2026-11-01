// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavTouchPresentation.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav and the Layer
 *   module's input hold
 * @output Tests that under a finger the drawer takes no touch until its
 *   slide-in ends (when its transition ends, before or after a timer of its
 *   duration would) while keys and assistive technology stay live, and after a
 *   close takes no input until the dialog closes, on the mouse's timing (at
 *   most 250 ms in), and that under a mouse nothing is held and the close
 *   keeps its timing
 * @position Unit tests for MobileNav's touch presentation
 *
 * SYNC: When modified, update the header comment in MobileNav.tsx.
 */

import {useState} from 'react';
import {act, fireEvent, render, screen} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {stubMatchMedia} from '../__tests__/stubMatchMedia';
import {isInHeldLayer} from '../Layer/inputHold';
import {MAX_CLOSE_DELAY_MS, MAX_EXIT_MS, MobileNav} from './MobileNav';

function Harness() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <MobileNav
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        data-testid="mobile-nav">
        <a href="#home">Home</a>
      </MobileNav>
    </>
  );
}

// jsdom has no Web Animations, so a slide-in's end is unknown and its hold
// runs for MAX_EXIT_MS unless a test gives the drawer a transition; it
// resolves no `var()`, so a close lands MAX_CLOSE_DELAY_MS in. A hold ends
// when what ends it settles.
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

beforeAll(() => {
  // jsdom has no showModal/close: model the dialog focusing steps
  // (showModal() moves focus into the dialog; close() restores nothing).
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('[tabindex]')?.focus();
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
});

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.useRealTimers();
  document.documentElement.style.overflow = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Gives the drawer a slide-in transition (Web Animations' `getAnimations()`,
 * which jsdom lacks) whose end the test decides.
 */
function stubSlideIn() {
  let end = () => {};
  const finished = new Promise<void>(resolve => {
    end = resolve;
  });
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    value(this: Element) {
      return this.matches('dialog [tabindex="-1"]') ? [{finished}] : [];
    },
  });
  return {
    async end() {
      await act(async () => {
        end();
      });
    },
  };
}

describe('MobileNav under a finger', () => {
  beforeEach(() => {
    stubMatchMedia({reduceMotion: false, pointer: 'coarse'});
  });

  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'getAnimations');
  });

  it('takes no touch until the slide-in ends', async () => {
    render(<Harness />);
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByTestId('mobile-nav');
    expect(dialog).toHaveAttribute('open');
    expect(isInHeldLayer(dialog)).toBe(true);

    await advance(MAX_EXIT_MS + 10);
    expect(isInHeldLayer(dialog)).toBe(false);
  });

  it('takes touch again when its slide-in transition ends, however soon (FR35)', async () => {
    const slideIn = stubSlideIn();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    const dialog = screen.getByTestId('mobile-nav');
    await advance(300);
    expect(isInHeldLayer(dialog)).toBe(true);

    await slideIn.end();
    expect(isInHeldLayer(dialog)).toBe(false);
  });

  it('holds until its slide-in transition ends, past a timer of its duration (FR35)', async () => {
    // A 410 ms slide-in starts a frame or two after the drawer opens, so it
    // ends after a 410 ms timer started on open would.
    const slideIn = stubSlideIn();
    render(<Harness />);
    const drawer = screen
      .getByTestId('mobile-nav')
      .querySelector<HTMLElement>('[tabindex="-1"]');
    drawer?.style.setProperty('transition-duration', '0.41s');
    fireEvent.click(screen.getByRole('button', {name: 'Open'}));
    const dialog = screen.getByTestId('mobile-nav');
    await advance(420);
    expect(isInHeldLayer(dialog)).toBe(true);

    await slideIn.end();
    expect(isInHeldLayer(dialog)).toBe(false);
  });

  it('keeps keys and assistive technology live while it slides in (spec:AST-094 FR35)', () => {
    render(<Harness />);
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByTestId('mobile-nav');
    expect(isInHeldLayer(dialog)).toBe(true);

    // Only pointer input is held: the drawer keeps the focus showModal()
    // gave it, and its content stays out of any inert or hidden subtree, so
    // keys and assistive technology still reach it.
    expect(dialog.contains(document.activeElement)).toBe(true);
    const home = screen.getByRole('link', {name: 'Home'});
    expect(home.closest('[inert]')).toBeNull();
    expect(home.closest('[aria-hidden="true"]')).toBeNull();
    home.focus();
    expect(document.activeElement).toBe(home);
  });

  it('holds nothing once a close is requested: the leaving drawer stays live until the dialog closes, at most 250 ms in (FR5), then gives focus back (spec:AST-094 FR35 holds entrances only)', async () => {
    render(<Harness />);
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    await advance(MAX_EXIT_MS + 10);
    const dialog = screen.getByTestId('mobile-nav');

    fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
    await advance(100);
    // Before the close: still open and modal, and nothing is held.
    expect(dialog).toHaveAttribute('open');
    expect(isInHeldLayer(dialog)).toBe(false);
    expect(
      screen.getByRole('link', {name: 'Home', hidden: true}).closest('[inert]'),
    ).toBeNull();

    // The close keeps the mouse's timing, at most MAX_CLOSE_DELAY_MS in.
    await advance(MAX_CLOSE_DELAY_MS - 100 + 10);
    expect(dialog).not.toHaveAttribute('open');
    expect(document.activeElement).toBe(open);
  });

  it('reopened before the dialog closes, keeps focus in the drawer', async () => {
    render(<Harness />);
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    await advance(MAX_EXIT_MS + 10);
    const dialog = screen.getByTestId('mobile-nav');

    fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
    await advance(100);
    fireEvent.click(open);
    expect(dialog).toHaveAttribute('open');
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      screen.getByRole('link', {name: 'Home', hidden: true}).closest('[inert]'),
    ).toBeNull();

    await advance(MAX_EXIT_MS + 10);
    expect(dialog).toHaveAttribute('open');
    expect(isInHeldLayer(dialog)).toBe(false);
  });
});

describe('MobileNav under a mouse', () => {
  beforeEach(() => {
    stubMatchMedia({reduceMotion: false, pointer: 'fine'});
  });

  it('holds nothing, and closes on its own timing as before', async () => {
    render(<Harness />);
    const open = screen.getByRole('button', {name: 'Open'});
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByTestId('mobile-nav');
    expect(dialog).toHaveAttribute('open');
    expect(isInHeldLayer(dialog)).toBe(false);

    fireEvent.click(screen.getByRole('button', {name: /close navigation/i}));
    expect(isInHeldLayer(dialog)).toBe(false);
    expect(
      screen.getByRole('link', {name: 'Home', hidden: true}).closest('[inert]'),
    ).toBeNull();
    await advance(260);
    expect(dialog).not.toHaveAttribute('open');
    expect(document.activeElement).toBe(open);
  });
});
