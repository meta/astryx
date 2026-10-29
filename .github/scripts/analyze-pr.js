#!/usr/bin/env node
// Copyright (c) Meta Platforms, Inc. and affiliates.


/**
 * @description Analyzes PR changes to detect new/modified components and gather stats
 * @input --base <branch> --head <ref> --output <file> [--base-root <dir> [--base-only]] [--force-full]
 * @output JSON file with component analysis; exits non-zero if the base...head diff fails (e.g. shallow clone without a merge base).
 *   With --base-root (a built checkout of the merge base), the analysis also
 *   records baseComponentStats and baseBundlePackages measured in that tree;
 *   --base-only writes just those, with the head and base commits they belong to.
 *   A changed module outside every component folder (a shared hook, the
 *   animator) owns the components whose bundle reaches it, so browser audits
 *   run for those reverse dependents; one no component reaches, or --force-full
 *   (a change to shared infrastructure), asks for full audits.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const {
  gzipBytes: gzipTextBytes,
  measureComponentImport,
  bundleInputsByEntry,
  packageStylesheetPath,
} = require('./lib/component-size');
const {
  COMPONENT_PACKAGES,
  componentExportsFromBarrel,
  documentedComponentNames,
  flatPackageComponentNames,
  nestedPackageComponentNames,
} = require('../../scripts/component-packages.cjs');
const { isComponentSpecRecordPath } = require('./knowledge-paths.cjs');

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
};

const baseBranch = getArg('base') || 'main';
const headRef = getArg('head') || 'HEAD';
const outputFile = getArg('output') || 'analysis.json';
const baseRoot = getArg('base-root');
const baseOnly = args.includes('--base-only');
const forceFull = args.includes('--force-full');
if (baseOnly && !baseRoot) {
  console.error('::error::--base-only needs --base-root');
  process.exit(1);
}

const STORYBOOK_STORIES = 'apps/storybook/stories';

// Project the canonical component-package registry into the analyzer's existing
// shape. Package participation and layouts have one checked-in owner; this file
// only adds the published package name and derives its package directory.
const PACKAGES = COMPONENT_PACKAGES.map(pkg => ({
  ...pkg,
  packageName: pkg.name,
  name: `@astryxdesign/${pkg.name}`,
  dir: path.dirname(pkg.src),
}));

const pkgSrc = (pkg) => pkg.src;
const pkgDist = (pkg) => `${pkg.dir}/dist`;

// Get canonical direct public component names for a package. Nested family,
// context, and shared directories deliberately stay unresolved so audits widen.
// The canonical components a nested package's folder implements (its docs
// name them, and the barrel exports them from inside it).
const familyIndex = new Map();
function familyMembers(pkg, folder) {
  const sourceDir = path.join(process.cwd(), pkgSrc(pkg));
  if (!familyIndex.has(pkg.name)) {
    familyIndex.set(pkg.name, {
      canonical: new Set(nestedPackageComponentNames(process.cwd(), pkg)),
      exports: componentExportsFromBarrel(path.join(sourceDir, 'index.ts'), sourceDir),
    });
  }
  const { canonical, exports } = familyIndex.get(pkg.name);
  const directory = path.join(sourceDir, folder);
  try {
    return documentedComponentNames(directory).filter(
      (name) => canonical.has(name) && exports.get(name)?.startsWith(`${directory}${path.sep}`),
    );
  } catch {
    return [];
  }
}

// Every canonical component a folder implements: the package barrel exports
// it from inside that folder, documented or not (FieldLabel in Field,
// DrawerHeader in Drawer). RTL matches owners by these names.
const folderIndex = new Map();
function folderComponents(pkg, folder, repoRoot = process.cwd()) {
  const sourceDir = path.join(repoRoot, pkgSrc(pkg));
  const key = `${repoRoot}\0${pkg.name}`;
  if (!folderIndex.has(key)) {
    folderIndex.set(key, {
      canonical:
        pkg.layout === 'flat'
          ? new Set(flatPackageComponentNames(repoRoot, pkg))
          : new Set(nestedPackageComponentNames(repoRoot, pkg)),
      exports:
        pkg.layout === 'flat'
          ? new Map()
          : componentExportsFromBarrel(path.join(sourceDir, 'index.ts'), sourceDir),
    });
  }
  const { canonical, exports } = folderIndex.get(key);
  if (pkg.layout === 'flat') return canonical.has(folder) ? [folder] : [];
  const directory = path.join(sourceDir, folder);
  return [...canonical]
    .filter((name) => {
      const file = exports.get(name);
      return file === directory || file?.startsWith(`${directory}${path.sep}`);
    })
    .sort();
}

function getComponentNames(pkg) {
  if (pkg.layout === 'flat') {
    return flatPackageComponentNames(process.cwd(), pkg);
  }
  const canonical = new Set(nestedPackageComponentNames(process.cwd(), pkg));
  const sourceDir = path.join(process.cwd(), pkgSrc(pkg));
  const exports = componentExportsFromBarrel(
    path.join(sourceDir, 'index.ts'),
    sourceDir,
  );
  try {
    return fs
      .readdirSync(sourceDir, {withFileTypes: true})
      .filter(entry => entry.isDirectory())
      .filter(entry => {
        const directory = path.join(sourceDir, entry.name);
        // A doc also names the components it is built from (anatomy parts
        // such as Label or Spinner). Only a component this folder implements
        // belongs to it, the same rule a11y-pr-scope.mjs applies.
        const names = documentedComponentNames(directory).filter(
          name =>
            canonical.has(name) &&
            exports.get(name)?.startsWith(`${directory}${path.sep}`),
        );
        return names.length === 1 && names[0] === entry.name;
      })
      .map(entry => entry.name)
      .sort();
  } catch {
    return [];
  }
}

// The source path of a component (dir for nested, file for flat).
function componentSrcPath(pkg, componentName) {
  return pkg.layout === 'flat'
    ? path.join(process.cwd(), pkgSrc(pkg), `${componentName}.tsx`)
    : path.join(process.cwd(), pkgSrc(pkg), componentName);
}

// The index file used to read exports (dir/index.ts for nested, the file itself for flat).
function componentIndexRef(pkg, componentName) {
  return pkg.layout === 'flat'
    ? `${pkgSrc(pkg)}/${componentName}.tsx`
    : `${pkgSrc(pkg)}/${componentName}/index.ts`;
}

// Get changed files between base and head.
//
// Prefers a three-dot diff (base...head), which only reports files changed on
// the PR branch and excludes commits already merged to base. But a three-dot
// diff needs a merge base, which a shallow clone (fetch-depth: 50) may not
// have once the PR has been open long enough for base to advance past that
// window — the diff then fails with "no merge base" and the whole job dies.
//
// On that failure we first try to deepen the shallow clone and retry the
// three-dot diff — the real fix for "base advanced past the fetch window" is
// to fetch more history, not to degrade. Only if that still cannot find a
// merge base do we fall back to a two-dot diff (base..head), which needs no
// merge base and never hard-fails the CI.
//
// The two-dot fallback is inherently lossy: it compares two trees, so a file
// whose change also exists on base (a cherry-picked/duplicated fix, or the
// same codegen output landing from another PR) vanishes from the diff
// entirely. That means two-dot can UNDER-report a PR's own changes, not just
// over-report base churn. Because downstream gates (pr-a11y) derive their
// component list from this file list, under-reporting silently skips the
// audit for a component the PR did change. The caller records the diff mode
// in the analysis output so consumers know when the file list is approximate.
// Returns { files, diffMode: 'three-dot' | 'two-dot' }.
function getChangedFiles() {
  const threeDot = `${baseBranch}...${headRef}`;
  const tryThreeDot = () => {
    const output = execSync(`git diff --name-only ${threeDot}`, { encoding: 'utf8' });
    return output.trim().split('\n').filter(Boolean);
  };
  try {
    return { files: tryThreeDot(), diffMode: 'three-dot' };
  } catch (e) {
    console.warn(
      `::warning::three-dot diff ${threeDot} failed - attempting to deepen the clone and retry`
    );
    console.warn(diffErrorDetail(e));
  }

  // The three-dot diff failed, almost certainly because the shallow clone is
  // too shallow to contain the merge base. Deepen before giving up on the
  // accurate path; a deepened clone makes three-dot correct again. The base
  // arg arrives as "origin/main" (see ci.yml) but the fetch refspec needs the
  // bare branch name and must update the origin/<base> ref explicitly —
  // `--deepen` alone only updates FETCH_HEAD, which the three-dot ref
  // (origin/main...HEAD) needs to actually exist.
  try {
    const baseName = baseBranch.replace(/^origin\//, '');
    execSync(
      `git fetch --deepen=200 origin ${baseName}:refs/remotes/origin/${baseName}`,
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return { files: tryThreeDot(), diffMode: 'three-dot' };
  } catch (e) {
    console.warn(
      `::warning::deepen failed (${diffErrorDetail(e)}) - falling back to two-dot diff`
    );
  }

  // Last resort: a two-dot diff needs no merge base. Its file list is
  // approximate (may over-report base churn and, worse, under-report the PR's
  // own changes when they also exist on base), so the caller marks the output
  // with diffMode: 'two-dot' for any consumer to caveat.
  const twoDot = `${baseBranch}..${headRef}`;
  try {
    const output = execSync(`git diff --name-only ${twoDot}`, { encoding: 'utf8' });
    return { files: output.trim().split('\n').filter(Boolean), diffMode: 'two-dot' };
  } catch (e) {
    // A failed diff (e.g. base ref missing on a too-shallow clone) is not the
    // same as "no changes" — fail loudly instead of publishing an empty
    // analysis report that looks legitimate.
    console.error(`::error::git diff ${twoDot} failed: ${e.message}`);
    console.error('The clone is likely too shallow to contain the base ref (see fetch-depth in ci.yml).');
    process.exit(1);
  }
}

// Human-readable reason for a failed diff/deepen, preferring the fatal stderr
// line (e.g. "fatal: origin/main...HEAD: no merge base") over execSync's
// boilerplate "Command failed: ..." first line.
function diffErrorDetail(e) {
  return (e.stderr && e.stderr.toString().trim()) || e.message.split('\n')[0];
}

// Check if a component exists in the base branch.
function componentExistsInBase(pkg, componentName) {
  try {
    execSync(`git show ${baseBranch}:${componentIndexRef(pkg, componentName)}`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return true;
  } catch {
    // A nested component folder without an index barrel still exists in base.
    if (pkg.layout === 'flat') return false;
    try {
      const listing = execSync(
        `git ls-tree --name-only ${baseBranch} -- ${pkgSrc(pkg)}/${componentName}/`,
        { encoding: 'utf8', stdio: 'pipe' },
      );
      return listing.trim().length > 0;
    } catch {
      return false;
    }
  }
}

function parseExportsFromSource(content) {
  const exportMatches = content.match(/export\s+{\s*([^}]+)\s*}/g) || [];
  const exports = [];
  for (const match of exportMatches) {
    const inner = match.replace(/export\s*{\s*/, '').replace(/\s*}/, '');
    exports.push(...inner.split(',').map((e) => e.trim().split(' ')[0]));
  }
  if (content.includes('export default')) {
    exports.push('default');
  }
  return exports.filter(Boolean);
}

// Get exports from the base branch for a component (to detect new exports in modified dirs)
function getBaseExports(pkg, componentName) {
  try {
    const content = execSync(
      `git show ${baseBranch}:${componentIndexRef(pkg, componentName)}`,
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return parseExportsFromSource(content);
  } catch {
    return [];
  }
}

// Get file size in human readable format
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  } catch {
    return null;
  }
}

function getFileSizeBytes(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

// Gzipped byte count of a file, or null when the file is absent — never a
// bogus 0 for a path that does not exist.
function getGzipBytes(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    const output = execSync(`gzip -c "${filePath}" | wc -c`, { encoding: 'utf8' });
    const bytes = parseInt(output.trim(), 10);
    return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
  } catch {
    return null;
  }
}

function formatBytes(bytes) {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

// Whether a package's `.js` files are ES modules (`"type": "module"`).
function packageIsModule(pkg) {
  try {
    const manifest = path.join(process.cwd(), pkg.dir, 'package.json');
    return JSON.parse(fs.readFileSync(manifest, 'utf8')).type === 'module';
  } catch {
    return false;
  }
}

// Resolve a package/component's dist entry files by module format. Babel
// writes ES modules with a `.js` extension in `"type": "module"` packages, so
// there `index.js` is the ESM entry; a package that is not a module ships ESM
// as `index.mjs` and CommonJS as `index.js`. `index.mjs`/`index.cjs` are ESM
// and CommonJS wherever they exist. A missing file is never measured.
function resolveEntries(distDir, pkg) {
  const existing = (name) => {
    const file = path.join(distDir, name);
    return fs.existsSync(file) ? file : null;
  };
  const isModule = packageIsModule(pkg);
  return {
    esmPath: existing('index.mjs') || (isModule ? existing('index.js') : null),
    cjsPath: existing('index.cjs') || (isModule ? null : existing('index.js')),
  };
}

// Get exports from a component (from the working tree / head).
function getExports(pkg, componentName) {
  const indexPath =
    pkg.layout === 'flat'
      ? componentSrcPath(pkg, componentName)
      : path.join(componentSrcPath(pkg, componentName), 'index.ts');
  try {
    const content = fs.readFileSync(indexPath, 'utf8');
    return parseExportsFromSource(content);
  } catch {
    return [];
  }
}

// Resolve the main component source file(s) to inspect for props/complexity.
function componentSourceFiles(pkg, componentName) {
  if (pkg.layout === 'flat') {
    const file = componentSrcPath(pkg, componentName);
    return fs.existsSync(file) ? [{ dir: path.dirname(file), name: path.basename(file) }] : [];
  }
  const dir = componentSrcPath(pkg, componentName);
  try {
    return fs.readdirSync(dir).map((name) => ({ dir, name }));
  } catch {
    return [];
  }
}

// Count props for main component
function getPropsCount(pkg, componentName) {
  const files = componentSourceFiles(pkg, componentName);
  if (files.length === 0) return null;
  // Prefer the file named after the component (bare or XDS-prefixed).
  const names = files.map((f) => f.name);
  const mainName =
    [`XDS${componentName}.tsx`, `${componentName}.tsx`].find((f) => names.includes(f)) ||
    names.find(
      (f) =>
        (/^XDS[A-Z]\w+\.tsx$/.test(f) || /^[A-Z]\w+\.tsx$/.test(f)) &&
        !f.includes('.test.') &&
        !f.includes('Context.'),
    );
  if (!mainName) return null;
  try {
    const content = fs.readFileSync(path.join(files[0].dir, mainName), 'utf8');
    const propsMatch = content.match(/(?:type|interface)\s+\w*Props\w*\s*=?\s*{([^}]+)}/);
    if (propsMatch) {
      return propsMatch[1]
        .split('\n')
        .filter(
          (line) =>
            line.trim() &&
            !line.trim().startsWith('//') &&
            !line.trim().startsWith('*') &&
            line.includes(':'),
        ).length;
    }
    return null;
  } catch {
    return null;
  }
}

// Check if component has tests
function hasTests(pkg, componentName) {
  return componentSourceFiles(pkg, componentName).some(
    (f) => f.name.endsWith('.test.ts') || f.name.endsWith('.test.tsx'),
  );
}

// Check if component has stories (checks both directory name and exported component names)
function hasStories(pkg, componentName) {
  const storiesDir = path.join(process.cwd(), STORYBOOK_STORIES);
  try {
    const files = fs.readdirSync(storiesDir);
    if (
      files.some(
        (f) =>
          f.toLowerCase().includes(componentName.toLowerCase()) && f.endsWith('.stories.tsx'),
      )
    )
      return true;
    const exports = getExports(pkg, componentName);
    const xdsComponents = exports.filter((e) => e.startsWith('XDS'));
    return xdsComponents.some((comp) => {
      const name = comp.replace(/^XDS/, '');
      return files.some(
        (f) => f.toLowerCase().includes(name.toLowerCase()) && f.endsWith('.stories.tsx'),
      );
    });
  } catch {
    return false;
  }
}

// Get the Storybook story title for a component (e.g., "Core/Button").
function getStoryTitle(pkg, componentName) {
  const storiesDir = path.join(process.cwd(), STORYBOOK_STORIES);
  try {
    const files = fs.readdirSync(storiesDir);
    const exports = getExports(pkg, componentName);
    const searchNames = [
      componentName,
      ...exports.filter((e) => e.startsWith('XDS')).map((e) => e.replace(/^XDS/, '')),
    ];
    const storyFiles = files.filter(
      (f) =>
        f.endsWith('.stories.tsx') &&
        searchNames.some((name) => f.toLowerCase().includes(name.toLowerCase())),
    );
    if (storyFiles.length === 0) return null;
    const exactMatch = storyFiles.find((f) =>
      searchNames.some((name) => f.toLowerCase() === `${name.toLowerCase()}.stories.tsx`),
    );
    const orderedFiles = exactMatch
      ? [exactMatch, ...storyFiles.filter((f) => f !== exactMatch)]
      : storyFiles;
    const titles = orderedFiles
      .map((storyFile) => {
        const content = fs.readFileSync(path.join(storiesDir, storyFile), 'utf8');
        const titleMatch = content.match(/title:\s*['"]([^'"]+)['"]/);
        return titleMatch ? titleMatch[1] : null;
      })
      .filter(Boolean);
    return titles.length > 0 ? titles[0] : null;
  } catch {
    return null;
  }
}

// Count lines of code in a file (excluding blank lines and comments)
function countLOC(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    let loc = 0;
    let inBlockComment = false;
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('/*')) inBlockComment = true;
      if (trimmed.endsWith('*/')) {
        inBlockComment = false;
        continue;
      }
      if (inBlockComment) continue;
      if (!trimmed) continue;
      if (trimmed.startsWith('//')) continue;
      if (trimmed.startsWith('*')) continue;
      loc++;
    }
    return loc;
  } catch {
    return 0;
  }
}

// Get total LOC for a component
function getComponentLOC(pkg, componentName) {
  const files = componentSourceFiles(pkg, componentName);
  let totalLOC = 0;
  let fileCount = 0;
  for (const f of files) {
    if (!(f.name.endsWith('.ts') || f.name.endsWith('.tsx'))) continue;
    if (f.name.includes('.test.')) continue;
    totalLOC += countLOC(path.join(f.dir, f.name));
    fileCount++;
  }
  return { totalLOC, fileCount };
}

// Calculate cyclomatic complexity (simplified - counts decision points)
function getComplexity(pkg, componentName) {
  const files = componentSourceFiles(pkg, componentName);
  let complexity = 1; // Base complexity
  try {
    for (const f of files) {
      if (!f.name.endsWith('.tsx')) continue;
      if (f.name.includes('.test.')) continue;
      const content = fs.readFileSync(path.join(f.dir, f.name), 'utf8');
      const patterns = [
        /\bif\s*\(/g,
        /\belse\s+if\s*\(/g,
        /\bswitch\s*\(/g,
        /\bcase\s+/g,
        /\?\s*[^:]/g,
        /\|\|/g,
        /&&/g,
        /\.map\s*\(/g,
        /\.filter\s*\(/g,
        /\.reduce\s*\(/g,
        /\.forEach\s*\(/g,
      ];
      for (const pattern of patterns) {
        const matches = content.match(pattern);
        if (matches) complexity += matches.length;
      }
    }
    let rating;
    if (complexity <= 5) rating = 'Low';
    else if (complexity <= 15) rating = 'Medium';
    else if (complexity <= 30) rating = 'High';
    else rating = 'Very High';
    return { score: complexity, rating };
  } catch {
    return { score: 0, rating: 'Unknown' };
  }
}

// A package's prebuilt stylesheet text, read once per tree.
const stylesheetCache = new Map();
function packageStylesheet(pkg) {
  const file = packageStylesheetPath(path.join(process.cwd(), pkg.dir));
  if (!file) return null;
  if (!stylesheetCache.has(file)) stylesheetCache.set(file, fs.readFileSync(file, 'utf8'));
  return stylesheetCache.get(file);
}

// Every canonical public component of a package, with the dist module that
// defines its export.
function packageTargets(pkg) {
  if (pkg.layout === 'flat') {
    return getComponentNames(pkg).map((name) => ({
      key: `${pkg.packageName}/${name}`,
      pkg,
      name,
      distModule: `${name}.js`,
    }));
  }
  const sourceDir = path.join(process.cwd(), pkgSrc(pkg));
  const exports = componentExportsFromBarrel(path.join(sourceDir, 'index.ts'), sourceDir);
  const targets = [];
  for (const name of nestedPackageComponentNames(process.cwd(), pkg)) {
    const file = exports.get(name);
    if (!file) continue;
    targets.push({
      key: `${pkg.packageName}/${name}`,
      pkg,
      name,
      distModule: path.relative(sourceDir, file).replace(/\.tsx?$/, '.js'),
    });
  }
  return targets;
}

// Every canonical public component a change can affect: its own folder or
// file changed, or its bundle, import() targets included, reaches a changed
// module of its package, such as a shared hook or style module. Family folders
// that hold several components yield each of them. `reach`, when given,
// collects each changed source path some component reaches (its folder, or a
// module in its bundle) in `paths`, and in `measured` each package whose
// bundles could be read: there, a module no bundle holds reaches nothing.
function sizeTargets(changedFiles, reached = null) {
  const withoutExtension = (file) => file.replace(/\.(tsx?|jsx?|mjs)$/, '');
  // Each package's changed modules, and its built dist to find them in: a
  // bundle in any package can reach them (Lab, Charts, Rich Text and Vega
  // import Core).
  const changed = [];
  for (const pkg of PACKAGES) {
    const prefix = pkgSrc(pkg) + '/';
    const changedModules = new Set(
      changedFiles
        .filter((file) => file.startsWith(prefix))
        .map((file) => withoutExtension(file.slice(prefix.length))),
    );
    if (changedModules.size === 0) continue;
    const dist = path.join(process.cwd(), pkgDist(pkg));
    changed.push({
      pkg,
      prefix,
      changedModules,
      changedTops: new Set([...changedModules].map((file) => file.split('/')[0])),
      // esbuild reports inputs by real path.
      distReal: fs.existsSync(dist) ? fs.realpathSync(dist) : dist,
    });
  }
  if (changed.length === 0) return [];
  const targets = [];
  for (const pkg of PACKAGES) {
    const own = changed.find((entry) => entry.pkg === pkg) ?? null;
    const dist = path.join(process.cwd(), pkgDist(pkg));
    const all = packageTargets(pkg);
    const reach = bundleInputsByEntry(all.map((target) => path.join(dist, target.distModule)));
    for (const target of all) {
      const top = withoutExtension(target.distModule.split('/')[0]);
      const inputs = reach?.get(path.join(dist, target.distModule)) ?? [];
      const reachedPaths = inputs.flatMap((input) =>
        changed.flatMap((entry) => {
          const relative = path.relative(entry.distReal, input);
          const module = withoutExtension(relative);
          return !relative.startsWith('..') && entry.changedModules.has(module)
            ? [entry.prefix + module]
            : [];
        }),
      );
      const isOwnFolder = own != null && own.changedTops.has(top);
      if (isOwnFolder || reachedPaths.length > 0) targets.push(target);
      if (reached != null) {
        for (const reachedPath of reachedPaths) reached.paths.add(reachedPath);
        if (isOwnFolder) reached.paths.add(own.prefix + top);
      }
    }
    if (reached != null && own != null && reach != null && reach.size > 0) {
      reached.measured.add(own.prefix);
    }
  }
  return targets;
}

// Targets from either tree, once each by key.
function unionTargets(first, second) {
  const byKey = new Map(first.map((target) => [target.key, target]));
  for (const target of second) if (!byKey.has(target.key)) byKey.set(target.key, target);
  return [...byKey.values()];
}

// What each target's import costs in the current tree: the gzip JavaScript it
// loads eagerly, and the gzip CSS of the package stylesheet rules referenced by
// its own package's modules it can load, import() targets included (spec:AST-080 FR8,
// architecture:component-style-authoring INV6).
function measureSizes(targets) {
  const sizes = {};
  for (const target of targets) {
    const dist = path.join(process.cwd(), pkgDist(target.pkg));
    let size = measureComponentImport(
      path.join(dist, target.distModule),
      packageStylesheet(target.pkg),
      dist,
      target.name,
    );
    // An alias (`export {A as B}`) is not exported by its defining module;
    // measure it through the package entry instead.
    if (size.importGzipBytes === null) {
      const {esmPath} = resolveEntries(dist, target.pkg);
      size = measureComponentImport(
        esmPath,
        packageStylesheet(target.pkg),
        dist,
        target.name,
      );
    }
    sizes[target.key] = {package: target.pkg.name, ...size};
  }
  return sizes;
}

// Get component stats
function getComponentStats(pkg, componentName) {
  // Per-component dist sizing only applies to nested packages that emit a
  // per-component subdir. Flat packages (charts) have no per-component dist, so
  // those sizes are legitimately null (package total still reported below).
  const distDir =
    pkg.layout === 'flat'
      ? null
      : path.join(process.cwd(), pkgDist(pkg), componentName);
  const entries = distDir ? resolveEntries(distDir, pkg) : { esmPath: null, cjsPath: null };
  const loc = getComponentLOC(pkg, componentName);
  const complexity = getComplexity(pkg, componentName);
  return {
    package: pkg.name,
    esmSize: getFileSize(entries.esmPath),
    esmBytes: getFileSizeBytes(entries.esmPath),
    cjsSize: getFileSize(entries.cjsPath),
    cjsBytes: getFileSizeBytes(entries.cjsPath),
    exports: getExports(pkg, componentName),
    propsCount: getPropsCount(pkg, componentName),
    hasTests: hasTests(pkg, componentName),
    hasStories: hasStories(pkg, componentName),
    storyTitle: getStoryTitle(pkg, componentName),
    linesOfCode: loc.totalLOC,
    fileCount: loc.fileCount,
    complexity: complexity.score,
    complexityRating: complexity.rating,
  };
}

// Get total bundle stats for a package's published entry.
function getPackageBundleStats(pkg) {
  const distDir = path.join(process.cwd(), pkgDist(pkg));
  const { esmPath, cjsPath } = resolveEntries(distDir, pkg);
  // Gzip the primary published entry: ESM when it exists, else CommonJS.
  const gzipBytes = getGzipBytes(esmPath || cjsPath);
  return {
    package: pkg.name,
    esmSize: getFileSize(esmPath),
    esmBytes: getFileSizeBytes(esmPath),
    cjsSize: getFileSize(cjsPath),
    cjsBytes: getFileSizeBytes(cjsPath),
    gzipSize: formatBytes(gzipBytes),
    gzipBytes,
    stylesheetGzipBytes: (() => {
      const css = packageStylesheet(pkg);
      return css === null ? null : gzipTextBytes(css);
    })(),
  };
}

// Main analysis
function analyze() {
  console.log(`Analyzing changes from ${baseBranch} to ${headRef}...`);
  const { files: changedFiles, diffMode } = getChangedFiles();
  console.log(`Found ${changedFiles.length} changed files (diff mode: ${diffMode})`);
  if (diffMode === 'two-dot') {
    console.warn(
      '::warning::using approximate two-dot diff - the file list may include base-only churn and may miss the PR\'s own changes when they also exist on base'
    );
  }

  const newComponents = [];
  const modifiedComponents = [];
  const newComponentOwners = [];
  const modifiedComponentOwners = [];
  const unresolvedComponentSources = [];
  // Each changed file under an unresolved source, to decide its reach.
  const unresolvedFiles = [];
  const componentStats = {};
  const changedPackages = new Set();

  // Stable theme packages are a visual surface of their own. They do not own
  // component source dirs, so the component loop below cannot discover them;
  // without this, changing a published theme silently skips pr-visual.
  const changedStableThemes = [...new Set(
    changedFiles.flatMap((file) => {
      const match = file.match(/^packages\/themes\/([^/]+)\/src\//);
      if (!match) return [];
      const manifest = path.join(process.cwd(), 'packages', 'themes', match[1], 'package.json');
      if (!fs.existsSync(manifest)) return [];
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      return pkg.private === true || pkg.astryx?.canaryOnly === true ? [] : [match[1]];
    }),
  )].sort();

  for (const pkg of PACKAGES) {
    const allComponents = getComponentNames(pkg);
    const prefix = pkgSrc(pkg) + '/';

    for (const file of changedFiles) {
      if (!file.startsWith(prefix)) continue;
      changedPackages.add(pkg.name);
      // A component's knowledge record (`<Name>.spec.md`) is never rendered,
      // so changing it alone owns no browser audit of that component.
      if (isComponentSpecRecordPath(file)) continue;

      const relativePath = file.replace(prefix, '');
      const componentName =
        pkg.layout === 'flat'
          ? relativePath.replace(/\.tsx?$/, '').split('/')[0]
          : relativePath.split('/')[0];

      if (!allComponents.includes(componentName)) {
        const source = `${pkg.packageName}/${componentName}`;
        unresolvedFiles.push({ source, file });
        if (!unresolvedComponentSources.includes(source)) {
          unresolvedComponentSources.push(source);
        }
        continue;
      }
      const existsInBase = componentExistsInBase(pkg, componentName);
      const owner = `${pkg.packageName}/${componentName}`;
      const owners = existsInBase ? modifiedComponentOwners : newComponentOwners;
      if (!owners.includes(owner)) owners.push(owner);

      // Keep the legacy bare-name shape for existing report consumers. The
      // package-qualified owner arrays below are the routing identity used by
      // browser audits and cannot collide across packages.
      const key = componentName;
      if (componentStats[key]) continue;

      const stats = getComponentStats(pkg, componentName);
      componentStats[key] = stats;
      if (existsInBase) {
        modifiedComponents.push(key);
      } else {
        newComponents.push(key);
      }
    }
  }

  console.log(`Changed packages: ${[...changedPackages].join(', ') || 'none'}`);
  console.log(`New components: ${newComponents.join(', ') || 'none'}`);
  console.log(`Modified components: ${modifiedComponents.join(', ') || 'none'}`);
  console.log(
    `Component owners: ${[...newComponentOwners, ...modifiedComponentOwners].join(', ') || 'none'}`,
  );

  // Detect new exports in modified components (a dir may be "modified" yet add
  // brand-new exports alongside existing ones).
  const newExports = [];
  for (const key of modifiedComponents) {
    const pkg = PACKAGES.find((p) => p.name === componentStats[key].package);
    const headExports = componentStats[key]?.exports || [];
    const baseExports = getBaseExports(pkg, key);
    newExports.push(...headExports.filter((e) => e.startsWith('XDS') && !baseExports.includes(e)));
  }
  for (const key of newComponents) {
    newExports.push(...(componentStats[key]?.exports || []).filter((e) => e.startsWith('XDS')));
  }
  if (newExports.length > 0) console.log(`New exports: ${newExports.join(', ')}`);

  // Bundle sizes: report every package the PR actually touched. If none of the
  // component packages changed (e.g. a docs- or tooling-only PR that still runs
  // analysis), report no bundle rows rather than a stale, misattributed core row.
  const bundlePackages = PACKAGES.filter((p) => changedPackages.has(p.name)).map((p) =>
    getPackageBundleStats(p),
  );

  // Base measurements come from a built checkout of the merge base. Component
  // and package lists stay the head's; only the stats are read in the base tree.
  let baseComponentStats = null;
  let baseBundlePackages = null;
  // Components a change can affect, by reach in the head build and, when the
  // merge base is built, in the base build too: CI's size-base job builds only
  // the base, and a module change can add or remove reach.
  const reachedSources = { paths: new Set(), measured: new Set() };
  const headTargets = sizeTargets(changedFiles, reachedSources);
  let targets = headTargets;
  let baseComponentSizes = null;
  if (baseRoot) {
    const headDir = process.cwd();
    process.chdir(path.resolve(headDir, baseRoot));
    try {
      baseComponentStats = {};
      for (const key of modifiedComponents) {
        const pkg = PACKAGES.find((p) => p.name === componentStats[key].package);
        baseComponentStats[key] = getComponentStats(pkg, key);
      }
      baseBundlePackages = PACKAGES.filter((p) => changedPackages.has(p.name)).map((p) =>
        getPackageBundleStats(p),
      );
      // Each tree is measured through its own defining modules, so a renamed
      // module is not mistaken for a missing one.
      const baseTargets = sizeTargets(changedFiles);
      baseComponentSizes = measureSizes(unionTargets(baseTargets, headTargets));
      targets = unionTargets(headTargets, baseTargets);
    } finally {
      process.chdir(headDir);
    }
  }
  const componentSizes = baseOnly ? null : measureSizes(targets);

  // Every changed module, inside a component folder or not (a shared hook,
  // the animator, a family folder), adds the components whose head bundle
  // reaches it as reverse dependents: visual and RTL audits run them, PR
  // accessibility stays with changed components (spec:AST-030 FR12, FR13).
  // In a package whose bundles were read, a module no bundle holds adds none.
  // One outside every component folder in a package whose bundles could not
  // be read stays unresolved and asks for full audits, as does --force-full.
  const isDecided = (file) =>
    [...reachedSources.measured].some((prefix) => file.startsWith(prefix)) ||
    [...reachedSources.paths].some((reachedPath) => {
      const module = file.replace(/\.(tsx?|jsx?|mjs)$/, '');
      return module === reachedPath || module.startsWith(reachedPath + '/');
    });
  const unreachedSources = unresolvedComponentSources.filter((source) =>
    unresolvedFiles.some((entry) => entry.source === source && !isDecided(entry.file)),
  );
  // One affected set of component folders, which visual and RTL both audit
  // (spec:AST-030 FR13): each reverse dependent's folder, and each changed
  // multi-component folder that documents components. Visual reads the
  // folders (its stories are keyed by folder); RTL reads every component each
  // folder implements (its routes are keyed by component: FieldLabel, not
  // Field).
  const folderOf = (target) => target.distModule.split('/')[0].replace(/\.(tsx?|jsx?|mjs)$/, '');
  const dependentComponentFolders = [];
  const dependentComponentOwners = [];
  if (!baseOnly) {
    const touched = new Set([...newComponentOwners, ...modifiedComponentOwners]);
    const addFolder = (pkg, folder) => {
      const qualified = `${pkg.packageName}/${folder}`;
      if (dependentComponentFolders.includes(qualified)) return;
      const members = folderComponents(pkg, folder);
      const owners = (members.length > 0 ? members : [folder]).map(
        (name) => `${pkg.packageName}/${name}`,
      );
      if (owners.every((owner) => touched.has(owner))) return;
      dependentComponentFolders.push(qualified);
      for (const owner of owners) {
        if (!touched.has(owner) && !dependentComponentOwners.includes(owner)) {
          dependentComponentOwners.push(owner);
        }
      }
    };
    for (const target of headTargets) addFolder(target.pkg, folderOf(target));
    for (const source of unresolvedComponentSources) {
      const [packageName, folder] = source.split('/');
      const pkg = PACKAGES.find((candidate) => candidate.packageName === packageName);
      if (pkg != null && pkg.layout !== 'flat' && familyMembers(pkg, folder).length > 0) {
        addFolder(pkg, folder);
      }
    }
    console.log(`Reverse dependents: ${dependentComponentOwners.join(', ') || 'none'}`);
  }

  if (baseOnly) {
    const baseResult = {
      headSha: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
      baseSha: execSync('git rev-parse HEAD', { cwd: baseRoot, encoding: 'utf8' }).trim(),
      baseComponentStats,
      baseBundlePackages,
      baseComponentSizes,
      analyzedAt: new Date().toISOString(),
    };
    fs.writeFileSync(outputFile, JSON.stringify(baseResult, null, 2));
    console.log(`Base stats written to ${outputFile}`);
    return baseResult;
  }

  const result = {
    newComponents,
    modifiedComponents,
    newComponentOwners,
    modifiedComponentOwners,
    dependentComponentOwners,
    dependentComponentFolders,
    // Every changed multi-component folder stays listed: PR accessibility
    // expands it to its members (spec:AST-030 FR12, DEC-5). Only the sources
    // no bundle decided ask for full audits.
    unresolvedComponentSources,
    forceFullComponentAudits: forceFull || unreachedSources.length > 0,
    newExports,
    componentStats,
    changedPackages: [...changedPackages],
    changedStableThemes,
    // Records whether the file list is exact (three-dot) or approximate
    // (two-dot fallback). Consumers that gate on the component list (pr-a11y)
    // or render it in the report should caveat when this is 'two-dot'.
    diffMode,
    bundlePackages,
    componentSizes,
    ...(baseRoot ? { baseComponentStats, baseBundlePackages, baseComponentSizes } : {}),
    // Back-compat: keep totalBundle pointed at core when core changed, so any
    // older consumer of this field still resolves.
    totalBundle: bundlePackages.find((b) => b.package === '@astryxdesign/core') || null,
    analyzedAt: new Date().toISOString(),
  };

  fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
  console.log(`Analysis written to ${outputFile}`);
  return result;
}

if (require.main === module) analyze();

module.exports = { folderComponents };
