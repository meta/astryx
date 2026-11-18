// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MobileNavAutoSideSsr.test.tsx
 * @input MobileNav `side="auto"` server markup and React hydration
 * @output Proves a drawer open on the server hydrates without a mismatch, and
 *   resolves its edge from the opener in the render after hydration
 * @position SSR acceptance test for MobileNav's `side="auto"` resolution
 */

import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {MobileNav} from './MobileNav';

beforeEach(() => {
  // Like the native method, move focus into the dialog.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('[tabindex]')?.focus();
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('dir');
  document.body.replaceChildren();
});

const tree = (isOpen: boolean) => (
  <MobileNav
    id="nav-drawer"
    isOpen={isOpen}
    onOpenChange={() => {}}
    side="auto"
    label="Nav">
    <div>Content</div>
  </MobileNav>
);

describe('MobileNav side="auto": open on the server', () => {
  it('hydrates without a mismatch and resolves the edge from the opener after hydration', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    vi.stubGlobal('innerWidth', 400);
    // An inline-start opener in RTL sits in the physical right half.
    const opener = document.createElement('button');
    opener.style.direction = 'rtl';
    // showModal() pulls focus into the drawer during hydration, so the opener
    // is found through `aria-controls`.
    opener.setAttribute('aria-controls', 'nav-drawer');
    document.body.appendChild(opener);
    vi.spyOn(opener, 'getBoundingClientRect').mockReturnValue({
      left: 340,
      right: 380,
      width: 40,
      top: 0,
      bottom: 40,
      height: 40,
      x: 340,
      y: 0,
      toJSON() {},
    });
    opener.focus();

    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(true));
    document.body.appendChild(container);
    // The server reads no focus or layout, so it sends the default edge.
    expect(container.querySelector('[data-side]')).toHaveAttribute(
      'data-side',
      'end',
    );

    // The focus guard must keep the drawer's own panel from being measured as
    // the opener. jsdom lays nothing out, so an unmeasured panel would resolve
    // to `start` by accident: assert on the reads instead of the outcome alone.
    const measured: Element[] = [];
    const realRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        measured.push(this);
        return realRect.call(this);
      },
    );
    const logged = vi.spyOn(console, 'error');
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree(true), {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });
    expect(recoverableErrors).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    expect(measured.some(el => container.contains(el))).toBe(false);
    expect(container.querySelector('[data-side]')).toHaveAttribute(
      'data-side',
      'start',
    );

    // A later close and open resolves from the opener as well.
    await act(async () => root.render(tree(false)));
    await act(async () => root.render(tree(true)));
    expect(container.querySelector('[data-side]')).toHaveAttribute(
      'data-side',
      'start',
    );
    await act(async () => root.unmount());
  });

  it('resolves the edge from the aria-controls toggle when the opener holds no focus', async () => {
    document.documentElement.setAttribute('dir', 'rtl');
    vi.stubGlobal('innerWidth', 400);
    const toggle = document.createElement('button');
    toggle.style.direction = 'rtl';
    toggle.setAttribute('aria-controls', 'nav-drawer');
    document.body.appendChild(toggle);
    const measured: Element[] = [];
    vi.spyOn(toggle, 'getBoundingClientRect').mockImplementation(() => {
      measured.push(toggle);
      return {
        left: 340,
        right: 380,
        width: 40,
        top: 0,
        bottom: 40,
        height: 40,
        x: 340,
        y: 0,
        toJSON() {},
      };
    });
    // The toggle is never focused: the mock moves focus into the dialog.
    const serverTree = (
      <MobileNav
        id="nav-drawer"
        isOpen
        onOpenChange={() => {}}
        side="auto"
        label="Nav">
        <div>Content</div>
      </MobileNav>
    );

    const container = document.createElement('div');
    container.innerHTML = renderToString(serverTree);
    document.body.appendChild(container);

    // As in the first case, the drawer's own panel must never be measured.
    const realRect = Element.prototype.getBoundingClientRect;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        measured.push(this);
        return realRect.call(this);
      },
    );
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, serverTree);
    });
    expect(measured.some(el => container.contains(el))).toBe(false);
    expect(measured).toContain(toggle);
    expect(container.querySelector('[data-side]')).toHaveAttribute(
      'data-side',
      'start',
    );
    await act(async () => root.unmount());
  });
});
