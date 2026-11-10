// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {auditTranscript, pathsInCommand} from './transcript-audit.mjs';

const WORKSPACE = '/runs/r1/runs/task__arm__r1/workspace';
const SENSITIVE = ['/runs/r1', '/repo', '/home/agent'];

const toolUse = (name, input) =>
  JSON.stringify({type: 'assistant', message: {content: [{type: 'tool_use', name, input}]}});

describe('pathsInCommand', () => {
  it('finds absolute, home and parent paths', () => {
    expect(pathsInCommand('cat /repo/a.json ~/notes ../x "$HOME/y"')).toEqual([
      '/repo/a.json',
      '~/notes',
      '../x',
      '$HOME/y',
    ]);
  });

  it('ignores JSX, URLs, comments and division', () => {
    const heredoc = "cat > src/App.tsx <<'EOF'\n<Button /> // note\nconst a = 1 / 2;\nfetch('https://example.com/x')\nEOF";
    expect(pathsInCommand(heredoc)).toEqual([]);
  });
});

describe('auditTranscript', () => {
  it('accepts work inside the workspace', () => {
    const lines = [
      toolUse('Read', {file_path: `${WORKSPACE}/src/App.tsx`}),
      toolUse('Bash', {command: 'npx astryx component Button && cat src/main.tsx'}),
    ];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE);
    expect(audit.violations).toEqual([]);
    expect(audit.warnings).toEqual([]);
    expect(audit.toolCalls).toBe(2);
    expect(audit.docsCommands).toHaveLength(1);
  });

  it('flags the repository, other runs and the home folder', () => {
    const lines = [
      toolUse('Read', {file_path: '/repo/internal/vibe-tests/eval/tasks/pilot/x.probe.mjs'}),
      toolUse('Bash', {command: 'ls ../../shipping__other__r1/workspace/src'}),
      toolUse('Grep', {pattern: 'x', path: '/home/agent/code'}),
      toolUse('Bash', {command: 'cat ~/.bashrc'}),
    ];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE);
    expect(audit.violations.map(item => item.tool)).toEqual(['Read', 'Bash', 'Grep', 'Bash']);
  });

  it('warns on other outside paths and allows system locations', () => {
    const lines = [toolUse('Bash', {command: 'ls /opt/thing && which node > /dev/null && cat /usr/lib/x'})];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE);
    expect(audit.violations).toEqual([]);
    expect(audit.warnings).toEqual([{tool: 'Bash', path: '/opt/thing'}]);
  });

  it('treats web tools and sub-agents as violations', () => {
    const lines = [toolUse('WebFetch', {url: 'https://example.com'}), toolUse('Task', {prompt: 'x'})];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE).violations).toHaveLength(2);
  });

  it('skips lines that are not JSON', () => {
    expect(auditTranscript(['not json', ''], WORKSPACE, SENSITIVE).toolCalls).toBe(0);
  });
});
