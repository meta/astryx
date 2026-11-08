// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file robots.ts
 *
 * Next.js serves this at /robots.txt. It allows full crawling and advertises
 * the dynamic sitemap so search engines can discover every page the docsite
 * generates. The raw compatibility registry remains intentionally unlinked and
 * disallowed from crawlers during soak testing. Uses the same SITE_URL origin
 * as the sitemap and metadata.
 *
 * @output MetadataRoute.Robots consumed by Next.js to emit /robots.txt
 */

import type {MetadataRoute} from 'next';
import {SITE_URL} from '../lib/siteConfig';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // The preview frame and hidden registry are machine surfaces, not pages.
      disallow: ['/playground/preview', '/shadcn/'],
    },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
