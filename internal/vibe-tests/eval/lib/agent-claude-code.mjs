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

/**
 * @returns {Promise<{exitCode: number | null, timedOut: boolean, transcriptPath: string, result: ReturnType<typeof parseResult>, instructionsFile: string | null}>}
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
  const transcript = fs.createWriteStream(transcriptPath);
  return new Promise(resolve => {
    const child = spawn(bin, args, {cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], detached: true});
    let buffered = '';
    const lines = [];
    child.stdout.on('data', chunk => {
      transcript.write(chunk);
      buffered += chunk;
      const parts = buffered.split('\n');
      buffered = parts.pop() ?? '';
      lines.push(...parts.filter(Boolean));
    });
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr = (stderr + chunk).slice(-20_000);
    });
    let timedOut = false;
    // The agent starts its own tools, so a timeout kills its whole process group.
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }, timeoutMs);
    child.on('close', exitCode => {
      clearTimeout(timer);
      if (buffered) lines.push(buffered);
      transcript.end();
      fs.writeFileSync(`${transcriptPath}.stderr.txt`, stderr);
      resolve({
        exitCode,
        timedOut,
        transcriptPath,
        result: parseResult(lines),
        instructionsFile: instructions?.file ?? null,
      });
    });
  });
}
