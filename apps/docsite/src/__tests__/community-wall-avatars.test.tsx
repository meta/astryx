// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for the pictures on the community page's
 *   contributor wall: a GitHub avatar loads at the size the wall shows it.
 *
 * Run: pnpm -F @astryxdesign/docsite test community-wall-avatars
 */

import type {ReactNode} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('next/cache', () => ({cacheLife: () => undefined}));
vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));
vi.mock('../layout.stylex', () => ({layout: {contentMaxWidth: '1200px'}}));

// Stand-ins for the page's parts that are not the wall.
const {Box, Nothing} = vi.hoisted(() => ({
  Box: ({children}: {children?: ReactNode}) => children ?? null,
  Nothing: () => null,
}));

vi.mock('@astryxdesign/core/Card', () => ({Card: Box}));
vi.mock('@astryxdesign/core/ClickableCard', () => ({ClickableCard: Box}));
vi.mock('@astryxdesign/core/Layout', () => ({HStack: Box, VStack: Box}));
vi.mock('@astryxdesign/core/Link', () => ({Link: Box}));
vi.mock('@astryxdesign/core/List', () => ({List: Box, ListItem: Box}));
vi.mock('@astryxdesign/core/Section', () => ({Section: Box}));
vi.mock('@astryxdesign/core/Text', () => ({Heading: Box, Text: Box}));
vi.mock('@astryxdesign/core/Button', () => ({Button: Nothing}));
vi.mock('@astryxdesign/core/utils', () => ({
  getKey: (key: string | undefined, index: number) => key ?? String(index),
}));
vi.mock('lucide-react', () => ({FileText: Nothing, Scale: Nothing}));
vi.mock('../app/(site)/community/NavSurfaceMode', () => ({
  NavSurfaceMode: Nothing,
}));
vi.mock('../app/(site)/_landing/TemplatesPreview', () => ({
  TemplatesPreview: Nothing,
}));
vi.mock('../app/(site)/_landing/ThemesPreview', () => ({
  ThemesPreview: Nothing,
}));
vi.mock('../app/(site)/_landing/FrozenPreview', () => ({
  FrozenPreview: Nothing,
}));
vi.mock('../components/logos', () => ({
  AstryxLogo: Nothing,
  GitHubLogo: Nothing,
  DiscordLogo: Nothing,
  FacebookLogo: Nothing,
  FigmaLogo: Nothing,
  InstagramLogo: Nothing,
  ThreadsLogo: Nothing,
  XLogo: Nothing,
}));

import CommunityPage from '../app/(site)/community/page';

/** Renders the page with GitHub's answer and returns each wall picture's attributes. */
async function wallPictures(
  response: {ok: boolean; json?: () => Promise<unknown>} | Error,
): Promise<Array<{src: string | null; srcSet: string | null}>> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }),
  );
  const html = renderToStaticMarkup(await CommunityPage());
  // A wall picture is the only image with a rotation.
  const tags = html.match(/<img [^>]*rotate\([^>]*>/g) ?? [];
  const attribute = (tag: string, name: string) =>
    tag.match(new RegExp(` ${name}="([^"]*)"`))?.[1].replaceAll('&amp;', '&') ??
    null;
  return tags.map(tag => ({
    src: attribute(tag, 'src'),
    srcSet: attribute(tag, 'srcSet'),
  }));
}

const contributor = (id: number) => ({
  login: `person-${id}`,
  avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
  contributions: 100 - id,
  html_url: `https://github.com/person-${id}`,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('community contributor wall', () => {
  it('asks GitHub for each contributor avatar at the 48 pixels the wall shows, and at twice that for a dense screen', async () => {
    const pictures = await wallPictures({
      ok: true,
      json: async () =>
        Array.from({length: 50}, (_, index) => contributor(index + 1)),
    });

    expect(pictures).toHaveLength(12);
    expect(pictures[0]).toEqual({
      src: 'https://avatars.githubusercontent.com/u/1?v=4&s=96',
      srcSet:
        'https://avatars.githubusercontent.com/u/1?v=4&s=48 1x, https://avatars.githubusercontent.com/u/1?v=4&s=96 2x',
    });
    expect(pictures.map(picture => picture.src)).toEqual(
      Array.from(
        {length: 12},
        (_, index) =>
          `https://avatars.githubusercontent.com/u/${index + 1}?v=4&s=96`,
      ),
    );
  });

  it('fills the slots that have no contributor with the placeholder portraits as they are', async () => {
    const pictures = await wallPictures({
      ok: true,
      json: async () => [contributor(1), contributor(2)],
    });

    expect(pictures).toHaveLength(12);
    expect(pictures[1].src).toBe(
      'https://avatars.githubusercontent.com/u/2?v=4&s=96',
    );
    for (const picture of pictures.slice(2)) {
      expect(picture.src).toMatch(
        /^https:\/\/images\.unsplash\.com\/photo-[^?]+\?w=80&h=80&fit=crop&crop=faces$/,
      );
      expect(picture.srcSet).toBeNull();
    }
  });

  it.each([
    ['GitHub refuses the request', {ok: false}],
    ['the request fails', new Error('offline')],
  ])('shows twelve placeholder portraits when %s', async (_what, response) => {
    const pictures = await wallPictures(response);

    expect(pictures).toHaveLength(12);
    expect(
      pictures.every(picture =>
        picture.src?.startsWith('https://images.unsplash.com/'),
      ),
    ).toBe(true);
  });
});
