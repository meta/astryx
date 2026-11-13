// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Blog post headings carry copy-link anchors.
 *
 * Renders a real post through BlogArticle the way the static build does
 * (server markup) and checks that each post heading gets the id a reader
 * would link to, plus the heading-links copy control beside it.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import {BlogArticle} from '../components/blog/BlogArticle';
import type {BlogPost} from '../lib/blog/schema';
import {discoverPosts} from '../lib/blog/posts.mjs';

// The docsite's own StyleX is compiled by its Babel build, not by Vitest.
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
  firstThatWorks: <T,>(...values: T[]) => values[0],
  defineMarker: () => ({}),
  defineConsts: <T,>(values: T) => values,
  defineVars: <T,>(values: T) => values,
  keyframes: () => 'keyframes',
  when: {ancestor: () => ':hover', descendant: () => ':hover'},
}));

const POSTS_DIR = path.resolve(__dirname, '../content/blog/posts');
const RELEASE_POST_SLUG = 'astryx-v0-6-0';

function renderPost(slug: string): string {
  const post = (discoverPosts(POSTS_DIR) as BlogPost[]).find(
    p => p.slug === slug,
  );
  if (post == null) {
    throw new Error(`missing post ${slug}`);
  }
  return renderToStaticMarkup(<BlogArticle post={post} />);
}

/** Each post heading in the markup: its id, its text, and what follows it. */
function postHeadings(html: string) {
  return Array.from(
    html.matchAll(
      /<h([2-6]) id="([^"]+)" class="astryx-markdown-heading"[^>]*>([^<]*)<\/h\1>([\s\S]{0,600})/g,
    ),
    ([, , id, text, after]) => ({id, text, after}),
  );
}

describe('blog post headings', () => {
  it('give every section heading the id a reader links to and a copy-link control', () => {
    const headings = postHeadings(renderPost(RELEASE_POST_SLUG));
    expect(headings.map(h => h.id)).toEqual(
      expect.arrayContaining([
        'themes-respond-in-css',
        'migrate-to-0-6-0',
        'thank-you',
      ]),
    );
    for (const heading of headings) {
      expect(heading.after).toContain(
        `aria-label="Copy link to ${heading.text}"`,
      );
    }
  });

  it('keep ids unique across the post', () => {
    const ids = Array.from(
      renderPost(RELEASE_POST_SLUG).matchAll(/\bid="([^"]+)"/g),
      m => m[1],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('create the heading-links plugin in a client module, never in the server-rendered article', () => {
    // A plugin passed from a Server Component to the client Markdown arrives
    // as a plain object and silently does nothing.
    const read = (file: string) =>
      fs.readFileSync(
        path.resolve(__dirname, '../components/blog', file),
        'utf8',
      );
    const body = read('BlogPostBody.tsx');
    expect(body).toMatch(/^(\/\/[^\n]*\n|\s)*'use client';/);
    expect(body).toContain('createMarkdownHeadingLinks(');
    expect(read('BlogArticle.tsx')).not.toMatch(
      /Markdown\/plugins|createMarkdownHeadingLinks/,
    );
  });
});
