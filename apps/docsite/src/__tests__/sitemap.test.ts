// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Sitemap tests for the docsite.
 *
 * Validates that the dynamic sitemap covers the static pages plus every
 * generated dynamic route (components, doc topics, templates, blog posts),
 * uses absolute URLs, and stays free of duplicates.
 *
 * Run: pnpm -F @astryxdesign/docsite test
 */

import {describe, it, expect, vi} from 'vitest';

// Outside a Next.js server, `'use cache'` is inert and cacheLife() has no
// cache scope to configure. Stub it so the sitemap can run under vitest.
vi.mock('next/cache', () => ({cacheLife: () => {}}));

import sitemap, {getSitemapPages} from '../app/sitemap';
import {SITE_URL} from '../lib/siteConfig';
import {flattenComponentSidebarEntries} from '../components/componentSidebarData';
import {docTopics} from '../generated/docsRegistry';
import {packages} from '../generated/packageRegistry';
import {templateMetadata as templates} from '../generated/templateMetadataRegistry';
import {blogPosts} from '../generated/blogRegistry';

const entries = await sitemap();
const pages = await getSitemapPages();
const urls = entries.map(e => e.url);

describe('docsite sitemap', () => {
  it('emits only absolute URLs on the configured origin', () => {
    for (const u of urls) {
      expect(u.startsWith(`${SITE_URL}/`) || u === `${SITE_URL}/`).toBe(true);
    }
  });

  it('has no duplicate URLs', () => {
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('includes the primary static pages', () => {
    for (const path of ['/', '/components', '/docs', '/templates', '/blog']) {
      expect(urls).toContain(new URL(path, SITE_URL).toString());
    }
  });

  it('exports canonical page titles for route recovery', () => {
    expect(
      pages.find(page => new URL(page.url).pathname === '/changelog')?.title,
    ).toBe("What's New");
  });

  it('includes every component detail page', () => {
    for (const c of flattenComponentSidebarEntries()) {
      expect(urls).toContain(
        new URL(`/components/${c.name}`, SITE_URL).toString(),
      );
    }
  });

  it('includes every doc topic and non-theme package page', () => {
    const topics = [
      ...docTopics.map(d => d.topic),
      ...packages
        .filter(p => !p.name.includes('theme-'))
        .map(p => p.name.replace('@astryxdesign/', '')),
    ];
    for (const topic of topics) {
      expect(urls).toContain(new URL(`/docs/${topic}`, SITE_URL).toString());
    }
  });

  it('includes every template and blog post', () => {
    for (const t of templates) {
      expect(urls).toContain(
        new URL(`/templates/${t.slug}`, SITE_URL).toString(),
      );
    }
    for (const p of blogPosts) {
      expect(urls).toContain(new URL(`/blog/${p.slug}`, SITE_URL).toString());
    }
  });
});
