// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Markdown.remarkPlugins.tsx
 * @input Synchronous transform-only Remark plugins in Unified's attacher shape
 * @output Storybook-only adapted plugins: two compatible, two outside the profile
 * @position Documentation fixtures for the limited Remark compatibility profile
 */

import remarkBreaks from 'remark-breaks';
import {
  createMarkdownPlugin,
  createMarkdownTextTransform,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {createMarkdownRemarkTransform} from '@astryxdesign/core/Markdown/remark';
import type {MarkdownRemarkPlugin} from '@astryxdesign/core/Markdown/remark';

type DemoNode = {
  type: string;
  children?: DemoNode[];
  [key: string]: unknown;
};

function walk(node: DemoNode, visitor: (node: DemoNode) => void): void {
  visitor(node);
  for (const entry of [...(node.children ?? [])]) {
    walk(entry, visitor);
  }
}

const SPEC_PATTERN = /\bSPEC-\d+\b/;

/**
 * Compatible: turns `SPEC-1234` prose into a link. Astryx still owns the
 * destination, so the rendered link goes through the same navigation policy as
 * an authored one. Prose already claimed by another plugin never reaches it.
 */
const remarkSpecLinks: MarkdownRemarkPlugin<[{basePath: string}]> =
  ({basePath}) =>
  tree => {
    walk(tree as unknown as DemoNode, node => {
      if (node.children == null || node.type === 'link') {
        return;
      }
      node.children = node.children.flatMap(entry => {
        if (entry.type !== 'text' || typeof entry.value !== 'string') {
          return [entry];
        }
        const parts = entry.value.split(
          new RegExp(`(${SPEC_PATTERN.source})`, 'g'),
        );
        if (parts.length === 1) {
          return [entry];
        }
        return parts
          .filter(part => part !== '')
          .map(part =>
            new RegExp(`^${SPEC_PATTERN.source}$`).test(part)
              ? {
                  type: 'link',
                  url: `${basePath}/${part.slice('SPEC-'.length)}`,
                  title: null,
                  children: [{type: 'text', value: part}],
                }
              : {type: 'text', value: part},
          );
      });
    });
  };

/** Outside the profile: raw HTML has no Astryx representation. */
const remarkRawHtml: MarkdownRemarkPlugin = () => tree => {
  (tree as unknown as DemoNode).children?.push({
    type: 'html',
    value: '<button onclick="alert(1)">Injected</button>',
  });
};

/** Outside the profile: the navigation owner rejects the destination. */
const remarkUnsafeLinks: MarkdownRemarkPlugin = () => tree => {
  walk(tree as unknown as DemoNode, node => {
    if (node.type === 'link') {
      node.url = 'javascript:alert(1)';
    }
  });
};

type SpecBadgeNode = MarkdownExtensionNode<
  'demo-spec-badges',
  'badge',
  {readonly label: string},
  'inline'
>;

/**
 * Native counterpart claiming the same prose as `remarkSpecLinks`, so the two
 * compete for one input and the ordered list decides which one gets it.
 */
export const specBadgePlugin = createMarkdownPlugin<
  'demo-spec-badges',
  SpecBadgeNode
>({
  name: 'demo-spec-badges',
  apiVersion: 1,
  transform: createMarkdownTextTransform<SpecBadgeNode>({
    pattern: new RegExp(SPEC_PATTERN.source, 'g'),
    requiredSubstrings: ['SPEC-'],
    replace: match => ({
      type: 'extension',
      plugin: 'demo-spec-badges',
      name: 'badge',
      display: 'inline',
      data: {label: match[0]},
    }),
  }),
  renderers: {
    badge: {
      render: ({node}) => <mark data-spec-badge>{node.data.label}</mark>,
      toText: node => node.data.label,
    },
  },
});

export const remarkBreaksPlugin = createMarkdownPlugin({
  name: 'demo-remark-breaks',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkBreaks),
});

export const remarkSpecLinkPlugin = createMarkdownPlugin({
  name: 'demo-remark-spec-links',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkSpecLinks, {
    basePath: '/specs',
  }),
});

export const remarkRawHtmlPlugin = createMarkdownPlugin({
  name: 'demo-remark-raw-html',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkRawHtml),
});

export const remarkUnsafeLinkPlugin = createMarkdownPlugin({
  name: 'demo-remark-unsafe-links',
  apiVersion: 1,
  transform: createMarkdownRemarkTransform(remarkUnsafeLinks),
});
