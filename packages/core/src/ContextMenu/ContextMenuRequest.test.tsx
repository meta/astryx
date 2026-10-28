// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ContextMenuRequest.test.tsx
 * @input vitest (jsdom), ContextMenu with its trigger's context request
 *   replaced by a fake that registers nothing and captures what it is given
 * @output Checks that ContextMenu is built on createContextMenu (spec:AST-107
 *   FR8, FR7): one context request is attached to its trigger, the menu opens
 *   only through it (a right click the request did not make opens nothing), a
 *   pointer's or a key's request opens it with the first row focused, a
 *   disabled ContextMenu's request is off, and unmounting detaches it
 * @position Testing for ContextMenu.tsx over createContextMenu.tsx
 */

import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {
  ContextRequest,
  ContextRequestOptions,
} from '../gestures/contextRequest';
import {ContextMenu} from './ContextMenu';

const attached: {element: HTMLElement; options: ContextRequestOptions}[] = [];
const detach = vi.fn();

vi.mock('../gestures/contextRequest', async importOriginal => ({
  ...(await importOriginal<typeof import('../gestures/contextRequest')>()),
  attachContextRequest: (
    element: HTMLElement,
    options: ContextRequestOptions,
  ) => {
    attached.push({element, options});
    return detach;
  },
}));

beforeEach(() => {
  attached.length = 0;
  detach.mockClear();
  HTMLElement.prototype.showPopover = vi.fn(function (this: HTMLElement) {
    this.setAttribute('popover-open', '');
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (this: HTMLElement) {
    this.removeAttribute('popover-open');
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function request(
  kind: ContextRequest['kind'],
  point: {x: number; y: number} | null,
): ContextRequest {
  return {
    kind,
    pointerType:
      kind === 'keyboard' ? null : kind === 'hold' ? 'touch' : 'mouse',
    point,
    pointerId: null,
    time: 0,
  };
}

function renderMenu(props: {isDisabled?: boolean} = {}) {
  return render(
    <ContextMenu
      data-testid="ctx"
      label="Card actions"
      isDisabled={props.isDisabled}
      items={[{label: 'Copy'}, {label: 'Share'}]}>
      <div>Right-click me</div>
    </ContextMenu>,
  );
}

const rows = () => screen.queryAllByRole('menuitem', {hidden: true});

describe('ContextMenu over createContextMenu', () => {
  it('attaches one context request to its trigger', () => {
    renderMenu();
    expect(attached).toHaveLength(1);
    expect(attached[0].element).toBe(screen.getByTestId('ctx'));
  });

  it('opens only through the request: a right click it did not make opens nothing', () => {
    renderMenu();
    fireEvent.contextMenu(screen.getByTestId('ctx'), {
      clientX: 20,
      clientY: 20,
    });
    expect(HTMLElement.prototype.showPopover).not.toHaveBeenCalled();
  });

  it("a pointer's request opens the menu with the first row focused", async () => {
    renderMenu();
    act(() => {
      attached[0].options.onRequest(request('pointer', {x: 20, y: 20}));
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
  });

  it("a key's request opens the menu at the trigger with the first row focused", async () => {
    renderMenu();
    act(() => {
      attached[0].options.onRequest(request('keyboard', null));
    });
    expect(HTMLElement.prototype.showPopover).toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
  });

  it("a disabled ContextMenu's request is off", () => {
    renderMenu({isDisabled: true});
    const isEnabled = attached.at(-1)?.options.isEnabled;
    expect(isEnabled?.() ?? true).toBe(false);
  });

  it('unmounting detaches the request', () => {
    const view = renderMenu();
    view.unmount();
    expect(detach).toHaveBeenCalled();
  });
});
