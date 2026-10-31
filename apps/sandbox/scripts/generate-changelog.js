// Copyright (c) Meta Platforms, Inc. and affiliates.

/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
/**
 * Generates apps/sandbox/src/generated/changelogRegistry.ts from CHANGELOG.md
 * files across all packages plus @deprecated JSDoc from source and peer deps
 * from package.json.
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = path.resolve(__dirname, '..', 'src', 'generated');
const OUT_FILE = path.join(OUT_DIR, 'changelogRegistry.ts');

const GITHUB_REPO = 'meta/astryx';

const CHANGELOG_SOURCES = [
  {pkg: '@astryxdesign/core', file: 'packages/core/CHANGELOG.md'},
  {pkg: '@astryxdesign/cli', file: 'packages/cli/CHANGELOG.md'},
  {pkg: '@astryxdesign/theme-neutral', file: 'packages/themes/neutral/CHANGELOG.md'},
  {pkg: '@astryxdesign/theme-matcha', file: 'packages/themes/matcha/CHANGELOG.md'},
];

const DEPRECATED_SCAN_DIRS = [
  {pkg: '@astryxdesign/core', dir: 'packages/core/src'},
];

const PEER_DEP_SOURCES = [
  {pkg: '@astryxdesign/core', file: 'packages/core/package.json'},
];

// ── Section heading → field mapping ────────────────────────────────────
const SECTION_MAP = {
  'breaking changes': 'breakingChanges',
  'new features': 'features',
  'new components': 'features',
  features: 'features',
  changes: 'features',
  'minor changes': 'features',
  fixes: 'fixes',
  'patch changes': 'fixes',
  refactors: 'features',
  codemods: 'codemods',
};

// ── Markdown parsing ───────────────────────────────────────────────────

function parseChangelog(markdown, pkg) {
  const versions = [];
  let currentVersion = null;
  let currentSection = null;
  let inCodeBlock = false;
  let codeBlockContent = '';
  let inNote = false;

  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        if (currentVersion && currentSection === 'upgrade') {
          const applyMatch = codeBlockContent.match(
            /npx astryx upgrade --apply --to [\d.]+/,
          );
          const dryMatch = codeBlockContent.match(
            /npx astryx upgrade --to [\d.]+/,
          );
          if (applyMatch) currentVersion.upgradeCommand = applyMatch[0];
          if (dryMatch) currentVersion.dryRunCommand = dryMatch[0];
        }
        inCodeBlock = false;
        codeBlockContent = '';
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent += line + '\n';
      continue;
    }

    // Version heading: # 0.0.12 (or legacy ## 0.0.12)
    const versionMatch = line.match(/^#{1,2} (\d+\.\d+\.\d+)/);
    if (versionMatch) {
      currentVersion = {
        version: versionMatch[1],
        pkg,
        breakingChanges: [],
        features: [],
        fixes: [],
        codemods: [],
        upgradeCommand: undefined,
        dryRunCommand: undefined,
        note: undefined,
      };
      versions.push(currentVersion);
      currentSection = null;
      inNote = false;
      continue;
    }

    if (!currentVersion) continue;

    // Section heading: #### Breaking Changes (or legacy ### Breaking Changes)
    const sectionMatch = line.match(/^#{3,4} (.+)/);
    if (sectionMatch) {
      const heading = sectionMatch[1].trim().toLowerCase();
      currentSection = SECTION_MAP[heading] || heading;
      if (!SECTION_MAP[heading] && heading !== 'upgrade') {
        console.warn(
          `Warning: unrecognized section "${heading}" in ${pkg} v${currentVersion.version} — items will be dropped`,
        );
      }
      inNote = false;
      continue;
    }

    // Blockquote notes: > **Note:** ...
    if (line.startsWith('>')) {
      const noteText = line.replace(/^>\s*/, '').trim();
      if (noteText) {
        currentVersion.note = currentVersion.note
          ? currentVersion.note + ' ' + noteText
          : noteText;
      }
      inNote = true;
      continue;
    }
    if (inNote && line.trim() === '') {
      inNote = false;
      continue;
    }

    // Upgrade section: extract dry-run and apply commands from prose
    if (currentSection === 'upgrade') {
      const dryMatch = line.match(/`(npx astryx upgrade --to [\d.]+)`/);
      if (dryMatch) currentVersion.dryRunCommand = dryMatch[1];
      const applyMatch = line.match(
        /`(npx astryx upgrade --apply --to [\d.]+)`/,
      );
      if (applyMatch) currentVersion.upgradeCommand = applyMatch[1];
      continue;
    }

    // List items: - **Title** — description (#1234)
    if (
      line.match(/^\s*-\s/) &&
      currentSection &&
      currentSection !== 'upgrade'
    ) {
      const text = line.replace(/^\s*-\s*/, '').trim();

      // Skip "Updated dependencies" lines from theme changelogs
      if (text.startsWith('Updated dependencies')) continue;
      if (text.match(/^\s*-?\s*@astryxdesign\/\w/)) continue;

      const item = parseItem(text, pkg, currentSection === 'codemods');
      const field = currentVersion[currentSection];
      if (Array.isArray(field)) {
        field.push(item);
      }
    }
  }

  return versions;
}

function parseItem(text, pkg, isCodemodSection) {
  const item = {text: '', package: pkg};

  // Extract PR number(s): (#1234) or (#1234, #1256)
  const prMatch = text.match(/\(#(\d+)(?:,\s*#\d+)*\)\s*$/);
  if (prMatch) {
    item.pr = parseInt(prMatch[1], 10);
    text = text.replace(/\s*\(#\d+(?:,\s*#\d+)*\)\s*$/, '').trim();
  }

  // Extract codemod name only from items in the Codemods section
  // e.g. "`migrate-token-names` — Design token renames..."
  if (isCodemodSection) {
    const codemodMatch = text.match(/^`([\w-]+)`/);
    if (codemodMatch) {
      item.codemod = codemodMatch[1];
    }
  }

  item.text = text;
  return item;
}

// ── Merge versions across packages ─────────────────────────────────────

function mergeVersions(allParsed) {
  const map = new Map();

  for (const versions of allParsed) {
    for (const v of versions) {
      if (!map.has(v.version)) {
        map.set(v.version, {
          version: v.version,
          packages: [],
          breakingChanges: [],
          features: [],
          fixes: [],
          codemods: [],
          upgradeCommand: undefined,
          dryRunCommand: undefined,
          note: undefined,
        });
      }

      const merged = map.get(v.version);
      if (!merged.packages.includes(v.pkg)) {
        merged.packages.push(v.pkg);
      }
      merged.breakingChanges.push(...v.breakingChanges);
      merged.features.push(...v.features);
      merged.fixes.push(...v.fixes);
      merged.codemods.push(...v.codemods);

      if (v.upgradeCommand && !merged.upgradeCommand) {
        merged.upgradeCommand = v.upgradeCommand;
      }
      if (v.dryRunCommand && !merged.dryRunCommand) {
        merged.dryRunCommand = v.dryRunCommand;
      }
      if (v.note && !merged.note) {
        merged.note = v.note;
      }
    }
  }

  // Sort by semver descending
  return Array.from(map.values()).sort((a, b) => {
    const pa = a.version.split('.').map(Number);
    const pb = b.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      if (pa[i] !== pb[i]) return pb[i] - pa[i];
    }
    return 0;
  });
}

// ── Deprecation scanning ───────────────────────────────────────────────

function scanDeprecations() {
  const deprecations = [];

  for (const {pkg, dir} of DEPRECATED_SCAN_DIRS) {
    const absDir = path.join(REPO_ROOT, dir);
    walkDir(absDir, filePath => {
      if (!/\.(ts|tsx)$/.test(filePath)) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/@deprecated\s+(.+)/);
        if (!match) continue;

        const message = match[1].replace(/\s*\*\/\s*$/, '').trim();
        const relFile = path.relative(path.join(REPO_ROOT, dir), filePath);

        // Look ahead for the symbol name on the next non-empty, non-comment line
        let symbol = '';
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const symLine = lines[j].trim();
          if (!symLine || symLine.startsWith('*') || symLine.startsWith('//'))
            continue;
          const symMatch = symLine.match(
            /(?:export\s+)?(?:const|let|var|function|type|interface|class)\s+([\w$]+)/,
          );
          if (symMatch) {
            symbol = symMatch[1];
          } else {
            // Try property/field: name?: type or @deprecated on a JSDoc for a prop
            const propMatch = symLine.match(/^\*?\s*([\w$]+)\s*[?:]/);
            if (propMatch) symbol = propMatch[1];
          }
          break;
        }

        deprecations.push({
          symbol: symbol || '(unknown)',
          message,
          file: relFile.replace(/\\/g, '/'),
          package: pkg,
        });
      }
    });
  }

  return deprecations;
}

function walkDir(dir, callback) {
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, callback);
    } else {
      callback(full);
    }
  }
}

// ── Peer dependency extraction ─────────────────────────────────────────

function extractPeerDeps() {
  const results = [];
  for (const {pkg, file} of PEER_DEP_SOURCES) {
    const absFile = path.join(REPO_ROOT, file);
    if (!fs.existsSync(absFile)) continue;
    const json = JSON.parse(fs.readFileSync(absFile, 'utf-8'));
    const peers = json.peerDependencies || {};
    const entry = {package: pkg};
    if (peers.react) entry.react = peers.react;
    if (peers['react-dom']) entry.reactDom = peers['react-dom'];
    if (peers['@stylexjs/stylex']) entry.stylex = peers['@stylexjs/stylex'];
    results.push(entry);
  }
  return results;
}

// ── Output ─────────────────────────────────────────────────────────────

function writeOutput(versions, deprecations, peerDeps) {
  fs.mkdirSync(OUT_DIR, {recursive: true});

  const content = `// Copyright (c) Meta Platforms, Inc. and affiliates.

// Auto-generated by scripts/generate-changelog.js — do not edit

export const GITHUB_REPO = ${JSON.stringify(GITHUB_REPO)};

export type ChangelogItem = {
  text: string;
  pr?: number;
  codemod?: string;
  package: string;
};

export type ChangelogVersion = {
  version: string;
  packages: string[];
  breakingChanges: ChangelogItem[];
  features: ChangelogItem[];
  fixes: ChangelogItem[];
  codemods: ChangelogItem[];
  upgradeCommand?: string;
  dryRunCommand?: string;
  note?: string;
};

export type DeprecationEntry = {
  symbol: string;
  message: string;
  file: string;
  package: string;
};

export type PeerDepInfo = {
  package: string;
  react?: string;
  reactDom?: string;
  stylex?: string;
};

export const changelogVersions: ChangelogVersion[] = ${JSON.stringify(versions, null, 2)};

export const deprecations: DeprecationEntry[] = ${JSON.stringify(deprecations, null, 2)};

export const peerDeps: PeerDepInfo[] = ${JSON.stringify(peerDeps, null, 2)};
`;

  fs.writeFileSync(OUT_FILE, content, 'utf-8');
  console.log(
    `Wrote ${versions.length} version(s), ${deprecations.length} deprecation(s), ${peerDeps.length} peer dep set(s) to ${path.relative(REPO_ROOT, OUT_FILE)}`,
  );
}

// ── Main ───────────────────────────────────────────────────────────────

function run() {
  const allParsed = [];

  for (const {pkg, file} of CHANGELOG_SOURCES) {
    const absFile = path.join(REPO_ROOT, file);
    if (!fs.existsSync(absFile)) {
      console.warn(`Warning: ${file} not found, skipping`);
      continue;
    }
    const markdown = fs.readFileSync(absFile, 'utf-8');
    allParsed.push(parseChangelog(markdown, pkg));
  }

  const versions = mergeVersions(allParsed);
  const deprecationEntries = scanDeprecations();
  const peerDepEntries = extractPeerDeps();

  writeOutput(versions, deprecationEntries, peerDepEntries);
}

run();
