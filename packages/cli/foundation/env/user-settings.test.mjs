// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  computerAgentTextSettings,
  readSettings,
  recordComputerAgentTextSettings,
  settingsFile,
} from './user-settings.mjs';

/** @type {string[]} */
const dirs = [];
const tmp = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-settings-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

describe('the settings file (spec AST-081 FR8)', () => {
  it('means install, with no links, when missing or unreadable', () => {
    const dir = tmp();
    expect(computerAgentTextSettings(dir)).toEqual({install: true, links: []});
    fs.writeFileSync(settingsFile(dir), 'not json');
    expect(readSettings(dir)).toEqual({});
    expect(computerAgentTextSettings(dir)).toEqual({install: true, links: []});
  });

  it('records and reads the choice and the links Astryx made, keeping other settings', () => {
    const dir = tmp();
    fs.writeFileSync(settingsFile(dir), '{"other":true}');
    expect(
      recordComputerAgentTextSettings(
        {install: true, links: ['/h/.claude/skills/astryx']},
        dir,
      ),
    ).toBe(true);
    expect(JSON.parse(fs.readFileSync(settingsFile(dir), 'utf8'))).toEqual({
      other: true,
      computerAgentText: {install: true, links: ['/h/.claude/skills/astryx']},
    });
    expect(computerAgentTextSettings(dir)).toEqual({
      install: true,
      links: ['/h/.claude/skills/astryx'],
    });
    recordComputerAgentTextSettings({install: false, links: []}, dir);
    expect(computerAgentTextSettings(dir)).toEqual({install: false, links: []});
  });

  it('never fails when the folder cannot be written', () => {
    const file = path.join(tmp(), 'file');
    fs.writeFileSync(file, '');
    expect(
      recordComputerAgentTextSettings({install: false, links: []}, file),
    ).toBe(false);
  });
});
