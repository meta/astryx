// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdown.ts
 * @output Server-safe entry `@astryxdesign/richtext/markdown`: the Markdown
 *   serializers, createRichTextExtension, RichTextExtensionError, and their
 *   types.
 * @position Imports no React, DOM, or client-only module, so server and Node
 *   code converts Markdown and adopts plugins here (spec:AST-064 FR3, FR12).
 *   The package's main entry is a client module and re-exports all of this
 *   for client code. An extension holds its plugin's functions, so it is not
 *   serializable: create the extensions a page passes to the surfaces in a
 *   client module, and create your own for headless use.
 */

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
