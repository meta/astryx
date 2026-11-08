// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression test for the custom-variant type augmentations emitted by
 * `astryx theme build` (#3391 companion: #3371).
 *
 * When a theme declares a custom component prop value (e.g.
 * `button['variant:accentOutline']`), the build emits a `<name>.variants.d.ts`
 * with a module augmentation so the custom value type-checks. This suite pins
 * the two bugs that made that augmentation dead code:
 *
 *   1. The augmentation targeted a non-existent, `XDS`-prefixed interface
 *      (`XDSButtonVariantMap`) instead of core's real `ButtonVariantMap`, so it
 *      created a new unused interface and never widened the prop union.
 *   2. Props with no augmentation point (closed literal-union types such as
 *      Button `size` or Heading `type`/`level`) still got a `declare module`
 *      block against a `*Map` interface that doesn't exist.
 *   3. The generated `.variants.d.ts` was never referenced by the main
 *      `<name>.d.ts`, so even a correct augmentation never loaded.
 *   4. The augmentation targeted the public component subpath while the prop
 *      type read a map from the implementation module, so TypeScript merged the
 *      public interface but the component still saw the original closed union.
 *
 * Building `astryx theme build` requires a compiled @astryxdesign/core, so this
 * suite builds core once in beforeAll (mirrors build-theme.prose.test.mjs).
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';

const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc');
// A consumer project type-checks against core and React's types.
const CONSUMER_PACKAGES = ['@astryxdesign', 'react', '@types/react'];

function writeTheme(dir, contents) {
  fs.mkdirSync(dir, {recursive: true});
  const file = path.join(dir, 'variants-theme.mjs');
  fs.writeFileSync(file, contents);
  return file;
}

// Build core through the shared lock helper — this suite previously ran its
// own unguarded `if (!exists) pnpm -F core build`, and when Vitest scheduled
// it alongside the other build-theme suites on a fresh checkout, the
// concurrent builds collided on packages/core/dist (core's build starts by
// wiping dist), nondeterministically breaking whichever suite was mid-read.
beforeAll(() => {
  ensureCoreBuilt();
}, 200_000);

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'astryx-build-theme-variants-'),
  );
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe('theme build custom-variant augmentations', () => {
  it('targets the real (un-prefixed) core interface for a custom variant', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          button: { 'variant:accentOutline': { backgroundColor: 'transparent' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const variantsPath = path.join(tmpDir, 'variants-theme.variants.d.ts');
    expect(fs.existsSync(variantsPath)).toBe(true);
    const dts = fs.readFileSync(variantsPath, 'utf-8');

    // Targets core's actual augmentation point…
    expect(dts).toContain("declare module '@astryxdesign/core/Button'");
    expect(dts).toMatch(/interface ButtonVariantMap\b/);
    expect(dts).toContain("'accentOutline': true;");
    // …and NOT the old, non-existent XDS-prefixed interface.
    expect(dts).not.toMatch(/XDSButtonVariantMap/);
  });

  it('targets CustomTextTypes in core/theme for a custom text type', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          text: { 'type:customTextType': { fontSize: '24px' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const variantsPath = path.join(tmpDir, 'variants-theme.variants.d.ts');
    expect(fs.existsSync(variantsPath)).toBe(true);
    const dts = fs.readFileSync(variantsPath, 'utf-8');

    expect(dts).toContain("declare module '@astryxdesign/core/theme'");
    expect(dts).toMatch(/interface CustomTextTypes\b/);
    expect(dts).toContain("'customTextType': true;");
  });

  it('emits Heading custom types and skips props with no augmentation point', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          button: {
            'variant:accentOutline': { backgroundColor: 'transparent' },
            'size:jumbo': { paddingBlock: '40px' },
          },
          heading: {
            'weight:bold': { fontWeight: '900' },
            'type:hero': { fontSize: '80px', fontWeight: '300' },
          },
        },
        onDark: {
          components: {
            heading: {
              'weight:bold': { fontWeight: '800' },
              'type:hero': { fontWeight: '350' },
            },
          },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const variantsPath = path.join(tmpDir, 'variants-theme.variants.d.ts');
    expect(fs.existsSync(variantsPath)).toBe(true);
    const dts = fs.readFileSync(variantsPath, 'utf-8');

    // The augmentable values are emitted…
    expect(dts).toMatch(/interface ButtonVariantMap\b/);
    expect(dts).toMatch(/interface HeadingTypeMap\b/);
    expect(dts).toContain("'hero': true;");
    expect(dts).toContain("declare module '@astryxdesign/core/Heading'");
    // …but closed literal-union props still get no dead augmentation.
    expect(dts).not.toMatch(/ButtonSizeMap/);

    const css = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.css'),
      'utf-8',
    );
    const mainTypeIndex = css.indexOf('.astryx-heading[data-type="hero"]');
    const mainTypeWeightIndex = css.indexOf('font-weight: 300;', mainTypeIndex);
    const mainWeightIndex = css.indexOf('.astryx-heading[data-weight="bold"]');
    const mainWeightValueIndex = css.indexOf(
      'font-weight: 900;',
      mainWeightIndex,
    );
    const mediaTypeIndex = css.lastIndexOf('.astryx-heading[data-type="hero"]');
    const mediaTypeWeightIndex = css.indexOf(
      'font-weight: 350;',
      mediaTypeIndex,
    );
    const mediaWeightIndex = css.lastIndexOf(
      '.astryx-heading[data-weight="bold"]',
    );
    const mediaWeightValueIndex = css.indexOf(
      'font-weight: 800;',
      mediaWeightIndex,
    );
    expect(mainTypeWeightIndex).toBeGreaterThan(mainTypeIndex);
    expect(mainWeightValueIndex).toBeGreaterThan(mainWeightIndex);
    expect(mediaTypeWeightIndex).toBeGreaterThan(mediaTypeIndex);
    expect(mediaWeightValueIndex).toBeGreaterThan(mediaWeightIndex);
  });

  it('unions custom Heading types from onDark and onLight into the public type contract', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          heading: { 'type:shared': { fontWeight: 600 } },
        },
        onDark: {
          components: {
            heading: {
              'type:hero': { fontSize: '80px' },
              'type:shared+level:1': { lineHeight: 1 },
            },
          },
        },
        onLight: {
          components: {
            heading: { 'type:editorial': { letterSpacing: '-0.02em' } },
          },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const variantsPath = path.join(tmpDir, 'variants-theme.variants.d.ts');
    expect(fs.existsSync(variantsPath)).toBe(true);
    const variantsDts = fs.readFileSync(variantsPath, 'utf-8');
    expect(variantsDts).toMatch(/interface HeadingTypeMap\b/);
    expect(variantsDts).toContain("'hero': true;");
    expect(variantsDts).toContain("'editorial': true;");
    expect(variantsDts).toContain("'shared': true;");

    const projectDir = makeLinkedFixture(
      'astryx-surface-heading-consumer-',
      CONSUMER_PACKAGES,
    );
    fs.copyFileSync(
      path.join(tmpDir, 'variants-theme.d.ts'),
      path.join(projectDir, 'variants-theme.d.ts'),
    );
    fs.copyFileSync(
      variantsPath,
      path.join(projectDir, 'variants-theme.variants.d.ts'),
    );
    fs.writeFileSync(
      path.join(projectDir, 'probe.tsx'),
      `import './variants-theme';\n` +
        `import {Heading} from '@astryxdesign/core/Heading';\n\n` +
        `export const Probe = () => (\n` +
        `  <>\n` +
        `    <Heading level={1} type="hero">Hero</Heading>\n` +
        `    <Heading level={2} type="editorial">Editorial</Heading>\n` +
        `    <Heading level={3} type="shared">Shared</Heading>\n` +
        `  </>\n` +
        `);\n`,
    );
    fs.writeFileSync(
      path.join(projectDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'esnext',
            target: 'es2022',
            jsx: 'react-jsx',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
          },
          include: ['*.tsx', '*.d.ts'],
        },
        null,
        2,
      ),
    );

    try {
      execFileSync(
        process.execPath,
        [TSC, '--project', 'tsconfig.json', '--noEmit'],
        {cwd: projectDir, stdio: 'pipe'},
      );
    } finally {
      removeLinkedFixture(projectDir);
    }
  });

  it('does not emit a .variants.d.ts when every custom value is non-augmentable', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          button: { 'size:jumbo': { paddingBlock: '40px' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);
    expect(
      fs.existsSync(path.join(tmpDir, 'variants-theme.variants.d.ts')),
    ).toBe(false);
  });

  it('rejects an empty or combination-only custom Heading type', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        onDark: {
          components: {
            heading: { 'type:hero': { ':hover': {} } },
          },
        },
        onLight: {
          components: {
            heading: {
              'type:eyebrow+color:accent': { letterSpacing: '0.08em' },
            },
          },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'Custom Heading type "hero" needs a non-empty standalone',
    );
    expect(result.stderr).toContain(
      'Custom Heading type "eyebrow" needs a non-empty standalone',
    );
    expect(result.stderr).toContain('onDark.components.heading["type:hero"]');
    expect(result.stderr).toContain(
      'onLight.components.heading["type:eyebrow"]',
    );
  });

  it('rejects a custom Heading type whose only declaration is blank', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: { heading: { 'type:hero': { fontSize: '' } } },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      'Custom Heading type "hero" needs a non-empty standalone',
    );
    expect(fs.existsSync(path.join(tmpDir, 'variants-theme.css'))).toBe(false);
  });

  it('rejects a custom Heading type whose every declaration the compiler drops', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          heading: { 'type:hero': { color: 'red; } body { color: blue' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['--json', 'theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );

    expect(result.code).toBe(1);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.code).toBe('ERR_THEME_INVALID');
    expect(envelope.error).toContain('Custom Heading type "hero"');
    expect(fs.existsSync(path.join(tmpDir, 'variants-theme.css'))).toBe(false);
    expect(
      fs.existsSync(path.join(tmpDir, 'variants-theme.variants.d.ts')),
    ).toBe(false);
  });

  it('builds a custom Heading type that keeps one valid declaration', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          heading: {
            'type:hero': { fontSize: '80px', color: 'red; } body { color: blue' },
          },
        },
      };\n`,
    );

    const result = await runCli(
      ['--json', 'theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );

    expect(result.code).toBe(0);
    const envelope = JSON.parse(result.stdout);
    expect(envelope.data.outputs.variantsDts).toBe(
      'variants-theme.variants.d.ts',
    );
    expect(envelope.data.warnings.join('\n')).toContain('Declaration dropped');
  });

  it('makes generated custom component prop values type-check through public subpaths', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          'app-shell': { 'variant:customAppShell': { backgroundColor: 'transparent' } },
          'avatar-status-dot': { 'variant:customAvatarDot': { backgroundColor: 'transparent' } },
          badge: { 'variant:customBadge': { backgroundColor: 'transparent' } },
          banner: {
            'status:customBannerStatus': { backgroundColor: 'transparent' },
            'container:customBannerContainer': { padding: '1px' },
          },
          breadcrumbs: { 'variant:customBreadcrumbs': { color: 'currentColor' } },
          button: { 'variant:customButton': { backgroundColor: 'transparent' } },
          card: { 'variant:customCard': { backgroundColor: 'transparent' } },
          dialog: { 'variant:customDialog': { backgroundColor: 'transparent' } },
          divider: { 'variant:customDivider': { borderColor: 'currentColor' } },
          'field-status': { 'variant:customFieldStatus': { color: 'currentColor' } },
          pagination: { 'variant:customPagination': { color: 'currentColor' } },
          'progress-bar': { 'variant:customProgressBar': { backgroundColor: 'transparent' } },
          section: { 'variant:customSection': { backgroundColor: 'transparent' } },
          'status-dot': { 'variant:customStatusDot': { backgroundColor: 'transparent' } },
          heading: { 'type:customHeading': { fontSize: '3rem' } },
          text: {
            'color:customTextColor': { color: 'currentColor' },
            'type:customTextType': { fontSize: '24px' },
          },
          token: { 'color:customTokenColor': { backgroundColor: 'transparent' } },
        },
      };
`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const projectDir = makeLinkedFixture(
      'astryx-variant-consumer-',
      CONSUMER_PACKAGES,
    );
    fs.copyFileSync(
      path.join(tmpDir, 'variants-theme.d.ts'),
      path.join(projectDir, 'variants-theme.d.ts'),
    );
    fs.copyFileSync(
      path.join(tmpDir, 'variants-theme.variants.d.ts'),
      path.join(projectDir, 'variants-theme.variants.d.ts'),
    );
    fs.writeFileSync(
      path.join(projectDir, 'probe.tsx'),
      `import './variants-theme';\n` +
        `import {AppShell} from '@astryxdesign/core/AppShell';\n` +
        `import {AvatarStatusDot} from '@astryxdesign/core/Avatar';\n` +
        `import {Badge} from '@astryxdesign/core/Badge';\n` +
        `import {Banner} from '@astryxdesign/core/Banner';\n` +
        `import {Breadcrumbs} from '@astryxdesign/core/Breadcrumbs';\n` +
        `import {Button} from '@astryxdesign/core/Button';\n` +
        `import {Card} from '@astryxdesign/core/Card';\n` +
        `import {Dialog} from '@astryxdesign/core/Dialog';\n` +
        `import {Divider} from '@astryxdesign/core/Divider';\n` +
        `import {FieldStatus} from '@astryxdesign/core/FieldStatus';\n` +
        `import {Pagination} from '@astryxdesign/core/Pagination';\n` +
        `import {ProgressBar} from '@astryxdesign/core/ProgressBar';\n` +
        `import {Section} from '@astryxdesign/core/Section';\n` +
        `import {StatusDot} from '@astryxdesign/core/StatusDot';\n` +
        `import {Heading} from '@astryxdesign/core/Heading';\n` +
        `import {Text} from '@astryxdesign/core/Text';\n` +
        `import {Token} from '@astryxdesign/core/Token';\n\n` +
        `export function Probe() {\n` +
        `  return (\n` +
        `    <>\n` +
        `      <AppShell variant="customAppShell">Shell</AppShell>\n` +
        `      <AvatarStatusDot variant="customAvatarDot" />\n` +
        `      <Badge label="Badge" variant="customBadge" />\n` +
        `      <Banner title="Banner" status="customBannerStatus" container="customBannerContainer" />\n` +
        `      <Breadcrumbs variant="customBreadcrumbs">Crumbs</Breadcrumbs>\n` +
        `      <Button label="Button" variant="customButton" />\n` +
        `      <Card variant="customCard">Card</Card>\n` +
        `      <Dialog isOpen onOpenChange={() => {}} variant="customDialog">Body</Dialog>\n` +
        `      <Divider variant="customDivider" />\n` +
        `      <FieldStatus type="success" message="Ok" variant="customFieldStatus" />\n` +
        `      <Pagination page={1} totalPages={2} onChange={() => {}} variant="customPagination" />\n` +
        `      <ProgressBar label="Progress" value={50} variant="customProgressBar" />\n` +
        `      <Section variant="customSection">Section</Section>\n` +
        `      <StatusDot label="Status" variant="customStatusDot" />\n` +
        `      <Heading level={2} type="customHeading">Heading</Heading>\n` +
        `      <Text color="customTextColor" type="customTextType">Text</Text>\n` +
        `      <Token label="Token" color="customTokenColor" />\n` +
        `    </>\n` +
        `  );\n` +
        `}\n`,
    );
    fs.writeFileSync(
      path.join(projectDir, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            module: 'esnext',
            target: 'es2022',
            jsx: 'react-jsx',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
          },
          include: ['*.tsx', '*.d.ts'],
        },
        null,
        2,
      ),
    );

    try {
      execFileSync(
        process.execPath,
        [TSC, '--project', 'tsconfig.json', '--noEmit'],
        {
          cwd: projectDir,
          stdio: 'pipe',
        },
      );
    } finally {
      removeLinkedFixture(projectDir);
    }
  });

  it('references the variants file from the main .d.ts so the augmentation loads', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          button: { 'variant:accentOutline': { backgroundColor: 'transparent' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const dts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.d.ts'),
      'utf-8',
    );
    // A triple-slash reference to the variants file, so importing the theme's
    // types also loads the module augmentation.
    expect(dts).toMatch(
      /\/\/\/\s*<reference path="\.\/variants-theme\.variants\.d\.ts"\s*\/>/,
    );
  });
});
