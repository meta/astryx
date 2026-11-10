// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Generates `plugins/astryx/skills/astryx/SKILL.md`, the agent plugin's skill,
 * from the same renderer that writes the computer-level skill, so the two
 * cannot drift (spec AST-081 FR8).
 *
 * `--check` writes nothing and exits 1 when the checked-in file differs from
 * the rendering.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {renderPluginSkillText} from '../packages/cli/foundation/agent-docs/computer-agent-text.mjs';

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

/**
 * Whether the checked-in file is the rendering.
 * @param {string} [file]
 * @returns {boolean}
 */
export function isPluginSkillCurrent(file = PLUGIN_SKILL_FILE) {
  return (
    fs.existsSync(file) &&
    fs.readFileSync(file, 'utf8') === renderPluginSkillText()
  );
}

function main(args) {
  if (args.includes('--check')) {
    if (isPluginSkillCurrent()) return 0;
    console.error(
      `${path.relative(REPO_ROOT, PLUGIN_SKILL_FILE)} is out of date with renderPluginSkillText. Run \`pnpm generate:agent-plugin-skill\` and commit the result.`,
    );
    return 1;
  }
  fs.mkdirSync(path.dirname(PLUGIN_SKILL_FILE), {recursive: true});
  fs.writeFileSync(PLUGIN_SKILL_FILE, renderPluginSkillText());
  console.log(`Wrote ${path.relative(REPO_ROOT, PLUGIN_SKILL_FILE)}`);
  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = main(process.argv.slice(2));
}
