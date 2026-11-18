// Copyright (c) Meta Platforms, Inc. and affiliates.

import {afterEach, describe, expect, it, vi} from 'vitest';
import {githubAvatarImage, githubAvatarUrl} from '../lib/githubAvatarUrl';

describe('githubAvatarUrl', () => {
  it('asks the avatar host for twice the size the page shows', () => {
    expect(
      githubAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4', 48),
    ).toBe('https://avatars.githubusercontent.com/u/1?v=4&s=96');
  });

  it('asks for the size at the pixel density it is given', () => {
    expect(
      githubAvatarUrl('https://avatars.githubusercontent.com/u/1?v=4', 48, 1),
    ).toBe('https://avatars.githubusercontent.com/u/1?v=4&s=48');
  });

  it('asks for a whole number of pixels, never fewer than the page shows', () => {
    expect(
      githubAvatarUrl('https://avatars.githubusercontent.com/u/1', 20.4, 1.5),
    ).toBe('https://avatars.githubusercontent.com/u/1?s=31');
  });

  it('uses the parameter that a github.com profile picture reads', () => {
    expect(githubAvatarUrl('https://github.com/octocat.png', 20)).toBe(
      'https://github.com/octocat.png?size=40',
    );
  });

  it('replaces a size the URL came with, under either name', () => {
    expect(githubAvatarUrl('https://github.com/octocat.png?size=128', 36)).toBe(
      'https://github.com/octocat.png?size=72',
    );
    expect(
      githubAvatarUrl(
        'https://avatars.githubusercontent.com/u/1?s=460&size=460&v=4',
        20,
      ),
    ).toBe('https://avatars.githubusercontent.com/u/1?v=4&s=40');
  });

  it.each([
    ['a path on the site', '/blog/authors/astryx-team.png'],
    ['another host', 'https://images.unsplash.com/photo-1?w=80&h=80'],
    ['a github.com page that is not a picture', 'https://github.com/octocat'],
    ['a picture deeper in github.com', 'https://github.com/o/r/logo.png'],
    ['no avatar', ''],
  ])('leaves %s as it is', (_what, url) => {
    expect(githubAvatarUrl(url, 48)).toBe(url);
  });
});

describe('githubAvatarUrl in a browser without URL.canParse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sizes a GitHub avatar and leaves a site path as it is', () => {
    // Chrome and Edge before version 120 have no `URL.canParse`.
    vi.spyOn(URL, 'canParse').mockImplementation(() => {
      throw new TypeError('URL.canParse is not a function');
    });

    expect(githubAvatarUrl('https://github.com/octocat.png', 20)).toBe(
      'https://github.com/octocat.png?size=40',
    );
    expect(githubAvatarUrl('/blog/authors/astryx-team.png', 20)).toBe(
      '/blog/authors/astryx-team.png',
    );
  });
});

describe('githubAvatarImage', () => {
  it('gives the browser one file for each pixel density', () => {
    expect(
      githubAvatarImage('https://avatars.githubusercontent.com/u/1?v=4', 48),
    ).toEqual({
      src: 'https://avatars.githubusercontent.com/u/1?v=4&s=96',
      srcSet:
        'https://avatars.githubusercontent.com/u/1?v=4&s=48 1x, https://avatars.githubusercontent.com/u/1?v=4&s=96 2x',
    });
  });

  it('gives a picture that GitHub does not serve no choice of file', () => {
    const url = 'https://images.unsplash.com/photo-1?w=80&h=80';
    expect(githubAvatarImage(url, 48)).toEqual({src: url});
    expect(githubAvatarImage('/blog/authors/astryx-team.png', 20)).toEqual({
      src: '/blog/authors/astryx-team.png',
    });
  });
});
