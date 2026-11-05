#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
//
// Automate uploading translation-context screenshots to Crowdin.
//
// DESIGN: This script uses ONLY declarative, per-target manual tag
// declarations — never `crowdin screenshot upload --auto-tag`. Every rect
// that ends up on a Crowdin screenshot originates from a strategy in
// lib/crowdin-strategies.mjs. This avoids the two main auto-tag failure
// modes we hit in earlier iterations:
//   1. Auto-tag matches irrelevant text that happens to render on the
//      screenshot (e.g. "No results", "Search…" in an unrelated dropdown).
//   2. Auto-tag can't distinguish English text that maps to different
//      catalog keys ("is" -> operator.is for strings, operator.equals for
//      numbers).
//
// Pipeline:
//   1. Ensure a Storybook build exists at apps/storybook/dist (build if
//      missing).
//   2. Validate every declared manualTag key exists in
//      packages/core/locales/en.json (warn+skip unknowns).
//   3. Start a local static server, launch chromium.
//   4. For each target: navigate, interact, screenshot, measure each
//      declared tag's rect using its named strategy. A rect the capture
//      does not contain is reported unresolved, never tagged.
//   5. Upload the PNG to Crowdin (WITHOUT --auto-tag), then POST manual
//      tags for the rects we measured.
//
// Usage:
//   node internal/scripts/upload-crowdin-screenshots.mjs [flags]
//
// Flags:
//   --dry-run      Screenshot + measure but do NOT upload or POST tags.
//   --validate     Only validate declared keys against en.json (no
//                  browser, no network). Exits non-zero if any unknown.
//   --skip-build   Reuse existing storybook build.
//   --skip-upload  Screenshot + measure but don't call `crowdin` or POST.
//   --rebuild      Force storybook rebuild.
//   --only=a,b,c   Filter targets by name.
//   --delete-first Delete existing Crowdin screenshot with the same
//                  filename before re-uploading (avoids duplicates if
//                  the CLI decides to create new IDs). Off by default.
//   --replace-tags Before POSTing new tags, DELETE all existing tags on
//                  the (updated-in-place) screenshot. Prevents tag
//                  stacking when re-running the script — Crowdin's tag
//                  POST doesn't dedupe by key. Off by default.

import {chromium} from '@playwright/test';
import {execSync, spawnSync} from 'node:child_process';
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildMeasureSource,
  MUTATING_STRATEGIES,
  STRATEGY_NAMES,
  toDevicePixelRect,
} from './lib/crowdin-strategies.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STORYBOOK_DIST = path.join(REPO_ROOT, 'apps/storybook/dist');
const OUT_DIR = path.join(__dirname, 'output/crowdin-screenshots');
const EN_JSON = path.join(REPO_ROOT, 'packages/core/locales/en.json');
const PROJECT_ID = '914513';
const LABEL = 'i18n-context';
const DPR = 2;

const argv = process.argv.slice(2);
const args = new Set(argv);
const DRY_RUN = args.has('--dry-run');
const SKIP_BUILD = args.has('--skip-build');
const SKIP_UPLOAD = args.has('--skip-upload');
const VALIDATE_ONLY = args.has('--validate');
const DELETE_FIRST = args.has('--delete-first');
const REPLACE_TAGS = args.has('--replace-tags');
let ONLY = null;
{
  const idx = argv.findIndex(a => a === '--only' || a.startsWith('--only='));
  if (idx !== -1) {
    const val = argv[idx].includes('=') ? argv[idx].split('=', 2)[1] : argv[idx + 1];
    if (val) ONLY = new Set(val.split(',').map(s => s.trim()).filter(Boolean));
  }
}

fs.mkdirSync(OUT_DIR, {recursive: true});

// ---------- helpers ----------
function log(...a) { console.log('[crowdin-screens]', ...a); }
function warn(...a) { console.warn('[crowdin-screens]', ...a); }
function run(cmd, opts = {}) {
  return execSync(cmd, {stdio: 'inherit', ...opts});
}
function getToken() {
  return execSync(
    `security find-generic-password -a "$USER" -s CROWDIN_PERSONAL_TOKEN -w`,
    {encoding: 'utf8'},
  ).trim();
}

// ---------- catalog ----------
function loadCatalogKeys() {
  const raw = JSON.parse(fs.readFileSync(EN_JSON, 'utf8'));
  const keys = new Set();
  for (const k of Object.keys(raw)) {
    // Catalog keys start with '@'. The stringIdMap uses the un-@ form.
    keys.add(k.replace(/^@/, ''));
  }
  return keys;
}

// Map of un-@ catalog key → defaultMessage. Loaded once at module scope so
// t() can fall back to the catalog default when a tag's text arg is omitted.
function loadCatalogDefaults() {
  const raw = JSON.parse(fs.readFileSync(EN_JSON, 'utf8'));
  const out = new Map();
  for (const k of Object.keys(raw)) {
    const bare = k.replace(/^@/, '');
    const msg = raw[k] && typeof raw[k].defaultMessage === 'string'
      ? raw[k].defaultMessage
      : null;
    if (msg != null) out.set(bare, msg);
  }
  return out;
}
const CATALOG_DEFAULTS = loadCatalogDefaults();

// ---------- Crowdin API ----------
async function crowdinFetch(pathAndQuery, {token, method = 'GET', body = null} = {}) {
  const url = `https://api.crowdin.com/api/v2${pathAndQuery}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const opts = {method, headers};
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Crowdin ${method} ${pathAndQuery} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

// Load identifier → stringId map for every astryx.* string. Cached across
// runs would be nice but not necessary — the project is small (<1000).
async function loadStringIdMap(token) {
  const map = new Map();
  let offset = 0;
  const limit = 500;
  while (true) {
    // Filter by prefix "astryx." to reduce the payload; we tag nothing else.
    const q = `/projects/${PROJECT_ID}/strings?filter=${encodeURIComponent('astryx.')}&scope=identifier&limit=${limit}&offset=${offset}`;
    const data = await crowdinFetch(q, {token});
    const items = data?.data ?? [];
    for (const x of items) {
      const s = x.data;
      const ident = (s.identifier || '').replace(/^@/, '');
      map.set(ident, s.id);
    }
    if (items.length < limit) break;
    offset += limit;
  }
  return map;
}

// ---------- static server ----------
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};
function serveStatic(dir) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(dir, urlPath);
      if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404); res.end('Not found'); return;
      }
      const ct = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {'Content-Type': ct});
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise(r => server.close(() => r())),
      });
    });
  });
}

// ---------- targets ----------
// Every target declares an explicit `manualTags` array. Each entry:
//   { key: 'astryx.foo.bar', strategy: 'option', args: ['Contains'] }
// The `strategy` is one of STRATEGY_NAMES (see lib/crowdin-strategies.mjs).
// `args` is a positional-arg array for the strategy.
//
// Bare `key` values must NOT include the leading '@' — the strategy map
// stores identifiers without it.
//
// The third+ positional arg is the "text to match" the strategy uses when
// probing the rendered DOM. For the vast majority of tags this text is
// identical to `en.json[key].defaultMessage`, so t() defaults it to that
// catalog value when omitted. Callers still pass an explicit text when it
// diverges from the catalog default — e.g. ICU-interpolated messages
// (`Sort by {label}` → `Sort by Name`), or placeholder catalog values that
// carry trailing ellipses the rendered DOM omits (`Enter value…` vs
// `Enter value`).
//
// Per-strategy convention for which arg slot is the "text" arg:
//   visibleText / option / placeholder / ariaLabel / footerButton /
//   srOnlyLabel / srOnlyReveal / textRun / liveRegionReveal   → args[0]
//   chipOperator                  → args[1]  (args[0] = field name)
//   filterInput                   → no text arg (kind string only)
const TEXT_ARG_INDEX = {
  visibleText: 0,
  option: 0,
  placeholder: 0,
  ariaLabel: 0,
  chipOperator: 1,
  filterInput: null,
  footerButton: 0,
  srOnlyLabel: 0,
  srOnlyReveal: 0,
  textRun: 0,
  liveRegionReveal: 0,
};

function t(key, strategy, ...args) {
  const idx = TEXT_ARG_INDEX[strategy];
  if (idx != null && args[idx] === undefined) {
    const def = CATALOG_DEFAULTS.get(key);
    if (def != null) args[idx] = def;
  }
  return {key, strategy, args};
}

// Every palette capture starts by opening the modal behind the trigger.
async function openCommandPalette(page) {
  await page.getByRole('button', {name: 'Open'}).click();
  await page.waitForSelector('dialog[open]', {timeout: 3000});
  await page.waitForTimeout(400);
}

const TARGETS = [
  // ==========================================================================
  // Static (non-popover) targets
  // ==========================================================================
  {
    name: 'powersearch-filter-editor',
    // ManyFilters renders 7 chips whose visible text embeds operator labels.
    storyId: 'core-powersearch--many-filters',
    viewport: {width: 900, height: 220},
    interact: async () => {},
    selector: null,
    // Each chip's operator substring gets its own tightly-scoped rect via
    // chipOperator(fieldName, opText). Story renders 7 chips: Status,
    // Priority, Title, Assignee, Tags, Line count, Created. "Tags: include"
    // uses an operator label with no direct catalog key (it's a string_list
    // isAnyOf render variant), so we skip it here.
    manualTags: [
      t('astryx.powersearch.operator.isAnyOf', 'chipOperator', 'Status'),
      t('astryx.powersearch.operator.is', 'chipOperator', 'Priority'),
      t('astryx.powersearch.operator.contains', 'chipOperator', 'Title'),
      t('astryx.powersearch.operator.isAnyOf', 'chipOperator', 'Assignee'),
      t('astryx.powersearch.operator.greaterThan', 'chipOperator', 'Line count'),
      t('astryx.powersearch.operator.after', 'chipOperator', 'Created'),
    ],
  },
  {
    name: 'powersearch-value-editor',
    // WithDateFilters → open the Created chip and transition to compact editor.
    storyId: 'core-powersearch--with-date-filters',
    viewport: {width: 900, height: 400},
    interact: async page => {
      const chip = page.getByRole('button', {name: /Created:\s*is after/i}).first();
      await chip.waitFor({state: 'visible', timeout: 5000});
      await chip.click();
      const createdOption = page.getByRole('option', {name: 'Created'}).first();
      await createdOption.waitFor({state: 'visible', timeout: 5000});
      await createdOption.click();
      await page.getByRole('button', {name: 'Apply'}).first().waitFor({timeout: 5000});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      // Operator selector in the compact editor shows "is after".
      t('astryx.powersearch.operator.after', 'visibleText'),
      // Date value input placeholder (from @astryx/core's DateTimeInput).
      t('astryx.dateTimeInput.placeholder', 'placeholder'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'chat-message-with-status',
    storyId: 'core-chat--message-status',
    viewport: {width: 700, height: 500},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.chat.status.sending', 'visibleText'),
      t('astryx.chat.status.sent', 'visibleText'),
      t('astryx.chat.status.delivered', 'visibleText'),
      t('astryx.chat.status.read', 'visibleText'),
      t('astryx.chat.status.failed', 'visibleText'),
    ],
  },
  {
    name: 'powersearch-with-result-count',
    storyId: 'core-powersearch--with-result-count',
    viewport: {width: 900, height: 220},
    interact: async () => {},
    selector: null,
    manualTags: [
      // Story renders "1,234 results" (see WithResultCount fixture).
      t('astryx.powersearch.resultCount', 'visibleText', '1,234 results'),
    ],
  },
  {
    name: 'pagination-count',
    storyId: 'core-pagination--count-variant',
    viewport: {width: 700, height: 100},
    interact: async () => {},
    selector: null,
    manualTags: [
      // ICU "{from}–{to} of {total}" — story renders "1–20 of 200".
      t('astryx.pagination.count', 'visibleText', '1–20 of 200'),
    ],
  },
  {
    name: 'pagination-compact',
    storyId: 'core-pagination--compact-variant',
    viewport: {width: 500, height: 100},
    interact: async () => {},
    selector: null,
    manualTags: [
      // "Page {n} of {total}"
      t('astryx.pagination.pageOfTotal', 'visibleText', 'Page 1 of 10'),
    ],
  },
  {
    name: 'pagination-with-page-size',
    storyId: 'core-pagination--with-page-size-selector',
    viewport: {width: 900, height: 100},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.pagination.count', 'visibleText', '1–10 of 200'),
      // "Items per page" is a visually-hidden <label> (isLabelHidden). The
      // srOnlyReveal strategy injects a small visible label bubble next to
      // the widget so translators see the actual English label text in the
      // screenshot instead of just a bare combobox.
      t('astryx.pagination.itemsPerPage', 'srOnlyReveal', undefined, 'below'),
    ],
  },

  // ==========================================================================
  // Interactive operator-dropdown targets (v3 — WithPresetFilters story)
  // ==========================================================================
  {
    name: 'powersearch-string-operators-open',
    storyId: 'core-powersearchwithtable--with-preset-filters',
    viewport: {width: 1000, height: 700},
    interact: async page => {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.getByRole('option', {name: 'Title'}).first().click();
      await page.waitForTimeout(400);
      await page.locator('button[role="combobox"]').nth(1).click();
      await page.waitForSelector('[role="listbox"]:not(:empty)', {timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.contains', 'option'),
      t('astryx.powersearch.operator.notContains', 'option'),
      t('astryx.powersearch.operator.startsWith', 'option'),
      t('astryx.powersearch.operator.notStartsWith', 'option'),
      t('astryx.powersearch.operator.endsWith', 'option'),
      t('astryx.powersearch.operator.notEndsWith', 'option'),
      t('astryx.powersearch.operator.is', 'option'),
      t('astryx.powersearch.operator.isNot', 'option'),
      t('astryx.powersearch.valueEditor.enterValuePlaceholder', 'placeholder', 'Enter value'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-number-operators-open',
    storyId: 'core-powersearchwithtable--with-preset-filters',
    viewport: {width: 1000, height: 700},
    interact: async page => {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.getByRole('option', {name: 'Publication Year'}).first().click();
      await page.waitForTimeout(400);
      await page.locator('button[role="combobox"]').nth(1).click();
      await page.waitForSelector('[role="listbox"]:not(:empty)', {timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    // For number fields: "is" is the label for `equals`, "is not" for
    // `notEquals`. Different string ids from the string field's is/isNot.
    manualTags: [
      t('astryx.powersearch.operator.equals', 'option'),
      t('astryx.powersearch.operator.notEquals', 'option'),
      t('astryx.powersearch.operator.greaterThan', 'option'),
      t('astryx.powersearch.operator.lessThan', 'option'),
      t('astryx.powersearch.operator.greaterThanOrEqual', 'option'),
      t('astryx.powersearch.operator.lessThanOrEqual', 'option'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-enum-operators-open',
    storyId: 'core-powersearchwithtable--with-preset-filters',
    viewport: {width: 1000, height: 700},
    interact: async page => {
      await page.getByRole('button', {name: /^Genre: is/i}).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('option', {name: 'Genre'}).first().click();
      await page.waitForTimeout(400);
      await page.locator('button[role="combobox"]').nth(1).click();
      await page.waitForSelector('[role="listbox"]:not(:empty)', {timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.is', 'option'),
      t('astryx.powersearch.operator.isNot', 'option'),
      t('astryx.powersearch.operator.isAnyOf', 'option'),
      t('astryx.powersearch.operator.isNoneOf', 'option'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },

  // ==========================================================================
  // v4 targets — date / boolean / enum_list operator dropdowns
  // ==========================================================================
  {
    name: 'powersearch-date-operators-open',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.getByRole('button', {name: /Published Date:\s*is after/i}).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('option', {name: /^Published Date$/}).first().click();
      await page.waitForTimeout(400);
      await page.locator('button[role="combobox"]').nth(1).click();
      await page.waitForSelector('[role="listbox"]:not(:empty)', {timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.before', 'option'),
      t('astryx.powersearch.operator.after', 'option'),
      t('astryx.powersearch.operator.between', 'option'),
      t('astryx.dateTimeInput.placeholder', 'placeholder'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-boolean-operators-chip',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 220},
    // Boolean filter chips render the operator text directly on the filter
    // bar (e.g. "In Stock: is true"). Because boolean OperatorValue is
    // type='empty', PowerSearchEditPopover auto-closes on mount — the
    // operator dropdown is never user-reachable. Tag isTrue/isFalse against
    // the chip text on the bar instead, using chipOperator to isolate just
    // the operator substring inside the chip.
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.isTrue', 'chipOperator', 'In Stock'),
      t('astryx.powersearch.operator.isFalse', 'chipOperator', 'Discontinued'),
    ],
  },
  {
    name: 'powersearch-enumlist-operators-open',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.getByRole('button', {name: /Themes:\s*is any of/i}).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('option', {name: /^Themes$/}).first().click();
      await page.waitForTimeout(400);
      await page.locator('button[role="combobox"]').nth(1).click();
      await page.waitForSelector('[role="listbox"]:not(:empty)', {timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.isAnyOf', 'option'),
      t('astryx.powersearch.operator.isNoneOf', 'option'),
      t('astryx.powersearch.valueEditor.selectValuesPlaceholder', 'placeholder', 'Select values'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },

  // ==========================================================================
  // Value-editor placeholder targets
  // ==========================================================================
  {
    name: 'powersearch-date-value-editor',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.getByRole('button', {name: /Published Date:\s*is after/i}).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('option', {name: /^Published Date$/}).first().click();
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.after', 'visibleText'),
      t('astryx.dateTimeInput.placeholder', 'placeholder'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-entity-value-editor',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.getByRole('button', {name: /Author \(entity\):\s*is any of/i}).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('option', {name: /^Author \(entity\)$/}).first().click();
      await page.waitForTimeout(500);
      await page.locator('input[placeholder="Search…"]').first().click({trial: false}).catch(() => {});
      await page.waitForTimeout(300);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.isAnyOf', 'visibleText'),
      t('astryx.powersearch.valueEditor.searchPlaceholder', 'placeholder', 'Search'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-string-value-editor',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.getByRole('option', {name: /^Title$/}).first().click();
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.contains', 'visibleText'),
      t('astryx.powersearch.valueEditor.enterValuePlaceholder', 'placeholder', 'Enter value'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-number-value-editor',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.getByRole('option', {name: /^Publication Year$/}).first().click();
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      // Number-field default operator label is "is" (equals key).
      t('astryx.powersearch.operator.equals', 'visibleText'),
      t('astryx.powersearch.valueEditor.enterNumberPlaceholder', 'placeholder', 'Enter number'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },
  {
    name: 'powersearch-enum-value-editor',
    storyId: 'core-powersearchwithtable--with-mixed-filters',
    viewport: {width: 1100, height: 750},
    interact: async page => {
      await page.locator('[role="combobox"]').first().click();
      await page.waitForTimeout(300);
      await page.getByRole('option', {name: /^Themes$/}).first().click();
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.powersearch.operator.isAnyOf', 'visibleText'),
      t('astryx.powersearch.valueEditor.selectValuesPlaceholder', 'placeholder', 'Select values'),
      t('astryx.powersearch.editor.cancel', 'footerButton'),
      t('astryx.powersearch.editor.apply', 'footerButton'),
    ],
  },

  // ==========================================================================
  // Dialog / AlertDialog targets
  // ==========================================================================
  {
    name: 'dialog-close-button',
    // Basic Dialog with a "Close" (×) button in DialogHeader. The story
    // renders a trigger "Open Modal" that reveals the dialog on click.
    storyId: 'core-dialog--default',
    viewport: {width: 900, height: 700},
    interact: async page => {
      const btn = page.getByRole('button', {name: /Open Modal/i}).first();
      await btn.waitFor({state: 'visible', timeout: 5000});
      await btn.click();
      // Wait for the Close button inside the dialog header.
      await page.getByRole('button', {name: 'Close'}).first()
        .waitFor({state: 'visible', timeout: 5000});
      await page.waitForTimeout(300);
    },
    selector: null,
    manualTags: [
      t('astryx.dialog.close', 'srOnlyReveal', undefined, 'left'),
    ],
  },
  {
    name: 'alertdialog-cancel',
    // AlertDialog "Delete" variant: trigger is a "Delete item" button; on
    // click the dialog shows a Cancel + Delete pair.
    storyId: 'core-alertdialog--delete',
    viewport: {width: 800, height: 500},
    interact: async page => {
      const btn = page.getByRole('button', {name: /Delete item/i}).first();
      await btn.waitFor({state: 'visible', timeout: 5000});
      await btn.click();
      await page.getByRole('button', {name: 'Cancel'}).first()
        .waitFor({state: 'visible', timeout: 5000});
      await page.waitForTimeout(300);
    },
    selector: null,
    manualTags: [
      // Cancel is one of two footer buttons in the alertdialog (Cancel /
      // Delete). footerButton scopes to dialog/popover containers, avoiding
      // any stray "Cancel" elsewhere on the page.
      t('astryx.alertDialog.cancel', 'footerButton'),
    ],
  },

  // ==========================================================================
  // Banner targets
  // ==========================================================================
  {
    name: 'banner-dismissable',
    // The × button's aria-label now names its banner ("Dismiss <title>"), so
    // this target tags dismissTitled with the string the story actually
    // renders; the bare `banner.dismiss` survives as the button's tooltip.
    storyId: 'core-banner--dismissable',
    viewport: {width: 900, height: 200},
    interact: async () => {},
    selector: null,
    manualTags: [
      t(
        'astryx.banner.dismissTitled',
        'srOnlyReveal',
        'Dismiss Your session will expire soon.',
        'below',
      ),
    ],
  },
  {
    name: 'banner-collapsible',
    // Collapsible banner starts COLLAPSED — chevron reads "Expand".
    storyId: 'core-banner--collapsible-content',
    viewport: {width: 900, height: 250},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.banner.expand', 'srOnlyReveal', undefined, 'below'),
    ],
  },
  {
    name: 'banner-collapsible-expanded',
    // Same banner but starts EXPANDED — chevron reads "Collapse".
    storyId: 'core-banner--collapsible-content-expanded',
    viewport: {width: 900, height: 250},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.banner.collapse', 'srOnlyReveal', undefined, 'below'),
    ],
  },

  // ==========================================================================
  // Table sort / selection / filter / row-expansion / grouped-rows targets
  // ==========================================================================
  {
    name: 'table-sort-headers',
    // The sort-direction strings (`Sort ascending`, `Sort descending`,
    // `Clear sort`) are not the column header buttons' names, which are the
    // column text. The three strings we care about live in the header
    // context menu, which opens on right-click.
    // Right-clicking the currently-sorted column (Name) reveals all three
    // options in one popover.
    storyId: 'core-tablesortable--single-sort',
    viewport: {width: 1100, height: 500},
    interact: async page => {
      const header = page.getByRole('button', {name: 'Name', exact: true}).first();
      await header.waitFor({state: 'visible', timeout: 5000});
      await header.click({button: 'right'});
      // Wait for context menu.
      await page.locator('[role="menu"], [aria-label="Context menu"]').first()
        .waitFor({state: 'visible', timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      t('astryx.table.sort.ascending', 'visibleText'),
      t('astryx.table.sort.descending', 'visibleText'),
      t('astryx.table.sort.clear', 'visibleText'),
    ],
  },
  {
    name: 'table-selection',
    // Select-all / select-row labels are sr-only <label> elements
    // (astryx-field-label at 1×1 px). srOnlyLabel walks up to the nearest
    // visible ancestor — the checkbox itself — so translators see the
    // control.
    storyId: 'core-tableselection--default',
    viewport: {width: 1100, height: 500},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.table.selection.selectAllRows', 'srOnlyReveal', undefined, 'below'),
      t('astryx.table.selection.selectRow', 'srOnlyReveal', undefined, 'right'),
    ],
  },
  {
    name: 'table-filter-panel',
    // Filter popover: click the "Filter Role" header button to open a
    // panel with an "All" placeholder-ish combobox and Reset / Apply
    // footer buttons.
    storyId: 'core-tablefiltering--selector-filter',
    viewport: {width: 1100, height: 600},
    interact: async page => {
      const filterBtn = page.getByRole('button', {name: 'Filter Role'}).first();
      await filterBtn.waitFor({state: 'visible', timeout: 5000});
      await filterBtn.click();
      // "Apply" appears when the panel is open.
      await page.getByRole('button', {name: 'Apply'}).first()
        .waitFor({state: 'visible', timeout: 3000}).catch(() => {});
      await page.waitForTimeout(400);
    },
    selector: null,
    manualTags: [
      // "All" is rendered as a <span> inside a combobox trigger — no
      // <input placeholder>, so use visibleText.
      t('astryx.table.filter.allPlaceholder', 'visibleText'),
      t('astryx.table.filter.reset', 'footerButton'),
      t('astryx.table.filter.apply', 'footerButton'),
    ],
  },
  {
    name: 'table-rowexpansion',
    // The `inherited-columns` story shows a tree where the first row is
    // expanded (aria-label="Collapse row") and its siblings are collapsed
    // (aria-label="Expand row"). The header cell also shows
    // aria-label="Expand all rows". This gives us three of the four keys
    // in the four-way expand/collapse set. `collapseAllRows` only appears
    // when EVERY row is expanded — skip it (would need extra interaction).
    storyId: 'core-tablerowexpansion--inherited-columns',
    viewport: {width: 1100, height: 500},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.tableRowExpansion.expandRow', 'srOnlyReveal', undefined, 'right'),
      t('astryx.tableRowExpansion.collapseRow', 'srOnlyReveal', undefined, 'right'),
      t('astryx.tableRowExpansion.expandAllRows', 'srOnlyReveal', undefined, 'below'),
    ],
  },
  {
    name: 'table-groupedrows',
    // The `initially-collapsed` variant has a mix — Design Systems and
    // Growth start expanded (aria-label "Collapse group X") while Infra
    // starts collapsed ("Expand group Infra"). Perfect for tagging both
    // keys on one screenshot. The aria-labels are ICU templates with a
    // {groupKey} slot, so we must match the fully-rendered text.
    storyId: 'core-tablegroupedrows--initially-collapsed',
    viewport: {width: 1100, height: 500},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.tableGroupedRows.collapseGroup', 'srOnlyReveal', 'Collapse group Design Systems', 'right'),
      t('astryx.tableGroupedRows.expandGroup', 'srOnlyReveal', 'Expand group Infra', 'right'),
    ],
  },

  // ==========================================================================
  // Catalog-coverage targets
  //
  // One target per story that renders strings the targets above do not
  // already tag. A (key, story, strategy) triple is only valid when the
  // story's own component is the one that REFERENCES the key — six
  // components own a `Clear {label}`, so a text match alone is a
  // coincidence. Strings reachable only inside a closed overlay are
  // deliberately absent.
  //
  // These use the non-mutating strategies rather than srOnlyReveal: several
  // injected bubbles on one target would overlap each other.
  // ==========================================================================
  {
    name: 'transferlist-default',
    storyId: 'lab-transferlist--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.transferList.addAll', 'visibleText'),
      t('astryx.transferList.addOption', 'visibleText', "Add all"),
      t('astryx.transferList.clear', 'visibleText'),
      t('astryx.transferList.removeOption', 'ariaLabel', "Remove Name"),
      t('astryx.transferList.reorderInstructions', 'srOnlyLabel'),
      t('astryx.transferList.reorderOption', 'ariaLabel', "Reorder Name"),
      t('astryx.transferListSelector.triggerLabel', 'visibleText', "Move fields between the panels. The selected order is the display order."),
    ],
  },
  {
    name: 'dateinput-default',
    storyId: 'core-dateinput--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.dateInput.closeCalendar', 'srOnlyLabel'),
      t('astryx.dateInput.openCalendar', 'ariaLabel'),
      t('astryx.dateInput.placeholder', 'placeholder'),
      t('astryx.dateInput.toggleCalendarClose', 'srOnlyLabel'),
    ],
  },
  {
    name: 'datetimeinput-default',
    storyId: 'core-datetimeinput--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.dateTimeInput.openTimePicker', 'ariaLabel', "Open calendar"),
      t('astryx.dateTimeInput.timePlaceholder', 'placeholder'),
    ],
  },
  {
    name: 'listinput-loading',
    storyId: 'lab-listinput--loading',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.listInput.removeItem', 'ariaLabel', "Remove tag 1"),
      t('astryx.listInput.reorderItem', 'ariaLabel', "Reorder tag 1"),
    ],
  },
  {
    name: 'pagination-default',
    storyId: 'core-pagination--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.pagination.goToPage', 'ariaLabel', "Go to page 1"),
      t('astryx.pagination.label', 'ariaLabel'),
      t('astryx.pagination.next', 'ariaLabel'),
      t('astryx.pagination.previous', 'ariaLabel'),
    ],
  },
  {
    name: 'stepper-default',
    storyId: 'core-stepper--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.step.goToStep', 'ariaLabel', "Go to step 1: Create workspace, completed"),
      t('astryx.step.goToStepWithStatus', 'ariaLabel', "Go to step 1: Create workspace, completed"),
      t('astryx.step.status.completed', 'srOnlyLabel'),
      t('astryx.stepper.label', 'ariaLabel'),
    ],
  },
  {
    name: 'carousel-default',
    storyId: 'core-carousel--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.carousel.scrollLeft', 'ariaLabel'),
      t('astryx.carousel.scrollRight', 'ariaLabel'),
      t('astryx.carousel.slideLabel', 'ariaLabel', "Slide 1 of 8"),
    ],
  },
  {
    name: 'listinput-empty-mailing-list',
    storyId: 'lab-listinput--empty-mailing-list',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.listInput.addItem', 'visibleText', "Add a subscriber to get started."),
      t('astryx.listInput.emptyDescription', 'visibleText', "Add a subscriber to get started."),
      t('astryx.listInput.emptyTitle', 'visibleText', "No subscribers yet"),
    ],
  },
  {
    name: 'calendar-default',
    storyId: 'core-calendar--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.calendar.nextMonth', 'ariaLabel'),
      t('astryx.calendar.previousMonth', 'ariaLabel'),
    ],
  },
  {
    name: 'daterangeinput-default',
    storyId: 'core-daterangeinput--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.dateRangeInput.placeholder', 'visibleText'),
    ],
  },
  {
    name: 'fileinput-required',
    storyId: 'core-fileinput--required',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.fileInput.placeholder', 'visibleText'),
    ],
  },
  {
    name: 'markdown-default',
    storyId: 'core-markdown--default',
    // 800 tall leaves the task list below the fold, so it goes untagged.
    viewport: {width: 1200, height: 1000},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.markdown.table', 'visibleText'),
      t('astryx.markdown.taskList', 'srOnlyLabel'),
    ],
  },
  {
    name: 'multiselector-empty-states',
    storyId: 'core-multiselector--empty-states',
    viewport: {width: 1200, height: 800},
    // The options panel only exists once the trigger is clicked.
    interact: async page => {
      await page.locator('button:visible').first().click({timeout: 3000});
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.multiSelector.empty', 'visibleText'),
      t('astryx.multiSelector.selectPlaceholder', 'visibleText'),
    ],
  },
  {
    name: 'multiselector-searchable-sections',
    storyId: 'core-multiselector--searchable-sections',
    viewport: {width: 1200, height: 800},
    // The options panel only exists once the trigger is clicked.
    interact: async page => {
      await page.locator('button:visible').first().click({timeout: 3000});
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.multiSelector.searchOptions', 'ariaLabel'),
      t('astryx.multiSelector.searchPlaceholder', 'placeholder'),
    ],
  },
  {
    name: 'numberinput-with-number-steppers',
    storyId: 'core-numberinput--with-number-steppers',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.numberInput.decrementLabel', 'ariaLabel', "Decrement Quantity"),
      t('astryx.numberInput.incrementLabel', 'ariaLabel', "Increment Quantity"),
    ],
  },
  {
    name: 'selector-empty-states',
    storyId: 'core-selector--empty-states',
    viewport: {width: 1200, height: 800},
    // The options panel only exists once the trigger is clicked.
    interact: async page => {
      await page.locator('button:visible').first().click({timeout: 3000});
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.selector.empty', 'visibleText'),
      t('astryx.selector.placeholder', 'visibleText'),
    ],
  },
  {
    name: 'selector-searchable-with-sections',
    storyId: 'core-selector--searchable-with-sections',
    viewport: {width: 1200, height: 800},
    // The options panel only exists once the trigger is clicked.
    interact: async page => {
      await page.locator('button:visible').first().click({timeout: 3000});
      await page.waitForTimeout(500);
    },
    selector: null,
    manualTags: [
      t('astryx.selector.searchOptions', 'ariaLabel'),
      t('astryx.selector.searchPlaceholder', 'placeholder'),
    ],
  },
  {
    name: 'stepper-status-vertical',
    storyId: 'core-stepper--status-vertical',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.step.optional', 'visibleText'),
      t('astryx.step.status.error', 'srOnlyLabel'),
    ],
  },
  {
    name: 'transferlist-searchable',
    storyId: 'lab-transferlist--searchable',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.transferList.availableLabel', 'visibleText'),
      t('astryx.transferList.searchLabel', 'placeholder', "Search 200 fields"),
    ],
  },
  {
    name: 'avatargroup-default',
    storyId: 'core-avatargroup--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.avatarGroup.label', 'ariaLabel'),
    ],
  },
  {
    name: 'avatargroup-server-side-count',
    storyId: 'core-avatargroup--server-side-count',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.avatarGroup.overflow', 'ariaLabel', "44 more"),
    ],
  },
  {
    name: 'breadcrumbs-default',
    storyId: 'core-breadcrumbs--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.breadcrumbs.label', 'ariaLabel'),
    ],
  },
  {
    name: 'button-loading',
    storyId: 'core-button--loading',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.button.loading', 'ariaLabel'),
    ],
  },
  {
    name: 'calendar-with-selected-date',
    storyId: 'core-calendar--with-selected-date',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.calendar.daySelected', 'ariaLabel', "Thursday, January 15, 2026, selected"),
    ],
  },
  {
    name: 'chat-default',
    storyId: 'core-chat--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.chatMessage.messageFrom', 'ariaLabel', "Message from user"),
    ],
  },
  {
    name: 'chat-message-status',
    storyId: 'core-chat--message-status',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.chatToolCalls.status.error', 'visibleText'),
    ],
  },
  {
    name: 'citation-label',
    storyId: 'core-citation--label',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.citation.label', 'ariaLabel', "Citation 1: React Documentation"),
    ],
  },
  {
    name: 'codeblock-default',
    storyId: 'core-codeblock--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.codeBlock.copyCode', 'ariaLabel'),
    ],
  },
  {
    name: 'daterangeinput-with-warning-status',
    storyId: 'core-daterangeinput--with-warning-status',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.dateInput.clear', 'ariaLabel', "Clear Date range"),
    ],
  },
  {
    name: 'dropdownmenu-compact-drill-in-presentation',
    storyId: 'core-dropdownmenu--compact-drill-in-presentation',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.dropdownMenu.back', 'ariaLabel'),
    ],
  },
  {
    name: 'fileinput-multiple-files',
    storyId: 'core-fileinput--multiple-files',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.fileInput.placeholderMultiple', 'visibleText'),
    ],
  },
  {
    name: 'metadatalist-show-more',
    storyId: 'core-metadatalist--show-more',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.metadataList.showMore', 'visibleText'),
    ],
  },
  {
    name: 'moremenu-default',
    storyId: 'core-moremenu--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.moreMenu.label', 'ariaLabel'),
    ],
  },
  {
    name: 'multiselector-searchable',
    storyId: 'core-multiselector--searchable',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.multiSelector.selectAll', 'srOnlyLabel'),
    ],
  },
  {
    name: 'multiselector-default',
    storyId: 'core-multiselector--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.multiSelector.selectionCount', 'visibleText', "2 selected"),
    ],
  },
  {
    name: 'outline-compact',
    storyId: 'core-outline--compact',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.outline.label', 'ariaLabel'),
    ],
  },
  {
    name: 'pagination-compact-variant',
    storyId: 'core-pagination--compact-variant',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.pagination.pageAnnounce', 'visibleText', "Page 1 of 10"),
    ],
  },
  {
    name: 'pagination-dots-variant',
    storyId: 'core-pagination--dots-variant',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.pagination.pageIndicators', 'ariaLabel'),
    ],
  },
  {
    name: 'popover-default',
    storyId: 'core-popover--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.popover.close', 'srOnlyLabel'),
    ],
  },
  {
    name: 'powersearch-default',
    storyId: 'core-powersearch--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.powersearch.label', 'ariaLabel'),
    ],
  },
  {
    name: 'sidenav-with-header-menu',
    storyId: 'core-sidenav--with-header-menu',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.sideNav.heading.openMenu', 'ariaLabel'),
    ],
  },
  {
    name: 'sidenav-default',
    storyId: 'core-sidenav--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.sideNav.label', 'ariaLabel'),
    ],
  },
  {
    name: 'spinner-default',
    storyId: 'core-spinner--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.spinner.loading', 'ariaLabel'),
    ],
  },
  {
    name: 'stepper-status-all-states',
    storyId: 'core-stepper--status-all-states',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.step.status.warning', 'srOnlyLabel'),
    ],
  },
  {
    name: 'tablist-default',
    storyId: 'core-tablist--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.tabList.label', 'ariaLabel'),
    ],
  },
  {
    name: 'table-default',
    storyId: 'core-table--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.table.label', 'ariaLabel'),
    ],
  },
  {
    name: 'thumbnail-with-remove',
    storyId: 'core-thumbnail--with-remove',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.thumbnail.remove', 'ariaLabel', "Remove photo.png — Removable thumbnail"),
    ],
  },
  {
    name: 'timeinput-with-clear-button',
    storyId: 'core-timeinput--with-clear-button',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.timeInput.clearLabel', 'ariaLabel', "Clear Start time"),
    ],
  },
  {
    name: 'timeinput-native-picker-modes',
    storyId: 'core-timeinput--native-picker-modes',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.timeInput.openPicker', 'ariaLabel', "Open nativePicker='always'"),
    ],
  },
  {
    name: 'timeinput-default',
    storyId: 'core-timeinput--default',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.timeInput.placeholder', 'placeholder'),
    ],
  },
  {
    name: 'token-with-remove',
    storyId: 'core-token--with-remove',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.token.remove', 'ariaLabel', "Remove Removable"),
    ],
  },
  {
    name: 'treelist-fully-expanded',
    storyId: 'core-treelist--fully-expanded',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.treeList.toggleChildren', 'ariaLabel'),
    ],
  },
  {
    name: 'typeahead-status-variant-comparison',
    storyId: 'core-typeahead--status-variant-comparison',
    viewport: {width: 1200, height: 800},
    interact: async () => {},
    selector: null,
    manualTags: [
      t('astryx.typeahead.searchPlaceholder', 'placeholder'),
    ],
  },

  // ==========================================================================
  // CommandPalette
  // ==========================================================================
  // Four moments of one flow on the BuiltInStrings story, which overrides no
  // string. Each announcement replaces the one before it, so each needs its
  // own capture.
  {
    name: 'commandpalette-bootstrap-empty',
    storyId: 'core-commandpalette--built-in-strings',
    viewport: {width: 900, height: 700},
    interact: openCommandPalette,
    selector: null,
    manualTags: [
      t('astryx.commandPalette.input.placeholder', 'placeholder'),
      t('astryx.commandPalette.emptyBootstrap', 'visibleText'),
      // Each hint is `<span><Kbd/>Navigate</span>`, so tag the text node.
      t('astryx.commandPalette.footer.navigate', 'textRun'),
      t('astryx.commandPalette.footer.select', 'textRun'),
      t('astryx.commandPalette.footer.close', 'textRun'),
      // aria-label only, but on surfaces a translator can see and identify.
      t('astryx.commandPalette.label', 'ariaLabel'),
      t('astryx.commandPalette.list.label', 'ariaLabel'),
    ],
  },
  {
    name: 'commandpalette-no-results',
    storyId: 'core-commandpalette--built-in-strings',
    viewport: {width: 900, height: 700},
    interact: async page => {
      await openCommandPalette(page);
      await page.locator('dialog[open] input').first().fill('zzz');
      await page.waitForTimeout(1100);
    },
    selector: null,
    manualTags: [
      t('astryx.commandPalette.emptySearch', 'visibleText'),
      // "No results for {query}" — the story's query is "zzz".
      t(
        'astryx.commandPalette.noResultsFor',
        'liveRegionReveal',
        'No results for zzz',
        '.astryx-command-palette-input',
        'below',
      ),
    ],
  },
  {
    name: 'commandpalette-result-count',
    storyId: 'core-commandpalette--built-in-strings',
    viewport: {width: 900, height: 700},
    interact: async page => {
      await openCommandPalette(page);
      await page.locator('dialog[open] input').first().fill('e');
      await page.waitForTimeout(1100);
    },
    selector: null,
    manualTags: [
      // All three of the story's commands match "e".
      t(
        'astryx.commandPalette.resultCount',
        'liveRegionReveal',
        '3 results',
        '.astryx-command-palette-input',
        'below',
      ),
    ],
  },
  {
    name: 'commandpalette-loading',
    storyId: 'core-commandpalette--built-in-strings',
    viewport: {width: 900, height: 700},
    interact: async page => {
      await openCommandPalette(page);
      // Capture inside the story's 600ms in-flight window.
      await page.locator('dialog[open] input').first().fill('e');
      await page.waitForTimeout(120);
    },
    selector: null,
    manualTags: [
      t(
        'astryx.commandPalette.loading',
        'liveRegionReveal',
        undefined,
        '.astryx-command-palette-input',
        'below',
      ),
    ],
  },
];

// ---------- validation ----------
function validateAllTargets(catalogKeys) {
  const errors = [];
  const unknown = new Set();
  for (const target of TARGETS) {
    for (const tag of target.manualTags || []) {
      if (!STRATEGY_NAMES.includes(tag.strategy)) {
        errors.push(`${target.name}: unknown strategy "${tag.strategy}" for key ${tag.key}`);
      }
      if (!catalogKeys.has(tag.key)) {
        unknown.add(`${target.name} :: ${tag.key}`);
      }
    }
  }
  return {errors, unknown: [...unknown]};
}

// ---------- storybook build ----------
async function ensureStorybookBuild() {
  if (SKIP_BUILD && fs.existsSync(STORYBOOK_DIST)) {
    log('Reusing existing storybook build at', STORYBOOK_DIST);
    return;
  }
  if (fs.existsSync(path.join(STORYBOOK_DIST, 'iframe.html')) && !args.has('--rebuild')) {
    log('Storybook build already exists at', STORYBOOK_DIST, '(skipping)');
    return;
  }
  log('Building Storybook (pnpm --filter @astryxdesign/storybook build)…');
  const t0 = Date.now();
  run('pnpm --filter @astryxdesign/storybook build', {cwd: REPO_ROOT});
  log(`Storybook built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

// ---------- main ----------
async function main() {
  const totalT0 = Date.now();

  // 1. Catalog validation (fast; always runs).
  const catalogKeys = loadCatalogKeys();
  const {errors, unknown} = validateAllTargets(catalogKeys);
  if (errors.length) {
    for (const e of errors) console.error('[crowdin-screens] ERROR', e);
    process.exit(2);
  }
  if (unknown.length) {
    warn(`⚠ ${unknown.length} declared key(s) NOT in en.json (will be skipped):`);
    for (const u of unknown) warn('   ·', u);
  }
  if (VALIDATE_ONLY) {
    log(`Validation complete. ${TARGETS.length} targets checked, ${unknown.length} unknown keys.`);
    process.exit(unknown.length ? 1 : 0);
  }

  // 2. Storybook.
  await ensureStorybookBuild();
  if (!fs.existsSync(path.join(STORYBOOK_DIST, 'iframe.html'))) {
    throw new Error(`Missing ${STORYBOOK_DIST}/iframe.html — storybook build failed`);
  }

  // 3. Browser + measurement.
  const server = await serveStatic(STORYBOOK_DIST);
  log('Static server:', server.url);
  const browser = await chromium.launch({headless: true});
  const captured = [];
  const targets = ONLY ? TARGETS.filter(x => ONLY.has(x.name)) : TARGETS;
  if (ONLY) {
    log(`--only filter: ${targets.length}/${TARGETS.length}: ${targets.map(x => x.name).join(', ')}`);
    const missing = [...ONLY].filter(n => !TARGETS.some(x => x.name === n));
    if (missing.length) warn(`⚠ --only names not found in TARGETS: ${missing.join(', ')}`);
  }

  const measureFnSource = buildMeasureSource();

  try {
    for (const target of targets) {
      const t0 = Date.now();
      const ctx = await browser.newContext({viewport: target.viewport, deviceScaleFactor: DPR});
      const page = await ctx.newPage();
      const url = `${server.url}/iframe.html?id=${target.storyId}&viewMode=story`;
      log(`→ ${target.name} :: ${url}`);
      page.on('pageerror', e => warn('  [page error]', e.message));
      await page.goto(url, {waitUntil: 'load'});
      await page.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
      await page.waitForTimeout(500);

      try {
        await target.interact(page);
      } catch (err) {
        warn(`  ⚠ interact() failed for ${target.name}: ${err.message} — screenshotting current state anyway`);
      }

      // Pre-screenshot pass: run any strategies that need to mutate the DOM
      // (e.g. srOnlyReveal injects visible label bubbles) BEFORE the
      // screenshot is captured. Strategies are idempotent: the same call
      // during the measurement pass below returns the already-injected
      // rect instead of duplicating.
      const revealTags = (target.manualTags || []).filter(t =>
        MUTATING_STRATEGIES.includes(t.strategy),
      );
      if (revealTags.length) {
        for (const tag of revealTags) {
          await page.evaluate(
            ({fnSource, strategy, args}) => {
              const measure = eval(fnSource);
              return measure(strategy, args);
            },
            {fnSource: measureFnSource, strategy: tag.strategy, args: tag.args},
          );
        }
      }

      const outPath = path.join(OUT_DIR, `${target.name}.png`);
      // A viewport capture is the viewport at the device pixel ratio.
      const imageWidth = target.viewport.width * DPR;
      const imageHeight = target.viewport.height * DPR;
      if (target.selector) {
        await page.locator(target.selector).first().screenshot({path: outPath});
      } else {
        await page.screenshot({path: outPath, fullPage: false});
      }
      const size = fs.statSync(outPath).size;
      log(`  ✓ ${outPath} (${(size / 1024).toFixed(1)} KB, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);

      // Measure each declared tag's rect via its strategy.
      const measured = [];
      if (target.manualTags && target.manualTags.length) {
        for (const tag of target.manualTags) {
          if (!catalogKeys.has(tag.key)) {
            measured.push({key: tag.key, position: null, reason: 'not-in-catalog'});
            continue;
          }
          const rect = await page.evaluate(
            ({fnSource, strategy, args}) => {
              const measure = eval(fnSource);
              return measure(strategy, args);
            },
            {fnSource: measureFnSource, strategy: tag.strategy, args: tag.args},
          );
          if (!rect) {
            measured.push({key: tag.key, position: null, reason: 'no-rect', strategy: tag.strategy, args: tag.args});
          } else {
            measured.push({
              key: tag.key,
              strategy: tag.strategy,
              position: toDevicePixelRect(rect, DPR),
            });
          }
        }
        const hit = measured.filter(m => m.position).length;
        log(`  ↳ measured ${hit}/${measured.length} tag positions`);
        for (const m of measured) {
          if (!m.position) {
            warn(`     · skip ${m.key} (${m.reason}${m.strategy ? ` via ${m.strategy}` : ''})`);
          } else if (DRY_RUN || SKIP_UPLOAD) {
            // Print the rect against the image size on inspectable runs.
            const p = m.position;
            log(`     · ${m.key} [${p.x},${p.y} ${p.width}×${p.height}] → ${p.x + p.width},${p.y + p.height} of ${imageWidth}×${imageHeight}`);
          }
        }
      }

      captured.push({name: target.name, path: outPath, size, measured});
      await ctx.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }

  // 4. Upload + tag.
  if (SKIP_UPLOAD || DRY_RUN) {
    log(`Skipping upload (${DRY_RUN ? '--dry-run' : '--skip-upload'}). ${captured.length} screenshots captured.`);
    log(`Total: ${((Date.now() - totalT0) / 1000).toFixed(1)}s`);
    return;
  }

  const token = getToken();
  const env = {...process.env, CROWDIN_PERSONAL_TOKEN: token, CROWDIN_PROJECT_ID: PROJECT_ID};

  log('Fetching Crowdin string-id map…');
  const stringIdMap = await loadStringIdMap(token);
  log(`  loaded ${stringIdMap.size} astryx.* identifiers`);

  for (const c of captured) {
    // Optional: delete existing screenshot with the same filename before
    // re-uploading, to guarantee we don't stack tags on a stale ID.
    if (DELETE_FIRST) {
      try {
        const q = `/projects/${PROJECT_ID}/screenshots?limit=25&search=${encodeURIComponent(c.name)}`;
        const list = await crowdinFetch(q, {token});
        for (const x of list?.data ?? []) {
          if (x?.data?.name === `${c.name}.png`) {
            log(`  ✂ deleting existing screenshot id=${x.data.id} (${c.name}.png)`);
            await crowdinFetch(`/projects/${PROJECT_ID}/screenshots/${x.data.id}`, {token, method: 'DELETE'});
          }
        }
      } catch (err) {
        warn(`  ⚠ delete-first failed for ${c.name}: ${err.message.slice(0, 300)}`);
      }
    }

    const cmdArgs = [
      'screenshot', 'upload', c.path,
      // NOTE: --auto-tag intentionally OMITTED. All tags come from manualTags.
      // -f / -d / -b would REQUIRE --auto-tag per the CLI's own validation,
      // so we omit them too.
      '--project-id', PROJECT_ID,
      '--label', LABEL,
      '-o', 'json',
    ];
    log(`↑ crowdin screenshot upload ${c.name}  (no auto-tag)`);
    const res = spawnSyncCapture('crowdin', cmdArgs, {env, cwd: REPO_ROOT});
    const short = (res.stdout || '').slice(0, 800);
    if (res.status !== 0) {
      warn(`  ✗ exit=${res.status}`);
      warn('  stdout:', short);
      warn('  stderr:', (res.stderr || '').slice(0, 600));
      continue;
    }
    log('  ✓ uploaded');

    // POST manual tags.
    if (!c.measured || !c.measured.length) continue;
    try {
      const q = `/projects/${PROJECT_ID}/screenshots?limit=25&search=${encodeURIComponent(c.name)}`;
      const list = await crowdinFetch(q, {token});
      const match = (list?.data ?? []).find(x => x?.data?.name === `${c.name}.png`);
      if (!match) {
        warn(`     ⚠ could not resolve screenshot ID for ${c.name}`);
        continue;
      }
      const screenshotId = match.data.id;

      // Optional: clear existing tags on this screenshot before POSTing new
      // ones. Tags don't dedupe on POST — running the script twice would
      // stack duplicates at slightly-different-but-overlapping rects. Use
      // --replace-tags to guarantee tag-set matches the current declared
      // measurements exactly.
      if (REPLACE_TAGS) {
        try {
          const existing = await crowdinFetch(
            `/projects/${PROJECT_ID}/screenshots/${screenshotId}/tags?limit=100`,
            {token},
          );
          const tags = existing?.data ?? [];
          for (const t of tags) {
            const tid = t?.data?.id;
            if (tid == null) continue;
            await crowdinFetch(
              `/projects/${PROJECT_ID}/screenshots/${screenshotId}/tags/${tid}`,
              {token, method: 'DELETE'},
            );
          }
          if (tags.length) {
            log(`     ✗ deleted ${tags.length} existing tag(s) (--replace-tags)`);
          }
        } catch (err) {
          warn(`     ⚠ tag-clear failed for ${c.name}: ${err.message.slice(0, 300)}`);
        }
      }

      const body = [];
      const skipped = [];
      for (const m of c.measured) {
        if (!m.position) { skipped.push(`${m.key}(${m.reason || 'no-pos'})`); continue; }
        const sid = stringIdMap.get(m.key);
        if (!sid) { skipped.push(`${m.key}(no-string-id)`); continue; }
        body.push({stringId: sid, position: m.position});
      }
      if (!body.length) {
        warn(`     ⚠ no manual tags to post; skipped=${skipped.join(',') || 'none'}`);
        continue;
      }
      const postRes = await crowdinFetch(
        `/projects/${PROJECT_ID}/screenshots/${screenshotId}/tags`,
        {token, method: 'POST', body},
      );
      const postedCount = (postRes?.data ?? []).length;
      log(`     ↑ POSTed ${postedCount} tag(s) → screenshotId=${screenshotId}${skipped.length ? `, skipped=${skipped.join(',')}` : ''}`);
    } catch (err) {
      warn(`     ✗ manual tagging failed for ${c.name}: ${err.message.slice(0, 300)}`);
    }
  }

  log(`Total: ${((Date.now() - totalT0) / 1000).toFixed(1)}s`);
}

function spawnSyncCapture(cmd, argv, opts) {
  return spawnSync(cmd, argv, {encoding: 'utf8', ...opts});
}

main().catch(e => { console.error(e); process.exit(1); });
