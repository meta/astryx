// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownSerializers.ts
 * @input Uses @lexical/headless (createHeadlessEditor), @lexical/markdown
 *   (transformer types), the shared DEFAULT_NODES set, DEFAULT_TRANSFORMERS,
 *   and the source-preserving import and export in markdownSource.ts.
 * @output Standalone Markdown <-> serialized EditorState helpers:
 *   markdownToEditorStateJSON, editorStateJSONToMarkdown.
 * @position Exported from the server-safe `@astryxdesign/richtext/markdown`
 *   entry and re-exported from the @astryxdesign/richtext barrel. Complements the ref's getMarkdown() by working WITHOUT a mounted
 *   editor (e.g. to produce a `defaultValue` from Markdown on the server).
 *
 * SYNC: When modified, update:
 * - /packages/richtext/src/index.ts (exports)
 * - /packages/richtext/src/RichTextEditor.doc.mjs (usage notes)
 * - /packages/richtext/src/RichTextEditor.test.tsx (tests)
 *
 * NOTE: `@lexical/headless`, `@lexical/markdown`, and `lexical` are OPTIONAL
 * peer dependencies. Install them to use these helpers. `@lexical/headless`
 * runs Lexical without a DOM, so these work in Node / SSR contexts.
 */

import {createHeadlessEditor} from '@lexical/headless';
import {type Transformer} from '@lexical/markdown';
import {DEFAULT_NODES} from './editorNodes';
import {
  $exportMarkdownKeepingSource,
  importMarkdownKeepingSource,
} from './markdownSource';
import {DEFAULT_TRANSFORMERS} from './markdownTable';
import {pluginsOf, type RichTextMarkdownExtension} from './markdownExtensions';
import type {Klass, LexicalNode} from 'lexical';

/** Options shared by the Markdown serializer helpers. */
export interface MarkdownSerializerOptions {
  /**
   * Markdown transformers to use. Defaults to the editor's default set: the
   * standard `@lexical/markdown` `TRANSFORMERS` plus GFM tables. Pass the same
   * array you give `RichTextEditor`'s `transformers` prop so content
   * round-trips consistently.
   */
  transformers?: ReadonlyArray<Transformer>;
  /**
   * Extra Lexical nodes to register beyond the default OSS set, mirroring the
   * editor's `nodes` prop. Required for custom node types to serialize.
   */
  nodes?: ReadonlyArray<Klass<LexicalNode>>;
  /**
   * Markdown plugins to recognize, each adopted with `createRichTextExtension`
   * (spec:AST-064). Their syntax becomes extension nodes holding its exact
   * source; without them, plugin syntax stays text. Pass the same extensions
   * the surfaces that show the document use.
   */
  extensions?: ReadonlyArray<RichTextMarkdownExtension>;
}

function createSerializerEditor(nodes?: ReadonlyArray<Klass<LexicalNode>>) {
  return createHeadlessEditor({
    namespace: 'astryx-editor-serializer',
    nodes: nodes ? [...DEFAULT_NODES, ...nodes] : [...DEFAULT_NODES],
    onError(error: Error) {
      throw error;
    },
  });
}

/**
 * Convert a Markdown string to a serialized Lexical `EditorState` JSON string
 * — the same shape `RichTextEditor`'s `defaultValue` expects. Runs headless
 * (no DOM), so it is safe in Node / SSR.
 *
 * @example
 * ```
 * const value = markdownToEditorStateJSON('# Title\n\nHello');
 * <RichTextEditor label="Notes" defaultValue={value} />
 * ```
 */
export function markdownToEditorStateJSON(
  markdown: string,
  options: MarkdownSerializerOptions = {},
): string {
  const {transformers = DEFAULT_TRANSFORMERS, nodes, extensions = []} = options;
  const plugins = pluginsOf(extensions, transformers);
  const editor = createSerializerEditor(nodes);
  importMarkdownKeepingSource(editor, markdown, [...transformers], plugins);
  return JSON.stringify(editor.getEditorState().toJSON());
}

/**
 * Convert a serialized Lexical `EditorState` JSON string (e.g. the value
 * produced by `RichTextEditor`'s `onChange` or `defaultValue`) to a Markdown
 * string. Runs headless (no DOM), so it is safe in Node / SSR.
 *
 * @example
 * ```
 * const md = editorStateJSONToMarkdown(savedJson);
 * ```
 */
export function editorStateJSONToMarkdown(
  editorStateJSON: string,
  options: MarkdownSerializerOptions = {},
): string {
  const {transformers = DEFAULT_TRANSFORMERS, nodes} = options;
  const editor = createSerializerEditor(nodes);
  const state = editor.parseEditorState(editorStateJSON);
  return state.read(() => $exportMarkdownKeepingSource([...transformers]));
}
