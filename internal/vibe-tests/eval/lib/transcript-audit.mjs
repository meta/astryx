// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Reads an agent transcript and lists every path outside the workspace.
 * @input stream JSON transcript lines and the workspace's real path
 * @output tool counts, docs commands, violations, warnings and temp-folder paths
 * @position Called by run.mjs after each agent run
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {givenAndRealPaths, isInside} from './workspace.mjs';

/** File commands that take their paths as written. Any other program can build a path at run time. */
const PLAIN_COMMAND = /^(?:cp|mv|cat|ls|rm|mkdir|touch|diff|cmp|head|tail|tee|echo|printf|cd)$/;

/** Where a path leads after links: the real path of its nearest existing folder, plus the rest. */
function linkTarget(file) {
  let existing = file;
  while (!fs.existsSync(existing) && path.dirname(existing) !== existing) existing = path.dirname(existing);
  return path.join(fs.realpathSync(existing), path.relative(existing, file));
}

/**
 * Whether the shell or an interpreter can change a path the audit read from a
 * command. A path is plain only when the command has no expansion, runs no
 * heredoc as code, and runs only plain file commands named as bare words; the
 * path holds path characters and no `..`; and each time it occurs it is a whole
 * word: bare, or in quotes that close right after it, with a word break on both
 * sides. Anything else can expand into a run.
 */
export function shellCanExpand(command, raw) {
  // splitHeredocs drops file content and keeps what the shell runs, so a
  // brace in a file the agent writes does not count as an expansion.
  const {shell, code} = splitHeredocs(command);
  if (code.length > 0 || /[$`{}]/.test(shell)) return true;
  if (!runsOnlyPlainCommands(shell)) return true;
  if (!/^[\w./+-]+$/.test(raw) || raw.split('/').includes('..')) return true;
  for (let at = command.indexOf(raw); at !== -1; at = command.indexOf(raw, at + 1)) {
    const opener = command[at - 1];
    let start = at;
    let end = at + raw.length;
    if (opener === "'" || opener === '"') {
      if (command[end] !== opener) return true;
      start -= 1;
      end += 1;
    } else if (/[\w./+-]/.test(command[end] ?? '')) {
      // A longer path that starts with this one; the audit checks it as its own path.
      continue;
    }
    if (start > 0 && !/[\s;|&()<>]/.test(command[start - 1])) return true;
    if (end < command.length && !/[\s;|&()<>]/.test(command[end])) return true;
  }
  return false;
}

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
 * as `cat > App.tsx <<'EOF'`, is dropped, except the command substitutions the
 * shell runs in an unquoted body. A body that a shell runs stays in
 * the shell text. A body that another interpreter runs is code, so it is
 * returned for a separate scan. The marker line stays, so its redirect is
 * audited.
 * @returns {{shell: string, code: string[]}}
 */
export function splitHeredocs(command) {
  const code = [];
  let shell = '';
  let last = 0;
  const heredoc = /([^\n]*)<<-?\s*(['"]?)(\w+)\2([^\n]*)\n([\s\S]*?)\n\s*\3(?=\n|$)/g;
  for (const match of command.matchAll(heredoc)) {
    const [whole, before, quote, , after, body] = match;
    shell += command.slice(last, match.index);
    last = match.index + whole.length;
    // Drop a body only when it is surely a heredoc and its reader is known.
    // A here-string (`<<<`), or a `<<` in a quote or comment open from the
    // start of the command, opens no heredoc, and a reader the audit does not
    // know can run the body, so those lines stay shell text.
    if (before.endsWith('<') || isQuotedOrCommented(shell + before)) {
      shell += whole;
      continue;
    }
    const runner = `${before} ${after}`;
    if (SHELL.test(runner)) {
      shell += `${runner}\n${body}`;
      continue;
    }
    if (INTERPRETER.test(runner)) code.push(body);
    else if (!runsOnlyPlainCommands(runner)) {
      shell += whole;
      continue;
    }
    // The shell runs command substitutions in an unquoted heredoc body. An odd
    // run of backslashes escapes `$(` or a backtick, so it does not run; an
    // even run is escaped backslashes, and the substitution runs.
    const substitutions = quote
      ? []
      : [...body.matchAll(/(\\*)(?:\$\(([^)]*)\)|`([^`]*)`)/g)]
          .filter(substitution => substitution[1].length % 2 === 0)
          .map(substitution => substitution[2] ?? substitution[3]);
    shell += substitutions.length > 0 ? `${runner}\n${substitutions.join('\n')}` : runner;
  }
  return {shell: shell + command.slice(last), code};
}

/**
 * Whether the end of `text` is inside an open quote or a `#` comment. A quote
 * can span lines, `$'…'` takes backslash escapes, and a comment starts at a
 * word start and ends at a newline.
 */
function isQuotedOrCommented(text) {
  let quote = null;
  let isComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (isComment) {
      if (char === '\n') isComment = false;
    } else if (quote === "'") {
      if (char === "'") quote = null;
    } else if (quote === '"' || quote === "$'") {
      if (char === '\\') i += 1;
      else if (char === quote.at(-1)) quote = null;
    } else if (char === '\\') {
      i += 1;
    } else if (char === '$' && text[i + 1] === "'") {
      quote = "$'";
      i += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '#' && (i === 0 || /[\s;&|()<>]/.test(text[i - 1]))) {
      isComment = true;
    }
  }
  return quote !== null || isComment;
}

/** Whether every program in shell text is a plain file command named as a bare word. */
function runsOnlyPlainCommands(text) {
  // A single `&` starts a new command, except in a redirect such as `2>&1` or `&>`.
  return text
    .split(/&&|\|\|?|;|(?<![<>])&(?!>)|\n|[()]/)
    .every(stage => {
      const program = stage.trim().split(/\s+/)[0];
      return !program || PLAIN_COMMAND.test(program);
    });
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
  /(?:^(?:\w+=\S*\s+)*(?:xargs\s(?:[^|]*?\s)?)?|\s-exec(?:dir)?\s+)(sed|[efz]?grep|rg|ag|ack|git\s+grep)(?=\s|$)/;

/**
 * How each command takes its options. `short` letters take a value (attached or
 * the next word), `attached` letters take only an attached value, `long` names
 * take a value, `script` options give the script or pattern, and `file` options
 * read it from a file, so no word is the pattern.
 */
const OPTION_SPECS = {
  sed: {short: 'efl', attached: 'i', long: ['expression', 'file', 'line-length'], script: ['e', 'expression'], file: ['f', 'file']},
  grep: {
    short: 'efABCmdD',
    attached: '',
    long: ['regexp', 'file', 'after-context', 'before-context', 'context', 'max-count', 'include', 'exclude', 'exclude-dir', 'exclude-from', 'label', 'devices', 'directories', 'binary-files', 'group-separator'],
    script: ['e', 'regexp'],
    file: ['f', 'file'],
  },
  rg: {
    short: 'efgtTABCdmjMrE',
    attached: '',
    long: ['regexp', 'file', 'glob', 'iglob', 'type', 'type-not', 'type-add', 'type-clear', 'after-context', 'before-context', 'context', 'max-count', 'max-depth', 'max-columns', 'threads', 'max-filesize', 'sort', 'sortr', 'replace', 'encoding', 'engine', 'color', 'colors', 'context-separator', 'field-context-separator', 'field-match-separator', 'path-separator', 'ignore-file', 'pre', 'pre-glob', 'dfa-size-limit', 'regex-size-limit', 'hostname-bin', 'hyperlink-format', 'generate'],
    script: ['e', 'regexp'],
    file: ['f', 'file', 'files', 'type-list'],
  },
  ag: {short: 'GgABCmp', attached: '', long: ['ignore', 'ignore-dir', 'file-search-regex', 'after', 'before', 'context', 'max-count', 'depth', 'path-to-ignore'], script: ['g'], file: []},
  ack: {short: 'ABCmtT', attached: '', long: ['type', 'type-add', 'type-set', 'type-del', 'ignore-dir', 'ignore-file', 'after-context', 'before-context', 'context', 'max-count', 'match'], script: ['match'], file: ['f', 'g']},
};

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
 * The words that hold the script or pattern of a sed or search command, from
 * the words after the command name. A word can hold it whole (`"from '../lib"`)
 * or after an attached option (`-e"…"`, `--regexp=…`).
 */
function scriptWords(words, spec) {
  const scripts = [];
  let fromFile = false;
  let positional = null;
  for (let index = 0; index < words.length; index++) {
    const word = words[index].text;
    if (word === '--') {
      positional ??= words[index + 1] ?? null;
      break;
    }
    const long = /^--([\w-]+)(=)?/.exec(word);
    if (long) {
      const [, name, attached] = long;
      if (spec.file.includes(name)) fromFile = true;
      if (spec.script.includes(name)) scripts.push(attached ? words[index] : words[index + 1]);
      if (!attached && spec.long.includes(name)) index++;
      continue;
    }
    if (/^-[^-]/.test(word)) {
      for (let at = 1; at < word.length; at++) {
        const letter = word[at];
        if (spec.file.includes(letter)) fromFile = true;
        if (spec.attached.includes(letter)) {
          // BSD sed takes `-i ''`: an empty suffix as the next word.
          if (at + 1 === word.length && /^(?:''|"")$/.test(words[index + 1]?.text ?? '')) index++;
          break;
        }
        if (!spec.short.includes(letter)) continue;
        const attached = at + 1 < word.length;
        if (spec.script.includes(letter)) scripts.push(attached ? words[index] : words[index + 1]);
        if (!attached) index++;
        break;
      }
      continue;
    }
    // Options can follow operands, so keep reading for a pattern option.
    positional ??= words[index];
  }
  if (scripts.length === 0 && !fromFile && positional) scripts.push(positional);
  return scripts;
}

/**
 * In a pipeline stage that runs sed or a search command (also through `xargs`
 * or `find -exec`), blanks quoted text in the script or pattern when it holds a
 * space, a `|` or a nested quote, so `'../lib'` inside it is not a path. Paths,
 * option values and pattern files stay audited.
 */
function textAsText(segment) {
  return pipelineStages(segment)
    .map(stage => {
      const lead = /^\s*/.exec(stage)[0];
      const match = TEXT_COMMAND.exec(stage.slice(lead.length));
      if (!match) return stage;
      const command = match[1].startsWith('git') ? 'grep' : match[1].replace(/^[efz](?=grep)/, '');
      const at = lead.length + match.index + match[0].length;
      let rest = stage.slice(at);
      let words = shellWords(rest);
      // A `find -exec` command ends at its `+` or `;` word; later words are find's own.
      if (/-exec/.test(match[0])) {
        const end = words.findIndex(word => /^(?:\+|\\?;|';'|";")$/.test(word.text));
        if (end >= 0) words = words.slice(0, end);
      }
      const scripts = scriptWords(words, OPTION_SPECS[command]).filter(Boolean);
      for (const word of scripts.sort((a, b) => b.start - a.start)) {
        const text = word.text.replace(/"[^"]*"|'[^']*'/g, quoted => (/[\s|'"]/.test(quoted.slice(1, -1)) ? '""' : quoted));
        rest = rest.slice(0, word.start) + text + rest.slice(word.end);
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
 * warning to review: a command can name a path without reading it. A path in the system temp folder
 * outside every root, such as a backup the agent copies to `/tmp`, is listed apart as a temp path
 * when it is literal; a path there that the shell can expand stays a warning, because it can reach a run:
 * the agents that run at the same time share that folder. The agent's own temp folder (`ownTemp`,
 * its TMPDIR) is its own.
 * @param {string[]} lines
 * @param {string} workspace real path of the workspace
 * @param {string[]} sensitiveRoots
 * @param {string} [home]
 * @param {{ownTemp?: string, tempRoots?: string[]}} [options]
 */
export function auditTranscript(
  lines,
  workspace,
  sensitiveRoots = [],
  home = os.homedir(),
  {ownTemp, tempRoots = givenAndRealPaths([os.tmpdir(), '/tmp'])} = {},
) {
  const violations = [];
  const warnings = [];
  const tempPaths = [];
  const docsCommands = [];
  const tools = {};
  // The agent saves long tool output in its own session folder and reads it back.
  const ownSession = path.join(home, '.claude', 'projects', workspace.replace(/[^A-Za-z0-9]/g, '-'));
  let shellCwd = workspace;
  const check = (raw, tool, resolved = resolveRaw(raw, workspace, home), {relative = false, recursive = false, expands = false} = {}) => {
    if (isInside(resolved, ownSession) || isInside(resolved, workspace)) return;
    if (ownTemp && isInside(resolved, ownTemp)) return;
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
    // A path the shell can expand can reach another run, so only a literal path counts as a temp path.
    const literal = !expands && !/[*?[{]/.test(raw);
    if (literal && tempRoots.some(root => resolved !== root && isInside(resolved, root))) {
      // A link the agent made can point a temp path into a run, so the path's target decides.
      if (sensitiveRoots.some(root => isInside(linkTarget(resolved), root))) {
        warnings.push({tool, path: raw});
        return;
      }
      tempPaths.push({tool, path: raw});
      return;
    }
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
        else check(raw, use.name, resolved, {relative, recursive, expands: shellCanExpand(input.command, raw)});
      }
      shellCwd = cwd;
      if (/\b(astryx|shadcn)\b/.test(input.command)) docsCommands.push(input.command.slice(0, 200));
    }
  }
  const toolCalls = Object.values(tools).reduce((a, b) => a + b, 0);
  return {tools, toolCalls, violations, warnings, tempPaths, docsCommands};
}
