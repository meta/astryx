// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CodeEditor.test.tsx
 * @input Uses vitest, @testing-library/react, @testing-library/user-event, CodeEditor
 * @output Unit tests for CodeEditor accessibility and keyboard behavior
 * @position Testing; validates CodeEditor.tsx implementation
 *
 * SYNC: When CodeEditor.tsx changes, update tests to match new behavior
 */

import {describe, it, expect, vi} from 'vitest';
import {render, screen, fireEvent} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CodeEditor} from './CodeEditor';

/** Place a collapsed caret at a character offset inside the editor. */
function setCaret(el: HTMLElement, offset: number) {
  const sel = window.getSelection();
  const range = document.createRange();
  const node = el.firstChild;
  if (node && node.nodeType === Node.TEXT_NODE) {
    range.setStart(node, offset);
  } else {
    range.setStart(el, 0);
  }
  range.collapse(true);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function renderEditor(value = '', props: {escapeHint?: string} = {}) {
  const onChange = vi.fn();
  render(
    <div>
      <button>before</button>
      <CodeEditor
        value={value}
        onChange={onChange}
        language="typescript"
        label="Edit snippet"
        {...props}
      />
      <button>after</button>
    </div>,
  );
  const editor = screen.getByRole('textbox', {name: 'Edit snippet'});
  editor.focus();
  setCaret(editor, value.length);
  return {editor, onChange};
}

describe('CodeEditor', () => {
  it('keeps the code left-to-right inside a right-to-left page', () => {
    render(
      <div dir="rtl">
        <CodeEditor label="Code" value="const a = 1;" onChange={() => {}} />
      </div>,
    );
    const editor = screen.getByRole('textbox', {name: 'Code'});
    expect(editor.closest('[dir]')).toHaveAttribute('dir', 'ltr');
  });

  it('uses the label prop as the accessible name', () => {
    render(
      <CodeEditor
        value=""
        onChange={() => {}}
        language="typescript"
        label="Edit snippet"
      />,
    );
    expect(
      screen.getByRole('textbox', {name: 'Edit snippet'}),
    ).toBeInTheDocument();
  });

  it('advertises the Escape-then-Tab escape via aria-describedby', () => {
    const {editor} = renderEditor();
    const hintId = editor.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    const hint = document.getElementById(hintId as string);
    expect(hint).toHaveTextContent(
      'Press Escape then Tab to move focus out of the editor.',
    );
  });

  it('supports overriding the escape hint text', () => {
    const {editor} = renderEditor('', {escapeHint: 'Échap puis Tab'});
    const hintId = editor.getAttribute('aria-describedby');
    const hint = document.getElementById(hintId as string);
    expect(hint).toHaveTextContent('Échap puis Tab');
  });

  it('Tab inserts two spaces by default and keeps focus in the editor', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor();

    await user.keyboard('{Tab}');

    expect(onChange).toHaveBeenCalledWith('  ');
    expect(document.activeElement).toBe(editor);
  });

  it('Escape then Tab moves focus out of the editor without indenting', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor();

    await user.keyboard('{Escape}{Tab}');

    expect(document.activeElement).not.toBe(editor);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Escape then Shift+Tab lets the browser move focus backward', async () => {
    // user-event cannot compute a backward tab destination from a
    // contenteditable element in jsdom, so assert on the preventDefault
    // contract: an unprevented Shift+Tab keydown means the browser performs
    // its native backward focus move.
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor();

    await user.keyboard('{Escape}');
    fireEvent.keyDown(editor, {key: 'Shift'});
    const notPrevented = fireEvent.keyDown(editor, {
      key: 'Tab',
      shiftKey: true,
    });

    expect(notPrevented).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tab-moves-focus mode is one-shot: the following Tab indents again', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor();

    await user.keyboard('{Escape}{Tab}');
    expect(document.activeElement).not.toBe(editor);

    editor.focus();
    setCaret(editor, 0);
    await user.keyboard('{Tab}');

    expect(onChange).toHaveBeenCalledWith('  ');
    expect(document.activeElement).toBe(editor);
  });

  it('typing after Escape re-arms Tab indentation', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor();

    await user.keyboard('{Escape}');
    // Any non-modifier key re-arms indentation mode.
    fireEvent.keyDown(editor, {key: 'a'});
    await user.keyboard('{Tab}');

    expect(document.activeElement).toBe(editor);
    expect(onChange).toHaveBeenCalledWith('  ');
  });

  it('Shift+Tab outdents the current line in normal mode', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor('  const x = 1;');

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(onChange).toHaveBeenCalledWith('const x = 1;');
    expect(document.activeElement).toBe(editor);
  });

  it('Shift+Tab removes a single leading space when only one exists', async () => {
    const user = userEvent.setup();
    const {onChange} = renderEditor(' const x = 1;');

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(onChange).toHaveBeenCalledWith('const x = 1;');
  });

  it('Shift+Tab on an unindented line changes nothing and keeps focus', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor('const x = 1;');

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
  });

  it('Shift+Tab outdents only the current line in multi-line code', async () => {
    const user = userEvent.setup();
    const {editor, onChange} = renderEditor('  a;\n  b;');
    // Caret on the second line (offset 7 = inside "  b;").
    setCaret(editor, 7);

    await user.keyboard('{Shift>}{Tab}{/Shift}');

    expect(onChange).toHaveBeenCalledWith('  a;\nb;');
  });

  it('exposes an explicit tabindex so scrollable editors count as focusable content', () => {
    // contenteditable is not on axe's natively-focusable whitelist, and axe
    // reads the tabindex ATTRIBUTE (not the browser's effective tabIndex),
    // so the scrollable editorContainer only passes scrollable-region-focusable
    // when the <code> editor materializes tabindex="0" explicitly.
    render(
      <CodeEditor
        value={Array.from({length: 30}, (_, i) => `line ${i + 1};`).join('\n')}
        onChange={() => {}}
        language="typescript"
        label="Edit snippet"
        maxHeight={200}
      />,
    );
    expect(screen.getByRole('textbox', {name: 'Edit snippet'})).toHaveAttribute(
      'tabindex',
      '0',
    );
  });

  it('keeps read-only editors keyboard-focusable, like a readonly textarea', () => {
    render(
      <CodeEditor
        value="const x = 1;"
        onChange={() => {}}
        language="typescript"
        label="Edit snippet"
        isReadOnly
      />,
    );
    expect(screen.getByRole('textbox', {name: 'Edit snippet'})).toHaveAttribute(
      'tabindex',
      '0',
    );
  });
});
