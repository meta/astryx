// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file authors.ts
 *
 * Shared author registry for the blog. Posts reference team or individual
 * authors by key in their frontmatter so profile metadata is defined once.
 *
 * For GitHub-backed authors, set `github` and the site derives a stable avatar
 * and profile link from github.com without fetching profile data at build time.
 * For non-GitHub authors (e.g. a team identity), provide `avatar`/`href`
 * explicitly.
 *
 * @input  Referenced by author key from post frontmatter
 * @output Resolved author profiles (name, role, avatar, href) for bylines/cards
 * @position Imported by blog pages and the byline component
 */

export interface AuthorProfile {
  /** Display name shown on cards and bylines. */
  name: string;
  /** GitHub handle. When set, avatar/href default to github.com/<github>. */
  github?: string;
  /** Optional role/title shown under the name. */
  role?: string;
  /** Explicit avatar URL. Defaults to the GitHub avatar when `github` is set. */
  avatar?: string;
  /** Explicit profile URL. Defaults to the GitHub profile when `github` is set. */
  href?: string;
}

export interface ResolvedAuthor extends Omit<AuthorProfile, 'avatar' | 'href'> {
  /** The registry key (also used as a stable React key). */
  key: string;
  /** Always-present avatar URL after resolution. */
  avatar: string;
  /** Profile URL, or null when none can be derived. */
  href: string | null;
}

/**
 * The author registry. Add an entry here, then reference its key from a post's
 * `authors` frontmatter list.
 */
export const authors = {
  team: {
    name: 'Astryx team',
    avatar: '/blog/authors/astryx-team.png',
    href: 'https://github.com/meta/astryx',
  },
  cvkxx: {
    name: 'Catherine',
    github: 'cvkxx',
    role: 'Design',
  },
  cixzhang: {
    name: 'Cindy',
    github: 'cixzhang',
    role: 'Engineering',
  },
  josephfarina: {
    name: 'Joey',
    github: 'josephfarina',
    role: 'Engineering',
  },
  liya: {
    name: 'Liya',
    github: 'liyalabubu',
  },
  ernest: {
    name: 'Ernest',
    github: 'ernestt',
  },
  nynexman4464: {
    name: 'Alex',
    github: 'nynexman4464',
    role: 'Engineering',
  },
  potatowagon: {
    name: 'Sherry',
    github: 'potatowagon',
  },
} as const satisfies Record<string, AuthorProfile>;

/**
 * Resolve an author key to a complete profile, deriving GitHub avatar/href
 * defaults where applicable. Unknown keys resolve to a graceful fallback so a
 * typo in frontmatter never crashes the page (validation surfaces the warning).
 */
export function resolveAuthor(key: string): ResolvedAuthor {
  const profile = (authors as Record<string, AuthorProfile>)[key];

  if (!profile) {
    return {
      key,
      name: key,
      avatar: `https://github.com/${key}.png`,
      href: `https://github.com/${key}`,
    };
  }

  const avatar =
    profile.avatar ??
    (profile.github ? `https://github.com/${profile.github}.png` : '');
  const href =
    profile.href ??
    (profile.github ? `https://github.com/${profile.github}` : null);

  return {key, ...profile, avatar, href};
}
