// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file package-size.js
 * @input A built workspace (every published package's files on disk) and, to
 *   compare, two measurements
 * @output Each published package's tarball size (gzip, as npm downloads it),
 *   unpacked size, file count and runtime dependencies; a base-against-head
 *   comparison with an advisory budget flag; and that comparison as Markdown
 * @position Shared by package-size.mjs (CI's build-storybook job on a pull
 *   request, and Main's typecheck job, which keeps each main commit's
 *   measurement for pull requests to compare against) and by
 *   generate-pr-comment.js, which renders the comparison in the PR report.
 */

const fs = require('node:fs');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {num} = require('./report-text');

/**
 * A package is flagged when its tarball grows by more than this share of its
 * base size and by at least MIN_BYTES; the floor keeps a small package from
 * being flagged for a few hundred bytes. The flag is advisory: it asks the
 * author, as the component touch-only budget does, and fails nothing.
 */
const PACKED_BUDGET_PERCENT = 5;
const PACKED_BUDGET_MIN_BYTES = 1024;

/** Dependency fields a consumer installs or must provide. */
const RUNTIME_DEPENDENCY_FIELDS = ['dependencies', 'peerDependencies'];

/** The workspace directories that can hold a published package. */
const PACKAGE_GROUPS = ['packages', 'packages/themes'];

/** Packages npm receives: public, in the scope, not canary-only. */
function publishedPackages(root) {
  const found = [];
  for (const group of PACKAGE_GROUPS) {
    const groupDir = path.join(root, group);
    if (!fs.existsSync(groupDir)) continue;
    for (const entry of fs.readdirSync(groupDir, {withFileTypes: true})) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(groupDir, entry.name);
      const manifestPath = path.join(directory, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (
        manifest.name?.startsWith('@astryxdesign/') &&
        manifest.private !== true &&
        manifest.astryx?.canaryOnly !== true
      )
        found.push({directory, manifest});
    }
  }
  return found.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
}

function runtimeDependencies(manifest) {
  const dependencies = {};
  for (const field of RUNTIME_DEPENDENCY_FIELDS) {
    for (const [name, range] of Object.entries(manifest[field] || {}))
      dependencies[`${field}:${name}`] = String(range);
  }
  return dependencies;
}

/**
 * `npm pack --dry-run` lists what the package's `files` field ships and the
 * tarball's size without writing it. Lifecycle scripts are skipped: the
 * packages are already built, and some packages' prepack builds them again.
 */
function npmPackDryRun(directory) {
  return new Promise((resolve, reject) => {
    execFile(
      'npm',
      ['pack', '--dry-run', '--json', '--ignore-scripts', '--silent'],
      {cwd: directory, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024},
      (error, stdout) => {
        if (error) return reject(error);
        try {
          resolve(JSON.parse(stdout)[0]);
        } catch (parseError) {
          reject(parseError);
        }
      },
    );
  });
}

/**
 * Every published package, packed side by side: the largest package's pack
 * is most of the time, so the others add little.
 */
async function measurePackages(root, pack = npmPackDryRun) {
  const published = publishedPackages(root);
  const results = await Promise.all(
    published.map(({directory}) => pack(directory)),
  );
  const packages = {};
  published.forEach(({manifest}, index) => {
    const result = results[index];
    packages[manifest.name] = {
      packedBytes: result.size,
      unpackedBytes: result.unpackedSize,
      files: result.entryCount,
      dependencies: runtimeDependencies(manifest),
    };
  });
  return {schema: 1, packages};
}

function isMeasured(bytes) {
  return typeof bytes === 'number' && Number.isFinite(bytes);
}

function overBudget(baseBytes, headBytes) {
  if (!isMeasured(baseBytes) || !isMeasured(headBytes) || baseBytes <= 0)
    return false;
  const delta = headBytes - baseBytes;
  return (
    delta >= PACKED_BUDGET_MIN_BYTES &&
    (delta / baseBytes) * 100 > PACKED_BUDGET_PERCENT
  );
}

function splitDependencyKey(key) {
  const separator = key.indexOf(':');
  return {field: key.slice(0, separator), name: key.slice(separator + 1)};
}

/**
 * Head against base, package by package. Without a base measurement every
 * row keeps its head figures, nothing is over budget, and the verdict says
 * the base was not measured.
 */
function comparePackageSizes({head, base, headSha = '', baseSha = ''}) {
  const headPackages = head?.packages || {};
  const basePackages = base?.packages || null;
  const names = [
    ...new Set([
      ...Object.keys(headPackages),
      ...Object.keys(basePackages || {}),
    ]),
  ].sort();
  const packages = [];
  const addedDependencies = [];
  const removedDependencies = [];
  for (const name of names) {
    const now = headPackages[name] || null;
    const before = basePackages ? basePackages[name] || null : null;
    packages.push({
      name,
      base: before && {
        packedBytes: before.packedBytes,
        unpackedBytes: before.unpackedBytes,
        files: before.files,
      },
      head: now && {
        packedBytes: now.packedBytes,
        unpackedBytes: now.unpackedBytes,
        files: now.files,
      },
      overBudget: overBudget(before?.packedBytes, now?.packedBytes),
    });
    if (!basePackages || !now) continue;
    const beforeDependencies = before?.dependencies || {};
    const nowDependencies = now.dependencies || {};
    for (const [key, range] of Object.entries(nowDependencies)) {
      if (key in beforeDependencies) continue;
      addedDependencies.push({
        package: name,
        ...splitDependencyKey(key),
        range,
      });
    }
    if (!before) continue;
    for (const [key, range] of Object.entries(beforeDependencies)) {
      if (key in nowDependencies) continue;
      removedDependencies.push({
        package: name,
        ...splitDependencyKey(key),
        range,
      });
    }
  }
  const over = packages.some(entry => entry.overBudget);
  const verdict = !basePackages ? 'no-base' : over ? 'over-budget' : 'pass';
  return {
    schema: 1,
    headSha,
    baseSha,
    budget: {
      packedPercent: PACKED_BUDGET_PERCENT,
      packedMinBytes: PACKED_BUDGET_MIN_BYTES,
    },
    packages,
    addedDependencies,
    removedDependencies,
    verdict,
  };
}

function sizeText(bytes) {
  if (!isMeasured(bytes)) return 'N/A';
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function deltaText(after, before) {
  if (!isMeasured(after) || !isMeasured(before)) return 'N/A';
  const delta = after - before;
  const percent =
    before > 0 && delta !== 0
      ? ` (${delta > 0 ? '+' : ''}${((delta / before) * 100).toFixed(1)}%)`
      : '';
  return `${delta > 0 ? '+' : ''}${sizeText(delta)}${percent}`;
}

function fileCount(value) {
  return isMeasured(value) ? String(num(value)) : 'N/A';
}

function changed(entry) {
  if (!entry.base || !entry.head) return true;
  return (
    entry.base.packedBytes !== entry.head.packedBytes ||
    entry.base.unpackedBytes !== entry.head.unpackedBytes ||
    entry.base.files !== entry.head.files
  );
}

/**
 * The comparison as Markdown. `literal` renders a report string as inline
 * text; the PR comment passes its own escaper, the job summary the identity.
 */
function renderPackageSizeSection(report, literal = text => String(text)) {
  if (!report || !Array.isArray(report.packages)) return '';
  const {packedPercent, packedMinBytes} = report.budget || {};
  let out = '### Published Package Size\n\n';
  if (report.verdict === 'no-base') {
    out +=
      "_Main has no kept measurement of this pull request's merge base (it is older than 14 days, or predates the measurement), so only this head's sizes are shown and no budget applies._\n\n";
  }
  const rows =
    report.verdict === 'no-base'
      ? report.packages
      : report.packages.filter(changed);
  if (rows.length === 0) {
    out += `No published package changed size (${num(report.packages.length)} measured).\n\n`;
  } else {
    out +=
      '| Package | Download before | Download after | Delta | Unpacked before | Unpacked after | Delta | Files |\n';
    out +=
      '|---------|-----------------|----------------|-------|-----------------|----------------|-------|-------|\n';
    for (const entry of rows) {
      const files =
        entry.base && entry.head && entry.base.files !== entry.head.files
          ? `${fileCount(entry.base.files)} → ${fileCount(entry.head.files)}`
          : fileCount(entry.head?.files ?? entry.base?.files);
      out += `| ${literal(entry.name)} | ${sizeText(entry.base?.packedBytes)} | ${sizeText(entry.head?.packedBytes)} | ${deltaText(entry.head?.packedBytes, entry.base?.packedBytes)}${entry.overBudget ? ' ⚠️' : ''} | ${sizeText(entry.base?.unpackedBytes)} | ${sizeText(entry.head?.unpackedBytes)} | ${deltaText(entry.head?.unpackedBytes, entry.base?.unpackedBytes)} | ${files} |\n`;
    }
    const unchanged = report.packages.length - rows.length;
    out +=
      unchanged === 0
        ? '\n'
        : `\n${unchanged} other published ${unchanged === 1 ? 'package is' : 'packages are'} unchanged.\n\n`;
  }
  if (report.addedDependencies?.length > 0) {
    out += '**New runtime dependencies:**\n\n';
    for (const dependency of report.addedDependencies)
      out += `- ${literal(dependency.package)}: ${literal(dependency.name)} ${literal(dependency.range)} (${literal(dependency.field)})\n`;
    out += '\n';
  }
  if (report.removedDependencies?.length > 0) {
    out += '**Removed runtime dependencies:**\n\n';
    for (const dependency of report.removedDependencies)
      out += `- ${literal(dependency.package)}: ${literal(dependency.name)} (${literal(dependency.field)})\n`;
    out += '\n';
  }
  if (report.verdict === 'over-budget') {
    out += `**⚠️ Over the package budget:** a package's download grew more than ${num(packedPercent)}% (and at least ${sizeText(num(packedMinBytes))}). If the growth is not intended, shrink it; if it is, say why in the pull request description.\n\n`;
  }
  out +=
    'Download is the gzip tarball npm fetches; unpacked is what lands in `node_modules`.\n\n';
  return out;
}

module.exports = {
  PACKED_BUDGET_PERCENT,
  PACKED_BUDGET_MIN_BYTES,
  publishedPackages,
  runtimeDependencies,
  measurePackages,
  overBudget,
  comparePackageSizes,
  renderPackageSizeSection,
};
