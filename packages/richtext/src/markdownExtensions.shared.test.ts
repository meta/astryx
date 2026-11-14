// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file markdownExtensions.shared.test.ts
 * @input Two loads of markdownExtensions.ts, as the package and a swizzled
 *   RichTextEditor or RichTextView copy each carry one
 * @output Proves a copy reads the plugin of an extension the package's
 *   createRichTextExtension made, and the reverse
 * @position Shared-brand test for markdownExtensions.ts (spec:AST-110 FR3)
 */

import {describe, expect, it, vi} from 'vitest';
import {
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';

type MentionNode = MarkdownExtensionNode<
  'mentions',
  'mention',
  {readonly label: string},
  'inline'
>;

const mentions = createMarkdownPlugin<'mentions', MentionNode>({
  name: 'mentions',
  apiVersion: 1,
  parseKey: 'v1',
  syntax: {
    inline: [
      {
        startsWith: ['@{'],
        maxSpan: 80,
        tokenize({source, offset, end}) {
          const close = source.indexOf('}', offset + 2);
          if (close < 0 || close >= end) {
            return {status: 'no-match'};
          }
          return {
            status: 'match',
            end: close + 1,
            node: {
              type: 'extension',
              plugin: 'mentions',
              name: 'mention',
              display: 'inline',
              data: {label: source.slice(offset + 2, close)},
            },
          };
        },
      },
    ],
  },
  renderers: {
    mention: {
      render: () => null,
      toText: node => `@${node.data.label}`,
    },
  },
});

/** One load of the module, as the package or a copy has. */
async function load() {
  vi.resetModules();
  return import('./markdownExtensions');
}

describe('markdown extensions shared by the package and a swizzled copy', () => {
  it("reads the plugin of an extension the package's createRichTextExtension made", async () => {
    const pkg = await load();
    const copy = await load();
    const extension = pkg.createRichTextExtension(mentions);
    // A swizzled editor reads the extensions the product passes it with its
    // own copy of this module.
    expect(copy.pluginsOf([extension], [])).toEqual([mentions]);
    expect(pkg.pluginsOf([copy.createRichTextExtension(mentions)], [])).toEqual(
      [mentions],
    );
    // The brand is required, so a hand-built object is not an extension.
    // @ts-expect-error -- `{name}` lacks the extension's brand.
    const handBuilt: typeof extension = {name: 'mentions'};
    expect(copy.pluginsOf([handBuilt], [])).toEqual([undefined]);
  });
});
