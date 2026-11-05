// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the build API (playbook + the template-first kit).
 */

import {describe, it, expect, vi} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from './build.mjs';
import {search, searchedComponents} from '../search/search.mjs';

// api/build/ -> up 3 = packages/cli, up 4 = repo root (has packages/core).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

// build() delegates to search(), whose first (cold) call is slow under vitest.
vi.setConfig({testTimeout: 30000});

describe('build API', () => {
  it('no query → build.help carries the playbook as data', async () => {
    const r = await build();
    expect(r.type).toBe('build.help');
    if (r.type !== 'build.help') return;
    expect(r.data.playbook).toBe(true);
    expect(r.data.title).toMatch(/build a page/i);
    expect(r.data.steps.length).toBeGreaterThan(0);
    for (const step of r.data.steps) {
      expect(step.title).toBeTruthy();
      expect(step.commands.length).toBeGreaterThan(0);
    }
    expect(r.data.rules.length).toBeGreaterThan(0);
    // Bare subcommands: the caller adds its own invocation.
    const commands = [...r.data.steps.flatMap(s => s.commands), ...r.data.related];
    for (const {command} of commands) expect(command).not.toMatch(/^(astryx|npx|pnpm|yarn|bunx?)\b/);
  });

  it('the playbook scaffolds the named template before composing', async () => {
    const r = await build();
    if (r.type !== 'build.help') throw new Error(r.type);
    const commands = r.data.steps.map(s => s.commands.map(c => c.command));
    expect(commands[0][0]).toMatch(/^build /);
    expect(commands[1]).toContain('template <name> <path>');
    expect(JSON.stringify(r.data)).not.toMatch(/--skeleton|reference code/);
  });

  it('query → build.kit with raw entries + static frame/foundation', async () => {
    const r = await build('dashboard', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.query).toBe('dashboard');
    expect(r.data.hasResults).toBe(true);
    const raw = await search('dashboard', {cwd: REPO, limit: 60});
    expect(r.data.matchCount).toBe(raw.data.matchCount);
    expect(r.data.frame).toContain('AppShell');
    expect(r.data.foundation).toContain('Button');
    expect(Array.isArray(r.data.pages)).toBe(true);

    // Entries are RAW SearchResultEntry objects — never package-manager-prefixed
    // command strings (that formatting is the CLI renderer's job).
    for (const e of [...r.data.pages, ...r.data.blocks, ...r.data.domain]) {
      expect(typeof e.name).toBe('string');
      expect(typeof e.score).toBe('number');
      expect(e.command).not.toMatch(/^(pnpm|npm|yarn|bun|npx)\b/);
    }
  });

  it('excludes always-on frame/foundation names from the domain group', async () => {
    const r = await build('dashboard', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error('expected build.kit');
    const names = r.data.domain.map(d => d.name);
    expect(names).not.toContain('Button');
    expect(names).not.toContain('AppShell');
  });

  it('applies grouping caps, score floors, and directMatch threshold', async () => {
    const r = await build('dashboard', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error('expected build.kit');
    const {pages, blocks, domain, directMatch} = r.data;

    // Caps: pages ≤ 3, blocks ≤ 5, domain ≤ 6.
    expect(pages.length).toBeLessThanOrEqual(3);
    expect(blocks.length).toBeLessThanOrEqual(5);
    expect(domain.length).toBeLessThanOrEqual(6);

    // Score floors: pages ≥ PAGE_FLOOR(50); blocks/domain ≥ DOMAIN_FLOOR(60).
    for (const p of pages) expect(p.score).toBeGreaterThanOrEqual(50);
    for (const b of blocks) expect(b.score).toBeGreaterThanOrEqual(60);
    for (const d of domain) expect(d.score).toBeGreaterThanOrEqual(60);

    // directMatch iff the top page is a confident match (PAGE_DIRECT = 95).
    expect(directMatch).toBe(pages.length > 0 && pages[0].score >= 95);

    // Domain partitioning: pages = non-block templates, blocks = block templates,
    // domain = components/hooks.
    for (const p of pages) {
      expect(p.domain).toBe('template');
      expect(p.kind).not.toBe('block');
    }
    for (const b of blocks) {
      expect(b.domain).toBe('template');
      expect(b.kind).toBe('block');
    }
    for (const d of domain) expect(['component', 'hook']).toContain(d.domain);
  });

  it('keeps raw matches when every result is filtered out of the kit', async () => {
    const r = await build('color', {cwd: REPO, type: 'doc'});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.hasResults).toBe(true);
    expect(r.data.matchCount).toBeGreaterThan(0);
    expect(r.data.pages).toHaveLength(0);
    expect(r.data.blocks).toHaveLength(0);
    expect(r.data.domain).toHaveLength(0);
  });

  it('no matches → build.kit with hasResults=false and empty groups', async () => {
    const r = await build('zzznomatch99', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.hasResults).toBe(false);
    expect(r.data.matchCount).toBe(0);
    expect(r.data.pages).toHaveLength(0);
    expect(r.data.blocks).toHaveLength(0);
    expect(r.data.domain).toHaveLength(0);
  });

  it('reports the total match count, not the search limit it was capped to', async () => {
    // The regression: matchCount was the length of the LIMITED result list, so
    // it reported the cap rather than what the query matched. A reader (and
    // the recorded run that quotes it) then reads "this idea matched 1 thing"
    // for a query that matched dozens, and cannot tell a thin kit caused by a
    // narrow query from one caused by the cap.
    const capped = await build('dashboard', {cwd: REPO, limit: 1});
    const full = await build('dashboard', {cwd: REPO, limit: 60});
    if (capped.type !== 'build.kit' || full.type !== 'build.kit') {
      throw new Error('expected build.kit');
    }
    expect(capped.data.matchCount).toBe(full.data.matchCount);
    expect(capped.data.matchCount).toBeGreaterThan(1);

    // The payload still respects the limit it was given — the truthful count
    // is not an excuse to return an unbounded kit.
    const surfaced =
      capped.data.pages.length +
      capped.data.blocks.length +
      capped.data.domain.length;
    expect(surfaced).toBeLessThanOrEqual(1);
  });
});

describe('build kit — reuses the components its search gathered', () => {
  it('keeps them beside the search response, out of its JSON', async () => {
    const all = await search('date picker', {cwd: REPO});
    expect(searchedComponents(all)?.map(c => c.name)).toContain('DateRangeInput');
    expect(JSON.stringify(all)).not.toContain('"keywords"');
    const pagesOnly = await search('date picker', {cwd: REPO, type: 'template'});
    expect(searchedComponents(pagesOnly)).toBeNull();
  }, 60_000);
});

describe('build kit — coverage gates the pages group', () => {
  it('does not call a one-word coincidence a direct match', async () => {
    // A page's keywords include every component its source renders, so any
    // page that happens to render a Banner keyword-matched "banner" at 90 —
    // which, plus the coverage garnish, landed exactly on PAGE_DIRECT. Three
    // pages that are not warnings were presented as a confident direct match.
    const r = await build('actionable warning banner', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(false);
    for (const p of r.data.pages) {
      expect(['login', 'contact-form', 'documentation-design']).not.toContain(p.name);
    }
  });

  it('still reports a direct match when the page really does answer the query', async () => {
    const r = await build('contact form', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(true);
    expect(r.data.pages.length).toBeGreaterThan(0);
    for (const page of r.data.pages) {
      expect(page).not.toHaveProperty('matchedTerms');
      expect(page).not.toHaveProperty('queryTerms');
    }
  });

  it('does not call a page that only mentions every word a direct match', async () => {
    // `empty state` and `command palette` name components. A page whose text
    // mentions both words, or that renders the component, is a layout
    // reference, not the page the reader asked for.
    for (const query of ['empty state', 'command palette']) {
      const r = await build(query, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error('expected build.kit');
      expect(r.data.directMatch, query).toBe(false);
    }
  });

  it('keeps the page and component a query names first', async () => {
    const pageOf = async (/** @type {string} */ query) => {
      const r = await build(query, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error('expected build.kit');
      return r.data;
    };
    expect((await pageOf('checkout flow')).pages[0]).toMatchObject({name: 'checkout-wizard'});
    expect((await pageOf('sign in with sso')).pages[0]).toMatchObject({name: 'login-sso'});
    expect((await pageOf('search results')).domain.map(e => e.name)).toContain('PowerSearch');
  });

  it('leaves single-concept queries alone (nothing to cover)', async () => {
    const r = await build('dashboard', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.pages.length).toBeGreaterThan(0);
  });
});

describe('build kit — a thin kit says what to try next', () => {
  it('hints when the kit comes back nearly empty', async () => {
    // An agent reading a near-empty kit does not conclude "my wording was
    // wrong" — it concludes the package has nothing and falls back on its own
    // memory of Astryx, which is the failure `build` exists to prevent.
    const r = await build('quantum flux capacitor telemetry', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.pages.length + r.data.blocks.length + r.data.domain.length).toBeLessThan(3);
    expect(r.data.hint?.reason).toMatch(/keyword search/i);
    expect(r.data.hint?.commands).toEqual(['component --list', 'template --list']);
  });

  it('carries no hint when the kit is healthy', async () => {
    const r = await build('dashboard', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.hint).toBeUndefined();
  });

  it('hints for a matched-then-filtered query: hasResults true, nothing offerable', async () => {
    // The case most likely to be misread, and the reason the threshold counts
    // what SURVIVED the floors rather than what search returned.
    const r = await build('hydration', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.hasResults).toBe(true);
    expect(r.data.pages.length + r.data.blocks.length + r.data.domain.length).toBe(0);
    expect(r.data.hint).toBeTruthy();
  });

  it('recommends reading the layout, not scaffolding it, on a loose match', async () => {
    // The kit already decides this: `directMatch` false means the top page is
    // a reference, and the renderer says so in prose. The page's `command` is
    // what a program reads instead of that prose, so it has to agree — before
    // this it still said `template <name>`, the scaffold.
    const r = await build('notifications', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(false);
    expect(r.data.pages.length).toBeGreaterThan(0);
    for (const page of r.data.pages) {
      expect(page.command).toMatch(/--skeleton$/);
    }
  });

  it('still starts from the closest page on a loose match, and scaffolds it', async () => {
    // A skeleton is a 35-line excerpt: a reader who studies it and composes
    // the rest loses the spacing the template exists to carry. A loose match
    // is still the best start there is, so `start` scaffolds it.
    const r = await build('weekly business review with targets', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(false);
    expect(r.data.start).toMatchObject({
      name: 'dashboard-scorecard',
      basis: 'closest',
      command: 'astryx template dashboard-scorecard --type page <path>',
    });
  });

  it('recommends scaffolding on a direct match', async () => {
    const r = await build('contact form', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(true);
    expect(r.data.pages.length).toBeGreaterThan(0);
    expect(r.data.start).toMatchObject({name: r.data.pages[0].name, basis: 'direct'});
    for (const page of r.data.pages) {
      expect(page.command).not.toMatch(/--skeleton/);
    }
  });

  it('keeps the recommendation package-manager-agnostic', async () => {
    // Appending a flag must not turn into prefixing an invocation; that stays
    // the renderer's job.
    const r = await build('executive summary', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    for (const page of r.data.pages) {
      expect(page.command).not.toMatch(/^(pnpm|npm|yarn|bun|npx)\b/);
    }
    expect(r.data.start?.command).not.toMatch(/^(pnpm|npm|yarn|bun|npx)\b/);
  });

  it('keeps recovery commands bare, for the caller to render', async () => {
    // The API cannot know how a project invokes the CLI. A baked-in `astryx
    // component --list` does not resolve in a pnpm workspace.
    const r = await build('quantum flux capacitor telemetry', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    for (const c of r.data.hint?.commands ?? []) {
      expect(c).not.toMatch(/^astryx\b/);
      expect(c).not.toMatch(/pnpm|npx|yarn|bun/);
    }
  });
});

describe('build kit — every page starts from a template', () => {
  it('falls back to the app shell when no page template matches', async () => {
    // Before, an unmatched idea got "compose from AppShell": the one path
    // with no frame, no spacing, and no section rhythm.
    const r = await build('zzznomatch99', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.hasResults).toBe(false);
    expect(r.data.start).toMatchObject({
      name: 'shell-top-nav',
      basis: 'fallback',
      command: 'astryx template shell-top-nav --type page <path>',
    });
    expect(r.data.start?.description).toBeTruthy();
  });

  it('starts a long idea from the family its words name', async () => {
    // The coverage gate cannot tell layout words from subject matter: every
    // dashboard covers one term of three, so search offers no page at all.
    // The ranker still starts the page from the dashboard.
    const r = await build('quarterly revenue dashboard', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start).toMatchObject({name: 'dashboard', basis: 'closest'});
    expect(r.data.directMatch).toBe(false);
  });

  it('does not start from a direct match that is not ready yet, and says so', async () => {
    const r = await build('incident console', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(true);
    expect(r.data.pages[0].name).toBe('incident-console');
    expect(r.data.start?.name).not.toBe('incident-console');
    expect(r.data.start?.reason).toMatch(/`incident-console` matches but is not ready yet/);
  });

  it('does not start from a page that matched one incidental word', async () => {
    // A work-item detail page mentions a feed in its description. That is a
    // worse start for a news feed than the app shell.
    const r = await build('news feed', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start?.basis).toBe('fallback');
  });

  it('starts a part from the page it is placed in, else from the app shell', async () => {
    const placed = await build('an empty state for a settings page', {cwd: REPO});
    if (placed.type !== 'build.kit') throw new Error(placed.type);
    expect(placed.data.start).toMatchObject({name: 'settings', basis: 'closest'});
    expect(placed.data.start?.reason).toMatch(/part of a page, so it starts from the page it names/);
    const loose = await build('a date range picker', {cwd: REPO});
    if (loose.type !== 'build.kit') throw new Error(loose.type);
    expect(loose.data.start).toMatchObject({name: 'shell-top-nav', basis: 'fallback'});
    expect(loose.data.start?.reason).toMatch(/part of a page and names no page, so it starts from the app shell/);
  });

  it('starts a change to an existing page from the app shell', async () => {
    // The page is the builder's to keep; no template scaffolds it.
    const r = await build('add a sort toggle to the existing reports dashboard', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.start).toMatchObject({name: 'shell-top-nav', basis: 'fallback'});
    expect(r.data.start?.reason).toMatch(/changes a page you already have, so keep it/);
    expect(r.data.start?.reason).not.toMatch(/too little of the idea fits/);
    // A direct match the response reports is still named.
    if (r.data.directMatch) expect(r.data.start?.reason).toContain(`\`${r.data.pages[0].name}\``);
  });

  it('does not call a new page that mentions something existing a change', async () => {
    for (const idea of [
      'a new dashboard inspired by the existing one',
      'a new dashboard based on the existing dashboard',
      'clone the existing dashboard as a new page',
    ]) {
      const r = await build(idea, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      expect(r.data.start?.name).toBe('dashboard');
      expect(r.data.start?.reason).not.toMatch(/already have/);
    }
  });

  it('names a direct match the ranker outweighed in the reason', async () => {
    const r = await build('dashboard with a login form', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.directMatch).toBe(true);
    expect(r.data.pages[0].name).toBe('login');
    expect(r.data.start).toMatchObject({name: 'dashboard', basis: 'closest'});
    expect(r.data.start?.reason).toContain('`login`');
  });

  it('names the loose page matches when it falls back to the shell', async () => {
    const r = await build('news feed', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.pages.length).toBeGreaterThan(0);
    expect(r.data.start?.basis).toBe('fallback');
    for (const page of r.data.pages) expect(r.data.start?.reason).toContain(`\`${page.name}\``);
  });

  it('never gives a reason that denies a match the response reports', async () => {
    for (const q of ['news feed', 'dashboard with a login form', 'user profile', 'incident console']) {
      const r = await build(q, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      if (r.data.pages.length) expect(r.data.start?.reason).not.toMatch(/No template matched/);
      if (r.data.directMatch) expect(r.data.start?.reason).not.toMatch(/none is exactly this page/);
    }
  });

  it('names no start when the kit is narrowed to components', async () => {
    const r = await build('dashboard', {cwd: REPO, type: 'component'});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start).toBeNull();
  });



  it('keeps incidental description matches out of blocks and components', async () => {
    // Toast, Popover and TextInput all say "brief" somewhere in their
    // descriptions; none of them is part of a brief.
    const r = await build('weekly brief', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    const names = [...r.data.blocks, ...r.data.domain].map(e => e.name);
    for (const noise of ['Toast', 'Popover', 'TextInput']) expect(names).not.toContain(noise);
  });

  it('names the ranker\'s next two templates beside every start', async () => {
    for (const idea of ['quarterly revenue dashboard', 'contact form']) {
      const r = await build(idea, {cwd: REPO});
      expect(r.type).toBe('build.kit');
      if (r.type !== 'build.kit') return;
      const alternatives = r.data.start?.alternatives ?? [];
      expect(alternatives.length).toBeGreaterThan(0);
      expect(alternatives.length).toBeLessThanOrEqual(2);
      for (const alt of alternatives) {
        expect(alt.name).not.toBe(r.data.start?.name);
        expect(alt.description).toBeTruthy();
        expect(alt.command).toBe(`astryx template ${alt.name} --type page <path>`);
      }
    }
  });

  it('calls a start direct only when search and the ranker agree', async () => {
    const r = await build('contact form', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.directMatch).toBe(true);
    expect(r.data.start).toMatchObject({name: r.data.pages[0].name, basis: 'direct'});
  });

  it('never lets a noisy search match pick the start', async () => {
    // Search once matched "site" to the gallery's "side" and started a
    // navigation bar from a gallery. The ranker alone picks the start now.
    const r = await build('horizontal site navigation with a current section indicator', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start?.name).toBe('shell-top-nav');
    expect(r.data.pages.map(p => p.name)).not.toContain('side-gallery');
  });

  it('names a direct match the start does not use, and calls the start direct only when it is', async () => {
    for (const idea of ['a login form', 'a docs site for our API', 'contact form']) {
      const r = await build(idea, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      expect(r.data.directMatch).toBe(true);
      const match = r.data.pages[0].name;
      if (r.data.start?.name === match) {
        expect(r.data.start?.basis).toBe('direct');
      } else {
        expect(['closest', 'fallback']).toContain(r.data.start?.basis);
        expect(r.data.start?.reason).toContain(`\`${match}\``);
      }
    }
  });

  it('keeps a template search matched directly rather than the app shell', async () => {
    for (const [idea, name] of [
      ['a login screen', 'login'],
      ['a checkout wizard', 'checkout-wizard'],
    ]) {
      const r = await build(idea, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      expect(r.data.directMatch).toBe(true);
      expect(r.data.start?.name).toBe(name);
    }
  });

  it('lets the weights choose another template over a direct match', async () => {
    const r = await build('a login form', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.directMatch).toBe(true);
    const match = r.data.pages[0].name;
    expect(r.data.start?.name).not.toBe('shell-top-nav');
    expect(r.data.start?.name).not.toBe(match);
    expect(r.data.start?.reason).toContain(`\`${match}\``);
  });

  it('starts a part that names no page from the app shell', async () => {
    for (const idea of ['a kanban card', 'a date range picker']) {
      const r = await build(idea, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      expect(r.data.start).toMatchObject({name: 'shell-top-nav', basis: 'fallback'});
      expect(r.data.start?.reason).toMatch(/part of a page/);
    }
  });

  it('does not keep a loose match over the app shell', async () => {
    // Search matches no template directly, so the ranker's closest page does
    // not override the shell the weights choose.
    const r = await build('quarterly business review', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.directMatch).toBe(false);
    expect(r.data.start).toMatchObject({name: 'shell-top-nav', basis: 'fallback'});
    expect(r.data.start?.reason).toMatch(/closest/);
  });

  it('starts a new page with no matching template from the app shell', async () => {
    const r = await build('a new page', {cwd: REPO});
    if (r.type !== 'build.kit') throw new Error(r.type);
    expect(r.data.start?.name).toBe('shell-top-nav');
  });

  it('starts a page the words describe from its template', async () => {
    for (const [idea, name] of [
      ['a weekly report of sales by region', 'dashboard-scorecard'],
      ['a pricing page with three plans and a comparison table', 'table-comparison'],
    ]) {
      const r = await build(idea, {cwd: REPO});
      if (r.type !== 'build.kit') throw new Error(r.type);
      expect(r.data.start?.name).toBe(name);
    }
  });

  it('starts a component in a container from a template with that frame', async () => {
    // "in a modal": the modal is the frame, so the dialog template leads
    // instead of the app shell.
    const r = await build('saved drafts in a modal with resume and delete row actions', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start?.name).toBe('settings-dialog');
  });

  it('does not start from a template named only by a word that modifies another', async () => {
    // "product" describes the response; it is not a product page.
    const r = await build('an interactive command catalog with side-by-side product response and trace', {cwd: REPO});
    expect(r.type).toBe('build.kit');
    if (r.type !== 'build.kit') return;
    expect(r.data.start?.name).not.toMatch(/^product-/);
  });
});
