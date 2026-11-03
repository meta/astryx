// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tokenizer.secondDocument.test.tsx
 * @input Tokenizer rendered into a same-origin iframe's document
 * @output Verifies that a finger's token removal with the keyboard down reads
 *   the iframe's last input, not the page's, through the one modality hook
 *   call
 * @position A reader of per-document interaction modality
 */

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {fireEvent} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
import {__resetInteractionModalityForTest} from '../utils/interactionModality';
import type {SearchSource, SearchableItem} from '../Typeahead/types';
import {Tokenizer} from './Tokenizer';

const users: SearchableItem[] = [
  {id: '1', label: 'Alice'},
  {id: '2', label: 'Bob'},
];

const userSource: SearchSource = {
  search: (query: string) =>
    users.filter(u => u.label.toLowerCase().includes(query.toLowerCase())),
  bootstrap: () => users,
};

let root: Root | null = null;
let frame: HTMLIFrameElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  frame?.remove();
  frame = null;
  __resetInteractionModalityForTest();
});

function renderInFrame(onChange = vi.fn()) {
  frame = document.createElement('iframe');
  document.body.appendChild(frame);
  const frameDocument = frame.contentDocument!;
  const container = frameDocument.createElement('div');
  frameDocument.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <Tokenizer
        label="Members"
        searchSource={userSource}
        value={users}
        onChange={onChange}
      />,
    );
  });
  const input = frameDocument.querySelector('input')!;
  const remove = frameDocument.querySelector<HTMLElement>(
    '[aria-label="Remove Alice"]',
  )!;
  return {frameDocument, input, remove, onChange};
}

it("leaves the input unfocused after a finger removes a token in its own document, though the page's last input was a key", () => {
  const {frameDocument, input, remove, onChange} = renderInFrame();
  document.dispatchEvent(new KeyboardEvent('keydown', {key: 'a'}));
  fireEvent.pointerDown(remove, {pointerType: 'touch'});
  // Chrome focuses the tapped button on the tap's compatibility mouse press,
  // which the field cancels.
  expect(fireEvent.mouseDown(remove)).toBe(false);
  fireEvent.click(remove);
  expect(onChange).toHaveBeenCalledWith([users[1]], {
    item: users[0],
    type: 'remove',
  });
  expect(frameDocument.activeElement).not.toBe(input);
});

it("moves focus on to the input when keyboard focus lands on a token's remove button in its own document, though the page's last input was a finger", () => {
  const {frameDocument, input, remove} = renderInFrame();
  document.dispatchEvent(new Event('pointerdown'));
  fireEvent.pointerDown(remove, {pointerType: 'touch'});
  frameDocument.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab'}));
  act(() => remove.focus());
  expect(frameDocument.activeElement).toBe(input);
});
