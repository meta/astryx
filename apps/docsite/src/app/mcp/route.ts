// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file MCP Server route handler — hybrid v2 (search + get).
 *
 * Two tools:
 *   - search(): curated brief results with keyword-based resolution and scoring
 *   - get(): full component/topic/template details with examples
 *
 * Key features:
 *   - Keyword index derived from component .doc.mjs `keywords` fields
 *   - Compound component awareness (Table → sorting/selection hooks)
 *   - Context budget control (~1.5K tokens per brief result)
 *   - Showcase examples included in get() responses
 *
 * Transport: Streamable HTTP (via mcp-handler)
 */

import {createMcpHandler} from 'mcp-handler';
import {z} from 'zod';
import {components} from '../../generated/componentRegistry';
import {docTopics} from '../../generated/docsRegistry';
import {blocks} from '../../generated/blockRegistry';
import {templates} from '../../generated/templateRegistry';
import {buildKeywordIndex, resolveKeywords} from './keywordIndex';

import type {ComponentEntry} from '../../generated/componentRegistry';
import type {DocTopic} from '../../generated/docsRegistry';
import type {BlockEntry} from '../../generated/blockRegistry';
import type {TemplateEntry} from '../../generated/templateRegistry';

const allComponents: ComponentEntry[] = Object.values(components).flat();
const visibleComponents = allComponents.filter(c => !c.hidden);

function componentImport(comp: ComponentEntry): string {
  const importPath = comp.importPath ?? `@astryxdesign/core/${comp.name}`;
  return `import {${comp.moduleName}} from '${importPath}';`;
}

function componentInstall(comp: ComponentEntry): string {
  const importPath = comp.importPath ?? '@astryxdesign/core';
  const packageName = /^@[^/]+\/[^/]+/.exec(importPath)?.[0] ?? importPath;
  return `npm install ${packageName}${comp.isReady ? '' : '@canary'}`;
}

// ── Keyword Index ──────────────────────────────────────────────────────
// Built from the `keywords` field on each component's .doc.mjs file.
// Inverts keyword[] → component name so natural language queries resolve
// to the right components without a hardcoded alias map.
const keywordIndex = buildKeywordIndex(visibleComponents);

// ── Scoring ────────────────────────────────────────────────────────────

function score(text: string, query: string): number {
  const lower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  if (lower === queryLower) {
    return 100;
  }
  if (lower.startsWith(queryLower)) {
    return 90;
  }
  if (lower.includes(queryLower)) {
    return 85;
  }

  const words = queryLower.split(/\s+/).filter(w => w.length > 1);
  if (words.length === 0) {
    return 0;
  }

  let matched = 0;
  for (const word of words) {
    if (lower.includes(word)) {
      matched++;
    }
  }

  const ratio = matched / words.length;
  if (ratio === 1) {
    return 75;
  }
  if (ratio >= 0.5) {
    return 50;
  }
  if (ratio > 0) {
    return 30;
  }
  return 0;
}

// ── Context Budget ─────────────────────────────────────────────────────
const MAX_TOPIC_BRIEF_CHARS = 4000;

const handler = createMcpHandler(
  server => {
    // ══════════════════════════════════════════════════════════════════
    // Tool 1: search
    // ══════════════════════════════════════════════════════════════════
    server.tool(
      'search',
      `Search Astryx (XDS) design system: finds components, documentation topics, and page templates.\n\n` +
        `Returns brief results (name, description, key info). Components include isReady and the required install command; components that are not ready install from @canary. Use the "get" tool with a ` +
        `specific name for full details including props and code examples.\n\n` +
        `Examples: "dropdown menu", "form inputs", "theming", "dashboard template", ` +
        `"sidebar navigation", "toast notification", "table with sorting", "success message"`,
      {
        query: z.string().describe('Natural language search query.'),
        limit: z.number().optional().describe('Max results (default 8).'),
      },
      async ({query, limit = 8}) => {
        const keywordMatches = resolveKeywords(keywordIndex, query);

        const scored: Array<{
          item: ComponentEntry | DocTopic | TemplateEntry;
          score: number;
          type: 'component' | 'doc' | 'template';
        }> = [];

        // Score components
        for (const comp of visibleComponents) {
          // Name and description matching (always checked)
          const nameScore = score(comp.name, query);
          const descScore = score(comp.description, query);
          const kwTextScore = Math.max(
            ...comp.keywords.map(k => score(k, query)),
            0,
          );

          // Keyword index boost: 90 for exact keyword match (matches CLI parity)
          const kwBoost = keywordMatches.includes(comp.name) ? 90 : 0;

          let best = Math.max(nameScore, descScore, kwTextScore, kwBoost);

          // Demote sub-components so parent entries surface first in ties.
          // E.g. "modal" → Dialog (parent) should rank above DialogHeader (sub).
          if (best > 0 && comp.parentDoc && comp.name !== comp.parentDoc) {
            best = Math.min(best, best - 1);
          }

          if (best > 0) {
            scored.push({item: comp, score: best, type: 'component'});
          }
        }

        // Score docs
        for (const doc of docTopics) {
          const topicScore = score(doc.topic, query);
          const titleScore = score(doc.title, query);
          const descScore = score(doc.description, query);
          const sectionScore = Math.max(
            ...doc.sections.map(s => score(s.title, query) * 0.8),
            0,
          );
          const best = Math.max(
            topicScore,
            titleScore,
            descScore,
            sectionScore,
          );
          if (best > 0) {
            scored.push({item: doc, score: best, type: 'doc'});
          }
        }

        // Score templates
        for (const t of templates) {
          const nameScore = score(t.name, query);
          const descScore = score(t.description, query);
          const best = Math.max(nameScore, descScore);
          if (best > 0) {
            scored.push({item: t, score: best, type: 'template'});
          }
        }

        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, limit);

        if (top.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  results: [],
                  hint: 'No results. Try: a component name (Button, Table, Dialog), a topic (theming, spacing, color), or a template (dashboard, settings).',
                }),
              },
            ],
          };
        }

        const results = top.map(entry => {
          if (entry.type === 'component') {
            const comp = entry.item as ComponentEntry;
            return {
              type: 'component',
              name: comp.name,
              moduleName: comp.moduleName,
              group: comp.group,
              description: comp.description,
              isReady: comp.isReady,
              install: componentInstall(comp),
              import: componentImport(comp),
              keyProps: comp.props
                .filter(
                  p =>
                    p.required ||
                    p.name === 'variant' ||
                    p.name === 'size' ||
                    p.name === 'label' ||
                    p.name === 'value' ||
                    p.name === 'onChange',
                )
                .slice(0, 6)
                .map(p => `${p.name}${p.required ? '*' : ''}: ${p.type}`),
              ...(comp.params && comp.params.length > 0
                ? {
                    returns: (comp.returns ?? []).map(
                      r => `${r.name}: ${r.type}`,
                    ),
                  }
                : {}),
              ...((comp.relatedComponents ?? []).length > 0
                ? {
                    relatedComponents: (comp.relatedComponents ?? []).slice(
                      0,
                      4,
                    ),
                  }
                : {}),
              ...((comp.relatedHooks ?? []).length > 0
                ? {relatedHooks: (comp.relatedHooks ?? []).slice(0, 3)}
                : {}),
              hint: `Use get("${comp.name}") for full props, usage, and examples.`,
            };
          } else if (entry.type === 'doc') {
            const doc = entry.item as DocTopic;
            return {
              type: 'doc',
              topic: doc.topic,
              title: doc.title,
              description: doc.description,
              sections: doc.sections.map(s => s.title),
              hint: `Use get("${doc.topic}") for full content, or get("${doc.topic}", { section: "..." }) for a specific section.`,
            };
          } else {
            const t = entry.item as TemplateEntry;
            return {
              type: 'template',
              slug: t.slug,
              name: t.name,
              description: t.description,
              hint: `Use get("${t.slug}") for full template source code.`,
            };
          }
        });

        return {
          content: [{type: 'text' as const, text: JSON.stringify(results)}],
        };
      },
    );

    // ══════════════════════════════════════════════════════════════════
    // Tool 2: get
    // ══════════════════════════════════════════════════════════════════
    server.tool(
      'get',
      `Get full documentation for a specific Astryx (XDS) component, doc topic, or template by name.\n\n` +
        `Returns complete props, usage guidelines, code examples, theming info, isReady, and the required install command. Components that are not ready install from @canary.\n\n` +
        `For doc topics, optionally pass a section name to get just that section ` +
        `(recommended for large topics like "theme" to avoid context overload).\n\n` +
        `Examples:\n` +
        `- get("Button") → full Button docs with all props and examples\n` +
        `- get("useToast") → hook docs with usage pattern\n` +
        `- get("theme", { section: "defineTheme" }) → just the defineTheme API\n` +
        `- get("settings") → template source code\n` +
        `- get("Table") → full Table docs including sorting/selection hooks`,
      {
        name: z
          .string()
          .describe(
            'Component name (e.g. "Button", "useToast"), doc topic (e.g. "theme", "spacing"), or template slug (e.g. "settings").',
          ),
        section: z
          .string()
          .optional()
          .describe(
            'For doc topics: return only this section (case-insensitive substring match). Recommended for large topics.',
          ),
      },
      async ({name, section}) => {
        const normalized = name.replace(/^XDS/i, '');
        const lower = normalized.toLowerCase();

        // ── Try component match ──────────────────────────────────────
        const comp = visibleComponents.find(
          c =>
            c.name.toLowerCase() === lower ||
            c.moduleName.toLowerCase() === `xds${lower}` ||
            c.moduleName.toLowerCase() === lower,
        );

        if (comp) {
          // Find showcase example — search by name, then by directory/group for hooks
          const exampleNames = [
            comp.name.toLowerCase(),
            ...(comp.directory ? [comp.directory.toLowerCase()] : []),
            ...(comp.group && comp.group !== comp.name
              ? [comp.group.toLowerCase()]
              : []),
          ];

          const showcase = blocks.find(
            (b: BlockEntry) =>
              b.exampleFor != null &&
              exampleNames.includes(b.exampleFor.toLowerCase()) &&
              b.isShowcase,
          );

          // Find related blocks (non-showcase, limit 1 for budget)
          const relatedBlocks = blocks
            .filter(
              (b: BlockEntry) =>
                b.exampleFor != null &&
                exampleNames.includes(b.exampleFor.toLowerCase()) &&
                !b.isShowcase,
            )
            .slice(0, 1);

          // For compound components (e.g. Table group), include related hooks/components
          const groupMembers = comp.group
            ? visibleComponents.filter(
                c =>
                  c.group === comp.group && c.name !== comp.name && !c.hidden,
              )
            : [];

          const result = {
            name: comp.name,
            moduleName: comp.moduleName,
            import: componentImport(comp),
            group: comp.group,
            description: comp.description,
            isReady: comp.isReady,
            install: componentInstall(comp),
            props: comp.props,
            usage: comp.usage,
            theming: comp.theming,
            relatedComponents: comp.relatedComponents,
            relatedHooks: comp.relatedHooks,
            ...(comp.params
              ? {params: comp.params, returns: comp.returns}
              : {}),
            ...(showcase
              ? {
                  example: {
                    name: showcase.name,
                    description: showcase.description,
                    source: showcase.source,
                  },
                }
              : {}),
            ...(relatedBlocks.length > 0
              ? {
                  moreExamples: relatedBlocks.map(b => ({
                    name: b.name,
                    description: b.description,
                    source: b.source,
                  })),
                }
              : {}),
            ...(groupMembers.length > 0
              ? {
                  groupMembers: groupMembers.slice(0, 6).map(m => ({
                    name: m.name,
                    moduleName: m.moduleName,
                    import: componentImport(m),
                    description: m.description.slice(0, 120),
                    isReady: m.isReady,
                    install: componentInstall(m),
                    ...(m.params
                      ? {
                          returns: (m.returns ?? [])
                            .slice(0, 2)
                            .map(r => `${r.name}: ${r.type}`),
                        }
                      : {}),
                  })),
                }
              : {}),
          };

          return {
            content: [{type: 'text' as const, text: JSON.stringify(result)}],
          };
        }

        // ── Try doc topic match ──────────────────────────────────────
        const doc = docTopics.find(
          (d: DocTopic) => d.topic.toLowerCase() === lower,
        );

        if (doc) {
          // If section requested, return just that section
          if (section) {
            const match = doc.sections.find(s =>
              s.title.toLowerCase().includes(section.toLowerCase()),
            );
            if (!match) {
              return {
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({
                      error: `Section "${section}" not found in "${doc.topic}".`,
                      available: doc.sections.map(s => s.title),
                    }),
                  },
                ],
                isError: true,
              };
            }
            return {
              content: [{type: 'text' as const, text: JSON.stringify(match)}],
            };
          }

          // Full topic — guard against context bombs
          const fullJson = JSON.stringify(doc);
          if (fullJson.length > MAX_TOPIC_BRIEF_CHARS) {
            const overview = doc.sections[0];
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(
                    {
                      topic: doc.topic,
                      title: doc.title,
                      description: doc.description,
                      overview: overview,
                      sections: doc.sections.map(s => s.title),
                      hint: `This topic is large (${doc.sections.length} sections). Use get("${doc.topic}", { section: "..." }) for specific sections to avoid context overload.`,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }

          return {
            content: [{type: 'text' as const, text: JSON.stringify(doc)}],
          };
        }

        // ── Try template match ───────────────────────────────────────
        const template = templates.find(
          (t: TemplateEntry) =>
            t.slug?.toLowerCase() === lower || t.name.toLowerCase() === lower,
        );

        if (template) {
          const templateBlocks = blocks
            .filter((b: BlockEntry) => b.exampleFor === template.slug)
            .slice(0, 3);

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(
                  {
                    slug: template.slug,
                    name: template.name,
                    description: template.description,
                    ...(templateBlocks.length > 0
                      ? {
                          examples: templateBlocks.map(b => ({
                            name: b.name,
                            source: b.source,
                          })),
                        }
                      : {
                          // Fall back to template source if it exists
                          ...(template.source
                            ? {
                                source: (
                                  template as TemplateEntry & {source?: string}
                                ).source,
                              }
                            : {}),
                        }),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // ── Fuzzy fallback with keyword awareness ──────────────────────
        const keywordResolved = resolveKeywords(keywordIndex, name);
        const keywordComponents =
          keywordResolved.length > 0
            ? visibleComponents
                .filter(c => keywordResolved.includes(c.name))
                .map(c => ({
                  name: c.name,
                  moduleName: c.moduleName,
                  import: componentImport(c),
                  description: c.description,
                  isReady: c.isReady,
                  install: componentInstall(c),
                }))
            : [];

        if (keywordComponents.length > 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  note: `"${name}" is not an exact component name. Did you mean one of these?`,
                  suggestions: keywordComponents,
                  hint: 'Use get() with the exact component name from the suggestions above.',
                }),
              },
            ],
          };
        }

        const suggestions = visibleComponents
          .filter(
            c =>
              c.name.toLowerCase().includes(lower) ||
              lower.includes(c.name.toLowerCase()),
          )
          .slice(0, 5)
          .map(c => c.name);

        const docSuggestions = docTopics
          .filter((d: DocTopic) => d.topic.toLowerCase().includes(lower))
          .map(d => d.topic);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `"${name}" not found.`,
                ...(suggestions.length > 0
                  ? {similarComponents: suggestions}
                  : {}),
                ...(docSuggestions.length > 0
                  ? {similarTopics: docSuggestions}
                  : {}),
                hint: 'Use search() to discover available components, topics, and templates.',
              }),
            },
          ],
          isError: true,
        };
      },
    );
  },
  {
    capabilities: {tools: {}},
    serverInfo: {
      name: 'astryx',
      version: '2.0.0',
    },
  },
  {
    basePath: '',
    maxDuration: 60,
    disableSse: true,
    verboseLogs: process.env.NODE_ENV === 'development',
  },
);

export {handler as GET, handler as POST, handler as DELETE};
