// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file headingProjection.ts
 * @input A transformed Markdown AST and prepared plugins
 * @output Released heading identity plus narrow first-party module composition
 * @position Internal Markdown/Outline heading projection seam
 */

import {markdownAstText} from './ast';
import type {MarkdownAstHeading, MarkdownAstRoot} from './ast';
import {slugify, uniqueSlug} from './parser';
import {projectMarkdownHeadingLinks} from './plugins/headingLinks';
import {markdownExtensionText} from './plugins/protocol';
import type {
  MarkdownExtensionNode,
  PreparedMarkdownPlugins,
} from './plugins/protocol';
import type {OutlineItem} from '../Outline/types';

type Heading = MarkdownAstHeading<MarkdownExtensionNode>;

export interface MarkdownHeadingProjection {
  /** Headings with generated ids. */
  readonly ids: ReadonlyMap<Heading, string>;
  /** Plain-text labels for generated headings. */
  readonly labels: ReadonlyMap<Heading, string>;
  /** Canonical permalink URL copied by the first-party module, absent by default. */
  readonly permalinkUrls: ReadonlyMap<Heading, string>;
  /** Root headings only, preserving the released Outline scope. */
  readonly outline: ReadonlyArray<OutlineItem>;
}

/** Project ids once after every Markdown transform has run. */
export function projectMarkdownHeadings(
  root: MarkdownAstRoot<MarkdownExtensionNode>,
  preparedPlugins?: PreparedMarkdownPlugins,
): MarkdownHeadingProjection {
  const rootHeadings = root.children.filter(
    (node): node is Heading => node.type === 'heading',
  );
  const headingLinks = projectMarkdownHeadingLinks(root, preparedPlugins);

  if (headingLinks != null) {
    return {
      ...headingLinks,
      outline: rootHeadings.map(heading => {
        const id = headingLinks.ids.get(heading);
        const label = headingLinks.labels.get(heading);
        if (id == null || label == null) {
          throw new Error('Heading-links projection omitted a root heading');
        }
        return {id, label, level: heading.depth};
      }),
    };
  }

  const ids = new Map<Heading, string>();
  const labels = new Map<Heading, string>();
  const counts = new Map<string, number>();
  const outline = rootHeadings.map(heading => {
    const label = markdownAstText(heading.children, node =>
      markdownExtensionText(preparedPlugins, node),
    ).trim();
    const id = uniqueSlug(slugify(label), counts);
    ids.set(heading, id);
    labels.set(heading, label);
    return {id, label, level: heading.depth};
  });

  return {ids, labels, permalinkUrls: new Map(), outline};
}
