// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Regression tests for custom-variant type augmentations and runtime
 * discovery emitted by `astryx theme build`.
 *
 * When a theme declares a custom component prop value (e.g.
 * `button['variant:accentOutline']`), the build emits a `<name>.variants.d.ts`
 * with a module augmentation so the custom value type-checks. This suite pins
 * the bugs that made those values unavailable to consumers:
 *
 *   1. The augmentation targeted a non-existent, `XDS`-prefixed interface
 *      (`XDSButtonVariantMap`) instead of core's real `ButtonVariantMap`, so it
 *      created a new unused interface and never widened the prop union.
 *   2. Props with no augmentation point (closed literal-union types such as
 *      Button `size` or Heading `level`) still got a `declare module`
 *      block against a `*Map` interface that doesn't exist.
 *   3. The generated `.variants.d.ts` was never referenced by the main
 *      `<name>.d.ts`, so even a correct augmentation never loaded.
 *   4. The augmentation targeted the public component subpath while the prop
 *      type read a map from the implementation module, so TypeScript merged the
 *      public interface but the component still saw the original closed union.
 *   5. The custom variants existed only as that type augmentation — the built
 *      JS module carried no runtime metadata, so `resolveTheme()` always
 *      handed the CLI `variants: null` and `astryx component`'s
 *      `*`-annotation for theme-added variants could never fire. The
 *      module now exports `themeVariants` beside (never inside) the theme
 *      object, keyed by component and prop.
 *
 * Building `astryx theme build` requires a compiled @astryxdesign/core, so this
 * suite builds core once in beforeAll (mirrors build-theme.prose.test.mjs).
 */

import {describe, it, expect, beforeAll, beforeEach, afterEach} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ensureCoreBuilt} from './ensure-core-built.mjs';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../../test-utils/linked-fixture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_ROOT = path.resolve(HERE, '../../..');
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

  it('unions and deduplicates root, onDark, and onLight values in types and runtime metadata', async () => {
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
            heading: {
              'type:editorial': { letterSpacing: '-0.02em' },
              'type:shared': { fontWeight: 500 },
              'type:hero': { fontSize: '72px' },
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
    const variantsDts = fs.readFileSync(variantsPath, 'utf-8');
    expect(variantsDts).toMatch(/interface HeadingTypeMap\b/);
    expect(variantsDts).toContain("'hero': true;");
    expect(variantsDts).toContain("'editorial': true;");
    expect(variantsDts).toContain("'shared': true;");
    expect(
      [...variantsDts.matchAll(/'([^']+)': true;/g)].map(([, value]) => value),
    ).toEqual(['shared', 'hero', 'editorial']);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect(built.themeVariants).toEqual({
      heading: {type: ['shared', 'hero', 'editorial']},
    });

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

  it('shows built theme variants in full and brief component docs through project config', async () => {
    // The type augmentation alone is invisible to `astryx component`, which
    // reads the RUNTIME theme module via resolveTheme(). The built module must
    // export the same data as `themeVariants` — `{ [componentKey]: { [prop]:
    // value[] } }` — which component-format.mjs stars as `prop:value*`.
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          button: { 'variant:accentOutline': { backgroundColor: 'transparent' } },
          badge: { 'variant:gray': { backgroundColor: '#eee' } },
          heading: { 'type:hero': { fontSize: '80px' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect(built.themeVariants).toEqual({
      button: {variant: ['accentOutline']},
      badge: {variant: ['gray']},
      heading: {type: ['hero']},
    });
    // CLI metadata stays outside the DefinedTheme export.
    expect('variants' in built.variantsThemeTheme).toBe(false);

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        type: 'module',
        astryx: {theme: './variants-theme.js'},
      }),
    );
    const coreDir = path.join(tmpDir, 'packages', 'core');
    fs.mkdirSync(path.dirname(coreDir), {recursive: true});
    fs.symlinkSync(path.resolve(CLI_ROOT, '../core'), coreDir);

    for (const [component, value] of [
      ['Badge', 'variant:gray'],
      ['Heading', 'type:hero'],
    ]) {
      const full = await runCli(['component', component], tmpDir);
      expect(full.code).toBe(0);
      expect(full.stdout).toContain(`${value}*`);
      expect(full.stdout).toContain(
        '_\\* = custom variant from variants-theme theme_',
      );

      const brief = await runCli(
        ['component', component, '--detail', 'brief'],
        tmpDir,
      );
      expect(brief.code).toBe(0);
      expect(brief.stdout).toContain(`theme: ${value}*`);
    }
  });

  it('keeps each custom value under its prop for a component with two extensible props', async () => {
    // Banner accepts theme values on both `container` and `status`. A map
    // flattened by component would list `glass` and `critical` beside both
    // prop names without saying which prop accepts which value.
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: {
          banner: {
            'container:glass': { backdropFilter: 'blur(8px)' },
            'status:critical': { borderColor: 'red' },
          },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect(built.themeVariants).toEqual({
      banner: {container: ['glass'], status: ['critical']},
    });
    expect(
      fs.readFileSync(path.join(tmpDir, 'variants-theme.d.ts'), 'utf-8'),
    ).toContain('export declare const themeVariants:');
    const variantsDts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.variants.d.ts'),
      'utf-8',
    );
    expect(variantsDts).toMatch(
      /interface BannerContainerMap \{\s*'glass': true;\s*\}/,
    );
    expect(variantsDts).toMatch(
      /interface BannerStatusMap \{\s*'critical': true;\s*\}/,
    );

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        type: 'module',
        astryx: {theme: './variants-theme.js'},
      }),
    );
    const coreDir = path.join(tmpDir, 'packages', 'core');
    fs.mkdirSync(path.dirname(coreDir), {recursive: true});
    fs.symlinkSync(path.resolve(CLI_ROOT, '../core'), coreDir);

    const full = await runCli(['component', 'Banner'], tmpDir);
    expect(full.code).toBe(0);
    const bannerRow = full.stdout
      .split('\n')
      .find(line => line.startsWith('| `astryx-banner` |'));
    expect(bannerRow).toContain('container:glass*, status:critical*');
    expect(full.stdout).not.toMatch(/container:critical|status:glass/);

    const brief = await runCli(
      ['component', 'Banner', '--detail', 'brief'],
      tmpDir,
    );
    expect(brief.code).toBe(0);
    expect(brief.stdout).toContain('theme: container:glass*, status:critical*');
    expect(brief.stdout).not.toMatch(/container:critical|status:glass/);
  });

  it('keeps runtime variants aligned with the .d.ts: non-augmentable props are excluded', async () => {
    // HeadingTypeMap makes `type:hero` augmentable, while Button `size` remains
    // a closed union. Runtime metadata must follow the same classification as
    // the declarations so the CLI advertises only values consumers can use.
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
          heading: { 'type:hero': { fontSize: '80px' } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect(built.themeVariants).toEqual({
      button: {variant: ['accentOutline']},
      heading: {type: ['hero']},
    });
    const variantsDts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.variants.d.ts'),
      'utf-8',
    );
    expect(variantsDts).toContain('interface ButtonVariantMap');
    expect(variantsDts).toContain('interface HeadingTypeMap');
    expect(variantsDts).toContain("'accentOutline': true;");
    expect(variantsDts).toContain("'hero': true;");
    expect(variantsDts).not.toContain('ButtonSizeMap');
    expect(variantsDts).not.toContain("'jumbo': true;");
  });

  it('discovers custom values when the theme has only color-scheme component layers', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        onDark: {
          components: { heading: { 'type:hero': { fontSize: '80px' } } },
        },
        onLight: {
          components: { badge: { 'variant:gray': { backgroundColor: '#eee' } } },
        },
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect(built.themeVariants).toEqual({
      heading: {type: ['hero']},
      badge: {variant: ['gray']},
    });
    const variantsDts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.variants.d.ts'),
      'utf-8',
    );
    expect(variantsDts).toContain("'hero': true;");
    expect(variantsDts).toContain("'gray': true;");
  });

  it('preserves inherited custom values when extending a built theme artifact', async () => {
    writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        components: { badge: { 'variant:gray': { backgroundColor: '#eee' } } },
        onDark: {
          components: { heading: { 'type:hero': { fontSize: '80px' } } },
        },
      };\n`,
    );
    const base = await runCli(['theme', 'build', 'variants-theme.mjs'], tmpDir);
    expect(base.code).toBe(0);

    fs.writeFileSync(
      path.join(tmpDir, 'variant-child.mjs'),
      `import {variantsThemeTheme} from './variants-theme.js';
      export default {
        name: 'variant-child',
        extends: variantsThemeTheme,
        tokens: {},
        components: {
          badge: {
            'variant:gray': { color: '#222' },
            'variant:brand': { backgroundColor: '#cef' },
          },
        },
        onLight: {
          components: { heading: { 'type:editorial': { fontSize: '48px' } } },
        },
      };\n`,
    );
    const child = await runCli(['theme', 'build', 'variant-child.mjs'], tmpDir);
    expect(child.code).toBe(0);

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variant-child.js')).href
    );
    expect(built.themeVariants).toEqual({
      badge: {variant: ['gray', 'brand']},
      heading: {type: ['hero', 'editorial']},
    });
    const variantsDts = fs.readFileSync(
      path.join(tmpDir, 'variant-child.variants.d.ts'),
      'utf-8',
    );
    expect(
      [...variantsDts.matchAll(/'([^']+)': true;/g)].map(([, value]) => value),
    ).toEqual(['gray', 'brand', 'hero', 'editorial']);
  });

  it('emits no themeVariants export when the theme adds no custom variants', async () => {
    // Themes without custom values keep the historical module shape — no
    // `themeVariants` export or declaration, matching what an older CLI
    // produced and what component-format.mjs treats as "no theme variants".
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

    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect('themeVariants' in built).toBe(false);
    expect('variants' in built.variantsThemeTheme).toBe(false);
    expect(
      fs.readFileSync(path.join(tmpDir, 'variants-theme.d.ts'), 'utf-8'),
    ).not.toContain('themeVariants');
  });

  it('writes the icon variant augmentation and no themeVariants export for a theme with icon variants and no custom values', async () => {
    const themeFile = writeTheme(
      tmpDir,
      `export default {
        name: 'variants-theme',
        tokens: { '--color-bg': '#fff' },
        iconVariants: ['outline', 'filled'],
      };\n`,
    );

    const result = await runCli(
      ['theme', 'build', path.relative(tmpDir, themeFile)],
      tmpDir,
    );
    expect(result.code).toBe(0);

    const variantsDts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.variants.d.ts'),
      'utf-8',
    );
    expect(variantsDts).toContain(`declare module '@astryxdesign/core/Icon'`);
    expect(variantsDts).toContain('interface IconVariantMap');
    expect(
      [...variantsDts.matchAll(/'([^']+)': true;/g)].map(([, value]) => value),
    ).toEqual(['outline', 'filled']);
    const built = await import(
      pathToFileURL(path.join(tmpDir, 'variants-theme.js')).href
    );
    expect('themeVariants' in built).toBe(false);
    const dts = fs.readFileSync(
      path.join(tmpDir, 'variants-theme.d.ts'),
      'utf-8',
    );
    expect(dts).toContain(
      '/// <reference path="./variants-theme.variants.d.ts" />',
    );
    expect(dts).not.toContain('themeVariants');
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
