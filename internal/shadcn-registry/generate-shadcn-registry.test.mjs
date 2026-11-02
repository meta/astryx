// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Registry serializer contract tests.
 * @input Minimal component, block, page, and StyleX fixtures.
 * @output Regression coverage for schema, package boundaries, names, and output.
 *   The stock-ShadCN cases leave nothing in the system temporary directory:
 *   ShadCN's own scratch directories stay in each consumer project, and the
 *   no-op package managers are removed after the file.
 * @position Node test lane for ShadCN compatibility.
 */

import {execFile} from 'node:child_process';
import {createServer} from 'node:http';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {afterAll, describe, expect, it} from 'vitest';
import {reconcileRegistryCompositions} from '../../packages/cli/api/upgrade/registry/registry.mjs';
import {
  createShadcnPrecompiledDeclaration,
  shadcnPrecompiledDeclarationTarget,
} from '../../packages/cli/authoring/shadcn/source-variants.mjs';
import {
  parseRegistryReceipt,
  registryContentHash,
} from '../../packages/cli/authoring/shadcn/receipt.mjs';
import {
  buildShadcnRegistry,
  generateShadcnRegistry,
  generateShadcnRegistryForTarget,
} from '../../apps/docsite/scripts/generate-shadcn-registry.mjs';
import {
  SHADCN_CLI_VERSION,
  blockRegistryIdentity,
  componentRegistryIdentity,
  pageRegistryIdentity,
  registryNameForPath,
  resolveShadcnRegistryOrigin,
  shadcnInstallCommand,
} from '../../apps/docsite/src/lib/shadcnRegistry.mjs';

const execFileAsync = promisify(execFile);

const DOCSITE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../apps/docsite',
);

// shadcn is a docsite dependency and its bin is the package entry, so resolving
// it from docsite gives the script to run — no assumption about where the
// installer put the package, and no dependence on NODE_PATH.
const SHADCN_ENTRY = createRequire(
  path.join(DOCSITE_ROOT, 'package.json'),
).resolve('shadcn');

// Before it writes files, ShadCN installs an item's npm dependencies with the
// project's package manager. These tests check what ShadCN writes, not what a
// registry install resolves, so no-op package managers first on PATH keep them
// off the network. A real install of the items' pinned packages downloaded the
// full registry metadata for @astryxdesign/core and could stall past the spawn
// timeout.
const NOOP_PACKAGE_MANAGERS = mkdtempSync(
  path.join(tmpdir(), 'astryx-noop-pm-'),
);
for (const name of ['pnpm', 'npm', 'yarn', 'bun']) {
  writeFileSync(path.join(NOOP_PACKAGE_MANAGERS, name), '#!/bin/sh\nexit 0\n', {
    mode: 0o755,
  });
}
const SHADCN_ENV = {
  ...process.env,
  PATH: `${NOOP_PACKAGE_MANAGERS}${path.delimiter}${process.env.PATH ?? ''}`,
};
afterAll(() => {
  rmSync(NOOP_PACKAGE_MANAGERS, {recursive: true, force: true});
});

// ShadCN leaves an empty temporary directory behind for every file it
// transforms, so it gets a TMPDIR inside the project, which each test removes.
function shadcnEnv(project) {
  const scratch = path.join(project, '.tmp');
  mkdirSync(scratch, {recursive: true});
  return {...SHADCN_ENV, TMPDIR: scratch};
}

const packages = [
  {
    name: '@astryxdesign/cli',
    version: '0.6.0',
    packageExports: {'.': './dist/index.js', './api': './dist/api.js'},
  },
  {
    name: '@astryxdesign/core',
    version: '0.5.2',
    packageExports: {
      '.': './dist/index.js',
      './Button': './dist/Button/index.js',
    },
  },
];

function fixture(overrides = {}) {
  return {
    packages,
    allComponents: {
      '@astryxdesign/core': [
        {
          name: 'Button',
          displayName: 'Button',
          description: 'Runs an action.',
          importPath: '@astryxdesign/core/Button',
          hidden: false,
          params: null,
        },
      ],
    },
    blocks: [
      {
        dirName: 'ButtonShowcase',
        name: 'Button — Variants',
        displayName: 'Button — Variants',
        description: 'Shows a primary button.',
        exampleFor: 'Button',
        isShowcase: true,
        category: 'components/Button',
        componentsUsed: ['Button'],
        source:
          "import {Button} from '@astryxdesign/core/Button';\n" +
          'export default function ButtonShowcase() { return <Button label="Save" />; }\n',
      },
    ],
    templates: [
      {
        slug: 'dashboard',
        name: 'Dashboard',
        description: 'A metrics dashboard.',
        category: 'Dashboard',
        isReady: true,
        isHiddenFromOverview: false,
        source:
          "import {Card} from '@astryxdesign/core/Card';\n" +
          'export default function Page() { return <Card />; }\n',
      },
    ],
    externalDependencySpecs: {
      '@stylexjs/stylex': '@stylexjs/stylex@0.19.0',
    },
    ...overrides,
  };
}

function writeConsumerProject(project, {tsx = true} = {}) {
  mkdirSync(path.join(project, 'src'), {recursive: true});
  writeFileSync(
    path.join(project, 'package.json'),
    JSON.stringify({
      name: 'registry-consumer-test',
      private: true,
      version: '0.0.0',
    }),
  );
  writeFileSync(
    path.join(project, 'components.json'),
    JSON.stringify({
      $schema: 'https://ui.shadcn.com/schema.json',
      style: 'nova',
      rsc: false,
      tsx,
      tailwind: {
        config: '',
        css: 'src/index.css',
        baseColor: '',
        cssVariables: true,
        prefix: '',
      },
      aliases: {
        components: '@/components',
        utils: '@/lib/utils',
        ui: '@/components/ui',
        lib: '@/lib',
        hooks: '@/hooks',
      },
      iconLibrary: 'lucide',
    }),
  );
  writeFileSync(
    path.join(project, tsx ? 'tsconfig.json' : 'jsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        paths: {'@/*': ['./src/*']},
      },
    }),
  );
  writeFileSync(path.join(project, 'src', 'index.css'), '');
}

describe('resolveShadcnRegistryOrigin', () => {
  it('prefers an explicit registry origin', () => {
    expect(
      resolveShadcnRegistryOrigin({
        NEXT_PUBLIC_ASTRYX_REGISTRY_ORIGIN: 'https://example.com/custom/',
        VERCEL_URL: 'ignored.vercel.app',
      }),
    ).toBe('https://example.com/custom');
  });

  it('uses the Vercel deployment URL for preview builds', () => {
    expect(
      resolveShadcnRegistryOrigin({
        VERCEL_URL: 'astryx-git-example.vercel.app',
      }),
    ).toBe('https://astryx-git-example.vercel.app/shadcn');
  });

  it('pins install commands to the client used for receipt variants', () => {
    const manifest = JSON.parse(
      readFileSync('apps/docsite/package.json', 'utf8'),
    );
    expect(SHADCN_CLI_VERSION).toBe(manifest.devDependencies.shadcn);
    expect(
      shadcnInstallCommand('components/button', 'https://registry.example'),
    ).toBe(
      `npx shadcn@${SHADCN_CLI_VERSION} add https://registry.example/components/button.json`,
    );
  });
});

describe('registry identities', () => {
  it('derives organized paths from stable doc identity', () => {
    expect(
      componentRegistryIdentity('@astryxdesign/core', 'Button'),
    ).toMatchObject({name: 'component-button', path: 'components/button'});
    expect(
      componentRegistryIdentity(
        '@astryxdesign/core',
        'useAppShellMobile',
        true,
      ),
    ).toMatchObject({
      name: 'hook-use-app-shell-mobile',
      path: 'hooks/use-app-shell-mobile',
    });
    expect(
      blockRegistryIdentity('Button — Leading Icon', 'Button', false),
    ).toMatchObject({
      name: 'example-button-leading-icon',
      path: 'examples/button/leading-icon',
    });
    expect(blockRegistryIdentity('Filter Toolbar', null, false)).toMatchObject({
      kind: 'block',
      name: 'block-filter-toolbar',
      path: 'blocks/filter-toolbar',
    });
    expect(pageRegistryIdentity('analytics-dashboard')).toMatchObject({
      name: 'template-analytics-dashboard',
      path: 'templates/analytics-dashboard',
    });
  });

  it('supports an explicit stable slug and prior path aliases', () => {
    expect(
      blockRegistryIdentity('Button — Icon', 'Button', false, {
        slug: 'leading-icon',
        aliases: ['button/icon'],
      }),
    ).toEqual({
      kind: 'example',
      name: 'example-button-leading-icon',
      path: 'examples/button/leading-icon',
      aliases: ['examples/button/icon'],
    });
  });

  it('rejects a standalone block marked as a component showcase', () => {
    expect(() => blockRegistryIdentity('Hero Layout', null, true)).toThrow(
      /requires exampleFor/,
    );
  });

  it('rejects malformed or unknown registry identity fields', () => {
    expect(() =>
      pageRegistryIdentity('dashboard', {slug: 'Dashboard'}),
    ).toThrow(/lowercase kebab-case/);
    expect(() => pageRegistryIdentity('dashboard', {owner: 'docs'})).toThrow(
      /unknown field/,
    );
  });
});

describe('buildShadcnRegistry', () => {
  it('creates standard component, showcase, and page items', () => {
    const {registry, items, counts} = buildShadcnRegistry(fixture());

    expect(counts).toEqual({
      components: 1,
      hooks: 0,
      showcases: 1,
      examples: 0,
      blocks: 0,
      skippedUnpublishedComponents: 0,
      skippedUnpublishedBlocks: 0,
      pages: 1,
      skippedUnpublishedPages: 0,
      total: 3,
    });
    expect(registry.items).toHaveLength(3);
    expect(items.map(item => item.name)).toEqual([
      'component-button',
      'showcase-button-variants',
      'template-dashboard',
    ]);
    expect(items.map(item => item.astryx.path)).toEqual([
      'components/button',
      'showcases/button/variants',
      'templates/dashboard',
    ]);
  });

  it('skips blocks whose component import is not published', () => {
    const input = fixture();
    input.blocks.push({
      ...input.blocks[0],
      dirName: 'TimerShowcase',
      name: 'Timer',
      displayName: 'Timer',
      exampleFor: 'Timer',
      source:
        "import {Timer} from '@astryxdesign/core/Timer';\n" +
        'export default function TimerShowcase() { return <Timer />; }\n',
    });

    const {items, counts} = buildShadcnRegistry(input);

    expect(items.map(item => item.name)).not.toContain(
      'showcase-timer-default',
    );
    expect(counts.skippedUnpublishedBlocks).toBe(1);
  });

  it('omits production blocks that import an unpublished named component', () => {
    const root = mkdtempSync(
      path.join(tmpdir(), 'astryx-shadcn-unpublished-component-'),
    );
    const outDir = path.join(root, 'shadcn');
    try {
      const input = fixture();
      input.blocks.push({
        ...input.blocks[0],
        dirName: 'ButtonFuture',
        name: 'Button — Future',
        displayName: 'Button — Future',
        componentsUsed: ['Button', 'FutureButton'],
        source:
          "import {Button, FutureButton} from '@astryxdesign/core/Button';\n" +
          'export default function ButtonFuture() { return <><Button label="Save" /><FutureButton /></>; }\n',
      });

      const result = generateShadcnRegistryForTarget({
        target: 'latest',
        outDir,
        ...input,
      });

      expect(result.total).toBe(3);
      expect(result.skippedUnpublishedBlocks).toBe(1);
      expect(
        existsSync(path.join(outDir, 'showcases', 'button', 'future.json')),
      ).toBe(false);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('writes canonical nested paths and compatibility aliases', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-routes-'));
    try {
      const input = fixture();
      input.blocks[0].registry = {
        slug: 'button-styles',
        aliases: ['button/variants'],
      };
      input.blocks.push({
        ...input.blocks[0],
        dirName: 'FilterToolbar',
        name: 'Filter Toolbar',
        displayName: 'Filter Toolbar',
        exampleFor: null,
        isShowcase: false,
        registry: null,
      });
      const result = generateShadcnRegistry({
        ...input,
        outDir,
        cliRoot: outDir,
      });

      expect(existsSync(path.join(outDir, 'components', 'button.json'))).toBe(
        true,
      );
      expect(
        existsSync(
          path.join(outDir, 'showcases', 'button', 'button-styles.json'),
        ),
      ).toBe(true);
      expect(
        existsSync(path.join(outDir, 'showcases', 'button', 'variants.json')),
      ).toBe(true);
      expect(
        existsSync(path.join(outDir, 'blocks', 'filter-toolbar.json')),
      ).toBe(true);
      expect(existsSync(path.join(outDir, 'templates', 'dashboard.json'))).toBe(
        true,
      );
      expect(result.routes).toContain('showcases/button/variants');
      expect(result.routes).toContain('blocks/filter-toolbar');

      // Every item is also served at `<name>.json` in the root, the address
      // standard clients derive from the index, with the canonical bytes.
      for (const [name, canonical] of [
        ['component-button', 'components/button'],
        ['showcase-button-button-styles', 'showcases/button/button-styles'],
        ['block-filter-toolbar', 'blocks/filter-toolbar'],
        ['template-dashboard', 'templates/dashboard'],
      ]) {
        expect(readFileSync(path.join(outDir, `${name}.json`), 'utf8')).toBe(
          readFileSync(path.join(outDir, `${canonical}.json`), 'utf8'),
        );
      }
      // The alias keeps the name it stood for, so a renamed item still
      // installs as `@namespace/<old-name>`.
      expect(
        readFileSync(
          path.join(outDir, 'showcase-button-variants.json'),
          'utf8',
        ),
      ).toBe(
        readFileSync(
          path.join(outDir, 'showcases', 'button', 'button-styles.json'),
          'utf8',
        ),
      );
    } finally {
      rmSync(outDir, {recursive: true, force: true});
    }
  });

  it('fails generation when two items would claim the same route', () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-clash-'));
    try {
      const input = fixture();
      input.blocks[0].registry = {slug: 'button-styles'};
      input.blocks.push({
        ...input.blocks[0],
        dirName: 'ButtonStylesCopy',
        name: 'Button Styles Copy',
        displayName: 'Button Styles Copy',
      });
      expect(() =>
        generateShadcnRegistry({...input, outDir, cliRoot: outDir}),
      ).toThrow(/Duplicate shadcn registry item name/);
    } finally {
      rmSync(outDir, {recursive: true, force: true});
    }
  });

  it('maps every organized path to the item name it stands for', () => {
    expect(registryNameForPath('components/button')).toBe('component-button');
    expect(registryNameForPath('components/lab/line-clamp')).toBe(
      'component-lab-line-clamp',
    );
    expect(registryNameForPath('examples/button/icon')).toBe(
      'example-button-icon',
    );
    expect(registryNameForPath('templates/dashboard')).toBe(
      'template-dashboard',
    );
    // No route can be the index: every name starts with a kind prefix.
    expect(() => registryNameForPath('registry')).toThrow(/kind folder/);
  });

  it('generates exact-version compatibility output for production', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-production-'));
    const outDir = path.join(root, 'shadcn');
    try {
      mkdirSync(outDir, {recursive: true});
      writeFileSync(path.join(outDir, 'stale.json'), '{}\n');

      const result = generateShadcnRegistryForTarget({
        target: 'latest',
        outDir,
        ...fixture(),
      });
      expect(result.total).toBe(3);
      expect(existsSync(path.join(outDir, 'stale.json'))).toBe(false);
      const component = JSON.parse(
        readFileSync(path.join(outDir, 'components', 'button.json'), 'utf8'),
      );
      expect(component.dependencies).toEqual([
        '@astryxdesign/core@0.5.2',
        '@stylexjs/stylex@0.19.0',
      ]);
      expect(
        component.dependencies.some(dependency =>
          dependency.includes('@canary'),
        ),
      ).toBe(false);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('fails closed for an unknown registry target', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-unknown-'));
    const outDir = path.join(root, 'shadcn');
    try {
      mkdirSync(outDir, {recursive: true});
      writeFileSync(path.join(outDir, 'stale.json'), '{}\n');

      expect(() =>
        generateShadcnRegistryForTarget({target: 'unknown', outDir}),
      ).toThrow(/Unsupported ShadCN registry target/);
      expect(existsSync(outDir)).toBe(false);
    } finally {
      rmSync(root, {recursive: true, force: true});
    }
  });

  it('creates a first-class standalone block item', () => {
    const standalone = {
      ...fixture().blocks[0],
      dirName: 'FilterToolbar',
      name: 'Filter Toolbar',
      displayName: 'Filter Toolbar',
      exampleFor: null,
      isShowcase: false,
    };
    const {items} = buildShadcnRegistry(fixture({blocks: [standalone]}));
    const block = items.find(item => item.name === 'block-filter-toolbar');

    expect(block.astryx).toMatchObject({
      kind: 'block',
      path: 'blocks/filter-toolbar',
      exampleFor: null,
    });
    expect(block.files[0].target).toBe(
      'components/astryx/blocks/FilterToolbar.tsx',
    );
  });

  it('adds an adjacent provenance receipt only to copied compositions', () => {
    const {items} = buildShadcnRegistry(fixture());
    const component = items.find(item => item.name === 'component-button');
    const block = items.find(item => item.name === 'showcase-button-variants');
    const page = items.find(item => item.name === 'template-dashboard');

    expect(component.files).toHaveLength(1);
    for (const item of [block, page]) {
      expect(item.files).toHaveLength(2);
      const sourceFile = item.files[0];
      const receiptFile = item.files[1];
      expect(receiptFile).toMatchObject({
        type: 'registry:file',
        target: expect.stringContaining('/.astryx/'),
      });
      const receipt = parseRegistryReceipt(JSON.parse(receiptFile.content));
      expect(receipt).toMatchObject({
        schemaVersion: 2,
        item: {
          name: item.name,
          path: item.astryx.path,
          aliases: item.astryx.aliases,
          kind: item.astryx.kind,
        },
        source: {package: '@astryxdesign/cli', version: '0.6.0'},
      });
      expect(receipt.files[0]).toMatchObject({
        id: 'primary',
        registryTarget: sourceFile.target,
        registryPath: sourceFile.path,
        sha256: registryContentHash(sourceFile.content),
        content: sourceFile.content,
        variants: [
          expect.objectContaining({
            format: 'javascript',
            registryTarget: sourceFile.target.replace(/\.tsx$/, '.jsx'),
          }),
        ],
      });
      expect(receipt.files[0].variants[0].sha256).toBe(
        registryContentHash(receipt.files[0].variants[0].content),
      );
    }
  });

  it('writes a provenance receipt beside copied source through ShadCN', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-receipt-'));
    try {
      writeConsumerProject(project);
      const base = fixture();
      const {items} = buildShadcnRegistry(
        fixture({
          blocks: [
            {
              ...base.blocks[0],
              source:
                '// Copyright (c) Meta Platforms, Inc. and affiliates.\n\n' +
                "'use client';\n\n" +
                '// Keep this consumer guidance.\n' +
                "import {Button} from '@astryxdesign/core/Button';\n" +
                'export default function ButtonShowcase() { return <Button label="Save" />; }\n',
            },
          ],
        }),
      );
      const block = items.find(
        item => item.name === 'showcase-button-variants',
      );
      const itemPath = path.join(project, 'block.json');
      writeFileSync(itemPath, JSON.stringify(block));

      await execFileAsync(
        process.execPath,
        [SHADCN_ENTRY, 'add', itemPath, '--yes'],
        {cwd: project, timeout: 30_000, env: shadcnEnv(project)},
      );

      expect(
        existsSync(
          path.join(
            project,
            'src',
            'components',
            'astryx',
            'showcases',
            'ButtonShowcase.tsx',
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(
            project,
            'src',
            'components',
            'astryx',
            'showcases',
            '.astryx',
            'showcase-button-variants.json',
          ),
        ),
      ).toBe(true);
      const installedSource = readFileSync(
        path.join(
          project,
          'src',
          'components',
          'astryx',
          'showcases',
          'ButtonShowcase.tsx',
        ),
        'utf8',
      );
      const installedReceipt = parseRegistryReceipt(
        JSON.parse(
          readFileSync(
            path.join(
              project,
              'src',
              'components',
              'astryx',
              'showcases',
              '.astryx',
              'showcase-button-variants.json',
            ),
            'utf8',
          ),
        ),
      );
      expect(block.files[0].content).not.toContain('Copyright (c) Meta');
      expect(installedSource).toBe(block.files[0].content);
      expect(installedReceipt.files[0].content).toBe(installedSource);
      expect(installedSource).toContain('// Keep this consumer guidance.');
    } finally {
      rmSync(project, {recursive: true, force: true});
    }
  });

  it('records the exact JavaScript bytes written by stock ShadCN', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-js-'));
    try {
      writeConsumerProject(project, {tsx: false});
      const base = fixture();
      const {items} = buildShadcnRegistry(
        fixture({
          blocks: [
            {
              ...base.blocks[0],
              source:
                "'use client';\n\n" +
                "import type {ReactNode} from 'react';\n" +
                "import {Button} from '@astryxdesign/core/Button';\n" +
                'const label: ReactNode = "Save";\n' +
                'export default function ButtonShowcase() { return <Button label={label} isDisabled={false} onPress={() => {}} />; }\n',
            },
          ],
        }),
      );
      const block = items.find(
        item => item.name === 'showcase-button-variants',
      );
      const itemPath = path.join(project, 'block.json');
      writeFileSync(itemPath, JSON.stringify(block));

      await execFileAsync(
        process.execPath,
        [SHADCN_ENTRY, 'add', itemPath, '--yes'],
        {cwd: project, timeout: 30_000, env: shadcnEnv(project)},
      );

      const sourcePath = path.join(
        project,
        'src',
        'components',
        'astryx',
        'showcases',
        'ButtonShowcase.jsx',
      );
      const receipt = parseRegistryReceipt(
        JSON.parse(
          readFileSync(
            path.join(
              project,
              'src',
              'components',
              'astryx',
              'showcases',
              '.astryx',
              'showcase-button-variants.json',
            ),
            'utf8',
          ),
        ),
      );
      const javascript = receipt.files[0].variants.find(
        variant => variant.format === 'javascript',
      );
      const installed = readFileSync(sourcePath, 'utf8');

      expect(existsSync(sourcePath.replace(/\.jsx$/, '.tsx'))).toBe(false);
      expect(javascript).toMatchObject({
        target: '../ButtonShowcase.jsx',
        registryTarget: 'components/astryx/showcases/ButtonShowcase.jsx',
        content: installed,
        sha256: registryContentHash(installed),
      });
      expect(installed).not.toContain('ReactNode');
    } finally {
      rmSync(project, {recursive: true, force: true});
    }
  });

  it('upgrades a stock-ShadCN install from its adjacent receipt', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-upgrade-'));
    const oldInput = fixture();
    const oldItem = buildShadcnRegistry(oldInput).items.find(
      item => item.name === 'showcase-button-variants',
    );
    const latestSource =
      "import {Button} from '@astryxdesign/core/Button';\n" +
      'export default function ButtonShowcase() { return <Button label="Updated" />; }\n';
    const latestInput = fixture({
      packages: [
        {name: '@astryxdesign/cli', version: '0.7.0'},
        {name: '@astryxdesign/core', version: '0.5.2'},
      ],
      blocks: [{...oldInput.blocks[0], source: latestSource}],
    });
    const latestItem = buildShadcnRegistry(latestInput).items.find(
      item => item.name === 'showcase-button-variants',
    );
    const server = createServer((request, response) => {
      if (request.url !== '/showcases/button/variants.json') {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify(latestItem));
    });

    try {
      writeConsumerProject(project);
      const itemPath = path.join(project, 'block.json');
      writeFileSync(itemPath, JSON.stringify(oldItem));
      await execFileAsync(
        process.execPath,
        [SHADCN_ENTRY, 'add', itemPath, '--yes'],
        {cwd: project, timeout: 30_000, env: shadcnEnv(project)},
      );
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      expect(address).not.toBeNull();
      expect(typeof address).not.toBe('string');
      const result = await reconcileRegistryCompositions(
        {apply: true, path: 'src'},
        {
          cwd: project,
          registryOrigin: `http://127.0.0.1:${address.port}`,
          expectedVersion: '0.7.0',
        },
      );
      const sourcePath = path.join(
        project,
        'src',
        'components',
        'astryx',
        'showcases',
        'ButtonShowcase.tsx',
      );
      const receiptPath = path.join(
        project,
        'src',
        'components',
        'astryx',
        'showcases',
        '.astryx',
        'showcase-button-variants.json',
      );

      expect(result.summary).toMatchObject({updated: 1, conflicts: 0});
      expect(readFileSync(sourcePath, 'utf8')).toBe(latestSource);
      expect(JSON.parse(readFileSync(receiptPath, 'utf8')).source.version).toBe(
        '0.7.0',
      );
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        });
      }
      rmSync(project, {recursive: true, force: true});
    }
  });

  it('keeps component implementation inside the package', () => {
    const {items} = buildShadcnRegistry(fixture());
    const component = items.find(item => item.name === 'component-button');

    expect(component.dependencies).toEqual([
      '@astryxdesign/core@0.5.2',
      '@stylexjs/stylex@0.19.0',
    ]);
    expect(component.css).toEqual({
      '@import "@astryxdesign/core/reset.css"': {},
      '@import "@astryxdesign/core/astryx.css"': {},
    });
    expect(component.files).toEqual([
      expect.objectContaining({
        target: 'components/astryx/Button.ts',
        content: "export * from '@astryxdesign/core/Button';\n",
      }),
    ]);
  });

  it('installs non-React peer dependencies for package-backed entries', () => {
    const base = fixture();
    const {items} = buildShadcnRegistry(
      fixture({
        packages: [
          ...base.packages,
          {
            name: '@astryxdesign/richtext',
            version: '0.1.9',
            peerDependencies: {
              '@astryxdesign/core': '0.5.2',
              '@lexical/react': '^0.46.0',
              '@stylexjs/stylex': '>=0.10.0',
              lexical: '^0.46.0',
              react: '>=19.0.0',
              'react-dom': '>=19.0.0',
            },
          },
        ],
        allComponents: {
          ...base.allComponents,
          '@astryxdesign/richtext': [
            {
              name: 'RichTextEditor',
              displayName: 'Rich Text Editor',
              importPath: '@astryxdesign/richtext',
              hidden: false,
              params: null,
            },
          ],
        },
        dependencyTag: 'canary',
      }),
    );
    const component = items.find(
      item => item.name === 'component-richtext-rich-text-editor',
    );

    expect(component.dependencies).toEqual([
      '@astryxdesign/core@canary',
      '@astryxdesign/richtext@canary',
      '@lexical/react@^0.46.0',
      '@stylexjs/stylex@0.19.0',
      'lexical@^0.46.0',
    ]);
  });

  it('uses the shadcn page-file workaround without changing item semantics', () => {
    const {items} = buildShadcnRegistry(fixture());
    const page = items.find(item => item.name === 'template-dashboard');

    expect(page.type).toBe('registry:page');
    expect(page.files[0].type).toBe('registry:block');
    expect(page.files[0].target).toBe('app/astryx/dashboard/page.tsx');
  });

  it('writes a page through the pinned shadcn CLI workaround', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-page-'));
    try {
      writeConsumerProject(project);

      const page = {
        $schema: 'https://ui.shadcn.com/schema/registry-item.json',
        name: 'astryx-page-test',
        type: 'registry:page',
        files: [
          {
            path: 'registry/astryx-page-test/page.tsx',
            type: 'registry:block',
            target: 'app/astryx/test/page.tsx',
            content: 'export default function Page() { return null; }\n',
          },
        ],
      };
      const itemPath = path.join(project, 'page.json');
      writeFileSync(itemPath, JSON.stringify(page));
      await execFileAsync(
        process.execPath,
        [SHADCN_ENTRY, 'add', itemPath, '--yes'],
        {cwd: project, timeout: 30_000, env: shadcnEnv(project)},
      );

      expect(
        existsSync(
          path.join(project, 'src', 'app', 'astryx', 'test', 'page.tsx'),
        ),
      ).toBe(true);
    } finally {
      rmSync(project, {recursive: true, force: true});
    }
  });

  it('resolves arbitrary nested item URLs and full-URL dependencies', async () => {
    const project = mkdtempSync(path.join(tmpdir(), 'astryx-shadcn-url-'));
    const requests = [];
    let origin = '';
    const dependency = {
      $schema: 'https://ui.shadcn.com/schema/registry-item.json',
      name: 'astryx-nested-dependency',
      type: 'registry:component',
      files: [
        {
          path: 'registry/astryx-nested-dependency/Dependency.ts',
          type: 'registry:component',
          target: 'components/astryx/Dependency.ts',
          content: 'export const dependencyValue = 1;\n',
        },
      ],
    };
    const server = createServer((request, response) => {
      requests.push(request.url);
      let body;
      if (request.url === '/shadcn/components/dependency.json') {
        body = dependency;
      } else if (request.url === '/shadcn/examples/parent.json') {
        body = {
          $schema: 'https://ui.shadcn.com/schema/registry-item.json',
          name: 'astryx-nested-parent',
          type: 'registry:block',
          registryDependencies: [`${origin}/shadcn/components/dependency.json`],
          files: [
            {
              path: 'registry/astryx-nested-parent/Parent.tsx',
              type: 'registry:block',
              target: 'components/astryx/Parent.tsx',
              content:
                "import {dependencyValue} from './Dependency';\n" +
                'export function Parent() { return <div>{dependencyValue}</div>; }\n',
            },
          ],
        };
      }

      if (!body) {
        response.writeHead(404);
        response.end('not found');
        return;
      }
      response.writeHead(200, {'content-type': 'application/json'});
      response.end(JSON.stringify(body));
    });

    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });
      const address = server.address();
      expect(address).not.toBeNull();
      expect(typeof address).not.toBe('string');
      origin = `http://127.0.0.1:${address.port}`;
      writeConsumerProject(project);

      await execFileAsync(
        process.execPath,
        [SHADCN_ENTRY, 'add', `${origin}/shadcn/examples/parent.json`, '--yes'],
        {
          cwd: project,
          timeout: 30_000,
          env: {
            ...shadcnEnv(project),
            NO_PROXY: '127.0.0.1,localhost',
            no_proxy: '127.0.0.1,localhost',
          },
        },
      );

      expect(
        existsSync(
          path.join(project, 'src', 'components', 'astryx', 'Parent.tsx'),
        ),
      ).toBe(true);
      expect(
        existsSync(
          path.join(project, 'src', 'components', 'astryx', 'Dependency.ts'),
        ),
      ).toBe(true);
      expect(requests).toContain('/shadcn/examples/parent.json');
      expect(requests).toContain('/shadcn/components/dependency.json');
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => (error ? reject(error) : resolve()));
        });
      }
      rmSync(project, {recursive: true, force: true});
    }
  });

  it('rejects composition source that escapes through a relative import', () => {
    const bad = fixture({
      blocks: [
        {
          ...fixture().blocks[0],
          source:
            "import {fixture} from '../fixture';\nexport default fixture;\n",
        },
      ],
    });

    expect(() => buildShadcnRegistry(bad)).toThrow(/relative import/);
  });

  it('targets canary packages in preview registries', () => {
    const {items} = buildShadcnRegistry({
      ...fixture(),
      dependencyTag: 'canary',
    });
    const component = items.find(item => item.name === 'component-button');
    const showcase = items.find(
      item => item.name === 'showcase-button-variants',
    );
    expect(component.dependencies).toEqual([
      '@astryxdesign/core@canary',
      '@stylexjs/stylex@0.19.0',
    ]);
    expect(
      parseRegistryReceipt(JSON.parse(showcase.files[1].content)).source
        .version,
    ).toBe('canary');
  });

  it('precompiles local StyleX with runtime CSS injection', () => {
    const styled = fixture({
      blocks: [
        {
          ...fixture().blocks[0],
          source:
            "import * as stylex from '@stylexjs/stylex';\n" +
            "import {Button} from '@astryxdesign/core/Button';\n" +
            "const styles = stylex.create({root: {width: '100%'}});\n" +
            'export default function Styled() { return <div {...stylex.props(styles.root)}><Button label="Save" /></div>; }\n',
        },
      ],
    });

    const {items} = buildShadcnRegistry(styled);
    const block = items.find(item => item.name === 'showcase-button-variants');
    expect(block.files[0].content).toContain('stylex-inject');
    expect(block.files[0].content).not.toContain('stylex.create');
    expect(block.files[0].target).toMatch(/\.jsx$/);
    expect(block.files[0].content).not.toMatch(/:\s*[A-Z][A-Za-z]+/);
    expect(block.files).toHaveLength(3);
    expect(block.files[1]).toMatchObject({
      type: 'registry:file',
      target: shadcnPrecompiledDeclarationTarget(block.files[0].target),
      content: createShadcnPrecompiledDeclaration(block.files[0].target),
    });
    const receipt = parseRegistryReceipt(JSON.parse(block.files[2].content));
    expect(receipt.files[0].variants).toEqual([]);
    expect(receipt.files[1]).toMatchObject({
      id: 'types',
      registryTarget: block.files[1].target,
      content: block.files[1].content,
      variants: [],
    });
    expect(block.dependencies).toContain('@stylexjs/stylex@0.19.0');
  });

  it('keeps Astryx metadata in raw JSON while standard clients can strip it', () => {
    const {items} = buildShadcnRegistry(fixture());

    expect(items[0].astryx).toEqual(
      expect.objectContaining({kind: 'component'}),
    );
  });
});
