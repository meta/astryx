// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file semanticFence.shared.test.tsx
 * @input A fence plugin made with one load of the plugin modules, rendered by
 *   a second load of Markdown, as a product does with a swizzled Markdown
 * @output Proves a copied Markdown renders the fence as the plugin's node, not
 *   as a plain code block
 * @position Shared-key test for semanticFence.ts (spec:AST-110 FR3)
 */

import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {MarkdownExtensionNode} from './protocol';

type DiagramNode = MarkdownExtensionNode<
  'diagram-fences',
  'diagram',
  {readonly code: string},
  'block'
>;

afterEach(() => {
  vi.resetModules();
});

describe('a fence plugin from the package in a swizzled Markdown', () => {
  it('renders the fence as the plugin node', async () => {
    vi.resetModules();
    const {createMarkdownPlugin} = await import('./protocol');
    const {createMarkdownFenceTransform} = await import('./semanticFence');
    const plugin = createMarkdownPlugin<'diagram-fences', DiagramNode>({
      name: 'diagram-fences',
      apiVersion: 1,
      transform: createMarkdownFenceTransform({
        languages: ['diagram'],
        createNode: context => ({
          type: 'extension',
          plugin: 'diagram-fences',
          name: 'diagram',
          display: 'block',
          data: {code: context.code},
        }),
      }),
      renderers: {
        diagram: {
          render: ({node}) => <figure>Diagram: {node.data.code}</figure>,
          toText: node => node.data.code,
        },
      },
    });
    vi.resetModules();
    const {Markdown} = await import('../Markdown');
    render(
      <Markdown plugins={[plugin]}>{'```diagram\nA --> B\n```'}</Markdown>,
    );
    expect(screen.getByText('Diagram: A --> B')).toBeInTheDocument();
  });
});
