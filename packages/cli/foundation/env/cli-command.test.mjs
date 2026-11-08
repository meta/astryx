// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, it, expect, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  chooseDeclaredCliCommand,
  cliDoor,
  declaredCliCommand,
  declaredCliCommandsOf,
  hasRecordedProject,
  recordDeclaredCliCommands,
  runWithCliDoor,
} from './cli-command.mjs';

/** @type {string[]} */
const dirs = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

/** A project directory with a package.json, and a folder inside it. */
function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-cli-command-'));
  dirs.push(dir);
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"app"}');
  fs.mkdirSync(path.join(dir, 'src'));
  return dir;
}

describe('runWithCliDoor', () => {
  it('sets the door for the call, and only for it', async () => {
    expect(cliDoor()).toBeUndefined();
    const inside = await runWithCliDoor('astryx', async () => {
      await Promise.resolve();
      return cliDoor();
    });
    expect(inside).toBe('astryx');
    expect(cliDoor()).toBeUndefined();
  });
});

describe('declaredCliCommandsOf', () => {
  it('skips integrations that failed to load or were set aside', () => {
    expect(
      declaredCliCommandsOf([
        {name: '@acme/a', cliCommand: 'acme astryx'},
        {name: '@acme/b'},
        {name: '@acme/c', cliCommand: 'c astryx', __loadError: 'boom'},
        {name: '@acme/d', cliCommand: 'd astryx', __providerConflict: {}},
        {__spec: '@acme/e', cliCommand: 'acme astryx'},
      ]),
    ).toEqual([
      {package: '@acme/a', command: 'acme astryx'},
      {package: '@acme/e', command: 'acme astryx'},
    ]);
  });
});

describe('chooseDeclaredCliCommand', () => {
  it('uses one command, however many packages declare it', () => {
    const declared = [
      {package: '@acme/a', command: 'acme astryx'},
      {package: '@acme/b', command: 'acme astryx'},
    ];
    expect(chooseDeclaredCliCommand(declared)).toEqual({
      command: 'acme astryx',
      conflict: false,
      declared,
    });
  });

  it('uses neither of two different commands, and calls it a conflict', () => {
    const result = chooseDeclaredCliCommand([
      {package: '@acme/a', command: 'acme astryx'},
      {package: '@acme/b', command: 'other astryx'},
    ]);
    expect(result.command).toBeUndefined();
    expect(result.conflict).toBe(true);
  });

  it('has nothing to choose with no declarations', () => {
    expect(chooseDeclaredCliCommand([])).toEqual({
      conflict: false,
      declared: [],
    });
  });
});

describe('recordDeclaredCliCommands', () => {
  it('answers for the project and any folder inside it', () => {
    const dir = makeProject();
    expect(hasRecordedProject(dir)).toBe(false);
    recordDeclaredCliCommands(dir, [
      {name: '@acme/a', cliCommand: 'acme astryx'},
    ]);
    expect(hasRecordedProject(dir)).toBe(true);
    expect(declaredCliCommand(dir).command).toBe('acme astryx');
    expect(declaredCliCommand(path.join(dir, 'src')).command).toBe(
      'acme astryx',
    );
  });

  it('lets the latest load win', () => {
    const dir = makeProject();
    recordDeclaredCliCommands(dir, [
      {name: '@acme/a', cliCommand: 'acme astryx'},
    ]);
    recordDeclaredCliCommands(dir, []);
    expect(hasRecordedProject(dir)).toBe(true);
    expect(declaredCliCommand(dir).command).toBeUndefined();
  });

  it('does not answer for a nested project of its own', () => {
    const dir = makeProject();
    const nested = path.join(dir, 'packages', 'web');
    fs.mkdirSync(nested, {recursive: true});
    fs.writeFileSync(path.join(nested, 'package.json'), '{"name":"web"}');
    recordDeclaredCliCommands(dir, [
      {name: '@acme/a', cliCommand: 'acme astryx'},
    ]);
    expect(hasRecordedProject(nested)).toBe(false);
    expect(declaredCliCommand(nested).command).toBeUndefined();
  });
});
