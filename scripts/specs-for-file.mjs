// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Resolve the knowledge records that govern a repository file.
 * @input Repository-relative file paths and the working tree's knowledge records.
 * @output Every record linked to each path, with the declared link that put it
 *   there, plus the trigger-routed global claims reviewers load today.
 * @position Read-only lookup over the links records already declare. A name
 *   matches only an id a record declares exactly; coverage is never inferred
 *   from extensions or directory names, and a path no record reaches is
 *   reported as such.
 */

/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {
  GLOBAL_REVIEW_TRIGGERS,
  collectConcernMatches,
  collectGlobalReviewMatches,
  discoverKnowledgeRecords,
  discoverPlatformComponentRecords,
  consumerDocPublicNames,
  matchesPathPattern,
  parseKnowledgeDocument,
  parsePathApplicabilityBlock,
} from './check-knowledge.mjs';
import {readDiff} from './lib/review-diff.mjs';

const require = createRequire(import.meta.url);
const {componentPackage} = require('./component-packages.cjs');
const {
  classifyComponentKnowledgePath,
  classifyPlatformComponentSpecPath,
  locateComponentKnowledgePath,
  locatePlatformComponentSource,
} = require('../.github/scripts/knowledge-paths.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');

/**
 * Reference fields that point from a record to the broader authority it
 * relies on. Following them never narrows scope: a record that governs a path
 * passes that path to the records it inherits from.
 */
const INHERITED_REFERENCE_FIELDS = [
  'architecture',
  'families',
  'design_specs',
  'system_specs',
  'references',
  'parent_component',
  // A platform record adds to its core component's contract (INV2).
  'platform_of',
];

/**
 * Links from a governing record to the system specs that decided it. Those
 * specs are listed separately: they carry the decisions behind a governing
 * record, but nothing in them declares that the whole spec governs the path.
 */
const DECIDING_REFERENCE_FIELDS = ['deciding_specs'];
const DECIDED_REFERENCE_FIELDS = ['affects_architecture', 'affects_families'];

/** Fields naming the components a family or design record governs. */
const MEMBER_FIELDS = ['members', 'components'];

function toPosix(filePath) {
  return String(filePath).split(path.sep).join('/').replace(/^\.\//, '');
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) return [value];
  return [];
}

// A reference may name one claim of its target: `spec:AST-NNN/FR3`,
// `architecture:x/INV6`, `spec:AST-NNN/DEC-2`.
const CLAIM_SUFFIX = /\/([A-Z][A-Z0-9]*-?[0-9]+[a-z]?)$/;

function referenceTarget(reference) {
  return reference.replace(CLAIM_SUFFIX, '');
}

function referenceDecision(reference) {
  return CLAIM_SUFFIX.exec(reference)?.[1] ?? null;
}

// Path fields mix repository paths with prose and commands; only the prose
// and commands contain whitespace. Route groups such as `(fullscreen)` are
// ordinary path segments.
function looksLikePath(entry) {
  return (
    typeof entry === 'string' &&
    /^\S+$/.test(entry) &&
    (entry.includes('/') || /\.[A-Za-z0-9]+$/.test(entry))
  );
}

/**
 * True when a declared path entry covers `filePath`. A trailing slash or a
 * directory entry covers its subtree; any other entry is exact.
 */
const pathEntryCache = new Map();
const directoryCache = new Map();

function pathEntryCovers(root, entry, filePath) {
  let parsed = pathEntryCache.get(entry);
  if (!parsed) {
    const normalized = toPosix(entry).replace(/\/+$/, '');
    parsed = {
      normalized,
      prefix: `${normalized}/`,
      valid: normalized !== '' && looksLikePath(entry),
      subtree: entry.endsWith('/'),
    };
    pathEntryCache.set(entry, parsed);
  }
  if (!parsed.valid) return false;
  if (filePath === parsed.normalized) return true;
  if (!filePath.startsWith(parsed.prefix)) return false;
  if (parsed.subtree) return true;
  const absolute = path.join(root, parsed.normalized);
  let isDirectory = directoryCache.get(absolute);
  if (isDirectory === undefined) {
    isDirectory =
      fs.existsSync(absolute) && fs.statSync(absolute).isDirectory();
    directoryCache.set(absolute, isDirectory);
  }
  return isDirectory;
}

/** Load every knowledge record in the working tree once. */
export function loadKnowledgeIndex(root = DEFAULT_ROOT) {
  const records = [];
  for (const absolutePath of [
    ...discoverKnowledgeRecords(root),
    ...discoverPlatformComponentRecords(root),
  ]) {
    const filePath = toPosix(path.relative(root, absolutePath));
    const content = fs.readFileSync(absolutePath, 'utf8');
    const {frontmatter} = parseKnowledgeDocument(content, filePath);
    const id = frontmatter.get('id');
    if (typeof id !== 'string') continue;
    records.push({
      id,
      path: filePath,
      content,
      kind: frontmatter.get('kind'),
      authority: frontmatter.get('authority'),
      frontmatter,
      classified: classifyComponentKnowledgePath(filePath),
      located: locateComponentKnowledgePath(root, filePath),
      platform: classifyPlatformComponentSpecPath(filePath),
      pathPatterns: asList(
        parsePathApplicabilityBlock(content, filePath).config?.paths,
      ).filter(pattern => typeof pattern === 'string'),
    });
  }
  const byId = new Map(records.map(record => [record.id, record]));
  return {root, records, byId};
}

const componentNameCache = new Map();

function docNames(docPath) {
  let names = componentNameCache.get(docPath);
  if (!names) {
    names = fs.existsSync(docPath) ? consumerDocPublicNames(docPath) : [];
    componentNameCache.set(docPath, names);
  }
  return names;
}

function directoryHasDoc(directory) {
  const key = `dir:${directory}`;
  let has = componentNameCache.get(key);
  if (has === undefined) {
    has =
      fs.existsSync(directory) &&
      fs.statSync(directory).isDirectory() &&
      fs.readdirSync(directory).some(name => name.endsWith('.doc.mjs'));
    componentNameCache.set(key, has);
  }
  return has;
}

/**
 * The component a path belongs to under the shared component-package path
 * contract, and the public names that path speaks for: its file stem, plus its
 * own same-stem consumer doc when it has one, otherwise the root's
 * `<Root>.doc.mjs`. A root with no consumer docs (a plain helper directory) is
 * also named by itself; a flat package's top-level module by its stem.
 */
function componentLocation(root, filePath) {
  const match = /^packages\/([^/]+)\/src\/(.+)$/.exec(filePath);
  if (!match) return null;
  const packageConfig = componentPackage(match[1]);
  if (!packageConfig) return null;
  const segments = match[2].split('/');
  const stem = segments.at(-1).split('.')[0];
  let componentRoot;
  if (packageConfig.layout === 'flat') {
    componentRoot = segments.length > 1 ? segments[0] : stem;
  } else {
    if (segments.length < 2) return null;
    componentRoot = segments[0];
  }
  let names;
  if (packageConfig.layout === 'flat' && segments.length === 1) {
    names = [stem];
  } else {
    const rootDirectory = path.join(root, packageConfig.src, componentRoot);
    const own = docNames(
      path.join(root, path.dirname(filePath), `${stem}.doc.mjs`),
    );
    const primary = docNames(
      path.join(rootDirectory, `${componentRoot}.doc.mjs`),
    );
    if (own.length > 0) names = own;
    else if (primary.length > 0) names = primary;
    else if (!directoryHasDoc(rootDirectory)) names = [componentRoot];
    else names = [];
    // A member a family or system spec names may have no consumer doc of its
    // own; its file stem is still its name.
    names = [...names, stem];
  }
  return {
    packageName: match[1],
    layout: packageConfig.layout,
    componentRoot,
    names: new Set(names),
  };
}

function fileStem(filePath) {
  return path.posix.basename(filePath).split('.')[0];
}

/**
 * Records whose own canonical location places `filePath` inside their scope:
 * the record itself; a theme record over its package; the component record
 * named after its root over the whole root; any other component or module
 * record over its same-stem files anywhere under its component root; a module
 * record also beside a same-stem `verified_by` file, or over a directory it is
 * the only module record in.
 */
function placementMatches(index, filePath, location) {
  const matches = [];
  const stem = fileStem(filePath);
  const fileDirectory = path.posix.dirname(filePath);
  for (const record of index.records) {
    if (record.path === filePath) {
      matches.push({record, via: 'self', detail: 'the file is this record'});
      continue;
    }
    const theme = /^packages\/themes\/([^/]+)\/\1\.spec\.md$/.exec(record.path);
    if (theme) {
      if (filePath.startsWith(`packages/themes/${theme[1]}/`)) {
        matches.push({
          record,
          via: 'placement',
          detail: `theme record for packages/themes/${theme[1]}/`,
        });
      }
      continue;
    }
    if (record.platform) {
      // A platform record governs its language's code for the same component
      // root: the whole root when it is named after it, otherwise its
      // same-stem files.
      const {componentRoot, language, publicName} = record.platform;
      const source = locatePlatformComponentSource(filePath);
      if (
        source?.language === language &&
        source.componentRoot === componentRoot &&
        (publicName === componentRoot || source.stem === publicName)
      ) {
        matches.push({
          record,
          via: 'placement',
          detail: `${language} record for ${publicName} in ${componentRoot}`,
        });
      }
      continue;
    }
    const {classified, located} = record;
    if (!classified) continue;
    const recordStem = classified.publicName;

    if (classified.kind === 'module' && stem === recordStem) {
      const besideEvidence = asList(record.frontmatter.get('verified_by')).some(
        entry =>
          looksLikePath(entry) &&
          fileStem(entry) === recordStem &&
          path.posix.dirname(entry) === fileDirectory,
      );
      if (besideEvidence) {
        matches.push({
          record,
          via: 'placement',
          detail: `module record beside its verified_by evidence for ${recordStem}`,
        });
        continue;
      }
    }

    // Every other placement compares the record's code: a record sits under
    // docs/specs/components/ and mirrors the source directory it governs.
    if (!located) continue;
    const recordDirectory = located.codeDirectory;

    if (
      !location ||
      located.packageName !== location.packageName ||
      located.componentRoot !== location.componentRoot
    ) {
      continue;
    }

    if (located.kind === 'component') {
      if (located.layout === 'flat' || recordStem === location.componentRoot) {
        matches.push({
          record,
          via: 'placement',
          detail: `component record for ${location.componentRoot}`,
        });
      } else if (stem === recordStem) {
        matches.push({
          record,
          via: 'placement',
          detail: `component record for ${recordStem} in ${location.componentRoot}`,
        });
      }
      continue;
    }

    if (stem === recordStem) {
      matches.push({
        record,
        via: 'placement',
        detail: `module record for ${recordStem} in ${location.componentRoot}`,
      });
      continue;
    }
    const siblingsInDirectory = index.records.some(
      other =>
        other !== record &&
        other.located?.codeDirectory === recordDirectory &&
        other.located?.kind === 'module',
    );
    if (
      !siblingsInDirectory &&
      (fileDirectory === recordDirectory ||
        fileDirectory.startsWith(`${recordDirectory}/`))
    ) {
      matches.push({
        record,
        via: 'placement',
        detail: `only module record in ${recordDirectory}/`,
      });
    }
  }
  return matches;
}

/** Records that declare a path entry or pattern covering `filePath`. */
function declaredPathMatches(index, filePath) {
  const matches = [];
  for (const record of index.records) {
    const pattern = record.pathPatterns.find(candidate =>
      matchesPathPattern(candidate, filePath),
    );
    if (pattern) {
      matches.push({record, via: 'path-applicability', detail: pattern});
    }
    for (const field of ['applies_to', 'verified_by']) {
      for (const entry of asList(record.frontmatter.get(field))) {
        if (pathEntryCovers(index.root, entry, filePath)) {
          matches.push({record, via: field, detail: entry});
          break;
        }
      }
    }
  }
  return matches;
}

const MENTION_SIZE_LIMIT = 1024 * 1024;

/**
 * System specs the file itself cites by number in prose or a code comment,
 * optionally scoped to one decision ("AST-" + three digits, then "/DEC-" and a
 * number). A number inside a path under docs/specs is not a citation: record
 * paths appear in fixtures and examples far more often than as links.
 */
function mentionedMatches(index, filePath) {
  const absolute = path.join(index.root, filePath);
  let bytes;
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile() || stat.size > MENTION_SIZE_LIMIT) return [];
    bytes = fs.readFileSync(absolute);
  } catch {
    return [];
  }
  if (bytes.indexOf('AST-') === -1 || bytes.indexOf(0) !== -1) return [];
  const content = bytes.toString('utf8');
  const cited = new Map();
  for (const match of content.matchAll(
    /(?<![/\\\w-])AST-([0-9]{3})(?:[/ ]([A-Z][A-Z0-9]*-?[0-9]+[a-z]?))?\b/g,
  )) {
    const id = `spec:AST-${match[1]}`;
    const claims = cited.get(id) ?? new Set();
    claims.add(match[2] ?? null);
    cited.set(id, claims);
  }
  const matches = [];
  for (const record of index.records) {
    if (record.path === filePath || !cited.has(record.id)) continue;
    for (const decision of cited.get(record.id)) {
      matches.push({
        record,
        via: 'mentioned',
        detail:
          record.id.replace(/^spec:/, '') + (decision ? `/${decision}` : ''),
        decision,
      });
    }
  }
  return matches;
}

const topicCache = new Map();

/**
 * True when an `affects_consumer_docs` id names a CLI doc topic
 * (`packages/cli/assets/docs/[tree/]<id>.doc*.mjs`) rather than a component.
 * A topic id stays on the topic-file route: `color` is the colour guide, not
 * every file whose stem is `color`.
 */
function isConsumerDocTopic(root, docId) {
  let topics = topicCache.get(root);
  if (!topics) {
    topics = new Set();
    for (const directory of [
      'packages/cli/assets/docs',
      'packages/cli/assets/docs/tree',
    ]) {
      const absolute = path.join(root, directory);
      if (!fs.existsSync(absolute)) continue;
      for (const name of fs.readdirSync(absolute)) {
        const match = /^([^/]+?)\.doc(?:\.[a-z]+)*\.mjs$/.exec(name);
        if (match) topics.add(match[1]);
      }
    }
    topicCache.set(root, topics);
  }
  return topics.has(docId.split('/').at(-1));
}

/** Consumer-doc topic files a system spec's `affects_consumer_docs` id names. */
function consumerDocTopicCovers(docId, filePath) {
  const topic = docId.split('/').at(-1);
  const match =
    /^packages\/cli\/assets\/docs\/(?:tree\/)?([^/]+?)\.doc(?:\.[a-z]+)*\.mjs$/.exec(
      filePath,
    );
  return match != null && match[1] === topic;
}

/** Records that name the file's component or consumer-doc topic. */
function namedMatches(index, filePath, location) {
  const matches = [];
  for (const record of index.records) {
    for (const field of MEMBER_FIELDS) {
      for (const member of asList(record.frontmatter.get(field))) {
        const name = member.replace(/^component:/, '');
        if (location?.names.has(name)) {
          matches.push({record, via: field, detail: member});
        }
      }
    }
    for (const docId of asList(
      record.frontmatter.get('affects_consumer_docs'),
    )) {
      if (
        location?.names.has(docId) &&
        !isConsumerDocTopic(index.root, docId)
      ) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      } else if (consumerDocTopicCovers(docId, filePath)) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      } else if (
        docId.includes('/') &&
        pathEntryCovers(index.root, docId, filePath)
      ) {
        matches.push({record, via: 'affects_consumer_docs', detail: docId});
      }
    }
  }
  return matches;
}

function addRoute(reached, record, route) {
  const existing = reached.get(record.id);
  if (existing) {
    if (
      !existing.routes.some(
        known => known.via === route.via && known.detail === route.detail,
      )
    ) {
      existing.routes.push(route);
    }
    return false;
  }
  reached.set(record.id, {record, routes: [route]});
  return true;
}

function addDecision(decisions, record, decision, route) {
  const key = `${record.id}/${decision}`;
  const existing = decisions.get(key);
  if (existing) {
    if (
      !existing.routes.some(
        known => known.via === route.via && known.detail === route.detail,
      )
    ) {
      existing.routes.push(route);
    }
    return;
  }
  decisions.set(key, {record, decision, routes: [route]});
}

/**
 * Close the visible directly matched set over inherited references, then
 * collect the system specs that decided a governing record. A reference scoped
 * to one claim or decision (`spec:AST-NNN/FR3`) lists that claim, never the whole
 * record. Only visible records are followed, so a draft never steers the
 * result unless drafts were asked for.
 */
function closeOverReferences(index, direct, visible) {
  const governing = new Map();
  const decisions = new Map();
  const queue = [];
  for (const match of direct) {
    const route = {via: match.via, detail: match.detail};
    if (match.decision) {
      addDecision(decisions, match.record, match.decision, route);
    } else if (addRoute(governing, match.record, route)) {
      queue.push(match.record);
    }
  }
  while (queue.length > 0) {
    const record = queue.shift();
    for (const field of INHERITED_REFERENCE_FIELDS) {
      for (const reference of asList(record.frontmatter.get(field))) {
        const target = index.byId.get(referenceTarget(reference));
        if (!target || !visible(target)) continue;
        const route = {via: `inherited:${field}`, detail: record.id};
        const decision = referenceDecision(reference);
        if (decision) {
          addDecision(decisions, target, decision, route);
        } else if (addRoute(governing, target, route)) {
          queue.push(target);
        }
      }
    }
  }

  const deciding = new Map();
  for (const {record} of governing.values()) {
    for (const field of DECIDING_REFERENCE_FIELDS) {
      for (const reference of asList(record.frontmatter.get(field))) {
        const target = index.byId.get(referenceTarget(reference));
        if (!target || !visible(target) || governing.has(target.id)) continue;
        const route = {via: field, detail: record.id};
        const decision = referenceDecision(reference);
        if (decision) addDecision(decisions, target, decision, route);
        else addRoute(deciding, target, route);
      }
    }
  }
  for (const decider of index.records) {
    if (!visible(decider) || governing.has(decider.id)) continue;
    for (const field of DECIDED_REFERENCE_FIELDS) {
      for (const reference of asList(decider.frontmatter.get(field))) {
        const target = referenceTarget(reference);
        if (governing.has(target)) {
          addRoute(deciding, decider, {via: field, detail: target});
        }
      }
    }
  }
  return {
    governing: [...governing.values()],
    deciding: [...deciding.values()],
    decisions: [...decisions.values()],
  };
}

/**
 * Resolve the records governing one repository-relative path.
 *
 * `records` lists every record linked to the path, with each route that
 * reached it. `decidingSpecs` lists the system specs that decided one of those
 * records without being linked to the path themselves. `decisions` lists the
 * single claims or decisions (`spec:AST-NNN/FR3`) a linked record or the file cites.
 * Records come from the working tree: on a pull-request branch that includes
 * the branch's proposed records, so the result is not review authority.
 * `globalClaims` lists the trigger-routed global baseline claims, exactly as
 * `scripts/review-global-baselines.mjs` selects them, for `triggers` (default:
 * the review triggers of the matched component and module records, or every
 * supported trigger when none matched). `concernClaims` lists the claims whose
 * owning record's `concerns` match one of `options.addedLines` (the file's
 * added lines from a diff), each with the lines that matched.
 */
export function resolveSpecsForFile(index, file, options = {}) {
  const includeDraft = options.includeDraft ?? false;
  const filePath = toPosix(
    path.isAbsolute(file) ? path.relative(index.root, file) : file,
  );
  if (filePath.startsWith('../')) {
    throw new Error(`${file} is outside the repository.`);
  }
  const location = componentLocation(index.root, filePath);
  const visible = record =>
    record.authority === 'current' ||
    (includeDraft && record.authority === 'draft');
  const direct = [
    ...placementMatches(index, filePath, location),
    ...declaredPathMatches(index, filePath),
    ...namedMatches(index, filePath, location),
    ...mentionedMatches(index, filePath),
  ].filter(match => visible(match.record));
  const project = entries =>
    entries
      .map(({record, routes}) => ({
        id: record.id,
        path: record.path,
        kind: record.kind,
        authority: record.authority,
        routes,
      }))
      .sort((left, right) => left.path.localeCompare(right.path));
  const closed = closeOverReferences(index, direct, visible);
  const records = project(closed.governing);
  const decidingSpecs = project(closed.deciding);
  const decisions = closed.decisions
    .map(({record, decision, routes}) => ({
      id: `${record.id}/${decision}`,
      recordId: record.id,
      decision,
      path: record.path,
      authority: record.authority,
      routes,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  let triggers = options.triggers;
  let triggerSource = 'requested';
  if (!triggers) {
    const local = new Set();
    for (const {record} of direct) {
      if (record.kind !== 'component' && record.kind !== 'module') continue;
      for (const trigger of asList(record.frontmatter.get('review_triggers'))) {
        if (GLOBAL_REVIEW_TRIGGERS.has(trigger)) local.add(trigger);
      }
    }
    if (local.size > 0) {
      triggers = [...local];
      triggerSource = 'component and module review_triggers';
    } else {
      triggers = [...GLOBAL_REVIEW_TRIGGERS];
      triggerSource = 'every supported trigger (no local record declares any)';
    }
  }
  const globalClaims =
    triggers.length === 0
      ? []
      : collectGlobalReviewMatches(
          index.records.map(record => ({
            path: record.path,
            content: record.content,
          })),
          triggers,
          null,
        ).map(({recordId, path: recordPath, trigger, claimId, claim}) => ({
          recordId,
          path: recordPath,
          trigger,
          claimId,
          claim,
        }));

  const addedLines = (options.addedLines ?? []).filter(
    line => line.file === filePath,
  );
  const concernClaims = collectConcernMatches(
    index.records.map(record => ({
      path: record.path,
      content: record.content,
    })),
    addedLines,
    null,
  ).map(
    ({
      recordId,
      path: recordPath,
      concern,
      claimId,
      claim,
      utilities,
      evidence,
    }) => ({
      recordId,
      path: recordPath,
      concern,
      claimId,
      claim,
      utilities,
      evidence,
    }),
  );

  return {
    file: filePath,
    exists: fs.existsSync(path.join(index.root, filePath)),
    component: location
      ? {
          package: location.packageName,
          root: location.componentRoot,
          names: [...location.names].sort(),
        }
      : null,
    source: 'working-tree',
    records,
    decidingSpecs,
    decisions,
    triggers: [...new Set(triggers)].sort(),
    triggerSource,
    concernClaims,
    globalClaims,
  };
}

/**
 * Current records that no tracked non-record file reaches
 * through a placement, path, name, citation, inherited, or deciding link. Every
 * such record is invisible to a path-first lookup.
 */
export function findUnreachedRecords(index, files) {
  const reached = new Set();
  const recordPaths = new Set(index.records.map(record => record.path));
  for (const file of files) {
    if (recordPaths.has(toPosix(file))) continue;
    const result = resolveSpecsForFile(index, file, {triggers: []});
    for (const record of [...result.records, ...result.decidingSpecs]) {
      if (record.routes.some(route => route.via !== 'self')) {
        reached.add(record.id);
      }
    }
    for (const decision of result.decisions) reached.add(decision.recordId);
  }
  return index.records
    .filter(record => record.authority === 'current' && !reached.has(record.id))
    .map(record => ({id: record.id, path: record.path, kind: record.kind}))
    .sort((left, right) => left.path.localeCompare(right.path));
}

/** Tracked files that no current record or cited claim governs. */
export function findUnroutedFiles(index, files) {
  return files.filter(file => {
    const result = resolveSpecsForFile(index, file, {triggers: []});
    return result.records.length === 0 && result.decisions.length === 0;
  });
}

function trackedFiles(root) {
  return execFileSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

/**
 * The claims a diff's concerns route, grouped per record and concern, with
 * the line that matched. Both views print them first.
 */
function formatConcernLines(result) {
  if (result.concernClaims.length === 0) return [];
  const lines = [];
  lines.push('  Follow first (the change touches a shared concern):');
  const byConcern = new Map();
  for (const item of result.concernClaims) {
    const key = `${item.recordId}\0${item.concern}`;
    const entry = byConcern.get(key) ?? {...item, claimIds: []};
    entry.claimIds.push(item.claimId);
    byConcern.set(key, entry);
  }
  for (const entry of byConcern.values()) {
    const where = entry.evidence[0];
    const shared =
      entry.utilities.length > 0
        ? `; shared: ${entry.utilities.join(', ')}`
        : '';
    lines.push(
      `    ${entry.recordId}  ${entry.claimIds.join(', ')}  ← ${entry.concern} (line ${where.line}: ${where.matched}${shared})`,
    );
  }
  return lines;
}

export function formatResult(result, {records: listRecords = false} = {}) {
  if (!listRecords) return formatShortResult(result);
  const lines = [
    `${result.file}${result.exists ? '' : ' (not in the working tree)'}`,
    ...formatConcernLines(result),
  ];
  if (result.records.length === 0) {
    lines.push(
      result.decisions.length > 0
        ? '  No whole record links to this path; it cites the claims below.'
        : '  No record links to this path.',
    );
  }
  for (const record of result.records) {
    const routes = record.routes
      .map(route => `${route.via} ${route.detail}`)
      .join('; ');
    const status =
      record.authority === 'current' ? '' : ` [${record.authority}]`;
    lines.push(`  ${record.path}  ${record.id}${status}`);
    lines.push(`      via ${routes}`);
  }
  if (result.decisions.length > 0) {
    lines.push(
      '  Single claims or decisions cited by the file or a record above:',
    );
    for (const decision of result.decisions) {
      const routes = decision.routes
        .map(route => `${route.via} ${route.detail}`)
        .join('; ');
      lines.push(`    ${decision.path}  ${decision.id}`);
      lines.push(`        via ${routes}`);
    }
  }
  if (result.decidingSpecs.length > 0) {
    lines.push('  Specs that decided a record above:');
    for (const record of result.decidingSpecs) {
      const routes = record.routes
        .map(route => `${route.via} ${route.detail}`)
        .join('; ');
      lines.push(`    ${record.path}  ${record.id}`);
      lines.push(`        via ${routes}`);
    }
  }
  const byRecord = new Map();
  for (const claim of result.globalClaims) {
    const list = byRecord.get(claim.path) ?? [];
    list.push(`${claim.claimId} (${claim.trigger})`);
    byRecord.set(claim.path, list);
  }
  lines.push(
    `  Global claims for triggers ${result.triggers.join(', ') || '(none)'} — ${result.triggerSource}:`,
  );
  if (byRecord.size === 0) lines.push('    none');
  for (const [recordPath, claims] of byRecord) {
    lines.push(`    ${recordPath}  ${[...new Set(claims)].join(', ')}`);
  }
  return lines.join('\n');
}

/**
 * The default view: the claims to follow, first those the diff's concerns
 * route (with the line that matched), then the trigger-routed global claims
 * one line per record, then the linked records, cited claims and deciding
 * specs by id. `--records` adds how each one links.
 */
function formatShortResult(result) {
  const lines = [
    `${result.file}${result.exists ? '' : ' (not in the working tree)'}`,
  ];
  lines.push(...formatConcernLines(result));
  const byRecord = new Map();
  for (const claim of result.globalClaims) {
    const list = byRecord.get(claim.recordId) ?? [];
    list.push(claim.claimId);
    byRecord.set(claim.recordId, list);
  }
  lines.push(
    `  Global claims for ${result.triggers.join(', ') || '(no triggers)'} (${result.triggerSource}):`,
  );
  if (byRecord.size === 0) lines.push('    none');
  for (const [recordId, claims] of byRecord) {
    lines.push(`    ${recordId}  ${[...new Set(claims)].join(', ')}`);
  }
  if (result.records.length === 0 && result.decisions.length === 0) {
    lines.push('  No record links to this path.');
  }
  if (result.records.length > 0) {
    lines.push(
      `  Records: ${result.records.map(record => record.id).join(', ')}`,
    );
  }
  if (result.decisions.length > 0) {
    lines.push(
      `  Cited claims: ${result.decisions.map(decision => decision.id).join(', ')}`,
    );
  }
  if (result.decidingSpecs.length > 0) {
    lines.push(
      `  Deciding specs: ${result.decidingSpecs.map(record => record.id).join(', ')}`,
    );
  }
  lines.push('  --records shows how each one links.');
  return lines.join('\n');
}

const WORKING_TREE_NOTE =
  "Records are read from the working tree. On a pull-request branch they include that branch's proposed records, so this is a lookup, not review authority.\n";

const USAGE = `Usage: pnpm specs:for [<file...>] [--diff <base>[..|...<head>]] [--records] [--json] [--include-draft] [--triggers a,b]
       pnpm specs:for --unreached [--json]
       pnpm specs:for --unrouted [--json]

Lists every knowledge record that governs each file, the specs that decided
those records, and the trigger-routed global claims. --diff reads the change against <base> (its merge base with HEAD, to
the working tree), between <base>..<head>, or from their merge base with
<base>...<head>, lists its changed files when none
are named, and puts first the claims whose owning record's concerns its added
lines match. The linked records, cited claims and deciding specs are listed by
id; --records shows how each one links.
--unreached lists current records no other tracked file reaches.
--unrouted lists tracked files no current record governs.`;

/**
 * The diff `--diff` names: `<base>..<head>` between two commits, or `<base>`
 * from its merge base with HEAD to the working tree (uncommitted edits
 * included), the change an author is about to make.
 */
function diffText(root, range) {
  const git = args =>
    execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  if (range.includes('...')) {
    // git's three-dot form: the head's change since it branched from base.
    const [base, head] = range.split('...');
    const fork = git(['merge-base', base, head]).trim();
    return git([
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      fork,
      head,
    ]);
  }
  if (range.includes('..')) {
    const [base, head] = range.split('..');
    return git([
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--src-prefix=a/',
      '--dst-prefix=b/',
      base,
      head,
    ]);
  }
  const base = git(['merge-base', 'HEAD', range]).trim();
  const tracked = git([
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    base,
  ]);
  // A new file not yet added to git is part of the change too.
  const untracked = git(['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(file => {
      const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
      return [
        `diff --git a/${file} b/${file}`,
        '--- /dev/null',
        `+++ b/${file}`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map(line => `+${line}`),
      ].join('\n');
    });
  return [tracked, ...untracked].join('\n');
}

function main(argv) {
  const files = [];
  let json = false;
  let includeDraft = false;
  let unreached = false;
  let unrouted = false;
  let triggers;
  let diffRange;
  let listRecords = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') json = true;
    else if (arg === '--include-draft') includeDraft = true;
    else if (arg === '--unreached') unreached = true;
    else if (arg === '--unrouted') unrouted = true;
    else if (arg === '--triggers') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--triggers requires a comma-separated list.');
      }
      triggers = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg === '--diff') {
      const value = argv[i + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--diff requires <base> or <base>..<head>.');
      }
      diffRange = value;
      i += 1;
    } else if (arg === '--records') {
      listRecords = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      return 0;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}.\n\n${USAGE}`);
    } else files.push(arg);
  }

  const index = loadKnowledgeIndex(DEFAULT_ROOT);
  if (unreached) {
    const result = findUnreachedRecords(index, trackedFiles(DEFAULT_ROOT));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `${result.length} current records are not reached by any tracked file:`,
      );
      for (const record of result)
        console.log(`  ${record.path}  ${record.id}`);
    }
    return 0;
  }
  if (unrouted) {
    const result = findUnroutedFiles(index, trackedFiles(DEFAULT_ROOT));
    if (json) console.log(JSON.stringify(result, null, 2));
    else {
      const byDirectory = new Map();
      for (const file of result) {
        const key = file.split('/').slice(0, 3).join('/');
        byDirectory.set(key, (byDirectory.get(key) ?? 0) + 1);
      }
      console.log(
        `${result.length} tracked files have no governing current record:`,
      );
      for (const [directory, count] of [...byDirectory].sort(
        (left, right) => right[1] - left[1],
      )) {
        console.log(`  ${String(count).padStart(5)}  ${directory}`);
      }
    }
    return 0;
  }
  const diff =
    diffRange == null ? null : readDiff(diffText(DEFAULT_ROOT, diffRange));
  const cwd = process.env.INIT_CWD ?? process.cwd();
  // Named files resolve against where the command ran; the diff's own files
  // are repository-relative.
  const targets = files.map(file => path.resolve(cwd, file));
  if (targets.length === 0 && diff != null) {
    if (diff.files.length === 0) {
      console.log(`No changes against ${diffRange}.`);
      return 0;
    }
    targets.push(...diff.files.map(file => path.join(DEFAULT_ROOT, file)));
  }
  if (targets.length === 0) {
    console.error(USAGE);
    return 2;
  }
  const results = targets.map(target =>
    resolveSpecsForFile(index, target, {
      includeDraft,
      triggers,
      addedLines: diff?.addedLines,
    }),
  );
  if (json) console.log(JSON.stringify(results, null, 2));
  else {
    console.log(WORKING_TREE_NOTE);
    console.log(
      results
        .map(result => formatResult(result, {records: listRecords}))
        .join('\n\n'),
    );
  }
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
