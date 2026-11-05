// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @input Imports RichTextEditor and RichTextView components and their types
 * @output Public API surface for @astryxdesign/richtext
 * @position Package entry point (barrel) for @astryxdesign/richtext — the
 *   Lexical-based rich text editor and viewer, promoted out of
 *   @astryxdesign/lab so it can be canaried independently.
 *
 * Exports only what a caller builds with (spec:AST-061/DEC-8): the generated
 * editor theme classes and the autolink regular expressions stay internal,
 * and Lexical's `Transformer` type comes from `@lexical/markdown`.
 * `publicSurface.test.ts` holds the runtime list.
 *
 * SYNC: When modified, update this header, /packages/richtext/README.md,
 *   /packages/richtext/src/publicSurface.test.ts, and the editor component doc
 *   files.
 */

export {RichTextEditor} from './RichTextEditor';
export type {
  RichTextEditorProps,
  RichTextEditorRef,
  RichTextEditorStatus,
  RichTextEditorStatusType,
  RichTextEditorSize,
} from './RichTextEditor';

export {RichTextView} from './RichTextView';
export type {RichTextViewProps} from './RichTextView';

export {
  markdownToEditorStateJSON,
  editorStateJSONToMarkdown,
} from './markdownSerializers';
export type {MarkdownSerializerOptions} from './markdownSerializers';
export {
  createRichTextExtension,
  RichTextExtensionError,
} from './markdownExtensions';
export type {RichTextMarkdownExtension} from './markdownExtensions';

export {
  RichTextEditorToolbar,
  RICHTEXT_ICON_KEYS,
} from './RichTextEditorToolbar';
export type {RichTextEditorToolbarProps} from './RichTextEditorToolbar';

export {
  RichTextEditorAutoLinkPlugin,
  DEFAULT_LINK_MATCHERS,
  NEW_TAB_LINK_ATTRIBUTES,
} from './RichTextEditorAutoLinkPlugin';
export type {RichTextEditorAutoLinkPluginProps} from './RichTextEditorAutoLinkPlugin';

export {sanitizeUrl, validateUrl} from './linkUtils';
