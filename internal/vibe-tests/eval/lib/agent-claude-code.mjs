// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Headless Claude Code adapter: one fresh agent per task run.
 * @input a workspace, a prompt, a pinned model, and a dollar cap
 * @output the transcript (stream JSON lines) and the final usage record
 * @position Called by the runner; the only code that starts an agent
 */

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {killGroup} from './workspace.mjs';

/**
 * Bare mode loads no user settings, plugins, hooks, MCP servers, or memory
 * files, so the agent knows only the prompt and the project. Web tools and
 * sub-agents are off in both arms.
 */
export function buildArgs({prompt, model, maxBudgetUsd, instructions}) {
  const args = [
    '-p',
    prompt,
    '--bare',
    '--strict-mcp-config',
    '--model',
    model,
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-budget-usd',
    String(maxBudgetUsd),
    '--permission-mode',
    'bypassPermissions',
    '--no-session-persistence',
    '--disallowedTools',
    'WebFetch',
    'WebSearch',
    'Task',
    'Agent',
  ];
  if (instructions) args.push('--append-system-prompt', instructions);
  return args;
}

/**
 * Bare mode skips memory-file discovery, so the runner hands every arm the
 * root agent file its own setup wrote, if any.
 */
export function projectInstructions(workspace) {
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const file = path.join(workspace, name);
    if (fs.existsSync(file)) {
      return {file: name, text: `Project instructions from ${name}:\n\n${fs.readFileSync(file, 'utf8')}`};
    }
  }
  return null;
}

/** The model the session reports in its start event. */
export function parseInitModel(lines) {
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event.type === 'system' && event.subtype === 'init') return event.model ?? null;
    } catch {
      continue;
    }
  }
  return null;
}

export function parseResult(lines) {
  for (let index = lines.length - 1; index >= 0; index--) {
    let event;
    try {
      event = JSON.parse(lines[index]);
    } catch {
      continue;
    }
    if (event.type === 'result') {
      return {
        subtype: event.subtype ?? null,
        isError: Boolean(event.is_error),
        costUsd: typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null,
        turns: event.num_turns ?? null,
        durationMs: event.duration_ms ?? null,
        usage: event.usage ?? null,
        models: event.modelUsage ? Object.keys(event.modelUsage) : [],
      };
    }
  }
  return null;
}

/** Process groups of agents that are still running. */
const liveGroups = new Set();

/** Kills every running agent and the tools it started. */
export function killAllAgents() {
  for (const child of liveGroups) killGroup(child);
  liveGroups.clear();
}

/**
 * The agent starts its own tools and can leave a server running, so the
 * runner kills its whole process group when it exits or times out.
 * @returns {Promise<{exitCode: number | null, timedOut: boolean, spawnError: string | null, lines: string[], initModel: string | null, result: ReturnType<typeof parseResult>, instructionsFile: string | null}>}
 */
export function runClaudeCode({
  workspace,
  prompt,
  model,
  maxBudgetUsd,
  timeoutMs,
  transcriptPath,
  bin = process.env.VIBE_EVAL_AGENT_BIN || 'claude',
}) {
  const instructions = projectInstructions(workspace);
  const args = buildArgs({prompt, model, maxBudgetUsd, instructions: instructions?.text});
  fs.mkdirSync(path.dirname(transcriptPath), {recursive: true});
  return new Promise(resolve => {
    const child = spawn(bin, args, {cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    liveGroups.add(child);
    let buffered = '';
    const lines = [];
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      buffered += chunk;
      const parts = buffered.split('\n').filter(Boolean);
      buffered = buffered.endsWith('\n') ? '' : (parts.pop() ?? '');
      lines.push(...parts);
      // A session on another model can never count, so stop it before it spends more.
      const started = parseInitModel(parts);
      if (started && started !== model) killGroup(child);
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    let timedOut = false;
    let spawnError = null;
    let settled = false;
    const finish = exitCode => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      killGroup(child);
      liveGroups.delete(child);
      if (buffered) lines.push(buffered);
      fs.writeFileSync(transcriptPath, lines.map(line => `${line}\n`).join(''));
      fs.writeFileSync(`${transcriptPath}.stderr.txt`, stderr);
      resolve({
        exitCode,
        timedOut,
        spawnError,
        lines,
        initModel: parseInitModel(lines),
        result: parseResult(lines),
        instructionsFile: instructions?.file ?? null,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup(child);
    }, timeoutMs);
    child.on('error', error => {
      spawnError = String(error);
      finish(null);
    });
    child.on('close', exitCode => finish(exitCode));
  });
}
