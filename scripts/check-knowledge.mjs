// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Knowledge-record validation.
 * @input Versioned schemas, records, and current ENGOWNERS/DESIGNOWNERS.
 * @output Structural, relationship, and approval-eligibility problems.
 * @position Repository knowledge guardrail; schemas do not grant approval rights.
 */

/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {collectThemingTargets} from '../packages/cli/foundation/discovery/theming-targets.mjs';

const require = createRequire(import.meta.url);
const {
  COMPONENT_PACKAGE_NAMES,
  packageHasPublicComponent,
} = require('./component-packages.cjs');
const {
  parseAuthority,
  parseOwnerFile,
} = require('../.github/scripts/knowledge-frontmatter.cjs');
const {
  parseDesignDecisionsBlock,
  validateDesignDecisionsBlock,
} = require('../.github/scripts/component-design-decisions.cjs');
const {
  COMPONENT_SPEC_ROOT,
  componentSpecPathForSource,
  isComponentSpecRecordPath,
  isIgnoredComponentKnowledgeSegment,
  isPlatformComponentSpecPath,
  locateComponentKnowledgePath,
} = require('../.github/scripts/knowledge-paths.cjs');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, '..');
const MODULE_ID_PATTERN =
  /^module:([A-Z][A-Za-z0-9]*)\/([A-Za-z][A-Za-z0-9]*)$/;
const READER_FIRST_TEMPLATE_KINDS = new Set([
  'architecture',
  'component',
  'module',
]);
const CONTRACT_AT_A_GLANCE_SECTION = 'Contract at a glance';

export {parseDesignDecisionsBlock, validateDesignDecisionsBlock};

function expectedTemplateSections(kind, requiredSections) {
  return READER_FIRST_TEMPLATE_KINDS.has(kind)
    ? [CONTRACT_AT_A_GLANCE_SECTION, ...requiredSections]
    : requiredSections;
}

export function parseKnowledgeDocument(content, filePath = '<document>') {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {
      frontmatter: new Map(),
      sections: [],
      problems: [`${filePath}: missing frontmatter.`],
    };
  }

  function parseScalar(raw) {
    let value = raw.trim();
    if (value === 'null' || value === '~') return null;
    if (/^\[.*\]$/.test(value)) {
      const inner = value.slice(1, -1).trim();
      return inner
        ? inner
            .split(',')
            .map(item => item.trim())
            .filter(Boolean)
            .map(item => item.replace(/^['"]|['"]$/g, ''))
        : [];
    }
    if (/^[0-9]+$/.test(value)) return Number(value);
    return value.replace(/^['"]|['"]$/g, '');
  }

  const frontmatter = new Map();
  const problems = [];
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      /^\s/.test(line) ||
      line.trim() === '' ||
      line.trimStart().startsWith('#')
    )
      continue;
    const field = line.match(/^([a-z][a-z0-9_]*):\s*(.*)$/);
    if (!field) continue;
    let raw = field[2].trim();
    if (raw === '') {
      const block = [];
      while (index + 1 < lines.length && /^\s/.test(lines[index + 1])) {
        block.push(lines[index + 1].trim());
        index += 1;
      }
      if (block.length === 1 && /^\[.*\]$/.test(block[0])) {
        raw = block[0];
      } else if (block[0] === '[' && block.at(-1) === ']') {
        raw = `[${block.slice(1, -1).join('')}]`;
      } else if (block.every(item => item.startsWith('- '))) {
        raw = `[${block.map(item => item.slice(2)).join(',')}]`;
      }
    }
    if (frontmatter.has(field[1])) {
      problems.push(`${filePath}: duplicate frontmatter field ${field[1]}.`);
      continue;
    }
    frontmatter.set(field[1], parseScalar(raw));
  }

  try {
    const authority = parseAuthority(content, filePath);
    if (authority !== frontmatter.get('authority')) {
      problems.push(`${filePath}: authority could not be parsed consistently.`);
    }
  } catch (error) {
    problems.push(error.message);
  }

  const sections = [...content.matchAll(/^## (.+?)\s*$/gm)].map(
    section => section[1],
  );
  return {frontmatter, sections, problems};
}

const REVIEW_APPLICABILITY_MARKER = 'review-applicability:v1';
const PATH_APPLICABILITY_MARKER = 'path-applicability:v1';
const PATH_PATTERN_CHARACTERS = /^[A-Za-z0-9_.@*?/-]+$/;
export const GLOBAL_REVIEW_TRIGGERS = new Set([
  'accessibility',
  'behavior',
  'compatibility',
  'component-slots',
  'docsite',
  'interaction',
  'layering',
  'layout',
  'motion',
  'navigation',
  'platform',
  'public-api',
  'react-runtime',
  'responsive',
  'scrolling',
  'specification',
  'styling',
  'testing',
  'theming',
  'tokens',
  'visual',
]);
const REVIEW_TRIGGER_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REVIEW_CLAIM_ID_PATTERN = /^[A-Z][A-Z0-9]*-?[0-9]+[a-z]?$/;

function exactKeys(value, expected) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
  );
}

export function extractKnowledgeClaims(content) {
  const claims = new Map();
  const definitions = [
    {
      pattern:
        /^\s*[-*]\s+\*\*([A-Z][A-Z0-9]*-?[0-9]+[a-z]?)\s+—\s+([\s\S]*?)\*\*/gm,
      title: match => match[2].replace(/\s+/g, ' ').trim(),
    },
    {
      pattern: /^#{2,6}\s+([A-Z][A-Z0-9]*-?[0-9]+[a-z]?)\s+—\s+(.+?)\s*$/gm,
      title: match => match[2].trim(),
    },
  ];
  for (const {pattern, title} of definitions) {
    for (const match of content.matchAll(pattern)) {
      if (!claims.has(match[1])) {
        claims.set(match[1], title(match));
      }
    }
  }

  let levelTwoSection = null;
  for (const line of content.split(/\r?\n/)) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) {
      levelTwoSection = heading[1];
      continue;
    }
    if (levelTwoSection !== 'Requirements') continue;
    const row =
      /^\|\s*([A-Z][A-Z0-9]*-?[0-9]+[a-z]?)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (row && !claims.has(row[1])) {
      claims.set(row[1], row[2].replace(/\s+/g, ' ').trim());
    }
  }
  return claims;
}

function parseOverlayBlock(content, markerName, filePath) {
  const marker = new RegExp(
    `<!--\\s*${markerName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*-->`,
    'g',
  );
  const markers = [...content.matchAll(marker)];
  if (markers.length === 0) return {config: null, problems: []};
  if (markers.length > 1) {
    return {
      config: null,
      problems: [`${filePath}: duplicate ${markerName} blocks.`],
    };
  }

  const remainder = content.slice(markers[0].index + markers[0][0].length);
  const block = /^\s*```json\s*\n([\s\S]*?)\n```/.exec(remainder);
  if (!block) {
    return {
      config: null,
      problems: [
        `${filePath}: ${markerName} must be followed by one JSON code block.`,
      ],
    };
  }

  const duplicates = duplicateJsonKeys(block[1]);
  if (duplicates.length > 0) {
    return {
      config: null,
      problems: [
        `${filePath}: ${markerName} repeats JSON field ${JSON.stringify(duplicates[0])}.`,
      ],
    };
  }

  try {
    return {config: JSON.parse(block[1]), problems: []};
  } catch (error) {
    return {
      config: null,
      problems: [
        `${filePath}: ${markerName} is not valid JSON (${error.message}).`,
      ],
    };
  }
}

/**
 * Keys repeated within one JSON object. `JSON.parse` keeps the last value
 * silently, so a repeated key would hide an entry; the same key in two
 * different objects (two concerns that both list `names`) is not a repeat.
 */
function duplicateJsonKeys(text) {
  const duplicates = [];
  const objects = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '{') objects.push(new Set());
    else if (character === '}') objects.pop();
    else if (character === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        end += text[end] === '\\' ? 2 : 1;
      }
      const raw = text.slice(index, end + 1);
      index = end;
      if (!/^\s*:/.test(text.slice(end + 1))) continue;
      const keys = objects.at(-1);
      let key;
      try {
        key = JSON.parse(raw);
      } catch {
        continue;
      }
      if (keys == null) continue;
      if (keys.has(key)) duplicates.push(key);
      keys.add(key);
    }
  }
  return duplicates;
}

export function parseReviewApplicabilityBlock(
  content,
  filePath = '<knowledge record>',
) {
  return parseOverlayBlock(content, REVIEW_APPLICABILITY_MARKER, filePath);
}

export function validateReviewApplicability(
  config,
  content,
  filePath = '<knowledge record>',
) {
  if (config == null) return [];
  const problems = [];
  const keys =
    config != null && typeof config === 'object' && !Array.isArray(config)
      ? Object.keys(config)
      : [];
  if (
    !keys.includes('scope') ||
    keys.some(key => !['scope', 'triggers', 'concerns'].includes(key)) ||
    !(keys.includes('triggers') || keys.includes('concerns'))
  ) {
    return [
      `${filePath}: ${REVIEW_APPLICABILITY_MARKER} requires scope with triggers, concerns, or both, and nothing else.`,
    ];
  }
  if (config.scope !== 'global') {
    problems.push(
      `${filePath}: ${REVIEW_APPLICABILITY_MARKER} scope must be "global".`,
    );
  }
  if (keys.includes('concerns')) {
    problems.push(
      ...validateReviewConcerns(
        config.concerns,
        extractKnowledgeClaims(content),
        filePath,
      ),
    );
  }
  if (!keys.includes('triggers')) return problems;
  if (
    config.triggers == null ||
    typeof config.triggers !== 'object' ||
    Array.isArray(config.triggers) ||
    Object.keys(config.triggers).length === 0
  ) {
    problems.push(
      `${filePath}: ${REVIEW_APPLICABILITY_MARKER} requires at least one trigger with explicit claims.`,
    );
    return problems;
  }

  const knownClaims = extractKnowledgeClaims(content);
  const seenPairs = new Set();
  for (const [trigger, claims] of Object.entries(config.triggers)) {
    const where = `${filePath}: ${REVIEW_APPLICABILITY_MARKER} trigger ${JSON.stringify(trigger)}`;
    if (!REVIEW_TRIGGER_PATTERN.test(trigger)) {
      problems.push(`${where} must use lower-kebab-case.`);
    } else if (!GLOBAL_REVIEW_TRIGGERS.has(trigger)) {
      problems.push(`${where} is not a supported semantic trigger.`);
    }
    if (!Array.isArray(claims) || claims.length === 0) {
      problems.push(`${where} requires a non-empty claim list.`);
      continue;
    }
    for (const claimId of claims) {
      if (
        typeof claimId !== 'string' ||
        !REVIEW_CLAIM_ID_PATTERN.test(claimId)
      ) {
        problems.push(
          `${where} has malformed claim id ${JSON.stringify(claimId)}.`,
        );
        continue;
      }
      const pair = `${trigger}\0${claimId}`;
      if (seenPairs.has(pair)) {
        problems.push(`${where} repeats claim ${JSON.stringify(claimId)}.`);
        continue;
      }
      seenPairs.add(pair);
      if (!knownClaims.has(claimId)) {
        problems.push(
          `${where} references missing claim ${JSON.stringify(claimId)}.`,
        );
      }
    }
  }
  return problems;
}

function pathPatternExpression(pattern) {
  let expression = '';
  const segments = pattern.split('/');
  segments.forEach((segment, index) => {
    const last = index === segments.length - 1;
    if (segment === '**') {
      expression += last ? '.*' : '(?:[^/]+/)*';
      return;
    }
    expression += segment
      .split('')
      .map(character => {
        if (character === '*') return '[^/]*';
        if (character === '?') return '[^/]';
        return character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    if (!last) expression += '/';
  });
  return new RegExp(`^${expression}$`);
}

/**
 * True when a repository-relative path matches a path-applicability pattern.
 * `**` spans any number of whole segments, `*` any run within one segment,
 * and `?` one character within a segment. Matching is case-sensitive.
 */
const pathPatternCache = new Map();

export function matchesPathPattern(pattern, filePath) {
  let expression = pathPatternCache.get(pattern);
  if (!expression) {
    expression = pathPatternExpression(pattern);
    pathPatternCache.set(pattern, expression);
  }
  return expression.test(filePath);
}

export function parsePathApplicabilityBlock(
  content,
  filePath = '<knowledge record>',
) {
  return parseOverlayBlock(content, PATH_APPLICABILITY_MARKER, filePath);
}

/**
 * Validate a `path-applicability:v1` block. When `repositoryFiles` is given,
 * every pattern must match at least one of them, so a pattern cannot go stale
 * silently after a move or rename.
 */
export function validatePathApplicability(
  config,
  filePath = '<knowledge record>',
  repositoryFiles = null,
) {
  if (config == null) return [];
  const where = `${filePath}: ${PATH_APPLICABILITY_MARKER}`;
  if (!exactKeys(config, ['paths'])) {
    return [`${where} requires exactly paths.`];
  }
  if (!Array.isArray(config.paths) || config.paths.length === 0) {
    return [`${where} requires a non-empty paths list.`];
  }
  const problems = [];
  const seen = new Set();
  for (const pattern of config.paths) {
    if (typeof pattern !== 'string' || pattern.length === 0) {
      problems.push(`${where} has a non-string or empty pattern.`);
      continue;
    }
    const label = `${where} pattern ${JSON.stringify(pattern)}`;
    if (seen.has(pattern)) {
      problems.push(`${label} is repeated.`);
      continue;
    }
    seen.add(pattern);
    if (!PATH_PATTERN_CHARACTERS.test(pattern)) {
      problems.push(
        `${label} may use only letters, digits, _ . @ - / and the wildcards * ** ?.`,
      );
      continue;
    }
    const segments = pattern.split('/');
    if (
      pattern.startsWith('/') ||
      segments.some(
        segment => segment === '' || segment === '.' || segment === '..',
      )
    ) {
      problems.push(
        `${label} must be repository-relative with no empty, "." or ".." segments.`,
      );
      continue;
    }
    if (segments.some(segment => segment.includes('**') && segment !== '**')) {
      problems.push(`${label} may use ** only as a whole segment.`);
      continue;
    }
    if (pattern === '**') {
      problems.push(`${label} covers the whole repository; name the paths.`);
      continue;
    }
    if (/[*?]/.test(segments[0])) {
      problems.push(
        `${label} must start with a literal path segment; a leading wildcard covers the whole repository.`,
      );
      continue;
    }
    if (
      repositoryFiles &&
      repositoryFiles.length > 1 &&
      repositoryFiles.every(candidate => matchesPathPattern(pattern, candidate))
    ) {
      problems.push(`${label} matches every repository file; name the paths.`);
      continue;
    }
    if (
      repositoryFiles &&
      !repositoryFiles.some(candidate => matchesPathPattern(pattern, candidate))
    ) {
      problems.push(`${label} matches no repository file.`);
    }
  }
  return problems;
}

function repositoryFileList(root) {
  try {
    return execFileSync('git', ['-C', root, 'ls-files', '-z'], {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .split('\0')
      .filter(Boolean);
  } catch {
    return null;
  }
}

function isKnowledgeRecordPath(filePath) {
  if (/^docs\/(?:architecture|design|families)\/[^/]+\.md$/.test(filePath)) {
    return !filePath.endsWith('/README.md');
  }
  if (/^docs\/specs\/[^/]+\/(?:spec|plan)\.md$/.test(filePath)) {
    return true;
  }
  const themeMatch = /^packages\/themes\/([^/]+)\/([^/]+)\.spec\.md$/.exec(
    filePath,
  );
  if (themeMatch) return themeMatch[1] === themeMatch[2];
  return isComponentSpecRecordPath(filePath);
}

const REVIEW_CONCERN_NAME_PATTERN = REVIEW_TRIGGER_PATTERN;
const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
 * A record's `concerns` map names the shared utilities it owns and the code
 * that re-implements them. Each entry lists identifiers (`names`), regular
 * expressions (`patterns`), or both, and the claims they route.
 */
function validateReviewConcerns(concerns, knownClaims, filePath) {
  const where = `${filePath}: ${REVIEW_APPLICABILITY_MARKER} concerns`;
  if (
    concerns == null ||
    typeof concerns !== 'object' ||
    Array.isArray(concerns) ||
    Object.keys(concerns).length === 0
  ) {
    return [`${where} must map at least one concern name to its entry.`];
  }
  const problems = [];
  for (const [name, entry] of Object.entries(concerns)) {
    const at = `${where} ${JSON.stringify(name)}`;
    if (!REVIEW_CONCERN_NAME_PATTERN.test(name)) {
      problems.push(`${at} must use lower-kebab-case.`);
    }
    const entryKeys =
      entry != null && typeof entry === 'object' && !Array.isArray(entry)
        ? Object.keys(entry)
        : null;
    if (
      entryKeys == null ||
      !entryKeys.includes('claims') ||
      entryKeys.some(key => !['names', 'patterns', 'claims'].includes(key))
    ) {
      problems.push(
        `${at} requires claims with names, patterns, or both, and nothing else.`,
      );
      continue;
    }
    const names = entry.names ?? [];
    const patterns = entry.patterns ?? [];
    if (!Array.isArray(names) || !Array.isArray(patterns)) {
      problems.push(`${at} names and patterns must be lists.`);
      continue;
    }
    if (names.length + patterns.length === 0) {
      problems.push(`${at} requires at least one name or pattern.`);
    }
    for (const value of names) {
      if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
        problems.push(
          `${at} has a name that is not an identifier: ${JSON.stringify(value)}.`,
        );
      }
    }
    for (const value of patterns) {
      try {
        if (typeof value !== 'string' || value.length === 0) throw new Error();
        new RegExp(value);
      } catch {
        problems.push(`${at} has an invalid pattern ${JSON.stringify(value)}.`);
      }
    }
    if (!Array.isArray(entry.claims) || entry.claims.length === 0) {
      problems.push(`${at} requires a non-empty claim list.`);
      continue;
    }
    const seen = new Set();
    for (const claimId of entry.claims) {
      if (
        typeof claimId !== 'string' ||
        !REVIEW_CLAIM_ID_PATTERN.test(claimId)
      ) {
        problems.push(
          `${at} has malformed claim id ${JSON.stringify(claimId)}.`,
        );
      } else if (seen.has(claimId)) {
        problems.push(`${at} repeats claim ${JSON.stringify(claimId)}.`);
      } else if (!knownClaims.has(claimId)) {
        problems.push(
          `${at} references missing claim ${JSON.stringify(claimId)}.`,
        );
      }
      seen.add(claimId);
    }
  }
  return problems;
}

function concernMatchers(entry) {
  return [
    ...(entry.names ?? []).map(name => ({
      label: name,
      expression: new RegExp(
        `(?<![\\w$])${name.replace(/\$/g, '\\$')}(?![\\w$])`,
      ),
    })),
    ...(entry.patterns ?? []).map(pattern => ({
      label: pattern,
      expression: new RegExp(pattern),
    })),
  ];
}

/**
 * Route each claim whose owning record's concern matches an added line.
 * `addedLines` are `{file, line, text}` rows of shipped source a diff adds.
 * Every row names the record, concern, claim, and the first added lines that
 * matched it, so a reviewer sees why the claim applies.
 */
export function collectConcernMatches(records, addedLines, authorityCommit) {
  const matches = [];
  if (addedLines.length === 0) return matches;
  for (const record of records) {
    const parsed = parseReviewApplicabilityBlock(record.content, record.path);
    if (parsed.config?.concerns == null) continue;
    const document = parseKnowledgeDocument(record.content, record.path);
    const problems = [
      ...document.problems,
      ...parsed.problems,
      ...validateReviewApplicability(
        parsed.config,
        record.content,
        record.path,
      ),
    ];
    if (problems.length > 0) throw new Error(problems.join('\n'));
    if (document.frontmatter.get('authority') !== 'current') continue;
    const recordId = document.frontmatter.get('id');
    const claims = extractKnowledgeClaims(record.content);
    const recordDigest = createHash('sha256')
      .update(record.content)
      .digest('hex');
    for (const [concern, entry] of Object.entries(parsed.config.concerns)) {
      const matchers = concernMatchers(entry);
      const evidence = [];
      for (const added of addedLines) {
        for (const matcher of matchers) {
          const found = matcher.expression.exec(added.text);
          if (found) {
            evidence.push({...added, matched: found[0], by: matcher.label});
            break;
          }
        }
      }
      if (evidence.length === 0) continue;
      const first = evidence[0];
      for (const claimId of entry.claims) {
        matches.push({
          recordId,
          path: record.path,
          concern,
          claimId,
          claim: claims.get(claimId),
          utilities: entry.names ?? [],
          matchReason: `Added line ${first.file}:${first.line} matched ${JSON.stringify(first.matched)} in concern ${JSON.stringify(concern)}${entry.names?.length ? ` (shared: ${entry.names.join(', ')})` : ''}, which routes claim ${JSON.stringify(`${recordId}/${claimId}`)}.`,
          evidence: evidence.slice(0, 5),
          authorityCommit,
          recordDigest,
        });
      }
    }
  }
  return matches.sort((left, right) =>
    [left.recordId, left.concern, left.claimId]
      .join('\0')
      .localeCompare([right.recordId, right.concern, right.claimId].join('\0')),
  );
}

export function collectGlobalReviewMatches(
  records,
  requestedTriggers,
  authorityCommit,
) {
  const requested = [...new Set(requestedTriggers)].sort();
  for (const trigger of requested) {
    if (
      !REVIEW_TRIGGER_PATTERN.test(trigger) ||
      !GLOBAL_REVIEW_TRIGGERS.has(trigger)
    ) {
      throw new Error(`Invalid review trigger ${JSON.stringify(trigger)}.`);
    }
  }

  const matches = [];
  for (const record of records) {
    const document = parseKnowledgeDocument(record.content, record.path);
    const parsed = parseReviewApplicabilityBlock(record.content, record.path);
    const problems = [
      ...document.problems,
      ...parsed.problems,
      ...validateReviewApplicability(
        parsed.config,
        record.content,
        record.path,
      ),
    ];
    if (problems.length > 0) {
      throw new Error(problems.join('\n'));
    }
    if (
      document.frontmatter.get('authority') !== 'current' ||
      parsed.config?.scope !== 'global'
    ) {
      continue;
    }

    const recordId = document.frontmatter.get('id');
    if (typeof recordId !== 'string' || recordId.length === 0) {
      throw new Error(`${record.path}: a routed record requires an id.`);
    }
    const claims = extractKnowledgeClaims(record.content);
    const recordDigest = createHash('sha256')
      .update(record.content)
      .digest('hex');
    for (const trigger of requested) {
      for (const claimId of parsed.config.triggers?.[trigger] ?? []) {
        matches.push({
          recordId,
          path: record.path,
          trigger,
          claimId,
          claim: claims.get(claimId),
          matchReason: `Requested trigger ${JSON.stringify(trigger)} matched ${REVIEW_APPLICABILITY_MARKER} claim ${JSON.stringify(`${recordId}/${claimId}`)}.`,
          authorityCommit,
          recordDigest,
        });
      }
    }
  }
  return matches.sort((left, right) =>
    [left.recordId, left.path, left.trigger, left.claimId]
      .join('\0')
      .localeCompare(
        [right.recordId, right.path, right.trigger, right.claimId].join('\0'),
      ),
  );
}

export function routeGlobalReviewBaselinesAtRevision(
  root,
  authorityCommit,
  reviewHead,
  requestedTriggers,
) {
  const {records, authority} = readKnowledgeRecordsAtAuthority(
    root,
    authorityCommit,
    reviewHead,
  );
  return collectGlobalReviewMatches(records, requestedTriggers, authority);
}

/**
 * The knowledge records at a review's base authority commit, after checking
 * that commit is the full, resolved `origin/main` merge base of the reviewed
 * head, so a proposed head can never serve as its own authority.
 */
export function readKnowledgeRecordsAtAuthority(
  root,
  authorityCommit,
  reviewHead,
) {
  const resolvedCommit = execFileSync(
    'git',
    ['-C', root, 'rev-parse', '--verify', `${authorityCommit}^{commit}`],
    {encoding: 'utf8'},
  ).trim();
  if (resolvedCommit !== authorityCommit) {
    throw new Error(
      `authority commit must be the full resolved commit ${resolvedCommit}.`,
    );
  }
  const resolvedHead = execFileSync(
    'git',
    ['-C', root, 'rev-parse', '--verify', `${reviewHead}^{commit}`],
    {encoding: 'utf8'},
  ).trim();
  if (resolvedHead !== reviewHead) {
    throw new Error(
      `review head must be the full resolved commit ${resolvedHead}.`,
    );
  }
  if (resolvedCommit === resolvedHead) {
    throw new Error('review head must differ from its base authority commit.');
  }
  const expectedBase = execFileSync(
    'git',
    ['-C', root, 'merge-base', 'origin/main', resolvedHead],
    {encoding: 'utf8'},
  ).trim();
  if (resolvedCommit !== expectedBase) {
    throw new Error(
      `authority commit must equal the review head's origin/main merge base ${expectedBase}.`,
    );
  }
  const paths = execFileSync(
    'git',
    [
      '-C',
      root,
      'ls-tree',
      '-r',
      '--name-only',
      resolvedCommit,
      '--',
      'docs/architecture',
      'docs/design',
      'docs/families',
      'docs/specs',
      'packages',
    ],
    {encoding: 'utf8'},
  )
    .split(/\r?\n/)
    .filter(isKnowledgeRecordPath);
  const records = paths.map(filePath => ({
    path: filePath,
    content: execFileSync(
      'git',
      ['-C', root, 'show', `${resolvedCommit}:${filePath}`],
      {encoding: 'utf8'},
    ),
  }));
  return {records, authority: resolvedCommit};
}

function immediateDirectories(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(directory, entry.name));
}

function matchingFiles(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory, {withFileTypes: true})
    .filter(entry => entry.isFile() && predicate(entry.name))
    .map(entry => path.join(directory, entry.name));
}

function matchingFilesRecursively(
  directory,
  predicate,
  {skipDirectory = () => false} = {},
) {
  if (!fs.existsSync(directory)) return [];
  const matches = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (skipDirectory(entry.name, candidate)) {
          continue;
        }
        pending.push(candidate);
      } else if (entry.isFile() && predicate(entry.name, candidate)) {
        matches.push(candidate);
      }
    }
  }
  return matches;
}

export function discoverThemeRecordCandidates(root = DEFAULT_ROOT) {
  const records = [];
  const problems = [];

  for (const filePath of matchingFiles(
    path.join(root, 'docs/themes'),
    name => name.endsWith('.md') && name !== 'README.md',
  )) {
    records.push(filePath);
    problems.push(
      `${path.relative(root, filePath)}: theme records must be placed at packages/themes/<theme>/<theme>.spec.md; docs/themes contains guidance only.`,
    );
  }

  for (const themeDirectory of immediateDirectories(
    path.join(root, 'packages/themes'),
  )) {
    const themeName = path.basename(themeDirectory);
    const expectedPath = path.join(themeDirectory, `${themeName}.spec.md`);
    for (const filePath of matchingFilesRecursively(themeDirectory, name =>
      name.endsWith('.spec.md'),
    )) {
      records.push(filePath);
      if (filePath !== expectedPath) {
        problems.push(
          `${path.relative(root, filePath)}: theme record must be placed exactly at packages/themes/${themeName}/${themeName}.spec.md.`,
        );
      }
    }
  }

  return {records: records.sort(), problems};
}

export function discoverKnowledgeRecords(root = DEFAULT_ROOT) {
  const records = [];

  for (const specDirectory of immediateDirectories(
    path.join(root, 'docs/specs'),
  )) {
    for (const name of ['spec.md', 'plan.md']) {
      const candidate = path.join(specDirectory, name);
      if (fs.existsSync(candidate)) records.push(candidate);
    }
  }

  records.push(
    ...matchingFiles(
      path.join(root, 'docs/families'),
      name => name.endsWith('.md') && name !== 'README.md',
    ),
    ...matchingFiles(
      path.join(root, 'docs/architecture'),
      name => name.endsWith('.md') && name !== 'README.md',
    ),
    ...matchingFiles(
      path.join(root, 'docs/design'),
      name => name.endsWith('.md') && name !== 'README.md',
    ),
  );

  records.push(...discoverThemeRecordCandidates(root).records);

  records.push(
    ...matchingFilesRecursively(
      path.join(root, COMPONENT_SPEC_ROOT),
      (_name, candidate) =>
        isComponentSpecRecordPath(
          path.relative(root, candidate).split(path.sep).join('/'),
        ),
      {skipDirectory: isIgnoredComponentKnowledgeSegment},
    ),
  );

  return records.sort();
}

/**
 * Spec files outside the component record layout: a `*.spec.md` left in a
 * registered component package's source tree, and a `*.spec.md` under
 * `docs/specs/components/` that is neither a component or module record nor a
 * platform implementation's `<PublicName>.<language>.spec.md`.
 */
export function discoverMisplacedComponentSpecs(root = DEFAULT_ROOT) {
  const problems = [];
  const toPosix = candidate =>
    path.relative(root, candidate).split(path.sep).join('/');
  const isSpecFile = name =>
    name.endsWith('.spec.md') && !name.endsWith('.generated.spec.md');

  for (const packageName of COMPONENT_PACKAGE_NAMES) {
    const sourceRoot = path.join(root, `packages/${packageName}/src`);
    for (const candidate of matchingFilesRecursively(
      sourceRoot,
      name => isSpecFile(name) && !name.startsWith('.'),
      {skipDirectory: isIgnoredComponentKnowledgeSegment},
    )) {
      const relativeToSource = path
        .relative(sourceRoot, candidate)
        .split(path.sep)
        .join('/');
      problems.push(
        `${toPosix(candidate)}: component records live under ${COMPONENT_SPEC_ROOT}/; move this record to ${componentSpecPathForSource(packageName, relativeToSource)}.`,
      );
    }
  }

  const nativeSources = path.join(root, 'packages/native/apple/Sources');
  for (const candidate of matchingFilesRecursively(
    nativeSources,
    name => isSpecFile(name) && !name.startsWith('.'),
    {skipDirectory: isIgnoredComponentKnowledgeSegment},
  )) {
    const relative = path
      .relative(nativeSources, candidate)
      .split(path.sep)
      .join('/')
      .split('/');
    // Sources/<Module>/<ComponentRoot>/.../<Name>.spec.md
    const componentRoot =
      relative.length >= 3 ? relative[1] : '<ComponentRoot>';
    const name = relative.at(-1).slice(0, -'.spec.md'.length);
    problems.push(
      `${toPosix(candidate)}: Swift component records live beside the core record; move this record to ${COMPONENT_SPEC_ROOT}/${componentRoot}/${name}.swift.spec.md.`,
    );
  }

  for (const candidate of matchingFilesRecursively(
    path.join(root, COMPONENT_SPEC_ROOT),
    name => isSpecFile(name) && !name.startsWith('.'),
    {skipDirectory: isIgnoredComponentKnowledgeSegment},
  )) {
    const filePath = toPosix(candidate);
    if (isComponentSpecRecordPath(filePath)) continue;
    if (isPlatformComponentSpecPath(filePath)) continue;
    problems.push(
      `${filePath}: a file under ${COMPONENT_SPEC_ROOT}/ must be <ComponentRoot>/<PublicName>.spec.md, a module record nested below it, or a platform record <ComponentRoot>/<PublicName>.<language>.spec.md.`,
    );
  }

  return problems;
}

function componentRecordLocation(root, absolutePath) {
  const filePath = path.relative(root, absolutePath).split(path.sep).join('/');
  const location = locateComponentKnowledgePath(root, filePath);
  if (!location) return null;
  return {
    ...location,
    componentRootPath: path.join(root, location.componentRootDirectory),
    componentSourcePath: path.join(root, location.componentSourceDirectory),
  };
}

function isFullConsumerDocEntry(entry) {
  return (
    entry != null &&
    typeof entry === 'object' &&
    (typeof entry.description === 'string' ||
      Array.isArray(entry.props) ||
      Array.isArray(entry.params) ||
      Array.isArray(entry.returns) ||
      entry.usage != null)
  );
}

/**
 * Public names one consumer doc defines: its own `name` and its full
 * `components` entries, as `componentRootDefinesPublicComponent` reads them.
 * Anatomy parts and other nested `name` fields are not names.
 */
export function consumerDocPublicNames(docPath) {
  let mod;
  try {
    mod = require(docPath);
  } catch {
    return [];
  }
  const doc = mod.docs ?? mod.default;
  if (!doc) return [];
  const names = new Set();
  if (typeof doc.name === 'string') names.add(doc.name.replace(/^XDS/, ''));
  for (const entry of doc.components ?? []) {
    if (typeof entry?.name === 'string' && isFullConsumerDocEntry(entry)) {
      names.add(entry.name.replace(/^XDS/, ''));
    }
  }
  return [...names].sort();
}

function componentRootDefinesPublicComponent(componentRootPath, publicName) {
  for (const docPath of matchingFilesRecursively(
    componentRootPath,
    name => name.endsWith('.doc.mjs'),
    {skipDirectory: isIgnoredComponentKnowledgeSegment},
  )) {
    let mod;
    try {
      mod = require(docPath);
    } catch {
      continue;
    }
    const doc = mod.docs ?? mod.default;
    if (!doc) continue;
    if (doc.name?.replace(/^XDS/, '') === publicName) return true;
    if (
      (doc.components ?? []).some(
        entry =>
          entry?.name?.replace(/^XDS/, '') === publicName &&
          isFullConsumerDocEntry(entry),
      )
    ) {
      return true;
    }
  }
  return false;
}

function activeRecord(record, activeAuthorities) {
  return activeAuthorities.includes(
    record.document.frontmatter.get('authority'),
  );
}

/**
 * Validate the explicit two-way ownership graph between component and module
 * records. This is structural metadata, not broad coverage enforcement: a
 * component with `modules: []` is valid, and private helpers need no record.
 */
export function validateComponentModuleRelationships(
  root,
  records,
  activeAuthorities = ['draft', 'current'],
) {
  const problems = [];
  const recordsById = new Map();

  for (const record of records) {
    const id = record.document.frontmatter.get('id');
    if (typeof id !== 'string') continue;
    const matches = recordsById.get(id) ?? [];
    matches.push(record);
    recordsById.set(id, matches);
  }

  for (const record of records) {
    const {frontmatter} = record.document;
    const kind = frontmatter.get('kind');
    if (kind !== 'component' && kind !== 'module') continue;

    const location = componentRecordLocation(root, record.absolutePath);
    if (!location) {
      problems.push(
        `${record.filePath}: ${kind} records must live at ${COMPONENT_SPEC_ROOT}/<ComponentRoot>/, where exactly one registered component package owns <ComponentRoot>.`,
      );
      continue;
    }

    const publicName = location.publicName;
    if (kind === 'component') {
      if (location.kind !== 'component') {
        problems.push(
          `${record.filePath}: component records must be direct children of their component root; nested records use kind: module.`,
        );
      }
      const expectedId = `component:${publicName}`;
      if (frontmatter.get('id') !== expectedId) {
        problems.push(
          `${record.filePath}: component record id must be ${expectedId} to match its filename.`,
        );
      }
      if (
        location.layout === 'flat' &&
        !packageHasPublicComponent(root, location.packageName, publicName)
      ) {
        problems.push(
          `${record.filePath}: flat-package component record ${expectedId} must match a public named export and TSX module in packages/${location.packageName}/src.`,
        );
      }
      if (
        publicName !== location.componentRoot &&
        !componentRootDefinesPublicComponent(
          location.componentSourcePath,
          publicName,
        )
      ) {
        problems.push(
          `${record.filePath}: flat component record ${expectedId} must match component root ${JSON.stringify(location.componentRoot)} or an exact public component entry in that root's consumer docs.`,
        );
      }
      continue;
    }

    if (location.kind !== 'module') {
      problems.push(
        `${record.filePath}: module records must be nested beneath their component root; direct children are reserved for component records.`,
      );
    }
    const id = frontmatter.get('id');
    const idMatch = typeof id === 'string' ? MODULE_ID_PATTERN.exec(id) : null;
    if (!idMatch) continue;
    const expectedParent = `component:${idMatch[1]}`;
    if (location.layout === 'flat' && location.componentRoot !== idMatch[1]) {
      problems.push(
        `${record.filePath}: flat-package module ${id} must live under ${COMPONENT_SPEC_ROOT}/${idMatch[1]}/ to match its parent component.`,
      );
    }
    if (frontmatter.get('parent_component') !== expectedParent) {
      problems.push(
        `${record.filePath}: parent_component must be ${expectedParent} to match module id ${id}.`,
      );
    }
    if (publicName !== idMatch[2]) {
      problems.push(
        `${record.filePath}: module filename must be ${idMatch[2]}.spec.md to match id ${id}.`,
      );
    }
  }

  for (const record of records) {
    if (!activeRecord(record, activeAuthorities)) continue;
    const {frontmatter} = record.document;
    const kind = frontmatter.get('kind');
    const id = frontmatter.get('id');
    const location = componentRecordLocation(root, record.absolutePath);
    if (!location || typeof id !== 'string') continue;

    if (kind === 'component') {
      const modules = frontmatter.get('modules');
      if (!Array.isArray(modules)) continue;
      const seen = new Set();
      for (const moduleId of modules) {
        if (seen.has(moduleId)) {
          problems.push(
            `${record.filePath}: modules contains duplicate reference ${moduleId}.`,
          );
          continue;
        }
        seen.add(moduleId);

        const targets = recordsById.get(moduleId) ?? [];
        if (targets.length === 0) {
          problems.push(
            `${record.filePath}: modules reference ${moduleId} does not resolve to an active module record.`,
          );
          continue;
        }
        if (targets.length > 1) continue;
        const target = targets[0];
        if (target.document.frontmatter.get('kind') !== 'module') {
          problems.push(
            `${record.filePath}: modules reference ${moduleId} must resolve to a module record, not ${target.document.frontmatter.get('kind')}.`,
          );
          continue;
        }
        if (!activeRecord(target, activeAuthorities)) {
          problems.push(
            `${record.filePath}: modules reference ${moduleId} must resolve to an active module record.`,
          );
          continue;
        }
        if (target.document.frontmatter.get('parent_component') !== id) {
          problems.push(
            `${record.filePath}: modules reference ${moduleId}, but that module declares parent_component ${JSON.stringify(target.document.frontmatter.get('parent_component'))}.`,
          );
        }
        const targetLocation = componentRecordLocation(
          root,
          target.absolutePath,
        );
        if (
          targetLocation &&
          path.resolve(targetLocation.componentRootPath) !==
            path.resolve(location.componentRootPath)
        ) {
          problems.push(
            `${record.filePath}: module ${moduleId} must live in the same component root as its parent record (${target.filePath}).`,
          );
        }
      }
      continue;
    }

    if (kind !== 'module') continue;
    const parentId = frontmatter.get('parent_component');
    if (typeof parentId !== 'string') continue;
    const parents = recordsById.get(parentId) ?? [];
    if (parents.length === 0) {
      problems.push(
        `${record.filePath}: parent_component ${parentId} does not resolve to an active component record.`,
      );
      continue;
    }
    if (parents.length > 1) continue;
    const parent = parents[0];
    if (parent.document.frontmatter.get('kind') !== 'component') {
      problems.push(
        `${record.filePath}: parent_component ${parentId} must resolve to a component record, not ${parent.document.frontmatter.get('kind')}.`,
      );
      continue;
    }
    if (!activeRecord(parent, activeAuthorities)) {
      problems.push(
        `${record.filePath}: parent_component ${parentId} must resolve to an active component record.`,
      );
      continue;
    }

    const parentLocation = componentRecordLocation(root, parent.absolutePath);
    if (
      parentLocation &&
      path.resolve(parentLocation.componentRootPath) !==
        path.resolve(location.componentRootPath)
    ) {
      problems.push(
        `${record.filePath}: parent_component ${parentId} must be declared in the same component root (${parent.filePath}).`,
      );
    }

    const backlinks = Array.isArray(parent.document.frontmatter.get('modules'))
      ? parent.document.frontmatter
          .get('modules')
          .filter(moduleId => moduleId === id).length
      : 0;
    if (backlinks === 0) {
      problems.push(
        `${record.filePath}: module ${id} is orphaned; ${parent.filePath} must list it in modules.`,
      );
    } else if (backlinks > 1) {
      problems.push(
        `${record.filePath}: module ${id} is listed more than once by ${parent.filePath}.`,
      );
    }
  }

  return problems;
}

export function parseAnatomyThemingBlock(
  content,
  filePath = '<component spec>',
) {
  const heading = /^### Theming anatomy\s*$/gm;
  const headings = [...content.matchAll(heading)];
  if (headings.length === 0) return {mapping: null, problems: []};
  if (headings.length > 1) {
    return {
      mapping: null,
      problems: [`${filePath}: duplicate "Theming anatomy" subsection.`],
    };
  }

  const precedingSections = [
    ...content.slice(0, headings[0].index).matchAll(/^## (.+?)\s*$/gm),
  ];
  if (precedingSections.at(-1)?.[1] !== 'Design relationships') {
    return {
      mapping: null,
      problems: [
        `${filePath}: "Theming anatomy" must be a level-three subsection of "Design relationships".`,
      ],
    };
  }

  const start = headings[0].index + headings[0][0].length;
  const remainder = content.slice(start);
  const nextHeading = /^#{2,3} .+$/m.exec(remainder);
  const section =
    nextHeading == null ? remainder : remainder.slice(0, nextHeading.index);
  const blocks = [
    ...section.matchAll(
      /<!--\s*anatomy-theming:v1\s*-->\s*```json\s*\n([\s\S]*?)\n```/g,
    ),
  ];
  if (blocks.length !== 1) {
    return {
      mapping: null,
      problems: [
        `${filePath}: "Theming anatomy" must contain exactly one <!-- anatomy-theming:v1 --> JSON block.`,
      ],
    };
  }

  try {
    return {mapping: JSON.parse(blocks[0][1]), problems: []};
  } catch (error) {
    return {
      mapping: null,
      problems: [
        `${filePath}: anatomy-theming:v1 is not valid JSON (${error.message}).`,
      ],
    };
  }
}

const THEME_TARGET_NAME = /^(?!astryx-)[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const THEMING_DISPOSITIONS = ['target', 'inherits', 'delegatesTo', 'none'];
const NONE_REASON_PREFIX = /^(?:intentional|reachability-gap|unsettled):\s+\S/;

function exactObjectKeys(value, expected) {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expected].sort().join('\0')
  );
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateTargetName(target, where, problems) {
  if (!isNonEmptyString(target)) {
    problems.push(`${where}: target is required.`);
  } else if (!THEME_TARGET_NAME.test(target)) {
    problems.push(
      `${where}: target must omit the "astryx-" prefix and use kebab-case.`,
    );
  }
}

/**
 * Validate one parsed anatomy-theming:v1 map against the component's public
 * anatomy and target inventory.
 */
export function validateAnatomyThemingMap(
  mapping,
  contract,
  filePath = '<component spec>',
) {
  const problems = [];
  if (
    mapping == null ||
    typeof mapping !== 'object' ||
    Array.isArray(mapping)
  ) {
    return [`${filePath}: anatomy-theming:v1 must be a JSON object.`];
  }

  const declaredParts = Object.keys(mapping).sort();
  const anatomyParts = [...contract.anatomy].sort();
  const missing = anatomyParts.filter(part => !declaredParts.includes(part));
  const extra = declaredParts.filter(part => !anatomyParts.includes(part));
  if (missing.length > 0) {
    problems.push(
      `${filePath}: theming anatomy is missing ${missing.join(', ')}.`,
    );
  }
  if (extra.length > 0) {
    problems.push(
      `${filePath}: theming anatomy has unknown ${extra.join(', ')}.`,
    );
  }

  const ownedTargets = new Set();
  for (const [part, disposition] of Object.entries(mapping)) {
    const where = `${filePath}: theming anatomy ${JSON.stringify(part)}`;
    if (
      disposition == null ||
      typeof disposition !== 'object' ||
      Array.isArray(disposition)
    ) {
      problems.push(`${where} must be an object.`);
      continue;
    }

    const keys = Object.keys(disposition);
    const selected = THEMING_DISPOSITIONS.filter(key => key in disposition);
    if (selected.length !== 1 || keys.length !== 1) {
      problems.push(
        `${where} must declare exactly one of target, inherits, delegatesTo, or none.`,
      );
      continue;
    }

    const kind = selected[0];
    if (kind === 'target' || kind === 'inherits') {
      const target = disposition[kind];
      validateTargetName(target, `${where}.${kind}`, problems);
      if (
        isNonEmptyString(target) &&
        THEME_TARGET_NAME.test(target) &&
        !contract.targets.includes(target)
      ) {
        problems.push(
          `${where}.${kind}: ${JSON.stringify(target)} is not a current target in the component doc.`,
        );
      }
      if (kind === 'target') ownedTargets.add(target);
      continue;
    }

    if (kind === 'delegatesTo') {
      const delegation = disposition.delegatesTo;
      if (!exactObjectKeys(delegation, ['owner', 'target'])) {
        problems.push(
          `${where}.delegatesTo requires exactly owner and target.`,
        );
        continue;
      }
      if (
        !isNonEmptyString(delegation.owner) ||
        !/^(component:[A-Z][A-Za-z0-9]*|family:[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(
          delegation.owner,
        )
      ) {
        problems.push(
          `${where}.delegatesTo.owner must be component:<Name> or family:<id>.`,
        );
      }
      validateTargetName(
        delegation.target,
        `${where}.delegatesTo.target`,
        problems,
      );
      continue;
    }

    const none = disposition.none;
    if (!exactObjectKeys(none, ['reason']) || !isNonEmptyString(none.reason)) {
      problems.push(`${where}.none requires a non-empty reason.`);
    } else if (!NONE_REASON_PREFIX.test(none.reason)) {
      problems.push(
        `${where}.none.reason must start with intentional:, reachability-gap:, or unsettled:.`,
      );
    }
  }

  for (const target of contract.targets) {
    if (!ownedTargets.has(target)) {
      problems.push(
        `${filePath}: current target ${JSON.stringify(target)} has no anatomy entry with a target disposition.`,
      );
    }
  }

  return problems;
}

function collectDelegations(mapping, filePath) {
  const delegations = [];
  for (const [anatomy, disposition] of Object.entries(mapping)) {
    const delegation = disposition?.delegatesTo;
    if (!exactObjectKeys(delegation, ['owner', 'target'])) continue;
    if (
      !/^(component:[A-Z][A-Za-z0-9]*|family:[a-z0-9]+(?:-[a-z0-9]+)*)$/.test(
        delegation.owner,
      )
    )
      continue;
    if (!THEME_TARGET_NAME.test(delegation.target)) continue;
    delegations.push({
      filePath,
      anatomy,
      owner: delegation.owner,
      target: delegation.target,
    });
  }
  return delegations;
}

/**
 * Validate delegatesTo pairs against the CLI's canonical active owner/target
 * inventory and active knowledge-family membership.
 */
export function validateDelegations(
  delegations,
  canonicalTargets,
  activeFamilies = new Map(),
) {
  const targetsByOwner = new Map();
  const ownersByTarget = new Map();
  for (const {component, key} of canonicalTargets) {
    const owner = `component:${component.replace(/^XDS/, '')}`;
    const targets = targetsByOwner.get(owner) ?? new Set();
    targets.add(key);
    targetsByOwner.set(owner, targets);
    const owners = ownersByTarget.get(key) ?? new Set();
    owners.add(owner);
    ownersByTarget.set(key, owners);
  }

  function targetOwnership(target) {
    const owners = [...(ownersByTarget.get(target) ?? [])]
      .sort()
      .map(value => JSON.stringify(value));
    return owners.length > 0
      ? ` canonical owner${owners.length === 1 ? '' : 's'} for target ${JSON.stringify(target)}: ${owners.join(', ')}.`
      : ` no active canonical owner declares target ${JSON.stringify(target)}.`;
  }

  const problems = [];
  for (const {filePath, anatomy, owner, target} of delegations) {
    const where = `${filePath}: theming anatomy ${JSON.stringify(anatomy)}.delegatesTo`;

    if (owner.startsWith('family:')) {
      const family = activeFamilies.get(owner);
      if (!family) {
        problems.push(
          `${where}: owner ${JSON.stringify(owner)} does not resolve to an active family record (target ${JSON.stringify(target)}).`,
        );
        continue;
      }

      const memberOwners = new Set(family.members);
      const matchingMembers = [
        ...(ownersByTarget.get(target) ?? new Set()),
      ].filter(member => memberOwners.has(member));
      if (matchingMembers.length === 0) {
        problems.push(
          `${where}: target ${JSON.stringify(target)} is not an active canonical target of any component in ${JSON.stringify(owner)} members (${family.filePath});${targetOwnership(target)}`,
        );
      }
      continue;
    }

    const ownedTargets = targetsByOwner.get(owner);
    if (!ownedTargets) {
      problems.push(
        `${where}: owner ${JSON.stringify(owner)} does not exist in the canonical active component target inventory;${targetOwnership(target)}`,
      );
      continue;
    }
    if (!ownedTargets.has(target)) {
      const available = [...ownedTargets]
        .sort()
        .map(value => JSON.stringify(value))
        .join(', ');
      problems.push(
        `${where}: target ${JSON.stringify(target)} is not an active target owned by ${JSON.stringify(owner)}; active targets for that owner: ${available};${targetOwnership(target)}`,
      );
    }
  }
  return problems;
}

function loadComponentContract(root, specPath, componentName) {
  const location = componentRecordLocation(root, specPath);
  if (!location) {
    return {
      problem: `${path.relative(root, specPath)}: component record is outside a component root.`,
    };
  }
  const directory = path.join(root, location.codeDirectory);
  for (const docPath of matchingFiles(directory, name =>
    name.endsWith('.doc.mjs'),
  )) {
    let mod;
    try {
      mod = require(docPath);
    } catch (error) {
      return {
        problem: `${path.relative(root, docPath)}: could not load component doc (${error.message}).`,
      };
    }
    const doc = mod.docs ?? mod.default;
    if (!doc) continue;
    const candidates = [doc, ...(doc.components ?? [])];
    const candidate = candidates.find(
      entry => entry?.name?.replace(/^XDS/, '') === componentName,
    );
    if (!candidate) continue;
    const anatomy = candidate.usage?.anatomy ?? doc.usage?.anatomy;
    if (!Array.isArray(anatomy)) {
      return {
        problem: `${path.relative(root, docPath)}: ${componentName} has no canonical English usage.anatomy.`,
      };
    }
    const targets = (
      candidate.theming?.targets ??
      doc.theming?.targets ??
      []
    ).map(target => target.className.replace(/^astryx-/, ''));
    return {
      contract: {
        anatomy: anatomy.map(part => part.name),
        targets,
      },
    };
  }
  return {
    problem: `${path.relative(root, specPath)}: no component doc for ${componentName}.`,
  };
}

function loadModuleContract(root, specPath, moduleName) {
  const location = componentRecordLocation(root, specPath);
  if (!location) {
    return {
      problem: `${path.relative(root, specPath)}: module record is outside a component root.`,
    };
  }

  const candidates = [];
  for (const docPath of matchingFilesRecursively(
    location.componentSourcePath,
    name => name.endsWith('.doc.mjs'),
    {skipDirectory: isIgnoredComponentKnowledgeSegment},
  )) {
    let mod;
    try {
      mod = require(docPath);
    } catch (error) {
      return {
        problem: `${path.relative(root, docPath)}: could not load component doc (${error.message}).`,
      };
    }
    const doc = mod.docs ?? mod.default;
    if (!doc) continue;
    if (doc.name?.replace(/^XDS/, '') === moduleName) {
      candidates.push({docPath, doc});
    }
    for (const entry of doc.components ?? []) {
      if (
        entry?.name?.replace(/^XDS/, '') === moduleName &&
        isFullConsumerDocEntry(entry)
      ) {
        candidates.push({docPath, doc: entry});
      }
    }
  }

  if (candidates.length === 0) {
    return {
      problem: `${path.relative(root, specPath)}: no exact consumer doc entry for module ${moduleName}.`,
    };
  }
  if (candidates.length > 1) {
    return {
      problem: `${path.relative(root, specPath)}: module ${moduleName} has multiple consumer doc entries (${candidates.map(candidate => path.relative(root, candidate.docPath)).join(', ')}).`,
    };
  }

  const [{docPath, doc}] = candidates;
  if (!Array.isArray(doc.usage?.anatomy)) {
    return {
      problem: `${path.relative(root, docPath)}: ${moduleName} has no canonical English usage.anatomy; module records never inherit parent aggregate anatomy.`,
    };
  }
  const targets = (doc.theming?.targets ?? []).map(target =>
    target.className.replace(/^astryx-/, ''),
  );
  return {
    contract: {
      anatomy: doc.usage.anatomy.map(part => part.name),
      targets,
    },
  };
}

function validateAgainstSchema(
  document,
  schema,
  schemaPath,
  filePath,
  isTemplate,
  currentTemplateVersion,
  designApprovalOwners = [],
  engineeringApprovalOwners = [],
) {
  const problems = [...document.problems];
  const {frontmatter, sections} = document;
  const kind = frontmatter.get('kind');
  const kindSchema = schema.kinds[kind];

  if (!kindSchema) {
    problems.push(
      `${filePath}: unknown knowledge kind ${JSON.stringify(kind)}.`,
    );
    return problems;
  }

  for (const field of kindSchema.requiredFrontmatter) {
    if (!frontmatter.has(field))
      problems.push(`${filePath}: missing frontmatter field ${field}.`);
  }
  for (const section of kindSchema.requiredSections) {
    if (!sections.includes(section))
      problems.push(`${filePath}: missing section "${section}".`);
  }

  const templateVersion = frontmatter.get('template_version');
  if (!Number.isInteger(templateVersion) || templateVersion < 1) {
    problems.push(`${filePath}: template_version must be a positive integer.`);
  } else if (templateVersion > currentTemplateVersion) {
    problems.push(
      `${filePath}: template_version ${templateVersion} is newer than ${currentTemplateVersion}.`,
    );
  }

  const schemaVersion = frontmatter.get('schema_version');
  if (schemaVersion !== schema.schemaVersion) {
    problems.push(
      `${filePath}: schema_version ${JSON.stringify(schemaVersion)} does not match ${schema.schemaVersion} from ${schemaPath}.`,
    );
  }

  for (const field of kindSchema.listFields ?? []) {
    if (!Array.isArray(frontmatter.get(field))) {
      problems.push(`${filePath}: ${field} must be a list.`);
    }
  }

  if (isTemplate) {
    if (templateVersion !== currentTemplateVersion) {
      problems.push(
        `${filePath}: template_version must equal ${currentTemplateVersion}.`,
      );
    }
    const extraFields = [...frontmatter.keys()].filter(
      field => !kindSchema.requiredFrontmatter.includes(field),
    );
    if (extraFields.length) {
      problems.push(
        `${filePath}: template fields are missing from the schema: ${extraFields.join(', ')}.`,
      );
    }
    const expectedSections = expectedTemplateSections(
      kind,
      kindSchema.requiredSections,
    );
    if (JSON.stringify(sections) !== JSON.stringify(expectedSections)) {
      problems.push(
        `${filePath}: template section order must exactly match the schema plus its allowed editorial sections; bump the schema and migrate active records for any other structural change.`,
      );
    }
    return problems;
  }

  for (const field of kindSchema.requiredNonEmptyStringFields ?? []) {
    const value = frontmatter.get(field);
    if (typeof value !== 'string' || value.trim().length === 0) {
      problems.push(`${filePath}: ${field} must be a non-empty string.`);
    }
  }

  const id = frontmatter.get('id');
  if (
    kindSchema.idPattern &&
    (typeof id !== 'string' || !new RegExp(kindSchema.idPattern).test(id))
  ) {
    problems.push(
      `${filePath}: id must match ${JSON.stringify(kindSchema.idPattern)}.`,
    );
  }

  if (kindSchema.requiredFrontmatter.includes('owners')) {
    const owners = frontmatter.get('owners');
    if (!Array.isArray(owners) || owners.length === 0) {
      problems.push(`${filePath}: owners must be a non-empty inline list.`);
    }
  }

  const authority = frontmatter.get('authority');
  if (!schema.authorities.includes(authority)) {
    problems.push(
      `${filePath}: authority must be ${schema.authorities.join(', ')}.`,
    );
  }
  if (authority === 'current') {
    for (const field of kindSchema.currentNonEmptyFields ?? []) {
      const value = frontmatter.get(field);
      if (!Array.isArray(value) || value.length === 0) {
        problems.push(
          `${filePath}: current records require non-empty ${field}.`,
        );
      }
    }
    const approvedBy = frontmatter.get('approved_by');
    const approvedAt = frontmatter.get('approved_at');
    const authorizedOwners =
      kind === 'design' || kind === 'theme'
        ? [...new Set([...engineeringApprovalOwners, ...designApprovalOwners])]
        : engineeringApprovalOwners;
    if (!authorizedOwners.includes(approvedBy)) {
      problems.push(
        `${filePath}: current records require approved_by to name an authorized owner.`,
      );
    }
    if (
      typeof approvedAt !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(approvedAt)
    ) {
      problems.push(
        `${filePath}: current records require approved_at as YYYY-MM-DD.`,
      );
    }
  }
  if (authority === 'archived') {
    const reason = frontmatter.get('archive_reason');
    if (!schema.archiveReasons.includes(reason)) {
      problems.push(
        `${filePath}: archived records require archive_reason (${schema.archiveReasons.join(', ')}).`,
      );
    }
    if (reason === 'superseded' && !frontmatter.get('superseded_by')) {
      problems.push(`${filePath}: superseded records require superseded_by.`);
    }
  }

  return problems;
}

export function validateSchemaEvolution(baseSchemas, currentSchemas) {
  const problems = [];
  let highestBaseVersion = -1;
  for (const [filePath, baseContent] of baseSchemas) {
    const match = filePath.match(/v([0-9]+)\.json$/);
    if (match)
      highestBaseVersion = Math.max(highestBaseVersion, Number(match[1]));
    if (!currentSchemas.has(filePath)) {
      problems.push(
        `${filePath}: versioned schemas are append-only and cannot be deleted.`,
      );
    } else if (currentSchemas.get(filePath) !== baseContent) {
      problems.push(
        `${filePath}: versioned schemas are immutable; add a new version and migrate active records.`,
      );
    }
  }
  for (const filePath of currentSchemas.keys()) {
    if (baseSchemas.has(filePath)) continue;
    const version = Number(filePath.match(/v([0-9]+)\.json$/)?.[1]);
    if (!Number.isInteger(version) || version <= highestBaseVersion) {
      problems.push(
        `${filePath}: new schema versions must be greater than ${highestBaseVersion}.`,
      );
    }
  }
  return problems;
}

function schemaFilesAtRevision(root, revision) {
  let output;
  try {
    output = execFileSync(
      'git',
      [
        '-C',
        root,
        'ls-tree',
        '-r',
        '--name-only',
        revision,
        '--',
        'docs/schemas/knowledge',
      ],
      {encoding: 'utf8'},
    );
  } catch (error) {
    throw new Error(`Could not read knowledge schemas at ${revision}.`, {
      cause: error,
    });
  }
  const schemas = new Map();
  for (const filePath of output
    .split(/\r?\n/)
    .filter(path => /^docs\/schemas\/knowledge\/v[0-9]+\.json$/.test(path))) {
    schemas.set(
      filePath,
      execFileSync('git', ['-C', root, 'show', `${revision}:${filePath}`], {
        encoding: 'utf8',
      }),
    );
  }
  return schemas;
}

function currentSchemaFiles(root) {
  return new Map(
    matchingFiles(path.join(root, 'docs/schemas/knowledge'), name =>
      /^v[0-9]+\.json$/.test(name),
    ).map(filePath => [
      path.relative(root, filePath),
      fs.readFileSync(filePath, 'utf8'),
    ]),
  );
}

export function composeKnowledgeSchemas(rawSchemas) {
  const composed = new Map();
  const latestKindVersions = new Map();

  function compose(version, stack = []) {
    if (composed.has(version)) return composed.get(version);
    const entry = rawSchemas.get(version);
    if (!entry) throw new Error(`Schema v${version} does not exist.`);
    if (stack.includes(version))
      throw new Error('Knowledge schema extends cycle.');
    const parentVersion = entry.schema.extends;
    const parent =
      parentVersion == null
        ? null
        : compose(parentVersion, [...stack, version]);
    const schema = parent
      ? {
          ...parent.schema,
          ...entry.schema,
          kinds: {...parent.schema.kinds, ...(entry.schema.kinds ?? {})},
        }
      : entry.schema;
    const result = {...entry, schema};
    composed.set(version, result);
    return result;
  }

  for (const version of [...rawSchemas.keys()].sort((a, b) => a - b)) {
    const entry = rawSchemas.get(version);
    compose(version);
    for (const kind of Object.keys(entry.schema.kinds ?? {})) {
      latestKindVersions.set(kind, version);
    }
  }
  return {schemas: composed, latestKindVersions};
}

export async function validateKnowledgeRoot(root = DEFAULT_ROOT) {
  const schemaDirectory = path.join(root, 'docs/schemas/knowledge');
  const rawSchemas = new Map(
    matchingFiles(schemaDirectory, name => /^v[0-9]+\.json$/.test(name)).map(
      schemaPath => {
        const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const fileVersion = Number(
          path.basename(schemaPath).match(/^v([0-9]+)\.json$/)[1],
        );
        if (schema.schemaVersion !== fileVersion) {
          throw new Error(
            `${path.relative(root, schemaPath)} declares schemaVersion ${schema.schemaVersion}; expected ${fileVersion}.`,
          );
        }
        return [schema.schemaVersion, {schema, schemaPath}];
      },
    ),
  );
  if (rawSchemas.size === 0)
    return ['docs/schemas/knowledge: no versioned schemas found.'];
  const {schemas, latestKindVersions} = composeKnowledgeSchemas(rawSchemas);
  const latestVersion = Math.max(...schemas.keys());
  const {schema} = schemas.get(latestVersion);
  const templateVersions = JSON.parse(
    fs.readFileSync(
      path.join(root, 'docs/templates/knowledge/versions.json'),
      'utf8',
    ),
  );
  const designOwnersPath = path.join(root, '.github/DESIGNOWNERS');
  const designApprovalOwners = fs.existsSync(designOwnersPath)
    ? parseOwnerFile(fs.readFileSync(designOwnersPath, 'utf8'))
    : [];
  const engineeringOwnersPath = path.join(root, '.github/ENGOWNERS');
  const engineeringApprovalOwners = fs.existsSync(engineeringOwnersPath)
    ? parseOwnerFile(fs.readFileSync(engineeringOwnersPath, 'utf8'))
    : [];
  const problems = [
    ...discoverThemeRecordCandidates(root).problems,
    ...discoverMisplacedComponentSpecs(root),
  ];
  const ids = new Map();
  const records = [];
  const delegations = [];
  const repositoryFiles = repositoryFileList(root);

  for (const [kind, kindSchema] of Object.entries(schema.kinds)) {
    const kindVersion = latestKindVersions.get(kind);
    const kindSchemaEntry = schemas.get(kindVersion);
    if (
      !Number.isInteger(templateVersions[kind]) ||
      templateVersions[kind] < 1
    ) {
      problems.push(
        `docs/templates/knowledge/versions.json: missing valid version for ${kind}.`,
      );
      continue;
    }
    const templatePath = path.join(root, kindSchema.template);
    if (!fs.existsSync(templatePath)) {
      problems.push(
        `${kindSchema.template}: template for ${kind} does not exist.`,
      );
      continue;
    }
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    const template = parseKnowledgeDocument(
      templateContent,
      kindSchema.template,
    );
    problems.push(
      ...validateAgainstSchema(
        template,
        kindSchemaEntry.schema,
        path.relative(root, kindSchemaEntry.schemaPath),
        kindSchema.template,
        true,
        templateVersions[kind],
        designApprovalOwners,
        engineeringApprovalOwners,
      ),
    );
    if (template.frontmatter.get('kind') !== kind) {
      problems.push(`${kindSchema.template}: template kind must be ${kind}.`);
    }
    if (kind === 'component' || kind === 'module') {
      const designDecisions = parseDesignDecisionsBlock(
        templateContent,
        kindSchema.template,
      );
      problems.push(
        ...validateDesignDecisionsBlock(designDecisions, {
          allowHeaderOnly: true,
          filePath: kindSchema.template,
        }),
      );
    }
  }

  for (const absolutePath of discoverKnowledgeRecords(root)) {
    const filePath = path.relative(root, absolutePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    const document = parseKnowledgeDocument(content, filePath);
    const pathApplicability = parsePathApplicabilityBlock(content, filePath);
    problems.push(
      ...pathApplicability.problems,
      ...validatePathApplicability(
        pathApplicability.config,
        filePath,
        repositoryFiles,
      ),
    );
    const reviewApplicability = parseReviewApplicabilityBlock(
      content,
      filePath,
    );
    problems.push(
      ...reviewApplicability.problems,
      ...validateReviewApplicability(
        reviewApplicability.config,
        content,
        filePath,
      ),
    );
    const recordVersion = document.frontmatter.get('schema_version');
    const versionedSchema = schemas.get(recordVersion);
    if (!versionedSchema) {
      problems.push(
        `${filePath}: schema_version ${JSON.stringify(recordVersion)} has no schema file.`,
      );
      continue;
    }
    problems.push(
      ...validateAgainstSchema(
        document,
        versionedSchema.schema,
        path.relative(root, versionedSchema.schemaPath),
        filePath,
        false,
        templateVersions[document.frontmatter.get('kind')],
        designApprovalOwners,
        engineeringApprovalOwners,
      ),
    );
    const authority = document.frontmatter.get('authority');
    const isActiveRecord =
      versionedSchema.schema.activeAuthorities.includes(authority);
    const kind = document.frontmatter.get('kind');
    const latestKindVersion = latestKindVersions.get(kind);
    if (isActiveRecord && recordVersion !== latestKindVersion) {
      problems.push(
        `${filePath}: active ${kind} records must use latest schema_version ${latestKindVersion} for that kind.`,
      );
    }
    if (kind === 'component' || kind === 'module') {
      const designDecisions = parseDesignDecisionsBlock(content, filePath);
      problems.push(
        ...validateDesignDecisionsBlock(designDecisions, {filePath}),
      );
      const parsed = parseAnatomyThemingBlock(content, filePath);
      problems.push(...parsed.problems);
      if (parsed.mapping != null) {
        if (isActiveRecord) {
          delegations.push(...collectDelegations(parsed.mapping, filePath));
        }
        const recordName = String(document.frontmatter.get('id') ?? '')
          .replace(/^(?:component|module):/, '')
          .split('/')
          .at(-1);
        const loaded =
          kind === 'module'
            ? loadModuleContract(root, absolutePath, recordName)
            : loadComponentContract(root, absolutePath, recordName);
        if (loaded.problem) {
          problems.push(loaded.problem);
        } else {
          problems.push(
            ...validateAnatomyThemingMap(
              parsed.mapping,
              loaded.contract,
              filePath,
            ),
          );
        }
      }
    }
    const id = document.frontmatter.get('id');
    if (id) {
      if (ids.has(id))
        problems.push(
          `${filePath}: duplicate id ${id}; first declared in ${ids.get(id).filePath}.`,
        );
      else {
        ids.set(id, {
          filePath,
          authority: document.frontmatter.get('authority'),
        });
      }
    }
    records.push({filePath, absolutePath, document});
  }

  problems.push(
    ...validateComponentModuleRelationships(
      root,
      records,
      schema.activeAuthorities,
    ),
  );

  if (delegations.length > 0) {
    const activeFamilies = new Map();
    for (const {filePath, document} of records) {
      const authority = document.frontmatter.get('authority');
      if (
        document.frontmatter.get('kind') !== 'family' ||
        !schema.activeAuthorities.includes(authority)
      )
        continue;
      const id = document.frontmatter.get('id');
      const members = document.frontmatter.get('members');
      if (typeof id !== 'string' || !Array.isArray(members)) continue;
      if (!activeFamilies.has(id)) activeFamilies.set(id, {filePath, members});
    }

    const canonicalTargets = await collectThemingTargets(
      path.join(root, 'packages/core/src'),
    );
    problems.push(
      ...validateDelegations(delegations, canonicalTargets, activeFamilies),
    );
  }

  for (const {filePath, document} of records) {
    if (document.frontmatter.get('authority') !== 'current') continue;
    const kindSchema = schema.kinds[document.frontmatter.get('kind')];
    for (const field of kindSchema.referenceFields ?? []) {
      const references = document.frontmatter.get(field);
      if (!Array.isArray(references)) continue;
      for (const reference of references) {
        const targetId = reference.replace(/\/DEC-[0-9]+$/, '');
        const target = ids.get(targetId);
        if (!target) {
          problems.push(
            `${filePath}: ${field} reference ${reference} does not resolve.`,
          );
        } else if (target.authority !== 'current') {
          problems.push(
            `${filePath}: current records may not rely on non-current ${reference} (${target.filePath}).`,
          );
        }
      }
    }
  }

  if (repositoryFiles) {
    const {loadKnowledgeIndex, findUnreachedRecords} =
      await import('./specs-for-file.mjs');
    for (const record of findUnreachedRecords(
      loadKnowledgeIndex(root),
      repositoryFiles,
    )) {
      problems.push(
        `${record.path}: current record ${record.id} is not reached from any repository path that is not itself a record (INV25). Link it through placement, applies_to, verified_by, a membership or consumer-doc id, a cited spec number, or a path-applicability:v1 block.`,
      );
    }
  }

  return problems;
}

async function main() {
  if (!repositoryFileList(DEFAULT_ROOT)) {
    console.warn(
      'Skipped the INV25 reachability and path-pattern match checks: `git ls-files` is unavailable here.',
    );
  }
  const problems = await validateKnowledgeRoot();
  const baseIndex = process.argv.indexOf('--base');
  if (baseIndex !== -1) {
    const baseRevision = process.argv[baseIndex + 1];
    if (!baseRevision) throw new Error('--base requires a revision.');
    problems.push(
      ...validateSchemaEvolution(
        schemaFilesAtRevision(DEFAULT_ROOT, baseRevision),
        currentSchemaFiles(DEFAULT_ROOT),
      ),
    );
  }
  if (problems.length) {
    console.error(`Knowledge validation failed (${problems.length}):\n`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }
  console.log('Knowledge templates and records are aligned.');
}

// Not a top-level await: validation imports scripts/specs-for-file.mjs, which
// imports this module back, and that import must find it fully evaluated.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
