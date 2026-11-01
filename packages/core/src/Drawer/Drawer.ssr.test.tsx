// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Drawer.ssr.test.tsx
 * @input Drawer server markup and React hydration
 * @output Proves a Drawer open on the server renders closed until hydration
 *   (no open styles, no `aria-modal`, the same markup as a closed one) and
 *   opens in the render after hydration, without a hydration error
 *   (`component:Drawer` FR17)
 * @position SSR acceptance test for Drawer
 */

import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Drawer} from './Drawer';

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
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const tree = (isOpen: boolean) => (
  <Drawer isOpen={isOpen} onOpenChange={() => {}} label="Filters">
    <p>Drawer body</p>
  </Drawer>
);

/** The server markup's root `<dialog>`, parsed. */
function serverDialog(isOpen: boolean): HTMLDialogElement {
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree(isOpen));
  const dialog = container.querySelector('dialog');
  if (dialog == null) {
    throw new Error('no <dialog> in the server markup');
  }
  return dialog;
}

describe('Drawer: open on the server (FR17)', () => {
  it('renders closed on the server: no aria-modal and the same classes as a closed Drawer', () => {
    const open = serverDialog(true);
    const closed = serverDialog(false);
    expect(open).not.toHaveAttribute('aria-modal');
    expect(open).not.toHaveAttribute('open');
    expect(open.className).toBe(closed.className);
  });

  it('opens modally in the render after hydration, without a hydration error', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(true));
    document.body.appendChild(container);
    const logged = vi.spyOn(console, 'error');
    const recoverableErrors: unknown[] = [];
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree(true), {
        onRecoverableError: error => recoverableErrors.push(error),
      });
    });
    const dialog = container.querySelector('dialog');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute('open');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog?.className).not.toBe(serverDialog(false).className);
    expect(recoverableErrors).toEqual([]);
    expect(logged).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('opens settled after hydration, without its slide-in, and animates a later open (spec:AST-013 FR13)', async () => {
    const entryMotion = (dialog: HTMLDialogElement) =>
      getComputedStyle(dialog).transitionDuration;
    // A client-opened Drawer plays its slide-in.
    const client = document.createElement('div');
    document.body.appendChild(client);
    const clientRoot = createRoot(client);
    await act(async () => clientRoot.render(tree(true)));
    const clientMotion = entryMotion(client.querySelector('dialog')!);
    expect(clientMotion).not.toBe('.01s');
    await act(async () => clientRoot.unmount());

    // One open on the server opens where it rests once hydrated.
    const container = document.createElement('div');
    container.innerHTML = renderToString(tree(true));
    document.body.appendChild(container);
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree(true));
    });
    const dialog = container.querySelector('dialog')!;
    expect(entryMotion(dialog)).toBe('.01s');

    // Closed and opened again, it animates as a client open does.
    await act(async () => root.render(tree(false)));
    await act(async () => root.render(tree(true)));
    expect(entryMotion(container.querySelector('dialog')!)).toBe(clientMotion);
    await act(async () => root.unmount());
  });
});
