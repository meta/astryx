// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

import {RichTextEditor, RichTextEditorToolbar} from '@astryxdesign/richtext';

export default function RichTextEditorShowcase() {
  return (
    <div style={{width: 480, maxWidth: '100%'}}>
      <RichTextEditor
        label="Release notes"
        description="Capture formatted context for your team."
        placeholder="Write an update…"
        toolbar={<RichTextEditorToolbar />}
        minHeight={112}
      />
    </div>
  );
}
