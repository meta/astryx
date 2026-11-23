// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';
import {auditTranscript, pathsInCommand, resolveCommandPaths, shellCanExpand} from './transcript-audit.mjs';

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

  it('lists a temp-folder path outside every run apart from the warnings', () => {
    const lines = [
      toolUse('Bash', {command: 'cp src/astryx-themes.ts /tmp/themes.bak'}),
      toolUse('Read', {file_path: '/tmp/themes.bak'}),
    ];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
    expect(audit.violations).toEqual([]);
    expect(audit.warnings).toEqual([]);
    expect(audit.tempPaths).toEqual([
      {tool: 'Bash', path: '/tmp/themes.bak'},
      {tool: 'Read', path: '/tmp/themes.bak'},
    ]);
  });

  it('still fails another run under the temp folder and warns on the temp folder itself', () => {
    const sensitive = [...SENSITIVE, '/tmp/astryx-vibe-eval'];
    const lines = [
      toolUse('Read', {file_path: '/tmp/astryx-vibe-eval/old/runs/x/workspace/src/App.tsx'}),
      toolUse('Bash', {command: 'ls /tmp'}),
    ];
    const audit = auditTranscript(lines, WORKSPACE, sensitive, '/home/agent', {tempRoots: ['/tmp']});
    expect(audit.violations).toEqual([{tool: 'Read', path: '/tmp/astryx-vibe-eval/old/runs/x/workspace/src/App.tsx'}]);
    expect(audit.warnings).toEqual([{tool: 'Bash', path: '/tmp'}]);
    expect(audit.tempPaths).toEqual([]);
  });

  it('keeps a shell pattern under the temp folder on the warning list', () => {
    const lines = [
      toolUse('Bash', {command: 'cat /tmp/*/*/runs/*/workspace/src/App.tsx'}),
      toolUse('Glob', {pattern: '/tmp/**/workspace/src/App.tsx'}),
    ];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
    expect(audit.warnings).toEqual([
      {tool: 'Bash', path: '/tmp/*/*/runs/*/workspace/src/App.tsx'},
      {tool: 'Glob', path: '/tmp/**/workspace/src/App.tsx'},
    ]);
    expect(audit.tempPaths).toEqual([]);
  });

  it('keeps a temp path that a variable, an escape or a backtick changes on the warning list', () => {
    const commands = [
      'E=astryx-vibe-eval/s1; cat /tmp/$E/runs/form__arm__r1/workspace/src/App.tsx',
      'cat /tmp/astryx\\-vibe-eval/s1/runs/form__arm__r1/workspace/src/App.tsx',
      'cat /tmp/astryx-vibe-`echo eval`/s1/runs/form__arm__r1/workspace/src/App.tsx',
    ];
    for (const command of commands) {
      const audit = auditTranscript([toolUse('Bash', {command})], WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
      expect(audit.tempPaths).toEqual([]);
      expect(audit.warnings.length).toBeGreaterThan(0);
    }
  });

  it('keeps a temp path that a quote, a space, a parent folder or a string join changes on the warning list', () => {
    const sensitive = [...SENSITIVE, '/tmp/astryx-vibe-eval'];
    const commands = [
      'cat "/tmp/astryx-vibe-"eval/s1/runs/form__arm__r1/workspace/src/App.tsx',
      'X=eval; cat "/tmp/astryx-vibe-"$X/s1/runs/form__arm__r1/workspace/src/App.tsx',
      'cat "/tmp/x y/../astryx-vibe-eval/s1/runs/form__arm__r1/workspace/src/App.tsx"',
      'node -e "require(\'fs\').readFileSync(\'/tmp/astryx-vibe-\'+\'eval/s1/runs/form__arm__r1/workspace/src/App.tsx\')"',
    ];
    for (const command of commands) {
      const audit = auditTranscript([toolUse('Bash', {command})], WORKSPACE, sensitive, '/home/agent', {tempRoots: ['/tmp']});
      expect(audit.tempPaths).toEqual([]);
    }
  });

  it('keeps a temp path on the warning list when the command can rewrite it into a run', () => {
    const app = 'astryx-vibe-eval/s1/runs/form__arm__r1/workspace/src/App.tsx';
    const commands = [
      `D=/tmp/q; cat \${D%q}${app}`,
      `for D in /tmp/q; do cat \${D%q}${app}; done`,
      'ln -s astryx-vibe-eval /tmp/q',
      `find /tmp/q -maxdepth 0 -exec cat {}/../${app} \\;`,
      `node -e "require('fs').readFileSync(require('path').join(require('path').dirname('/tmp/q'), '${app}'))"`,
      `node <<'EOF'\nrequire('fs').readFileSync('/tmp/astryx-vibe-' + 'eval/s1/runs/form__arm__r1/workspace/src/App.tsx');\nEOF`,
    ];
    for (const command of commands) {
      const audit = auditTranscript([toolUse('Bash', {command})], WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
      expect(audit.tempPaths).toEqual([]);
    }
  });

  it('keeps a temp path on the warning list when a program other than a plain file command runs', () => {
    const app = 'astryx-vibe-eval/s1/runs/form__arm__r1/workspace/src/App.tsx';
    const commands = [
      `node<<'EOF'\nrequire('fs').readFileSync(require('path').join(require('path').dirname('/tmp/q'), '${app}'))\nEOF`,
      `python3<<'EOF'\nprint(open('/tmp/astryx-vibe-' + 'eval/s1/runs/form__arm__r1/workspace/src/App.tsx').read())\nEOF`,
      `/usr/bin/python3 -c "import os; print(open(os.path.join(os.path.dirname('/tmp/q'), '${app}')).read())"`,
      '/bin/ln -s astryx-vibe-eval /tmp/q',
      '\\ln -s astryx-vibe-eval /tmp/q',
      "l''n -s astryx-vibe-eval /tmp/q",
    ];
    for (const command of commands) {
      const audit = auditTranscript([toolUse('Bash', {command})], WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
      expect(audit.tempPaths).toEqual([]);
    }
  });

  it('keeps a backup a plain file command writes as a temp path', () => {
    const lines = [toolUse('Bash', {command: "mkdir -p /tmp/bak && cp src/App.tsx /tmp/bak/App.tsx && cat > src/App.tsx <<'EOF'\nexport default 1;\nEOF"})];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent', {tempRoots: ['/tmp']});
    expect(audit.warnings).toEqual([]);
    expect(audit.tempPaths.map(item => item.path)).toEqual(expect.arrayContaining(['/tmp/bak', '/tmp/bak/App.tsx']));
  });

  it('allows the agent its own temp folder inside its run', () => {
    const ownTemp = '/runs/r1/runs/task__arm__r1/tmp';
    const lines = [toolUse('Bash', {command: `cp src/App.tsx ${ownTemp}/App.bak`})];
    const audit = auditTranscript(lines, WORKSPACE, SENSITIVE, '/home/agent', {ownTemp, tempRoots: ['/tmp']});
    expect(audit.violations).toEqual([]);
    expect(audit.warnings).toEqual([]);
    expect(audit.tempPaths).toEqual([]);
  });

  it('treats web tools and sub-agents as violations', () => {
    const lines = [toolUse('WebFetch', {url: 'https://example.com'}), toolUse('Task', {prompt: 'x'})];
    expect(auditTranscript(lines, WORKSPACE, SENSITIVE).violations).toHaveLength(2);
  });

  it('skips lines that are not JSON', () => {
    expect(auditTranscript(['not json', ''], WORKSPACE, SENSITIVE).toolCalls).toBe(0);
  });
});

describe('shellCanExpand', () => {
  it('reads a plain or quoted path as literal', () => {
    expect(shellCanExpand('cp src/a.ts /tmp/a.bak && cat /tmp/a.bak', '/tmp/a.bak')).toBe(false);
    expect(shellCanExpand('cat "/tmp/a.bak"', '/tmp/a.bak')).toBe(false);
    expect(shellCanExpand('cat "/tmp/a"b.bak', '/tmp/a')).toBe(true);
    expect(shellCanExpand('cat /tmp/x/../y', '/tmp/x/../y')).toBe(true);
    expect(shellCanExpand('cat x/tmp/a.bak', '/tmp/a.bak')).toBe(true);
    expect(shellCanExpand('cat /tmp/a.bak>out.txt', '/tmp/a.bak')).toBe(false);
  });

  it('flags a variable, an escape, a pattern or a backtick that continues the word', () => {
    expect(shellCanExpand('cat /tmp/$E/x', '/tmp/$E/x')).toBe(true);
    expect(shellCanExpand('cat /tmp/a\\-b/x', '/tmp/a\\-b/x')).toBe(true);
    expect(shellCanExpand('cat /tmp/*/x', '/tmp/*/x')).toBe(true);
    expect(shellCanExpand('cat /tmp/a-`echo b`/x', '/tmp/a-')).toBe(true);
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
