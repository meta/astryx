// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file postBodies.ts
 * @input The generated Markdown body of each blog post
 * @output withBody, which adds its body to a post of the blog registry
 * @position Server-side input of the article page and the plain-text route.
 *   The bodies are larger than all the other blog data: no client module
 *   imports this file.
 */

import bodies from '../../generated/blogPostBodies.json';
import type {BlogPost, BlogPostMeta} from './schema';

const postBodies: Record<string, string> = bodies;

/** A post or a test fixture of the blog registry, with its Markdown body. */
export function withBody(post: BlogPostMeta): BlogPost {
  if (!Object.hasOwn(postBodies, post.slug)) {
    throw new Error(`Blog post "${post.slug}" has no generated body`);
  }
  return {...post, body: postBodies[post.slug]};
}
