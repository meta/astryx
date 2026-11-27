// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file RichTextEditor.extensions.test.tsx
 * @input Uses lexical (defineExtension, createCommand), @lexical/react
 * @output Proves the `extensions` prop reaches the editor Lexical builds,
 *   which is the only route an extension-shaped collaborative binding has.
 * @position Unit test for the RichTextEditor extension point.
 */

import {afterEach, describe, expect, test} from 'vitest';
import {cleanup, render, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import {
  COMMAND_PRIORITY_EDITOR,
  createCommand,
  defineExtension,
  type LexicalCommand,
  type LexicalEditor,
} from 'lexical';

import {RichTextEditor, type RichTextEditorRef} from './RichTextEditor';

afterEach(cleanup);

const PING: LexicalCommand<string> = createCommand('PING');

/**
 * An extension cannot be a React child of the editor: it is read while the
 * editor is built, before any child renders. This one records that it was
 * built in, and handles a command, so a test can tell the difference between
 * "the prop was accepted" and "the extension is part of this editor".
 */
function recordingExtension(log: string[]) {
  return defineExtension({
    name: 'test/recording',
    register(editor: LexicalEditor) {
      log.push('registered');
      return editor.registerCommand(
        PING,
        payload => {
          log.push(`ping:${payload}`);
          return true;
        },
        COMMAND_PRIORITY_EDITOR,
      );
    },
  });
}

describe('RichTextEditor extensions', () => {
  test('a host extension is built into the editor', async () => {
    const log: string[] = [];
    const editorRef = createRef<RichTextEditorRef | null>();

    render(
      <RichTextEditor
        label="Editor with an extension"
        ref={editorRef}
        extensions={[recordingExtension(log)]}
      />,
    );

    await waitFor(() => expect(editorRef.current?.getEditor()).toBeTruthy());
    expect(log).toContain('registered');

    // Registered against this editor, not merely constructed.
    editorRef.current!.getEditor().dispatchCommand(PING, 'one');
    expect(log).toContain('ping:one');
  });

  test('the editor keeps its own extensions when a host adds one', async () => {
    const log: string[] = [];
    const r = render(
      <RichTextEditor
        label="Editor with an extension"
        extensions={[recordingExtension(log)]}
      />,
    );

    // The editing surface still comes up, so the host's extension was
    // appended to the editor's own dependencies rather than replacing them.
    await waitFor(() => expect(r.getByRole('textbox')).toBeDefined());
    expect(log).toContain('registered');
  });

  test('no extensions prop leaves the editor as it was', async () => {
    const r = render(<RichTextEditor label="Plain editor" />);
    await waitFor(() => expect(r.getByRole('textbox')).toBeDefined());
  });
});
