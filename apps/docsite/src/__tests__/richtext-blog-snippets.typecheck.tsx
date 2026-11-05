// Copyright (c) Meta Platforms, Inc. and affiliates.

// The code samples in the "Introducing Astryx RichText" blog post
// (src/content/blog/posts/introducing-astryx-richtext.md), kept here so
// `pnpm typecheck` fails if the published API they show changes.

import {RichTextEditor, RichTextEditorToolbar} from '@astryxdesign/richtext';
import {
  editorStateJSONToMarkdown,
  markdownToEditorStateJSON,
} from '@astryxdesign/richtext/markdown';

declare function save(value: string): void;
declare const markdown: string;

export function ReleaseNotesField() {
  return (
    <RichTextEditor
      label="Release notes"
      description="Capture formatted context for your team."
      toolbar={<RichTextEditorToolbar />}
      onChange={editorState => save(JSON.stringify(editorState.toJSON()))}
    />
  );
}

export function roundTrip(): boolean {
  const editorState = markdownToEditorStateJSON(markdown); // pass to defaultValue
  return editorStateJSONToMarkdown(editorState) === markdown;
}
