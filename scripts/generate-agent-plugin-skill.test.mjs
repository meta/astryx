// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The agent plugin's skill (spec AST-081 FR8): the checked-in file is the
 * renderer's output, drift is reported, and the plugin form is the global
 * skill's lines without its first line or build workflow.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  STABLE_COMMANDS,
  renderComputerAgentText,
  renderPluginSkillText,
} from '../packages/cli/foundation/agent-docs/computer-agent-text.mjs';
import {
  WORKFLOW_STEPS,
  WORKFLOW_TITLE,
} from '../packages/cli/foundation/agent-docs/agent-doc-state.mjs';
import {isPluginSkillCurrent} from './generate-agent-plugin-skill.mjs';

/** The lines after the frontmatter. */
function bodyOf(text) {
  const end = text.indexOf('\n---\n', 4);
  return text
    .slice(end + '\n---\n'.length)
    .trim()
    .split('\n');
}

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

describe('agent plugin skill', () => {
  it('is the renderer output, so the checked-in copy cannot drift', () => {
    expect(isPluginSkillCurrent()).toBe(true);
  });

  it('reports a copy that differs from the rendering, and a missing one', () => {
    expect(isPluginSkillCurrent(temporaryFile(renderPluginSkillText()))).toBe(
      true,
    );
    expect(
      isPluginSkillCurrent(temporaryFile(`${renderPluginSkillText()}extra\n`)),
    ).toBe(false);
    expect(isPluginSkillCurrent(temporaryFile())).toBe(false);
  });

  it('keeps every body line of the global skill it shares, and only its first line differs', () => {
    const global = bodyOf(renderComputerAgentText({command: 'astryx'}));
    const [first, ...rest] = bodyOf(renderPluginSkillText());
    expect(first).not.toBe(global[0]);
    for (const line of rest) expect(global).toContain(line);
  });

  it('leaves out the build workflow and self-check lines', () => {
    const body = bodyOf(renderPluginSkillText());
    expect(body).not.toContain(WORKFLOW_TITLE);
    for (const step of WORKFLOW_STEPS) expect(body).not.toContain(step);
    expect(body.join('\n')).not.toMatch(/re-read each file/u);
  });

  it('names only stable commands and the restore step', () => {
    const text = renderPluginSkillText();
    const commands = [...text.matchAll(/`astryx ([a-z-]+)/gu)].map(
      match => match[1],
    );
    expect(commands.length).toBeGreaterThan(0);
    for (const command of commands) expect(STABLE_COMMANDS).toContain(command);
    expect(text).toContain('npm i -g @astryxdesign/cli');
  });

  it('writes front matter an agent tool can parse', () => {
    const [start, name, description, end] = renderPluginSkillText().split('\n');
    expect([start, name, end]).toEqual(['---', 'name: astryx', '---']);
    expect(description).toMatch(/^description: '[^']+'$/u);
  });
});
