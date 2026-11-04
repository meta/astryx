// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Every CommandDoc's exit codes reach generated help and the manifest.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {describe, it, expect} from 'vitest';
import {program, JSON_SUPPORTED} from '../index.mjs';
import {buildManifest} from './manifest.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';

const COMMANDS = path.join(path.dirname(fileURLToPath(import.meta.url)), '../commands');

/** @type {any[]} */
const commandDocs = [];
for (const file of fs.readdirSync(COMMANDS).sort()) {
  if (!file.endsWith('.doc.mjs')) continue;
  const {doc} = await import(pathToFileURL(path.join(COMMANDS, file)).href);
  if (doc?.type === 'command') commandDocs.push(doc);
}

const manifest = buildManifest(program, {jsonSupported: JSON_SUPPORTED, version: '0.0.0-test'});
/** Hidden commands (a package-script hook): documented, never in the manifest. */
const HIDDEN = new Set(
  program.commands.filter((c) => /** @type {any} */ (c)._hidden).map((c) => c.name()),
);
/** @type {Map<string, any>} */
const entries = new Map();
const walk = (/** @type {any} */ c) => {
  entries.set(c.name, c);
  (c.subcommands || []).forEach(walk);
};
manifest.commands.forEach(walk);

describe('command exit codes', () => {
  it('every CommandDoc documents its exit codes', () => {
    expect(commandDocs.length).toBeGreaterThan(30);
    for (const doc of commandDocs) {
      expect(doc.exitCodes?.length, doc.name).toBeGreaterThan(0);
    }
  });

  it.each(commandDocs.map((d) => [d.name, d]))(
    '`astryx %s --help` lists the documented exit codes, then the examples and the docs route',
    async (name, doc) => {
      const {status, stdout} = await runCli([...name.split(' '), '--help']);
      expect(status).toBe(0);
      const section = stdout.slice(stdout.indexOf('\nExit codes:\n'));
      expect(section.startsWith('\nExit codes:\n'), stdout).toBe(true);
      expect(stdout.match(/\nExit codes?:\n/g), 'one exit-code section').toHaveLength(1);
      for (const {code, when} of doc.exitCodes) {
        expect(section).toContain(`\n  ${code}  ${when}\n`);
      }
      // Examples follow the exit codes, each under its label, and a `More:`
      // line names the route that reads the whole command.
      const examples = section.indexOf('\nExamples:\n');
      expect(examples > 0, stdout).toBe((doc.examples ?? []).length > 0);
      for (const {label, cli} of doc.examples ?? []) {
        const line = ` ${cli.replace(/^astryx\s+/, '')}\n`;
        expect(section.slice(examples), stdout).toContain(
          label ? `\n  # ${label}\n` : line,
        );
        expect(section.slice(examples)).toContain(line);
      }
      const route = `docs cli/commands/${name.replace(/ /g, '-')}`;
      expect(section, stdout).toMatch(
        new RegExp(`\\n\\nMore: \\S.* ${route}\\n`),
      );
      expect(section.indexOf('\nMore: ')).toBeGreaterThan(examples);
    },
  );

  it('`astryx discover` with a blank query exits 1 only when packages are discovered', async () => {
    const doc = commandDocs.find((d) => d.name === 'discover');
    expect(doc.exitCodes.find((e) => e.code === 1)?.when).toMatch(/blank query when packages are discovered/);
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-exit-discover-'));
    try {
      expect((await runCli(['discover', '   ', '--json'], {cwd: project})).status).toBe(0);
      const pkg = path.join(project, 'node_modules/@acme/ui');
      fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
      fs.writeFileSync(path.join(pkg, 'package.json'), '{"name":"@acme/ui","version":"1.0.0","type":"module"}');
      fs.writeFileSync(path.join(pkg, 'astryx.integration.mjs'), "export default {components: './components'};\n");
      fs.writeFileSync(
        path.join(pkg, 'components/Widget.doc.mjs'),
        'export const doc = {type: "component", name: "Widget", description: "A widget"};\n',
      );
      fs.writeFileSync(path.join(pkg, 'components/Widget.tsx'), 'export function Widget() { return null; }\n');
      fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app","type":"module"}');
      fs.writeFileSync(path.join(project, 'astryx.config.mjs'), "export default {integrations: ['@acme/ui']};\n");
      expect((await runCli(['discover', '--json'], {cwd: project})).status).toBe(0);
      const blank = await runCli(['discover', '   ', '--json'], {cwd: project});
      expect(blank.status).toBe(1);
      expect(JSON.parse(blank.stdout).code).toBe('ERR_INVALID_ARGUMENT');
    } finally {
      fs.rmSync(project, {recursive: true, force: true});
    }
  });

  it('the manifest carries every command exit code', () => {
    for (const doc of commandDocs) {
      if (HIDDEN.has(doc.name)) continue;
      expect(entries.get(doc.name)?.exitCodes, doc.name).toEqual(
        doc.exitCodes.map(({code, when}) => ({code, when})),
      );
    }
  });
});
