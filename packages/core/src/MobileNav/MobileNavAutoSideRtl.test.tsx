// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavAutoSideRtl.test.tsx
 * @input Uses vitest, @testing-library/react, MobileNav
 * @output Regression test for `side="auto"` resolution in RTL and on a first open with no focus
 * @position Testing; validates the drawer edge chosen from the opener's inline position
 */

import {describe, it, expect, vi, beforeAll, afterEach} from 'vitest';
import {render, act} from '@testing-library/react';
import {MobileNav} from './MobileNav';

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  document.documentElement.removeAttribute('dir');
  vi.restoreAllMocks();
});

function mockRect(el: HTMLElement, left: number) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left,
    right: left + 40,
    width: 40,
    top: 0,
    bottom: 40,
    height: 40,
    x: left,
    y: 0,
    toJSON() {},
  });
}

function resolvedSide() {
  return document.querySelector('[data-side]')?.getAttribute('data-side');
}

function openFrom(
  dir: 'ltr' | 'rtl',
  opts: {
    focused: boolean;
    id?: string;
    inlineEnd?: boolean;
    centered?: boolean;
  },
) {
  document.documentElement.setAttribute('dir', dir);
  vi.stubGlobal('innerWidth', 400);
  const opener = document.createElement('button');
  document.body.appendChild(opener);
  // The opener sits in the physical right half in RTL, left half in LTR: the
  // inline start of the page either way.
  opener.style.direction = dir;
  // `inlineEnd` mirrors the opener to the opposite half.
  const rtlSide = (dir === 'rtl') !== Boolean(opts.inlineEnd);
  // A centred opener's centre is the viewport's centre (400 / 2).
  mockRect(opener, opts.centered ? 180 : rtlSide ? 340 : 20);
  if (opts.focused) {
    opener.focus();
  }
  const view = render(
    <MobileNav
      isOpen={false}
      onOpenChange={() => {}}
      side="auto"
      label="Nav"
      {...(opts.id ? {id: opts.id} : {})}>
      <div>Content</div>
    </MobileNav>,
  );
  opener.setAttribute(
    'aria-controls',
    document.querySelector('dialog')?.id ?? '',
  );
  act(() => {
    view.rerender(
      <MobileNav
        isOpen
        onOpenChange={() => {}}
        side="auto"
        label="Nav"
        {...(opts.id ? {id: opts.id} : {})}>
        <div>Content</div>
      </MobileNav>,
    );
  });
  opener.remove();
}

describe('MobileNav side="auto"', () => {
  it.each(['ltr', 'rtl'] as const)(
    'opens at the inline start for an inline-start opener in %s',
    dir => {
      openFrom(dir, {focused: true});
      expect(resolvedSide()).toBe('start');
    },
  );

  it.each(['ltr', 'rtl'] as const)(
    'opens at the inline end for an inline-end opener in %s',
    dir => {
      openFrom(dir, {focused: true, inlineEnd: true});
      expect(resolvedSide()).toBe('end');
    },
  );

  it.each(['ltr', 'rtl'] as const)(
    'opens at the inline end for a centred opener in %s',
    dir => {
      openFrom(dir, {focused: true, centered: true});
      expect(resolvedSide()).toBe('end');
    },
  );

  it.each(['ltr', 'rtl'] as const)(
    'uses the controlling toggle when nothing is focused on the first open in %s',
    dir => {
      openFrom(dir, {focused: false});
      expect(resolvedSide()).toBe('start');
    },
  );

  it('finds the controlling toggle when a caller id replaces the dialog id', () => {
    openFrom('rtl', {focused: false, id: 'my-nav'});
    expect(document.querySelector('dialog')?.id).toBe('my-nav');
    expect(resolvedSide()).toBe('start');
  });

  it('has the resolved side in the commit that opens the drawer, not one later', () => {
    const sideAtShow: (string | null | undefined)[] = [];
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      sideAtShow.push(this.getAttribute('data-side'));
      this.setAttribute('open', '');
    };
    openFrom('rtl', {focused: true});
    expect(sideAtShow[0]).toBe('start');
  });

  it('resolves from the opener when side changes to auto while open', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    vi.stubGlobal('innerWidth', 400);
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.style.direction = 'rtl';
    mockRect(opener, 340);
    opener.focus();
    const nav = (side: 'end' | 'auto') => (
      <MobileNav isOpen onOpenChange={() => {}} side={side} label="Nav">
        <div>Content</div>
      </MobileNav>
    );
    const view = render(nav('end'));
    expect(resolvedSide()).toBe('end');
    act(() => {
      view.rerender(nav('auto'));
    });
    expect(resolvedSide()).toBe('start');
    opener.remove();
  });
});
