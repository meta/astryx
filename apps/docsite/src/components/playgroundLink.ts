// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Playground URL builders.
 * @input Accepts authored source code or a generated page-template slug.
 * @output Produces links that seed the playground without running work eagerly.
 * @position Shared navigation helper for docs, themes, and templates.
 */

import {compressCode} from '../lib/compress';
import {stripCodeExampleCopyrightHeader} from '../lib/codeExamples';

/**
 * Build a playground URL with prepopulated source code, and optionally a
 * seeded theme. When `theme` is given (a short theme slug like "neutral"),
 * it's added as a `?theme=` query param so the playground opens with that
 * theme applied + its Theme editor populated; the code rides in the hash.
 * Repo-only copyright headers are stripped so examples open copy-ready.
 */
export function buildPlaygroundHref(source: string, theme?: string): string {
  const cleanedSource = stripCodeExampleCopyrightHeader(source);
  const compressed = compressCode(cleanedSource);
  const query = theme ? `?theme=${encodeURIComponent(theme)}` : '';
  return `/playground${query}#code=${compressed}`;
}

/**
 * Link to a generated page template by slug. The playground already owns the
 * source registry, so gallery pages can avoid embedding every template's code
 * in their HTML just to produce a destination URL.
 */
export function buildTemplatePlaygroundHref(slug: string): string {
  return `/playground?template=${encodeURIComponent(slug)}`;
}
