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
  // As in a browser, showModal() moves focus into the drawer.
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
    id="nav"
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
    opener.setAttribute('aria-controls', 'nav');
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

    // In a browser, showModal() can move focus into the drawer before the
    // render after hydration resolves the edge. Start from that state, with
    // the panel measured where it does not sit beside the opener, so reading
    // the panel instead of the opener gives the wrong edge.
    const panel = container.querySelector<HTMLElement>('[tabindex]')!;
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      left: 220,
      right: 400,
      width: 180,
      top: 0,
      bottom: 400,
      height: 400,
      x: 220,
      y: 0,
      toJSON() {},
    });
    panel.focus();
    expect(
      container.querySelector('dialog')?.contains(document.activeElement),
    ).toBe(true);

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
    // showModal() moved focus into the drawer; the edge still follows the
    // opener, found through its aria-controls.
    expect(
      container.querySelector('dialog')?.contains(document.activeElement),
    ).toBe(true);
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
});
