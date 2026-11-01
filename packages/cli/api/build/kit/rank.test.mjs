// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for build's page ranker: long ideas, head nouns, family bases,
 * rare-word weighting, keywords, family words taken from the templates
 * themselves, and parts told from pages by the system's own components.
 */

import {describe, it, expect} from 'vitest';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ideaKind} from './kind.mjs';
import {pickStart, rankPages} from './rank.mjs';
import {loadComponents, loadPageTemplates} from '../_adapter.mjs';

// api/build/kit/ -> up 5 = repo root (has packages/core and the templates).
const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../..',
);

/**
 * @param {string} name
 * @param {string} category
 * @param {string} description
 * @param {string[]} [keywords]
 */
const page = (name, category, description, keywords = []) => ({
  name,
  displayName: name,
  category,
  description,
  keywords,
  command: `astryx template ${name} --type page`,
});

/** @param {string} name @param {string[]} [keywords] */
const component = (name, keywords = []) => ({name, keywords});

describe('rankPages on the shipped page templates', () => {
  /** @param {string} query */
  const start = async query =>
    pickStart(rankPages(query, await loadPageTemplates(REPO)))?.name ?? null;

  it('starts a long dashboard idea from the family base', async () => {
    expect(
      await start(
        'ops dashboard with a KPI row, a sortable table and a trend chart',
      ),
    ).toBe('dashboard');
  });

  it("lets a variant's own words beat the base", async () => {
    expect(
      await start(
        'conversion funnel dashboard with drop-off and retention by cohort',
      ),
    ).toBe('dashboard-cohort-funnel');
    expect(await start('program milestone tracker with delivery status')).toBe(
      'dashboard-progress',
    );
  });

  it('keeps the family base when a variant shares one incidental word', async () => {
    // "comparison" and "cohort" name dashboard variants, but here each is one
    // small part of a general dashboard.
    expect(
      await start(
        'support dashboard with ticket volume charts and a small comparison note',
      ),
    ).toBe('dashboard');
    expect(
      await start('sales dashboard with a cohort filter and weekly charts'),
    ).toBe('dashboard');
  });

  it('lets the head noun decide between families', async () => {
    // Both ideas mention a table and summary numbers; the head says which
    // page it is.
    expect(
      await start(
        'audit dashboard: dense filterable data table with a KPI stat row',
      ),
    ).toMatch(/^dashboard/);
    expect(
      await start(
        'a data table of campaigns with spend and revenue, plus summary metrics above it',
      ),
    ).toMatch(/^table-/);
  });

  it('keeps a variant that leads when its family base cannot start alone', async () => {
    // The dashboard base matches only the family word here; the funnel
    // dashboard matches the idea.
    expect(await start('a funnel for a dashboard')).toBe(
      'dashboard-cohort-funnel',
    );
  });

  it('does not start from one rare word', async () => {
    // "board" is the kanban board's own word; a game board is not a kanban.
    expect(
      await start('accessible responsive tic-tac-toe game board'),
    ).toBeNull();
  });
});

describe('rankPages on any catalog', () => {
  it('ranks only the templates it is given', () => {
    const ranked = rankPages('dashboard', [
      page('dashboard', 'Dashboard - Analytics', 'Tiles, charts, tables.', [
        'dashboard',
        'metrics',
      ]),
    ]);
    expect(ranked.map(r => r.name)).toEqual(['dashboard']);
  });

  it('takes family words from template ids, so a new family needs no list', () => {
    // An integration's family: its word is in two of its ids, so an idea
    // naming it picks the family, and its base template leads it.
    const catalog = [
      page('dashboard', 'Dashboard - Analytics', 'Tiles, charts, tables.', [
        'dashboard',
        'metrics',
      ]),
      page('widget', 'Widget - Basic', 'One compact card.', ['widget', 'tile']),
      page('widget-grid', 'Widget - Grid', 'Many compact cards in a grid.', [
        'widget wall',
      ]),
    ];
    const ranked = rankPages('weather widget with charts', catalog);
    expect(ranked[0].name).toBe('widget');
    expect(ranked[0].familyNamed).toBe(true);
    expect(pickStart(ranked)?.name).toBe('widget');
  });

  it("counts a template's keywords above words in its description", () => {
    // Both mention uptime; only one names it as an idea it serves.
    const catalog = [
      page('ops', 'Dashboard - Ops', 'Uptime strips beside alert rows.'),
      page('health', 'Dashboard - Health', 'Status tiles over time charts.', [
        'uptime',
      ]),
    ];
    expect(rankPages('uptime overview', catalog)[0].name).toBe('health');
  });

  it("lets a variant displace its family's base only with two words of its own", () => {
    const catalog = [
      page('widget', 'Widget - Basic', 'One compact card.', ['widget']),
      page('widget-weather', 'Widget - Weather', 'A forecast card.', [
        'weather',
        'forecast',
        'radar',
      ]),
    ];
    // One word of the variant's own: still the family's base.
    expect(rankPages('weather widget', catalog)[0].name).toBe('widget');
    // Two: the variant.
    expect(rankPages('weather widget with radar', catalog)[0].name).toBe(
      'widget-weather',
    );
  });

  it('weighs a word by how rare it is among page templates', () => {
    const catalog = [
      page('alpha', 'Dashboard - Alpha', 'Status tiles.', ['status overview']),
      page('beta', 'Dashboard - Beta', 'Status rows.', ['status list']),
      page('gamma', 'Dashboard - Gamma', 'Funnel of stages.', [
        'funnel conversion',
      ]),
    ];
    // "status" is on two templates, "funnel" on one: the rare word wins.
    const ranked = rankPages('status funnel', catalog);
    expect(ranked[0].name).toBe('gamma');
  });
});

describe('rankPages structure signals', () => {
  const catalog = [
    page(
      'dialog-panel',
      'Settings - Dialog',
      'Preferences inside a modal container.',
      ['settings', 'modal dialog'],
    ),
    page('tree-table', 'Table - Tree', 'Nested rows under parents.', [
      'tree',
      'nested rows',
      'file browser',
    ]),
    page('item-detail', 'Content - Item Detail', 'One item with its media.', [
      'product',
      'listing',
      'item detail',
    ]),
    page(
      'docs-catalog',
      'Content - Documentation Catalog',
      'A grid of category cards.',
      ['documentation', 'docs', 'api index'],
    ),
  ];

  it('doubles a container word and lets it carry the start', () => {
    const ranked = rankPages(
      'draft history in a modal with delete row actions',
      catalog,
    );
    expect(ranked[0].name).toBe('dialog-panel');
    expect(ranked[0].containerMatched).toBe(true);
  });

  it('counts only an overlay frame as a container', () => {
    // A card or an existing page after "in a" is where a part goes.
    for (const idea of [
      'view toggle inside a data card',
      'status filter in an existing dashboard',
    ]) {
      expect(rankPages(idea, catalog).every(r => !r.containerMatched)).toBe(
        true,
      );
    }
  });

  it('halves a word that only modifies the next one', () => {
    // "item" modifies "response" here; "catalog" heads its own phrase.
    const ranked = rankPages(
      'endpoint catalog with side-by-side item response',
      catalog,
    );
    expect(ranked[0].name).toBe('docs-catalog');
  });

  it('does not treat a synonym as a family name', () => {
    // "landing" is a synonym of "hero" in search, not a family word here.
    const heroes = [
      page('hero-centered', 'Gallery - Hero', 'A centered hero.', [
        'hero',
        'banner',
        'landing',
      ]),
      page('hero-split', 'Gallery - Hero Split', 'A split hero.', [
        'hero',
        'splash',
      ]),
    ];
    const ranked = rankPages('internal landing page', heroes);
    expect(ranked.every(r => !r.familyNamed)).toBe(true);
  });
});

describe('ideaKind: a part of a page, told by the components the system ships', () => {
  const pages = [
    page('table', 'Table - Basic', 'Rows of records.'),
    page('table-filter', 'Table - Filtering', 'Rows narrowed by filters.'),
    page('settings', 'Settings', 'Grouped preferences.'),
  ];
  const components = [
    component('DateRangeInput', ['date picker']),
    component('Tooltip'),
    component('Calendar'),
    component('Table'),
    component('Dialog', ['modal']),
  ];
  /** @param {string} idea @param {object[]} [using] */
  const kind = (idea, using = components) => ideaKind(idea, pages, using);

  it('takes a part from a component name or keyword at the head', () => {
    expect(kind('a date range input')).toBe('part');
    expect(kind('a date picker with presets')).toBe('part');
    expect(kind('a tooltip')).toBe('part');
  });

  it('takes a page word or a family word at the head as a page', () => {
    expect(kind('a calendar')).toBe('part');
    expect(kind('a team calendar page')).toBe('page');
    // Table is a component, but table is also a family of page templates.
    expect(kind('a data table with filters')).toBe('page');
  });

  it("reads parts from the project's own components", () => {
    // An integration's component joins the vocabulary by existing.
    expect(kind('a revenue gauge')).toBe('page');
    expect(
      kind('a revenue gauge', [...components, component('AcmeGauge')]),
    ).toBe('part');
  });

  it("takes an idea that lists a page's worth of pieces as a page", () => {
    expect(kind('a calendar with a tooltip')).toBe('part');
    expect(kind('a calendar, a tooltip, and a date range input')).toBe('page');
  });

  it('takes the frame of a container phrase as the frame, not the head', () => {
    expect(kind('a dialog')).toBe('part');
    expect(kind('saved drafts in a modal')).toBe('page');
  });

  it('takes a change to an existing page or part as an edit', () => {
    expect(kind('add a sort toggle to the existing reports table')).toBe(
      'edit',
    );
    expect(kind('reuse the existing tooltip on the chart')).toBe('edit');
  });

  it('does not take "existing" that names no page or part as an edit', () => {
    expect(kind('a new settings page inspired by the existing one')).toBe(
      'page',
    );
    expect(kind('show existing users in a settings page')).toBe('page');
  });

  it('does not take a request for a new page as an edit', () => {
    expect(
      kind('a new settings page based on the existing settings page'),
    ).toBe('page');
    expect(kind('clone the existing table as a new page')).toBe('page');
    // "A new column" asks for a part, so the change stays a change.
    expect(kind('add a new column to the existing reports table')).toBe('edit');
  });
});

describe('pickStart on parts and edits (spec:AST-048/FR3)', () => {
  const shipped = Promise.all([loadPageTemplates(REPO), loadComponents(REPO)]);
  /** @param {string} query */
  const start = async query => {
    const [catalog, components] = await shipped;
    const kind = ideaKind(query, catalog, components);
    return pickStart(rankPages(query, catalog), kind)?.name ?? null;
  };

  it('starts a part from the page it names, else from the app shell', async () => {
    expect(await start('an empty state for a settings page')).toBe('settings');
    expect(await start('a date range picker')).toBeNull();
    expect(await start('compact status pill with a tooltip')).toBeNull();
  });

  it('starts an edit of an existing page or part from the app shell', async () => {
    for (const idea of [
      'add a sparkline column to the existing incidents table',
      'add a sort toggle to the existing reports dashboard',
      'swap the existing banner for a toast',
    ]) {
      expect(await start(idea)).toBeNull();
    }
  });

  it('starts a new page that mentions something existing from its template', async () => {
    expect(await start('a new dashboard inspired by the existing one')).toBe(
      'dashboard',
    );
    expect(await start('show existing users in a table page')).toMatch(
      /^table/,
    );
  });

  it('starts a new page that names an existing one from its template', async () => {
    for (const idea of [
      'a new dashboard based on the existing dashboard',
      'a new dashboard like the existing dashboard',
      'clone the existing dashboard as a new page',
    ]) {
      expect(await start(idea)).toBe('dashboard');
    }
  });

  it('reads a bare "existing" phrase that names a page as the builder\'s page', async () => {
    expect(
      await start('existing reports dashboard with a date filter'),
    ).toBeNull();
  });

  it('still starts a whole page from its template', async () => {
    expect(
      await start('saved drafts in a modal with resume and delete row actions'),
    ).toBe('settings-dialog');
  });
});
