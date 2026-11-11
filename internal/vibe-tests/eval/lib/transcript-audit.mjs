// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads an agent transcript and lists every path outside the workspace.
 * @input stream JSON transcript lines and the workspace's real path
 * @output tool counts, docs commands, violations and warnings
 * @position Called by run.mjs after each agent run
 */

import os from 'node:os';
import path from 'node:path';

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

/**
 * Splits heredoc bodies from the shell text. A body that is file content, such
 * as `cat > App.tsx <<'EOF'`, is dropped. A body that an interpreter runs is
 * code, so it is returned for a separate scan. The marker line stays in the
 * shell text, so its redirect is audited.
 * @returns {{shell: string, code: string[]}}
 */
export function splitHeredocs(command) {
  const code = [];
  const shell = command.replace(
    /([^\n]*)<<-?\s*(['"]?)(\w+)\2([^\n]*)\n([\s\S]*?)\n\s*\3(?=\n|$)/g,
    (_whole, before, _quote, _marker, after, body) => {
      if (INTERPRETER.test(before)) code.push(body);
      return `${before} ${after}`;
    },
  );
  return {shell, code};
}

/** In code, a path is a string literal, so division and comments are not paths. */
const CODE_PATH_PATTERN = /(['"`])((?:\/|~\/|\$HOME\/|\.\.\/)[^'"`\s]*)\1/g;

const HOME_PREFIX = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/;
const PATH_PATTERN =
  /(?:^|[\s'"=:(<>])((?:\/(?=[\w.-]|[\s;&|)'"]|$)|(?:~|\$HOME|\$\{HOME\})(?=[\/\s;&|)'"]|$)|\.\.(?=[\/\s;&|)'"]|$))[^\s'"`;|&)<>]*)/g;

/** Absolute, home-relative and parent-relative paths named in one shell segment. */
export function pathsInCommand(command) {
  return [...command.matchAll(PATH_PATTERN)].map(match => match[1]);
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
 * @returns {{found: {raw: string, resolved: string}[], cwd: string}}
 */
export function resolveCommandPaths(command, workspace, startCwd = workspace, home = os.homedir()) {
  let cwd = startCwd;
  const found = [];
  const {shell, code} = splitHeredocs(command);
  for (const segment of shell.split(/&&|\|\||;|\n/)) {
    const trimmed = segment.trim();
    for (const raw of pathsInCommand(trimmed)) found.push({raw, resolved: resolveRaw(raw, cwd, home)});
    const cd = /^cd(?:\s+(['"]?)([^'"\s]+)\1)?\s*$/.exec(trimmed);
    if (!cd) continue;
    const target = cd[2] ?? '~';
    // Other variables are unknown, so the folder stays where it was.
    if (!target.startsWith('$') || HOME_PREFIX.test(target)) cwd = resolveRaw(target, cwd, home);
  }
  for (const body of code) {
    for (const match of body.matchAll(CODE_PATH_PATTERN)) found.push({raw: match[2], resolved: resolveRaw(match[2], cwd, home)});
  }
  return {found, cwd: isInside(cwd, workspace) ? cwd : workspace};
}

function isInside(candidate, workspace) {
  const relative = path.relative(workspace, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * A path inside a sensitive root (the home folder, the repository with the
 * probes, other runs), or a folder that holds one, is a violation. Any other outside path is a
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
  const check = (raw, tool, resolved = resolveRaw(raw, workspace, home)) => {
    if (isInside(resolved, ownSession)) return;
    if (HOME_PREFIX.test(raw)) {
      violations.push({tool, path: raw});
      return;
    }
    if (isInside(resolved, workspace)) return;
    // A folder that holds a sensitive root reaches it too, for example `find / -name …`.
    if (sensitiveRoots.some(root => isInside(resolved, root) || isInside(root, resolved))) {
      violations.push({tool, path: raw});
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
      if (typeof input[key] === 'string') check(input[key], use.name);
    }
    if (use.name === 'Glob' && typeof input.pattern === 'string' && /^(\/|~|\$HOME|\$\{HOME\}|\.\.)/.test(input.pattern)) {
      check(input.pattern, use.name);
    }
    if (typeof input.command === 'string') {
      const {found, cwd} = resolveCommandPaths(input.command, workspace, shellCwd, home);
      for (const {raw, resolved} of found) check(raw, use.name, resolved);
      shellCwd = cwd;
      if (/\b(astryx|shadcn)\b/.test(input.command)) docsCommands.push(input.command.slice(0, 200));
    }
  }
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return {tools, toolCalls, violations, warnings, docsCommands};
}
