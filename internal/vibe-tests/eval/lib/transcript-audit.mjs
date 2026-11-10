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

const BLOCKED_TOOLS = new Set(['WebFetch', 'WebSearch', 'Task']);

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

/** Removes heredoc bodies: they hold file content, not paths the shell opens. */
export function stripHeredocs(command) {
  return command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\n|$)/g, '');
}

const PATH_PATTERN =
  /(?:^|[\s'"=:(<>])((?:\/[\w.-]|~\/|\$HOME\/|\.\.(?:\/|(?=[\s;&|)]|$)))[^\s'"`;|&)<>]*)/g;

/** Absolute, home-relative and parent-relative paths named in one shell segment. */
export function pathsInCommand(command) {
  return [...command.matchAll(PATH_PATTERN)].map(match => match[1]);
}

/**
 * Paths a shell command names, each resolved from the folder the shell is in
 * at that point. `cd` moves that folder for the segments after it. The agent's
 * shell keeps its folder between commands, but returns to the workspace when a
 * command leaves it.
 * @returns {{found: {raw: string, resolved: string}[], cwd: string}}
 */
export function resolveCommandPaths(command, workspace, startCwd = workspace) {
  let cwd = startCwd;
  const found = [];
  for (const segment of stripHeredocs(command).split(/&&|\|\||;|\n/)) {
    const trimmed = segment.trim();
    const cd = /^cd\s+(['"]?)([^'"\s]+)\1\s*$/.exec(trimmed);
    for (const raw of pathsInCommand(trimmed)) {
      found.push({raw, resolved: path.resolve(cwd, raw)});
    }
    if (cd && !cd[2].startsWith('~') && !cd[2].startsWith('$')) cwd = path.resolve(cwd, cd[2]);
  }
  return {found, cwd: isInside(cwd, workspace) ? cwd : workspace};
}

function isInside(candidate, workspace) {
  const relative = path.relative(workspace, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/**
 * A path inside a sensitive root (the home folder, the repository with the
 * probes, other workspaces) is a violation. Any other outside path is a
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
  const check = (raw, tool, resolved = path.resolve(workspace, raw)) => {
    const fromHome = /^(~|\$HOME)\//.exec(raw);
    if (fromHome) resolved = path.join(home, raw.slice(fromHome[0].length));
    if (isInside(resolved, ownSession)) return;
    if (fromHome) {
      violations.push({tool, path: raw});
      return;
    }
    if (isInside(resolved, workspace)) return;
    if (sensitiveRoots.some(root => isInside(resolved, root))) {
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
    if (use.name === 'Glob' && typeof input.pattern === 'string' && /^(\/|~|\.\.)/.test(input.pattern)) {
      check(input.pattern, use.name);
    }
    if (typeof input.command === 'string') {
      const {found, cwd} = resolveCommandPaths(input.command, workspace, shellCwd);
      for (const {raw, resolved} of found) check(raw, use.name, resolved);
      shellCwd = cwd;
      if (/\b(astryx|shadcn)\b/.test(input.command)) docsCommands.push(input.command.slice(0, 200));
    }
  }
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return {tools, toolCalls, violations, warnings, docsCommands};
}
