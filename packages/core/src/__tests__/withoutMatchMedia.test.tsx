// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file withoutMatchMedia.test.tsx
 * @input vitest, React Testing Library, Overlay, AppShell and MobileNav, and
 *   a window with no matchMedia, as in a plain test DOM
 * @output Overlay renders, AppShell mounts and MobileNav closes where the
 *   window has no matchMedia, and none of them throws
 * @position Unit tests of the media-query reads in Overlay/useOverlay.tsx,
 *   AppShell/AppShell.tsx and MobileNav/MobileNav.tsx
 */

import {act, render, screen} from '@testing-library/react';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {AppShell} from '../AppShell/AppShell';
import {MobileNav} from '../MobileNav/MobileNav';
import {Overlay} from '../Overlay/Overlay';

// jsdom has no modal dialog: MobileNav opens and closes one.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal =
    HTMLDialogElement.prototype.showModal ||
    function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  HTMLDialogElement.prototype.close =
    HTMLDialogElement.prototype.close ||
    function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
});

beforeEach(() => {
  // The shared test setup gives jsdom a matchMedia. An app's test DOM may
  // have none.
  vi.stubGlobal('matchMedia', undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Nav({isOpen}: {isOpen: boolean}) {
  return (
    <MobileNav isOpen={isOpen} onOpenChange={() => {}} data-testid="nav">
      <span>Nav content</span>
    </MobileNav>
  );
}

describe('a window with no matchMedia', () => {
  it('renders an Overlay over its content', () => {
    render(
      <Overlay content={<span>badge</span>}>
        <img alt="hero" src="x.jpg" />
      </Overlay>,
    );
    expect(screen.getByAltText('hero')).toBeInTheDocument();
  });

  it('mounts an AppShell with its content', () => {
    render(
      <AppShell topNav={<div>Nav</div>}>
        <div>Content</div>
      </AppShell>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('closes an open MobileNav after its slide-out', () => {
    vi.useFakeTimers();
    const {rerender} = render(<Nav isOpen />);
    const dialog = screen.getByTestId('nav');
    expect(dialog).toHaveAttribute('open');
    rerender(<Nav isOpen={false} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(dialog).not.toHaveAttribute('open');
  });
});
