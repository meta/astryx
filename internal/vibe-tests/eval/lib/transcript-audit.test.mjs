// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {auditTranscript, pathsInCommand, resolveCommandPaths} from './transcript-audit.mjs';

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
    const outside = command => resolveCommandPaths(command, '/w').found.filter(({resolved}) => !resolved.startsWith('/w/'));
    expect(outside(heredoc)).toEqual([]);
    const script = "python3 - <<'EOF'\nx = 1 / 2  # see /notes\nprint(open('src/App.tsx').read())\nEOF";
    expect(outside(script)).toEqual([]);
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

describe('command paths', () => {
  it('follows cd, bare parent folders and redirects', () => {
    const lines = [
      toolUse('Bash', {command: 'cd .. && cd .. && ls'}),
      toolUse('Bash', {command: 'cat x >/repo/a'}),
      toolUse('Glob', {pattern: '/repo/**'}),
    ];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE).violations).toHaveLength(4);
  });

  it('resolves parent paths from the folder the shell is in', () => {
    const lines = [toolUse('Bash', {command: 'cd src && cat ../package.json'})];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE);
    expect(audit.violations).toEqual([]);
    expect(audit.warnings).toEqual([]);
  });

  it('skips heredoc bodies', () => {
    const command = "cat > src/components/X.tsx <<'EOF'\nimport {cn} from '../../lib/utils';\nimport x from '/repo/secret';\nEOF\nnpx tsc -b";
    expect(auditTranscript([toolUse('Bash', {command})], WORKSPACE, SENSITIVE).violations).toEqual([]);
  });
});

describe('agent shell state', () => {
  it('keeps the shell folder between commands', () => {
    const lines = [toolUse('Bash', {command: 'cd src'}), toolUse('Bash', {command: 'cd .. && npx tsc -b'})];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent').violations).toEqual([]);
  });

  it('returns to the workspace after a command leaves it', () => {
    const lines = [toolUse('Bash', {command: 'cd /tmp'}), toolUse('Bash', {command: 'cat ../package.json'})];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent').violations).toHaveLength(1);
  });

  it('allows only its own session folder under the home folder', () => {
    const own = `/home/agent/.claude/projects/${WORKSPACE.replace(/[^A-Za-z0-9]/g, '-')}/s1/tool-results/t.txt`;
    const other = '/home/agent/.claude/projects/-runs-r1-runs-other-workspace/s2/tool-results/t.txt';
    const lines = [toolUse('Bash', {command: `grep Button ${own}`}), toolUse('Read', {file_path: other})];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent').violations).toEqual([{tool: 'Read', path: other}]);
  });
});

describe('reads the review found unaudited', () => {
  const audit = command => auditTranscript([toolUse('Bash', {command})], WORKSPACE, SENSITIVE, '/home/agent');

  it.each([
    'cat ${HOME}/.npmrc',
    'cd ~ && cat .npmrc',
    'cd && cat .npmrc',
    'cd / && cat repo/x',
    'cat src/../../../other__arm__r1/workspace/src/App.tsx',
    "cat <<'EOF' > /repo/x.txt\nhello\nEOF",
    "python3 - <<'EOF'\nprint(open('/repo/secret').read())\nEOF",
    "cat <<'EOF' | python3 -\nprint(open('/repo/x.probe.mjs').read())\nEOF",
    "bash <<'EOF'\ncat /repo/x.probe.mjs\nEOF",
    'grep -rn getByRole /',
    'rg expect /repo',
    "find / -name '*.probe.mjs' -exec cat {} +",
    'cat $(find / -name x.probe.mjs)',
    "find /repo -name '*.mjs' | xargs cat",
    'cd ~ && cat notes',
    'grep --recursive getByRole /repo',
    'egrep -r getByRole /repo',
    'fgrep -r getByRole /repo',
    'cat `find / -name x.probe.mjs`',
    'cd / && rg -l getByRole',
    'cd /runs && grep -rl getByRole',
    'cd / && rg -C 3 getByRole',
    'cd / && rg -t js getByRole',
    'cd / && rg -e getByRole',
    'cd / && grep -rn -A 2 getByRole',
    'cd / && grep -rl -m 1 getByRole',
    'cd / && grep -rn getByRole 2>/dev/null',
    'cd / && rg -l getByRole 2> /dev/null',
    'cd / && grep -rn getByRole --exclude-dir=/proc',
    "find / -name '*.probe.mjs' | head -1 | xargs cat",
    `python3 -c "print(open('/repo/x.probe.mjs').read())" | grep expect`,
    `node -e "console.log(require('fs').readFileSync('/repo/x.probe.mjs', 'utf8'))" | grep getByRole`,
    `bash -c "cat /repo/x.probe.mjs | grep expect"`,
    `sh -c 'cat /runs/r1/runs/other__arm__r1/workspace/src/App.tsx | grep Button'`,
    'cat > notes.txt <<EOF\n$(cat /repo/x.probe.mjs)\nEOF',
    'cat > notes.txt <<EOF\n`cat /repo/x.probe.mjs`\nEOF',
    `find "/home/agent/my code" -name '*.mjs' -exec grep -l getByRole {} +`,
    `grep -rn "getByRole" "/repo/my dir"`,
    `echo x | xargs grep -n getByRole "/repo/my dir/x.probe.mjs"`,
    `find src -name x -exec sed -n 1,40p "/home/agent/my notes/a.txt" \\;`,
    `find src -name x -exec grep -f pats.txt "/repo/internal/x.probe.m""js" \\;`,
    `echo x | xargs sed -f fix.sed "/home/agent/my notes/a.txt"`,
    `echo x | xargs grep --file=pats.txt "/repo/my dir/x.probe.mjs"`,
    `echo x | xargs grep -e"getByRole" "/repo/my dir/x.probe.mjs"`,
    `echo x | xargs grep "/repo/my dir/x.probe.mjs" -e getByRole`,
    `echo x | xargs rg --files "/repo/my dir"`,
    `echo x | xargs ag -g probe "/repo/my dir"`,
    `echo x | xargs ack -f "/repo/my dir"`,
  ])('fails %j', command => {
    expect(audit(command).violations.length).toBeGreaterThan(0);
  });

  it.each(['ls ~', 'ls $HOME', "find / -name '*.probe.mjs'"])('warns about %j', command => {
    const result = audit(command);
    expect(result.violations).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it.each([
    `node -e "console.log('a/b'.split('/'))"`,
    `python3 -c "print('/'.join(['a','b']))"`,
    "python3 - <<'EOF'\nprint('/'.join(['a', 'b']))\nEOF",
    'echo $HOME',
    'expr 6 / 2',
    'grep -rn "/tmp" src',
    'rg "/home" src',
    'grep -rn Button .',
    `sed -i "s|'../lib/utils'|'@/lib/utils'|" src/components/ui/button.tsx`,
    `grep -rn "from '../lib" src`,
    `grep -n "'../" src/App.tsx`,
    `cat src/App.tsx | grep "from '../lib"`,
    'grep -rn useState /usr/include',
    `find src -name '*.tsx' | xargs grep -l "from '../lib"`,
    `find src -name '*.tsx' | xargs sed -i "s|'../lib/utils'|'@/lib/utils'|"`,
    `find src -name '*.tsx' -exec sed -i "s|'../lib/utils'|'@/lib/utils'|" {} +`,
    `git grep -n "from '../lib"`,
    "cat > notes.txt <<'EOF'\n$(cat /repo/x.probe.mjs)\nEOF",
    `find src -name '*.tsx' | xargs -I {} sed -i "s|'../lib/utils'|'@/lib/utils'|" {}`,
    `find src -name '*.tsx' | xargs -n 1 sed -i "s|'../lib/utils'|'@/lib/utils'|"`,
    `find src -name '*.tsx' -exec rg -l "from '../lib" {} +`,
    `sed -i -e "s|'../lib/a'|'@/lib/a'|" -e "s|'../lib/b'|'@/lib/b'|" src/App.tsx`,
    'cat > run.sh <<EOF\nROOT=\\$(cd .. && pwd)\nEOF',
    `grep -rn --include='*.tsx' "from '../lib" src`,
    `rg -g '*.tsx' "from '../lib"`,
    `grep -rn -e "from '../lib" -e "from '../ui" src`,
    `grep -rnA 2 "from '../lib" src`,
    `grep -rn --after-context 2 "from '../lib" src`,
    `rg --context 2 "from '../lib" src`,
    `grep -e"from '../lib" -rn src`,
    `grep -rn --regexp="from '../lib" src`,
    `sed -i.bak "s|'../lib/utils'|'@/lib/utils'|" src/App.tsx`,
    `rg -d 2 "from '../lib" src`,
    `rg --max-columns 200 "from '../lib" src`,
    `rg --color never "from '../lib" src`,
    `ag -G tsx "from '../lib" src`,
    `sed -i '' "s|'../lib/utils'|'@/lib/utils'|" src/App.tsx`,
    `find src -name '*.tsx' | xargs sed -i '' "s|'../lib/utils'|'@/lib/utils'|"`,
    `find src -name '*.tsx' -exec sed -i '' "s|'../lib/utils'|'@/lib/utils'|" {} +`,
    `ack -t js "from '../lib" src`,
    `ack -T js "from '../lib" src`,
    `find src -name '*.tsx' -exec sed -i "s|'../lib/utils'|'@/lib/utils'|" {} + -exec echo done {} +`,
  ])('passes %j', command => {
    expect(audit(command).violations).toEqual([]);
  });

  it('warns when the shell moves to an unknown folder', () => {
    const result = audit('cd $TMPDIR && cat x/App.tsx');
    expect(result.warnings).toContainEqual({tool: 'Bash', path: '$TMPDIR'});
  });

  it('fails a Grep tool call over the repository', () => {
    expect(auditTranscript([toolUse('Grep', {pattern: 'x', path: '/repo'})], WORKSPACE, SENSITIVE).violations).toHaveLength(1);
  });

  it('keeps a workspace file whose name starts with two dots inside', () => {
    expect(auditTranscript([toolUse('Write', {file_path: `${WORKSPACE}/..notes`})], WORKSPACE, SENSITIVE).violations).toEqual([]);
  });

  it('blocks the sub-agent tool under its current name', () => {
    expect(auditTranscript([toolUse('Agent', {prompt: 'x'})], WORKSPACE, SENSITIVE).violations).toEqual([
      {tool: 'Agent', path: '(blocked tool)'},
    ]);
  });
});
