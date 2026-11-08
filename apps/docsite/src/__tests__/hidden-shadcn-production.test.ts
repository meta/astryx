// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Hidden production ShadCN discovery contract.
 *
 * Runs after latest-target data generation. The registry JSON must exist for
 * know-the-URL soak testing while every ordinary discovery surface stays clean.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';

vi.mock('next/cache', () => ({cacheLife: () => {}}));
const VERIFY_HIDDEN_PRODUCTION =
  process.env.ASTRYX_VERIFY_HIDDEN_PRODUCTION === '1';
if (VERIFY_HIDDEN_PRODUCTION) {
  process.env.NEXT_PUBLIC_DOCS_TARGET = 'latest';
}

const root = path.resolve(import.meta.dirname, '../..');
const [
  {default: robots},
  {default: sitemap},
  {GET: getLlmsTxt},
  {GET: getRss},
  {POST: postMcp},
  {GET: getSearch},
  {CURRENT_TARGET},
  {components},
  {blocks},
  {templates},
  {docTopics},
  {blogPosts},
  {showcaseRegistry},
  {exampleRegistry},
  {shadcnRegistryIsPreview, shadcnRegistryOrigin},
  {flattenComponentSidebarEntries},
] = await Promise.all([
  import('../app/robots'),
  import('../app/sitemap'),
  import('../app/llms.txt/route'),
  import('../app/rss.xml/route'),
  import('../app/mcp/route'),
  import('../app/api/search/route'),
  import('../lib/docsVersions'),
  import('../generated/componentRegistry'),
  import('../generated/blockRegistry'),
  import('../generated/templateRegistry'),
  import('../generated/docsRegistry'),
  import('../generated/blogRegistry'),
  import('../generated/showcaseRegistry'),
  import('../generated/exampleRegistry'),
  import('../generated/shadcnRegistry'),
  import('../components/componentSidebarData'),
]);

const FORBIDDEN_DISCOVERY_PATTERNS = [
  {
    label: 'registry URL',
    pattern: /\/shadcn(?:\/|["'`])/i,
  },
  {label: 'compatibility topic', pattern: /shadcn-compatibility/i},
  {label: 'launch post', pattern: /meet-astryx-from-shadcn/i},
  {
    label: 'registry install command',
    pattern: /\b(?:npx|pnpm dlx|yarn dlx|bunx)\s+shadcn(?:@|\s)/i,
  },
];

function expectNoRegistryDiscovery(value: unknown, surface: string): void {
  const serialized = JSON.stringify(value).replaceAll('\\"', '"');
  for (const {label, pattern} of FORBIDDEN_DISCOVERY_PATTERNS) {
    expect(serialized, `${surface} contains ${label}`).not.toMatch(pattern);
  }
}

function expectNoShadcnPromotion(value: unknown, surface: string): void {
  expectNoRegistryDiscovery(value, surface);
  expect(
    JSON.stringify(value),
    `${surface} contains generic ShadCN promotion`,
  ).not.toMatch(/shadcn/i);
}

interface McpResponse {
  error?: unknown;
  result?: {
    content?: Array<{type?: string; text?: string}>;
  };
}

function mcpPayload(response: McpResponse): unknown {
  expect(response.error).toBeUndefined();
  const textItems = (response.result?.content ?? []).filter(
    item => item.type === 'text' && typeof item.text === 'string',
  );
  expect(textItems).toHaveLength(1);
  return JSON.parse(textItems[0].text!);
}

function registryItemPaths(value: unknown, seen = new Set<object>()): string[] {
  if (value == null || typeof value !== 'object') {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  const paths: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === 'registryItemPath' && typeof child === 'string') {
      paths.push(child);
    }
    paths.push(...registryItemPaths(child, seen));
  }
  return paths;
}

async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
): Promise<McpResponse> {
  const response = await postMcp(
    new Request('https://astryx.atmeta.com/mcp', {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {name, arguments: args},
      }),
    }),
  );
  const text = await response.text();
  expect(response.status, text).toBe(200);

  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    return text
      .split('\n')
      .filter(line => line.startsWith('data: '))
      .map(line => JSON.parse(line.slice('data: '.length)))
      .at(-1) as McpResponse;
  }
  return JSON.parse(text) as McpResponse;
}

const describeHiddenProduction = VERIFY_HIDDEN_PRODUCTION
  ? describe
  : describe.skip;

describeHiddenProduction('hidden production ShadCN discovery', () => {
  it('rejects generic promotion while allowing migration-only references', () => {
    expect(() =>
      expectNoShadcnPromotion(
        {title: 'Install Astryx with ShadCN'},
        'mutation probe',
      ),
    ).toThrow();
    expect(() =>
      expectNoRegistryDiscovery(
        {description: 'Migrate a Tailwind/shadcn app to Astryx.'},
        'migration probe',
      ),
    ).not.toThrow();
  });

  it('serves the stable registry only to clients that know its URL', () => {
    expect(CURRENT_TARGET).toBe('latest');
    expect(shadcnRegistryIsPreview).toBe(false);
    expect(shadcnRegistryOrigin).toBe('https://astryx.atmeta.com/shadcn');

    const registry = JSON.parse(
      fs.readFileSync(path.join(root, 'public/shadcn/registry.json'), 'utf8'),
    );
    expect(registry.items.length).toBeGreaterThan(0);
    expect(robots().rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/playground/preview', '/shadcn/'],
    });
  });

  it('keeps generated docs, blog, navigation, and search indexes clean', () => {
    const sidebar = flattenComponentSidebarEntries().map(entry => ({
      href: entry.href,
      label: entry.displayName,
    }));
    expectNoShadcnPromotion(
      docTopics.map(topic => ({topic: topic.topic, title: topic.title})),
      'docs navigation',
    );
    expectNoShadcnPromotion(
      blogPosts.map(post => ({slug: post.slug, title: post.title})),
      'blog indexes',
    );
    expectNoShadcnPromotion(sidebar, 'component navigation');
  });

  it('keeps the site search (astryx search) free of registry promotion', async () => {
    // Like the MCP search below, it may name ShadCN only inside the CLI's own
    // docs (the migration guide); it never points at the registry.
    const response = await getSearch(
      new Request('http://site/api/search?q=shadcn%20registry%20install'),
    );
    const {data} = (await response.json()) as {
      data: {results: Array<Record<string, unknown>>};
    };
    expectNoRegistryDiscovery(data, 'site search');
    for (const result of data.results) {
      if (/shadcn/i.test(JSON.stringify(result))) {
        expect(result).toMatchObject({
          domain: 'doc',
          package: '@astryxdesign/cli',
        });
      }
    }
  }, 60_000);

  it('keeps sitemap, RSS, and llms.txt clean', async () => {
    const sitemapEntries = await sitemap();
    const rss = await (await getRss()).text();
    const llmsTxt = await (await getLlmsTxt()).text();

    expectNoShadcnPromotion(sitemapEntries, 'sitemap');
    expectNoShadcnPromotion(rss, 'RSS');
    expectNoShadcnPromotion(llmsTxt, 'llms.txt');
  });

  it('exercises the real MCP tools without exposing registry promotion', async () => {
    const search = mcpPayload(
      await callMcpTool('search', {
        query: 'shadcn registry install',
        limit: 50,
      }),
    );
    expect(Array.isArray(search)).toBe(true);
    for (const result of search as Array<Record<string, unknown>>) {
      if (/shadcn/i.test(JSON.stringify(result))) {
        expect(result).toMatchObject({type: 'doc', topic: 'migration'});
        expectNoRegistryDiscovery(result, 'allowed MCP migration result');
      } else {
        expectNoShadcnPromotion(result, 'real MCP search result');
      }
    }

    for (const name of ['Button', 'settings']) {
      const result = mcpPayload(await callMcpTool('get', {name}));
      expectNoShadcnPromotion(result, `real MCP get(${name}) response`);
    }

    const migration = mcpPayload(await callMcpTool('get', {name: 'migration'}));
    expect(JSON.stringify(migration)).toMatch(/shadcn/i);
    expectNoRegistryDiscovery(migration, 'allowed MCP migration guide');

    expectNoShadcnPromotion(
      {components, blocks, templates},
      'complete MCP component and template registries',
    );
    const migrationTopic = docTopics.find(topic => topic.topic === 'migration');
    expect(migrationTopic).toBeDefined();
    expectNoRegistryDiscovery(migrationTopic, 'allowed migration topic');
    expectNoShadcnPromotion(
      docTopics.filter(topic => topic.topic !== 'migration'),
      'all other MCP doc topics',
    );
  });

  it('omits install paths from component, block, example, and template UI data', () => {
    const componentUi = fs.readFileSync(
      path.join(
        root,
        'src/components/component-detail/ComponentDetailClient.tsx',
      ),
      'utf8',
    );
    const templateUi = fs.readFileSync(
      path.join(root, 'src/components/TemplatePreviewDialog.tsx'),
      'utf8',
    );

    expect(componentUi).toContain(
      "CURRENT_TARGET === 'canary' && pkg && pkgVersion",
    );
    expect(templateUi).not.toMatch(/shadcn/i);
    expect(
      registryItemPaths({blocks, templates, showcaseRegistry, exampleRegistry}),
    ).toEqual([]);
  });
});
