// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the CLI capability manifest.
 *
 * Two jobs:
 *   1. DRIFT GUARDS — the manifest is the agent-facing contract for the whole
 *      CLI surface. These tests fail if a command is added without describing
 *      it: every registered command must appear in the manifest, every
 *      JSON-supported command must declare its response types, and every
 *      response-type key must map to a real command.
 *   2. SHAPE — each command entry carries the required fields, global options
 *      are described once, and the bare `xds --json` / `astryx manifest --json`
 *      surfaces emit valid, enriched JSON.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, it, expect} from 'vitest';
import {program, JSON_SUPPORTED} from '../index.mjs';
import {buildManifest} from './manifest.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * Import every `*.doc.mjs` under `dir` whose doc has the given type, keyed by
 * its `name`.
 * @param {string} dir @param {string} type @returns {Promise<Map<string, any>>}
 */
async function loadDocs(dir, type) {
  const out = new Map();
  for (const entry of fs.readdirSync(dir, {withFileTypes: true, recursive: true})) {
    if (!entry.isFile() || !entry.name.endsWith('.doc.mjs')) continue;
    const file = path.join(entry.parentPath, entry.name);
    const {doc} = await import(pathToFileURL(file).href);
    if (doc?.type === type) out.set(doc.name, doc);
  }
  return out;
}

const commandDocs = await loadDocs(path.join(HERE, '../commands'), 'command');
const functionDocs = await loadDocs(path.join(HERE, '../../../api'), 'function');

/**
 * Envelopes built in the CLI layer, which no FunctionDoc can declare. Pinned so
 * an entry is dropped once its type moves behind an API function.
 */
const CLI_LAYER_TYPES = {
  manifest: ['manifest'],
  'theme build': ['theme.build.batch'],
  'theme add': ['theme.list'],
};

const manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED, version: '0.0.0-test'});
/** Hidden commands (a package-script hook): documented, never in the manifest. */
const HIDDEN = new Set(
  program.commands.filter((c) => /** @type {any} */ (c)._hidden).map((c) => c.name()),
);

/** Flatten the manifest command tree into fully-qualified names. */
function flatten(cmds, out = []) {
  for (const c of cmds) {
    out.push(c);
    if (c.subcommands) flatten(c.subcommands, out);
  }
  return out;
}
const allEntries = flatten(manifest.commands);
const allNames = new Set(allEntries.map((c) => c.name));

/** Fully-qualified names of every registered, non-hidden command in the program. */
function registeredNames() {
  const names = [];
  const walk = (cmd, prefix) => {
    for (const sub of cmd.commands || []) {
      if (sub._hidden || sub.name() === 'help') continue;
      const full = prefix ? `${prefix} ${sub.name()}` : sub.name();
      names.push(full);
      walk(sub, full);
    }
  };
  walk(program, '');
  return names;
}

describe('manifest: drift guards', () => {
  it('lists every registered (non-hidden) command', () => {
    for (const name of registeredNames()) {
      expect(allNames.has(name), `manifest is missing command "${name}"`).toBe(true);
    }
  });

  it('marks every JSON_SUPPORTED command as json:true', () => {
    for (const name of JSON_SUPPORTED) {
      const entry = allEntries.find((c) => c.name === name);
      expect(entry, `JSON_SUPPORTED command "${name}" not in manifest`).toBeDefined();
      expect(entry.json, `"${name}" should be json:true`).toBe(true);
    }
  });

  it('declares response types for every JSON-supported command', () => {
    for (const name of JSON_SUPPORTED) {
      const entry = allEntries.find((c) => c.name === name);
      expect(
        entry?.responseTypes?.length,
        `JSON-supported command "${name}" has no response types`,
      ).toBeGreaterThan(0);
      expect(manifest.responseTypes[name]).toEqual(entry.responseTypes);
    }
  });

  it('has no response-type entry for a command that does not exist', () => {
    for (const name of Object.keys(manifest.responseTypes)) {
      expect(allNames.has(name), `responseTypes key "${name}" is not a real command`).toBe(true);
    }
  });

  it('takes every command example from its CommandDoc', () => {
    for (const [name, doc] of commandDocs) {
      if (HIDDEN.has(name)) continue;
      const entry = allEntries.find((c) => c.name === name);
      expect(entry, `CommandDoc "${name}" has no manifest entry`).toBeDefined();
      expect(entry.examples ?? [], name).toEqual((doc.examples ?? []).map((e) => e.cli));
    }
  });

  it('documents the hidden postinstall hook and keeps it out of the manifest', () => {
    expect([...HIDDEN]).toEqual(['postinstall']);
    expect(commandDocs.has('postinstall')).toBe(true);
    expect(allNames.has('postinstall')).toBe(false);
  });

  it('lists every response type the wrapped API function returns', () => {
    for (const [name, doc] of commandDocs) {
      if (!doc.fn) continue;
      const entry = allEntries.find((c) => c.name === name);
      for (const {type} of functionDocs.get(doc.fn).returns) {
        expect(entry.responseTypes, `${name} can emit ${type}`).toContain(type);
      }
    }
  });

  it('lists upgrade.registry, which `upgrade --registry --json` emits', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-manifest-'));
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"app","version":"1.0.0"}');
    const {status, stdout} = await runCli(['--json', 'upgrade', '--registry'], {cwd});
    expect(status).toBe(0);
    expect(JSON.parse(stdout).type).toBe('upgrade.registry');
    expect(manifest.responseTypes.upgrade).toContain('upgrade.registry');
  });

  it('lists theme.list for theme add, which lists themes when given no slug', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-manifest-'));
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"app","version":"1.0.0"}');
    const {status, stdout} = await runCli(['--json', 'theme', 'add'], {cwd});
    expect(status).toBe(0);
    expect(JSON.parse(stdout).type).toBe('theme.list');
    expect(manifest.responseTypes['theme add']).toContain('theme.list');
  });

  it('takes response types from the wrapped FunctionDoc, plus CLI-layer envelopes', () => {
    for (const [name, doc] of commandDocs) {
      if (HIDDEN.has(name)) continue;
      const entry = allEntries.find((c) => c.name === name);
      const returns = doc.fn ? functionDocs.get(doc.fn).returns.map((r) => r.type) : [];
      const expected = [...returns, ...(CLI_LAYER_TYPES[name] ?? [])];
      expect(entry.responseTypes ?? [], name).toEqual(expected);
    }
  });

  it('pins only CLI-layer envelopes that no FunctionDoc declares', () => {
    for (const [name, types] of Object.entries(CLI_LAYER_TYPES)) {
      const fn = commandDocs.get(name)?.fn;
      const declared = fn ? functionDocs.get(fn).returns.map((r) => r.type) : [];
      for (const type of types) {
        expect(declared, `${type} is declared by ${fn}(); unpin it`).not.toContain(type);
      }
    }
  });

  it('every command with response types is json-supported', () => {
    for (const entry of allEntries) {
      if (entry.responseTypes) {
        expect(entry.json, `"${entry.name}" emits types but isn't json-supported`).toBe(true);
      }
    }
  });

  it('exposes integration authoring only under doctor', () => {
    expect(allNames.has('validate-integration')).toBe(false);
    for (const name of [
      'doctor integration validate',
      'doctor integration templates',
      'doctor integration components',
      'doctor integration docs',
    ]) {
      expect(allNames.has(name), name).toBe(true);
    }
  });

  it('sorts subcommands by name (stable, agent-facing order)', () => {
    for (const entry of allEntries) {
      if (!entry.subcommands) continue;
      const names = entry.subcommands.map((s) => s.name);
      expect(names, `subcommands of "${entry.name}" are not sorted`).toEqual(
        [...names].sort((a, b) => a.localeCompare(b)),
      );
    }
  });

  it('is deterministic across builds', () => {
    const again = buildManifest(program, {
      jsonSupported: JSON_SUPPORTED,
      version: '0.0.0-test',
    });
    expect(again).toEqual(manifest);
  });
});

describe('manifest: shape', () => {
  it('has top-level metadata', () => {
    expect(manifest.name).toBe('astryx');
    expect(manifest.apiVersion).toBe(1);
    expect(typeof manifest.description).toBe('string');
    expect(Array.isArray(manifest.commands)).toBe(true);
    expect(Array.isArray(manifest.globalOptions)).toBe(true);
  });

  it('describes global options once at top level (--json, --lang, --detail, --version)', () => {
    const flags = manifest.globalOptions.map((o) => o.flag).join(' ');
    expect(flags).toContain('--json');
    expect(flags).toContain('--lang');
    expect(flags).toContain('--detail');
    expect(flags).toContain('--version');
    // No duplicate --version
    const versionCount = manifest.globalOptions.filter((o) => /--version\b/.test(o.flag)).length;
    expect(versionCount).toBe(1);
  });

  it('surfaces enum choices and defaults on options', () => {
    const detail = manifest.globalOptions.find((o) => o.flag.includes('--detail'));
    expect(detail.type).toBe('enum');
    expect(detail.choices).toEqual(['full', 'compact', 'brief']);
    expect(detail.default).toBe('full');
  });

  it('each command entry carries the required fields', () => {
    for (const c of allEntries) {
      expect(typeof c.name).toBe('string');
      expect(typeof c.description).toBe('string');
      expect(Array.isArray(c.arguments)).toBe(true);
      expect(Array.isArray(c.options)).toBe(true);
      expect(typeof c.json).toBe('boolean');
    }
  });

  it('derives arguments from Commander metadata', () => {
    const component = allEntries.find((c) => c.name === 'component');
    const names = component.arguments.find((a) => a.name === 'names');
    expect(names.required).toBe(false);
    expect(names.variadic).toBe(true);
    expect(names.description).toContain('Two or more return one ordered batch');
    const themeBuild = allEntries.find((c) => c.name === 'theme build');
    expect(themeBuild.arguments.map((a) => a.name)).toContain('files');
    const files = themeBuild.arguments.find((a) => a.name === 'files');
    expect(files.required).toBe(true);
    expect(files.variadic).toBe(true);
  });
});

describe('manifest: e2e', () => {
  it('astryx manifest --json emits a valid manifest envelope', async () => {
    const {status, stdout} = await runCli(['manifest', '--json']);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.apiVersion).toBe(1);
    expect(parsed.type).toBe('manifest');
    expect(parsed.data.name).toBe('astryx');
    const names = parsed.data.commands.map((c) => c.name);
    expect(names).toContain('component');
    expect(names).toContain('theme');
    expect(names).toContain('manifest');
  });

  it('bare xds --json stays backwards-compatible AND embeds the manifest', async () => {
    const {status, stdout} = await runCli(['--json']);
    expect(status).toBe(0);
    const parsed = JSON.parse(stdout);
    // Back-compat: still type:'help' with name/version/commands(names)/jsonSupported
    expect(parsed.type).toBe('help');
    expect(parsed.data.name).toBe('astryx');
    expect(Array.isArray(parsed.data.commands)).toBe(true);
    expect(parsed.data.commands.every((c) => typeof c === 'string')).toBe(true);
    expect(parsed.data.commands).toContain('component');
    expect(Array.isArray(parsed.data.jsonSupported)).toBe(true);
    // Enriched: the full structured manifest is embedded.
    expect(parsed.data.manifest).toBeDefined();
    expect(parsed.data.manifest.commands.find((c) => c.name === 'component').responseTypes)
      .toEqual(expect.arrayContaining(['component.list', 'component.batch']));
  });
});

describe('manifest: text projection', () => {
  it('astryx manifest (text) uses the JSON entry keys as its field names', async () => {
    const text = await runCli(['manifest']);
    expect(text.status).toBe(0);
    const json = JSON.parse((await runCli(['manifest', '--json'])).stdout);
    const jsonKeys = new Set(json.data.commands.flatMap((c) => Object.keys(c)));
    const textKeys = new Set(
      text.stdout
        .split('\n')
        .map((line) => /^([A-Za-z]+):\s/.exec(line)?.[1])
        .filter(Boolean),
    );
    expect(textKeys).toContain('name');
    for (const key of textKeys) expect(jsonKeys).toContain(key);
  });
});

describe('global mode is discoverable (spec:AST-017 FR14)', () => {
  it('the manifest names what a run may do beyond its command, and the docs topic that explains it', () => {
    expect(manifest.globalMode.docs).toBe('astryx docs global');
    for (const word of ['hands the run', 'once a day', 'agent skill']) {
      expect(manifest.globalMode.summary).toContain(word);
    }
  });

  it('--help carries one line pointing to the global mode docs', () => {
    const help = program.helpInformation() + '';
    let after = '';
    program.emit('afterHelp', {
      error: false,
      write: (/** @type {string} */ s) => {
        after += s;
      },
    });
    const lines = `${help}${after}`
      .split('\n')
      .filter(line => line.startsWith('Global mode:'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/docs global\.$/u);
  });
});
