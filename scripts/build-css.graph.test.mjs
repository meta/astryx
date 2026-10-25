// Copyright (c) Meta Platforms, Inc. and affiliates.

import stylexBabelPlugin from '@stylexjs/babel-plugin';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {collectStyleXCSS, undefinedStyleXVariables} from './build-css.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map(root => fs.rm(root, {recursive: true, force: true})),
  );
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'astryx-stylex-graph-'));
  temporaryRoots.push(root);
  const src = path.join(root, 'consumer');
  const external = path.join(root, 'external');
  await fs.mkdir(src, {recursive: true});
  await fs.mkdir(external, {recursive: true});
  return {root, src, external};
}

describe('build-css dependency extraction', () => {
  it('emits a referenced cross-package variable group and omits an unused group', async () => {
    const {src, external} = await fixture();
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      `import {usedVars} from '@probe/used.stylex';\nexport const color = usedVars['--probe-used-a'];\n`,
    );
    await fs.writeFile(
      path.join(external, 'used.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const usedVars = stylex.defineVars({'--probe-used-a': 'red', '--probe-used-b': 'blue'});\n`,
    );
    await fs.writeFile(
      path.join(external, 'unused.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const unusedVars = stylex.defineVars({'--probe-unused': 'green'});\n`,
    );

    const rules = await collectStyleXCSS({
      src,
      aliases: {'@probe/*': [path.join(external, '*')]},
    });
    const css = stylexBabelPlugin.processStylexRules(rules, false);

    expect(css).toContain('--probe-used-a:red');
    expect(css).toContain('--probe-used-b:blue');
    expect(css).not.toContain('--probe-unused');
  });

  it('emits no variable group when no source entry imports one', async () => {
    const {src, external} = await fixture();
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      'export const value = 1;\n',
    );
    await fs.writeFile(
      path.join(external, 'unused.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const unusedVars = stylex.defineVars({'--probe-unused': 'green'});\n`,
    );

    const rules = await collectStyleXCSS({
      src,
      aliases: {'@probe/*': [path.join(external, '*')]},
    });

    expect(rules).toEqual([]);
  });

  it('retains the complete explicit distribution group and deduplicates satellite imports', async () => {
    const {root, src} = await fixture();
    const provider = path.join(root, 'provider');
    await fs.mkdir(provider, {recursive: true});
    const dataSource = await fs.readFile(
      new URL(
        '../packages/core/src/theme/dataTokens.stylex.ts',
        import.meta.url,
      ),
      'utf8',
    );
    await fs.writeFile(path.join(provider, 'data.stylex.ts'), dataSource);
    await fs.writeFile(
      path.join(provider, 'Component.ts'),
      'export const value = 1;\n',
    );
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      `import {dataVars} from '@probe/data.stylex';\nexport const color = dataVars['--color-data-categorical-blue'];\n`,
    );
    const providerTarget = {
      src: provider,
      aliases: {},
      stylexEntries: ['data.stylex.ts'],
    };
    const providerCSS = stylexBabelPlugin.processStylexRules(
      await collectStyleXCSS(providerTarget),
      false,
    );
    const satelliteCSS = stylexBabelPlugin.processStylexRules(
      await collectStyleXCSS({
        src,
        aliases: {'@probe/*': [path.join(provider, '*')]},
        provider: providerTarget,
      }),
      false,
    );
    expect(providerCSS.match(/--color-data-[\w-]+:/g)).toHaveLength(56);
    expect(satelliteCSS).not.toContain('--color-data-');
    // Without the provider, a one-member consumer still owns the full group.
    const standaloneCSS = stylexBabelPlugin.processStylexRules(
      await collectStyleXCSS({
        src,
        aliases: {'@probe/*': [path.join(provider, '*')]},
      }),
      false,
    );
    expect(standaloneCSS.match(/--color-data-[\w-]+:/g)).toHaveLength(56);
    expect(standaloneCSS).toBe(providerCSS);
  });

  it("inlines a provider's defineConsts value, without emitting the provider's module", async () => {
    // Lab reading a core motion constant as a value (a fade's duration): the
    // constants module belongs to the provider's stylesheet, but a constant is
    // inlined where it is read. (At-rule keys stay literal: StyleX gives an
    // imported constant key a different priority than the literal at-rule.)
    const {root, src} = await fixture();
    const provider = path.join(root, 'provider');
    await fs.mkdir(provider, {recursive: true});
    await fs.writeFile(
      path.join(provider, 'motion.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const motion = stylex.defineConsts({fade: '200ms'});\nexport const tones = stylex.defineVars({'--probe-tone': 'green'});\n`,
    );
    await fs.writeFile(
      path.join(provider, 'Panel.ts'),
      `import * as stylex from '@stylexjs/stylex';\nimport {motion, tones} from './motion.stylex';\nexport const styles = stylex.create({panel: {color: tones['--probe-tone'], transitionDuration: motion.fade}});\n`,
    );
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      `import * as stylex from '@stylexjs/stylex';\nimport {motion} from '@probe/motion.stylex';\nexport const styles = stylex.create({row: {transitionProperty: 'opacity', transitionDuration: motion.fade}});\n`,
    );
    const providerTarget = {src: provider, aliases: {}};
    const css = stylexBabelPlugin.processStylexRules(
      await collectStyleXCSS({
        src,
        aliases: {'@probe/*': [path.join(provider, '*')]},
        provider: providerTarget,
      }),
      false,
    );
    expect(css).toMatch(/transition-duration:\s*(200ms|\.2s)/);
    expect(undefinedStyleXVariables(css)).toEqual([]);
    // The provider's variable group stays in the provider's stylesheet.
    expect(css).not.toContain('--probe-tone');
  });

  it('fails closed when an explicit distribution entry is missing', async () => {
    const {src} = await fixture();
    await expect(
      collectStyleXCSS({
        src,
        aliases: {},
        stylexEntries: ['missing.stylex.ts'],
      }),
    ).rejects.toThrow('ENOENT');
  });

  it('ignores type-only imports and re-exports', async () => {
    const {src, external} = await fixture();
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      `import type {ProbeToken} from '@probe/types.stylex';\nexport type {ProbeToken as ExportedProbeToken} from '@probe/types.stylex';\nexport type ConsumerToken = ProbeToken;\n`,
    );
    await fs.writeFile(
      path.join(src, 'InlineTypeConsumer.ts'),
      `import {type ProbeToken} from '@probe/types.stylex';\nexport type InlineConsumerToken = ProbeToken;\n`,
    );
    await fs.writeFile(
      path.join(external, 'types.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const typeVars = stylex.defineVars({'--probe-type-only': 'green'});\nexport type ProbeToken = keyof typeof typeVars;\n`,
    );

    const rules = await collectStyleXCSS({
      src,
      aliases: {'@probe/*': [path.join(external, '*')]},
    });

    expect(rules).toEqual([]);
  });

  it('leaves a variable group to the provider stylesheet that already emits it', async () => {
    const {root, src, external} = await fixture();
    const provider = path.join(root, 'provider');
    await fs.mkdir(provider, {recursive: true});
    await fs.writeFile(
      path.join(provider, 'Component.ts'),
      `import {sharedVars} from '../external/shared.stylex';\nexport const color = sharedVars['--probe-shared'];\n`,
    );
    await fs.writeFile(
      path.join(src, 'Consumer.ts'),
      `import {sharedVars} from '@probe/shared.stylex';\nimport {dataVars} from '@probe/data.stylex';\nexport const colors = [sharedVars['--probe-shared'], dataVars['--probe-data']];\n`,
    );
    await fs.writeFile(
      path.join(external, 'shared.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const sharedVars = stylex.defineVars({'--probe-shared': 'red'});\n`,
    );
    await fs.writeFile(
      path.join(external, 'data.stylex.ts'),
      `import * as stylex from '@stylexjs/stylex';\nexport const dataVars = stylex.defineVars({'--probe-data': 'blue'});\n`,
    );

    const rules = await collectStyleXCSS({
      src,
      aliases: {'@probe/*': [path.join(external, '*')]},
      provider: {src: provider, aliases: {}},
    });
    const css = stylexBabelPlugin.processStylexRules(rules, false);

    expect(css).toContain('--probe-data:blue');
    expect(css).not.toContain('--probe-shared');
  });
});

describe('build-css undefined StyleX variables', () => {
  async function compile(consumer, modules) {
    const {src, external} = await fixture();
    await fs.writeFile(path.join(src, 'Consumer.ts'), consumer);
    for (const [name, source] of Object.entries(modules)) {
      await fs.writeFile(path.join(external, name), source);
    }
    const rules = await collectStyleXCSS({
      src,
      aliases: {'@probe/*': [path.join(external, '*')]},
    });
    return stylexBabelPlugin.processStylexRules(rules, false);
  }

  const tokens = `import * as stylex from '@stylexjs/stylex';
export const probeVars = stylex.defineVars({'--probe-ring-width': '2px'});
export const probeConsts = stylex.defineConsts({cap: 'calc(100dvb - 32px)'});
export const PLAIN_PARTS = {outlineWidth: probeVars['--probe-ring-width']};
`;

  it('reports a plain object from a .stylex.ts module read inside stylex.create', async () => {
    const css = await compile(
      `import * as stylex from '@stylexjs/stylex';
import {PLAIN_PARTS} from '@probe/tokens.stylex';
export const styles = stylex.create({ring: {outlineWidth: PLAIN_PARTS.outlineWidth}});
`,
      {'tokens.stylex.ts': tokens},
    );
    const missing = undefinedStyleXVariables(css);
    expect(missing).toHaveLength(1);
    expect(css).toContain(`outline-width:var(${missing[0]})`);
  });

  it('reports a defineConsts member passed to firstThatWorks on its own, not one inside calc()', async () => {
    const alone = await compile(
      `import * as stylex from '@stylexjs/stylex';
import {probeConsts} from '@probe/tokens.stylex';
export const styles = stylex.create({box: {maxHeight: stylex.firstThatWorks(probeConsts.cap, '90vh')}});
`,
      {'tokens.stylex.ts': tokens},
    );
    expect(undefinedStyleXVariables(alone)).toHaveLength(1);

    const wrapped = await compile(
      `import * as stylex from '@stylexjs/stylex';
import {probeConsts} from '@probe/tokens.stylex';
export const styles = stylex.create({box: {maxHeight: stylex.firstThatWorks(\`calc(\${probeConsts.cap})\`, '90vh')}});
`,
      {'tokens.stylex.ts': tokens},
    );
    expect(undefinedStyleXVariables(wrapped)).toEqual([]);
    expect(wrapped).toContain('calc(calc(100dvb - 32px))');
  });

  it('accepts defineVars tokens and dynamic-style variables', async () => {
    const css = await compile(
      `import * as stylex from '@stylexjs/stylex';
import {probeVars} from '@probe/tokens.stylex';
export const styles = stylex.create({
  ring: {outlineWidth: probeVars['--probe-ring-width']},
  inset: (block) => ({marginBlockStart: block}),
});
`,
      {'tokens.stylex.ts': tokens},
    );
    expect(css).toMatch(/var\(--x-/);
    expect(undefinedStyleXVariables(css)).toEqual([]);
  });

  it("counts the provider stylesheet's declarations", () => {
    const satellite = '.xabc{color:var(--x1provided)}';
    expect(undefinedStyleXVariables(satellite)).toEqual(['--x1provided']);
    expect(
      undefinedStyleXVariables(satellite, ':root{--x1provided:red}'),
    ).toEqual([]);
  });
});
