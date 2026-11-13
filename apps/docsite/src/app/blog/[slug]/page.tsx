// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Page type: blog post detail
 * Renders an individual post with article typography. Static params and per-post
 * metadata are derived from the generated blog registry.
 */

import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {blogFixturePosts, blogPosts} from '../../../generated/blogRegistry';
import {BlogArticle} from '../../../components/blog/BlogArticle';

export function generateStaticParams() {
  return [...blogPosts, ...blogFixturePosts].map(p => ({slug: p.slug}));
}

/** A post, or a canary-only test fixture (never listed, never indexed). */
function findPost(slug: string) {
  const post = blogPosts.find(p => p.slug === slug);
  if (post) {
    return {post, isFixture: false};
  }
  const fixture = blogFixturePosts.find(p => p.slug === slug);
  return fixture ? {post: fixture, isFixture: true} : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{slug: string}>;
}): Promise<Metadata> {
  const {slug} = await params;
  const found = findPost(slug);
  if (!found) {
    return {title: 'Blog'};
  }
  const {post, isFixture} = found;

  // Use the post's cover image for the social card when present; otherwise
  // fall back to the branded default card. Next.js shallow-merges metadata —
  // a route that sets `openGraph`/`twitter` replaces the root object wholesale
  // (images are not inherited), so the fallback must be explicit here.
  const ogImage = post.coverImage ?? '/images/Astryx-Banner.png';
  const ogAlt = post.coverImage ? (post.coverAlt ?? post.title) : post.title;

  return {
    // Renders as "<post title> · Astryx" via the root layout title template.
    title: post.title,
    description: post.description,
    ...(isFixture ? {robots: {index: false, follow: false}} : {}),
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}`,
      publishedTime: post.date,
      ...(post.updatedAt ? {modifiedTime: post.updatedAt} : {}),
      images: [{url: ogImage, alt: ogAlt}],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [ogImage],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{slug: string}>;
}) {
  const {slug} = await params;
  const found = findPost(slug);
  if (!found) {
    notFound();
  }

  return <BlogArticle post={found.post} />;
}
