// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Compile the doc, template and theme candidates `search` gathers from the
 * CLI's own files (no project around them) into the JSON the Rust `search` command embeds. A doc
 * renders its `{@pm}` steps for the reader's package manager, so the file
 * holds the npm candidates whole and, for each other package manager, only
 * the candidates that differ.
 *
 * Usage: node scripts/gen-search-candidates.mjs [--check]
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The CLI to read: this checkout's, or another checkout with its node_modules.
const cliRoot = process.env.ASTRYX_CLI_ROOT ?? path.resolve(here, '../../cli');
const out = path.resolve(here, '../src/commands/search/data/own-candidates.json');
const imp = rel => import(path.join(cliRoot, rel));

const {gatherDocs} = await imp('api/search/_gather-docs.mjs');
const {gatherTemplates, gatherThemes} = await imp('api/search/_gather-templates.mjs');
const {runWithDocPackageManager} = await imp('foundation/env/package-manager.mjs');
const {withListingCache} = await imp('foundation/fs/listing-cache.mjs');
const {loadDocsCatalog} = await imp('api/docs/_adapter.mjs');
const {loadAuthoringSelfDocs} = await imp('foundation/discovery/authoring-self-docs.mjs');

const PMS = ['npm', 'pnpm', 'yarn', 'yarn-classic', 'bun'];
const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-search-gen-'));
process.chdir(cwd);

const plain = value => JSON.parse(JSON.stringify(value));
const variants = {};
for (const pm of PMS) {
  variants[pm] = plain(
    await runWithDocPackageManager(pm, () => withListingCache(() => gatherDocs(cwd))),
  );
}
const base = variants.npm;
const diffs = {};
for (const pm of PMS.slice(1)) {
  const v = variants[pm];
  if (v.length !== base.length) throw new Error(`${pm}: ${v.length} candidates, npm has ${base.length}`);
  diffs[pm] = {};
  v.forEach((c, i) => {
    if (JSON.stringify(c) !== JSON.stringify(base[i])) diffs[pm][i] = c;
  });
}
// The CLI's own templates and bundled themes, as an open search outside any
// project gathers them. A page's derived weak keywords are read whole.
const templates = plain(await withListingCache(() => gatherTemplates(cwd)));
const themes = plain(await withListingCache(() => gatherThemes(cwd)));
// Where the topic candidates end and the docs-tree ones start: an
// integration's topics are gathered between the two.
const entryNames = new Set([...(await loadDocsCatalog(cwd)).entries()].map(e => e.name));
const topicCount = base.findIndex(c => !entryNames.has(c._topic));
if (base.slice(topicCount).some(c => entryNames.has(c._topic) && !c._topic.includes('/')))
  throw new Error('a docs-tree candidate shares a topic name');
// The experimental self-docs whose sections search never shows: a project
// whose integrations change the docs gathers them at run time.
const hidden = (await loadAuthoringSelfDocs()).loaded
  .filter(({doc}) => doc?.stability === 'experimental')
  .map(({doc}) => doc.name);
const text = `${JSON.stringify({base, diffs, topicCount, hidden, templates, themes})}\n`;
if (process.argv.includes('--check')) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (current !== text) {
    console.error(`${out} is stale: run node scripts/gen-search-candidates.mjs`);
    process.exit(1);
  }
  console.log('search docs are current');
} else {
  fs.writeFileSync(out, text);
  console.log(`wrote ${out} (${text.length} bytes, ${base.length} candidates; diffs ${PMS.slice(1).map(p => `${p}:${Object.keys(diffs[p]).length}`).join(' ')})`);
}
