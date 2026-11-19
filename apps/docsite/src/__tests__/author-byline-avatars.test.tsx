// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for the avatars in a blog byline: a GitHub avatar
 *   loads at the size the byline shows it.
 *
 * Run: pnpm -F @astryxdesign/docsite test author-byline-avatars
 */

import type {ReactNode} from 'react';
import type * as AvatarModule from '@astryxdesign/core/Avatar';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe, expect, it, vi} from 'vitest';

vi.mock('@stylexjs/stylex', () => ({
  create: <T,>(styles: T) => styles,
  props: () => ({}),
}));

// A stand-in for the byline's parts that are not an avatar.
const {Box} = vi.hoisted(() => ({
  Box: ({children}: {children?: ReactNode}) => children ?? null,
}));

// An avatar that shows the file it asks for. The size scale is the real one.
// The mock loads it while the file loads, so no test waits for the module.
vi.mock('@astryxdesign/core/Avatar', async importOriginal => ({
  resolveSize: (await importOriginal<typeof AvatarModule>()).resolveSize,
  Avatar: ({src, name}: {src?: string; name?: string}) => (
    <img src={src} alt={name} />
  ),
}));
vi.mock('@astryxdesign/core/AvatarGroup', () => ({
  AvatarGroup: ({size, children}: {size: string; children: ReactNode}) => (
    <span data-size={size}>{children}</span>
  ),
}));
vi.mock('@astryxdesign/core/Text', () => ({Text: Box}));
vi.mock('@astryxdesign/core/Link', () => ({Link: Box}));
vi.mock('@astryxdesign/core/Layout', () => ({HStack: Box}));
vi.mock('@astryxdesign/core/Divider', () => ({Divider: () => null}));

import {resolveSize} from '@astryxdesign/core/Avatar';
import {AuthorByline} from '../components/blog/AuthorByline';

/** The avatar files a byline asks for, in author order. */
function avatarFiles(variant: 'compact' | 'full', authors: string[]): string[] {
  const html = renderToStaticMarkup(
    <AuthorByline authors={authors} date="2026-01-02" variant={variant} />,
  );
  return Array.from(html.matchAll(/<img src="([^"]*)"/g), ([, src]) => src);
}

describe('blog byline avatars', () => {
  it('asks GitHub for 40 pixels on a card, where an avatar is 20 pixels', () => {
    expect(avatarFiles('compact', ['nynexman4464', 'ernest'])).toEqual([
      'https://github.com/nynexman4464.png?size=40',
      'https://github.com/ernestt.png?size=40',
    ]);
  });

  it('asks GitHub for 72 pixels on an article, where an avatar is 36 pixels', () => {
    expect(avatarFiles('full', ['nynexman4464'])).toEqual([
      'https://github.com/nynexman4464.png?size=72',
    ]);
  });

  it('takes its pixel sizes from the Avatar size scale', () => {
    expect(avatarFiles('compact', ['ernest'])).toEqual([
      `https://github.com/ernestt.png?size=${2 * resolveSize('xsm')}`,
    ]);
    expect(avatarFiles('full', ['ernest'])).toEqual([
      `https://github.com/ernestt.png?size=${2 * resolveSize('md')}`,
    ]);
  });

  it('sizes the avatar of an author the registry does not list', () => {
    expect(avatarFiles('compact', ['someone-new'])).toEqual([
      'https://github.com/someone-new.png?size=40',
    ]);
  });

  it('leaves an avatar that the site serves as it is', () => {
    expect(avatarFiles('compact', ['team'])).toEqual([
      '/blog/authors/astryx-team.png',
    ]);
    expect(avatarFiles('full', ['team'])).toEqual([
      '/blog/authors/astryx-team.png',
    ]);
  });
});
