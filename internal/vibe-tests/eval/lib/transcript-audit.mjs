// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads an agent transcript and lists every path outside the workspace.
 * @input stream JSON transcript lines and the workspace's real path
 * @output tool counts, docs commands, violations and warnings
 * @position A run with any violation fails integrity
 */

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

/** Absolute, home-relative and parent-relative paths named in a command. */
export function pathsInCommand(command) {
  const found = [];
  const pattern =
    /(?:^|[\s'"=:(])((?:\/[\w.-]|~\/|\$HOME\/|\.\.\/)[^\s'"`;|&)<>]*)/g;
  for (const match of command.matchAll(pattern)) found.push(match[1]);
  return found;
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
export function auditTranscript(lines, workspace, sensitiveRoots = []) {
  const violations = [];
  const warnings = [];
  const docsCommands = [];
  const tools = {};
  const check = (raw, tool) => {
    if (raw.startsWith('~/') || raw.startsWith('$HOME/')) {
      violations.push({tool, path: raw});
      return;
    }
    const resolved = path.resolve(workspace, raw);
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
    if (typeof input.command === 'string') {
      for (const raw of pathsInCommand(input.command)) check(raw, use.name);
      if (/\b(astryx|shadcn)\b/.test(input.command)) docsCommands.push(input.command.slice(0, 200));
    }
  }
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return {tools, toolCalls, violations, warnings, docsCommands};
}
