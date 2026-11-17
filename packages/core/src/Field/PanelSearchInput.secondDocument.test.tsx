// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file PanelSearchInput.secondDocument.test.tsx
 * @input PanelSearchInput rendered into a same-origin iframe's document
 * @output Verifies its keyboard-focus ring reads the iframe's last input, not
 *   the page's, through the one modality hook call
 * @position A non-Dialog reader of per-document interaction modality
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it} from 'vitest';
import {PanelSearchInput} from './PanelSearchInput';

let root: Root | null = null;
let frame: HTMLIFrameElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  frame?.remove();
  frame = null;
});

function renderInFrame() {
  frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument!;
  const container = frameDocument.createElement('div');
  frameDocument.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <PanelSearchInput
        label="Search"
        clearLabel="Clear search"
        value=""
        onValueChange={() => {}}
      />,
    );
  });
  const input = frameDocument.querySelector('input')!;
  return {frameDocument, input};
}

describe('PanelSearchInput in a second document', () => {
  it("rings on focus after keyboard input in its own document, though the page's last input was a pointer", () => {
    const {frameDocument, input} = renderInFrame();
    document.dispatchEvent(new Event('pointerdown'));
    frameDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    act(() => {
      input.focus();
    });
    expect(
      frameDocument.querySelector('[data-keyboard-focus="true"]'),
    ).not.toBeNull();
  });

  it("stays unringed after pointer input in its own document, though the page's last input was a key", () => {
    const {frameDocument, input} = renderInFrame();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
    frameDocument.dispatchEvent(new Event('pointerdown'));
    act(() => {
      input.focus();
    });
    expect(
      frameDocument.querySelector('[data-keyboard-focus="true"]'),
    ).toBeNull();
  });
});
