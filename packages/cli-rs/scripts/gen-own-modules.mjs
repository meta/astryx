// Build-time generator: imports the CLI's OWN doc modules (CommandDocs,
// assets/docs, template docs, self-docs) and writes their export namespaces
// as JSON, which the Rust binary embeds (src/discovery/generated/). The
// output is committed; a unit test fails when a source file changed since.
//
// Usage: node scripts/gen-own-modules.mjs
// Values: functions become {"__js":"function","name":...}; undefined
// and every other value convert exactly as crate::js converts them (see
// src/js/convert.rs), so an embedded namespace equals a loaded one.
import * as fs from 'node:fs';
import * as path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// The CLI root to import from: argv[2] (a checkout whose packages/cli has its
// node_modules installed), else the cli package beside this crate.
const cliRoot = path.resolve(process.argv[2] ?? path.join(here, '..', '..', 'cli'));
const outDir = path.resolve(here, '..', 'src', 'discovery', 'generated');

const ROOTS = ['api', 'assets/docs', 'assets/icons', 'assets/templates', 'authoring', 'clients/cli', 'foundation'];
const DOC_FILE = /\.doc(\.[a-z]+)?\.mjs$/;

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (DOC_FILE.test(e.name) && !e.name.endsWith('.test.mjs')) out.push(full);
  }
}

function toJson(value, seen = new Set()) {
  if (value === undefined) return {__js: 'undefined'};
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (Object.is(value, -0)) return 0;
    if (Number.isFinite(value)) return value;
    return {__js: 'number', value: String(value)};
  }
  if (typeof value === 'bigint') return {__js: 'bigint', value: String(value)};
  if (typeof value === 'symbol') return {__js: 'symbol', description: value.description ?? null};
  if (typeof value === 'function') return {__js: 'function', name: value.name};
  if (value instanceof RegExp) return {__js: 'regexp', source: value.source, flags: value.flags};
  if (value instanceof Date) return {__js: 'date', iso: Number.isNaN(value.getTime()) ? null : value.toISOString()};
  if (Object.prototype.toString.call(value) === '[object Error]') return {__js: 'error', name: String(value.name), message: String(value.message)};
  if (value instanceof Promise) return {__js: 'promise'};
  if (seen.has(value)) return {__js: 'circular'};
  seen.add(value);
  let out;
  if (value instanceof Map) {
    out = {__js: 'map', entries: [...value].map(([k, v]) => [toJson(k, seen), toJson(v, seen)])};
  } else if (value instanceof Set) {
    out = {__js: 'set', values: [...value].map(v => toJson(v, seen))};
  } else if (Array.isArray(value)) {
    out = [];
    for (let i = 0; i < value.length; i++) out.push(toJson(value[i], seen));
  } else {
    out = {};
    for (const key of Object.keys(value)) out[key] = toJson(value[key], seen);
  }
  seen.delete(value);
  return out;
}

const files = [];
for (const root of ROOTS) {
  const dir = path.join(cliRoot, root);
  if (fs.existsSync(dir)) walk(dir, files);
}
files.sort();
const modules = {};
const hashes = {};
for (const file of files) {
  const rel = path.relative(cliRoot, file).split(path.sep).join('/');
  hashes[rel] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  try {
    const mod = await import(pathToFileURL(file).href);
    const ns = {};
    for (const key of Object.keys(mod).sort()) ns[key] = toJson(mod[key]);
    modules[rel] = {ok: ns};
  } catch (error) {
    modules[rel] = {error: {name: error?.name ?? '', message: String(error?.message ?? error), code: error?.code ?? null}};
  }
}
fs.mkdirSync(outDir, {recursive: true});
fs.writeFileSync(path.join(outDir, 'own-modules.json'), JSON.stringify({hashes, modules}));
console.log(`${files.length} modules -> ${path.relative(process.cwd(), path.join(outDir, 'own-modules.json'))}`);
