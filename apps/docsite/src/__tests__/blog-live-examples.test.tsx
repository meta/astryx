// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Blog live examples (spec:AST-033 FR22).
 *
 * A `tsx live` fence in a post renders as a sandboxed live-example frame, any
 * other fence stays code, the plain-text route shows the source as an
 * ordinary code block, a post's example assets resolve only for that post,
 * and the test fixture post is never a listed post.
 */

import * as path from 'node:path';
import * as React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';
import * as ts from 'typescript';
import type {BlogPost} from '../lib/blog/schema';
import {collectExampleAssets, discoverPosts} from '../lib/blog/posts.mjs';
import {isLiveBlockMeta, toStaticLiveBlocks} from '../lib/blog/liveBlocks.mjs';

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

// The runner resolves imports against the generated preview scope; a small
// stand-in keeps this test independent of `pnpm generate`.
vi.mock('@/generated/playground-scope', () => ({
  scope: {react: {default: React, useState: React.useState}},
}));

// The site's color mode; the real provider pulls in the built site theme.
vi.mock('../app/providers', () => ({
  useThemeMode: () => ({mode: 'light', setMode: () => {}}),
}));

const POSTS_DIR = path.resolve(__dirname, '../content/blog/posts');
const FIXTURES_DIR = path.resolve(__dirname, '../content/blog/fixtures');
const FIXTURE_SLUG = 'live-example-sample';

function fixturePost(): BlogPost {
  const post = (
    discoverPosts(FIXTURES_DIR, {includeDrafts: true}) as BlogPost[]
  ).find(p => p.slug === FIXTURE_SLUG);
  if (post == null) {
    throw new Error(`missing fixture ${FIXTURE_SLUG}`);
  }
  return post;
}

describe('the tsx live fence rule', () => {
  it('marks only an info string of exactly "live" after tsx', () => {
    expect(isLiveBlockMeta('live')).toBe(true);
    expect(isLiveBlockMeta(' live ')).toBe(true);
    expect(isLiveBlockMeta(undefined)).toBe(false);
    expect(isLiveBlockMeta('title="x"')).toBe(false);
    expect(isLiveBlockMeta('live title="x"')).toBe(false);
  });

  it('shows every live block as an ordinary tsx code block in the static fallback', () => {
    const body = [
      '```tsx live',
      'export default function A() { return null; }',
      '```',
      '',
      '  ~~~~ tsx  live  ',
      'export default function B() { return null; }',
      '  ~~~~',
      '',
      '```tsx',
      'const unchanged = true;',
      '```',
      '',
      '```tsx title="live"',
      '```',
    ].join('\n');
    expect(toStaticLiveBlocks(body)).toBe(
      [
        '```tsx',
        'export default function A() { return null; }',
        '```',
        '',
        '  ~~~~tsx',
        'export default function B() { return null; }',
        '  ~~~~',
        '',
        '```tsx',
        'const unchanged = true;',
        '```',
        '',
        '```tsx title="live"',
        '```',
      ].join('\n'),
    );
  });

  it('rewrites exactly the fences the page runs: in blockquotes and list items, nested, after an unclosed quoted fence, and never inside another block', () => {
    const body = [
      '> ```tsx live',
      '> export default function Quoted() { return null; }',
      '> ```',
      '',
      '- ```tsx live',
      '  export default function Listed() { return null; }',
      '  ```',
      '',
      '````md',
      '```tsx live',
      'quoted syntax stays as written',
      '```',
      '````',
      '',
      '- > ```tsx live',
      '  > export default function ListQuote() { return null; }',
      '  > ```',
      '',
      '- - ```tsx live',
      '    export default function Nested() { return null; }',
      '    ```',
      '',
      '> ```tsx',
      '> an unclosed fence ends with its quote',
      '',
      '```tsx live',
      'export default function AfterQuote() { return null; }',
      '```',
      '',
      '    ```tsx live',
      '    quoted inside an indented code block',
      '    ```',
    ].join('\n');
    expect(toStaticLiveBlocks(body)).toBe(
      [
        '> ```tsx',
        '> export default function Quoted() { return null; }',
        '> ```',
        '',
        '- ```tsx',
        '  export default function Listed() { return null; }',
        '  ```',
        '',
        '````md',
        '```tsx live',
        'quoted syntax stays as written',
        '```',
        '````',
        '',
        '- > ```tsx',
        '  > export default function ListQuote() { return null; }',
        '  > ```',
        '',
        '- - ```tsx',
        '    export default function Nested() { return null; }',
        '    ```',
        '',
        '> ```tsx',
        '> an unclosed fence ends with its quote',
        '',
        '```tsx',
        'export default function AfterQuote() { return null; }',
        '```',
        '',
        '    ```tsx live',
        '    quoted inside an indented code block',
        '    ```',
      ].join('\n'),
    );
  });

  it('leaves no live fence in the fixture plain-text body', () => {
    const fallback = toStaticLiveBlocks(fixturePost().body);
    expect(fallback).not.toMatch(/^\s*(`{3,}|~{3,})\s*tsx\s+live/m);
    expect(fallback).toContain(
      "throw new Error('This example fails on purpose');",
    );
  });
});

describe('the live example fixture post', () => {
  it('is a fixture, never a listed post', () => {
    const listed = discoverPosts(POSTS_DIR, {
      includeDrafts: true,
    }) as BlogPost[];
    expect(listed.map(p => p.slug)).not.toContain(FIXTURE_SLUG);
    expect(fixturePost().title).toBe('Live example sample');
  });

  it('has its own example asset, importable as ./SampleCard', () => {
    expect(
      collectExampleAssets(FIXTURES_DIR, FIXTURE_SLUG).map(a => a.specifier),
    ).toEqual(['./SampleCard']);
    // A post without an asset folder has none.
    expect(collectExampleAssets(POSTS_DIR, 'how-astryx-works')).toEqual([]);
  });

  it(
    'renders each tsx live block as a live-example frame and keeps other fences as code',
    {timeout: 30_000},
    async () => {
      const {BlogPostBody} = await import('../components/blog/BlogPostBody');
      const html = renderToStaticMarkup(
        <BlogPostBody body={fixturePost().body} slug={FIXTURE_SLUG} />,
      );
      expect(html.match(/data-live-example=""/g)).toHaveLength(4);
      // The ordinary tsx block is still a code block...
      expect(html).toContain('NotLive');
      // ...and no live block's source is printed as code on the page.
      expect(html).not.toContain('This example fails on purpose');
      expect(html).not.toContain('SampleCard');
    },
  );
});

describe('post-local modules in the preview runner', () => {
  it('resolves a relative import only from the modules it is given', async () => {
    const {runCode, setTypeScript} =
      await import('../app/playground/preview/runner');
    setTypeScript(ts);
    const code = [
      "import {Greeting} from './Greeting';",
      'export default function Example() { return Greeting(); }',
    ].join('\n');

    const withAsset = runCode(code, {
      './Greeting': {Greeting: () => 'hello from the post'},
    });
    expect(withAsset.error).toBeUndefined();
    const Component = withAsset.Component as () => unknown;
    expect(Component()).toBe('hello from the post');

    // Without the post's modules (the playground, another post) the import
    // resolves to the scope's render-nothing placeholder.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const withoutAsset = runCode(code);
    const Unresolved = withoutAsset.Component as () => unknown;
    expect(Unresolved()).toBeNull();
  });
});
