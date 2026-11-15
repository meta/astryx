// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildArgs, parseResult, runClaudeCode} from './agent-claude-code.mjs';

describe('buildArgs', () => {
  it('pins the model, caps spend, and turns off settings, web tools and sub-agents', () => {
    const args = buildArgs({prompt: 'Build it', model: 'model-x', maxBudgetUsd: 2});
    expect(args.slice(0, 2)).toEqual(['-p', 'Build it']);
    expect(args).toContain('--bare');
    expect(args).toContain('--strict-mcp-config');
    expect(args[args.indexOf('--model') + 1]).toBe('model-x');
    expect(args[args.indexOf('--max-budget-usd') + 1]).toBe('2');
    const disallowed = args.slice(args.indexOf('--disallowedTools') + 1);
    expect(disallowed).toEqual(['WebFetch', 'WebSearch', 'Task', 'Agent']);
    expect(args).not.toContain('--append-system-prompt');
  });

  it('passes project instructions when the arm has them', () => {
    const args = buildArgs({prompt: 'p', model: 'm', maxBudgetUsd: 1, instructions: 'Use the CLI.'});
    expect(args[args.indexOf('--append-system-prompt') + 1]).toBe('Use the CLI.');
  });
});

describe('parseResult', () => {
  it('reads the last result event', () => {
    const lines = [
      JSON.stringify({type: 'system'}),
      'partial',
      JSON.stringify({type: 'result', subtype: 'success', total_cost_usd: 0.12, num_turns: 5, duration_ms: 9000, usage: {output_tokens: 100}, modelUsage: {'model-x': {}}}),
    ];
    expect(parseResult(lines)).toEqual({
      subtype: 'success',
      isError: false,
      costUsd: 0.12,
      turns: 5,
      durationMs: 9000,
      usage: {output_tokens: 100},
      models: ['model-x'],
    });
  });

  it('returns null without a result event', () => {
    expect(parseResult(['{"type":"assistant"}'])).toBeNull();
  });
});

describe('runClaudeCode', () => {
  it('reports a missing binary instead of crashing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-agent-'));
    const result = await runClaudeCode({
      workspace: dir,
      prompt: 'p',
      model: 'm',
      maxBudgetUsd: 1,
      timeoutMs: 5000,
      transcriptPath: path.join(dir, 'transcript.jsonl'),
      bin: path.join(dir, 'missing-binary'),
    });
    expect(result.spawnError).toMatch(/ENOENT/);
    expect(result.result).toBeNull();
  });
});
