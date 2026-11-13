// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads an agent transcript and lists every path outside the workspace.
 * @input stream JSON transcript lines and the workspace's real path
 * @output tool counts, docs commands, violations and warnings
 * @position Called by run.mjs after each agent run
 */

import os from 'node:os';
import path from 'node:path';
import {isInside} from './workspace.mjs';

/** System locations an agent may name without reading project data. */
const ALLOWED_PREFIXES = ['/dev/null', '/dev/stdout', '/dev/stderr', '/usr/', '/bin/', '/etc/', '/lib', '/proc/self/'];

const BLOCKED_TOOLS = new Set(['WebFetch', 'WebSearch', 'Task', 'Agent']);

function* toolUses(lines) {
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const content = event?.message?.content;
    if (event.type !== 'assistant' || !Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'tool_use') yield block;
    }
  }
}

/** Programs that run a heredoc body as code, so the body is audited too. */
const INTERPRETER = /(?:^|[\s|;&(])(?:python3?|node|deno|bun|tsx|bash|sh|zsh|ruby|perl)(?=[\s<]|$)/;
const SHELL = /(?:^|[\s|;&(])(?:bash|sh|zsh)(?=[\s<]|$)/;

/**
 * Splits heredoc bodies from the shell text. A body that is file content, such
 * as `cat > App.tsx <<'EOF'`, is dropped. A body that a shell runs stays in
 * the shell text. A body that another interpreter runs is code, so it is
 * returned for a separate scan. The marker line stays, so its redirect is
 * audited.
 * @returns {{shell: string, code: string[]}}
 */
export function splitHeredocs(command) {
  const code = [];
  const shell = command.replace(
    /([^\n]*)<<-?\s*(['"]?)(\w+)\2([^\n]*)\n([\s\S]*?)\n\s*\3(?=\n|$)/g,
    (_whole, before, quote, _marker, after, body) => {
      const runner = `${before} ${after}`;
      if (SHELL.test(runner)) return `${runner}\n${body}`;
      if (INTERPRETER.test(runner)) code.push(body);
      // The shell runs command substitutions in an unquoted heredoc body.
      if (!quote) {
        // An escaped `\$(` or backtick is literal text, so it does not run.
        const substitutions = [...body.matchAll(/(?<!\\)\$\(([^)]*)\)|(?<!\\)`([^`]*)`/g)].map(match => match[1] ?? match[2]);
        if (substitutions.length > 0) return `${runner}\n${substitutions.join('\n')}`;
      }
      return runner;
    },
  );
  return {shell, code};
}

/** In code, a path is a string literal, so division, comments and a lone '/' are not paths. */
const CODE_PATH_PATTERN = /(['"`])((?:\/[^'"`\s/]|~\/|\$HOME\/|\.\.\/)[^'"`\s]*)\1/g;

const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/;
const PATH_PATTERN =
  /(?:^|[\s'"=:(<>])((?:\/(?=[\w.-]|[\s;&|)'"]|$)|(?:~|\$HOME|\$\{HOME\})(?=[\/\s;&|)'"]|$)|\.\.(?=[\/\s;&|)'"]|$))[^\s'"`;|&)<>]*)/g;

/** Absolute, home-relative and parent-relative paths named in one shell segment. */
export function pathsInCommand(command) {
  return [...command.matchAll(PATH_PATTERN)]
    .filter(match => !(match[1] === '/' && /['"]/.test(match[0][0])))
    .map(match => match[1]);
}

/**
 * Other arguments of a segment, which the shell resolves from its folder.
 * Inside the workspace only words that look like paths count; outside it every
 * word does, because `cat notes` then reads a file outside.
 */
function relativeWords(segment, outside) {
  return segment
    .split(/\s+/)
    .slice(1)
    .map(word => word.replace(/^\d*[<>]+&?/, '').replace(/^['"]|['"]$/g, ''))
    .filter(word => word && !word.startsWith('-') && !/^(?:\/|~|\$|\.\.)/.test(word) && (outside || /[./]/.test(word)));
}

/** Commands that read every file below their target, not only the names. */
const SEARCHER = /(?:^|[\s|;&(])(rg|ag|ack|[efz]?grep)(?=\s|$)/;
const RECURSIVE_READER =
  /(?:^|[\s|;&(])(?:rg|ag|ack|[efz]?grep\s+(?:[^|]*\s)?(?:-[A-Za-z]*[rR][A-Za-z]*|--recursive|--dereference-recursive))(?=\s|$)|(?:\$\(|`)\s*find\s|\bfind\s[^|]*(?:-exec|-execdir|-ok)\b|\bfind\s.*\|\s*xargs\b/;

/** Commands whose quoted arguments are text: a sed script or a search pattern. */
const TEXT_COMMAND =
  /(?:^(?:\w+=\S*\s+)*(?:xargs\s[^|]*?)?|\s-exec(?:dir)?\s+)(sed|[efz]?grep|rg|ag|ack|git\s+grep)(?=\s|$)/;

/** Options that take the next word as their value, per command. */
const VALUE_OPTIONS = {
  sed: ['-e', '-f', '-l', '--expression', '--file'],
  grep: ['-e', '-f', '-A', '-B', '-C', '-m', '-d', '-D', '--regexp', '--file', '--context', '--max-count', '--include', '--exclude', '--exclude-dir'],
  rg: ['-e', '-f', '-g', '-t', '-T', '-A', '-B', '-C', '-m', '-j', '-M', '--regexp', '--file', '--glob', '--iglob', '--type', '--type-not', '--max-count', '--max-depth'],
  ag: ['-G', '-A', '-B', '-C', '-m', '--ignore', '--file-search-regex'],
  ack: ['-A', '-B', '-C', '-m', '--type', '--ignore-dir'],
};
const PATTERN_OPTIONS = new Set(['-e', '--regexp', '--expression']);

/** Splits a segment at pipes that are outside quotes. */
function pipelineStages(segment) {
  const stages = [];
  let quote = null;
  let start = 0;
  for (let index = 0; index < segment.length; index++) {
    const char = segment[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '|') {
      stages.push(segment.slice(start, index));
      start = index + 1;
    }
  }
  stages.push(segment.slice(start));
  return stages;
}

/**
 * Words of a command line with their positions, keeping quoted text together.
 * @returns {{text: string, start: number, end: number}[]}
 */
function shellWords(text) {
  return [...text.matchAll(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g)].map(match => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * In a pipeline stage that runs sed or a search command (also through `xargs`
 * or `find -exec`), blanks the script or pattern when it is quoted text that
 * holds a space, a `|` or a nested quote, so `'../lib'` inside it is not a path.
 * The script or pattern is the value of `-e`, or else the first word that is not
 * an option or an option's value. Paths and option values stay audited.
 */
function textAsText(segment) {
  return pipelineStages(segment)
    .map(stage => {
      const lead = /^\s*/.exec(stage)[0];
      const match = TEXT_COMMAND.exec(stage.slice(lead.length));
      if (!match) return stage;
      const command = match[1].startsWith('git') ? 'grep' : match[1].replace(/^[efz](?=grep)/, '');
      const takesValue = new Set(VALUE_OPTIONS[command] ?? []);
      const at = lead.length + match.index + match[0].length;
      const words = shellWords(stage.slice(at));
      const scripts = [];
      let positional = null;
      for (let index = 0; index < words.length; index++) {
        const word = words[index].text;
        if (word === '--') {
          positional ??= words[index + 1] ?? null;
          break;
        }
        if (word.startsWith('-')) {
          if (takesValue.has(word) && index + 1 < words.length) {
            if (PATTERN_OPTIONS.has(word)) scripts.push(words[index + 1]);
            index++;
          }
          continue;
        }
        positional ??= words[index];
        break;
      }
      if (scripts.length === 0 && positional) scripts.push(positional);
      let rest = stage.slice(at);
      for (const word of scripts.sort((a, b) => b.start - a.start)) {
        const quoted = /^(["'])([\s\S]*)\1$/.exec(word.text);
        if (quoted && /[\s|'"]/.test(quoted[2])) rest = `${rest.slice(0, word.start)}""${rest.slice(word.end)}`;
      }
      return stage.slice(0, at) + rest;
    })
    .join('|');
}

/** The search pattern of a grep-like command, which is text, not a path it reads. */
function searchPattern(segment) {
  const match = SEARCHER.exec(segment);
  if (!match) return null;
  const words = segment.slice(match.index + match[0].length).trim().split(/\s+/);
  if (words.some(word => word === '-e' || word.startsWith('--regexp') || word === '-f')) return null;
  const pattern = words.find(word => word && !word.startsWith('-'));
  return pattern ? pattern.replace(/^['"]|['"]$/g, '') : null;
}

/** Resolves a raw path from the shell folder, expanding the home folder forms. */
export function resolveRaw(raw, cwd, home) {
  const fromHome = HOME_PREFIX.exec(raw);
  return fromHome ? path.join(home, raw.slice(fromHome[0].length)) : path.resolve(cwd, raw);
}

/**
 * Paths a shell command names, each resolved from the folder the shell is in
 * at that point. `cd` moves that folder for the segments after it. The agent's
 * shell keeps its folder between commands, but returns to the workspace when a
 * command leaves it.
 * @returns {{found: {raw: string, resolved: string | null, relative?: boolean, recursive?: boolean, unknown?: boolean}[], cwd: string}}
 */
export function resolveCommandPaths(command, workspace, startCwd = workspace, home = os.homedir()) {
  let cwd = startCwd;
  const found = [];
  const {shell, code} = splitHeredocs(command);
  for (const segment of shell.split(/&&|\|\||;|\n/)) {
    const trimmed = textAsText(segment.trim());
    const recursive = RECURSIVE_READER.test(trimmed);
    const pattern = recursive ? searchPattern(trimmed) : null;
    for (const raw of pathsInCommand(trimmed)) {
      found.push({raw, resolved: resolveRaw(raw, cwd, home), recursive: recursive && raw !== pattern});
    }
    for (const raw of relativeWords(trimmed, !isInside(cwd, workspace))) {
      if (raw !== pattern) found.push({raw, resolved: path.resolve(cwd, raw), relative: true, recursive});
    }
    // Which words are operands, redirects or option values is not reliable, so a
    // recursive reader always counts as searching the shell folder too. This fails
    // closed: a search run from a folder that holds a root fails even with its own path.
    if (recursive) found.push({raw: '.', resolved: cwd, relative: true, recursive});
    const cd = /^cd(?:\s+(['"]?)([^'"\s]+)\1)?\s*$/.exec(trimmed);
    if (!cd) continue;
    const target = cd[2] ?? '~';
    if (!target.startsWith('$') || HOME_PREFIX.test(target)) cwd = resolveRaw(target, cwd, home);
    // Another variable is unknown, so the folder stays where it was and a person reviews the move.
    else found.push({raw: target, resolved: null, unknown: true});
  }
  for (const body of code) {
    for (const match of body.matchAll(CODE_PATH_PATTERN)) found.push({raw: match[2], resolved: resolveRaw(match[2], cwd, home)});
  }
  return {found, cwd: isInside(cwd, workspace) ? cwd : workspace};
}

/**
 * A path inside a sensitive root (the home folder, the repository with the
 * probes, other runs) is a violation, and so is a recursive read (`grep -r`,
 * `rg`, `find -exec`, the Grep tool) of a root or a folder that holds one.
 * Only naming a root or such a folder (`ls ~`, `find / -name`) is a warning. Any other outside path is a
 * warning to review: a command can name a path without reading it.
 * @param {string[]} lines
 * @param {string} workspace real path of the workspace
 * @param {string[]} sensitiveRoots
 */
export function auditTranscript(lines, workspace, sensitiveRoots = [], home = os.homedir()) {
  const violations = [];
  const warnings = [];
  const docsCommands = [];
  const tools = {};
  // The agent saves long tool output in its own session folder and reads it back.
  const ownSession = path.join(home, '.claude', 'projects', workspace.replace(/[^A-Za-z0-9]/g, '-'));
  let shellCwd = workspace;
  const check = (raw, tool, resolved = resolveRaw(raw, workspace, home), {relative = false, recursive = false} = {}) => {
    if (isInside(resolved, ownSession) || isInside(resolved, workspace)) return;
    // A recursive reader of a root, or of a folder above one, reads the files inside it.
    const holds = root => isInside(root, resolved);
    const reads = sensitiveRoots.some(root => (resolved !== root && isInside(resolved, root)) || (recursive && holds(root)));
    if (reads || (HOME_PREFIX.test(raw) && path.resolve(resolved) !== path.resolve(home))) {
      violations.push({tool, path: raw});
      return;
    }
    // A plain word is reported only when it reads a sensitive file.
    if (relative) return;
    // Naming a root or a folder that holds one, for example `find /` or `echo $HOME`, reads nothing yet.
    if (sensitiveRoots.some(root => isInside(root, resolved)) || resolved === path.resolve(home)) {
      warnings.push({tool, path: raw});
      return;
    }
    if (ALLOWED_PREFIXES.some(prefix => resolved.startsWith(prefix))) return;
    warnings.push({tool, path: raw});
  };

  for (const use of toolUses(lines)) {
    tools[use.name] = (tools[use.name] ?? 0) + 1;
    if (BLOCKED_TOOLS.has(use.name)) {
      violations.push({tool: use.name, path: '(blocked tool)'});
      continue;
    }
    const input = use.input ?? {};
    for (const key of ['file_path', 'path', 'notebook_path']) {
      if (typeof input[key] === 'string') check(input[key], use.name, undefined, {recursive: use.name === 'Grep'});
    }
    if (use.name === 'Glob' && typeof input.pattern === 'string' && /^(\/|~|\$HOME|\$\{HOME\}|\.\.)/.test(input.pattern)) {
      check(input.pattern, use.name);
    }
    if (typeof input.command === 'string') {
      const {found, cwd} = resolveCommandPaths(input.command, workspace, shellCwd, home);
      for (const {raw, resolved, relative, recursive, unknown} of found) {
        if (unknown) warnings.push({tool: use.name, path: raw});
        else check(raw, use.name, resolved, {relative, recursive});
      }
      shellCwd = cwd;
      if (/\b(astryx|shadcn)\b/.test(input.command)) docsCommands.push(input.command.slice(0, 200));
    }
  }
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return {tools, toolCalls, violations, warnings, docsCommands};
}
