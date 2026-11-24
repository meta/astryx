// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file schema.ts
 *
 * Shared TypeScript types for the blog. These describe the shape of a validated
 * blog post as produced by the build-time generator (src/generated/) and
 * consumed by the blog pages.
 *
 * The runtime discovery/validation rules live in ./posts.mjs (used by the data
 * generator and tests). This file is the type-level mirror of that contract.
 *
 * @input  none (type declarations)
 * @output BlogPostMeta, BlogPost and related types
 * @position Imported by src/generated/blogRegistry.ts and blog pages/components
 */

/** The small, stable set of editorial post types used for primary filtering. */
export const POST_TYPES = [
  'update',
  'guide',
  'design',
  'story',
  'perspective',
  'engineering',
] as const;

export type BlogPostType = (typeof POST_TYPES)[number];

/** Human-friendly labels for each post type, used in filters and badges. */
export const POST_TYPE_LABELS: Record<BlogPostType, string> = {
  update: 'Update',
  guide: 'Guide',
  design: 'Design',
  story: 'Story',
  perspective: 'Perspective',
  engineering: 'Engineering',
};

/** A curated related-doc link rendered near the end of an article. */
export interface RelatedDoc {
  title: string;
  href: string;
}

/**
 * A validated blog post without its body, as emitted into the generated
 * registry: what a card, a list, a feed and the header of an article show.
 */
export interface BlogPostMeta {
  /** URL-friendly slug derived from the filename (e.g. 'designing-agent-ready-components'). */
  slug: string;
  /** Article h1, card title, and default page/social title. */
  title: string;
  /** Card excerpt, article dek, and default meta description. */
  description: string;
  /** Optional article-only dek. Supports inline Markdown links. */
  dek: string | null;
  /** Publish date (ISO YYYY-MM-DD). Default sort key. */
  date: string;
  /** Primary editorial organization/filter. */
  type: BlogPostType;
  /** Author registry keys (resolved to profiles at render time). */
  authors: string[];
  /** 1–4 topical tags for chips and discovery. */
  tags: string[];
  /** Optional updated date for evergreen posts (does not replace `date`). */
  updatedAt: string | null;
  /** Work-in-progress flag; drafts are excluded from production output. */
  draft: boolean;
  /** Optional custom cover image path. */
  coverImage: string | null;
  /** Alt text for the cover image (required when coverImage is set). */
  coverAlt: string | null;
  /** Package label on the generated release cover (default @astryxdesign/core). */
  releasePackage: string | null;
  /** Optional curated related-doc links. */
  relatedDocs: RelatedDoc[] | null;
  /** Estimated reading time in minutes. */
  readingTimeMinutes: number;
}

/** A fully validated blog post: what an article shows. */
export interface BlogPost extends BlogPostMeta {
  /** Markdown body (frontmatter stripped). */
  body: string;
}
