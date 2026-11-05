// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `blog()` / `astryx blog`. Colocated with the API
 * function it documents; the shape source of truth stays in `blog.type.mjs`.
 * @position packages/cli/api/blog — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'blog',
  namespace: 'cli/api',
  displayName: 'blog()',
  summary: 'List blog posts, or read one, from the published RSS feed.',
  description:
    'Reads the design system blog the same way any feed reader does, over the ' +
    "published RSS feed, never the blog's source files. With no slug it lists every " +
    "post parsed from the feed; with a slug it reads that post's full plaintext body " +
    'via the .txt alternate the feed advertises. Both envelopes carry feedUrl so a ' +
    'caller can hit the RSS feed directly.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'blog(slug?: string): Promise<BlogListResponse | BlogDetailResponse>',
  keywords: ['blog', 'posts', 'rss', 'feed', 'news', 'article'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description:
        'Post slug (matched case-insensitively) to read in full. Omit to list every post.',
    },
  ],
  returns: [
    {
      type: 'blog.list',
      description:
        'The feed URL plus every post parsed from the feed, each with slug, title, description, date, type, authors, link, and its plaintext URL.',
    },
    {
      type: 'blog.detail',
      description:
        "One post's metadata plus the feed URL and the post's full plaintext body.",
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the slug is provided but is not a string',
    },
    {
      code: 'ERR_UNKNOWN_POST',
      when: 'no post in the feed matches the requested slug',
    },
    {
      code: 'ERR_FETCH_FAILED',
      when: 'the RSS feed or post text cannot be fetched (network error, timeout, non-2xx, or oversized), or the post has no plaintext alternate in the feed',
    },
  ],
  examples: [
    {label: 'List posts', code: 'const {data} = await blog();'},
    {label: 'Read one post', code: "await blog('introducing-astryx');"},
  ],
  command: 'blog',
  related: ['docs', 'search'],
};
