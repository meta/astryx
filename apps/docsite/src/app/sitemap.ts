// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sitemap.ts
 *
 * Dynamic sitemap for the docsite. Next.js serves this at /sitemap.xml and
 * regenerates it on every build, so the URL set tracks the same generated
 * registries that drive the routes themselves — add a component, doc topic,
 * template, or blog post and it appears in the sitemap with no manual edit.
 *
 * Mirrors the `generateStaticParams` of each dynamic route so the sitemap and
 * the actual rendered pages never drift. `getSitemapPages()` exposes the same
 * entries with their canonical page titles for 404 recovery.
 *
 * @output MetadataRoute.Sitemap consumed by Next.js to emit /sitemap.xml
 */

import type {MetadataRoute} from 'next';
import {cacheLife} from 'next/cache';
import {SITE_URL} from '../lib/siteConfig';
import {CHANGELOG_PAGE_TITLE} from '../lib/pageTitles';
import {flattenComponentSidebarEntries} from '../components/componentSidebarData';
import {docTopics} from '../generated/docsRegistry';
import {packages} from '../generated/packageRegistry';
import {templateMetadata as templates} from '../generated/templateMetadataRegistry';
import {blogPosts} from '../generated/blogRegistry';

export type SitemapPage = MetadataRoute.Sitemap[number] & {title: string};

function isThemePackage(name: string): boolean {
  return name.includes('theme-');
}

function url(path: string): string {
  return new URL(path, SITE_URL).toString();
}

async function getLastModified(): Promise<Date> {
  'use cache';
  cacheLife('days');
  return new Date();
}

export async function getSitemapPages(): Promise<SitemapPage[]> {
  const now = await getLastModified();

  const staticEntries: SitemapPage[] = [
    {url: url('/'), title: 'Home', changeFrequency: 'weekly', priority: 1},
    {
      url: url('/components'),
      title: 'Components',
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: url('/docs'),
      title: 'Docs',
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: url('/templates'),
      title: 'Templates',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: url('/themes'),
      title: 'Themes',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: url('/blog'),
      title: 'Blog',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: url('/changelog'),
      title: CHANGELOG_PAGE_TITLE,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
    {
      url: url('/community'),
      title: 'Community',
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: url('/playground'),
      title: 'Playground',
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: url('/llms.txt'),
      title: 'LLMs.txt',
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  const componentEntries: SitemapPage[] = flattenComponentSidebarEntries().map(
    component => ({
      url: url(`/components/${component.name}`),
      title: component.displayName,
      changeFrequency: 'weekly',
      priority: 0.7,
    }),
  );

  const docTopicEntries: SitemapPage[] = [
    ...docTopics.map(topic => ({slug: topic.topic, title: topic.title})),
    ...packages
      .filter(pkg => !isThemePackage(pkg.name))
      .map(pkg => ({
        slug: pkg.name.replace('@astryxdesign/', ''),
        title: pkg.displayName,
      })),
  ].map(({slug, title}) => ({
    url: url(`/docs/${slug}`),
    title,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  const templateEntries: SitemapPage[] = templates.map(template => ({
    url: url(`/templates/${template.slug}`),
    title: template.name,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  const blogEntries: SitemapPage[] = blogPosts.map(post => ({
    url: url(`/blog/${post.slug}`),
    title: post.title,
    lastModified: post.date ? new Date(post.date) : now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  return [
    ...staticEntries,
    ...componentEntries,
    ...docTopicEntries,
    ...templateEntries,
    ...blogEntries,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await getSitemapPages();
  return pages.map(({title: _title, ...entry}) => entry);
}
