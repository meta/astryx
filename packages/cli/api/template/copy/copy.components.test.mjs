// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The template.copy receipt's `components` and the template.show
 * response's `componentsToRead`: the components the source uses that
 * `astryx component` answers in the project, in source order, each once. The
 * text names them in one `component` call: after the copy line, and on stderr
 * for a printed template.
 */

import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {requireNatively} from '../../../test-utils/native-require.mjs';
import {REPO_ROOT} from '../../../test-utils/repo-root.mjs';

const require = requireNatively(import.meta.url);
/** @type {typeof import('../template.mjs')} */
const {template} = require('../template.mjs');
/** @type {typeof import('../../component/component.mjs')} */
const {component} = require('../../component/component.mjs');
/** @type {typeof import('../../../foundation/discovery/template-adapter.mjs')} */
const {
  answeredComponentsInSource,
  componentsInSource,
} = require('../../../foundation/discovery/template-adapter.mjs');
/** @type {typeof import('../../../test-utils/run-cli.mjs')} */
const {runCli} = require('../../../test-utils/run-cli.mjs');
/** @type {typeof import('../../../foundation/integrations/cli-requirement.mjs')} */
const {
  COMPONENT_REPLACES_CLI,
} = require('../../../foundation/integrations/cli-requirement.mjs');

const SLOW = 60_000;
const READ_LINE =
  /^Read the components it uses in one call: `(.+) component (.+)`$/m;

/**
 * A source that renders Core, integration, chart-library, local and unbound
 * tags, and names one more in a comment.
 */
const MIXED_SOURCE = `import {Card} from '@astryxdesign/core/Card';
import {Badge as StatusBadge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';
import {InputGroup, InputGroupText} from '@astryxdesign/core/InputGroup';
import {useHoverCard} from '@astryxdesign/core/HoverCard';
import {AcmeBadge} from '@acme/widgets/AcmeBadge';
import {Tooltip, XAxis} from 'recharts';
import {Widget} from './Widget';

function LocalHelper() {
  return <Tooltip><XAxis /></Tooltip>;
}

export default function Page() {
  useHoverCard();
  return (
    <Card>
      {/* <HoverCard> is not rendered here. */}
      <AcmeBadge />
      <StatusBadge />
      <Text>Label</Text>
      <InputGroup>
        <InputGroupText>@</InputGroupText>
      </InputGroup>
      <LocalHelper />
      <Widget />
      <Ghost />
      <Card />
    </Card>
  );
}
`;

/** What MIXED_SOURCE names, in the order it first renders each. */
const MIXED_NAMES = [
  'Card',
  'AcmeBadge',
  'Badge',
  'Text',
  'InputGroup',
  'InputGroupText',
];

/** MIXED_NAMES as a project with an integration reads them. */
const MIXED_SELECTORS = MIXED_NAMES.map(name =>
  name === 'AcmeBadge'
    ? '@acme/widgets/AcmeBadge'
    : `@astryxdesign/core/${name}`,
);

/** A source that renders Core's SideNav, which an integration replaces. */
const SIDENAV_SOURCE = `import {SideNav} from '@astryxdesign/core/SideNav';

export default function Page() {
  return <SideNav />;
}
`;

/** A source that renders Core's Button, a name an integration also ships. */
const BUTTON_SOURCE = `import {Button} from '@astryxdesign/core/Button';

export default function Page() {
  return <Button label="Save" />;
}
`;

/**
 * A source that renders a Core export Core does not document, under a name
 * an integration documents.
 */
const CORE_SIZE_SOURCE = `import {Card} from '@astryxdesign/core/Card';
import {SizeProvider} from '@astryxdesign/core/SizeContext';

export default function Page() {
  return (
    <SizeProvider size="sm">
      <Card />
    </SizeProvider>
  );
}
`;

/** A source that renders nothing `astryx component` answers. */
const EMPTY_SOURCE = `import {Tooltip} from 'recharts';

export default function Page() {
  return <Tooltip />;
}
`;

/** @type {string} */
let tmpDir;
/** @type {string} */
let originalCwd;

/**
 * A consumer project with an `@acme/widgets` integration that ships one
 * component (`AcmeBadge`) and the given templates.
 * @param {Record<string, string>} templates id to page source
 */
function makeConsumer(templates) {
  const dir = fs.mkdtempSync(
    path.join(REPO_ROOT, '.astryx-template-components-'),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(dir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkgDir = path.join(dir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkgDir, 'src'), {recursive: true});
  fs.mkdirSync(path.join(pkgDir, 'templates'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      exports: {
        './AcmeBadge': './src/AcmeBadge.tsx',
        './Button': './src/Button.tsx',
        './SizeProvider': './src/SizeProvider.tsx',
        './AcmeSideNav': './src/AcmeSideNav.tsx',
      },
      peerDependencies: {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`},
    }),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './src', templates: './templates'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'AcmeBadge.tsx'),
    'export function AcmeBadge() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'AcmeBadge.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeBadge',
      displayName: 'Acme Badge',
      import: '@acme/widgets/AcmeBadge',
      usage: {description: 'A small status label.'},
      props: [],
    })};\n`,
  );
  // A component under a Core name: `astryx component Button` has two owners.
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'Button.tsx'),
    'export function Button() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'Button.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'Button',
      displayName: 'Acme Button',
      import: '@acme/widgets/Button',
      usage: {description: 'A pressable action.'},
      props: [],
    })};\n`,
  );
  // A replacement: bare `astryx component SideNav` reads this one.
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'AcmeSideNav.tsx'),
    'export function AcmeSideNav() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'AcmeSideNav.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'AcmeSideNav',
      displayName: 'Acme Side Nav',
      import: '@acme/widgets/AcmeSideNav',
      replaces: 'SideNav',
      usage: {description: 'The side navigation for Acme apps.'},
      props: [],
    })};\n`,
  );
  // A component Core does not document, under a name a Core module exports.
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'SizeProvider.tsx'),
    'export function SizeProvider() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'src', 'SizeProvider.doc.mjs'),
    `export default ${JSON.stringify({
      type: 'component',
      name: 'SizeProvider',
      displayName: 'Acme Size Provider',
      import: '@acme/widgets/SizeProvider',
      usage: {description: 'Sets the size below it.'},
      props: [],
    })};\n`,
  );
  for (const [id, source] of Object.entries(templates)) {
    fs.writeFileSync(
      path.join(pkgDir, 'templates', `${id}.doc.mjs`),
      `export default {type: 'page', name: '${id} name', description: '${id} desc'};\n`,
    );
    fs.writeFileSync(path.join(pkgDir, 'templates', `${id}.tsx`), source);
  }
  return dir;
}

beforeEach(() => {
  originalCwd = process.cwd();
  tmpDir = makeConsumer({
    'acme-mixed': MIXED_SOURCE,
    'acme-empty': EMPTY_SOURCE,
    'acme-button': BUTTON_SOURCE,
    'acme-core-size': CORE_SIZE_SOURCE,
    'acme-sidenav': SIDENAV_SOURCE,
  });
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/**
 * The packages that answer each name, as `astryx component` would.
 * @param {Map<string, string>} answers name to its package
 * @returns {(name: string) => string[]}
 */
const ownersFrom = answers => name =>
  answers.has(name) ? [/** @type {string} */ (answers.get(name))] : [];

/**
 * A lookup that reads bare names, as in a project with no integration.
 * @param {Map<string, string>} answers name to its package
 */
const bare = answers => ({ownersOf: ownersFrom(answers), qualified: false});

describe('answeredComponentsInSource', () => {
  const catalog = new Map([
    ['Card', '@astryxdesign/core'],
    ['Badge', '@astryxdesign/core'],
    ['Text', '@astryxdesign/core'],
    ['InputGroup', '@astryxdesign/core'],
    ['InputGroupText', '@astryxdesign/core'],
    ['HoverCard', '@astryxdesign/core'],
    ['AcmeBadge', '@acme/widgets'],
    ['Tooltip', '@astryxdesign/core'],
    ['Widget', '@astryxdesign/core'],
    ['Ghost', '@astryxdesign/core'],
  ]);

  it('keeps every bound catalog name in source order, each once', () => {
    expect(answeredComponentsInSource(MIXED_SOURCE, bare(catalog))).toEqual(
      MIXED_NAMES,
    );
  });

  it('counts no unbound tag, tag from another module, or tag in a comment', () => {
    const names = answeredComponentsInSource(MIXED_SOURCE, bare(catalog));
    for (const name of ['Ghost', 'Tooltip', 'Widget', 'HoverCard']) {
      expect(names).not.toContain(name);
    }
  });

  it('counts a part the catalog does not hold as its own family root', () => {
    const source = `import {Table, TableHeader} from '@astryxdesign/core/Table';
import {CardHeader} from '@astryxdesign/core/Layout';
export default function Page() {
  return <><TableHeader /><CardHeader /><Table /></>;
}
`;
    const parts = new Map([
      ['Table', '@astryxdesign/core'],
      ['Card', '@astryxdesign/core'],
    ]);
    expect(answeredComponentsInSource(source, bare(parts))).toEqual(['Table']);
  });

  it('writes each name as `<package>/<Name>` for its import when qualified', () => {
    expect(
      answeredComponentsInSource(MIXED_SOURCE, {
        ownersOf: ownersFrom(catalog),
        qualified: true,
      }),
    ).toEqual(MIXED_SELECTORS);
  });

  it('drops a name the catalog does not hold', () => {
    expect(
      answeredComponentsInSource(
        MIXED_SOURCE,
        bare(new Map([['Card', '@astryxdesign/core']])),
      ),
    ).toEqual(['Card']);
  });

  it('is empty without a catalog or without a catalog tag', () => {
    expect(answeredComponentsInSource(MIXED_SOURCE, bare(new Map()))).toEqual(
      [],
    );
    expect(answeredComponentsInSource(EMPTY_SOURCE, bare(catalog))).toEqual([]);
  });
});

describe('template.copy components', () => {
  it(
    'names the Core and integration components the file uses',
    async () => {
      const res = await template('acme-mixed', {
        targetPath: './out',
        cwd: tmpDir,
      });
      expect(res.type).toBe('template.copy');
      expect(res.data.components).toEqual(MIXED_SELECTORS);
    },
    SLOW,
  );

  it(
    'is empty when the file uses no component the project answers',
    async () => {
      const res = await template('acme-empty', {
        targetPath: './out',
        cwd: tmpDir,
      });
      expect(res.data.components).toEqual([]);
    },
    SLOW,
  );

  it(
    'names only components `astryx component` answers for a Core template',
    async () => {
      const res = await template('dashboard', {
        targetPath: './out',
        cwd: tmpDir,
        package: '@astryxdesign/core',
      });
      const {components} = res.data;
      expect(components.length).toBeGreaterThan(0);
      expect(new Set(components).size).toBe(components.length);
      // Components every page renders are listed too.
      expect(components).toEqual(
        expect.arrayContaining([
          '@astryxdesign/core/Text',
          '@astryxdesign/core/Heading',
        ]),
      );
      // The chart library's parts are not Astryx components.
      for (const chartPart of ['XAxis', 'YAxis', 'Tooltip', 'LineChart']) {
        expect(components).not.toContain(chartPart);
      }
      const batch = await component(components, {cwd: tmpDir});
      expect(batch.data.results.map(r => r.status)).toEqual(
        components.map(() => 'found'),
      );
    },
    SLOW,
  );
});

describe('template.copy components from family docs', () => {
  it(
    'names a part that only its family doc documents',
    async () => {
      const res = await template('ResizableSidebar', {
        targetPath: './out',
        cwd: tmpDir,
        package: '@astryxdesign/core',
      });
      expect(res.data.components).toEqual(
        expect.arrayContaining([
          '@astryxdesign/core/ResizeHandle',
          '@astryxdesign/core/Layout',
        ]),
      );
    },
    SLOW,
  );
});

describe('a name more than one package answers', () => {
  it(
    'is named by the package the import names, so the read is not ambiguous',
    async () => {
      const res = await template('acme-button', {
        targetPath: './out',
        cwd: tmpDir,
      });
      expect(res.data.components).toEqual(['@astryxdesign/core/Button']);
      const bare = await runCli(['component', 'Button', '--json'], tmpDir);
      expect(JSON.parse(bare.stdout).code).toBe('ERR_AMBIGUOUS_COMPONENT');
      const read = await runCli(
        ['component', ...res.data.components, '--json'],
        tmpDir,
      );
      expect(read.status).toBe(0);
      expect(JSON.parse(read.stdout).package).toBe('@astryxdesign/core');
    },
    SLOW,
  );
});

describe('a Core component an integration replaces', () => {
  it(
    'is read from Core, the package its import names',
    async () => {
      const res = await template('acme-sidenav', {
        targetPath: './out',
        cwd: tmpDir,
      });
      expect(res.data.components).toEqual(['@astryxdesign/core/SideNav']);
      const bare = await runCli(['component', 'SideNav', '--json'], tmpDir);
      expect(JSON.parse(bare.stdout).package).toBe('@acme/widgets');
      const read = await runCli(
        ['component', ...res.data.components, '--json'],
        tmpDir,
      );
      expect(read.status).toBe(0);
      expect(JSON.parse(read.stdout).package).toBe('@astryxdesign/core');
    },
    SLOW,
  );
});

describe('a project with no integration', () => {
  it(
    'reads bare names, and the printed command reads them all',
    async () => {
      const dir = fs.mkdtempSync(
        path.join(REPO_ROOT, '.astryx-template-components-core-'),
      );
      try {
        fs.writeFileSync(
          path.join(dir, 'package.json'),
          JSON.stringify({name: 'core-only'}),
        );
        const res = await template('ResizableSidebar', {
          targetPath: './out',
          cwd: dir,
          package: '@astryxdesign/core',
        });
        expect(res.data.components).toEqual(
          expect.arrayContaining(['ResizeHandle', 'Layout', 'Text']),
        );
        expect(res.data.components.some(n => n.includes('/'))).toBe(false);
        const read = await runCli(
          ['component', ...res.data.components, '--json'],
          dir,
        );
        expect(read.status).toBe(0);
        expect(
          JSON.parse(read.stdout).data.results.map(
            (/** @type {any} */ r) => r.status,
          ),
        ).toEqual(res.data.components.map(() => 'found'));
      } finally {
        fs.rmSync(dir, {recursive: true, force: true});
      }
    },
    SLOW,
  );
});

describe('a name only another package documents', () => {
  it(
    'is left out, so the read never opens that package',
    async () => {
      const res = await template('acme-core-size', {
        targetPath: './out',
        cwd: tmpDir,
      });
      expect(res.data.components).toEqual(['@astryxdesign/core/Card']);
    },
    SLOW,
  );
});

describe('template.show componentsToRead', () => {
  it(
    'names the same components and leaves `components` as it was',
    async () => {
      const res = await template('acme-mixed', {cwd: tmpDir});
      expect(res.type).toBe('template.show');
      expect(res.data.componentsToRead).toEqual(MIXED_SELECTORS);
      expect(res.data.components).toEqual(componentsInSource(res.data.source));
    },
    SLOW,
  );
});

describe('template text names the components in one call', () => {
  it(
    'prints the line right after the copy line',
    async () => {
      const out = await runCli(['template', 'acme-mixed', './a'], tmpDir);
      expect(out.status).toBe(0);
      const lines = out.stdout.split('\n').filter(Boolean);
      const copied = lines.findIndex(l => l.startsWith('Copied template to '));
      expect(copied).toBeGreaterThanOrEqual(0);
      const match = lines[copied + 1].match(READ_LINE);
      expect(match?.[2]).toBe(MIXED_SELECTORS.join(' '));
      expect(lines[copied + 1]).toMatch(/^[\x20-\x7e]+$/);
    },
    SLOW,
  );

  it(
    'prints the line to stderr for a printed template, and keeps stdout to the source',
    async () => {
      const out = await runCli(['template', 'acme-mixed'], tmpDir);
      expect(out.status).toBe(0);
      expect(out.stderr.match(READ_LINE)?.[2]).toBe(MIXED_SELECTORS.join(' '));
      expect(out.stdout).not.toMatch(READ_LINE);
    },
    SLOW,
  );

  it(
    'prints a command that reads every name in one call, with the prefix the CLI prints elsewhere',
    async () => {
      const out = await runCli(['template', 'acme-mixed', './d'], tmpDir);
      const [, prefix, names] = /** @type {RegExpMatchArray} */ (
        out.stdout.match(READ_LINE)
      );
      const usage = await runCli(['template'], tmpDir);
      expect(usage.stdout).toContain(`${prefix} template <id>`);
      const read = await runCli(
        ['component', ...names.split(' '), '--json'],
        tmpDir,
      );
      expect(read.status).toBe(0);
      const {data} = JSON.parse(read.stdout);
      expect(data.results.map((/** @type {any} */ r) => r.status)).toEqual(
        MIXED_SELECTORS.map(() => 'found'),
      );
    },
    SLOW,
  );

  it(
    'prints nothing when the list is empty',
    async () => {
      const copied = await runCli(['template', 'acme-empty', './b'], tmpDir);
      expect(copied.status).toBe(0);
      expect(copied.stdout).not.toContain('Read the components');
      const shown = await runCli(['template', 'acme-empty'], tmpDir);
      expect(shown.stderr).not.toContain('Read the components');
    },
    SLOW,
  );

  it(
    'carries the field in --json and no text line',
    async () => {
      const out = await runCli(
        ['template', 'acme-mixed', './c', '--json'],
        tmpDir,
      );
      expect(out.status).toBe(0);
      const {data} = JSON.parse(out.stdout);
      expect(data.components).toEqual(MIXED_SELECTORS);
      expect(out.stderr).not.toContain('Read the components');
    },
    SLOW,
  );
});
