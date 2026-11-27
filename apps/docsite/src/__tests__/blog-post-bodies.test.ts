// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file blog-post-bodies.test.ts
 * @input The generated blog registry and post bodies, the posts on disk, the
 *   blog index page, the article page and the plain-text route
 * @output Proof that the blog registry and the blog index hold no post body,
 *   and that the article page and the plain-text route show each post's own
 *   body
 * @position Build-time docsite data verification. The build's
 *   check-server-text-bundle.mjs proves that no browser script holds a body.
 * Run: pnpm -F @astryxdesign/docsite test
 */

import * as path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import BlogPostPage from '../app/blog/[slug]/page';
import BlogIndexPage from '../app/blog/page';
import {GET as getPlainText} from '../app/blog/txt/[slug]/route';
import {blogFixturePosts, blogPosts} from '../generated/blogRegistry';
import {toStaticLiveBlocks} from '../lib/blog/liveBlocks.mjs';
import {withBody} from '../lib/blog/postBodies';
import {discoverPosts} from '../lib/blog/posts.mjs';
import type {BlogPost} from '../lib/blog/schema';

// The article and the index use StyleX, which this suite does not compile.
// The test reads the props that each page gives its view.
vi.mock('../components/blog/BlogArticle', () => ({BlogArticle: () => null}));
vi.mock('../components/blog/BlogIndex', () => ({BlogIndex: () => null}));

const CONTENT_DIR = path.resolve(__dirname, '../content/blog');

/** Each post and fixture as the generator reads it from its Markdown file. */
const onDisk = new Map(
  ['posts', 'fixtures']
    .flatMap(
      dir =>
        discoverPosts(path.join(CONTENT_DIR, dir), {
          includeDrafts: true,
        }) as BlogPost[],
    )
    .map(post => [post.slug, post]),
);

const registered = [...blogPosts, ...blogFixturePosts];

describe('blog post bodies', () => {
  it('are not in the blog registry, which client modules import', () => {
    expect(blogPosts.length).toBeGreaterThan(1);
    for (const post of registered) {
      expect(post).not.toHaveProperty('body');
    }
  });

  it('make each post of the registry the post of its Markdown file again', () => {
    for (const post of registered) {
      const fromFile = onDisk.get(post.slug)!;
      expect(fromFile.body.length).toBeGreaterThan(100);
      expect(withBody(post)).toEqual(fromFile);
    }
  });

  it('fail for a post that has no generated body', () => {
    expect(() => withBody({...blogPosts[0], slug: 'no-such-post'})).toThrow(
      'Blog post "no-such-post" has no generated body',
    );
    expect(() => withBody({...blogPosts[0], slug: 'constructor'})).toThrow(
      'Blog post "constructor" has no generated body',
    );
  });

  it('are not in the posts that the blog index page gives its client view', () => {
    const {posts} = BlogIndexPage().props;
    expect(posts).toEqual(blogPosts);
    for (const post of posts) {
      expect(post).not.toHaveProperty('body');
    }
  });

  it('give the article page the post with its own body', async () => {
    for (const {slug} of registered) {
      const page = await BlogPostPage({params: Promise.resolve({slug})});
      expect(page.props.post).toEqual(onDisk.get(slug));
    }
  });

  it('give the plain-text route the body of its own post', async () => {
    for (const {slug} of registered) {
      const response = await getPlainText(new Request('http://site/'), {
        params: Promise.resolve({slug}),
      });
      const text = await response.text();
      expect(text.startsWith(`# ${onDisk.get(slug)!.title}\n`)).toBe(true);
      expect(
        text.endsWith(`\n---\n${toStaticLiveBlocks(onDisk.get(slug)!.body)}\n`),
      ).toBe(true);
    }
  });
});
