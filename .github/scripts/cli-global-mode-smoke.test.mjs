// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {describe, expect, it} from 'vitest';

const source = fs.readFileSync(
  new URL('./cli-global-mode-smoke.mjs', import.meta.url),
  'utf8',
);
const printedCommands = source.slice(
  source.indexOf('  // printed commands, pasted into the shells people use'),
  source.indexOf('  // init --user in a project on an older release'),
);

async function checkPrintedCommands({write = true, release = '0.7.17'} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-smoke-command-'));
  const core071 = path.join(root, 'core071');
  const empty = path.join(root, 'empty');
  const records = [];
  const commands = [];
  fs.mkdirSync(path.join(core071, 'src'), {recursive: true});
  fs.mkdirSync(empty);
  const kept = path.join(core071, 'src', 'kept.tsx');
  fs.writeFileSync(kept, 'keep');
  try {
    await vm.runInNewContext(`(async () => {${printedCommands}})()`, {
      fs,
      path,
      core071,
      empty,
      LABEL: '0.7.17',
      WIN: false,
      envA: {},
      astryx: async (_argv, {cwd}) => ({
        stdout: `command: ${cwd === core071 ? 'npx @astryxdesign/cli@0.7.17 template settings --type page src/pages/settings' : 'astryx template settings --type page <path>'}`,
        stderr: '',
      }),
      run: async (_exe, argv, {cwd}) => {
        const command = argv[1];
        commands.push(command);
        const destination = command.split(' ').at(-1);
        const file = path.join(
          cwd,
          destination.endsWith('.tsx')
            ? destination
            : path.join(destination, 'page.tsx'),
        );
        if (write) {
          fs.mkdirSync(path.dirname(file), {recursive: true});
          fs.writeFileSync(file, 'export default function Settings() {}');
        }
        return {
          code: 0,
          stderr:
            cwd === core071
              ? ''
              : `astryx: answered by CLI ${release} with Core ${release}, outside a project`,
        };
      },
      whoLines: text =>
        text.split('\n').filter(line => line.startsWith('astryx: ')),
      ok: (name, pass, detail) => records.push({name, pass, detail}),
    });
    expect(commands[0]).toBe(
      'npx @astryxdesign/cli@0.7.17 template settings --type page src/pages/settings',
    );
    expect(fs.readFileSync(kept, 'utf8')).toBe('keep');
    expect(fs.existsSync(path.join(core071, 'src/pages/settings'))).toBe(false);
    expect(fs.readdirSync(empty)).toEqual([]);
    return records.map(record => record.pass);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
}

describe('global smoke printed commands', () => {
  it('checks the concrete project destination and the outside-project placeholder', async () => {
    expect(await checkPrintedCommands()).toEqual([true, true]);
  });

  it('still rejects a successful command that writes no file', async () => {
    expect(await checkPrintedCommands({write: false})).toEqual([false, false]);
  });

  it('still rejects an outside-project command answered by another release', async () => {
    expect(await checkPrintedCommands({release: '0.6.8'})).toEqual([
      true,
      false,
    ]);
  });
});
