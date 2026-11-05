#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * Promote staged codemods from transforms/next into the release version folder
 * declared at the cut. `pnpm version-packages` runs this after its custom
 * release-branch versioner writes changelogs at that declaration; package.json
 * already contains the exact version and is never bumped here.
 *
 * The target version folder MAY already exist and already contain codemods —
 * e.g. a codemod PR that merged earlier in the release cycle seeded
 * `transforms/vX.Y.Z/` directly, and later feature PRs staged additional
 * codemods under `transforms/next/`. In that case promotion MERGES the staged
 * codemods into the existing folder rather than failing:
 *   - transform modules are moved in (a same-named transform is a real
 *     conflict and still errors);
 *   - `__tests__/` contents are merged (a same-named test file still errors);
 *   - the two `index.mjs` manifests are merged into one (existing entries
 *     first, then the newly-staged ones, de-duplicated by transform name).
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const README = 'README.md';
const INDEX = 'index.mjs';
const TESTS = '__tests__';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeText(file, text) {
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
}

function listPromotableEntries(nextDir) {
  if (!fs.existsSync(nextDir)) return [];
  return fs.readdirSync(nextDir, {withFileTypes: true}).filter(entry => {
    if (entry.name === README) return false;
    if (entry.name.startsWith('.')) return false;
    return entry.isFile() || entry.isDirectory();
  });
}

/**
 * Is `next/` effectively empty?
 *
 * Every release re-seeds the folder with an `index.mjs` exporting an empty
 * array, so "nothing staged" is not "no entries" — it is "nothing but that
 * placeholder manifest". Without this, a release that ships no codemods
 * promotes the placeholder into `v{VERSION}/` and registers a tier holding no
 * transforms.
 */
function isEmptyStage(nextDir, entries) {
  if (entries.length === 0) return true;
  if (entries.length > 1) return false;
  const [only] = entries;
  if (!only.isFile() || only.name !== INDEX) return false;
  const src = fs.readFileSync(path.join(nextDir, only.name), 'utf8');
  return /export\s+default\s*\[\s*\]\s*;/.test(src);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, {recursive: true});
    for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
      copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
}

/**
 * Merge one directory (e.g. `__tests__`) into an existing target directory.
 * Files are copied in; a same-named file is a genuine conflict and throws.
 * Sub-directories recurse with the same rule.
 */
function mergeDirInto(src, dest, root) {
  fs.mkdirSync(dest, {recursive: true});
  for (const entry of fs.readdirSync(src, {withFileTypes: true})) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      mergeDirInto(from, to, root);
    } else {
      if (fs.existsSync(to)) {
        throw new Error(
          `codemod-next: refusing to overwrite existing ${path.relative(root, to)}`,
        );
      }
      fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    }
  }
}

function removeRecursive(src) {
  fs.rmSync(src, {recursive: true, force: true});
}

/**
 * Merge two codemod `index.mjs` manifests into one.
 *
 * Both files follow the same shape: a block of `import ... from './x.mjs';`
 * statements followed by `export default [ {name, transform, meta}, ... ];`.
 * The merged manifest keeps the existing (target) imports and entries first,
 * then appends the staged (next) ones, skipping any whose transform `name`
 * is already present so a re-run or overlap can't duplicate an entry.
 */
function mergeIndexManifests(existingSrc, stagedSrc) {
  const takeImports = src => {
    const lines = src.split('\n');
    const start = lines.findIndex(l => l.startsWith('import '));
    const exp = lines.findIndex(l => l.startsWith('export default'));
    if (start === -1 || exp === -1) {
      throw new Error(
        'codemod-next: could not parse an index.mjs manifest (missing import block or `export default`).',
      );
    }
    return lines.slice(start, exp).join('\n').replace(/\n+$/, '');
  };

  const takeEntries = src => {
    const open = src.indexOf('export default [');
    const close = src.lastIndexOf('];');
    if (open === -1 || close === -1) {
      throw new Error(
        'codemod-next: could not parse an index.mjs manifest (missing `export default [ ... ];`).',
      );
    }
    const body = src.slice(open + 'export default ['.length, close);
    // Split top-level `{ ... }` objects.
    const entries = [];
    let depth = 0;
    let buf = '';
    for (const ch of body) {
      if (ch === '{') {
        if (depth === 0) buf = '';
        depth++;
        buf += ch;
      } else if (ch === '}') {
        depth--;
        buf += ch;
        if (depth === 0) entries.push(buf.trim());
      } else if (depth > 0) {
        buf += ch;
      }
    }
    return entries;
  };

  const nameOf = entry => {
    const m = entry.match(/name:\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
  };

  const header = existingSrc.slice(0, existingSrc.indexOf('import '));
  const existingImports = takeImports(existingSrc);
  const stagedImports = takeImports(stagedSrc);
  const existingEntries = takeEntries(existingSrc);
  const stagedEntries = takeEntries(stagedSrc);

  const seen = new Set(existingEntries.map(nameOf).filter(Boolean));
  const mergedEntries = [...existingEntries];
  for (const entry of stagedEntries) {
    const name = nameOf(entry);
    if (name && seen.has(name)) continue;
    if (name) seen.add(name);
    mergedEntries.push(entry);
  }

  // Keep every staged import line. If a staged entry was skipped as a
  // duplicate its import may go unused, but lint auto-fixes unused imports and
  // this keeps the merge deterministic and easy to review.
  const importBlock = `${existingImports}\n${stagedImports}`;

  const entriesText = mergedEntries.map(e => `  ${e},`).join('\n');
  return `${header}${importBlock}\n\nexport default [\n${entriesText}\n];\n`;
}

async function formatWithPrettier(root, files) {
  let prettier;
  try {
    prettier = (await import('prettier')).default ?? (await import('prettier'));
  } catch {
    return; // prettier unavailable — leave files as-is (format-changelogs step / lint will catch)
  }
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, 'utf8');
    const config = (await prettier.resolveConfig(file)) ?? {};
    const formatted = await prettier.format(source, {
      ...config,
      filepath: file,
    });
    fs.writeFileSync(file, formatted);
  }
}

function ensureRegistryEntry(registryPath, version) {
  const text = fs.readFileSync(registryPath, 'utf8');
  const entry = `  ['${version}', () => import('./transforms/v${version}/index.mjs')],`;
  if (text.includes(`['${version}',`)) return false;

  const marker = ']);';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error('codemod-next: could not locate registry map terminator.');
  }

  const nextText = `${text.slice(0, markerIndex)}${entry}\n${text.slice(markerIndex)}`;
  writeText(registryPath, nextText);
  return true;
}

export async function promoteCodemodNext({root = DEFAULT_ROOT} = {}) {
  const corePackage = path.join(root, 'packages/core/package.json');
  const transformsDir = path.join(
    root,
    'packages/cli/assets/codemods/transforms',
  );
  const registryPath = path.join(
    root,
    'packages/cli/assets/codemods/registry.mjs',
  );
  const nextDir = path.join(transformsDir, 'next');

  const entries = listPromotableEntries(nextDir);
  if (isEmptyStage(nextDir, entries)) {
    return {
      promoted: [],
      registryUpdated: false,
      message: 'codemod-next: no staged codemods to promote.',
    };
  }

  const version = readJson(corePackage).version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(
      `codemod-next: invalid package version ${JSON.stringify(version)}`,
    );
  }

  if (!entries.some(entry => entry.name === INDEX)) {
    throw new Error(
      'codemod-next: staged codemods must include next/index.mjs so the promoted version folder is registry-loadable.',
    );
  }

  const versionDir = path.join(transformsDir, `v${version}`);
  const versionFolderPreexisted = fs.existsSync(versionDir);
  if (!versionFolderPreexisted) fs.mkdirSync(versionDir, {recursive: true});
  const existingIndexPath = path.join(versionDir, INDEX);
  const mergingIntoExistingIndex =
    versionFolderPreexisted && fs.existsSync(existingIndexPath);

  /** @type {Array<{from: string, to: string}>} */
  const promoted = [];
  const filesToFormat = [];
  for (const entry of entries) {
    const src = path.join(nextDir, entry.name);
    const dest = path.join(versionDir, entry.name);

    // index.mjs: merge manifests when the target folder already has one.
    if (entry.name === INDEX && mergingIntoExistingIndex) {
      const merged = mergeIndexManifests(
        fs.readFileSync(existingIndexPath, 'utf8'),
        fs.readFileSync(src, 'utf8'),
      );
      fs.writeFileSync(existingIndexPath, merged);
      filesToFormat.push(existingIndexPath);
      removeRecursive(src);
      promoted.push({
        from: path.relative(root, src),
        to: path.relative(root, dest),
      });
      continue;
    }

    // __tests__ (or any directory): merge contents into an existing dir.
    if (entry.isDirectory() && fs.existsSync(dest)) {
      mergeDirInto(src, dest, root);
      removeRecursive(src);
      promoted.push({
        from: path.relative(root, src),
        to: path.relative(root, dest),
      });
      continue;
    }

    // Default: move the file/dir in; a same-named target is a real conflict.
    if (fs.existsSync(dest)) {
      throw new Error(
        `codemod-next: refusing to overwrite existing ${path.relative(root, dest)}`,
      );
    }
    copyRecursive(src, dest);
    removeRecursive(src);
    promoted.push({
      from: path.relative(root, src),
      to: path.relative(root, dest),
    });
  }

  // Re-seed next/ with an empty manifest so the folder stays valid + reusable.
  writeText(
    path.join(nextDir, INDEX),
    [
      '// Copyright (c) Meta Platforms, Inc. and affiliates.',
      '',
      '/**',
      ' * @file next transform manifest',
      ' *',
      ' * Staged codemods for the next release. The Version Packages PR promotes',
      ' * this file into the resolved version folder.',
      ' */',
      '',
      'export default [];',
    ].join('\n'),
  );
  filesToFormat.push(path.join(nextDir, INDEX));

  const registryUpdated = ensureRegistryEntry(registryPath, version);

  await formatWithPrettier(root, filesToFormat);

  return {
    version,
    promoted,
    registryUpdated,
    mergedIntoExisting: mergingIntoExistingIndex,
  };
}

async function main() {
  const result = await promoteCodemodNext();
  if (result.message) {
    console.log(result.message);
    return;
  }
  for (const entry of result.promoted) {
    console.log(`codemod-next: promoted ${entry.from} -> ${entry.to}`);
  }
  if (result.registryUpdated) {
    console.log(
      `codemod-next: registered v${result.version} in packages/cli/assets/codemods/registry.mjs`,
    );
  }
  console.log(
    `codemod-next: promoted ${result.promoted.length} entr${result.promoted.length === 1 ? 'y' : 'ies'} into v${result.version}${result.mergedIntoExisting ? ' (merged into existing folder)' : ''}.`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
