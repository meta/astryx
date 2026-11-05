// Copyright (c) Meta Platforms, Inc. and affiliates.

import {act, fireEvent, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';

// The bundled set (emojiData.test.ts checks it) renders slowly in jsdom; the
// loading path only needs a few emoji.
vi.mock('./emojiData', () => ({
  EMOJI_GROUPS: [
    {
      name: 'Smileys & emotion',
      emojis: [
        ['😀', 'Grinning face', 'happy smile'],
        ['😂', 'Face with tears of joy', 'laugh'],
      ],
    },
    {name: 'Flags', emojis: [['🏁', 'Chequered flag', 'finish race']]},
  ],
}));

import {DEFAULT_FREQUENT_EMOJIS, EmojiPicker} from './EmojiPicker';
import type {EmojiCategory, EmojiOption} from './EmojiPicker';

const CATEGORIES: readonly EmojiCategory[] = [
  {
    name: 'Animals & nature',
    emojis: [
      {emoji: '🐱', name: 'Cat face', keywords: ['pet', 'kitten']},
      {emoji: '🐶', name: 'Dog face', keywords: ['pet', 'puppy']},
    ],
  },
  {
    name: 'Travel & places',
    emojis: [
      {emoji: '🏖️', name: 'Beach with umbrella', keywords: ['vacation']},
    ],
  },
];

/* Ten emoji: a full row of eight and a second row of two. */
const TEN: readonly EmojiOption[] = Array.from({length: 10}, (_, index) => ({
  emoji: String.fromCodePoint(0x1f600 + index),
  name: `Emoji ${index + 1}`,
}));

function emojiNames(): string[] {
  return screen
    .queryAllByRole('gridcell')
    .flatMap(cell => within(cell).queryAllByRole('button'))
    .map(button => button.getAttribute('aria-label') ?? '');
}

function search() {
  return screen.getByRole('textbox', {name: 'Search emoji'});
}

describe('EmojiPicker', () => {
  it('lists the frequent emoji, then every group as a grid under its heading', () => {
    render(<EmojiPicker categories={CATEGORIES} onSelect={() => {}} />);
    expect(screen.getByRole('grid', {name: 'Frequently used'})).toBeTruthy();
    const animals = screen.getByRole('grid', {name: 'Animals & nature'});
    expect(screen.getByRole('grid', {name: 'Travel & places'})).toBeTruthy();
    expect(emojiNames()).toHaveLength(DEFAULT_FREQUENT_EMOJIS.length + 3);
    // Rows hold eight cells; the last row is padded with empty ones.
    const [row] = within(animals).getAllByRole('row');
    expect(within(row).getAllByRole('gridcell')).toHaveLength(8);
    expect(within(row).getAllByRole('button')).toHaveLength(2);
  });

  it('leaves the frequent row out when it is empty', () => {
    render(
      <EmojiPicker
        categories={CATEGORIES}
        frequentEmojis={[]}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole('grid', {name: 'Frequently used'})).toBeNull();
    expect(emojiNames()).toHaveLength(3);
  });

  it('calls onSelect with the emoji and its option', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<EmojiPicker categories={CATEGORIES} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', {name: 'Dog face'}));
    expect(onSelect).toHaveBeenCalledWith(
      '🐶',
      expect.objectContaining({name: 'Dog face'}),
    );
  });

  it('searches names and keywords by word start, and announces when nothing matches', () => {
    render(
      <EmojiPicker
        categories={CATEGORIES}
        frequentEmojis={[]}
        onSelect={() => {}}
      />,
    );
    const status = screen.getByRole('status');
    expect(status).toBeEmptyDOMElement();
    fireEvent.change(search(), {target: {value: 'pet'}});
    expect(screen.getByRole('grid', {name: 'Search results'})).toBeTruthy();
    expect(emojiNames()).toEqual(['Cat face', 'Dog face']);
    // `cat` matches a word start: Cat face, never Vacation.
    fireEvent.change(search(), {target: {value: 'cat'}});
    expect(emojiNames()).toEqual(['Cat face']);
    expect(status).toBeEmptyDOMElement();
    fireEvent.change(search(), {target: {value: 'zzz'}});
    expect(status).toHaveTextContent('No emoji match “zzz”');
  });

  it('picks the first match with Enter in the search field', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        categories={CATEGORIES}
        frequentEmojis={[]}
        onSelect={onSelect}
      />,
    );
    await user.type(search(), 'beach{Enter}');
    expect(onSelect).toHaveBeenCalledWith('🏖️', expect.anything());
  });

  it('keeps one tab stop across the groups and moves it with the arrow keys', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        categories={[{name: 'Ten', emojis: TEN}, ...CATEGORIES]}
        frequentEmojis={[]}
        onSelect={onSelect}
      />,
    );
    const cell = (name: string) => screen.getByRole('button', {name});
    // One tab stop: Tab from the search field lands on the first emoji, and
    // the next Tab leaves the grid.
    await user.click(search());
    await user.tab();
    expect(cell('Emoji 1')).toHaveFocus();
    expect(
      screen
        .getAllByRole('button')
        .filter(button => button.getAttribute('tabindex') === '0'),
    ).toEqual([cell('Emoji 1')]);
    await user.keyboard('{ArrowRight}');
    expect(cell('Emoji 2')).toHaveFocus();
    // Down follows the column: from Emoji 2 to Emoji 10 in the next row, then
    // into the next group's first row, where column 2 holds Dog face.
    await user.keyboard('{ArrowDown}');
    expect(cell('Emoji 10')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cell('Dog face')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(cell('Emoji 2')).toHaveFocus();
    // Home and End stay in the row; Ctrl+End goes to the last emoji.
    await user.keyboard('{End}');
    expect(cell('Emoji 8')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(cell('Emoji 1')).toHaveFocus();
    await user.keyboard('{Control>}{End}{/Control}');
    expect(cell('Beach with umbrella')).toHaveFocus();
    await user.keyboard('{Control>}{Home}{/Control}');
    expect(cell('Emoji 1')).toHaveFocus();
    // Up from the first row returns to the search field; Down comes back.
    await user.keyboard('{ArrowUp}');
    expect(search()).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cell('Emoji 1')).toHaveFocus();
    // Enter picks the focused emoji.
    await user.keyboard('{ArrowRight}{Enter}');
    expect(onSelect).toHaveBeenCalledWith('😁', TEN[1]);
  });

  it('mirrors the arrow keys in right-to-left layouts', async () => {
    // jsdom computes `direction` without inheritance; resolve it from the
    // nearest dir attribute, as a browser would.
    const computed = window.getComputedStyle.bind(window);
    const spy = vi
      .spyOn(window, 'getComputedStyle')
      .mockImplementation((element, pseudo) => {
        const style = computed(element, pseudo);
        const dir = element.closest('[dir]')?.getAttribute('dir');
        return dir == null
          ? style
          : new Proxy(style, {
              get: (target, property) =>
                property === 'direction' ? dir : Reflect.get(target, property),
            });
      });
    const user = userEvent.setup();
    render(
      <div dir="rtl">
        <EmojiPicker
          categories={[{name: 'Ten', emojis: TEN}]}
          frequentEmojis={[]}
          onSelect={() => {}}
        />
      </div>,
    );
    await user.click(screen.getByRole('button', {name: 'Emoji 1'}));
    await user.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', {name: 'Emoji 2'})).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', {name: 'Emoji 1'})).toHaveFocus();
    spy.mockRestore();
  });

  it('leaves the arrow keys to an IME while it composes', () => {
    render(
      <EmojiPicker
        categories={CATEGORIES}
        frequentEmojis={[]}
        onSelect={() => {}}
      />,
    );
    search().focus();
    fireEvent.keyDown(search(), {key: 'ArrowDown', isComposing: true});
    expect(search()).toHaveFocus();
    fireEvent.keyDown(search(), {key: 'ArrowDown', keyCode: 229});
    expect(search()).toHaveFocus();
    fireEvent.keyDown(search(), {key: 'ArrowDown'});
    expect(screen.getByRole('button', {name: 'Cat face'})).toHaveFocus();
  });

  it('focuses the search field on mount with hasAutoFocus', () => {
    render(
      <EmojiPicker categories={CATEGORIES} hasAutoFocus onSelect={() => {}} />,
    );
    expect(search()).toHaveFocus();
  });

  it('names the emoji under the pointer or focus in its footer', async () => {
    const user = userEvent.setup();
    render(
      <EmojiPicker
        categories={CATEGORIES}
        frequentEmojis={[]}
        label="Reactions"
        onSelect={() => {}}
      />,
    );
    const footerText = (text: string) =>
      screen
        .getAllByText(text)
        .find(element => element.closest('[aria-hidden="true"]') != null);
    expect(footerText('Reactions')).toBeTruthy();
    await user.hover(screen.getByRole('button', {name: 'Dog face'}));
    expect(footerText('Dog face')).toBeTruthy();
    await user.unhover(screen.getByRole('button', {name: 'Dog face'}));
    expect(footerText('Reactions')).toBeTruthy();
  });

  it('loads the bundled set when no categories are passed', async () => {
    render(<EmojiPicker frequentEmojis={[]} onSelect={() => {}} />);
    expect(screen.getByRole('status', {name: 'Loading emoji'})).toBeTruthy();
    await act(async () => {
      for (let attempt = 0; attempt < 40; attempt++) {
        if (screen.queryAllByRole('grid').length > 0) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
    });
    expect(screen.getByRole('grid', {name: 'Smileys & emotion'})).toBeTruthy();
    expect(screen.getByRole('button', {name: 'Grinning face'})).toBeTruthy();
    expect(screen.getByRole('grid', {name: 'Flags'})).toBeTruthy();
    // Keywords come through: `finish` finds the flag.
    fireEvent.change(search(), {target: {value: 'finish'}});
    expect(emojiNames()).toEqual(['Chequered flag']);
  });

  it('renders the bundled emoji load error inside a status region', async () => {
    const loadFailedMessage = "More emoji couldn't be loaded.";

    vi.resetModules();
    vi.doMock('./emojiData', () => {
      throw new Error('forced emoji data load failure');
    });

    const {EmojiPicker: FailingEmojiPicker} = await import('./EmojiPicker');

    render(<FailingEmojiPicker frequentEmojis={[]} onSelect={() => {}} />);

    const errorMessage = await screen.findByText(loadFailedMessage);

    const isInsideStatusRegion = screen
      .getAllByRole('status')
      .some(status => status.contains(errorMessage));

    expect(isInsideStatusRegion).toBe(true);
  });
});
