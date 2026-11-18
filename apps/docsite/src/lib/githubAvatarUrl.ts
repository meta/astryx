// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Asks GitHub for an avatar at the size a page shows it.
 * @input An avatar URL, and the side of the avatar on the page in CSS pixels.
 * @output The URL, or the `src` and `srcSet` of an `<img>`, with GitHub's size
 *   parameter. A URL that GitHub does not serve comes back unchanged.
 * @position Shared by the community page's contributor wall and the blog
 *   byline, so both ask for an avatar in one way.
 */

// Without a size, GitHub sends the picture as the person uploaded it: up to
// 460 pixels on a side. Each host reads its own parameter:
// `github.com/<name>.png` ignores `s`.
const SIZE_PARAMETER: Readonly<Record<string, string>> = {
  'avatars.githubusercontent.com': 's',
  'github.com': 'size',
};

const GITHUB_PROFILE_PICTURE = /^\/[^/]+\.png$/;

/** The parsed URL and its size parameter, or null when GitHub does not serve the URL. */
function githubAvatar(url: string): {parsed: URL; parameter: string} | null {
  let parsed: URL;
  try {
    // This also runs in the browser, and `URL.canParse` is missing in some
    // browsers that the site supports.
    parsed = new URL(url);
  } catch {
    // A site path such as `/blog/authors/team.png` is not an absolute URL.
    return null;
  }
  const parameter = SIZE_PARAMETER[parsed.hostname];
  if (parameter == null) {
    return null;
  }
  if (
    parsed.hostname === 'github.com' &&
    !GITHUB_PROFILE_PICTURE.test(parsed.pathname)
  ) {
    return null;
  }
  return {parsed, parameter};
}

/**
 * The avatar URL at the size a page shows it.
 *
 * @param url an avatar URL
 * @param cssPixels the side of the avatar on the page
 * @param density device pixels for each CSS pixel
 */
export function githubAvatarUrl(
  url: string,
  cssPixels: number,
  density: number = 2,
): string {
  const avatar = githubAvatar(url);
  if (avatar == null) {
    return url;
  }
  const {parsed, parameter} = avatar;
  // The size the page shows replaces a size the URL came with.
  parsed.searchParams.delete('s');
  parsed.searchParams.delete('size');
  parsed.searchParams.set(parameter, String(Math.ceil(cssPixels * density)));
  return parsed.href;
}

/**
 * The `src` and `srcSet` of an avatar `<img>`: the browser takes the file for
 * its pixel density.
 */
export function githubAvatarImage(
  url: string,
  cssPixels: number,
): {src: string; srcSet?: string} {
  if (githubAvatar(url) == null) {
    return {src: url};
  }
  const twice = githubAvatarUrl(url, cssPixels, 2);
  return {
    src: twice,
    srcSet: `${githubAvatarUrl(url, cssPixels, 1)} 1x, ${twice} 2x`,
  };
}
