// Copyright (c) Meta Platforms, Inc. and affiliates.

import {createRef, StrictMode, useLayoutEffect} from 'react';
import {describe, it, expect, vi, afterEach, beforeEach} from 'vitest';
import {render, screen, fireEvent, waitFor, act} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ChatComposer} from './ChatComposer';
import {useChatComposerContext} from './ChatContext';
import {ChatComposerInput} from './ChatComposerInput';
import type {
  ChatComposerTrigger,
  ChatComposerInputHandle,
} from './ChatComposerInput';
import {createStaticSource} from '../Typeahead/createStaticSource';
import type {SearchableItem, SearchSource} from '../Typeahead/types';

const announce = vi.hoisted(() => vi.fn());
vi.mock('../hooks/useAnnounce', () => ({useAnnounce: () => announce}));

// =============================================================================
// Helpers
// =============================================================================

const USERS: SearchableItem[] = [
  {id: 'cindy', label: 'Cindy Zhang'},
  {id: 'alex', label: 'Alex Johnson'},
  {id: 'sam', label: 'Sam Rivera'},
];

const COMMANDS: SearchableItem[] = [
  {id: 'summarize', label: 'summarize'},
  {id: 'translate', label: 'translate'},
  {id: 'search', label: 'search'},
];

function createMentionTrigger(
  overrides?: Partial<ChatComposerTrigger>,
): ChatComposerTrigger {
  return {
    character: '@',
    searchSource: createStaticSource(USERS),
    onSelect: item => ({
      value: `@${item.id}`,
      label: `@${item.label}`,
      variant: 'blue' as const,
    }),
    ...overrides,
  };
}

function createCommandTrigger(
  overrides?: Partial<ChatComposerTrigger>,
): ChatComposerTrigger {
  return {
    character: '/',
    searchSource: createStaticSource(COMMANDS),
    onSelect: item => `/${item.label} `,
    ...overrides,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ChatComposerInput', () => {
  describe('basic rendering', () => {
    it('renders with placeholder', () => {
      render(<ChatComposerInput placeholder="Type here..." />);
      expect(screen.getByText('Type here...')).toBeInTheDocument();
    });

    it('renders with default placeholder', () => {
      render(<ChatComposerInput />);
      expect(screen.getByText(/Type a message/)).toBeInTheDocument();
    });

    it('renders a textbox role', () => {
      render(<ChatComposerInput label="Test input" />);
      expect(
        screen.getByRole('textbox', {name: 'Test input'}),
      ).toBeInTheDocument();
    });

    it('marks the textbox as multiline', () => {
      render(<ChatComposerInput />);
      expect(screen.getByRole('textbox')).toHaveAttribute(
        'aria-multiline',
        'true',
      );
    });

    // ARIA 1.2 supports aria-multiline on textbox but not on combobox, and
    // configuring triggers switches the editable element to combobox.
    it('drops aria-multiline once triggers make it a combobox', () => {
      render(<ChatComposerInput triggers={[createMentionTrigger()]} />);
      const combobox = screen.getByRole('combobox');
      expect(combobox).not.toHaveAttribute('aria-multiline');
    });
  });

  describe('disabled editing', () => {
    it('keeps focus, draft, description, and Tab entry when the composer disables it', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      const view = (isDisabled: boolean, value = 'Draft') => (
        <>
          <button type="button">Before</button>
          <p id="reason">Unavailable while sending</p>
          <ChatComposer
            isDisabled={isDisabled}
            value={value}
            onChange={onChange}
            onSubmit={() => {}}
            input={<ChatComposerInput aria-describedby="reason" />}
          />
        </>
      );
      const {rerender} = render(view(false));
      await user.tab();
      await user.tab();
      const editor = screen.getByRole('textbox');
      expect(editor).toHaveFocus();

      rerender(view(true));
      expect(screen.getByRole('textbox')).toBe(editor);
      expect(editor).toHaveFocus();
      expect(editor).toHaveTextContent('Draft');
      expect(editor).toHaveAttribute('contenteditable', 'false');
      expect(editor).toHaveAttribute('aria-disabled', 'true');
      expect(editor).toHaveAccessibleDescription('Unavailable while sending');
      screen.getByRole('button', {name: 'Before'}).focus();
      await user.tab();
      expect(editor).toHaveFocus();

      rerender(view(true, 'External update'));
      expect(editor).toHaveTextContent('External update');
      expect(onChange).not.toHaveBeenCalled();
    });

    it('blocks input, submission, paste, drop, and consumer callbacks', () => {
      const onInteraction = vi.fn();
      render(
        <ChatComposerInput
          isDisabled
          value="Draft"
          onChange={onInteraction}
          onSubmit={onInteraction}
          onKeyDown={onInteraction}
          onKeyDownCapture={onInteraction}
          onInput={onInteraction}
          onPaste={onInteraction}
          onFiles={onInteraction}
          onDrop={onInteraction}
        />,
      );
      const editor = screen.getByRole('textbox');
      fireEvent.keyDown(editor, {key: 'Enter'});
      fireEvent.input(editor);
      fireEvent.paste(editor, {
        clipboardData: {files: [], getData: () => 'blocked'},
      });
      const file = new File(['content'], 'blocked.txt', {type: 'text/plain'});
      fireEvent.paste(editor, {
        clipboardData: {files: [file], getData: () => ''},
      });
      expect(
        fireEvent.drop(editor, {
          dataTransfer: {files: [file], types: ['Files']},
        }),
      ).toBe(false);
      expect(editor).toHaveTextContent('Draft');
      expect(onInteraction).not.toHaveBeenCalled();
    });

    it('blocks retained-handle mutations and token deletion until re-enabled', () => {
      const handleRef = createRef<ChatComposerInputHandle>();
      const onChange = vi.fn();
      const view = (isDisabled: boolean) => (
        <ChatComposerInput
          isDisabled={isDisabled}
          handleRef={handleRef}
          onChange={onChange}
        />
      );
      const {rerender} = render(view(false));
      const editor = screen.getByRole('textbox');
      const handle = handleRef.current!;
      let tokenId: string | undefined;
      act(() => {
        tokenId = handle.insertToken({value: '@sam', label: 'Sam'});
      });
      window.getSelection()!.collapse(editor.lastChild, 1);
      rerender(view(true));
      onChange.mockClear();
      // emitChange is itself silent while disabled, so the draft is checked
      // directly: neither the value nor the editor's markup (the token) may
      // change.
      const valueBefore = handle.getValue();
      const markupBefore = editor.innerHTML;

      act(() => {
        handle.insertText('blocked');
        expect(
          handle.insertToken({value: '@alex', label: 'Alex'}),
        ).toBeUndefined();
        handle.expandToken(tokenId!);
      });
      fireEvent.keyDown(editor, {key: 'Backspace'});
      expect(onChange).not.toHaveBeenCalled();
      expect(handle.getValue()).toBe(valueBefore);
      expect(editor.innerHTML).toBe(markupBefore);
      handle.focus();
      expect(editor).toHaveFocus();

      rerender(view(false));
      act(() => handle.insertText('enabled'));
      expect(handle.getValue()).toContain('enabled');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('closes suggestions without selecting or reopening after re-enabling', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn(() => '@sam ');
      const triggers = [createMentionTrigger({onSelect})];
      const onDisabledCommit = vi.fn();
      function Example({isDisabled = false}: {isDisabled?: boolean}) {
        useLayoutEffect(() => {
          if (isDisabled) {
            const editor = screen.getByRole('combobox');
            onDisabledCommit({
              expanded: editor.getAttribute('aria-expanded'),
              controls: editor.getAttribute('aria-controls'),
              activeDescendant: editor.getAttribute('aria-activedescendant'),
            });
          }
        }, [isDisabled]);
        return (
          <ChatComposerInput isDisabled={isDisabled} triggers={triggers} />
        );
      }
      const {rerender} = render(<Example />);
      const editor = screen.getByRole('combobox');
      await user.type(editor, '@');
      await screen.findByText('Cindy Zhang');
      expect(editor).toHaveAttribute('aria-expanded', 'true');

      rerender(<Example isDisabled />);
      expect(onDisabledCommit).toHaveBeenCalledExactlyOnceWith({
        expanded: 'false',
        controls: null,
        activeDescendant: null,
      });
      expect(
        screen.queryByRole('option', {hidden: true}),
      ).not.toBeInTheDocument();
      await user.keyboard('{Enter}');
      expect(onSelect).not.toHaveBeenCalled();
      expect(editor).toHaveTextContent('@');

      rerender(<Example />);
      expect(editor).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('change and submit', () => {
    it('calls onChange on input', () => {
      const onChange = vi.fn();
      render(<ChatComposerInput onChange={onChange} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      expect(onChange).toHaveBeenCalledWith('hello');
    });

    it('calls onSubmit on Enter', () => {
      const onSubmit = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello world';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onSubmit).toHaveBeenCalledWith('hello world');
    });

    it('does not submit on Shift+Enter', () => {
      const onSubmit = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter', shiftKey: true});
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('clears input after submit', () => {
      const onChange = vi.fn();
      render(<ChatComposerInput onSubmit={() => {}} onChange={onChange} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onChange).toHaveBeenLastCalledWith('');
    });

    it('does not submit empty input', () => {
      const onSubmit = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} />);
      const textbox = screen.getByRole('textbox');
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('keeps parent submit flow when child onChange observes input changes', () => {
      const onSubmit = vi.fn();
      const onInputChange = vi.fn();
      render(
        <ChatComposer
          onSubmit={onSubmit}
          input={<ChatComposerInput onChange={onInputChange} />}
        />,
      );

      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello world';
      fireEvent.input(textbox);

      expect(onInputChange).toHaveBeenLastCalledWith('hello world');

      fireEvent.keyDown(textbox, {key: 'Enter'});

      expect(onSubmit).toHaveBeenCalledWith('hello world');
      expect(onInputChange).toHaveBeenLastCalledWith('');
      expect(textbox.textContent).toBe('');
    });
  });

  describe('composer focus control', () => {
    it('registers a focus control so a body click focuses the input', () => {
      render(
        <ChatComposer onSubmit={() => {}} input={<ChatComposerInput />} />,
      );
      const editable = screen.getByRole('textbox');
      // Walk to the composer body: editable → input root → inputArea → body.
      const inputRoot = editable.parentElement!;
      const inputArea = inputRoot.parentElement!;
      const body = inputArea.parentElement!;
      // Click empty space in the body → shell drives the registered control.
      fireEvent.click(body);
      expect(document.activeElement).toBe(editable);
    });
  });

  describe('Enter submit behavior', () => {
    it('does not submit on Enter while IME composition is in progress', () => {
      const onSubmit = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'こんにちは';
      fireEvent.input(textbox);
      // isComposing is surfaced on the native event during IME composition.
      fireEvent.keyDown(textbox, {key: 'Enter', isComposing: true});
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('does not submit on Enter for the legacy keyCode 229 composing signal', () => {
      const onSubmit = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'ㅎ';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter', keyCode: 229});
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('lets onKeyDown suppress the default submit via preventDefault (touch-newline recipe)', () => {
      // The documented "insert a newline instead of sending" pattern: a
      // consumer preventDefaults Enter (e.g. on a coarse pointer).
      const onSubmit = vi.fn();
      const onKeyDown = vi.fn(e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
        }
      });
      render(<ChatComposerInput onSubmit={onSubmit} onKeyDown={onKeyDown} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onKeyDown).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('lets onKeyDown add behavior (Cmd/Ctrl+Enter submit) without preventDefault', () => {
      // Adding a submit shortcut is just handling the event yourself; the
      // built-in Enter handling still runs for the plain-Enter case.
      const onSubmit = vi.fn();
      const handle = vi.fn();
      const onKeyDown = vi.fn(e => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handle();
        }
      });
      render(<ChatComposerInput onSubmit={onSubmit} onKeyDown={onKeyDown} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter', metaKey: true});
      expect(handle).toHaveBeenCalled();
      // Consumer did not preventDefault, so the built-in submit also fires.
      expect(onSubmit).toHaveBeenCalledWith('hello');
    });

    it('calls onKeyDown before submit and lets preventDefault take over', () => {
      const onSubmit = vi.fn();
      const onKeyDown = vi.fn(e => {
        e.preventDefault();
      });
      render(<ChatComposerInput onSubmit={onSubmit} onKeyDown={onKeyDown} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onKeyDown).toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('calls onKeyDown but still submits when the consumer does not preventDefault', () => {
      const onSubmit = vi.fn();
      const onKeyDown = vi.fn();
      render(<ChatComposerInput onSubmit={onSubmit} onKeyDown={onKeyDown} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
      expect(onKeyDown).toHaveBeenCalled();
      expect(onSubmit).toHaveBeenCalledWith('hello');
    });
  });

  // Controlled-value sync used to overwrite `textContent` on every
  // distinct render, which (a) collapsed the caret to offset 0
  // (visible after a slash-command pick like
  // `setValue('/feedback ')` — the next keystroke landed at the
  // start of the input) and (b) ran a redundant DOM rebuild on every
  // echo of our own `onChange` emission. The effect now skips echoes
  // of its own emission and restores the caret to the end of the new
  // content when the editable is focused.
  describe('controlled value sync', () => {
    it('places caret at end after a programmatic value change while focused', () => {
      const {rerender} = render(
        <ChatComposerInput value="/" onChange={() => {}} />,
      );
      const textbox = screen.getByRole('textbox');
      textbox.focus();

      rerender(<ChatComposerInput value="/feedback " onChange={() => {}} />);

      expect(textbox.textContent).toBe('/feedback ');
      const selection = window.getSelection();
      expect(selection).not.toBeNull();
      expect(selection?.rangeCount).toBe(1);
      const range = selection!.getRangeAt(0);
      expect(range.collapsed).toBe(true);
      // Caret is at the end of the editable's contents — the next
      // keystroke will append, not prepend.
      expect(
        range.endContainer === textbox ||
          range.endContainer.parentNode === textbox,
      ).toBe(true);
      expect(textbox.textContent?.length).toBe(10);
      expect(range.endOffset).toBe(
        range.endContainer.nodeType === Node.TEXT_NODE
          ? (range.endContainer.textContent?.length ?? 0)
          : textbox.childNodes.length,
      );
    });

    it('does not touch the DOM when controlled value echoes our own emission', () => {
      const onChange = vi.fn();
      const {rerender} = render(
        <ChatComposerInput value="" onChange={onChange} />,
      );
      const textbox = screen.getByRole('textbox');
      textbox.focus();
      // User types `hello` — emitted via onChange.
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      expect(onChange).toHaveBeenLastCalledWith('hello');
      // Parent commits the echo. The effect must not rebuild the DOM,
      // otherwise the caret would jump back to offset 0.
      const textNodeBefore = textbox.firstChild;
      rerender(<ChatComposerInput value="hello" onChange={onChange} />);
      expect(textbox.firstChild).toBe(textNodeBefore);
      expect(textbox.textContent).toBe('hello');
    });

    it('writes textContent on a true external value change while unfocused', () => {
      const {rerender} = render(
        <ChatComposerInput value="hello" onChange={() => {}} />,
      );
      const textbox = screen.getByRole('textbox');
      expect(textbox.textContent).toBe('hello');
      // Unfocused programmatic change — still applied, no caret work.
      rerender(<ChatComposerInput value="world" onChange={() => {}} />);
      expect(textbox.textContent).toBe('world');
    });

    it('does not stale-cache an emitted value across an external override', () => {
      // Regression: a permanent cache of "last emitted" would
      // incorrectly skip a later external set back to the emitted
      // string. The marker is one-shot — consumed by the first
      // matching commit or invalidated by any non-echoing update.
      const onChange = vi.fn();
      const {rerender} = render(
        <ChatComposerInput value="" onChange={onChange} />,
      );
      const textbox = screen.getByRole('textbox');
      textbox.focus();
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      // External override — clears the pending echo marker.
      rerender(<ChatComposerInput value="world" onChange={onChange} />);
      expect(textbox.textContent).toBe('world');
      // Parent now sets the value back to what we previously emitted.
      // The effect must apply this — the stale marker is gone.
      rerender(<ChatComposerInput value="hello" onChange={onChange} />);
      expect(textbox.textContent).toBe('hello');
    });
  });

  // ArrowUp/ArrowDown recall previously submitted messages, but only at
  // the text boundaries — otherwise the caret can't move between lines
  // of a multi-line draft. ArrowUp recalls at the very start, ArrowDown
  // at the very end; mid-text the browser moves the caret (default not
  // prevented).
  describe('message history navigation', () => {
    function submit(textbox: HTMLElement, value: string) {
      textbox.textContent = value;
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
    }

    function placeCaret(node: Node, offset: number) {
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    it('recalls the previous message on ArrowUp at the start of the draft', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'first');
      submit(textbox, 'second');

      // Fresh empty draft — caret is trivially at the start.
      textbox.focus();
      placeCaret(textbox, 0);
      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

      expect(prevented).toBe(true);
      expect(textbox.textContent).toBe('second');
    });

    it('recalls from a first-text-node caret without cloning draft contents', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'previous message');

      textbox.textContent = 'pending draft';
      fireEvent.input(textbox);
      textbox.focus();
      // Chromium places this caret in the first text node, not on the root.
      placeCaret(textbox.firstChild!, 0);
      const cloneContents = vi.spyOn(Range.prototype, 'cloneContents');

      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

      expect(cloneContents).toHaveBeenCalledTimes(0);
      expect(prevented).toBe(true);
      expect(textbox.textContent).toBe('previous message');
      cloneContents.mockRestore();
    });

    it('steps forward from a final-text-node caret without cloning draft contents', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'previous message');

      const draft = 'pending draft';
      textbox.textContent = draft;
      fireEvent.input(textbox);
      textbox.focus();
      placeCaret(textbox.firstChild!, 0);
      fireEvent.keyDown(textbox, {key: 'ArrowUp'});

      // The prior ArrowUp selected a recalled message. Put the pending
      // draft back in place, then navigate forward from the final text node.
      textbox.textContent = draft;
      fireEvent.input(textbox);
      placeCaret(textbox.firstChild!, draft.length);
      const cloneContents = vi.spyOn(Range.prototype, 'cloneContents');

      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowDown'});

      expect(cloneContents).toHaveBeenCalledTimes(0);
      expect(prevented).toBe(true);
      expect(textbox.textContent).toBe(draft);
      cloneContents.mockRestore();
    });

    it('does not recall on ArrowUp when the caret is mid-text', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'first');

      textbox.textContent = 'aaa';
      fireEvent.input(textbox);
      textbox.focus();
      // Caret between the a's — not at the very start.
      placeCaret(textbox.firstChild!, 1);
      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

      // Default is not prevented: the browser moves the caret up a line.
      expect(prevented).toBe(false);
      expect(textbox.textContent).toBe('aaa');
    });

    it('does not recall on ArrowUp from the first line of a multi-line draft when not at the start', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'first');

      // Multi-line draft: "aaa" <br> "bbb".
      textbox.innerHTML = 'aaa<br>bbb';
      fireEvent.input(textbox);
      textbox.focus();
      // Caret mid first line.
      placeCaret(textbox.firstChild!, 2);
      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

      expect(prevented).toBe(false);
      expect(textbox.querySelector('br')).not.toBeNull();
    });

    it('steps back and forth through history at the boundaries', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'first');
      submit(textbox, 'second');

      textbox.focus();
      placeCaret(textbox, 0);

      // Up to the most recent, then further back.
      fireEvent.keyDown(textbox, {key: 'ArrowUp'});
      expect(textbox.textContent).toBe('second');
      // Recalled text is fully selected — Up again steps further back.
      fireEvent.keyDown(textbox, {key: 'ArrowUp'});
      expect(textbox.textContent).toBe('first');
      // Down steps forward again.
      fireEvent.keyDown(textbox, {key: 'ArrowDown'});
      expect(textbox.textContent).toBe('second');
    });

    it('restores the pending draft on ArrowDown past the newest message', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      submit(textbox, 'first');

      textbox.textContent = 'draft';
      fireEvent.input(textbox);
      textbox.focus();
      // Caret at the very start — ArrowUp recalls and stashes the draft.
      placeCaret(textbox, 0);

      fireEvent.keyDown(textbox, {key: 'ArrowUp'});
      expect(textbox.textContent).toBe('first');
      // The recalled message is fully selected, so ArrowDown steps
      // forward past the newest entry and restores the stashed draft.
      fireEvent.keyDown(textbox, {key: 'ArrowDown'});
      expect(textbox.textContent).toBe('draft');
    });

    it('does nothing when there is no history', () => {
      render(<ChatComposerInput onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      textbox.focus();
      placeCaret(textbox, 0);

      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});
      expect(prevented).toBe(false);
      expect(textbox.textContent).toBe('hello');
    });

    it('does not recall when hasHistory is false', () => {
      render(<ChatComposerInput hasHistory={false} onSubmit={() => {}} />);
      const textbox = screen.getByRole('textbox');
      // Even after "submitting", history is disabled.
      textbox.textContent = 'first';
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});

      textbox.textContent = 'hello';
      fireEvent.input(textbox);
      textbox.focus();
      placeCaret(textbox.firstChild!, 0);

      const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});
      expect(prevented).toBe(false);
      expect(textbox.textContent).toBe('hello');
    });
  });

  describe('file handling', () => {
    it('calls onFiles on paste with files', () => {
      const onFiles = vi.fn();
      render(<ChatComposerInput onFiles={onFiles} />);
      const textbox = screen.getByRole('textbox');

      const file = new File(['content'], 'test.txt', {type: 'text/plain'});
      fireEvent.paste(textbox, {
        clipboardData: {
          files: [file],
          getData: () => '',
        },
      });
      expect(onFiles).toHaveBeenCalledWith([file]);
    });

    it('calls onFiles when files are dropped onto the editor', () => {
      const onFiles = vi.fn();
      render(<ChatComposerInput onFiles={onFiles} />);
      const textbox = screen.getByRole('textbox');
      const file = new File(['content'], 'dropped.txt', {type: 'text/plain'});

      const allowed = fireEvent.drop(textbox, {
        dataTransfer: {files: [file], types: ['Files']},
      });
      expect(allowed).toBe(false);
      expect(onFiles).toHaveBeenCalledWith([file]);
    });
  });

  // Paste / insert paths used to bail silently when the contenteditable
  // was programmatically focused but no Selection range existed inside
  // it — the common case after `ChatComposer.handleBodyClick` calls
  // `editable.focus()`. Browsers do not create a Range on bare focus.
  // See `chatComposerSelection.ts`.
  describe('selection recovery (no range inside editable)', () => {
    function clearSelection() {
      window.getSelection()?.removeAllRanges();
    }

    /** Type a message and send it, so history has something to recall. */
    function submitMessage(textbox: HTMLElement, value: string) {
      textbox.textContent = value;
      fireEvent.input(textbox);
      fireEvent.keyDown(textbox, {key: 'Enter'});
    }

    it('paste inserts plain text after a focus() with no selection range', () => {
      const onChange = vi.fn();
      render(<ChatComposerInput onChange={onChange} />);
      const textbox = screen.getByRole('textbox');

      textbox.focus();
      clearSelection();
      expect(window.getSelection()?.rangeCount ?? 0).toBe(0);

      fireEvent.paste(textbox, {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === 'text/plain' ? 'hello' : ''),
        },
      });

      expect(textbox.textContent).toBe('hello');
      expect(onChange).toHaveBeenLastCalledWith('hello');
    });

    it('paste inserts a token chip for long pastes after a focus() with no selection range', () => {
      render(<ChatComposerInput />);
      const textbox = screen.getByRole('textbox');

      textbox.focus();
      clearSelection();

      // Default pasteAsToken threshold is 200 chars.
      const long = 'a'.repeat(250);
      fireEvent.paste(textbox, {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === 'text/plain' ? long : ''),
        },
      });

      expect(textbox.querySelector('[data-astryx-token]')).toBeInTheDocument();
    });

    it('imperative insertToken works after a focus() with no selection range', () => {
      let handle: ChatComposerInputHandle | null = null;
      render(
        <ChatComposerInput
          handleRef={h => {
            handle = h;
          }}
        />,
      );
      const textbox = screen.getByRole('textbox');

      textbox.focus();
      clearSelection();

      handle!.insertToken({
        value: '@sam',
        label: '@Sam Rivera',
        variant: 'blue' as const,
      });

      expect(textbox.querySelector('[data-astryx-token]')).toBeInTheDocument();
    });

    it('imperative insertText updates the observable draft after a focus() with no selection range', () => {
      let handle: ChatComposerInputHandle | null = null;
      const onChange = vi.fn();
      render(
        <ChatComposerInput
          placeholder="Write a message"
          onChange={onChange}
          handleRef={h => {
            handle = h;
          }}
        />,
      );
      const textbox = screen.getByRole('textbox');

      textbox.focus();
      clearSelection();

      act(() => handle!.insertText('hello'));

      expect(textbox.textContent).toContain('hello');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenLastCalledWith('hello');
      expect(screen.queryByText('Write a message')).not.toBeInTheDocument();
    });

    // History recall reads where the caret sits, so where a programmatic
    // focus leaves it decides whether ArrowUp recalls or moves the caret.
    // Measured in Chromium: `focus()` collapses the caret to offset 0 —
    // the START of the draft — so a composer that trusted it would let the
    // first ArrowUp after a padding click replace whatever was typed. The
    // composer states the caret itself instead: after the draft.
    describe('caret placement on programmatic focus', () => {
      /** What Chromium does to the Selection on `editable.focus()`. */
      function focusLikeChromium(editable: HTMLElement) {
        editable.focus();
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(editable.firstChild ?? editable, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      function caretOffsetFromEnd(editable: HTMLElement): number {
        const selection = window.getSelection()!;
        const range = selection.getRangeAt(0);
        const toEnd = document.createRange();
        toEnd.selectNodeContents(editable);
        toEnd.setStart(range.endContainer, range.endOffset);
        return toEnd.toString().length;
      }

      it('puts the caret after the draft when the composer shell focuses it', async () => {
        const user = userEvent.setup();
        render(
          <ChatComposer onSubmit={() => {}} input={<ChatComposerInput />} />,
        );
        const textbox = screen.getByRole('textbox');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);

        // Walk to the composer body: editable → input root → inputArea → body.
        const body = textbox.parentElement!.parentElement!.parentElement!;
        await user.click(body);

        expect(document.activeElement).toBe(textbox);
        expect(caretOffsetFromEnd(textbox)).toBe(0);
      });

      // The click path overrides rather than restores: clicking the space
      // after the text says where the user wants to be, so a caret left
      // over from earlier does not win. Driving the shell's registered
      // control directly is what makes this distinguishable — jsdom's
      // synthetic click clears the selection on its own, so a click alone
      // would pass either way.
      it('overrides a stale mid-draft caret when the shell focuses it', () => {
        let shellFocus: (() => void) | undefined;
        function GrabControl() {
          const ctx = useChatComposerContext();
          shellFocus = () => {
            ctx?.inputControlRef?.current?.focus();
          };
          return null;
        }
        render(
          <ChatComposer
            onSubmit={() => {}}
            input={
              <>
                <ChatComposerInput />
                <GrabControl />
              </>
            }
          />,
        );
        const textbox = screen.getByRole('textbox');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(textbox.firstChild!, 3);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        shellFocus!();

        expect(caretOffsetFromEnd(textbox)).toBe(0);
      });

      it('keeps a pending draft when ArrowUp follows a click on the composer padding', async () => {
        const user = userEvent.setup();
        render(
          <ChatComposer onSubmit={() => {}} input={<ChatComposerInput />} />,
        );
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);

        const body = textbox.parentElement!.parentElement!.parentElement!;
        await user.click(body);
        const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        // Caret movement, not recall: the draft survives untouched.
        expect(prevented).toBe(false);
        expect(textbox.textContent).toBe('pending draft');
      });

      it('recalls history when ArrowUp follows a padding click on an empty composer', async () => {
        const user = userEvent.setup();
        render(
          <ChatComposer onSubmit={() => {}} input={<ChatComposerInput />} />,
        );
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');

        const body = textbox.parentElement!.parentElement!.parentElement!;
        await user.click(body);
        const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        // An empty draft is at its start and its end at once.
        expect(prevented).toBe(true);
        expect(textbox.textContent).toBe('first');
      });

      it('puts the caret after the draft on the imperative focus() with no prior caret', () => {
        let handle: ChatComposerInputHandle | null = null;
        render(
          <ChatComposerInput
            handleRef={h => {
              handle = h;
            }}
          />,
        );
        const textbox = screen.getByRole('textbox');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        clearSelection();

        handle!.focus();

        expect(document.activeElement).toBe(textbox);
        expect(caretOffsetFromEnd(textbox)).toBe(0);
      });

      // A consumer calling focus() to return the user to the composer must
      // not move them: the caret they left behind is theirs, not ours.
      it('keeps a mid-draft caret across the imperative focus()', () => {
        let handle: ChatComposerInputHandle | null = null;
        render(
          <ChatComposerInput
            handleRef={h => {
              handle = h;
            }}
          />,
        );
        const textbox = screen.getByRole('textbox');
        const draft = 'pending draft';
        textbox.textContent = draft;
        fireEvent.input(textbox);
        // Caret between "pending" and " draft".
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(textbox.firstChild!, 7);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        handle!.focus();

        expect(document.activeElement).toBe(textbox);
        expect(caretOffsetFromEnd(textbox)).toBe(draft.length - 7);
      });

      it('keeps a ranged selection across the imperative focus()', () => {
        let handle: ChatComposerInputHandle | null = null;
        render(
          <ChatComposerInput
            handleRef={h => {
              handle = h;
            }}
          />,
        );
        const textbox = screen.getByRole('textbox');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(textbox.firstChild!, 0);
        range.setEnd(textbox.firstChild!, 7);
        selection.removeAllRanges();
        selection.addRange(range);

        handle!.focus();

        const after = window.getSelection()!;
        expect(after.isCollapsed).toBe(false);
        expect(after.toString()).toBe('pending');
      });

      it('keeps a start-of-draft caret across the imperative focus(), so ArrowUp still recalls', () => {
        let handle: ChatComposerInputHandle | null = null;
        render(
          <ChatComposerInput
            onSubmit={() => {}}
            handleRef={h => {
              handle = h;
            }}
          />,
        );
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        // The user deliberately put the caret at the start.
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(textbox.firstChild!, 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        handle!.focus();
        fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        // Their caret is honored, not overridden into "end of draft".
        expect(textbox.textContent).toBe('first');
      });

      it('ignores a selection outside the editable on the imperative focus()', () => {
        let handle: ChatComposerInputHandle | null = null;
        const {container} = render(
          <div>
            <p>elsewhere</p>
            <ChatComposerInput
              handleRef={h => {
                handle = h;
              }}
            />
          </div>,
        );
        const textbox = screen.getByRole('textbox');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        const outside = container.querySelector('p')!;
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.selectNodeContents(outside);
        selection.removeAllRanges();
        selection.addRange(range);

        handle!.focus();

        // Not the user's position in the composer, so it does not count.
        expect(caretOffsetFromEnd(textbox)).toBe(0);
      });

      it('keeps a pending draft when the caret is the one Chromium leaves on a bare focus()', () => {
        render(<ChatComposerInput onSubmit={() => {}} />);
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);

        // A consumer focusing the DOM node directly bypasses our focus
        // control, so this is the caret the engine chose.
        focusLikeChromium(textbox);
        const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        // The user did put the caret at the start here as far as the DOM can
        // tell, so recall is the documented behavior — but the draft must be
        // recoverable, not lost.
        expect(prevented).toBe(true);
        expect(textbox.textContent).toBe('first');
        fireEvent.keyDown(textbox, {key: 'ArrowDown'});
        expect(textbox.textContent).toBe('pending draft');
      });

      it('recalls history on ArrowUp when no caret exists inside the editable', () => {
        render(<ChatComposerInput onSubmit={() => {}} />);
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');

        // An engine that creates no Range on focus, or a consumer that never
        // focused at all: the composer falls back to a caret after the draft.
        textbox.focus();
        clearSelection();
        expect(window.getSelection()?.rangeCount ?? 0).toBe(0);

        const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        expect(prevented).toBe(true);
        expect(textbox.textContent).toBe('first');
      });

      it('keeps a pending draft when no caret exists inside the editable', () => {
        render(<ChatComposerInput onSubmit={() => {}} />);
        const textbox = screen.getByRole('textbox');
        submitMessage(textbox, 'first');
        textbox.textContent = 'pending draft';
        fireEvent.input(textbox);
        textbox.focus();
        clearSelection();

        const prevented = !fireEvent.keyDown(textbox, {key: 'ArrowUp'});

        expect(prevented).toBe(false);
        expect(textbox.textContent).toBe('pending draft');
      });
    });

    it('lets onPaste intercept long text before default token conversion', () => {
      const onPaste = vi.fn(() => true);
      render(<ChatComposerInput onPaste={onPaste} />);
      const textbox = screen.getByRole('textbox');
      textbox.focus();
      clearSelection();
      const long = 'c'.repeat(250);

      fireEvent.paste(textbox, {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === 'text/plain' ? long : ''),
        },
      });

      expect(onPaste).toHaveBeenCalledWith(expect.anything(), long);
      expect(
        textbox.querySelector('[data-astryx-token]'),
      ).not.toBeInTheDocument();
      expect(textbox.textContent).toBe('');
    });

    it('emits once when onPaste inserts through the imperative handle', () => {
      let handle: ChatComposerInputHandle | null = null;
      const onChange = vi.fn();
      const onPaste = vi.fn((_event: unknown, text: string) => {
        handle!.insertText(text);
        return true;
      });
      render(
        <ChatComposerInput
          handleRef={next => {
            handle = next;
          }}
          onChange={onChange}
          onPaste={onPaste}
        />,
      );
      const textbox = screen.getByRole('textbox');
      textbox.focus();
      clearSelection();

      fireEvent.paste(textbox, {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === 'text/plain' ? 'hello' : ''),
        },
      });

      expect(textbox.textContent).toBe('hello');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('hello');
    });

    it('paste falls through to plain-text path when pasteAsToken={false}', () => {
      const onChange = vi.fn();
      render(<ChatComposerInput pasteAsToken={false} onChange={onChange} />);
      const textbox = screen.getByRole('textbox');

      textbox.focus();
      clearSelection();

      const long = 'b'.repeat(250);
      fireEvent.paste(textbox, {
        clipboardData: {
          files: [],
          getData: (type: string) => (type === 'text/plain' ? long : ''),
        },
      });

      expect(
        textbox.querySelector('[data-astryx-token]'),
      ).not.toBeInTheDocument();
      expect(textbox.textContent).toBe(long);
    });
  });

  describe('triggers', () => {
    it('accepts triggers with searchSource', () => {
      const triggers = [createMentionTrigger()];
      const {container} = render(<ChatComposerInput triggers={triggers} />);
      expect(container).toBeTruthy();
    });

    it('accepts multiple triggers', () => {
      const triggers = [createMentionTrigger(), createCommandTrigger()];
      const {container} = render(<ChatComposerInput triggers={triggers} />);
      expect(container).toBeTruthy();
    });

    it('accepts async searchSource trigger', () => {
      const asyncTrigger: ChatComposerTrigger = {
        character: '@',
        searchSource: {
          async search(query: string) {
            return USERS.filter(u =>
              u.label.toLowerCase().includes(query.toLowerCase()),
            );
          },
          async bootstrap() {
            return USERS;
          },
          cancel() {},
        },
        onSelect: item => ({
          value: `@${item.id}`,
          label: `@${item.label}`,
          variant: 'blue' as const,
        }),
      };
      const {container} = render(
        <ChatComposerInput triggers={[asyncTrigger]} />,
      );
      expect(container).toBeTruthy();
    });

    it('renders with custom renderItem', () => {
      const trigger = createMentionTrigger({
        renderItem: item => <div data-testid="custom-item">{item.label}</div>,
      });
      const {container} = render(<ChatComposerInput triggers={[trigger]} />);
      expect(container).toBeTruthy();
    });

    it('supports configurable empty/loading text', () => {
      const trigger = createMentionTrigger({
        emptySearchText: 'Nobody found',
        loadingText: 'Looking up...',
        menuLabel: 'People',
      });
      const {container} = render(<ChatComposerInput triggers={[trigger]} />);
      expect(container).toBeTruthy();
    });

    // A trigger's `emptySearchResultsText` was renamed to `emptySearchText`
    // and widened from `string` to `ReactNode` (`spec:AST-056` FR1). The
    // overlap ended in a minor release (`CLN-0004`, `spec:AST-017` FR31).
    it('renders an element emptySearchText when the query matched nothing', async () => {
      const user = userEvent.setup();
      const trigger = createMentionTrigger({
        emptySearchText: (
          <span>
            Nobody by that name. <a href="/invite">Invite them</a>
          </span>
        ),
      });
      render(<ChatComposerInput triggers={[trigger]} />);

      await user.click(screen.getByRole('combobox'));
      await user.keyboard('@zzzzz');

      await waitFor(() => {
        expect(screen.getByText('Invite them')).toBeInTheDocument();
      });
    });

    it('no longer reads the removed emptySearchResultsText key (CLN-0004)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const user = userEvent.setup();
      const trigger = createMentionTrigger({
        // @ts-expect-error -- removed in the minor release (CLN-0004)
        emptySearchResultsText: 'Nobody found',
      });
      render(<ChatComposerInput triggers={[trigger]} />);

      await user.click(screen.getByRole('combobox'));
      await user.keyboard('@zzzzz');

      await waitFor(() => {
        expect(screen.getByText('No results')).toBeInTheDocument();
      });
      expect(screen.queryByText('Nobody found')).not.toBeInTheDocument();
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('is deprecated'),
      );
      warn.mockRestore();
    });
  });

  describe('accessibility', () => {
    it('exposes role=combobox when triggers are configured', () => {
      const triggers = [createMentionTrigger()];
      render(<ChatComposerInput triggers={triggers} />);
      // aria-expanded/haspopup/controls/activedescendant are only valid on
      // role="combobox", so the editable element must be a combobox (not a
      // plain textbox) whenever trigger-menu behavior is wired.
      expect(screen.getByRole('combobox')).toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('has aria-haspopup on the combobox', () => {
      const triggers = [createMentionTrigger()];
      render(<ChatComposerInput triggers={triggers} />);
      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('has aria-expanded=false when menu is closed', () => {
      const triggers = [createMentionTrigger()];
      render(<ChatComposerInput triggers={triggers} />);
      const combobox = screen.getByRole('combobox');
      expect(combobox).toHaveAttribute('aria-expanded', 'false');
    });

    it('stays role=textbox with no combobox attributes when no triggers are configured', () => {
      render(<ChatComposerInput label="Message" />);
      const textbox = screen.getByRole('textbox', {name: 'Message'});
      // A plain textbox must not carry combobox-only ARIA (axe: aria-allowed-attr).
      expect(textbox).not.toHaveAttribute('aria-expanded');
      expect(textbox).not.toHaveAttribute('aria-haspopup');
    });
  });

  describe('refs', () => {
    it('forwards ref to the root element', () => {
      let root: HTMLDivElement | null = null;
      render(
        <ChatComposerInput
          ref={el => {
            root = el;
          }}
        />,
      );
      expect(root).toBeInstanceOf(HTMLDivElement);
      expect(root).toHaveClass('astryx-chat-composer-input');
    });

    it('exposes imperative handle via handleRef', () => {
      const ref = vi.fn();
      render(<ChatComposerInput handleRef={ref} />);
      expect(ref).toHaveBeenCalledWith(
        expect.objectContaining({
          insertToken: expect.any(Function),
          insertText: expect.any(Function),
          focus: expect.any(Function),
          getValue: expect.any(Function),
        }),
      );
    });

    it('getValue returns empty string for empty input', () => {
      let handle: ChatComposerInputHandle | null = null;
      render(
        <ChatComposerInput
          handleRef={h => {
            handle = h;
          }}
        />,
      );
      expect(handle!.getValue()).toBe('');
    });
  });

  describe('token backspace handling', () => {
    it('removes token and trailing NBSP on backspace', () => {
      let handle: ChatComposerInputHandle | null = null;
      const onChange = vi.fn();
      render(
        <ChatComposerInput
          handleRef={h => {
            handle = h;
          }}
          onChange={onChange}
        />,
      );
      const textbox = screen.getByRole('textbox');

      // Focus and set a collapsed selection so insertToken has a valid range
      textbox.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(textbox);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      // Insert a token programmatically
      handle!.insertToken({
        value: '@sam',
        label: '@Sam Rivera',
        variant: 'blue' as const,
      });
      fireEvent.input(textbox);

      // The DOM should have a token span + trailing NBSP
      const tokenSpan = textbox.querySelector('[data-astryx-token]');
      expect(tokenSpan).toBeInTheDocument();

      const nbsp = tokenSpan!.nextSibling;
      expect(nbsp).toBeTruthy();
      expect(nbsp!.textContent).toBe('\u00A0');

      // Position cursor at end of NBSP text node
      const r2 = document.createRange();
      r2.setStart(nbsp!, 1);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);

      // Fire backspace
      fireEvent.keyDown(textbox, {key: 'Backspace'});

      // Both the NBSP and the token should be removed
      expect(textbox.querySelector('[data-astryx-token]')).toBeNull();
    });

    it('serializes to empty after token backspace', () => {
      let handle: ChatComposerInputHandle | null = null;
      const onChange = vi.fn();
      render(
        <ChatComposerInput
          handleRef={h => {
            handle = h;
          }}
          onChange={onChange}
        />,
      );
      const textbox = screen.getByRole('textbox');

      // Focus and set selection
      textbox.focus();
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.selectNodeContents(textbox);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);

      handle!.insertToken({
        value: '@sam',
        label: '@Sam Rivera',
        variant: 'blue' as const,
      });
      fireEvent.input(textbox);

      const tokenSpan = textbox.querySelector('[data-astryx-token]')!;
      const nbsp = tokenSpan.nextSibling!;

      // Position cursor in the NBSP
      const r2 = document.createRange();
      r2.setStart(nbsp, 1);
      r2.collapse(true);
      sel.removeAllRanges();
      sel.addRange(r2);

      // Backspace should remove token + NBSP and fire onChange
      fireEvent.keyDown(textbox, {key: 'Backspace'});
      expect(onChange).toHaveBeenLastCalledWith('');
    });
  });

  describe('astryx class names', () => {
    it('has astryx-chat-composer-input class', () => {
      const {container} = render(<ChatComposerInput />);
      expect(
        container.querySelector('.astryx-chat-composer-input'),
      ).toBeInTheDocument();
    });
  });

  describe('trigger query (component:ChatComposerInput FR13, AR5)', () => {
    function typeAtEnd(editable: HTMLElement, text: string) {
      editable.textContent = text;
      const node = editable.firstChild!;
      const range = document.createRange();
      range.setStart(node, text.length);
      range.collapse(true);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      fireEvent.input(editable);
    }

    it('Enter while a newer trigger search is pending sends the typed text, picks no row, and no menu reopens after the send', async () => {
      const onSubmit = vi.fn();
      let resolveSlow: (items: SearchableItem[]) => void = () => {};
      const source: SearchSource = {
        bootstrap: async () => [],
        async search(query: string) {
          if (query === 'ci') {
            return new Promise(resolve => {
              resolveSlow = resolve;
            });
          }
          return Promise.resolve(
            USERS.filter(u => u.label.toLowerCase().includes(query)),
          );
        },
      };
      render(
        <ChatComposerInput
          triggers={[createMentionTrigger({searchSource: source})]}
          debounceMs={0}
          onSubmit={onSubmit}
        />,
      );
      const editable = screen.getByRole('combobox');
      editable.focus();

      typeAtEnd(editable, '@c');
      await waitFor(() => {
        expect(editable.getAttribute('aria-activedescendant')).toBeTruthy();
      });

      // A newer search is pending: Enter sends the draft exactly as typed.
      typeAtEnd(editable, '@ci');
      fireEvent.keyDown(editable, {key: 'Enter'});
      expect(onSubmit).toHaveBeenCalledWith('@ci');
      expect(editable.querySelector('[data-astryx-token]')).toBeNull();
      expect(editable.textContent).toBe('');

      // The late result for the sent query must not reopen the menu.
      await act(async () => {
        resolveSlow([{id: 'cindy', label: 'Cindy Zhang'}]);
      });
      expect(editable).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('forgets an Escape-dismissed mention when the message is sent, so the next message can mention', async () => {
      const onSubmit = vi.fn();
      render(
        <ChatComposerInput
          triggers={[createMentionTrigger()]}
          onSubmit={onSubmit}
        />,
      );
      const editable = screen.getByRole('combobox');
      editable.focus();

      typeAtEnd(editable, '@');
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'true');
      });
      fireEvent.keyDown(editable, {key: 'Escape'});
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'false');
      });

      fireEvent.keyDown(editable, {key: 'Enter'});
      expect(onSubmit).toHaveBeenCalledWith('@');

      typeAtEnd(editable, '@ci');
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'true');
      });
      expect(editable.getAttribute('aria-activedescendant')).toBeTruthy();
    });

    it('forgets an Escape-dismissed trigger when the send button sends the draft', async () => {
      const onSubmit = vi.fn();
      render(
        <ChatComposer
          onSubmit={onSubmit}
          input={<ChatComposerInput triggers={[createCommandTrigger()]} />}
        />,
      );
      const editable = screen.getByRole('combobox');
      editable.focus();

      typeAtEnd(editable, '/');
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'true');
      });
      fireEvent.keyDown(editable, {key: 'Escape'});
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'false');
      });

      fireEvent.click(screen.getByRole('button', {name: /send/i}));
      expect(onSubmit).toHaveBeenCalledWith('/');
      await waitFor(() => {
        expect(editable.textContent).toBe('');
      });

      typeAtEnd(editable, '/s');
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'true');
      });
    });

    it('drops a late trigger result after the send button sends the draft', async () => {
      const onSubmit = vi.fn();
      let resolveSlow: (items: SearchableItem[]) => void = () => {};
      const source: SearchSource = {
        bootstrap: async () => [],
        async search(query: string) {
          if (query === 'ci') {
            return new Promise(resolve => {
              resolveSlow = resolve;
            });
          }
          return Promise.resolve(
            USERS.filter(u => u.label.toLowerCase().includes(query)),
          );
        },
      };
      render(
        <ChatComposer
          onSubmit={onSubmit}
          input={
            <ChatComposerInput
              triggers={[createMentionTrigger({searchSource: source})]}
              debounceMs={0}
            />
          }
        />,
      );
      const editable = screen.getByRole('combobox');
      editable.focus();

      typeAtEnd(editable, '@c');
      await waitFor(() => {
        expect(editable.getAttribute('aria-activedescendant')).toBeTruthy();
      });
      typeAtEnd(editable, '@ci');

      fireEvent.click(screen.getByRole('button', {name: /send/i}));
      expect(onSubmit).toHaveBeenCalledWith('@ci');
      await waitFor(() => {
        expect(editable.textContent).toBe('');
      });

      await act(async () => {
        resolveSlow([{id: 'cindy', label: 'Cindy Zhang'}]);
      });
      expect(editable).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('lets Escape reach the consumer while an unmatched multi-word query hides the menu', async () => {
      const onKeyDown = vi.fn();
      render(
        <ChatComposerInput
          triggers={[createMentionTrigger({hasMultiWordQuery: true})]}
          onKeyDown={onKeyDown}
        />,
      );
      const editable = screen.getByRole('combobox');
      editable.focus();

      typeAtEnd(editable, '@team please');
      await waitFor(() => {
        expect(editable).toHaveAttribute('aria-expanded', 'false');
      });
      // The hidden menu's results commit outside act, so the popover's Escape
      // registration is released by a passive effect that can still be pending
      // when the attribute changes. Flush it before pressing Escape.
      await act(async () => {});

      // Nothing cancels the key: the closed menu holds no Escape handling,
      // so a surrounding dialog or drawer still receives it.
      const notCancelled = fireEvent.keyDown(editable, {key: 'Escape'});
      expect(notCancelled).toBe(true);
      expect(onKeyDown).toHaveBeenCalledWith(
        expect.objectContaining({key: 'Escape'}),
      );
    });
  });

  describe('trigger menu cursor anchor', () => {
    // The trigger menu anchors its popover to the cursor position, not the
    // entire input element. In real browsers this creates a fixed-position
    // span on document.body at the cursor rect. In jsdom (no layout engine)
    // it falls back to anchoring on the editable element.
    //
    // These tests verify:
    // 1. No anchor spans leak inside the contentEditable (text nodes stay intact)
    // 2. The fallback path works (popover opens without errors)
    // 3. selectItem cleans up properly — trigger text is fully replaced
    // 4. No orphaned spans on document.body after menu dismiss

    const BODY_ANCHOR_SELECTOR = 'span[data-astryx-trigger-anchor]';

    function setupTriggerInput(triggers: ChatComposerTrigger[]) {
      const onChange = vi.fn();
      const result = render(
        <ChatComposerInput triggers={triggers} onChange={onChange} />,
      );
      // With triggers configured the editable is a combobox, not a textbox.
      const textbox = screen.getByRole('combobox');
      textbox.focus();
      return {...result, textbox, onChange};
    }

    function setCursorAfterText(textbox: HTMLElement, text: string): Text {
      const textNode = document.createTextNode(text);
      textbox.appendChild(textNode);
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, text.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return textNode;
    }

    afterEach(() => {
      // Clean up any orphaned anchor spans from document.body
      document
        .querySelectorAll(BODY_ANCHOR_SELECTOR)
        .forEach(el => el.remove());
    });

    it('does not insert spans inside the contentEditable', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, 'hello @');
      fireEvent.input(textbox);

      // No stray spans inside the editable — text nodes stay intact
      const spans = textbox.querySelectorAll('span[aria-hidden="true"]');
      expect(spans.length).toBe(0);
    });

    it('opens trigger menu without errors in jsdom fallback path', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      // jsdom returns zero-rect from getBoundingClientRect, so the
      // fallback anchors on the editable. No crash.
      setCursorAfterText(textbox, '@');
      fireEvent.input(textbox);

      // The popover opened — ARIA says expanded
      expect(textbox.getAttribute('aria-expanded')).toBe('true');
    });

    it('does not throw when Escape dismisses the menu', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, '@');
      fireEvent.input(textbox);
      expect(textbox.getAttribute('aria-expanded')).toBe('true');

      // Escape should not throw — popover hide works in jsdom even
      // if aria-expanded doesn't update synchronously
      expect(() => fireEvent.keyDown(textbox, {key: 'Escape'})).not.toThrow();
    });

    it('does not throw when trigger text is cleared', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, '@');
      fireEvent.input(textbox);
      expect(textbox.getAttribute('aria-expanded')).toBe('true');

      // Clearing text removes the trigger — should not throw
      textbox.textContent = '';
      expect(() => fireEvent.input(textbox)).not.toThrow();
    });

    it('does not create body anchor when no trigger is active', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, 'hello');
      fireEvent.input(textbox);

      expect(textbox.getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelector(BODY_ANCHOR_SELECTOR)).toBeNull();
    });

    it('serialized output is clean — no anchor artifacts', () => {
      let handle: ChatComposerInputHandle | null = null;
      const triggers = [createMentionTrigger()];
      const onChange = vi.fn();
      render(
        <ChatComposerInput
          handleRef={h => {
            handle = h;
          }}
          triggers={triggers}
          onChange={onChange}
        />,
      );
      const textbox = screen.getByRole('combobox');
      textbox.focus();

      setCursorAfterText(textbox, 'hello @');
      fireEvent.input(textbox);

      expect(handle!.getValue()).toBe('hello @');
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe('hello @');
    });

    it('text nodes stay contiguous — no splits from anchor insertion', () => {
      const {textbox} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, 'hello @cin');
      fireEvent.input(textbox);

      // All text is in a single text node — no splitting
      const textNodes = Array.from(textbox.childNodes).filter(
        n => n.nodeType === Node.TEXT_NODE,
      );
      expect(textNodes.length).toBe(1);
      expect(textNodes[0].textContent).toBe('hello @cin');
    });

    it('cleans up on unmount without errors', () => {
      const {textbox, unmount} = setupTriggerInput([createMentionTrigger()]);

      setCursorAfterText(textbox, '@');
      fireEvent.input(textbox);

      expect(() => unmount()).not.toThrow();
    });

    it('works with / command trigger', () => {
      const {textbox} = setupTriggerInput([createCommandTrigger()]);

      setCursorAfterText(textbox, '/');
      fireEvent.input(textbox);

      expect(textbox.getAttribute('aria-expanded')).toBe('true');
    });

    it('emits once when a string trigger result is selected', async () => {
      const {textbox, onChange} = setupTriggerInput([createCommandTrigger()]);

      setCursorAfterText(textbox, '/');
      fireEvent.input(textbox);
      await waitFor(() => {
        const menu = document.getElementById(
          textbox.getAttribute('aria-controls')!,
        );
        expect(
          menu?.querySelectorAll('[role="option"]').length ?? 0,
        ).toBeGreaterThan(0);
      });
      onChange.mockClear();

      fireEvent.keyDown(textbox, {key: 'Enter'});

      expect(textbox.textContent).toBe('/summarize ');
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('/summarize ');
    });
  });

  describe('trigger menu hover scrolling', () => {
    // Regression: the scroll-highlighted-item-into-view effect ran for
    // mouse-hover highlights too. A pointer resting near the bottom of the
    // menu kept scrolling: each scrollIntoView moved a new option under the
    // stationary cursor, whose mouseenter re-highlighted and scrolled again.
    // Hover must highlight only; keyboard navigation keeps its scrolling.
    function openMenu() {
      // jsdom does not implement scrollIntoView — install a spy directly.
      const original = Element.prototype.scrollIntoView;
      const spy = vi.fn();
      Element.prototype.scrollIntoView = spy;
      cleanupFns.push(() => {
        Element.prototype.scrollIntoView = original;
      });
      render(<ChatComposerInput triggers={[createMentionTrigger()]} />);
      const textbox = screen.getByRole('combobox');
      textbox.focus();
      const textNode = document.createTextNode('@');
      textbox.appendChild(textNode);
      const sel = window.getSelection()!;
      const range = document.createRange();
      range.setStart(textNode, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      fireEvent.input(textbox);
      expect(textbox.getAttribute('aria-expanded')).toBe('true');
      return {textbox, spy};
    }

    // The menu layer is a `[popover]` element; jsdom has no popover semantics
    // so testing-library's role queries see it as hidden. Query via
    // aria-controls instead.
    async function getMenuOptions(textbox: HTMLElement) {
      const listbox = await waitFor(() => {
        const el = document.getElementById(
          textbox.getAttribute('aria-controls')!,
        );
        const options = el?.querySelectorAll<HTMLElement>('[role="option"]');
        expect(options?.length ?? 0).toBeGreaterThan(1);
        return options!;
      });
      return Array.from(listbox);
    }

    const cleanupFns: (() => void)[] = [];

    afterEach(() => {
      cleanupFns.splice(0).forEach(fn => fn());
    });

    it('does not scroll when hover highlights an option', async () => {
      const {textbox, spy} = openMenu();
      const callsAfterOpen = spy.mock.calls.length;

      const options = await getMenuOptions(textbox);
      fireEvent.mouseEnter(options[1]);

      expect(options[1]).toHaveAttribute('aria-selected', 'true');
      expect(spy.mock.calls.length).toBe(callsAfterOpen);
    });

    it('still scrolls on keyboard navigation', async () => {
      const {textbox, spy} = openMenu();
      const callsAfterOpen = spy.mock.calls.length;

      await getMenuOptions(textbox);
      fireEvent.keyDown(textbox, {key: 'ArrowDown'});

      expect(spy.mock.calls.length).toBeGreaterThan(callsAfterOpen);
    });
  });
});

describe('ChatComposerInput trigger loading announcement (spec:AST-086)', () => {
  function typeAtEnd(editable: HTMLElement, text: string) {
    editable.textContent = text;
    const node = editable.firstChild!;
    const range = document.createRange();
    range.setStart(node, text.length);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.input(editable);
  }

  /**
   * Lets a settled search apply, as the browser would before the next frame,
   * then lets the loading announcement's two frames run.
   */
  async function nextFrame() {
    await act(async () => {});
    await act(async () => {
      for (let frame = 0; frame < 2; frame++) {
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    });
  }

  /** An async source whose searches resolve only when the test says so. */
  function createPendingSource() {
    const resolvers: ((items: SearchableItem[]) => void)[] = [];
    const source: SearchSource = {
      bootstrap: async () => [],
      search: async () =>
        new Promise<SearchableItem[]>(resolve => {
          resolvers.push(resolve);
        }),
    };
    return {source, resolvers};
  }

  beforeEach(() => {
    announce.mockClear();
  });

  it('shows the loading row without a live role (FR2)', () => {
    const {source} = createPendingSource();
    render(
      <ChatComposerInput
        triggers={[createMentionTrigger({searchSource: source})]}
        debounceMs={0}
      />,
    );
    const editable = screen.getByRole('combobox');
    editable.focus();
    typeAtEnd(editable, '@c');

    const row = screen.getByText('Searching…');
    expect(row).not.toHaveAttribute('role');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('announces the loading text once per search, not on every keystroke (FR2, FR6)', async () => {
    const {source, resolvers} = createPendingSource();
    render(
      <StrictMode>
        <ChatComposerInput
          triggers={[createMentionTrigger({searchSource: source})]}
          debounceMs={0}
        />
      </StrictMode>,
    );
    const editable = screen.getByRole('combobox');
    editable.focus();

    typeAtEnd(editable, '@c');
    await nextFrame();
    typeAtEnd(editable, '@ci');
    await nextFrame();
    expect(announce.mock.calls).toEqual([['Searching…', 'polite']]);

    await act(async () => {
      resolvers.forEach(resolve =>
        resolve([{id: 'cindy', label: 'Cindy Zhang'}]),
      );
    });
    expect(screen.queryByText('Searching…')).toBeNull();

    typeAtEnd(editable, '@cin');
    await nextFrame();
    expect(announce.mock.calls).toEqual([
      ['Searching…', 'polite'],
      ['Searching…', 'polite'],
    ]);
  });

  it('announces nothing for a synchronous source, whose results are already listed (FR7)', async () => {
    render(
      <ChatComposerInput triggers={[createMentionTrigger()]} debounceMs={0} />,
    );
    const editable = screen.getByRole('combobox');
    editable.focus();

    typeAtEnd(editable, '@c');
    await act(async () => {});
    typeAtEnd(editable, '@ci');
    await act(async () => {});

    // jsdom gives the popover no semantics, so query the menu by its id.
    const menu = document.getElementById(
      editable.getAttribute('aria-controls')!,
    );
    expect(menu?.querySelector('[role="option"]')).toHaveTextContent(
      'Cindy Zhang',
    );
    expect(screen.queryByText('Searching…')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it('announces nothing for a search that settles before the row shows (FR7)', async () => {
    const settled: SearchSource = {
      bootstrap: async () => [],
      search: async () => [{id: 'cindy', label: 'Cindy Zhang'}],
    };
    render(
      <ChatComposerInput
        triggers={[createMentionTrigger({searchSource: settled})]}
        debounceMs={0}
      />,
    );
    const editable = screen.getByRole('combobox');
    editable.focus();

    typeAtEnd(editable, '@c');
    await nextFrame();
    typeAtEnd(editable, '@ci');
    await nextFrame();

    expect(screen.queryByText('Searching…')).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  it("announces a trigger's own loadingText", async () => {
    const {source} = createPendingSource();
    render(
      <ChatComposerInput
        triggers={[
          createMentionTrigger({
            searchSource: source,
            loadingText: 'Looking up people…',
          }),
        ]}
        debounceMs={0}
      />,
    );
    const editable = screen.getByRole('combobox');
    editable.focus();
    typeAtEnd(editable, '@c');
    await nextFrame();

    expect(announce.mock.calls).toEqual([['Looking up people…', 'polite']]);
  });
});
