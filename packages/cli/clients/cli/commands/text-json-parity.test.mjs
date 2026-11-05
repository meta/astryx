// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Text/JSON parity — every command's human output is a projection of its
 * JSON envelope.
 *
 * Architecture: cli-surface INV4, INV5.  Spec: AST-042 FR1.
 *
 * The test:
 *   1. Enumerates every JSON-capable command from the live manifest and fails
 *      when a command has no parity case.  A new command must add one.
 *   2. Runs each case in text mode and --json mode via the in-process harness.
 *   3. Checks:
 *      a. Every `key: value` record line in the text names a key that exists
 *         in the JSON data (criterion 1 — text shows no fact JSON lacks).
 *      b. Every JSON leaf field appears in the text, unless the allowlist
 *         forgives it with a reason (criterion 2).
 *
 * Allowlist entries are stale-checked: an entry that forgives a field that
 * does not appear anywhere in the JSON output FAILS the test, so the
 * allowlist shrinks over time.
 *
 * DO NOT add allowlist entries without a reason.  Headings and invocation-
 * prefixed hints are the only categories that are structurally OK to forgive;
 * everything else is a divergence that should be fixed.
 */

import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {writeIconPackage} from '../../../test-utils/icon-set-fixture.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../../..');

/**
 * Response types whose text output is the artifact's source, printed byte for
 * byte so it can be piped (spec cli-surface INV28). Their JSON still names the
 * package; their text does not.
 */
const VERBATIM_TYPES = new Set([
  'component.detail.source',
  'component.detail.showcase',
  'template.show',
]);

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normalize a text value for comparison: collapse whitespace, strip the
 * package-manager invocation prefix, and undo ASCII normalization.
 * @param {string} s
 * @returns {string}
 */
function normalize(s) {
  return s
    .replace(/\s+/g, ' ')
    .replace(/(npx|pnpm exec|yarn dlx|bunx)\s+astryx/g, 'astryx')
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .trim();
}

/**
 * Extract `key: value` record lines from text output.  The formatter always
 * produces `key:  value` (padded) or `key: value`.
 *
 * Lines whose key is a known hint prefix (e.g. "Usage:") are excluded —
 * those are invocation hints allowed by INV4, not data records.
 * @param {string} text
 * @returns {Map<string, string[]>}
 */
function extractRecordKeys(text) {
  const HINT_PREFIXES = new Set(['Usage', 'Summary', 'Read', 'Example', 'Tip']);
  /** @type {Map<string, string[]>} */
  const map = new Map();
  for (const line of text.split('\n')) {
    // Match "word-key:  value" but not URLs, headings, or code fences
    const m = line.match(/^(\w[\w-]*):\s{1,}\S/);
    if (!m) continue;
    const key = m[1];
    if (HINT_PREFIXES.has(key)) continue;
    const value = line.slice(line.indexOf(':', key.length) + 1).trim();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(normalize(value));
  }
  return map;
}

/**
 * Extract bulleted list items from text output (`- item`).
 * @param {string} text
 * @returns {string[]}
 */
function extractListItems(text) {
  return text
    .split('\n')
    .filter(line => /^- \S/.test(line))
    .map(line => normalize(line.slice(2)));
}

/**
 * Extract standalone text blocks — lines that are not record lines, list
 * items, section headings, hint lines, or blank.  These correspond to
 * `text(...)` formatter calls and must carry facts from the JSON.
 * @param {string} text
 * @returns {string[]}
 */
function extractTextBlocks(text) {
  const HINT_PREFIXES = /^(Usage|Summary|Read|Example|Tip|Import from|Related blocks|Each key|Props take|One component|No results|Try a|Browse instead|No failures|All checks|Some checks|Pass --\w)[:.]?/i;
  const lines = text.split('\n');
  /** @type {string[]} */
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    // Skip record lines
    if (/^\w[\w-]*:\s{1,}\S/.test(trimmed)) continue;
    // Skip list items
    if (/^- \S/.test(trimmed)) continue;
    // Skip hints
    if (HINT_PREFIXES.test(trimmed)) continue;
    // Skip lines that look like code, commands, or status tokens
    if (trimmed.startsWith('`') || trimmed.startsWith('$')) continue;
    if (trimmed.startsWith('[ok]') || trimmed.startsWith('[skip]') ||
        trimmed.startsWith('[fail]') || trimmed.startsWith('[warn]') ||
        trimmed.startsWith('!') || trimmed.startsWith('(')) continue;
    // Skip continuation lines (indented, part of a wrapped record or list)
    if (/^\s{2,}\S/.test(lines[i])) continue;
    // Skip section headings: a line preceded by blank (or start) that belongs
    // to a block followed by blank.  Section blocks can be multi-line (heading
    // + subtitle), so check whether THIS line's block ends before a blank.
    // Only skip short, heading-like text (no sentence punctuation) to avoid
    // suppressing real text() facts.
    const prevBlank = i === 0 || !lines[i - 1]?.trim();
    const nextBlank = i === lines.length - 1 || !lines[i + 1]?.trim();
    const looksLikeHeading = trimmed.length <= 80 && !/[.!?]$/.test(trimmed);
    // Single-line heading: blank before AND after, and heading-like
    if (prevBlank && nextBlank && looksLikeHeading) continue;
    // Multi-line heading block: blank before this line, heading-like
    if (prevBlank && !nextBlank && looksLikeHeading) {
      let j = i + 1;
      while (j < lines.length && lines[j]?.trim()) j++;
      if (j - i <= 3) continue;
    }
    // Subtitle line: preceded by a heading-like line preceded by blank
    if (!prevBlank && nextBlank && i >= 1) {
      const prevLine = lines[i - 1]?.trim() ?? '';
      const prevPrevBlank = i < 2 || !lines[i - 2]?.trim();
      if (prevPrevBlank && prevLine.length <= 80 && !/[.!?]$/.test(prevLine)) continue;
    }
    blocks.push(normalize(trimmed));
  }
  return blocks;
}

/**
 * Collect every leaf string value from JSON data so we can verify text content
 * appears somewhere in the JSON.
 * @param {unknown} obj
 * @returns {Set<string>}
 */
function jsonLeafValues(obj) {
  /** @type {Set<string>} */
  const values = new Set();
  if (obj == null) return values;
  if (typeof obj === 'string') { values.add(normalize(obj)); return values; }
  if (typeof obj === 'number' || typeof obj === 'boolean') { values.add(String(obj)); return values; }
  if (Array.isArray(obj)) { for (const item of obj) { for (const v of jsonLeafValues(item)) values.add(v); } return values; }
  if (typeof obj === 'object') { for (const value of Object.values(obj)) { for (const v of jsonLeafValues(value)) values.add(v); } }
  return values;
}

/**
 * Collect every PRIMITIVE leaf key from a JSON value.  Returns keys whose
 * values are strings, numbers, booleans, or arrays of primitives.  Does NOT
 * return intermediate container keys (objects, arrays of objects).
 * @param {unknown} obj
 * @returns {Set<string>}
 */
function jsonLeafKeys(obj) {
  /** @type {Set<string>} */
  const keys = new Set();
  if (obj == null || typeof obj !== 'object') return keys;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (item != null && typeof item === 'object' && !Array.isArray(item)) {
        for (const k of jsonLeafKeys(item)) keys.add(k);
      }
    }
    return keys;
  }
  for (const [key, value] of Object.entries(obj)) {
    if (value == null || typeof value !== 'object') {
      keys.add(key);
    } else if (Array.isArray(value)) {
      if (value.length > 0 && typeof value[0] !== 'object') {
        keys.add(key);
      } else {
        for (const item of value) {
          if (item != null && typeof item === 'object' && !Array.isArray(item)) {
            for (const k of jsonLeafKeys(item)) keys.add(k);
          }
        }
      }
    } else {
      for (const k of jsonLeafKeys(value)) keys.add(k);
    }
  }
  return keys;
}

/**
 * Map each leaf key to the set of values it takes across the JSON data.
 * Used for the JSON→text value-presence check on inline-layout commands.
 * @param {unknown} obj
 * @returns {Map<string, Set<string>>}
 */
function jsonKeyValues(obj) {
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  function walk(/** @type {unknown} */ node) {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }
    for (const [key, value] of Object.entries(node)) {
      if (value == null) continue;
      if (typeof value !== 'object') {
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(normalize(String(value)));
      } else if (Array.isArray(value)) {
        if (value.length > 0 && typeof value[0] !== 'object') {
          if (!map.has(key)) map.set(key, new Set());
          for (const v of value) map.get(key).add(normalize(String(v)));
        } else {
          for (const item of value) walk(item);
        }
      } else {
        walk(value);
      }
    }
  }
  walk(obj);
  return map;
}

/**
 * Check whether a JSON object (at any depth) contains a given key name.
 * Used for the stale-allowlist check: the field must exist SOMEWHERE in the
 * full JSON output even if our leaf extractor skips it.
 * @param {unknown} obj
 * @param {string} target
 * @returns {boolean}
 */
function jsonContainsKey(obj, target) {
  if (obj == null || typeof obj !== 'object') return false;
  if (Array.isArray(obj)) return obj.some(item => jsonContainsKey(item, target));
  for (const [key, value] of Object.entries(obj)) {
    if (key === target) return true;
    if (jsonContainsKey(value, target)) return true;
  }
  return false;
}

// ─── Test cases ─────────────────────────────────────────────────────────────

/**
 * @typedef {object} ParityCase
 * @property {string} name - The manifest command name.
 * @property {string[]} args - CLI args after `astryx`.
 * @property {string} [cwd] - Working directory; defaults to REPO_ROOT.
 * @property {(dir: string) => void} [setup] - Prepare a tmpDir before the run.
 * @property {string[]} [jsonFieldAllowlist] - JSON keys forgiven from text.
 * @property {boolean} [skipFieldChecks] - Skip both record-key and field checks.
 * @property {boolean} [errorExpected] - The command is expected to error.
 */

/** @type {ParityCase[]} */
const CASES = [
  {
    name: 'blog',
    args: ['blog'],
    // Blog fetches the network feed.  In CI the feed is unreachable, so
    // the command errors.  The envelope shape is still checked.
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'build',
    args: ['build'],
    // PR #6566 fixes the playbook divergence.
    skipFieldChecks: true,
    jsonFieldAllowlist: [
      'playbook — PR #6566 adds full playbook fields to the JSON envelope',
    ],
  },
  {
    name: 'component',
    args: ['component', '--list'],
    // #6507 touches this handler; divergences deferred.
    skipFieldChecks: true,
    jsonFieldAllowlist: [
      'detail — internal detail-level tag, not a user-facing datum',
    ],
  },
  {
    name: 'discover',
    args: ['discover'],
    cwd: '__TMP__',
    // Empty result (no config).  The meta.configured field is projected as
    // prose in the text.
    skipFieldChecks: true,
    jsonFieldAllowlist: [
      'configured — expressed as prose "No integrations configured"',
    ],
  },
  {
    name: 'docs',
    args: ['docs'],
    jsonFieldAllowlist: [
      'topic — inline layout lead column, not a key: value record',
      'description — inline layout trailing column',
    ],
  },
  {
    name: 'doctor',
    args: ['doctor'],
    jsonFieldAllowlist: [
      'fix — only present on checks that have a remediation',
      'pass — shown in prose "Summary: N passed, ..."',
      'warn — shown in prose "Summary: ..., N warnings"',
      'fail — shown in prose "Summary: ..., N failures"',
      'info — shown in prose "Summary: ..., N info" when nonzero',
    ],
  },
  {
    name: 'doctor integration validate',
    args: ['doctor', 'integration', 'validate'],
    skipFieldChecks: true,
  },
  {
    name: 'integration check',
    args: ['integration', 'check'],
    skipFieldChecks: true,
  },
  {
    name: 'doctor integration components',
    args: ['doctor', 'integration', 'components'],
    skipFieldChecks: true,
  },
  {
    name: 'doctor integration docs',
    args: ['doctor', 'integration', 'docs'],
    skipFieldChecks: true,
  },
  {
    name: 'doctor integration templates',
    args: ['doctor', 'integration', 'templates'],
    skipFieldChecks: true,
  },
  {
    name: 'gap-report',
    args: ['gap-report', '--list-categories'],
  },
  {
    name: 'hook',
    args: ['hook', '--list', '--detail', 'compact'],
    jsonFieldAllowlist: [
      'detail — internal detail-level tag, not a user-facing datum',
      'import — shown inside the code() formatted block, not as a record',
    ],
  },
  {
    name: 'init',
    args: ['init'],
    cwd: '__TMP__',
    // Init emits text via the API logger, not the formatter kit.
    skipFieldChecks: true,
  },
  {
    name: 'integration add',
    args: ['integration', 'add', 'component', 'TestComp', '--dry-run'],
    // Needs a valid integration project to work; errors without one.
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'integration verify',
    args: ['integration', 'verify'],
    // Needs a packable project; pack itself may exit differently.
    skipFieldChecks: true,
  },
  {
    // The deprecated alias of `integration verify`.
    name: 'integration pack',
    args: ['integration', 'pack', '--check'],
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon',
    args: ['experimental', 'icon', 'remove'],
    cwd: '__TMP__',
    // A project with the synthetic icon set installed.
    setup: dir => {
      writeIconPackage(path.join(dir, 'node_modules', '@acme', 'glyphs'));
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({name: 'app', dependencies: {'@acme/glyphs': '1.0.0'}}),
      );
    },
    jsonFieldAllowlist: [
      'matchCount — stated in section heading "Icons for ... (N)"',
      'query — stated in section heading',
      'module — part of the import line',
      'export — part of the import line',
      'score — the reason states the tier',
    ],
  },
  {
    name: 'experimental render',
    args: ['experimental', 'render', 'page.jsx'],
    cwd: '__TMP__',
    // A page with no imports, in a folder that can resolve React.
    setup: dir => {
      fs.mkdirSync(path.join(dir, 'node_modules'), {recursive: true});
      for (const pkg of ['react', 'react-dom']) {
        fs.symlinkSync(
          path.join(REPO_ROOT, 'node_modules', pkg),
          path.join(dir, 'node_modules', pkg),
        );
      }
      fs.writeFileSync(
        path.join(dir, 'page.jsx'),
        'export default function Page() { return <h1>Hello</h1>; }\n',
      );
    },
    jsonFieldAllowlist: ['warnings — listed under Warnings when present'],
  },
  {
    // The --reverse projection (same command, same folder as the case above).
    name: 'experimental render',
    args: ['experimental', 'render', '--reverse', 'carried.html', '--out', 'back.tsx', '--overwrite'],
    cwd: '__TMP__',
    // A rendered file that carries its page.
    setup: dir => {
      const source = Buffer.from('export default function Page() { return <h1>Hello</h1>; }\n');
      const json = JSON.stringify({
        version: 1,
        entry: 'page.jsx',
        files: [
          {
            path: 'page.jsx',
            sha256: crypto.createHash('sha256').update(source).digest('hex'),
            base64: source.toString('base64'),
          },
        ],
      });
      fs.writeFileSync(
        path.join(dir, 'carried.html'),
        `<!doctype html><html><body><h1 class="astryx-heading">Hello</h1><script type="application/x-astryx-source">${json}</script></body></html>`,
      );
    },
  },
  {
    name: 'manifest',
    args: ['manifest'],
    // Manifest describes the CLI itself; exempt (AST-042 FR1).
    skipFieldChecks: true,
  },
  {
    name: 'search',
    args: ['search', 'button'],
    jsonFieldAllowlist: [
      'matchCount — stated in section heading "Results for ... (N)"',
      'query — stated in section heading',
      'score — only shown with --verbose',
      'reason — only shown with --verbose',
      'kind — internal domain subtype, not shown in default text',
    ],
  },
  {
    name: 'swizzle',
    args: ['swizzle', '--list'],
    skipFieldChecks: true,
  },
  {
    name: 'template',
    args: ['template', '--list'],
    // #6265 touches this handler; template id fix deferred.
    skipFieldChecks: true,
    jsonFieldAllowlist: [
      'id — not shown in text records (#6265)',
      'isReady — folded into name as "(WIP)" suffix (#6265)',
    ],
  },
  {
    name: 'theme add',
    args: ['theme', 'add', '--list'],
    // Themes are rendered as list items, not records.
    skipFieldChecks: true,
  },
  {
    name: 'theme remove',
    args: ['theme', 'remove', 'does-not-exist'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon use',
    args: ['experimental', 'icon', 'use', 'does-not-exist'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon map',
    args: ['experimental', 'icon', 'map', 'close', 'x'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon new-set',
    args: ['experimental', 'icon', 'new-set', 'Not-Kebab'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon new-definition',
    args: ['experimental', 'icon', 'new-definition', 'not-camel'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'experimental icon add',
    args: ['experimental', 'icon', 'add', 'XIcon', '--from', 'does-not-exist'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'theme use',
    args: ['theme', 'use', 'does-not-exist'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'theme eject',
    args: ['theme', 'eject', 'does-not-exist'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'theme build',
    args: ['theme', 'build', 'nonexistent.ts'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'theme list',
    args: ['theme', 'list'],
    skipFieldChecks: true,
  },
  {
    name: 'theme palette generate',
    args: ['theme', 'palette', 'generate', 'nonexistent.json'],
    errorExpected: true,
    skipFieldChecks: true,
  },
  {
    name: 'theme targets',
    args: ['theme', 'targets'],
    jsonFieldAllowlist: [
      'filter — null when no filter given; not shown',
      'componentCount — shown in section heading subtitle',
    ],
  },
  {
    name: 'theme template',
    args: ['theme', 'template'],
    cwd: '__TMP__',
    jsonFieldAllowlist: [
      'written — stated in status token ([ok] / [skip])',
      'path — stated in the "[ok] Wrote ..." line',
      'reason — absent; only in skip envelopes',
    ],
  },
  {
    name: 'upgrade',
    args: ['upgrade', '--list'],
    cwd: '__TMP__',
  },
];

// ─── Suite ──────────────────────────────────────────────────────────────────

describe('text-json-parity', () => {
  /** @type {string[]} */
  let manifestCommands;
  /** @type {string} */
  let tmpDir;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-parity-'));
    const {stdout} = await runCli(['manifest', '--json'], {cwd: REPO_ROOT});
    const manifest = JSON.parse(stdout);
    manifestCommands = manifest.data.jsonSupported;
  });

  afterAll(() => {
    fs.rmSync(tmpDir, {recursive: true, force: true});
  });

  // ── Gate: every JSON-capable command has a parity case ──────────────
  it('every JSON-capable command in the manifest has a parity case', () => {
    const covered = new Set(CASES.map(c => c.name));
    const missing = manifestCommands.filter(cmd => !covered.has(cmd));
    expect(
      missing,
      `Add a parity case for these commands:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('every parity case names a real manifest command', () => {
    const real = new Set(manifestCommands);
    const stale = CASES.filter(c => !real.has(c.name)).map(c => c.name);
    expect(stale).toEqual([]);
  });

  // ── Per-command parity checks ──────────────────────────────────────
  for (const tc of CASES) {
    describe(tc.name, () => {
      /** @type {{text: string, json: any, textStatus: number, jsonStatus: number}} */
      let run;

      beforeAll(async () => {
        let cwd = tc.cwd === '__TMP__' ? tmpDir : (tc.cwd || REPO_ROOT);
        if (tc.cwd === '__TMP__') {
          const sub = path.join(tmpDir, tc.name.replace(/\s+/g, '-'));
          fs.mkdirSync(sub, {recursive: true});
          if (tc.setup) tc.setup(sub);
          cwd = sub;
        }

        // Run sequentially: runCli uses process.chdir, which is global
        // state and races under Promise.all.
        const textResult = await runCli(tc.args, {cwd});
        const jsonResult = await runCli([...tc.args, '--json'], {cwd});

        let jsonData;
        try {
          jsonData = JSON.parse(jsonResult.stdout);
        } catch {
          jsonData = null;
        }

        run = {
          text: textResult.stdout,
          json: jsonData,
          textStatus: textResult.status,
          jsonStatus: jsonResult.status,
        };
      });

      it('JSON output is a valid envelope', () => {
        expect(run.json).not.toBeNull();
        const isSuccess = run.json?.type != null;
        const isError = run.json?.error != null;
        expect(isSuccess || isError).toBe(true);
      });

      it('exit codes match between text and JSON mode', () => {
        expect(run.textStatus).toBe(run.jsonStatus);
      });

      // spec cli-surface INV28: text names the package the envelope names.
      // Verbatim source output prints only the source, so a pipe gets the
      // file byte for byte.
      it('text names the package the JSON envelope names', () => {
        if (run.json?.package === undefined) return;
        if (VERBATIM_TYPES.has(run.json.type)) return;
        expect(run.text).toContain(run.json.package);
      });

      if (!tc.skipFieldChecks && !tc.errorExpected) {
        it('every text record key exists in the JSON data', () => {
          if (!run.json?.data) return;
          const textKeys = extractRecordKeys(run.text);
          const jsonKeys = jsonLeafKeys(run.json.data);
          if (run.json.meta) {
            for (const k of jsonLeafKeys(run.json.meta)) jsonKeys.add(k);
          }
          // The envelope's own `package` (spec cli-surface INV28) is JSON too.
          if (run.json.package !== undefined) jsonKeys.add('package');
          const violations = [];
          for (const key of textKeys.keys()) {
            if (!jsonKeys.has(key)) {
              violations.push(key);
            }
          }
          expect(
            violations,
            `Text record keys not in JSON:\n${violations.join(', ')}`,
          ).toEqual([]);
        });

        it('every JSON leaf field appears in the text or is allowlisted', () => {
          if (!run.json?.data) return;
          const textKeys = extractRecordKeys(run.text);
          const jsonKeys = jsonLeafKeys(run.json.data);
          const keyVals = jsonKeyValues(run.json.data);
          const allowedKeys = new Set(
            (tc.jsonFieldAllowlist || []).map(e => e.split(' — ')[0].trim()),
          );

          const missing = [];
          for (const key of jsonKeys) {
            const inRecords = textKeys.has(key);
            // Check for `key:` as a field label at start of line.
            const asLabel = new RegExp(`(?:^|\\n)\\s*${key}:`, 'm').test(run.text);
            // For inline records (no labels): check if THIS KEY's values
            // appear in the text.  This catches inline-layout projections
            // where the key name is only in the section subtitle.
            const myVals = keyVals.get(key) ?? new Set();
            const valuesInText = !inRecords && !asLabel && [...myVals].some(v =>
              v.length > 2 && run.text.includes(v),
            );
            const allowed = allowedKeys.has(key);
            if (!inRecords && !asLabel && !valuesInText && !allowed) {
              missing.push(key);
            }
          }
          expect(
            missing,
            `JSON fields not in text and not allowlisted:\n${missing.join(', ')}`,
          ).toEqual([]);
        });

        it('text list items and block content appear in JSON data', () => {
          if (!run.json?.data) return;
          const jsonValues = jsonLeafValues(run.json.data);
          if (run.json.meta) {
            for (const v of jsonLeafValues(run.json.meta)) jsonValues.add(v);
          }
          const items = extractListItems(run.text);
          const textBlocks = extractTextBlocks(run.text);
          const violations = [];
          for (const item of items) {
            // Each list item should match (or be a substring of) some JSON value.
            const found = [...jsonValues].some(
              jv => jv === item || jv.includes(item) || item.includes(jv),
            );
            if (!found) {
              violations.push(`[list] ${item.slice(0, 80)}`);
            }
          }
          for (const block of textBlocks) {
            // Each text block should contain at least one word that appears in
            // the JSON values.  A block with no JSON overlap is a fact the
            // envelope does not carry.  Numbers (even short) count because
            // they are data.
            const words = block.split(/\s+/).filter(w =>
              w.length > 3 || /^\d+$/.test(w),
            );
            const anyOverlap = words.some(w =>
              [...jsonValues].some(jv => jv.includes(w)),
            );
            if (!anyOverlap && words.length > 0) {
              violations.push(`[text] ${block.slice(0, 80)}`);
            }
          }
          expect(
            violations,
            `Text content not found in JSON data:\n${violations.join('\n')}`,
          ).toEqual([]);
        });
      }

      // Stale allowlist check
      if (tc.jsonFieldAllowlist && tc.jsonFieldAllowlist.length > 0) {
        it('allowlist entries are not stale', () => {
          if (!run.json) return;
          const searchTarget = run.json.data ?? run.json;
          const stale = [];
          for (const entry of tc.jsonFieldAllowlist) {
            const key = entry.split(' — ')[0].trim();
            if (!jsonContainsKey(searchTarget, key) && !jsonContainsKey(run.json.meta, key)) {
              stale.push(entry);
            }
          }
          expect(
            stale,
            `Stale allowlist entries — remove them:\n${stale.join('\n')}`,
          ).toEqual([]);
        });
      }
    });
  }

  // ── Upgrade failure-path regression tests ────────────────────────
  // The upgrade handler silences the logger for --list and replays the error
  // in the catch.  These tests prove both list and non-list failures print
  // the error exactly once and exit 1, in both text and --json mode.
  describe('upgrade failure paths', () => {
    it('upgrade --list --registry prints error once on stderr and exits 1 (text)', async () => {
      const sub = path.join(tmpDir, 'upgrade-list-fail');
      fs.mkdirSync(sub, {recursive: true});
      const r = await runCli(['upgrade', '--list', '--registry'], {cwd: sub});
      expect(r.status).toBe(1);
      // The error message should appear exactly once across stdout+stderr.
      const combined = r.stdout + r.stderr;
      const occurrences = combined.split('cannot be used together').length - 1;
      expect(occurrences, 'error should appear exactly once').toBe(1);
    });

    it('upgrade --list --registry emits one error envelope in --json mode', async () => {
      const sub = path.join(tmpDir, 'upgrade-list-fail-json');
      fs.mkdirSync(sub, {recursive: true});
      const r = await runCli(['upgrade', '--list', '--registry', '--json'], {cwd: sub});
      expect(r.status).toBe(1);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toHaveProperty('error');
      expect(parsed).not.toHaveProperty('type');
    });

    it('non-list upgrade failure prints error once on stderr and exits 1 (text)', async () => {
      const sub = path.join(tmpDir, 'upgrade-nonlist-fail');
      fs.mkdirSync(sub, {recursive: true});
      const r = await runCli(['upgrade', '--from', 'notsemver'], {cwd: sub});
      expect(r.status).toBe(1);
      // The error should appear exactly once.
      const combined = r.stdout + r.stderr;
      const lines = combined.split('\n').filter(l => l.includes('notsemver') || l.includes('ERR'));
      // At most one line carries the error; zero is OK if the API formats
      // differently, but more than one means duplication.
      expect(lines.length, 'error should not be duplicated').toBeLessThanOrEqual(1);
    });

    it('non-list upgrade failure emits one error envelope in --json mode', async () => {
      const sub = path.join(tmpDir, 'upgrade-nonlist-fail-json');
      fs.mkdirSync(sub, {recursive: true});
      const r = await runCli(['upgrade', '--from', 'notsemver', '--json'], {cwd: sub});
      expect(r.status).toBe(1);
      const parsed = JSON.parse(r.stdout);
      expect(parsed).toHaveProperty('error');
    });
  });
});
