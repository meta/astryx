// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BlogPostBody.tsx
 * A blog post's Markdown body. Every heading gets a stable id and the
 * hover-revealed copy-link control (createMarkdownHeadingLinks), and every
 * `tsx live` fence runs as a sandboxed live example (spec:AST-033 FR22).
 *
 * The plugin list is created here, in the client module, because a Markdown
 * plugin is a registered handle: passed from the server-rendered BlogArticle
 * it would be serialized into a plain object that Markdown no longer
 * recognizes, and the plugin would silently not run.
 */

import {useMemo} from 'react';
import {Markdown} from '@astryxdesign/core/Markdown';
import {
  createMarkdownFenceTransform,
  createMarkdownHeadingLinks,
  createMarkdownPlugin,
  type MarkdownExtensionNode,
} from '@astryxdesign/core/Markdown/plugins';
import {MarkdownImage} from './ThemedImage';
import {LiveExampleFrame} from './LiveExampleFrame';
import {
  isLiveBlockMeta,
  LIVE_BLOCK_LANGUAGE,
} from '../../lib/blog/liveBlocks.mjs';
import css from './BlogPostBody.module.css';

// One post per page, so ids are unprefixed and match each heading's own text.
const headingLinks = createMarkdownHeadingLinks();

type LiveExampleNode = MarkdownExtensionNode<
  'live-examples',
  'live-example',
  {readonly code: string},
  'block'
>;

/**
 * Claims each `tsx live` fence; any other `tsx` fence keeps Markdown's
 * ordinary code block. Its text form is the source, so copy and plain-text
 * projections show the example's code.
 */
function createLiveExamples(post: string) {
  return createMarkdownPlugin<'live-examples', LiveExampleNode>({
    name: 'live-examples',
    apiVersion: 1,
    transform: createMarkdownFenceTransform({
      languages: [LIVE_BLOCK_LANGUAGE],
      createNode: ({code, meta}) =>
        isLiveBlockMeta(meta)
          ? {
              type: 'extension',
              plugin: 'live-examples',
              name: 'live-example',
              display: 'block',
              data: {code},
            }
          : null,
    }),
    renderers: {
      'live-example': {
        render: ({node}) => (
          <LiveExampleFrame code={node.data.code} post={post} />
        ),
        toText: node => node.data.code,
      },
    },
  });
}

export interface BlogPostBodyProps {
  /** Markdown body (frontmatter stripped). */
  body: string;
  /** The post's slug: its live examples resolve only its own assets. */
  slug: string;
}

export function BlogPostBody({body, slug}: BlogPostBodyProps) {
  const plugins = useMemo(
    () => [headingLinks, createLiveExamples(slug)],
    [slug],
  );
  return (
    <div className={css.body}>
      <Markdown
        headingLevelStart={2}
        contentWidth="100%"
        components={{image: MarkdownImage}}
        plugins={plugins}>
        {body}
      </Markdown>
    </div>
  );
}
