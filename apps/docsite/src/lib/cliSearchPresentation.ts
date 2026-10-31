// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Converts canonical CLI search results into concise docsite rows.
 * @input A SiteSearchResult from the search API.
 * @output Display-only title, context, and icon; ranking and result data stay unchanged.
 * @position Consumed by SearchPalette.tsx.
 */

import type {ComponentType} from 'react';
import {
  BookText,
  Braces,
  LayoutTemplate,
  PanelTopDashed,
  Shapes,
  SwatchBook,
  Webhook,
  type LucideProps,
} from 'lucide-react';
import type {SiteSearchResult} from './cliSearchTypes';

const FALLBACK_DOC_ROOT_TYPES: Readonly<Record<string, string>> = {
  'Astryx CLI': 'Reference',
  Authoring: 'Authoring',
  Foundations: 'Foundation',
  Guides: 'Guide',
  Migration: 'Migration',
};

function splitTitle(title: string): string[] {
  return title.split(/\s+›\s+/);
}

function componentDestination(result: SiteSearchResult): string | null {
  if (result.domain !== 'template' || result.kind !== 'block') {
    return null;
  }
  return /^\/components\/([^/#]+)$/.exec(result.href)?.[1] ?? null;
}

function displayTitleParts(result: SiteSearchResult): string[] {
  const component = componentDestination(result);
  if (component) {
    return [component];
  }
  const title =
    result.domain === 'doc'
      ? (result.siteTitle ?? result.title ?? result.name)
      : (result.displayName ?? result.name);
  return splitTitle(title);
}

function canonicalDocTitleParts(result: SiteSearchResult): string[] {
  return splitTitle(result.title ?? result.siteTitle ?? result.name);
}

function categoryType(category: string): string {
  if (category === 'foundations') {
    return 'Foundation';
  }
  return `${category.charAt(0).toUpperCase()}${category.slice(1)}`;
}

function docType(result: SiteSearchResult): string {
  if (result.siteCategory) {
    return categoryType(result.siteCategory);
  }
  const root = canonicalDocTitleParts(result)[0];
  return FALLBACK_DOC_ROOT_TYPES[root] ?? 'Guide';
}

function isReferenceDoc(result: SiteSearchResult): boolean {
  return result.domain === 'doc' && docType(result) === 'Reference';
}

function contextForDoc(result: SiteSearchResult): string {
  const parts = canonicalDocTitleParts(result);
  const root = parts[0];
  const type = docType(result);
  const categoryRoot =
    result.siteCategory === 'foundations'
      ? 'Foundations'
      : result.siteCategory === 'guide'
        ? 'Guides'
        : null;
  const location = result.siteCategory
    ? parts.slice(0, -1).filter(part => part !== categoryRoot)
    : Object.hasOwn(FALLBACK_DOC_ROOT_TYPES, root)
      ? parts.slice(1, -1)
      : parts.slice(0, -1);
  const breadcrumb = location.join(' › ');
  return breadcrumb ? `${type} · ${breadcrumb}` : type;
}

function contextForCatalogResult(result: SiteSearchResult): string {
  if (componentDestination(result)) {
    return 'Component';
  }
  switch (result.domain) {
    case 'component':
      return 'Component';
    case 'hook':
      return 'Hook';
    case 'template':
      return result.kind === 'block' ? 'Component Example' : 'Page Template';
    case 'theme':
      return 'Theme';
    default:
      return result.domain;
  }
}

function iconForResult(result: SiteSearchResult): ComponentType<LucideProps> {
  if (componentDestination(result)) {
    return Shapes;
  }
  switch (result.domain) {
    case 'component':
      return Shapes;
    case 'hook':
      return Webhook;
    case 'doc':
      return isReferenceDoc(result) ? Braces : BookText;
    case 'template':
      return result.kind === 'block' ? PanelTopDashed : LayoutTemplate;
    case 'theme':
      return SwatchBook;
    default:
      return BookText;
  }
}

/** Human-facing presentation for one CLI-ranked site-search result. */
export function searchResultPresentation(result: SiteSearchResult): {
  title: string;
  context: string;
  icon: ComponentType<LucideProps>;
} {
  return {
    title: displayTitleParts(result).at(-1) ?? result.name,
    context:
      result.domain === 'doc'
        ? contextForDoc(result)
        : contextForCatalogResult(result),
    icon: iconForResult(result),
  };
}
