#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Stores the candidates `astryx search` gathers in this site's project.
 * @input The workspace docs and packages the CLI's search reads from here.
 * @output src/generated/searchIndex.ts, which the search API
 *   (src/app/api/search/route.ts) ranks, so a search server that starts reads
 *   no docs or packages before it answers.
 * @position Run by generate-data.mjs, as a process of its own.
 *
 * generate-data.mjs reads every doc with the site's package manager (npm),
 * and the CLI keeps the docs it has read. `astryx search` reads them with this
 * project's package manager, and the site's search answers what
 * `astryx search` answers here. So the gather runs in a process that has read
 * no docs.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {exportSearchIndex} from '@astryxdesign/cli/api';

const DOCSITE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const REPO_ROOT = path.resolve(DOCSITE_ROOT, '..', '..');
const OUT_PATH = path.join(DOCSITE_ROOT, 'src', 'generated', 'searchIndex.ts');

const index = await exportSearchIndex({cwd: DOCSITE_ROOT});

fs.mkdirSync(path.dirname(OUT_PATH), {recursive: true});
// One string for JSON.parse: the type checker and the bundler then read one
// literal, never the shape of every candidate.
fs.writeFileSync(
  OUT_PATH,
  `// Copyright (c) Meta Platforms, Inc. and affiliates.

// Auto-generated — do not edit
import type {SearchIndex} from '@astryxdesign/cli/api';

export const searchIndex: SearchIndex = JSON.parse(
  ${JSON.stringify(JSON.stringify(index))},
);
`,
  'utf-8',
);
console.log(
  `  wrote ${path.relative(REPO_ROOT, OUT_PATH)} (${index.candidates.length} search candidates)`,
);
