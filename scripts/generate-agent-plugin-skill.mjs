// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Generates `plugins/astryx/skills/astryx/SKILL.md`, the agent plugin's skill,
 * from `renderComputerAgentText`, so the Claude Code and Codex plugins share
 * the same guidance the computer-level skill uses (spec AST-081 FR8, FR13).
 *
 * `--check` writes nothing and exits 1 when the checked-in file differs from
 * the rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {
  COMPUTER_COMMAND,
  renderComputerAgentText,
} from '../packages/cli/foundation/agent-docs/computer-agent-text.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const PLUGIN_SKILL_FILE = path.join(
  REPO_ROOT,
  'plugins',
  'astryx',
  'skills',
  'astryx',
  'SKILL.md',
);

/** The plugin skill always names the global `astryx` command. */
function pluginSkillText() {
  return renderComputerAgentText({command: COMPUTER_COMMAND});
}

/**
 * Whether the checked-in file is the rendering.
 * @param {string} [file]
 * @returns {boolean}
 */
export function isPluginSkillCurrent(file = PLUGIN_SKILL_FILE) {
  return (
    fs.existsSync(file) && fs.readFileSync(file, 'utf8') === pluginSkillText()
  );
}

function main(args) {
  if (args.includes('--check')) {
    if (isPluginSkillCurrent()) return 0;
    console.error(
      `${path.relative(REPO_ROOT, PLUGIN_SKILL_FILE)} is out of date with renderComputerAgentText. Run \`pnpm generate:agent-plugin-skill\` and commit the result.`,
    );
    return 1;
  }
  fs.mkdirSync(path.dirname(PLUGIN_SKILL_FILE), {recursive: true});
  fs.writeFileSync(PLUGIN_SKILL_FILE, pluginSkillText());
  console.log(`Wrote ${path.relative(REPO_ROOT, PLUGIN_SKILL_FILE)}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = main(process.argv.slice(2));
}
