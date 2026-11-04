// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The README's hand-written envelope shapes and `search` flags match the
 * CLI. The generated tables are covered by readme-gen.test.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import {program, JSON_SUPPORTED} from '../clients/cli/index.mjs';
import {buildManifest} from '../clients/cli/lib/manifest.mjs';
import {runCli} from '../test-utils/run-cli.mjs';

const README = fs
  .readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../README.md'), 'utf8')
  .replace(/<!-- BEGIN GENERATED: (\S+) -->[\s\S]*?<!-- END GENERATED: \1 -->/g, '');

/**
 * INV2: success is {apiVersion, type, data} + package?, meta? (INV28 adds
 * `package` for a result about one artifact); failure is
 * {apiVersion, error, code} + suggestions?.
 */
const SHAPES = {
  success: {required: ['apiVersion', 'type', 'data'], optional: ['package', 'meta']},
  failure: {required: ['apiVersion', 'error', 'code'], optional: ['suggestions']},
};

/** Every balanced `{...}` group in `text`. @param {string} text */
function braceGroups(text) {
  const groups = [];
  const open = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') open.push(i);
    else if (text[i] === '}' && open.length > 0) groups.push(text.slice(open.pop(), i + 1));
  }
  return groups;
}

/**
 * Top-level keys of an object literal or shape: `{ a, b?: x, "c": {...} }`.
 * @param {string} group
 */
function topLevelKeys(group) {
  const keys = [];
  let depth = 0;
  let quote = '';
  let entry = '';
  const flush = () => {
    const m = /^\s*["']?([A-Za-z_$][\w$]*)["']?\??\s*(?::|$)/.exec(entry);
    if (m) keys.push(m[1]);
    entry = '';
  };
  const body = group.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      entry += ch;
      if (ch === '\\') entry += body[++i] ?? '';
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      entry += ch;
    } else if ('{[('.includes(ch)) {
      depth++;
      entry += ch;
    } else if ('}])'.includes(ch)) {
      depth--;
      entry += ch;
    } else if (ch === ',' && depth === 0) {
      flush();
    } else {
      entry += ch;
    }
  }
  flush();
  return keys;
}

/** The README's envelope shapes: groups keyed like a success or a failure. */
function readmeEnvelopes() {
  return braceGroups(README)
    .map((group) => ({group, keys: topLevelKeys(group)}))
    .flatMap(({group, keys}) => {
      if (keys.includes('error')) return [{group, keys, kind: 'failure'}];
      if (keys.includes('type') && keys.includes('data')) return [{group, keys, kind: 'success'}];
      return [];
    });
}

describe('README envelope shapes', () => {
  it('finds the hand-written envelopes', () => {
    const kinds = readmeEnvelopes().map((e) => e.kind);
    expect(kinds.filter((k) => k === 'success').length).toBeGreaterThanOrEqual(4);
    expect(kinds.filter((k) => k === 'failure').length).toBeGreaterThanOrEqual(2);
  });

  it('real envelopes carry exactly the documented keys', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-readme-'));
    const success = JSON.parse((await runCli(['--json', 'docs'], {cwd})).stdout);
    const failure = JSON.parse((await runCli(['--json', 'docs', 'no-such-topic'], {cwd})).stdout);
    for (const [kind, envelope] of /** @type {const} */ ([
      ['success', success],
      ['failure', failure],
    ])) {
      const {required, optional} = SHAPES[kind];
      for (const key of required) expect(Object.keys(envelope), kind).toContain(key);
      for (const key of Object.keys(envelope)) expect([...required, ...optional], kind).toContain(key);
    }
  });

  it.each(readmeEnvelopes().map((e) => [e.group.replace(/\s+/g, ' ').slice(0, 70), e]))(
    '%s names the INV2 keys',
    (_label, {keys, kind}) => {
      const {required, optional} = SHAPES[kind];
      for (const key of required) expect(keys).toContain(key);
      for (const key of keys) expect([...required, ...optional]).toContain(key);
    },
  );
});

describe('README search options', () => {
  const manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED, version: '0.0.0-test'});
  const search = manifest.commands.find((c) => c.name === 'search');
  const section = README.slice(
    README.indexOf('## Finding things: `astryx search`'),
    README.indexOf('## Commands'),
  );
  const bullets = [...section.matchAll(/^- `(--[\w-]+)( <[^>]+>)?`/gm)];

  it('lists the search options', () => {
    expect(bullets.length).toBeGreaterThanOrEqual(3);
  });

  it.each(bullets.map((m) => [m[1], Boolean(m[2])]))(
    '`%s` is a search or global option with the same arity',
    (flag, takesValue) => {
      const option = [...search.options, ...manifest.globalOptions].find((o) =>
        o.flag.split(/[\s,]+/).includes(flag),
      );
      expect(option, `${flag} is not accepted by astryx search`).toBeDefined();
      expect(option.type !== 'boolean', `${flag} value arity`).toBe(takesValue);
    },
  );
});
