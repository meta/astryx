// Records what `astryx build` reads for each query (search's lexical
// results with coverage, templates, components, setup notes) and the JS
// answer, so the Rust port of build's own logic can be checked before
// search and discovery are cloned. Usage (from a project folder):
//   node build-fixtures.mjs <cli-root> <out-dir> <queries.json>
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const [cliRoot, outDir, queriesFile] = process.argv.slice(2);
const imp = p => import(pathToFileURL(path.join(cliRoot, p)).href);
const {searchCore, searchedComponents} = await imp('api/search/search.mjs');
const {getResultCoverage} = await imp('api/search/coverage.mjs');
const adapter = await imp('api/build/_adapter.mjs');
const {build} = await imp('api/build/build.mjs');
const cwd = process.cwd();
const queries = JSON.parse(fs.readFileSync(queriesFile, 'utf8'));
fs.mkdirSync(outDir, {recursive: true});
const templates = await adapter.loadTemplates(cwd);
const components = await adapter.loadComponents(cwd);
const notes = {};
for (const t of templates.pages) notes[t.name] = adapter.templateSetupNotes(t, cwd);
let i = 0;
for (const q of queries) {
  const {query, type, limit = 60} = typeof q === 'string' ? {query: q} : q;
  const fx = {query, type: type ?? null, limit, templates, components, notes};
  try {
    const sl = Number.isInteger(limit) && limit > 0 ? Math.max(limit, 200) : limit;
    const r = await searchCore(query, {cwd, type, limit: sl});
    fx.search = {
      query: r.data.query,
      matchCount: r.data.matchCount,
      results: r.data.results.map(e => ({entry: e, coverage: getResultCoverage(e) ?? null})),
      searchedComponents: searchedComponents(r),
    };
    fx.answer = await build(query, {cwd, type, limit});
  } catch (e) {
    fx.error = {message: e.message, code: e.code};
  }
  fs.writeFileSync(path.join(outDir, `${String(i++).padStart(4, '0')}.json`), JSON.stringify(fx));
}
