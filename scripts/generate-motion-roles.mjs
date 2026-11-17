#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file generate-motion-roles.mjs
 * @input Every motion table under packages/core/src (scripts/motion-table-files.mjs),
 *   spec:AST-094's FR4 table, and the current component records
 * @output docs/specs/AST-094-touch-presentations/motion-roles.md: the
 *   generated motion role table (spec:AST-094 DEC-5), listing every
 *   registered role, its kind, its default, and the record that names it
 * @position Tooling. `--check` fails when the committed table drifts from the
 *   registered tables; either mode fails when a registered role is named
 *   neither by FR4 nor by a component's own current record.
 *   packages/core/src/motion/roles.test.ts runs the check.
 *
 * Run: pnpm generate:motion-roles
 * CI:  pnpm check:motion-roles
 */

import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {format, resolveConfig} from 'prettier';
import {
  discoverKnowledgeRecords,
  parseKnowledgeDocument,
} from './check-knowledge.mjs';
import {
  fr4RoleIds,
  MOTION_ROLE_TABLE,
  renderMotionRoleTable,
} from './motion-roles-table.mjs';
import {motionTableFiles, REGISTER_EXPORT} from './motion-table-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = 'docs/specs/AST-094-touch-presentations/spec.md';

/**
 * Every registered role: each motion table module's register<Name>Table
 * runs, the way roles.test.ts registers them, in a bundle of the sources.
 * @returns {Promise<{id: string, kind: 'spring' | 'duration' | 'curve', value: unknown}[]>}
 */
async function registeredRoles() {
  const files = motionTableFiles(path.join(ROOT, 'packages/core/src'));
  const entry = [
    `import {listMotionRoles} from ${JSON.stringify(path.join(ROOT, 'packages/core/src/motion/roles.ts'))};`,
    ...files.map(
      (file, index) =>
        `import * as table${index} from ${JSON.stringify(file)};`,
    ),
    `const register = ${REGISTER_EXPORT};`,
    `for (const table of [${files.map((_, index) => `table${index}`).join(', ')}]) {`,
    '  for (const [name, value] of Object.entries(table)) {',
    "    if (register.test(name) && typeof value === 'function') value();",
    '  }',
    '}',
    'export const roles = listMotionRoles().map(({id, kind, value}) => ({id, kind, value}));',
  ].join('\n');
  const result = await build({
    stdin: {contents: entry, resolveDir: ROOT, loader: 'ts'},
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'silent',
  });
  const source = Buffer.from(result.outputFiles[0].text).toString('base64');
  const module = await import(`data:text/javascript;base64,${source}`);
  return module.roles;
}

/**
 * The current component records, each with its id and text: the records
 * that measure a component's own roles (spec:AST-094 FR4, DEC-5).
 * @returns {{id: string, text: string}[]}
 */
function componentRecords() {
  return discoverKnowledgeRecords(ROOT).flatMap(file => {
    const text = fs.readFileSync(file, 'utf8');
    const {frontmatter} = parseKnowledgeDocument(text, file);
    const id = frontmatter.get('id');
    return frontmatter.get('kind') === 'component' &&
      frontmatter.get('authority') === 'current' &&
      typeof id === 'string'
      ? [{id, text}]
      : [];
  });
}

async function main() {
  const check = process.argv.slice(2).includes('--check');
  const roles = await registeredRoles();
  const {source, unnamed} = renderMotionRoleTable(roles, {
    fr4: fr4RoleIds(fs.readFileSync(path.join(ROOT, SPEC), 'utf8')),
    records: componentRecords(),
  });
  if (unnamed.length > 0) {
    console.error(
      `A registered motion role must be named by spec:AST-094 FR4 or by a component's own current record (spec:AST-094 DEC-5); neither names ${unnamed.join(', ')}.`,
    );
    process.exitCode = 1;
    return;
  }
  const file = path.join(ROOT, MOTION_ROLE_TABLE);
  const markdown = await format(source, {
    ...(await resolveConfig(file)),
    filepath: file,
  });
  if (check) {
    const committed = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (committed !== markdown) {
      console.error(
        `${MOTION_ROLE_TABLE} is out of date with the registered motion tables: run \`pnpm generate:motion-roles\`.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log(
      `${MOTION_ROLE_TABLE} lists the ${roles.length} registered motion roles, each named by FR4 or a component's own record.`,
    );
    return;
  }
  fs.writeFileSync(file, markdown);
  console.log(`Wrote ${MOTION_ROLE_TABLE} (${roles.length} roles).`);
}

await main();
