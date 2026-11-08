// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file publicSurface.test.ts
 * @input The package entry, packages/richtext/src/index.ts
 * @output Pins the runtime exports of @astryxdesign/richtext to the list
 *   spec:AST-061/DEC-8 admits, and the internals it keeps out of the entry.
 * @position Package-level contract test.
 */

import {describe, expect, it} from 'vitest';
// @ts-expect-error Transformer is Lexical's type; import it from @lexical/markdown.
import type {Transformer as _NotReExported} from './index';
import * as richtext from './index';

describe('@astryxdesign/richtext public surface', () => {
  it('exports exactly what a caller builds with', () => {
    expect(Object.keys(richtext).sort()).toEqual(
      [
        'DEFAULT_LINK_MATCHERS',
        'NEW_TAB_LINK_ATTRIBUTES',
        'RICHTEXT_ICON_KEYS',
        'RichTextEditor',
        'RichTextEditorAutoLinkPlugin',
        'RichTextEditorToolbar',
        'RichTextExtensionError',
        'RichTextView',
        'createRichTextExtension',
        'editorStateJSONToMarkdown',
        'markdownToEditorStateJSON',
        'sanitizeUrl',
        'validateUrl',
      ].sort(),
    );
  });

  it('keeps the editor theme classes and autolink patterns internal', () => {
    for (const name of ['sharedEditorTheme', 'URL_MATCHER', 'EMAIL_MATCHER']) {
      expect(richtext).not.toHaveProperty(name);
    }
  });
});
