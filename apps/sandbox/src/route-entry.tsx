// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared route inventory and page loader for prerender and hydration.
 * @input Vite's generated route-module manifest.
 * @output Exact route lookup and resolved React page components.
 * @position Single source of truth for client navigation and static HTML.
 */

import type {ComponentType} from 'react';
import {routes, type SandboxRoute} from 'virtual:sandbox-routes';

export function findRoute(pathname: string): SandboxRoute | undefined {
  const normalized = pathname.endsWith('/embed.html')
    ? pathname.slice(0, -'embed.html'.length)
    : pathname.endsWith('/')
      ? pathname
      : `${pathname}/`;
  return routes.find(item => item.route === normalized);
}

export async function loadPage(entry: SandboxRoute): Promise<ComponentType> {
  const module = await entry.load();
  if (entry.slug && module.CategoryContent) {
    const Category = module.CategoryContent;
    const slug = entry.slug;
    return function CategoryPage() {
      return <Category slug={slug} />;
    };
  }
  if (!module.default) {
    throw new Error(`No page component for ${entry.route}`);
  }
  return module.default;
}
