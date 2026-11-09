// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Build-only HTML prerender entry for all Sandbox deep links.
 * @input Generated route modules and their shared layouts/providers.
 * @output React HTML at each route without needing JavaScript to see content.
 * @position Loaded by scripts/prerender.mjs through Vite SSR, never deployed.
 */

import {renderToString} from 'react-dom/server';
import {StaticRouter} from 'react-router-dom';
import {findRoute, loadPage} from './route-entry';
import {blocks} from './generated/blockRegistry';
import {RouteView} from './RouteView';

const blockRoutes = new Set(blocks.map(block => block.href));

/** Blocks render inline; other fullscreen routes need a standalone iframe document. */
export function needsEmbed(route: string): boolean {
  const entry = findRoute(route);
  return entry?.group === 'fullscreen' && !blockRoutes.has(entry.route);
}

export async function render(
  route: string,
  basePath = '',
  embed = false,
): Promise<string> {
  const entry = findRoute(route);
  if (!entry) {
    throw new Error(`Cannot prerender unknown route ${route}`);
  }
  const Page = await loadPage(entry);
  if (embed && !needsEmbed(route)) {
    throw new Error(`Route does not need an embed document: ${route}`);
  }
  const location = `${basePath}${route}${embed ? 'embed.html?embed=1' : ''}`;
  return renderToString(
    <StaticRouter basename={`${basePath}/`} location={location}>
      <RouteView entry={entry} Page={Page} embed={embed} />
    </StaticRouter>,
  );
}
