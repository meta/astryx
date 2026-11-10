// Test oracle only: runs the JS doc parsers on every real doc the CLI and
// Core ship plus crafted broken docs, and records each result, so the Rust
// unit test can prove parse_doc equal. Usage:
//   node scripts/parse-oracle.mjs <js-cli-root> <out.json>
import * as fs from 'node:fs';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

const [cliRoot, out] = process.argv.slice(2);
const imp = rel => import(pathToFileURL(path.join(cliRoot, rel)).href);
const {parseDoc} = await imp('authoring/doctypes/parse.mjs');
const {parseTemplate} = await imp('authoring/doctypes/template/parse.mjs');
const {parseTheme} = await imp('authoring/doctypes/theme/parse.mjs');
const {parseIconDefinition} = await imp('authoring/doctypes/icon-definition/parse.mjs');

function toJson(value, seen = new Set()) {
  if (value === undefined) return {__js: 'undefined'};
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') return Object.is(value, -0) ? 0 : Number.isFinite(value) ? value : {__js: 'number', value: String(value)};
  if (typeof value === 'function') return {__js: 'function', name: value.name};
  if (typeof value !== 'object') return {__js: typeof value};
  if (seen.has(value)) return {__js: 'circular'};
  seen.add(value);
  const o = Array.isArray(value) ? value.map(v => toJson(v, seen)) : Object.fromEntries(Object.keys(value).map(k => [k, toJson(value[k], seen)]));
  seen.delete(value);
  return o;
}

const cases = [];
const run = (parser, name, input, label) => {
  let result;
  try { result = {ok: toJson(parser(input, label))}; } catch (e) { result = {error: e.message}; }
  cases.push({parser: name, input: toJson(input), label, ...result});
};

function walk(dir, files) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f, files);
    else if (/\.doc\.mjs$/.test(e.name)) files.push(f);
  }
}
const files = [];
for (const d of ['assets/docs', 'assets/templates', 'assets/icons', 'clients/cli/commands', 'authoring']) walk(path.join(cliRoot, d), files);
walk(path.resolve(cliRoot, '..', 'core', 'src'), files);
walk(path.resolve(cliRoot, '..', 'lab', 'src'), files);
for (const f of files.sort()) {
  let mod;
  try { mod = await import(pathToFileURL(f).href); } catch { continue; }
  const doc = mod.default ?? mod.docs ?? mod.doc;
  if (doc == null || typeof doc !== 'object') continue;
  const t = doc.type;
  const parser = t === 'theme' ? parseTheme : t === 'icon-definition' ? parseIconDefinition : (t === 'page' || t === 'block') ? parseTemplate : parseDoc;
  const name = t === 'theme' ? 'theme' : t === 'icon-definition' ? 'icon-definition' : (t === 'page' || t === 'block') ? 'template' : 'doc';
  if (t === 'icon-set') continue;
  run(parser, name, doc, path.basename(f));
}
const bad = [
  null, [], 'x', {}, {type: 'component'}, {type: 'component', name: 'X'},
  {type: 'component', name: '', props: [{name: '', type: 1}], deprecated: {replacement: ''}, extra: 1},
  {type: 'function', name: 'useX', params: 'no', returns: [{type: ''}]},
  {type: 'generic', name: 'g', sections: []},
  {type: 'generic', name: 'g', replaces: 'a', extends: 'b', sections: [{id: 'a', title: 'A', content: []}, {id: 'a', title: 'B', content: [{type: 'prose'}]}]},
  {type: 'generic', name: 'g', sections: [{title: 'T', content: [{type: 'table', headers: ['a', 'b'], rows: [['x'], ['y', 'z']]}, {type: 'heading', level: 2, text: 'h'}, {type: 'list', style: 'x', items: []}, {type: 'nope'}, {type: 'code', lang: 'ts', code: 'x', label: ''}], bogus: 1}]},
  {type: 'generic', name: 'g', title: 'T', placement: {parent: '', order: 1.5, x: 1}, audience: 'all'},
  {type: 'page', name: 'p', description: '', registry: {slug: 'Bad Slug'}, icons: {'9x': 'Bad'}},
  {type: 'block', name: 'b', isShowcase: true, aspectRatio: -1},
  {type: 'block', name: 'b', isShowcase: true},
  {type: 'theme', name: ' ', displayName: '', description: 1, maintained: 'yes', more: 1},
  {type: 'theme', name: 'Bad_Name', displayName: 'X', description: '', maintained: true},
  {type: 'icon-definition', name: 'Bad', description: 'x', words: ['Up', ' ']},
  {type: 'icon-definition', name: 'ok', description: 'x', words: []},
  {type: 'namespace', name: 'n', title: 't', summary: 's', slots: {}},
  {type: 'namespace', name: 'n', title: 't', summary: 's', slots: {a: {title: 'A', accepts: {kinds: ['generic']}}}, adopts: [{source: {group: 'g', kinds: ['component']}, into: 'a'}, {source: {group: 'g'}, into: 'zz'}], blocks: [{type: 'collection', source: {slot: 'q'}}]},
  {type: 'schema', name: 's', displayName: 'S', description: 'd', fields: [{name: 'a', description: 'x', fields: [{name: '', type: '', description: 1}]}]},
  {type: 'command', name: 'c', displayName: 'C', summary: 's', options: [{flag: '', default: 3}], exitCodes: [{code: '1', when: 'x'}], outsideProject: 'no'},
  {type: 'enum', name: 'e', displayName: 'E', description: 'd', members: [{value: '', description: 2}]},
  {name: 'Legacy', props: [{name: 'a', type: 'b', description: 'c'}], zz: 1},
  {name: 'Legacy', title: 'T', description: 'd', sections: [{title: 'x', content: []}]},
  {name: 'LegacyBad', title: '', sections: []},
  {name: ''},
  {type: 'weird', name: 'x', params: [], returns: []},
];
for (const b of bad) {
  const t = b && typeof b === 'object' ? b.type : undefined;
  if (t === 'page' || t === 'block') run(parseTemplate, 'template', b, 'bad');
  else run(parseDoc, 'doc', b, 'bad');
}
fs.writeFileSync(out, JSON.stringify(cases));
console.log(cases.length, 'cases,', cases.filter(c => c.error).length, 'errors');
