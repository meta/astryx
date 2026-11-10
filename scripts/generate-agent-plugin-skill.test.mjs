// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The agent plugin's skill (spec AST-081 FR13): the checked-in file is
 * `renderComputerAgentText`'s output, so the Claude Code and Codex plugins
 * share one skill that cannot drift from the computer-level guidance.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  COMPUTER_COMMAND,
  STABLE_COMMANDS,
  renderComputerAgentText,
} from '../packages/cli/foundation/agent-docs/computer-agent-text.mjs';
import {isPluginSkillCurrent} from './generate-agent-plugin-skill.mjs';

const folders = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    fs.rmSync(folder, {recursive: true, force: true});
  }
});

function temporaryFile(text) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-plugin-skill-'));
  folders.push(folder);
  const file = path.join(folder, 'SKILL.md');
  if (text !== undefined) fs.writeFileSync(file, text);
  return file;
}

function pluginSkillText() {
  return renderComputerAgentText({command: COMPUTER_COMMAND});
}

describe('agent plugin skill', () => {
  it('is renderComputerAgentText output, so the checked-in copy cannot drift', () => {
    expect(isPluginSkillCurrent()).toBe(true);
  });

  it('reports a copy that differs from the rendering, and a missing one', () => {
    expect(isPluginSkillCurrent(temporaryFile(pluginSkillText()))).toBe(true);
    expect(
      isPluginSkillCurrent(temporaryFile(`${pluginSkillText()}extra\n`)),
    ).toBe(false);
    expect(isPluginSkillCurrent(temporaryFile())).toBe(false);
  });

  it('names only stable commands and the restore step', () => {
    const text = pluginSkillText();
    const commands = [...text.matchAll(/`astryx ([a-z-]+)/gu)].map(
      match => match[1],
    );
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(STABLE_COMMANDS).toContain(command);
    expect(text).toContain('npm i -g @astryxdesign/cli');
  });

  it('writes front matter an agent tool can parse', () => {
    const [start, name, description, end] = pluginSkillText().split('\n');
    expect([start, name, end]).toEqual(['---', 'name: astryx', '---']);
    expect(description).toMatch(/^description: ".+"$/u);
  });
});
