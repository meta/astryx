// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Dialog.ssr.test.tsx
 * @input Dialog server markup and React hydration
 * @output Proves a Dialog open on the server renders closed until hydration
 *   (no open styles, no `aria-modal`, the same markup as a closed one) and
 *   opens in the render after hydration, without a hydration error
 *   (`component:Dialog` FR8)
 * @position SSR acceptance test for Dialog
 */

import {act} from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {hydrateRoot} from 'react-dom/client';
import {renderToString} from 'react-dom/server';
import {Dialog} from './Dialog';

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
  <Dialog isOpen={isOpen} onOpenChange={() => {}} aria-label="Edit">
    <p>Dialog body</p>
  </Dialog>
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

describe('Dialog: open on the server (FR8)', () => {
  it('renders closed on the server: no aria-modal and the same classes as a closed Dialog', () => {
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
});
