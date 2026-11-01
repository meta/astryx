// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it} from 'vitest';

import {
  commandTokensIn,
  DOC_PACKAGE_MANAGERS,
  parseCommandToken,
  renderCommandTokens,
  renderPmStep,
  tokenForCommand,
  unknownTokensIn,
  unclosedTokensIn,
} from './doc-syntax.mjs';

/** @param {string} body */
function pm(body) {
  const step = parseCommandToken('pm', body);
  if ('error' in step) throw new Error(step.error);
  if (step.kind !== 'pm') throw new Error('not a pm step');
  return step;
}

/** @param {string} body */
const everyManager = body =>
  Object.fromEntries(
    DOC_PACKAGE_MANAGERS.map(each => [each, renderPmStep(pm(body), each)]),
  );

describe('renderPmStep', () => {
  // Each row was run on npm 10.9, pnpm 11.10, Yarn 4.18, Yarn 1.22 and Bun
  // 1.4 in a throwaway project, and did what the token says.
  it('adds packages, as dependencies or dev dependencies', () => {
    expect(everyManager('install @acme/x')).toEqual({
      npm: 'npm install @acme/x',
      pnpm: 'pnpm add @acme/x',
      yarn: 'yarn add @acme/x',
      'yarn-classic': 'yarn add @acme/x',
      bun: 'bun add @acme/x',
    });
    expect(everyManager('install @acme/x --dev')).toEqual({
      npm: 'npm install -D @acme/x',
      pnpm: 'pnpm add -D @acme/x',
      yarn: 'yarn add -D @acme/x',
      'yarn-classic': 'yarn add -D @acme/x',
      bun: 'bun add -d @acme/x',
    });
    expect(everyManager('install')).toEqual({
      npm: 'npm install',
      pnpm: 'pnpm install',
      yarn: 'yarn install',
      'yarn-classic': 'yarn install',
      bun: 'bun install',
    });
  });

  it('installs for the computer, with npm where Yarn 2 has no global install', () => {
    expect(everyManager('install @astryxdesign/cli --global')).toEqual({
      npm: 'npm install -g @astryxdesign/cli',
      pnpm: 'pnpm add -g @astryxdesign/cli',
      yarn: 'npm install -g @astryxdesign/cli',
      'yarn-classic': 'yarn global add @astryxdesign/cli',
      bun: 'bun add -g @astryxdesign/cli',
    });
    expect(everyManager('remove @astryxdesign/cli --global')).toEqual({
      npm: 'npm uninstall -g @astryxdesign/cli',
      pnpm: 'pnpm remove -g @astryxdesign/cli',
      yarn: 'npm uninstall -g @astryxdesign/cli',
      'yarn-classic': 'yarn global remove @astryxdesign/cli',
      bun: 'bun remove -g @astryxdesign/cli',
    });
  });

  it('passes script arguments with `--` only where the package manager needs it', () => {
    // pnpm and Yarn 2 hand a `--` on to the script; npm needs one.
    expect(everyManager('run build --watch')).toEqual({
      npm: 'npm run build -- --watch',
      pnpm: 'pnpm run build --watch',
      yarn: 'yarn run build --watch',
      'yarn-classic': 'yarn run build --watch',
      bun: 'bun run build --watch',
    });
  });

  it('runs an installed binary, and a package without installing it', () => {
    expect(everyManager('exec tsc --noEmit')).toEqual({
      npm: 'npx tsc --noEmit',
      pnpm: 'pnpm exec tsc --noEmit',
      yarn: 'yarn run tsc --noEmit',
      'yarn-classic': 'yarn run tsc --noEmit',
      bun: 'bunx tsc --noEmit',
    });
    expect(everyManager('dlx @astryxdesign/cli init')).toEqual({
      npm: 'npx @astryxdesign/cli init',
      pnpm: 'pnpm dlx @astryxdesign/cli init',
      yarn: 'yarn dlx @astryxdesign/cli init',
      'yarn-classic': 'npx @astryxdesign/cli init',
      bun: 'bunx @astryxdesign/cli init',
    });
  });

  it('updates packages, to the latest release when asked', () => {
    expect(everyManager('update @acme/x --latest')).toEqual({
      npm: 'npm install @acme/x@latest',
      pnpm: 'pnpm update --latest @acme/x',
      yarn: 'yarn up @acme/x',
      'yarn-classic': 'yarn upgrade --latest @acme/x',
      bun: 'bun update --latest @acme/x',
    });
  });

  it('updates within the declared range unless asked for the latest', () => {
    expect(everyManager('update @acme/x')).toEqual({
      npm: 'npm update @acme/x',
      pnpm: 'pnpm update @acme/x',
      yarn: 'yarn up -R @acme/x',
      'yarn-classic': 'yarn upgrade @acme/x',
      bun: 'bun update @acme/x',
    });
  });

  it('passes an initializer its flags, after `--` on npm', () => {
    expect(everyManager('create vite my-app --template react')).toEqual({
      npm: 'npm create vite my-app -- --template react',
      pnpm: 'pnpm create vite my-app --template react',
      yarn: 'yarn create vite my-app --template react',
      'yarn-classic': 'yarn create vite my-app --template react',
      bun: 'bun create vite my-app --template react',
    });
  });
});

describe('a token whose body holds braces or quotes', () => {
  it('renders and is found by doctor', () => {
    const text =
      'Run {@pm-only npm "edits package.json" pkg set \'exports={}\' --json} first.';
    expect(renderCommandTokens(text, {stem: 'astryx', pm: 'pnpm'})).toBe(
      "Run `npm pkg set 'exports={}' --json` (only with npm: edits package.json) first.",
    );
    expect(commandTokensIn(text).map(each => each.name)).toEqual(['pm-only']);
  });
});

describe('the token for a script, binary or initializer', () => {
  it('keeps every word after the name, flags included', () => {
    expect(tokenForCommand('pnpm exec tsc --noEmit')).toBe(
      '{@pm exec tsc --noEmit}',
    );
    expect(
      tokenForCommand('pnpm dlx create-vite my-app --template react'),
    ).toBe('{@pm dlx create-vite my-app --template react}');
    expect(tokenForCommand('pnpm run build -d')).toBe('{@pm run build -d}');
    expect(tokenForCommand('npm run test -- -g smoke')).toBe(
      '{@pm run test -g smoke}',
    );
  });
});

describe('npm script shortcuts', () => {
  it('suggest {@pm run …}, which every package manager runs', () => {
    expect(tokenForCommand('npm test')).toBe('{@pm run test}');
    expect(tokenForCommand('npm start -- --port 3000')).toBe(
      '{@pm run start --port 3000}',
    );
    expect(tokenForCommand('npm test -- --watch')).toBe(
      '{@pm run test --watch}',
    );
    expect(tokenForCommand('npm run-script build')).toBe('{@pm run build}');
  });
});

describe('a token that never closes', () => {
  it('counts a token broken across lines, or holding a backtick, as unclosed', () => {
    expect(
      unclosedTokensIn(
        '{@command theme palette generate palette.config.json \\\n  --out src/acme.palette.ts}',
      ),
    ).toEqual(['{@command theme palette generate palette.config.json \\']);
    expect(
      unclosedTokensIn(
        'Run {@pm-only npm "edits `package.json`" pkg set name=acme}.',
      ),
    ).toHaveLength(1);
  });

  it('is found, with the rest of its line', () => {
    expect(
      unclosedTokensIn(
        'Run {@pm install @acme/widgets --dev and go.\nNext {@command doctor}.',
      ),
    ).toEqual(['{@pm install @acme/widgets --dev and go.']);
    expect(
      unclosedTokensIn('Run {@pm-only npm "never closes pkg set x}.'),
    ).toEqual(['{@pm-only npm "never closes pkg set x}.']);
  });
});

describe('parseCommandToken', () => {
  it('names what is wrong and how to write it', () => {
    expect(parseCommandToken('pm', 'install -D x')).toMatchObject({
      error: expect.stringContaining('--dev'),
    });
    expect(parseCommandToken('pm', 'add x')).toMatchObject({
      error: expect.stringContaining('install'),
    });
    expect(parseCommandToken('pm', 'install x@^1.2.0 --exact')).toMatchObject({
      error: expect.stringContaining('range'),
    });
    expect(parseCommandToken('pm', 'update --latest')).toMatchObject({
      error: expect.stringContaining('packages'),
    });
    expect(parseCommandToken('pm-only', 'npm pkg set name=x')).toMatchObject({
      error: expect.stringContaining('reason'),
    });
    expect(parseCommandToken('pm-only', 'npmx "why" pkg')).toMatchObject({
      error: expect.stringContaining('package manager'),
    });
    expect(parseCommandToken('command', 'astryx docs')).toMatchObject({
      error: expect.stringContaining('{@command docs}'),
    });
  });

  it('reads a one-manager step with its reason', () => {
    expect(
      parseCommandToken(
        'pm-only',
        'npm "no other manager has it" pkg set name=x',
      ),
    ).toEqual({
      kind: 'pm-only',
      manager: 'npm',
      reason: 'no other manager has it',
      args: ['pkg', 'set', 'name=x'],
    });
  });
});

describe('renderCommandTokens', () => {
  const reader = {stem: 'pnpm exec astryx', pm: /** @type {const} */ ('pnpm')};

  it('renders each token for the reader, as a code span in prose', () => {
    expect(
      renderCommandTokens(
        'Add it with {@pm install @acme/x}, then run {@command docs acme}.',
        reader,
      ),
    ).toBe(
      'Add it with `pnpm add @acme/x`, then run `pnpm exec astryx docs acme`.',
    );
  });

  it('renders a fence inside prose as a code block in its language', () => {
    expect(
      renderCommandTokens(
        [
          'Install it with {@pm install @acme/fence --dev}:',
          '',
          '```bash',
          '{@pm install @acme/fence --dev}',
          '{@command doctor}',
          '{@pm-only npm "edits package.json" pkg set x=1}',
          '```',
          '',
          '~~~text',
          '{@command doctor}',
          '~~~',
          'Then {@command doctor}.',
        ].join('\n'),
        reader,
      ),
    ).toBe(
      [
        'Install it with `pnpm add -D @acme/fence`:',
        '',
        '```bash',
        'pnpm add -D @acme/fence',
        'pnpm exec astryx doctor',
        'npm pkg set x=1  # only with npm: edits package.json',
        '```',
        '',
        '~~~text',
        'pnpm exec astryx doctor',
        '~~~',
        'Then `pnpm exec astryx doctor`.',
      ].join('\n'),
    );
  });

  it('renders inside a code span and a code block without extra ticks', () => {
    expect(renderCommandTokens('Run `{@pm run build}`.', reader)).toBe(
      'Run `pnpm run build`.',
    );
    expect(
      renderCommandTokens(
        '{@pm install}\n{@command integration check --strict}',
        reader,
        'bash',
      ),
    ).toBe('pnpm install\npnpm exec astryx integration check --strict');
  });

  it('shows a one-manager step with its reason, as a comment in a shell block', () => {
    expect(
      renderCommandTokens(
        '{@pm-only npm "pnpm and Yarn have no pkg" pkg set name=x}',
        reader,
      ),
    ).toBe('`npm pkg set name=x` (only with npm: pnpm and Yarn have no pkg)');
    expect(
      renderCommandTokens(
        '{@pm-only pnpm "once per computer" setup}',
        reader,
        'sh',
      ),
    ).toBe('pnpm setup  # only with pnpm: once per computer');
  });

  it('shows {@@…} as written, and leaves a token that does not parse as it was', () => {
    expect(renderCommandTokens('Write {@@pm install x}.', reader)).toBe(
      'Write {@pm install x}.',
    );
    expect(
      renderCommandTokens('{@pm add x} and {@link generic:x}', reader),
    ).toBe('{@pm add x} and {@link generic:x}');
  });
});

describe('tokenForCommand', () => {
  it.each([
    [
      'npm install -D @astryxdesign/cli',
      '{@pm install @astryxdesign/cli --dev}',
    ],
    [
      'pnpm add -g @astryxdesign/cli',
      '{@pm install @astryxdesign/cli --global}',
    ],
    [
      'yarn global add @astryxdesign/cli',
      '{@pm install @astryxdesign/cli --global}',
    ],
    [
      'npm uninstall -g @astryxdesign/cli',
      '{@pm remove @astryxdesign/cli --global}',
    ],
    ['npm install', '{@pm install}'],
    ['yarn typecheck', '{@pm run typecheck}'],
    ['npx tsc --noEmit', '{@pm exec tsc --noEmit}'],
    ['npx @astryxdesign/cli init', '{@pm dlx @astryxdesign/cli init}'],
    ['pnpm exec astryx docs theme', '{@command docs theme}'],
    ['yarn astryx integration verify', '{@command integration verify}'],
    ['npm run astryx -- docs tokens', '{@command docs tokens}'],
    ['astryx docs theme', '{@command docs theme}'],
    ['npm pkg set name=x', '{@pm-only npm "<why only npm>" pkg set name=x}'],
    ['pnpm setup', '{@pm-only pnpm "<why only pnpm>" setup}'],
  ])('%s is written %s', (command, token) => {
    expect(tokenForCommand(command)).toBe(token);
  });

  it('leaves a command that is not a package manager or the CLI', () => {
    expect(tokenForCommand('git status')).toBeNull();
  });

  it('suggests a token that renders back to the command in its own package manager', () => {
    const step = pm('install @astryxdesign/cli --dev');
    expect(renderPmStep(step, 'npm')).toBe('npm install -D @astryxdesign/cli');
  });
});

describe('commandTokensIn and unknownTokensIn', () => {
  it('finds each token with its parse, and names the ones that are not doc tokens', () => {
    const text =
      '{@pm install x} {@command docs} {@pm add y} {@@pm z} {@cmd docs} {@link generic:a}';
    expect(
      commandTokensIn(text).map(each => [each.name, 'error' in each.step]),
    ).toEqual([
      ['pm', false],
      ['command', false],
      ['pm', true],
    ]);
    expect(unknownTokensIn(text)).toEqual(['{@cmd docs}']);
  });
});
