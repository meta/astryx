// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): a page to one
 * self-contained HTML file and back, each refusal, and the warnings.
 */

import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {CHART_WIDTHS} from '../../foundation/render/charts.mjs';
import {segmenterWarning} from '../../foundation/render/render-page.mjs';
import {readSourceBlock, renderedMarkupOf} from '../../foundation/render/source-block.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {recordDeclaredSettings} from '../../foundation/env/cli-command.mjs';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';
import {COMPONENT_REPLACES_CLI} from '../../foundation/integrations/cli-requirement.mjs';

const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** @type {string} */
let dir;
/** @type {string} */
let compileCache;
/** @type {string | undefined} */
let previousCompileCache;

/** @param {string} name @param {string | Buffer} content */
const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/** @param {() => Promise<unknown>} fn */
async function codeOf(fn) {
  try {
    await fn();
  } catch (e) {
    return /** @type {any} */ (e).code;
  }
  return 'no error';
}

// A 1×1 PNG.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);

const PAGE = `import * as stylex from '@stylexjs/stylex';
import {List, ListItem} from '@astryxdesign/core/List';
import {Heading, Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import dot from './dot.png';

const styles = stylex.create({box: {padding: 12}});

export default function Page() {
  return (
    <div {...stylex.props(styles.box)}>
      <Heading level={1}>Café ✓ report</Heading>
      <Text>{'</script><script>alert(1)</script>'}</Text>
      <img src={dot} alt="" />
      <List>
        <ListItem>Dropped child text</ListItem>
        <ListItem label="Kept label" />
      </List>
      <Button>Go</Button>
    </div>
  );
}
`;

beforeAll(async () => {
  // Each render starts a new page process. render() stops it as soon as it
  // answers, so each process saves only part of its compiled code. One cache
  // for this file keeps those parts for later processes. A forked process
  // takes this environment.
  previousCompileCache = process.env.NODE_COMPILE_CACHE;
  compileCache = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-compile-'));
  process.env.NODE_COMPILE_CACHE = compileCache;
  dir = makeLinkedFixture('astryx-render-test-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom', 'recharts']);
  put('dot.png', PNG);
  put('page.tsx', PAGE);
  put('plain.html', '<!doctype html><html><body><h1>Hello</h1><p class="lead">Hi</p></body></html>');
  // Every test can read the rendered page, whatever runs first.
  await render('page.tsx', {cwd: dir});
}, 60_000);

afterAll(() => {
  try {
    removeLinkedFixture(dir);
  } finally {
    if (previousCompileCache === undefined) delete process.env.NODE_COMPILE_CACHE;
    else process.env.NODE_COMPILE_CACHE = previousCompileCache;
    fs.rmSync(compileCache, {recursive: true, force: true});
  }
});

const LATER_TEXT_PAGE = `import {useState} from 'react';
import {Badge} from '@astryxdesign/core/Badge';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {Heading, Text} from '@astryxdesign/core/Text';

function Settings() {
  return (
    <div>
      <Heading level={1}>Settings</Heading>
      <Heading level={2}>Appearance</Heading>
    </div>
  );
}

export default function Page() {
  const [view, setView] = useState('home');
  return (
    <div>
      <Button label="Settings" onClick={() => setView('settings')} />
      <Banner status="info" title="What changed">Three fields moved to the settings page.</Banner>
      <Badge>
        <Text>Finalized</Text>
      </Badge>
      <StatCard title="Q3">
        <Text>Revenue grew 12%</Text>
      </StatCard>
      <ui.Box title="Q4">
        <Text>Costs fell 3%</Text>
      </ui.Box>
      {view === 'settings' ? <Settings /> : <Text>Home</Text>}
    </div>
  );
}

function StatCard({title}: {title: string; children?: unknown}) {
  return <section>{title}</section>;
}

function Box({title}: {title: string; children?: unknown}) {
  return <section>{title}</section>;
}

const ui = {Box};
`;

describe('render(): text a component did not draw', () => {
  /** @type {import('./render.type.mjs').RenderWarning[]} */
  let dropped;

  beforeAll(async () => {
    put('later-text.tsx', LATER_TEXT_PAGE);
    const result = /** @type {any} */ (await render('later-text.tsx', {cwd: dir}));
    dropped = result.data.warnings.filter(
      (/** @type {any} */ w) => w.code === 'dropped-children',
    );
  }, 60_000);

  it('names the component whose docs list no children, not the text inside it', () => {
    expect(dropped[0].message).toBe(
      '<Badge> on line 22 did not render the text "Finalized" it was given; Badge takes no children, so pass the text through one of its props (astryx component Badge).',
    );
  });

  it('still warns when a component of the page around the text drops it, by name or as a member', () => {
    expect(dropped.slice(1).map(w => w.message)).toEqual([
      '<Text> on line 26 did not render the text "Revenue grew 12%" it was given; it takes that text through a prop (often label=), so check its props.',
      '<Text> on line 29 did not render the text "Costs fell 3%" it was given; it takes that text through a prop (often label=), so check its props.',
    ]);
  });

  it('stays silent for text a later paint shows: a collapsed Banner body, an inactive view', () => {
    const text = dropped.map(w => w.message).join('\n');
    expect(text).not.toContain('Three fields moved');
    expect(text).not.toContain('Appearance');
  });
});

describe('render(): text dropped in another file of the page', () => {
  it('names that file, and not the page itself', async () => {
    put(
      'split/parts.tsx',
      `import {Badge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';

export function Note() {
  return (
    <div>
      <Text>Seen</Text>
      <Badge>
        <Text>Beta</Text>
      </Badge>
    </div>
  );
}
`,
    );
    put(
      'split/page.tsx',
      `import {Badge} from '@astryxdesign/core/Badge';
import {Text} from '@astryxdesign/core/Text';
import {Note} from './parts';

export default function Page() {
  return (
    <div>
      <Text>Here</Text>
      <Badge>
        <Text>Alpha</Text>
      </Badge>
      <Note />
    </div>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('split/page.tsx', {cwd: dir}));
    const messages = result.data.warnings
      .filter((/** @type {any} */ w) => w.code === 'dropped-children')
      .map((/** @type {any} */ w) => w.message)
      .sort();
    expect(messages).toEqual([
      '<Badge> on line 8 of parts.tsx did not render the text "Beta" it was given; Badge takes no children, so pass the text through one of its props (astryx component Badge).',
      '<Badge> on line 9 did not render the text "Alpha" it was given; Badge takes no children, so pass the text through one of its props (astryx component Badge).',
    ]);
  }, 60_000);
});

describe('render(): page to one HTML file', () => {
  /** @type {import('./render.type.mjs').RenderPageResponse} */
  let result;
  /** @type {string} */
  let html;

  beforeAll(async () => {
    result = /** @type {any} */ (await render('page.tsx', {cwd: dir}));
    html = fs.readFileSync(path.join(dir, 'page.html'), 'utf8');
  }, 60_000);

  it('answers render.page and writes beside the page by default', () => {
    expect(result.type).toBe('render.page');
    expect(result.data.output).toBe('page.html');
    expect(result.data.files).toEqual(['page.tsx', 'dot.png']);
    expect(result.data.bytes).toBe(Buffer.byteLength(html));
    expect(result.data.stylesheets).toContain('@astryxdesign/core/astryx.css');
  });

  it("is one file: no external references, and no script but the embedded source and the page's own", () => {
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/\ssrc="(?!data:)/);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
    expect(renderedMarkupOf(html)).not.toMatch(/<script\b/i);
    expect(html.split('<script type="application/x-astryx-source">')).toHaveLength(2);
    // The page's script follows the note after the embedded source.
    expect(html).toMatch(/ -->\n<script>[^<]/);
  });

  it('keeps text safe and the page title from its heading', () => {
    expect(html).toContain('<title>Café ✓ report</title>');
    expect(html).toContain('&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('inlines CSS for the classes it uses, its own StyleX, and the layer order once', () => {
    const style = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? '';
    expect(style).toMatch(/^:root\{color-scheme:light dark\}/);
    expect(style.match(/@layer reset, astryx-base, astryx-theme;/g)).toHaveLength(1);
    expect(style).toContain('padding:12px');
    const classes = new Set(
      [...html.matchAll(/\sclass="([^"]*)"/g)].flatMap(m => m[1].split(/\s+/)),
    );
    const astryx = [...classes].filter(c => c.startsWith('astryx-'));
    expect(astryx.length).toBeGreaterThan(0);
    // Core's stylesheet is cut: a component the page does not use is absent.
    expect(style).not.toContain('.astryx-calendar');
  });

  it('inlines a local image as a data: URI', () => {
    expect(result.data.images).toBe(1);
    expect(html).toContain('src="data:image/png;base64,');
  });

  it('warns when a component drops the text it was given', () => {
    const dropped = result.data.warnings.filter(w => w.code === 'dropped-children');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].message).toContain('<ListItem> on line 16');
    expect(dropped[0].message).toContain('ListItem takes no children');
    expect(dropped[0].message).toContain('astryx component ListItem');
  });

  it('warns for a value a Core prop does not have, and for nothing else', async () => {
    put(
      'values.tsx',
      `import {Button as Action} from '@astryxdesign/core/Button';
import * as Core from '@astryxdesign/core';
import {Text} from '@astryxdesign/core';
function Own(props: {size: string}) { return <span>{props.size}</span>; }
const size = 'huge';
export default function Page() {
  return (
    <main>
      <Action label="Delete" size="huge" />
      <Action label="Save" variant="primary" size={'lg'} />
      <Action label="Maybe" size={size} />
      <Core.Button label="Go" variant="danger" />
      <Core.Text>Plain</Core.Text>
      <Own size="huge" />
      <Text>Plain</Text>
    </main>
  );
}
`,
    );
    const answer = /** @type {any} */ (await render('values.tsx', {cwd: dir, out: 'values.html'}));
    const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
    expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
      'values.tsx:9: Button has no size "huge"; its sizes are sm, md, lg.',
      'values.tsx:12: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive.',
    ]);
  });

  it("takes the values the project's themes add to a Core prop as values it has", async () => {
    const own = makeLinkedFixture('astryx-render-widened-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
    try {
      // A local theme build's output, as theme build writes it.
      fs.mkdirSync(path.join(own, 'themes'), {recursive: true});
      fs.writeFileSync(
        path.join(own, 'themes', 'brand.variants.d.ts'),
        `// Generated by astryx theme build
export {};

declare module '@astryxdesign/core/Button' {
  interface ButtonVariantMap {
    'primary-muted': true;
  }
}

declare module '@astryxdesign/core/Card' {
  interface CardVariantMap {
    elevated: true;
  }
}

declare module '@astryxdesign/core/Text' {
  interface TextColorMap {
    brand: true;
  }
}

declare module '@astryxdesign/core/FieldStatus' {
  interface FieldStatusVariantMap {
    inline: true;
  }
}

declare module '@astryxdesign/core/Avatar' {
  interface AvatarStatusDotVariantMap {
    away: true;
  }
}
`,
      );
      // An installed theme package's published declarations.
      const pkg = path.join(path.dirname(own), 'node_modules', '@acme', 'theme');
      fs.mkdirSync(path.join(pkg, 'dist'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({name: '@acme/theme', version: '1.0.0', peerDependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.writeFileSync(
        path.join(pkg, 'dist', 'acme.variants.d.ts'),
        `export {};
declare module '@astryxdesign/core/Banner' {
  interface BannerStatusMap {
    neutral: true;
  }
}
`,
      );
      const manifest = path.join(own, 'package.json');
      const project = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      project.dependencies = {...project.dependencies, '@acme/theme': '1.0.0'};
      fs.writeFileSync(manifest, JSON.stringify(project));
      fs.writeFileSync(
        path.join(own, 'page.tsx'),
        `import {Button} from '@astryxdesign/core/Button';
import {Banner} from '@astryxdesign/core/Banner';
import {ClickableCard} from '@astryxdesign/core/ClickableCard';
import {Link} from '@astryxdesign/core/Link';
import {Heading} from '@astryxdesign/core/Heading';
import {TextInput} from '@astryxdesign/core/TextInput';
import {AvatarStatusDot} from '@astryxdesign/core/Avatar';
export default function Page() {
  return (
    <main>
      <Button label="Save" variant="primary-muted" />
      <Button label="Delete" variant="danger" />
      <Banner status="neutral" title="Heads up" />
      <Banner status="notice" title="Heads up" />
      <ClickableCard variant="elevated" onClick={() => {}}>Open</ClickableCard>
      <Link href="#top" color="brand">Top</Link>
      <Link href="#top" color="loud">Top</Link>
      <Heading level={2} color="brand">Title</Heading>
      <TextInput label="Name" statusVariant="inline" />
      <AvatarStatusDot variant="away" label="Away" />
      <Button label="Plain" tone="loud" />
      <ClickableCard variant="glow" onClick={() => {}}>Open</ClickableCard>
      <Heading level={2} color="loud">Title</Heading>
      <TextInput label="Name" statusVariant="floating" />
      <AvatarStatusDot variant="busy" label="Busy" />
    </main>
  );
}
`,
      );
      const answer = /** @type {any} */ (await render('page.tsx', {cwd: own}));
      const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
      expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
        'page.tsx:12: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive, primary-muted.',
        'page.tsx:14: Banner has no status "notice"; its status values are info, warning, error, success, neutral.',
        'page.tsx:17: Link has no color "loud"; its colors are primary, secondary, disabled, placeholder, accent, inherit, brand.',
        'page.tsx:22: ClickableCard has no variant "glow"; its variants are default, transparent, muted, blue, cyan, gray, green, orange, pink, purple, red, teal, yellow, elevated.',
        'page.tsx:23: Heading has no color "loud"; its colors are primary, secondary, disabled, placeholder, accent, inherit, brand.',
        'page.tsx:24: TextInput has no statusVariant "floating"; its statusVariants are attached, detached, tooltip, inline.',
        'page.tsx:25: AvatarStatusDot has no variant "busy"; its variants are success, neutral, error, away.',
      ]);
    } finally {
      removeLinkedFixture(own);
    }
  });

  it("leaves a widenable prop unchecked when a dependency's declarations cannot be read", async () => {
    const own = makeLinkedFixture('astryx-render-unread-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
    try {
      const pkg = path.join(path.dirname(own), 'node_modules', '@acme', 'theme');
      fs.mkdirSync(path.join(pkg, 'dist'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({name: '@acme/theme', version: '1.0.0', peerDependencies: {'@astryxdesign/core': '*'}}),
      );
      fs.writeFileSync(
        path.join(pkg, 'dist', 'acme.variants.d.ts'),
        "declare module '@astryxdesign/core/Button' {\n  interface ButtonVariantMap {\n",
      );
      const manifest = path.join(own, 'package.json');
      const project = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      project.dependencies = {...project.dependencies, '@acme/theme': '1.0.0'};
      fs.writeFileSync(manifest, JSON.stringify(project));
      fs.writeFileSync(
        path.join(own, 'page.tsx'),
        `import {Button} from '@astryxdesign/core/Button';
export default function Page() {
  return <Button label="Delete" variant="danger" size="huge" />;
}
`,
      );
      const answer = /** @type {any} */ (await render('page.tsx', {cwd: own}));
      const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
      expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
        'page.tsx:3: Button has no size "huge"; its sizes are sm, md, lg.',
      ]);
    } finally {
      removeLinkedFixture(own);
    }
  });

  it("checks a Core component against Core's docs where an integration replaces it", async () => {
    const own = makeLinkedFixture('astryx-render-replaced-', ['@astryxdesign', '@stylexjs', 'react', 'react-dom']);
    try {
      const pkg = path.join(path.dirname(own), 'node_modules', '@acme', 'buttons');
      fs.mkdirSync(path.join(pkg, 'components'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: '@acme/buttons',
          version: '1.0.0',
          exports: {'./components/*': './components/*.tsx'},
          peerDependencies: {'@astryxdesign/cli': `>=${COMPONENT_REPLACES_CLI}`},
        }),
      );
      fs.writeFileSync(path.join(pkg, 'astryx.integration.mjs'), "export default {components: './components'};\n");
      fs.writeFileSync(
        path.join(pkg, 'components', 'AcmeButton.doc.mjs'),
        `export default ${JSON.stringify({
          type: 'component',
          name: 'AcmeButton',
          displayName: 'AcmeButton',
          import: '@acme/buttons/components/AcmeButton',
          replaces: 'Button',
          keywords: ['acme'],
          usage: {description: 'AcmeButton for Acme apps.'},
          props: [{name: 'size', type: "'tiny' | 'giant'", description: 'Size.'}],
        })};\n`,
      );
      fs.writeFileSync(path.join(pkg, 'components', 'AcmeButton.tsx'), 'export function AcmeButton() { return null; }\n');
      const manifest = path.join(own, 'package.json');
      const project = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      project.dependencies = {...project.dependencies, '@acme/buttons': '1.0.0'};
      fs.writeFileSync(manifest, JSON.stringify(project));
      fs.writeFileSync(
        path.join(own, 'page.tsx'),
        `import {Button} from '@astryxdesign/core/Button';
export default function Page() {
  return (
    <main>
      <Button label="Save" size="lg" />
      <Button label="Delete" size="giant" />
    </main>
  );
}
`,
      );
      const answer = /** @type {any} */ (await render('page.tsx', {cwd: own}));
      const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
      expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
        'page.tsx:6: Button has no size "giant"; its sizes are sm, md, lg.',
      ]);
    } finally {
      removeLinkedFixture(own);
    }
  });

  it('gives the page back byte for byte', async () => {
    const back = /** @type {any} */ (
      await render('page.html', {cwd: dir, reverse: true, out: 'back/page.tsx'})
    );
    expect(back.type).toBe('render.reverse');
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, output: 'back/page.tsx'});
    expect(fs.readFileSync(path.join(dir, 'back/page.tsx'))).toEqual(
      fs.readFileSync(path.join(dir, 'page.tsx')),
    );
  });

  it('refuses to replace a page without --overwrite, and never adds neighbours to a folder that exists', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('alone-page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    await render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx'});
    expect(await codeOf(() => render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx'}))).toBe(
      'ERR_FILE_EXISTS',
    );
    const again = /** @type {any} */ (
      await render('alone-page.html', {cwd: dir, reverse: true, out: 'twice/page.tsx', overwrite: true})
    );
    expect(again.data.mode).toBe('embedded');
    // A page with a neighbour (its image) comes back only into a new folder.
    await render('page.html', {cwd: dir, reverse: true, out: 'twice-img/page.tsx'});
    expect(
      await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: 'twice-img/page.tsx', overwrite: true})),
    ).toBe('ERR_PATH_TRAVERSAL');
  });


  it('rebuilds a page from Astryx markup when there is no embedded source', async () => {
    put('stripped.html', html.replace(/<script type="application\/x-astryx-source">[\s\S]*?<\/script>/, ''));
    const rebuilt = /** @type {any} */ (await render('stripped.html', {cwd: dir, reverse: true}));
    expect(rebuilt.data).toMatchObject({mode: 'rebuilt', exact: false, output: 'stripped-restored/page.tsx'});
    expect(rebuilt.data.components).toEqual(expect.arrayContaining(['Button', 'Heading', 'List']));
    const source = fs.readFileSync(path.join(dir, 'stripped-restored/page.tsx'), 'utf8');
    expect(source).toContain("from '@astryxdesign/core/Button'");
    expect(source).toContain('Café ✓ report');
    // The rebuilt page renders.
    const again = /** @type {any} */ (await render('stripped-restored/page.tsx', {cwd: dir}));
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('refuses HTML that is not an Astryx page, naming the next step', async () => {
    put('plain.html', '<!doctype html><html><body><h1>Hello</h1><p class="lead">Hi</p></body></html>');
    /** @type {any} */
    let error;
    try {
      await render('plain.html', {cwd: dir, reverse: true});
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(error.suggestions[0].name).toBe('astryx build "<what the page is>"');
  });

  it('refuses a damaged embedded source', async () => {
    put(
      'damaged.html',
      html.replace(/"base64":"[^"]{4}/, '"base64":"AAAA'),
    );
    expect(await codeOf(() => render('damaged.html', {cwd: dir, reverse: true}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
  });

  it('refuses a rendered file cut short before its embedded source, instead of rebuilding part of the page', async () => {
    put('cut-short.html', html.slice(0, html.indexOf('<script type="application/x-astryx-source"') - 40));
    /** @type {any} */
    let refused;
    try {
      await render('cut-short.html', {cwd: dir, reverse: true, out: 'cut-short-back/page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(refused.message).toContain('cut-short.html is cut short');
    expect(fs.existsSync(path.join(dir, 'cut-short-back'))).toBe(false);
    // A whole file a host added to after </html> is not cut short.
    put('added-to.html', `${html}<script>track()</script>\n`);
    const back = /** @type {any} */ (await render('added-to.html', {cwd: dir, reverse: true, out: 'added-to-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true});
  });

  it('refuses a file a merge left with conflict markers, instead of choosing a side', async () => {
    const lines = html.split('\n');
    const at = lines.findIndex(line => line.includes('application/x-astryx-source'));
    put('conflicted.html', [...lines.slice(0, at), '<<<<<<< HEAD', lines[at], '=======', lines[at], '>>>>>>> theirs', ...lines.slice(at + 1)].join('\n'));
    /** @type {any} */
    let refused;
    try {
      await render('conflicted.html', {cwd: dir, reverse: true, out: 'conflicted-back/page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(refused.message).toContain('merge conflict markers');
    expect(fs.existsSync(path.join(dir, 'conflicted-back'))).toBe(false);
    // A page that is not an Astryx page is still named as such.
    put('plain-conflicted.html', '<html><body>\n<<<<<<< HEAD\n<p>a</p>\n=======\n<p>b</p>\n>>>>>>> theirs\n</body></html>\n');
    expect(await codeOf(() => render('plain-conflicted.html', {cwd: dir, reverse: true}))).toBe('ERR_RENDER_NOT_ASTRYX');
  });

  it('gives back a file whose markup a hand edit left with an open comment, and says it was edited', async () => {
    put('open-comment.html', html.replace('</h1>', '</h1><!-- todo: reword'));
    const back = /** @type {any} */ (await render('open-comment.html', {cwd: dir, reverse: true, out: 'open-comment-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, edited: true});
    expect(fs.readFileSync(path.join(dir, 'open-comment-back/page.tsx'), 'utf8')).toBe(PAGE);
  });

  it('gives back a file a minifier rewrote: comments gone, the tag unquoted, its attributes reordered', async () => {
    const minified = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace('<script type="application/x-astryx-source">', '<script data-kind=source type=application/x-astryx-source>');
    put('minified.html', minified);
    const back = /** @type {any} */ (await render('minified.html', {cwd: dir, reverse: true, out: 'minified-back/page.tsx'}));
    expect(back.data).toMatchObject({mode: 'embedded', exact: true, edited: false});
    expect(fs.readFileSync(path.join(dir, 'minified-back/page.tsx'), 'utf8')).toBe(PAGE);
  });
});

describe('render(): a page that uses nothing from Astryx', () => {
  /** @param {string} name */
  const exported = name => fs.existsSync(path.join(dir, name.replace(/\.tsx$/, '.html')));

  it('refuses it, names what the command is for, and writes nothing, in text and JSON', async () => {
    put('none/page.tsx', 'export default function Page() {\n  return <p>Plain</p>;\n}\n');
    expect(await codeOf(() => render('none/page.tsx', {cwd: dir}))).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(exported('none/page.tsx')).toBe(false);
    const text = await runCli(['experimental', 'export', 'none/page.tsx'], dir);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain(
      "page.tsx uses no Astryx components or styles; `astryx experimental export` only writes pages built with Astryx. Don't add Astryx to this app to export it: share the page with the app's own build instead (for a Vite app, a single-file build); nothing was written.",
    );
    const json = await runCli(['--json', 'experimental', 'export', 'none/page.tsx'], dir);
    expect(json.status).toBe(1);
    const answer = JSON.parse(json.stdout);
    expect(answer.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(text.stderr).toContain(answer.error);
    expect(exported('none/page.tsx')).toBe(false);
  });

  it('refuses a React page whose own stylesheets import nothing from Astryx', async () => {
    put('owncss/index.css', "@import './App.css';\nbody { margin: 0; }\n");
    put('owncss/App.css', '.app { padding: 8px; }\n');
    put('owncss/page.tsx', "import './index.css';\nexport default function Page() {\n  return <p className=\"app\">Plain</p>;\n}\n");
    expect(await codeOf(() => render('owncss/page.tsx', {cwd: dir}))).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(exported('owncss/page.tsx')).toBe(false);
  });

  it('refuses a page whose own stylesheet reaches only a package stylesheet with nothing from Astryx', async () => {
    put('pkgplain/node_modules/@rl3/plain/package.json', JSON.stringify({name: '@rl3/plain', version: '1.0.0'}));
    put('pkgplain/node_modules/@rl3/plain/plain.css', '.plain { color: red; }\n');
    put('pkgplain/globals.css', "@import '@rl3/plain/plain.css';\n");
    put('pkgplain/page.tsx', "import './globals.css';\nexport default function Page() {\n  return <p className=\"plain\">Plain</p>;\n}\n");
    expect(await codeOf(() => render('pkgplain/page.tsx', {cwd: dir}))).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(exported('pkgplain/page.tsx')).toBe(false);
  });

  it('refuses a page alone in an Astryx package\'s folder: the page itself does not count', async () => {
    put('kitalone/package.json', JSON.stringify({name: '@astryxdesign/rl3-kit-alone', private: true}));
    put('kitalone/page.tsx', 'export default function Page() {\n  return <p>Alone</p>;\n}\n');
    expect(await codeOf(() => render('kitalone/page.tsx', {cwd: dir}))).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(exported('kitalone/page.tsx')).toBe(false);
  });

  it('exports a page whose own stylesheet imports an Astryx stylesheet by its path', async () => {
    const core = createRequire(path.join(dir, 'package.json')).resolve('@astryxdesign/core/astryx.css');
    const rel = path.relative(path.join(dir, 'bypath'), core).split(path.sep).join('/');
    put('bypath/globals.css', `@import '${rel}';\n`);
    put('bypath/page.tsx', "import './globals.css';\nexport default function Page() {\n  return <p>Styled</p>;\n}\n");
    const r = /** @type {any} */ (await render('bypath/page.tsx', {cwd: dir}));
    expect(r.data.files).toContain('page.tsx');
    expect(exported('bypath/page.tsx')).toBe(true);
  });

  it('refuses, naming the page, a page whose own stylesheet imports a folder', async () => {
    fs.mkdirSync(path.join(dir, 'cssdir/styles'), {recursive: true});
    put('cssdir/globals.css', "@import './styles';\n");
    put('cssdir/page.tsx', "import './globals.css';\nexport default function Page() {\n  return <p>Plain</p>;\n}\n");
    expect(await codeOf(() => render('cssdir/page.tsx', {cwd: dir}))).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(exported('cssdir/page.tsx')).toBe(false);
  });

  it.each([
    [
      'a direct import',
      {'direct/page.tsx': "import {Text} from '@astryxdesign/core/Text';\nexport default function Page() {\n  return <Text>Direct</Text>;\n}\n"},
    ],
    [
      'a local component that imports Astryx',
      {
        'local/Card.tsx': "import {Text} from '@astryxdesign/core/Text';\nexport function Card() {\n  return <Text>Local</Text>;\n}\n",
        'local/page.tsx': "import {Card} from './Card';\nexport default function Page() {\n  return <Card />;\n}\n",
      },
    ],
    [
      'only an Astryx stylesheet',
      {'cssonly/page.tsx': "import '@astryxdesign/core/astryx.css';\nexport default function Page() {\n  return <p>Styled</p>;\n}\n"},
    ],
    [
      'its own stylesheet that imports an Astryx stylesheet',
      {
        'globals/globals.css': "@import '@astryxdesign/core/astryx.css';\n",
        'globals/page.tsx': "import './globals.css';\nexport default function Page() {\n  return <p>Styled</p>;\n}\n",
      },
    ],
    [
      'its own stylesheet through a package stylesheet that imports an Astryx stylesheet',
      {
        'pkgcss/node_modules/@rl3/theme/package.json': JSON.stringify({name: '@rl3/theme', version: '1.0.0'}),
        'pkgcss/node_modules/@rl3/theme/theme.css': "@import '@astryxdesign/core/astryx.css';\n",
        'pkgcss/globals.css': "@import '@rl3/theme/theme.css';\n",
        'pkgcss/page.tsx': "import './globals.css';\nexport default function Page() {\n  return <p>Themed</p>;\n}\n",
      },
    ],
    [
      'a package stylesheet its script imports that imports an Astryx stylesheet',
      {
        'scriptcss/node_modules/@rl3/theme2/package.json': JSON.stringify({name: '@rl3/theme2', version: '1.0.0'}),
        'scriptcss/node_modules/@rl3/theme2/theme.css': "@import '@astryxdesign/core/astryx.css';\n",
        'scriptcss/page.tsx': "import '@rl3/theme2/theme.css';\nexport default function Page() {\n  return <p>Themed</p>;\n}\n",
      },
    ],
    [
      "the modules of the Astryx package whose folder holds it",
      {
        'kit/package.json': JSON.stringify({name: '@astryxdesign/rl3-kit', private: true}),
        'kit/Badge.tsx': "export function Badge() {\n  return <span>Kit</span>;\n}\n",
        'kit/page.tsx': "import {Badge} from './Badge';\nexport default function Page() {\n  return <Badge />;\n}\n",
      },
    ],
    [
      'a re-export chain',
      {
        'chain/ui/text.ts': "export {Text} from '@astryxdesign/core/Text';\n",
        'chain/ui/index.ts': "export * from './text';\n",
        'chain/page.tsx': "import {Text} from './ui';\nexport default function Page() {\n  return <Text>Chain</Text>;\n}\n",
      },
    ],
    [
      'a dynamic import',
      {
        'lazy/Panel.tsx': "import {Text} from '@astryxdesign/core/Text';\nexport default function Panel() {\n  return <Text>Lazy</Text>;\n}\n",
        'lazy/page.tsx': "import {Suspense, lazy} from 'react';\nconst Panel = lazy(() => import('./Panel'));\nexport default function Page() {\n  return <Suspense fallback={<p>Loading</p>}><Panel /></Suspense>;\n}\n",
      },
    ],
  ])('exports a page that reaches Astryx through %s', async (_, files) => {
    for (const [name, content] of Object.entries(files)) put(name, content);
    const page = Object.keys(files).find(name => name.endsWith('/page.tsx'));
    const r = /** @type {any} */ (await render(/** @type {string} */ (page), {cwd: dir}));
    expect(r.data.files).toContain('page.tsx');
    expect(exported(/** @type {string} */ (page))).toBe(true);
  });
});

describe('render(): every write takes its place in one step', () => {
  const BIN = path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs');
  /**
   * Run the CLI in a process of its own.
   * @param {string[]} args
   * @returns {Promise<{code: number | null, out: string}>}
   */
  const cliRun = args =>
    new Promise(resolve => {
      const child = spawn(process.execPath, [BIN, '--json', ...args], {cwd: dir, stdio: ['ignore', 'pipe', 'ignore']});
      let out = '';
      child.stdout.on('data', chunk => (out += chunk));
      child.on('close', code => resolve({code, out}));
    });

  it('replaces a rendered file in one step: a reader that has the old file open keeps reading all of it', async () => {
    put('swap-a.tsx', 'export default function A() {\n  return <p>First page</p>;\n}\nimport "@astryxdesign/core/astryx.css";\n');
    put('swap-b.tsx', 'export default function B() {\n  return <p>Second page</p>;\n}\nimport "@astryxdesign/core/astryx.css";\n');
    await render('swap-a.tsx', {cwd: dir, out: 'swap.html'});
    const file = path.join(dir, 'swap.html');
    const before = fs.readFileSync(file);
    const fd = fs.openSync(file, 'r');
    try {
      await render('swap-b.tsx', {cwd: dir, out: 'swap.html'});
      const held = Buffer.alloc(before.length + 1);
      expect(held.subarray(0, fs.readSync(fd, held, 0, held.length, 0))).toEqual(before);
    } finally {
      fs.closeSync(fd);
    }
    expect(fs.readFileSync(file, 'utf8')).toContain('Second page');
  }, 60_000);

  it('restores one file from many processes at once: each run gets a folder of its own, whole', async () => {
    const runs = await Promise.all(Array.from({length: 8}, () => cliRun(['experimental', 'export', '--reverse', 'page.html'])));
    expect(runs.map(r => r.code)).toEqual(Array(8).fill(0));
    const pages = runs.map(r => JSON.parse(r.out).data.output);
    expect(new Set(pages.map(p => path.dirname(p))).size).toBe(8);
    for (const p of pages) expect(fs.readFileSync(path.join(dir, p), 'utf8')).toBe(PAGE);
  }, 120_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'says a file it cannot read cannot be read, not that it does not exist',
    async () => {
      put('unreadable/page.tsx', 'export default function Page() {\n  return <p>Unreadable</p>;\n}\nimport "@astryxdesign/core/astryx.css";\n');
      await render('unreadable/page.tsx', {cwd: dir});
      const files = ['unreadable/page.tsx', 'unreadable/page.html'];
      for (const file of files) fs.chmodSync(path.join(dir, file), 0o000);
      try {
        for (const [file, options] of [[files[0], {}], [files[1], {reverse: true}]]) {
          /** @type {any} */
          let refused;
          try {
            await render(file, {cwd: dir, ...options});
          } catch (e) {
            refused = e;
          }
          expect(refused?.code, file).toBe('ERR_READ_FAILED');
          expect(refused.message).toBe(`${file} cannot be read (EACCES: no permission); nothing was written.`);
        }
      } finally {
        for (const file of files) fs.chmodSync(path.join(dir, file), 0o644);
      }
      expect(await codeOf(() => render('unreadable/missing.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
      // A folder or a pipe given as the file is refused before it is opened,
      // so nothing waits on a pipe no one writes.
      fs.mkdirSync(path.join(dir, 'unreadable/folder.tsx'));
      const entries = [['unreadable/folder.tsx', 'it is a folder']];
      if (spawnSync('mkfifo', [path.join(dir, 'unreadable/pipe.tsx')]).status === 0) entries.push(['unreadable/pipe.tsx', 'it is not a regular file']);
      for (const [file, why] of entries) {
        /** @type {any} */
        let refused;
        try {
          await render(file, {cwd: dir});
        } catch (e) {
          refused = e;
        }
        expect(refused?.code, file).toBe('ERR_READ_FAILED');
        expect(refused.message).toBe(`${file} cannot be read (${why}); nothing was written.`);
      }
    },
    60_000,
  );

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves a file this user cannot write as it is, and keeps the permission bits of a file it replaces',
    async () => {
      await render('page.tsx', {cwd: dir, out: 'modes.html'});
      const file = path.join(dir, 'modes.html');
      fs.chmodSync(file, 0o444);
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'modes.html'}))).toBe('ERR_WRITE_FAILED');
      fs.chmodSync(file, 0o640);
      await render('page.tsx', {cwd: dir, out: 'modes.html'});
      expect(fs.statSync(file).mode & 0o777).toBe(0o640);
    },
    60_000,
  );

  it('uses the project\'s own file where an alias leads outside the new folder to the same bytes', async () => {
    put('alias-loop/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-loop/package.json', '{"name":"alias-loop","private":true}');
    put('alias-loop/src/lib/helper.ts', "import {title} from '@/app/page';\nexport const label = 'Helper';\nexport const echo = () => title;\n");
    const page = "import {label} from '../lib/helper';\nexport const title = 'Loop';\nexport default function Page() { return <p>{label}</p>; }\nimport '@astryxdesign/core/astryx.css';\n";
    put('alias-loop/src/app/page.tsx', page);
    const cwd = path.join(dir, 'alias-loop');
    await render('src/app/page.tsx', {cwd});
    const back = /** @type {any} */ (await render('src/app/page.html', {cwd, reverse: true, out: 'restored/app/page.tsx'}));
    expect(back.data.files).toEqual(['restored/app/page.tsx', 'restored/lib/helper.ts']);
    expect(back.data.aliased).toEqual({imports: [], sameAsProject: [{import: '@/app/page', file: 'src/app/page.tsx'}]});
    expect(fs.readFileSync(path.join(cwd, 'src/app/page.tsx'), 'utf8')).toBe(page);
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('names the folder that takes no new file, not a temporary one', async () => {
    fs.mkdirSync(path.join(dir, 'locked'), {recursive: true});
    fs.chmodSync(path.join(dir, 'locked'), 0o555);
    /** @type {any} */
    let refused;
    try {
      await render('page.tsx', {cwd: dir, out: 'locked/page.html'});
    } catch (e) {
      refused = e;
    } finally {
      fs.chmodSync(path.join(dir, 'locked'), 0o755);
    }
    expect(refused?.code).toBe('ERR_WRITE_FAILED');
    expect(refused.message).toBe('Could not write locked/page.html: locked does not take a new file (EACCES); nothing was written.');
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a restore with --overwrite replaces a file this user cannot write, as it did',
    async () => {
      const solo = 'export default function Solo() {\n  return <p>Solo</p>;\n}\nimport "@astryxdesign/core/astryx.css";\n';
      put('solo.tsx', solo);
      await render('solo.tsx', {cwd: dir});
      const file = put('read-only-back/solo.tsx', 'old\n');
      fs.chmodSync(file, 0o444);
      await render('solo.html', {cwd: dir, reverse: true, out: 'read-only-back/solo.tsx', overwrite: true});
      expect(fs.readFileSync(file, 'utf8')).toBe(solo);
    },
    60_000,
  );

  it('removes a temporary that a stopped run in this process space left beside its target, and keeps any other', async () => {
    const {pidSpace} = await import('../../foundation/release/cache.mjs');
    const space = `${os.hostname()}-${/\[(\d+)\]/.exec(pidSpace() ?? '')?.[1] ?? 'x'}`;
    // A process id no system gives out, so its run is gone.
    const left = path.join(dir, `.stale.html.tmp-${space}-999999999-${randomUUID()}`);
    const running = path.join(dir, `.stale.html.tmp-${space}-${process.pid}-${randomUUID()}`);
    // A run in another process-ID namespace cannot be seen from here, so its
    // temporary stays, whatever its process id.
    const elsewhere = path.join(dir, `.stale.html.tmp-${os.hostname()}-1-999999999-${randomUUID()}`);
    const leftFolder = path.join(dir, `.page-restored.tmp-${space}-999999999-${randomUUID()}`);
    for (const temporary of [left, running, elsewhere]) fs.writeFileSync(temporary, 'part of a file');
    put(path.relative(dir, path.join(leftFolder, 'page.tsx')), 'part of a folder');
    await render('page.tsx', {cwd: dir, out: 'stale.html'});
    const restored = /** @type {any} */ (await render('page.html', {cwd: dir, reverse: true}));
    expect(fs.existsSync(left)).toBe(false);
    expect(fs.existsSync(leftFolder)).toBe(false);
    expect(fs.existsSync(running)).toBe(true);
    expect(fs.existsSync(elsewhere)).toBe(true);
    fs.rmSync(running);
    fs.rmSync(elsewhere);
    fs.rmSync(path.join(dir, path.dirname(restored.data.output)), {recursive: true});
  }, 60_000);

  it('leaves no temporary file or folder behind', () => {
    expect(fs.readdirSync(dir).filter(name => name.includes('.tmp-'))).toEqual([]);
  });
});

describe('render(): embedded files stay inside the current folder', () => {
  it('refuses an embedded path that climbs out', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put(
      'escape.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlock('p.tsx', [
        {path: 'p.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')},
        {path: '../../../escaped.tsx', bytes: Buffer.from('x')},
      ])}</body></html>`,
    );
    expect(await codeOf(() => render('escape.html', {cwd: dir, reverse: true, out: 'esc/p.tsx'}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    expect(fs.existsSync(path.join(dir, 'esc/p.tsx'))).toBe(false);
  });
});

describe('render(): what a page imports', () => {
  /**
   * A built theme package: its module and the stylesheet that scopes its tokens.
   * @param {string} name the package and theme name
   * @param {string} css
   * @param {string} [extra] more of the module, such as a colorModes export
   */
  const themePackage = (name, css, extra = '') => {
    put(`node_modules/@acme/${name}/package.json`, JSON.stringify({name: `@acme/${name}`, version: '1.0.0', type: 'module', main: 'index.js'}));
    put(`node_modules/@acme/${name}/index.js`, `export const theme = {name: '${name}', __built: true, tokens: {}};\n${extra}`);
    put(`node_modules/@acme/${name}/theme.css`, css);
  };
  /** @param {string} name */
  const themedPage = name =>
    `import {Theme} from '@astryxdesign/core/theme';
import {theme} from '@acme/${name}';
import '@acme/${name}/theme.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`;

  it('keeps a light-only theme light in a dark viewer: light scheme and the theme\'s page color on the document', async () => {
    themePackage('retro', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('retro/page.tsx', themedPage('retro'));
    await render('retro/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'retro/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).toContain(':where(:root){color-scheme:light;background-color:var(--color-background-body)}');
    expect(html).not.toContain(':root{color-scheme:light dark}');
  }, 60_000);

  it('reads the colorModes of a theme package whose stylesheet sits beside a nested package.json', async () => {
    put('node_modules/@acme/split/package.json', JSON.stringify({name: '@acme/split', version: '1.0.0', main: 'dist/index.js'}));
    put('node_modules/@acme/split/dist/package.json', JSON.stringify({type: 'module'}));
    put('node_modules/@acme/split/dist/index.js', "export const theme = {name: 'split', __built: true, tokens: {}};\nexport const colorModes = ['light'];\n");
    put('node_modules/@acme/split/dist/theme.css', '[data-astryx-theme="split"]{--color-background-body:var(--brand-page)}');
    put('split/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from '@acme/split';
import '@acme/split/dist/theme.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('split/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'split/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('reads the colorModes of a theme package linked in from outside node_modules', async () => {
    put('linked-src/linked/package.json', JSON.stringify({name: '@acme/linked', version: '1.0.0', type: 'module', main: 'index.js'}));
    put('linked-src/linked/index.js', "export const theme = {name: 'linked', __built: true, tokens: {}};\nexport const colorModes = ['light'];\n");
    put('linked-src/linked/theme.css', '[data-astryx-theme="linked"]{--color-background-body:var(--brand-page)}');
    fs.mkdirSync(path.join(dir, 'node_modules/@acme'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'linked-src/linked'), path.join(dir, 'node_modules/@acme/linked'), 'dir');
    put('linked/page.tsx', themedPage('linked'));
    await render('linked/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'linked/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('reads a built theme whose stylesheet the page reaches through an @import in its own CSS', async () => {
    put('via-import/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-import/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-import/app.css', "@import './retro.css';\nmain { margin: 0; }\n");
    put('via-import/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-import/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-import/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light">');
  }, 60_000);

  it('keeps both schemes when the page imports the theme\'s stylesheet for one scheme only', async () => {
    put('via-media/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-media/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-media/app.css', "@import './retro.css' (prefers-color-scheme: light);\n");
    put('via-media/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-media/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-media/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light dark">');
  }, 60_000);

  it('keeps both schemes when an outer import scopes the theme\'s stylesheet to one scheme', async () => {
    put('via-chain/retro.js', "export const theme = {name: 'retro', __built: true, tokens: {}};\n");
    put('via-chain/retro.css', '[data-astryx-theme="retro"]{--color-background-body:#c0c0c0;--color-text-primary:#000}');
    put('via-chain/entry.css', "@import './retro.css';\n");
    put('via-chain/app.css', "@import './entry.css' (prefers-color-scheme: dark);\n");
    put('via-chain/page.tsx', `import {Theme} from '@astryxdesign/core/theme';
import {theme} from './retro.js';
import './app.css';
export default function Page() {
  return (<Theme theme={theme}><main><h1>Saved notes</h1></main></Theme>);
}
`);
    await render('via-chain/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'via-chain/page.html'), 'utf8')).toContain('<meta name="color-scheme" content="light dark">');
  }, 60_000);

  it('keeps both schemes in a markup-only render, where the theme editor shows each mode itself', async () => {
    const {renderPage} = await import('../../foundation/render/render-page.mjs');
    const page = await renderPage(path.join(dir, 'retro/page.tsx'), {cwd: dir, markupOnly: true});
    expect(page.html).toContain('<meta name="color-scheme" content="light dark">');
    expect(page.html).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('follows a theme\'s colorModes export over its stylesheet: one mode, and both modes', async () => {
    themePackage('night', '[data-astryx-theme="night"]{--color-background-body:light-dark(#fff,#111)}', "export const colorModes = ['dark'];\n");
    put('night/page.tsx', themedPage('night'));
    await render('night/page.tsx', {cwd: dir});
    const night = fs.readFileSync(path.join(dir, 'night/page.html'), 'utf8');
    expect(night).toContain('<meta name="color-scheme" content="dark">');
    expect(night).toContain(':where(:root){color-scheme:dark;background-color:var(--color-background-body)}');
    // Its stylesheet alone would read as light only; the export says both.
    themePackage('pair', '[data-astryx-theme="pair"]{--color-background-body:#c0c0c0;--color-text-primary:#000}', "export const colorModes = ['light', 'dark'];\n");
    put('pair/page.tsx', themedPage('pair'));
    await render('pair/page.tsx', {cwd: dir});
    const pair = fs.readFileSync(path.join(dir, 'pair/page.html'), 'utf8');
    expect(pair).toContain('<meta name="color-scheme" content="light dark">');
    expect(pair).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('keeps a two-mode theme\'s scheme as before', async () => {
    themePackage('duo', '[data-astryx-theme="duo"]{--color-background-body:light-dark(#fff,#111)}');
    put('duo/page.tsx', themedPage('duo'));
    await render('duo/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'duo/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain(':root{color-scheme:light dark}:root[data-theme="light"]{color-scheme:light}:root[data-theme="dark"]{color-scheme:dark}');
    expect(html).not.toContain('background-color:var(--color-background-body)}');
  }, 60_000);

  it('reads themes built with theme build: light page colors are light only, a fonts or accent theme keeps both modes', async () => {
    const themes = {
      retro: "'--color-background-body': '#c0c0c0', '--color-background-surface': '#c0c0c0', '--color-text-primary': '#000000'",
      serif: "'--font-family-body': 'Georgia, serif'",
      accent: "'--color-accent': '#c2185b'",
    };
    /** @type {Record<string, string>} */
    const scheme = {};
    for (const [name, tokens] of Object.entries(themes)) {
      put(`built/${name}/${name}.ts`, `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ${name}Theme = defineTheme({name: '${name}', tokens: {${tokens}}});\n`);
      const built = spawnSync(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'theme', 'build', `built/${name}/${name}.ts`], {cwd: dir, encoding: 'utf8', timeout: 60_000});
      expect(built.status, built.stderr).toBe(0);
      put(
        `built/${name}/page.tsx`,
        `import {Theme} from '@astryxdesign/core/theme';
import {${name}Theme} from './${name}.js';
import './${name}.css';
export default function Page() {
  return (<Theme theme={${name}Theme}><main><h1>Saved notes</h1></main></Theme>);
}
`,
      );
      await render(`built/${name}/page.tsx`, {cwd: dir});
      scheme[name] = /<meta name="color-scheme" content="([^"]*)">/.exec(fs.readFileSync(path.join(dir, `built/${name}/page.html`), 'utf8'))?.[1] ?? '';
    }
    expect(scheme).toEqual({retro: 'light', serif: 'light dark', accent: 'light dark'});
  }, 240_000);

  it('reads the dark-only Gothic theme, built with theme build, as dark only', async () => {
    fs.cpSync(path.join(CLI_DIR, 'assets/templates/themes/gothic'), path.join(dir, 'gothic'), {recursive: true});
    // The template's icons come from lucide-react, which the theme package lists.
    const lucide = path.dirname(createRequire(path.join(CLI_DIR, '../themes/gothic/package.json')).resolve('lucide-react/package.json'));
    fs.mkdirSync(path.join(dir, 'gothic/node_modules'), {recursive: true});
    fs.symlinkSync(lucide, path.join(dir, 'gothic/node_modules/lucide-react'), 'junction');
    const built = spawnSync(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'theme', 'build', 'gothic/gothicTheme.ts'], {cwd: dir, encoding: 'utf8', timeout: 120_000});
    expect(built.status, built.stderr).toBe(0);
    put(
      'gothic/page.tsx',
      `import {Theme} from '@astryxdesign/core/theme';
import {gothicTheme} from './gothic.js';
import './gothic.css';
export default function Page() {
  return (<Theme theme={gothicTheme}><main><h1>Saved notes</h1></main></Theme>);
}
`,
    );
    await render('gothic/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'gothic/page.html'), 'utf8');
    expect(html).toContain('<meta name="color-scheme" content="dark">');
    expect(html).toContain(':where(:root){color-scheme:dark;background-color:var(--color-background-body)}');
  }, 240_000);

  it('inlines an imported theme stylesheet, embeds local CSS, JSON and images, and gives them all back', async () => {
    put('node_modules/@acme/theme/package.json', JSON.stringify({name: '@acme/theme', version: '1.0.0'}));
    put('node_modules/@acme/theme/theme.css', ':root{--acme-brand:#123456}.acme-unused{color:red}');
    put('site/local.css', '.site-title{letter-spacing:2px}');
    put('site/data.json', JSON.stringify({title: 'From JSON'}));
    put('site/dot.png', PNG);
    put(
      'site/page.tsx',
      `import '@acme/theme/theme.css';
import './local.css';
import data from './data.json';
import dot from './dot.png';
export default function Page() {
  return (<main><h1 className="site-title">{data.title}</h1><img src={dot} alt="" /><a href="https://example.com/docs">Docs</a></main>);
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('site/page.tsx', {cwd: dir}));
    expect(result.data.stylesheets).toContain('@acme/theme/theme.css');
    expect(result.data.files).toEqual(expect.arrayContaining(['page.tsx', 'local.css', 'data.json', 'dot.png']));
    // A plain link loads nothing, so it is not a remote-asset warning.
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'remote-asset')).toEqual([]);
    const html = fs.readFileSync(path.join(dir, 'site/page.html'), 'utf8');
    expect(html).toContain('--acme-brand:#123456');
    expect(html).not.toContain('.acme-unused');
    expect(html).toContain('letter-spacing:2px');
    expect(html).toContain('From JSON');
    fs.copyFileSync(path.join(dir, 'site/page.html'), path.join(dir, 'moved.html'));
    const back = /** @type {any} */ (await render('moved.html', {cwd: dir, reverse: true, out: 'moved/page.tsx'}));
    expect(back.data.files.sort()).toEqual(
      ['moved/data.json', 'moved/dot.png', 'moved/local.css', 'moved/page.tsx'].sort(),
    );
    for (const name of ['page.tsx', 'local.css', 'data.json', 'dot.png']) {
      expect(fs.readFileSync(path.join(dir, 'moved', name))).toEqual(fs.readFileSync(path.join(dir, 'site', name)));
    }
    // The moved copy renders the same page again.
    const again = /** @type {any} */ (await render('moved/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'moved/page.html'), 'utf8')).toContain('From JSON');
    expect(again.type).toBe('render.page');
  }, 60_000);

  /**
   * An ES module package of three files: `src/index.js` re-exports a badge
   * that imports its label by a relative path.
   * @param {string} at the package folder, from the test folder
   * @param {string} name
   */
  const putLinkedPackage = (at, name) => {
    put(`${at}/package.json`, JSON.stringify({name, version: '1.0.0', type: 'module', exports: {'.': './src/index.js'}}));
    put(`${at}/src/index.js`, "export {Badge} from './parts/badge.js';\n");
    put(`${at}/src/parts/badge.js`, "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nexport function Badge() { return jsx('strong', {children: label}); }\n");
    put(`${at}/src/parts/label.js`, `export const label = '${name} badge text';\n`);
  };
  /** @param {string} link the link, from the test folder @param {string} target the folder it names, from the test folder */
  const linkFolder = (link, target) => {
    fs.mkdirSync(path.dirname(path.join(dir, link)), {recursive: true});
    fs.symlinkSync(path.join(dir, target), path.join(dir, link), 'junction');
  };
  /**
   * Render a page, give the file back inside the same project, and render the
   * restored page again: the same markup both times.
   * @param {string} page the page, from the test folder
   */
  const roundTrip = async page => {
    const first = /** @type {any} */ (await render(page, {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, page.replace(/\.tsx$/, '.html')), 'utf8');
    const restored = path.join(path.dirname(page), 'restored', path.basename(page)).split(path.sep).join('/');
    const back = /** @type {any} */ (await render(page.replace(/\.tsx$/, '.html'), {cwd: dir, reverse: true, out: restored}));
    await render(restored, {cwd: dir});
    const again = fs.readFileSync(path.join(dir, restored.replace(/\.tsx$/, '.html')), 'utf8');
    return {first, back, markup: renderedMarkupOf(html), againMarkup: renderedMarkupOf(again)};
  };

  it('treats a package linked from a folder in the project as a package: the file carries the page, and gives it back exactly', async () => {
    // `npm link`: node_modules links to a folder that the project holds.
    put('npm-link/package.json', '{"name":"npm-link","private":true}');
    putLinkedPackage('npm-link/vendor/badge', '@acme/linked');
    linkFolder('npm-link/node_modules/@acme/linked', 'npm-link/vendor/badge');
    put('npm-link/page.tsx', "import {Badge} from '@acme/linked';\nexport default function Page() { return <p><Badge /> after</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A `file:` dependency, installed as a link to its folder.
    put('file-dep/package.json', JSON.stringify({name: 'file-dep', private: true, dependencies: {'@acme/local': 'file:./libs/local'}}));
    putLinkedPackage('file-dep/libs/local', '@acme/local');
    linkFolder('file-dep/node_modules/@acme/local', 'file-dep/libs/local');
    put('file-dep/page.tsx', "import {Badge} from '@acme/local';\nexport default function Page() { return <p><Badge /> after</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    for (const [page, name] of [['npm-link/page.tsx', '@acme/linked'], ['file-dep/page.tsx', '@acme/local']]) {
      const {first, back, markup, againMarkup} = await roundTrip(page);
      expect(first.data.files).toEqual(['page.tsx']);
      expect(markup).toContain(`${name} badge text`);
      expect(back.data.exact).toBe(true);
      expect(back.data.files).toEqual([path.join(path.dirname(page), 'restored/page.tsx').split(path.sep).join('/')]);
      expect(againMarkup).toBe(markup);
    }
  }, 120_000);

  it('carries the files of a linked folder that the page imports by a relative path, as its own', async () => {
    put('rel-link/package.json', '{"name":"rel-link","private":true}');
    putLinkedPackage('rel-link/vendor/badge', '@acme/rel');
    put('rel-link/vendor/badge/src/parts/badge.css', '.rel-badge { letter-spacing: 4px; }');
    put(
      'rel-link/vendor/badge/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'rel-badge', children: label}); }\n",
    );
    linkFolder('rel-link/node_modules/@acme/rel', 'rel-link/vendor/badge');
    put('rel-link/page.tsx', "import {Badge} from './vendor/badge/src/index.js';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('rel-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['page.tsx', 'vendor/badge/src/index.js', 'vendor/badge/src/parts/badge.css', 'vendor/badge/src/parts/badge.js', 'vendor/badge/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('@acme/rel badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('carries the files of a linked folder that the page imports through a path alias', async () => {
    put('alias-link/package.json', '{"name":"alias-link","private":true}');
    put('alias-link/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@/*': ['./*']}}}));
    putLinkedPackage('alias-link/vendor/badge', '@acme/aliased');
    linkFolder('alias-link/node_modules/@acme/aliased', 'alias-link/vendor/badge');
    put('alias-link/page.tsx', "import {Badge} from '@/vendor/badge/src/index.js';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('alias-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['page.tsx', 'vendor/badge/src/index.js', 'vendor/badge/src/parts/badge.js', 'vendor/badge/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('@acme/aliased badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
    // Outside the project, the file still gives back every file the page imports.
    fs.copyFileSync(path.join(dir, 'alias-link/page.html'), path.join(dir, 'alias-link-moved.html'));
    const moved = /** @type {any} */ (await render('alias-link-moved.html', {cwd: dir, reverse: true, out: 'alias-link-moved/page.tsx'}));
    expect(moved.data.missing ?? []).toEqual([]);
    expect(moved.data.files).toEqual(expect.arrayContaining(['alias-link-moved/vendor/badge/src/index.js']));
  }, 120_000);

  it('carries the stylesheets of a linked folder that a carried module reaches after the package loaded', async () => {
    put('late-link/package.json', '{"name":"late-link","private":true}');
    putLinkedPackage('late-link/vendor/kit', '@acme/late');
    put('late-link/vendor/kit/src/parts/badge.css', '.late-badge { letter-spacing: 5px; }');
    put('late-link/vendor/kit/src/parts/label.css', '.late-label { word-spacing: 6px; }');
    put(
      'late-link/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'late-badge late-label', children: label}); }\n",
    );
    put('late-link/vendor/kit/src/parts/label.js', "import './label.css';\nexport const label = '@acme/late badge text';\n");
    linkFolder('late-link/node_modules/@acme/late', 'late-link/vendor/kit');
    // The package loads first, by its name; then the page's own module reaches
    // two of its files by their paths.
    put('late-link/own.js', "import './vendor/kit/src/parts/badge.css';\nimport {label} from './vendor/kit/src/parts/label.js';\nexport const own = `own ${label}`;\n");
    put(
      'late-link/page.tsx',
      "import {Badge} from '@acme/late';\nimport {own} from './own.js';\nexport default function Page() { return <p><Badge /> {own}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const {first, back, markup, againMarkup} = await roundTrip('late-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['own.js', 'page.tsx', 'vendor/kit/src/parts/badge.css', 'vendor/kit/src/parts/label.css', 'vendor/kit/src/parts/label.js'].sort(),
    );
    expect(markup).toContain('own @acme/late badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it("carries a linked folder's stylesheet that a carried stylesheet imports, whichever imported it first", async () => {
    put('share-link/package.json', '{"name":"share-link","private":true}');
    putLinkedPackage('share-link/vendor/kit', '@acme/share');
    put('share-link/vendor/kit/src/parts/tokens.css', '.share-badge { letter-spacing: 7px; }');
    put('share-link/vendor/kit/src/parts/badge.css', "@import './tokens.css';\n.share-badge { word-spacing: 1px; }");
    put('share-link/vendor/kit/src/parts/more.css', '.share-more { letter-spacing: 8px; }');
    put('share-link/vendor/kit/src/parts/theme.css', "@import './more.css';\n");
    put(
      'share-link/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport './badge.css';\nexport function Badge() { return jsx('strong', {className: 'share-badge share-more', children: label}); }\n",
    );
    linkFolder('share-link/node_modules/@acme/share', 'share-link/vendor/kit');
    // The package's own stylesheet imports tokens.css first; then the page's
    // own stylesheet imports it too, and the page reaches theme.css by its path.
    put('share-link/app.css', "@import './vendor/kit/src/parts/tokens.css';\n");
    put('share-link/own.js', "import './app.css';\nimport './vendor/kit/src/parts/theme.css';\nexport const own = 'own';\n");
    put(
      'share-link/page.tsx',
      "import {Badge} from '@acme/share';\nimport {own} from './own.js';\nexport default function Page() { return <p><Badge /> {own}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const {first, back, markup, againMarkup} = await roundTrip('share-link/page.tsx');
    expect([...first.data.files].sort()).toEqual(
      ['app.css', 'own.js', 'page.tsx', 'vendor/kit/src/parts/more.css', 'vendor/kit/src/parts/theme.css', 'vendor/kit/src/parts/tokens.css'].sort(),
    );
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('leaves out a project file that only a linked package imports, as one of the package', async () => {
    put('reach-out/package.json', '{"name":"reach-out","private":true}');
    putLinkedPackage('reach-out/vendor/kit', '@acme/reach');
    put('reach-out/shared/util.js', "export const suffix = 'from shared';\n");
    put(
      'reach-out/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport {suffix} from '../../../../shared/util.js';\nexport function Badge() { return jsx('strong', {children: `${label} ${suffix}`}); }\n",
    );
    linkFolder('reach-out/node_modules/@acme/reach', 'reach-out/vendor/kit');
    put('reach-out/page.tsx', "import {Badge} from '@acme/reach';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('reach-out/page.tsx');
    expect(first.data.files).toEqual(['page.tsx']);
    expect(first.data.notCarried ?? []).toEqual([]);
    expect(markup).toContain('@acme/reach badge text from shared');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('treats a workspace package that another linked package links in as a package too', async () => {
    put('ws-nest/package.json', JSON.stringify({name: 'ws-nest', private: true, workspaces: ['packages/*']}));
    putLinkedPackage('ws-nest/packages/utils', '@acme/nest-utils');
    putLinkedPackage('ws-nest/packages/ui', '@acme/nest-ui');
    put(
      'ws-nest/packages/ui/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {label} from '@acme/nest-utils/src/parts/label.js';\nexport function Badge() { return jsx('strong', {children: `ui ${label}`}); }\n",
    );
    put(
      'ws-nest/packages/utils/package.json',
      JSON.stringify({name: '@acme/nest-utils', version: '1.0.0', type: 'module', exports: {'.': './src/index.js', './src/parts/label.js': './src/parts/label.js'}}),
    );
    // pnpm links a workspace dependency into the package's own node_modules.
    linkFolder('ws-nest/node_modules/@acme/nest-ui', 'ws-nest/packages/ui');
    linkFolder('ws-nest/packages/ui/node_modules/@acme/nest-utils', 'ws-nest/packages/utils');
    put('ws-nest/src/page.tsx', "import {Badge} from '@acme/nest-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('ws-nest/src/page.tsx');
    expect(first.data.files).toEqual(['page.tsx']);
    expect(markup).toContain('ui @acme/nest-utils badge text');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it("carries an image that only a linked package's module names, for the script to draw later", async () => {
    put('late-img/package.json', '{"name":"late-img","private":true}');
    put('late-img/public/pics/late.png', PNG);
    putLinkedPackage('late-img/vendor/kit', '@acme/late-img');
    put(
      'late-img/vendor/kit/src/parts/badge.js',
      "import {jsx} from 'react/jsx-runtime';\nimport {useEffect, useState} from 'react';\nexport function Badge() {\n  const [on, setOn] = useState(false);\n  useEffect(() => setOn(true), []);\n  return on ? jsx('img', {src: '/pics/late.png', alt: 'later'}) : jsx('span', {children: 'before the script'});\n}\n",
    );
    linkFolder('late-img/node_modules/@acme/late-img', 'late-img/vendor/kit');
    put('late-img/page.tsx', "import {Badge} from '@acme/late-img';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back} = await roundTrip('late-img/page.tsx');
    expect(first.data.files).toEqual(['page.tsx', 'public/pics/late.png']);
    const html = fs.readFileSync(path.join(dir, 'late-img/page.html'), 'utf8');
    // The script draws the image from the file's own data, not from its path.
    expect(html.slice(html.lastIndexOf('<script>'))).not.toMatch(/["'`]\/pics\/late\.png["'`]/);
    expect(back.data.exact).toBe(true);
  }, 120_000);

  it("keeps a linked package's styles, JSON and images in the page, and carries only the images its script reads", async () => {
    put('link-assets/package.json', '{"name":"link-assets","private":true}');
    putLinkedPackage('link-assets/vendor/kit', '@acme/kit');
    put('link-assets/vendor/kit/src/parts/logo.png', PNG);
    put('link-assets/vendor/kit/src/parts/data.json', '{"count": 7}');
    put('link-assets/vendor/kit/src/parts/badge.css', "@import './tokens.css';\n.kit-badge { letter-spacing: 3px; }");
    put('link-assets/vendor/kit/src/parts/tokens.css', '.kit-badge { word-spacing: 2px; }');
    put(
      'link-assets/vendor/kit/src/parts/badge.js',
      "import {jsx, jsxs} from 'react/jsx-runtime';\nimport {label} from './label.js';\nimport logo from './logo.png';\nimport data from './data.json';\nimport './badge.css';\nexport function Badge() { return jsxs('strong', {className: 'kit-badge', children: [jsx('img', {src: logo, alt: ''}), label, ' ', data.count]}); }\n",
    );
    linkFolder('link-assets/node_modules/@acme/kit', 'link-assets/vendor/kit');
    put('link-assets/page.tsx', "import {Badge} from '@acme/kit';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const {first, back, markup, againMarkup} = await roundTrip('link-assets/page.tsx');
    expect(first.data.files).toEqual(['page.tsx', 'vendor/kit/src/parts/logo.png']);
    const html = fs.readFileSync(path.join(dir, 'link-assets/page.html'), 'utf8');
    expect(html).toMatch(/\.kit-badge ?\{ ?letter-spacing: ?3px/);
    expect(html).toMatch(/word-spacing: ?2px/);
    expect(markup).toContain('@acme/kit badge text 7');
    expect(markup).toContain('data:image/png;base64,');
    expect(back.data.exact).toBe(true);
    expect(againMarkup).toBe(markup);
  }, 120_000);

  it('treats a workspace package linked inside the project as a package, and keeps the layouts that work today', async () => {
    // A workspace whose root is the project: its package is linked in node_modules.
    put('ws-root/package.json', JSON.stringify({name: 'ws-root', private: true, workspaces: ['packages/*']}));
    putLinkedPackage('ws-root/packages/ui', '@acme/ws-ui');
    linkFolder('ws-root/node_modules/@acme/ws-ui', 'ws-root/packages/ui');
    put('ws-root/src/page.tsx', "import {Badge} from '@acme/ws-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A pnpm workspace app: the package is outside the app's project.
    put('ws-app/pnpm-workspace.yaml', "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
    putLinkedPackage('ws-app/packages/ui', '@acme/app-ui');
    put('ws-app/apps/web/package.json', JSON.stringify({name: 'web', private: true, dependencies: {'@acme/app-ui': 'workspace:*'}}));
    linkFolder('ws-app/apps/web/node_modules/@acme/app-ui', 'ws-app/packages/ui');
    put('ws-app/apps/web/page.tsx', "import {Badge} from '@acme/app-ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // The pnpm store layout: node_modules links into node_modules/.pnpm.
    put('pnpm-store/package.json', '{"name":"pnpm-store","private":true}');
    putLinkedPackage('pnpm-store/node_modules/.pnpm/@acme+stored@1.0.0/node_modules/@acme/stored', '@acme/stored');
    linkFolder('pnpm-store/node_modules/@acme/stored', 'pnpm-store/node_modules/.pnpm/@acme+stored@1.0.0/node_modules/@acme/stored');
    put('pnpm-store/page.tsx', "import {Badge} from '@acme/stored';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    // A CommonJS package and an ES module package, installed as folders.
    put('cjs-pkg/package.json', '{"name":"cjs-pkg","private":true}');
    put('cjs-pkg/node_modules/acme-cjs/package.json', JSON.stringify({name: 'acme-cjs', version: '1.0.0', main: './lib/index.js'}));
    put('cjs-pkg/node_modules/acme-cjs/lib/index.js', "exports.Badge = require('./badge.js').Badge;\n");
    put('cjs-pkg/node_modules/acme-cjs/lib/badge.js', "const {jsx} = require('react/jsx-runtime');\nexports.Badge = function Badge() { return jsx('strong', {children: 'acme-cjs badge text'}); };\n");
    put('cjs-pkg/page.tsx', "import {Badge} from 'acme-cjs';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('esm-pkg/package.json', '{"name":"esm-pkg","private":true}');
    putLinkedPackage('esm-pkg/node_modules/@acme/esm', '@acme/esm');
    put('esm-pkg/page.tsx', "import {Badge} from '@acme/esm';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    for (const [page, text] of [
      ['ws-root/src/page.tsx', '@acme/ws-ui badge text'],
      ['ws-app/apps/web/page.tsx', '@acme/app-ui badge text'],
      ['pnpm-store/page.tsx', '@acme/stored badge text'],
      ['cjs-pkg/page.tsx', 'acme-cjs badge text'],
      ['esm-pkg/page.tsx', '@acme/esm badge text'],
    ]) {
      const {first, back, markup, againMarkup} = await roundTrip(page);
      expect(first.data.files).toEqual(['page.tsx']);
      expect(markup).toContain(text);
      expect(back.data.exact).toBe(true);
      expect(againMarkup).toBe(markup);
    }
  }, 180_000);

  it('uses an explicit --title', async () => {
    const r = /** @type {any} */ (await render('page.tsx', {cwd: dir, out: 'titled.html', title: 'Q3 <report>'}));
    expect(r.data.output).toBe('titled.html');
    expect(fs.readFileSync(path.join(dir, 'titled.html'), 'utf8')).toContain('<title>Q3 &lt;report&gt;</title>');
  }, 60_000);
});

describe('render(): every write stays inside the current folder', () => {
  it('refuses an embedded entry path that climbs out', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'inner'), {recursive: true});
    put(
      'inner/entry.html',
      `<body><p class="astryx-text">x</p>${sourceBlock('../../../outside.tsx', [
        {path: '../../../outside.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')},
      ])}</body>`,
    );
    expect(await codeOf(() => render('inner/entry.html', {cwd: dir, reverse: true}))).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'inner/outside.tsx'))).toBe(false);
  });

  it('gives back a page that imports from a parent folder, keeping the layout inside the current folder', async () => {
    put('tree/src/components/Footer.tsx', 'export function Footer() { return <p>Parent footer</p>; }\n');
    put(
      'tree/src/app/page.tsx',
      "import {Footer} from '../components/Footer';\nexport default function Page() { return <main><h1>Tree</h1><Footer /></main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const cwd = path.join(dir, 'tree/src/app');
    const r = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(r.data.files).toEqual(['app/page.tsx', 'components/Footer.tsx']);
    // From the page's own folder, the neighbour would land outside it, beside
    // existing files: refused, naming a new folder to restore into.
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'back.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.message).toContain('--out restored/app/back.tsx');
    expect(fs.existsSync(path.join(cwd, 'back.tsx'))).toBe(false);
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'restored/app/back.tsx'}));
    expect(back.data.files).toEqual(['restored/app/back.tsx', 'restored/components/Footer.tsx']);
    const again = /** @type {any} */ (await render('restored/app/back.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    // From a folder that holds the whole tree, the page lands where asked.
    const up = path.join(dir, 'tree');
    const back2 = /** @type {any} */ (await render('src/app/page.html', {cwd: up, reverse: true, out: 'copy/app/page.tsx'}));
    expect(back2.data.output).toBe('copy/app/page.tsx');
    expect(back2.data.files).toEqual(['copy/app/page.tsx', 'copy/components/Footer.tsx']);
    // Into a folder with another name: each neighbour goes where the page's
    // own imports find it from there, and the page renders again.
    const renamed = /** @type {any} */ (
      await render('src/app/page.html', {cwd: up, reverse: true, out: 'src/reports/today/page.tsx'})
    );
    expect(renamed.data.output).toBe('src/reports/today/page.tsx');
    expect(renamed.data.files).toEqual(['src/reports/today/page.tsx', 'src/reports/components/Footer.tsx']);
    const rerendered = /** @type {any} */ (await render('src/reports/today/page.tsx', {cwd: up}));
    expect(rerendered.type).toBe('render.page');
  }, 60_000);

  it('resolves a tsconfig path alias', async () => {
    put('aliased/tsconfig.json', '{\n  // paths\n  "compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}},\n}\n');
    put('aliased/package.json', '{"name":"aliased","private":true}');
    put('aliased/src/Header.tsx', 'export function Header() { return <p>Aliased header</p>; }\n');
    put('aliased/src/page.tsx', "import {Header} from '@/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('aliased/src/bad.tsx', "import X from '@/nope';\nexport default function Page() { return <X />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('aliased/src/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'aliased/src/page.html'), 'utf8')).toContain('Aliased header');
    expect(r.data.files).toEqual(['page.tsx', 'Header.tsx']);
    expect(await codeOf(() => render('aliased/src/bad.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
  }, 60_000);

  it('reads the aliases of the referenced project that holds the page, behind a solution-style tsconfig.json', async () => {
    const vite = (/** @type {string} */ name) => {
      put(`${name}/package.json`, `{"name":"${name}","private":true}`);
      put(`${name}/tsconfig.json`, '{\n  "files": [],\n  "references": [{"path": "./tsconfig.app.json"}, {"path": "./tsconfig.node.json"}]\n}\n');
      put(`${name}/tsconfig.app.json`, '{\n  "compilerOptions": {"paths": {"@/*": ["./src/*"]}},\n  "include": ["src"],\n}\n');
      put(`${name}/tsconfig.node.json`, '{"compilerOptions": {"paths": {"@/*": ["./config/*"]}}, "include": ["vite.config.ts"]}\n');
    };
    vite('solution');
    put('solution/src/components/Header.tsx', 'export function Header() { return <p>Solution header</p>; }\n');
    put('solution/src/pages/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('solution/src/pages/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['pages/page.tsx', 'components/Header.tsx']);
    expect(fs.readFileSync(path.join(dir, 'solution/src/pages/page.html'), 'utf8')).toContain('Solution header');
    // A project laid out the same way takes it back where its own alias points.
    vite('solution-to');
    fs.copyFileSync(path.join(dir, 'solution/src/pages/page.html'), path.join(dir, 'solution-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'solution-to'), reverse: true, out: 'src/pages/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['src/pages/page.tsx', 'src/components/Header.tsx']});
  }, 60_000);

  it('reads aliases through extends: a path without .json, a package, and a list whose later config wins', async () => {
    // A base config above the project: its baseUrl is read from its own folder.
    put('ext/tsconfig.base.json', '{"compilerOptions": {"baseUrl": "apps/web", "paths": {"@data/*": ["src/data/*"]}}}\n');
    put('ext/apps/web/package.json', '{"name":"web","private":true}');
    put('ext/apps/web/tsconfig.json', '{"extends": "../../tsconfig.base"}\n');
    put('ext/apps/web/src/data/rows.ts', "export const rows = ['North', 'South'];\n");
    put('ext/apps/web/src/pages/page.tsx', "import {rows} from '@data/rows';\nexport default function Page() { return <ul>{rows.map(r => <li key={r}>{r}</li>)}</ul>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const web = /** @type {any} */ (await render('ext/apps/web/src/pages/page.tsx', {cwd: dir}));
    expect(web.data.files).toEqual(['pages/page.tsx', 'data/rows.ts']);
    // A package's config, after one of the project's own: the later one wins,
    // and ${configDir} is the folder of the config the project reads.
    put('ext-pkg/package.json', '{"name":"ext-pkg","private":true}');
    put('ext-pkg/node_modules/@acme/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-pkg/node_modules/@acme/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-pkg/tsconfig.first.json', '{"compilerOptions": {"paths": {"@ui/*": ["./elsewhere/*"]}}}\n');
    put('ext-pkg/tsconfig.json', '{"extends": ["./tsconfig.first.json", "@acme/tsconfig/base.json"]}\n');
    put('ext-pkg/src/ui/Panel.tsx', 'export function Panel() { return <section>Panel from the package alias</section>; }\n');
    put('ext-pkg/src/page.tsx', "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const pkg = /** @type {any} */ (await render('ext-pkg/src/page.tsx', {cwd: dir}));
    expect(pkg.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    expect(fs.readFileSync(path.join(dir, 'ext-pkg/src/page.html'), 'utf8')).toContain('Panel from the package alias');
    // A package named alone: its tsconfig field, else its tsconfig.json,
    // never its code `main`.
    const config = '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n';
    for (const [name, files, extendsName = name] of [
      ['js-main', {'package.json': '{"name":"js-main","version":"1.0.0","main":"index.js"}', 'index.js': 'module.exports = {};\n', 'tsconfig.json': config}],
      ['field', {'package.json': '{"name":"field","version":"1.0.0","main":"index.js","tsconfig":"./configs/base.json"}', 'index.js': 'module.exports = {};\n', 'configs/base.json': config}],
      // A package whose exports send "." to its config, or a pattern a subpath matches.
      ['dot', {'package.json': '{"name":"dot","version":"1.0.0","exports":{".":{"import":"./esm.json","require":"./configs/base.json"}}}', 'configs/base.json': config}],
      ['star', {'package.json': '{"name":"star","version":"1.0.0","exports":{"./*":"./configs/*.json"}}', 'configs/strict.json': config}, 'star/strict'],
      // Of two patterns, the one with the longer part before the `*` wins, as in Node.
      ['order', {'package.json': '{"name":"order","version":"1.0.0","exports":{"./*.json":"./wrong/*.json","./a*":"./right/a*"}}', 'right/ab.json': config, 'wrong/ab.json': '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/nowhere/*"]}}}\n'}, 'order/ab.json'],
    ]) {
      const root = `ext-${name}`;
      put(`${root}/package.json`, `{"name":"${root}","private":true}`);
      for (const [file, text] of Object.entries(files)) put(`${root}/node_modules/${name}/${file}`, text);
      put(`${root}/tsconfig.json`, `{"extends": "${extendsName}"}\n`);
      put(`${root}/src/ui/Panel.tsx`, 'export function Panel() { return <section>Panel</section>; }\n');
      put(`${root}/src/page.tsx`, "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n");
      const r = /** @type {any} */ (await render(`${root}/src/page.tsx`, {cwd: dir}));
      expect(r.data.files, name).toEqual(['page.tsx', 'ui/Panel.tsx']);
    }
    // A config package read through a link: from where it really is, so a
    // package it extends in turn, and paths that climb out of it, resolve
    // from there; and a nearer copy without the config is passed by.
    const panel = 'export function Panel() { return <section>Panel</section>; }\n';
    const page = "import {Panel} from '@ui/Panel';\nexport default function Page() { return <Panel />; }\nimport '@astryxdesign/core/astryx.css';\n";
    put('ext-store/package.json', '{"name":"ext-store","private":true}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/package.json', '{"name":"cfg","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg/tsconfig.json', '{"extends": "cfg-base"}\n');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/package.json', '{"name":"cfg-base","version":"1.0.0"}');
    put('ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg-base/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    fs.symlinkSync(path.join(dir, 'ext-store/node_modules/.pnpm/cfg@1.0.0/node_modules/cfg'), path.join(dir, 'ext-store/node_modules/cfg'), 'junction');
    put('ext-store/tsconfig.json', '{"extends": "cfg"}\n');
    put('ext-store/src/ui/Panel.tsx', panel);
    put('ext-store/src/page.tsx', page);
    const store = /** @type {any} */ (await render('ext-store/src/page.tsx', {cwd: dir}));
    expect(store.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
    put('ext-ws/package.json', '{"name":"ext-ws","private":true}');
    put('ext-ws/packages/tsconfig/package.json', '{"name":"@acme/tsconfig","version":"1.0.0"}');
    put('ext-ws/packages/tsconfig/base.json', '{"compilerOptions": {"paths": {"@ui/*": ["../ui/src/*"]}}}\n');
    put('ext-ws/packages/ui/src/Panel.tsx', panel);
    put('ext-ws/apps/web/package.json', '{"name":"web","private":true}');
    fs.mkdirSync(path.join(dir, 'ext-ws/apps/web/node_modules/@acme'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'ext-ws/packages/tsconfig'), path.join(dir, 'ext-ws/apps/web/node_modules/@acme/tsconfig'), 'junction');
    put('ext-ws/apps/web/tsconfig.json', '{"extends": "@acme/tsconfig/base"}\n');
    put('ext-ws/apps/web/src/page.tsx', page);
    // The alias leads out of the app, to the workspace package it names.
    await render('ext-ws/apps/web/src/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'ext-ws/apps/web/src/page.html'), 'utf8')).toContain('<section>Panel</section>');
    put('ext-near/package.json', '{"name":"ext-near","private":true}');
    put('ext-near/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"1.0.0"}');
    put('ext-near/node_modules/shared-cfg/tsconfig.json', '{"compilerOptions": {"paths": {"@ui/*": ["${configDir}/src/ui/*"]}}}\n');
    put('ext-near/app/package.json', '{"name":"app","private":true}');
    put('ext-near/app/node_modules/shared-cfg/package.json', '{"name":"shared-cfg","version":"0.1.0"}');
    put('ext-near/app/tsconfig.json', '{"extends": "shared-cfg"}\n');
    put('ext-near/app/src/ui/Panel.tsx', panel);
    put('ext-near/app/src/page.tsx', page);
    const near = /** @type {any} */ (await render('ext-near/app/src/page.tsx', {cwd: dir}));
    expect(near.data.files).toEqual(['page.tsx', 'ui/Panel.tsx']);
  }, 60_000);

  it('gives back a page that imports through an alias where this project\'s alias points', async () => {
    put('aliased-src/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-src/package.json', '{"name":"aliased-src","private":true}');
    put('aliased-src/src/components/Header.tsx', 'export function Header() { return <p>Alias header</p>; }\n');
    put(
      'aliased-src/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('aliased-src/src/app/page.tsx', {cwd: dir});
    // Another project with the same alias, and the guide's own command.
    put('aliased-to/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('aliased-to/package.json', '{"name":"aliased-to","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'aliased-to/page.html'));
    const cwd = path.join(dir, 'aliased-to');
    // The alias leads into an existing folder that lacks the file: its copy
    // goes in the page's layout, which from here is outside the folder the
    // restore creates, so it is refused with a new folder to use.
    put('aliased-to/src/keep.txt', 'existing\n');
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd, reverse: true, out: 'page.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(refused.suggestions?.[0]?.name).toBe('--out restored/app/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'src/components'))).toBe(false);
    fs.rmSync(path.join(cwd, 'src'), {recursive: true});
    // Into a new folder the alias points into: the page and its import come back.
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'src/app/page.tsx'}));
    expect(back.data.files).toEqual(['src/app/page.tsx', 'src/components/Header.tsx']);
    const again = /** @type {any} */ (await render('src/app/page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    expect(fs.readFileSync(path.join(cwd, 'src/app/page.html'), 'utf8')).toContain('Alias header');
    // Without the alias, the file comes back in the page's own layout inside
    // the new folder, and the result names the import and its file.
    put('no-alias/package.json', '{"name":"no-alias","private":true}');
    fs.copyFileSync(path.join(dir, 'aliased-src/src/app/page.html'), path.join(dir, 'no-alias/page.html'));
    const away = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'no-alias'), reverse: true}));
    expect(away.data).toMatchObject({
      exact: true,
      files: ['page-restored/app/page.tsx', 'page-restored/components/Header.tsx'],
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./page-restored/*']},
        imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}],
      },
    });
    expect(fs.readFileSync(path.join(dir, 'no-alias/page-restored/components/Header.tsx'))).toEqual(
      fs.readFileSync(path.join(dir, 'aliased-src/src/components/Header.tsx')),
    );
  }, 60_000);

  it('restores an aliased page in its own project again and again', async () => {
    put('alias-home/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-home/package.json', '{"name":"alias-home","private":true}');
    const header = 'export function Header() { return <p>Home header</p>; }\n';
    put('alias-home/src/components/Header.tsx', header);
    put('alias-home/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const cwd = path.join(dir, 'alias-home');
    await render('src/app/page.tsx', {cwd, out: 'page.html'});
    // The project's alias reaches the same file: the page uses it, and only the page is written.
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data).toMatchObject({exact: true, files: ['page-restored/app/page.tsx']});
    expect(back.data.aliased).toEqual({imports: [], sameAsProject: [{import: '@/components/Header', file: 'src/components/Header.tsx'}]});
    // Render it again, and give that back too.
    await render('page-restored/app/page.tsx', {cwd, out: 'page.html'});
    expect(fs.readFileSync(path.join(cwd, 'page.html'), 'utf8')).toContain('Home header');
    const twice = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    // The new render carries the page from where it now sits, beside the project's file.
    expect(twice.data.files).toEqual(['page-restored-2/page-restored/app/page.tsx']);
    // The project's file changed since the render: the page's own copy comes
    // back in its layout, the result names the project's file, and the
    // `paths` lead the import to the copy first.
    put('alias-home/src/components/Header.tsx', 'export function Header() { return <p>Changed header</p>; }\n');
    const changed = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    const copy = 'page-restored-3/src/components/Header.tsx';
    expect(changed.data.files).toEqual(['page-restored-3/page-restored/app/page.tsx', copy]);
    expect(changed.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {'@/*': ['./src/*', './page-restored-3/src/*'], '@/components/Header': [`./${copy}`]},
      imports: [{import: '@/components/Header', file: copy}],
      differs: [
        {
          import: '@/components/Header',
          project: 'src/components/Header.tsx',
          exists: true,
          file: copy,
          projectWide: true,
          instead: [{file: 'page-restored-3/page-restored/app/page.tsx', import: '../../src/components/Header'}],
        },
      ],
    });
    expect(fs.readFileSync(path.join(cwd, copy), 'utf8')).toBe(header);
    expect(fs.readFileSync(path.join(cwd, 'src/components/Header.tsx'), 'utf8')).toContain('Changed header');
    put('alias-home/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: changed.data.aliased.paths}}));
    await render('page-restored-3/page-restored/app/page.tsx', {cwd, out: 'again.html'});
    expect(fs.readFileSync(path.join(cwd, 'again.html'), 'utf8')).toContain('Home header');
    // The aliased file is the same, but a file it imports changed in the
    // project: using the project's file would render the changed import, so
    // the page's copies of both come back.
    put('alias-deep/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-deep/package.json', '{"name":"alias-deep","private":true}');
    put('alias-deep/src/components/Header.tsx', "import {mark} from './mark';\nexport function Header() { return <p>Deep header {mark}</p>; }\n");
    const mark = "export const mark = 'sent mark';\n";
    put('alias-deep/src/components/mark.ts', mark);
    put('alias-deep/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const deep = path.join(dir, 'alias-deep');
    await render('src/app/page.tsx', {cwd: deep, out: 'page.html'});
    // Unchanged: the page uses the project's files, and only the page is written.
    const same = /** @type {any} */ (await render('page.html', {cwd: deep, reverse: true}));
    expect(same.data.files).toEqual(['page-restored/app/page.tsx']);
    expect(same.data.aliased).toEqual({imports: [], sameAsProject: [{import: '@/components/Header', file: 'src/components/Header.tsx'}]});
    put('alias-deep/src/components/mark.ts', "export const mark = 'changed mark';\n");
    const below = /** @type {any} */ (await render('page.html', {cwd: deep, reverse: true}));
    expect(below.data.exact).toBe(true);
    expect(below.data.files).toEqual([
      'page-restored-2/app/page.tsx',
      'page-restored-2/components/Header.tsx',
      'page-restored-2/components/mark.ts',
    ]);
    expect(below.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored-2/components/Header.tsx',
        changed: ['src/components/mark.ts'],
        projectWide: true,
        instead: [{file: 'page-restored-2/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    expect(fs.readFileSync(path.join(deep, 'page-restored-2/components/mark.ts'), 'utf8')).toBe(mark);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: deep});
    expect(stdout).toContain("is the same as the page's copy, but files it imports differ here (src/components/mark.ts)");
    expect(stdout).toContain('The "paths" below apply to the whole project');
    expect(stdout).toContain("in page-restored-3/app/page.tsx, import '../components/Header'");
    // The narrower fix, as the answer gives it: the restored page imports the copy by a relative path.
    const restoredPage = path.join(deep, 'page-restored-2/app/page.tsx');
    fs.writeFileSync(restoredPage, fs.readFileSync(restoredPage, 'utf8').replace("'@/components/Header'", "'../components/Header'"));
    await render('page-restored-2/app/page.tsx', {cwd: deep, out: 'narrow.html'});
    expect(fs.readFileSync(path.join(deep, 'narrow.html'), 'utf8')).toContain('sent mark');
  }, 90_000);

  it('gives the relative imports for a chain of restored copies, and for an alias whose file is not there', async () => {
    const config = '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n';
    put('alias-chain/tsconfig.json', config);
    put('alias-chain/package.json', '{"name":"alias-chain","private":true}');
    put('alias-chain/src/components/Icon.tsx', 'export function Icon() { return <i>sent icon</i>; }\n');
    put('alias-chain/src/components/Header.tsx', "import {Icon} from '@/components/Icon';\nexport function Header() { return <p>Chain header <Icon /></p>; }\n");
    put('alias-chain/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const cwd = path.join(dir, 'alias-chain');
    await render('src/app/page.tsx', {cwd, out: 'page.html'});
    // Both files the alias reaches changed in the project since the render.
    put('alias-chain/src/components/Icon.tsx', 'export function Icon() { return <i>changed icon</i>; }\n');
    put('alias-chain/src/components/Header.tsx', "import {Icon} from '@/components/Icon';\nexport function Header() { return <p>Changed header <Icon /></p>; }\n");
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data.files).toEqual(['page-restored/app/page.tsx', 'page-restored/components/Header.tsx', 'page-restored/components/Icon.tsx']);
    expect(back.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
      {
        import: '@/components/Icon',
        project: 'src/components/Icon.tsx',
        exists: true,
        file: 'page-restored/components/Icon.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/components/Header.tsx', import: './Icon'}],
      },
    ]);
    // Following every `instead`, the restored page renders the page's own copies, not the project's changed files.
    for (const {instead, import: spec} of back.data.aliased.differs) {
      for (const {file, import: relative} of instead) {
        const at = path.join(cwd, file);
        fs.writeFileSync(at, fs.readFileSync(at, 'utf8').replace(`'${spec}'`, `'${relative}'`));
      }
    }
    await render('page-restored/app/page.tsx', {cwd, out: 'narrow.html'});
    const narrow = fs.readFileSync(path.join(cwd, 'narrow.html'), 'utf8');
    expect(narrow).toContain('Chain header');
    expect(narrow).toContain('sent icon');
    expect(narrow).not.toContain('changed icon');
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    // The alias is there but its file is not: the text names the whole-project reach and the relative import too.
    put('alias-gone/tsconfig.json', config);
    put('alias-gone/package.json', '{"name":"alias-gone","private":true}');
    put('alias-gone-src/tsconfig.json', config);
    put('alias-gone-src/package.json', '{"name":"alias-gone-src","private":true}');
    put('alias-gone-src/src/components/Header.tsx', 'export function Header() { return <p>Gone header</p>; }\n');
    put('alias-gone-src/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('alias-gone-src/src/app/page.tsx', {cwd: dir});
    fs.copyFileSync(path.join(dir, 'alias-gone-src/src/app/page.html'), path.join(dir, 'alias-gone/page.html'));
    const gone = path.join(dir, 'alias-gone');
    const missing = /** @type {any} */ (await render('page.html', {cwd: gone, reverse: true}));
    expect(missing.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: false,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: gone});
    expect(stdout).toContain('@/components/Header reaches src/components/Header.tsx in this project, which is not there');
    expect(stdout).toContain('The "paths" below apply to the whole project: with them, every file that imports @/components/Header gets the page\'s copy.');
    expect(stdout).toContain("in page-restored-2/app/page.tsx, import '../components/Header'");
    expect(fs.readFileSync(path.join(gone, 'tsconfig.json'), 'utf8')).toBe(config);
  }, 90_000);

  it('never edits a tsconfig.json: a reverse that needs an alias entry names the entry, the file it belongs in, and why', async () => {
    put('tsc-src/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('tsc-src/package.json', '{"name":"tsc-src","private":true}');
    put('tsc-src/src/components/Header.tsx', 'export function Header() { return <p>Sent header</p>; }\n');
    put('tsc-src/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('tsc-src/src/app/page.tsx', {cwd: dir});
    const sent = path.join(dir, 'tsc-src/src/app/page.html');
    // A project whose config has other aliases, with a comment and its own layout, that no tool may rewrite.
    const config = '{\n  // the project\'s own aliases\n  "compilerOptions": {"baseUrl": ".", "paths": {"$lib/*": ["./lib/*"]}},\n}\n';
    put('tsc-to/package.json', '{"name":"tsc-to","private":true}');
    put('tsc-to/tsconfig.json', config);
    fs.copyFileSync(sent, path.join(dir, 'tsc-to/page.html'));
    const cwd = path.join(dir, 'tsc-to');
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true}));
    expect(back.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {'$lib/*': ['./lib/*'], '@/*': ['./page-restored/*']},
      imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}],
    });
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd});
    expect(stdout).toContain('through a path alias that does not reach it in this project');
    expect(stdout).toContain('set the "paths" of tsconfig.json');
    expect(stdout).toContain('"$lib/*": ["./lib/*"], "@/*": ["./page-restored-2/*"]');
    expect(fs.readFileSync(path.join(cwd, 'tsconfig.json'), 'utf8')).toBe(config);
    // The project's alias reaches a different file: that file and the config stay as they are, and the answer says why.
    const aliased = '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n';
    const own = 'export function Header() { return <p>Own header</p>; }\n';
    put('tsc-own/package.json', '{"name":"tsc-own","private":true}');
    put('tsc-own/tsconfig.json', aliased);
    put('tsc-own/src/components/Header.tsx', own);
    fs.copyFileSync(sent, path.join(dir, 'tsc-own/page.html'));
    const ownCwd = path.join(dir, 'tsc-own');
    const differs = /** @type {any} */ (await render('page.html', {cwd: ownCwd, reverse: true}));
    expect(differs.data.aliased.differs).toEqual([
      {
        import: '@/components/Header',
        project: 'src/components/Header.tsx',
        exists: true,
        file: 'page-restored/components/Header.tsx',
        projectWide: true,
        instead: [{file: 'page-restored/app/page.tsx', import: '../components/Header'}],
      },
    ]);
    expect(differs.data.aliased.config).toBe('tsconfig.json');
    const text = (await runCli(['experimental', 'export', '--reverse', 'page.html'], {cwd: ownCwd})).stdout;
    expect(text).toContain('@/components/Header reaches src/components/Header.tsx in this project, which differs from the copy the page carries');
    expect(text).toContain('every file that imports @/components/Header gets the page\'s copy instead of src/components/Header.tsx');
    expect(fs.readFileSync(path.join(ownCwd, 'tsconfig.json'), 'utf8')).toBe(aliased);
    expect(fs.readFileSync(path.join(ownCwd, 'src/components/Header.tsx'), 'utf8')).toBe(own);
  }, 60_000);

  it('names the paths for an alias import from a file that records none', async () => {
    put('alias-old/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('alias-old/package.json', '{"name":"alias-old","private":true}');
    put('alias-old/src/components/Header.tsx', 'export function Header() { return <p>Old header</p>; }\n');
    put('alias-old/src/app/page.tsx', "import {Header} from '@/components/Header';\nexport default function Page() { return <Header />; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('alias-old/src/app/page.tsx', {cwd: dir});
    // A CLI before the alias record wrote the same block without it.
    const html = fs.readFileSync(path.join(dir, 'alias-old/src/app/page.html'), 'utf8');
    const open = '<script type="application/x-astryx-source">';
    const start = html.indexOf(open) + open.length;
    const end = html.indexOf('</script>', start);
    const block = JSON.parse(html.slice(start, end));
    expect(block.aliases).toBeDefined();
    delete block.aliases;
    const json = JSON.stringify(block).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    put('alias-old-to/package.json', '{"name":"alias-old-to","private":true}');
    put('alias-old-to/page.html', html.slice(0, start) + json + html.slice(end));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'alias-old-to'), reverse: true}));
    expect(back.data).toMatchObject({
      exact: true,
      files: ['page-restored/app/page.tsx', 'page-restored/components/Header.tsx'],
      aliased: {config: 'tsconfig.json', paths: {'@/*': ['./page-restored/*']}, imports: [{import: '@/components/Header', file: 'page-restored/components/Header.tsx'}]},
    });
  }, 60_000);

  it('names the whole paths a page needs: every target of an alias, and the entries a config inherits', async () => {
    put('multi/package.json', '{"name":"multi","private":true}');
    put('multi/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*", "./generated/*"]}}}\n');
    put('multi/src/components/Header.tsx', 'export function Header() { return <h1>Multi</h1>; }\n');
    put('multi/generated/api/client.ts', "export const client = 'generated client';\n");
    put(
      'multi/src/app/page.tsx',
      "import {Header} from '@/components/Header';\nimport {client} from '@/api/client';\nexport default function Page() { return <main><Header />{client}</main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('multi/src/app/page.tsx', {cwd: dir});
    // A project whose config takes its paths from the config it extends.
    put('multi-to/package.json', '{"name":"multi-to","private":true}');
    put('multi-to/tsconfig.base.json', '{"compilerOptions": {"paths": {"$lib/*": ["./lib/*"]}}}\n');
    put('multi-to/tsconfig.json', '{"extends": "./tsconfig.base.json"}\n');
    fs.copyFileSync(path.join(dir, 'multi/src/app/page.html'), path.join(dir, 'multi-to/multi.html'));
    const back = /** @type {any} */ (await render('multi.html', {cwd: path.join(dir, 'multi-to'), reverse: true}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.aliased).toEqual({
      config: 'tsconfig.json',
      paths: {
        '$lib/*': ['./lib/*'],
        '@/*': ['./multi-restored/generated/*', './multi-restored/src/*'],
        '@/api/client': ['./multi-restored/generated/api/client.ts'],
        '@/components/Header': ['./multi-restored/src/components/Header.tsx'],
      },
      imports: [
        {import: '@/api/client', file: 'multi-restored/generated/api/client.ts'},
        {import: '@/components/Header', file: 'multi-restored/src/components/Header.tsx'},
      ],
    });
    // An alias whose first target overrides files of the second: the page
    // renders again with the override, once the printed paths are set.
    put('ov/package.json', '{"name":"ov","private":true}');
    put('ov/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/overrides/*", "./src/*"]}}}\n');
    put('ov/src/Zed.tsx', "export function Zed() { return <p>base Zed</p>; }\n");
    put('ov/src/overrides/Zed.tsx', "import {Zed as Base} from '../Zed';\nexport function Zed() { return <section>override <Base /></section>; }\n");
    put('ov/src/Apple.tsx', "export function Apple() { return <p>Apple</p>; }\n");
    put('ov/src/page.tsx', "import {Zed} from '@/Zed';\nimport {Apple} from '@/Apple';\nexport default function Page() { return <main><Apple /><Zed /></main>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('ov/src/page.tsx', {cwd: dir});
    put('ov-to/package.json', '{"name":"ov-to","private":true}');
    fs.copyFileSync(path.join(dir, 'ov/src/page.html'), path.join(dir, 'ov-to/ov.html'));
    const ov = /** @type {any} */ (await render('ov.html', {cwd: path.join(dir, 'ov-to'), reverse: true}));
    expect(ov.data.aliased.paths['@/Zed']).toEqual(['./ov-restored/overrides/Zed.tsx']);
    put('ov-to/tsconfig.json', JSON.stringify({compilerOptions: {paths: ov.data.aliased.paths}}));
    await render('ov-restored/page.tsx', {cwd: path.join(dir, 'ov-to'), out: 'again.html'});
    expect(fs.readFileSync(path.join(dir, 'ov-to/again.html'), 'utf8')).toContain('override');
  }, 60_000);

  it('gives back an aliased page where no alias of the project names its imports: in its own layout, naming the paths to add', async () => {
    const {sourceBlock: sourceBlockOf} = await import('../../foundation/render/source-block.mjs');
    put('alias-home/tsconfig.json', '{"compilerOptions": {"paths": {"@/*": ["./src/*"], "@members": ["./src/lib/members.ts"]}}}\n');
    put('alias-home/package.json', '{"name":"alias-home","private":true}');
    put('alias-home/src/components/Header.tsx', 'export function Header() { return <h1>Team</h1>; }\n');
    put('alias-home/src/lib/members.ts', "export const members = ['Ana', 'Bo'];\n");
    put(
      'alias-home/src/app/team/page.tsx',
      "import {Header} from '@/components/Header';\nimport {members} from '@members';\nexport default function Page() { return <main><Header />{members.join(', ')}</main>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('alias-home/src/app/team/page.tsx', {cwd: dir});
    // Someone with only the HTML file, in a project with no tsconfig.json.
    const cwd = path.join(dir, 'alias-away');
    put('alias-away/package.json', '{"name":"alias-away","private":true}');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(cwd, 'team.html'));
    const back = /** @type {any} */ (await render('team.html', {cwd, reverse: true}));
    expect(back.data).toMatchObject({
      mode: 'embedded',
      exact: true,
      output: 'team-restored/app/team/page.tsx',
      aliased: {
        config: 'tsconfig.json',
        paths: {'@/*': ['./team-restored/*'], '@members': ['./team-restored/lib/members.ts']},
        imports: [
          {import: '@/components/Header', file: 'team-restored/components/Header.tsx'},
          {import: '@members', file: 'team-restored/lib/members.ts'},
        ],
      },
    });
    for (const name of ['app/team/page.tsx', 'components/Header.tsx', 'lib/members.ts']) {
      expect(fs.readFileSync(path.join(cwd, 'team-restored', name))).toEqual(fs.readFileSync(path.join(dir, 'alias-home/src', name)));
    }
    const {stdout} = await runCli(['experimental', 'export', '--reverse', 'team.html'], {cwd});
    expect(stdout).toContain('set the "paths" of tsconfig.json (create it if it is not there) to: "@/*": ["./team-restored-2/*"], "@members": ["./team-restored-2/lib/members.ts"].');
    // The entries are written for the config TypeScript reads there, from
    // its baseUrl.
    put('alias-base/package.json', '{"name":"alias-base","private":true}');
    put('alias-base/tsconfig.json', '{"compilerOptions": {"baseUrl": "src"}}\n');
    fs.copyFileSync(path.join(dir, 'alias-home/src/app/team/page.html'), path.join(dir, 'alias-base/team.html'));
    const based = /** @type {any} */ (await render('team.html', {cwd: path.join(dir, 'alias-base'), reverse: true, out: 'src/team/app/team/page.tsx'}));
    expect(based.data.aliased).toMatchObject({config: 'tsconfig.json', paths: {'@/*': ['./team/*'], '@members': ['./team/lib/members.ts']}});
    // A record never remaps a package: a forged entry for `react` is not
    // followed, and the file it names is refused.
    put(
      'alias-away/forged-react.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import React from 'react';\nexport default function Page() { return React.createElement('p', null, 'x'); }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'lib/react.ts', bytes: Buffer.from('export default {};\n')},
        ],
        {aliases: {react: 'lib/react.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-react.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-react-restored'))).toBe(false);
    // Nor a package's own subpath import, which its package.json may map.
    put(
      'alias-away/forged-hash.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {u} from '#utils';\nexport default function Page() { return <p>{u}</p>; }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'lib/utils.ts', bytes: Buffer.from("export const u = 'x';\n")},
        ],
        {aliases: {'#utils': 'lib/utils.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged-hash.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(fs.existsSync(path.join(cwd, 'forged-hash-restored'))).toBe(false);
    // A record entry that names no carried file counts for nothing.
    put(
      'alias-away/forged.html',
      `<!doctype html><html><body><p class="astryx-text">x</p>${sourceBlockOf(
        'page.tsx',
        [
          {path: 'page.tsx', bytes: Buffer.from("import {X} from '@/x';\nexport default function Page() { return <X />; }\nimport '@astryxdesign/core/astryx.css';\n")},
          {path: 'other.ts', bytes: Buffer.from('export const other = 1;\n')},
        ],
        {aliases: {'@/x': 'missing.ts'}},
      )}</body></html>`,
    );
    expect(await codeOf(() => render('forged.html', {cwd, reverse: true}))).toBe('ERR_RENDER_SOURCE_DAMAGED');
  }, 60_000);

  it('never writes through a symbolic link or over a protected file, even with --overwrite', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from("import './styles.css';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")};
    const css = {path: 'styles.css', bytes: Buffer.from('.a{}\n')};
    put('prot/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, css])}</body>`);
    const cwd = path.join(dir, 'prot');
    // A symbolic link inside the folder, onto a file the refusal never named.
    put('prot/real.css', 'original\n');
    fs.mkdirSync(path.join(cwd, 'out'), {recursive: true});
    fs.symlinkSync(path.join(cwd, 'real.css'), path.join(cwd, 'out/styles.css'));
    expect(await codeOf(() => render('page.html', {cwd, reverse: true, out: 'out/page.tsx', overwrite: true}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    expect(fs.readFileSync(path.join(cwd, 'real.css'), 'utf8')).toBe('original\n');
    // A generated file and an ignored file are never replaced.
    put('prot/alone.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    put('prot/gen/page.tsx', '// @generated\nexport default () => null;\nimport "@astryxdesign/core/astryx.css";\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'gen/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'gen/page.tsx'), 'utf8')).toContain('@generated');
    put('prot/.gitignore', 'ignored/\n');
    put('prot/ignored/page.tsx', 'mine\n');
    expect(await codeOf(() => render('alone.html', {cwd, reverse: true, out: 'ignored/page.tsx', overwrite: true}))).toBe(
      'ERR_FILE_EXISTS',
    );
    expect(fs.readFileSync(path.join(cwd, 'ignored/page.tsx'), 'utf8')).toBe('mine\n');
  });

  it('refuses a configuration file a received page imports from above it', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of ['babel.config.json', 'jest.config.json', 'project.json']) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import c from '../../${name}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('cfg-above.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(await codeOf(() => render('cfg-above.html', {cwd: dir, reverse: true, out: 'cfg-above/src/app/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
      expect(fs.existsSync(path.join(dir, 'cfg-above', name))).toBe(false);
    }
  });

  it('restores a short alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('short-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@/t';\nexport default () => t;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('short-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 't.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'short-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/t.ts']);
  });

  it('writes a page rebuilt from markup into a new folder by default', async () => {
    put('rebuilt-default/middleware.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    const cwd = path.join(dir, 'rebuilt-default');
    const back = /** @type {any} */ (await render('middleware.html', {cwd, reverse: true}));
    expect(back.data.mode).toBe('rebuilt');
    expect(back.data.output).toBe('middleware-restored/page.tsx');
    expect(fs.existsSync(path.join(cwd, 'middleware.tsx'))).toBe(false);
  });

  it('inlines a stylesheet\'s own url()s from the stylesheet\'s folder', async () => {
    put('sheet-url/styles/bg.png', PNG);
    put('sheet-url/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('sheet-url/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\">Hi</div>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('sheet-url/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(fs.readFileSync(path.join(dir, 'sheet-url/page.html'), 'utf8')).toContain('url("data:image/png;base64,');
  }, 60_000);

  it('carries images the page names by path, in markup and in a stylesheet, and gives them back', async () => {
    put('by-path/logo.png', PNG);
    put('by-path/styles/bg.png', PNG);
    put('by-path/styles/page.css', '.hero { background: url("./bg.png"); }\n');
    put('by-path/page.tsx', "import './styles/page.css';\nexport default function Page() { return <div className=\"hero\"><img src=\"./logo.png\" alt=\"\" /></div>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('by-path/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'styles/page.css', 'logo.png', 'styles/bg.png']));
    const back = /** @type {any} */ (await render('by-path/page.html', {cwd: dir, reverse: true, out: 'by-path-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(
      expect.arrayContaining(['by-path-back/page.tsx', 'by-path-back/logo.png', 'by-path-back/styles/bg.png']),
    );
    const again = /** @type {any} */ (await render('by-path-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it('reads, counts and warns about only the font faces the page draws text with', async () => {
    const woff2 = (/** @type {string} */ tag) => Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(60, tag)]);
    put('font-cut/fonts/used-latin.woff2', woff2('a'));
    put('font-cut/fonts/used-greek.woff2', woff2('b'));
    put('font-cut/fonts/used-cyrillic.woff2', woff2('c'));
    put('font-cut/fonts/used-armenian.woff2', woff2('d'));
    put(
      'font-cut/fonts.css',
      [
        "@font-face { font-family: 'Used'; src: url(./fonts/used-latin.woff2) format('woff2'); unicode-range: U+0000-00FF; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-greek.woff2) format('woff2'); unicode-range: U+0370-03FF; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-cyrillic.woff2) format('woff2'); unicode-range: U+0400-045F; }",
        "@font-face { font-family: 'Used'; src: url(./fonts/used-armenian.woff2) format('woff2'); unicode-range: U+0530-058F; }",
        "@font-face { font-family: 'Never'; src: url(./fonts/gone.woff2) format('woff2'); }",
        "@font-face { font-family: 'Remote'; src: url(https://fonts.example.com/remote.woff2) format('woff2'); }",
        '.t { font-family: Used, sans-serif; }',
      ].join('\n'),
    );
    put(
      'font-cut/page.tsx',
      "import './fonts.css';\nimport {useState} from 'react';\nexport default function Page() {\n  const [later, setLater] = useState(false);\n  return <p className=\"t\" onClick={() => setLater(true)}>{later ? 'Привет' : 'Hello'}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const r = /** @type {any} */ (await render('font-cut/page.tsx', {cwd: dir}));
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).not.toContain('missing-asset');
    expect(codes).not.toContain('remote-asset');
    // Latin draws the first paint and Cyrillic only after the click; React
    // DOM's own script holds Greek letters, so the Greek face stays too.
    expect(r.data.images).toBe(3);
    const html = fs.readFileSync(path.join(dir, 'font-cut/page.html'), 'utf8');
    expect(html.match(/@font-face/g)).toHaveLength(3);
    const back = /** @type {any} */ (await render('font-cut/page.html', {cwd: dir, reverse: true, out: 'font-cut-back/page.tsx'}));
    expect(back.data.files).toEqual(
      expect.arrayContaining([
        'font-cut-back/fonts.css',
        'font-cut-back/fonts/used-latin.woff2',
        'font-cut-back/fonts/used-greek.woff2',
        'font-cut-back/fonts/used-cyrillic.woff2',
      ]),
    );
  }, 60_000);

  it('reads a root-relative image from the public/ folder of a site that shares its project', async () => {
    put('shared-site/public/pics/shoe.png', PNG);
    put('shared-site/src/page.tsx', 'export default function Page() { return <img src="/pics/shoe.png" alt="Shoe" />; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('shared-site/src/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(r.data.files).toEqual(['src/page.tsx', 'public/pics/shoe.png']);
    expect(fs.readFileSync(path.join(dir, 'shared-site/src/page.html'), 'utf8')).toMatch(/<img src="data:image\/png;base64,[^"]*" alt="Shoe"/);
  }, 60_000);

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'leaves out a named image it cannot read, and says so, instead of ending the render',
    async () => {
      put('locked-name/locked.png', PNG);
      put('locked-name/names.ts', "export const locked = './locked.png';\n");
      put('locked-name/page.tsx', "import {locked} from './names';\nexport default function Page() {\n  return <p>{locked.length}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
      fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o000);
      try {
        const result = /** @type {any} */ (await render('locked-name/page.tsx', {cwd: dir}));
        expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
        expect(result.data.warnings).toContainEqual({
          code: 'not-embedded',
          message: 'locked.png is named in names.ts but not carried in the file: it cannot be read (EACCES), so experimental import cannot give it back.',
        });
      } finally {
        fs.chmodSync(path.join(dir, 'locked-name/locked.png'), 0o644);
      }
    },
    60_000,
  );

  it('renders a page whose module names a path the system cannot look up', async () => {
    put('long-name/names.ts', `export const far = './${'a'.repeat(300)}.png';\n`);
    put('long-name/page.tsx', "import {far} from './names';\nexport default function Page() {\n  return <p>{far.length}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('long-name/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'names.ts']);
  }, 60_000);

  it('leaves out a named image outside the folder that holds the carried files, so the layout stays', async () => {
    // A page under a tests/ folder: were the layout to move above it, its
    // module would land under tests/, which a render never carries.
    put('shared/far.png', PNG);
    put('up/tests/icons.ts', "export const icons = {far: '../../shared/far.png'};\n");
    put('up/tests/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('up/tests/page.tsx', {cwd: dir}));
    expect(result.data.files).toEqual(['page.tsx', 'icons.ts']);
    const back = /** @type {any} */ (await render('up/tests/page.html', {cwd: dir, reverse: true, out: 'up-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, files: ['up-back/page.tsx', 'up-back/icons.ts']});
  }, 60_000);

  it('leaves out a named image larger than a render carries, and says so', async () => {
    put('named-big/huge.png', Buffer.concat([PNG, Buffer.alloc(9 * 1024 * 1024)]));
    put('named-big/icons.ts', "export const icons = {big: './huge.png'};\n");
    put('named-big/page.tsx', "import {icons} from './icons';\nexport default function Page() {\n  return <p>{Object.keys(icons).join(', ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const result = /** @type {any} */ (await render('named-big/page.tsx', {cwd: dir}));
    expect(result.data.files).not.toContain('huge.png');
    expect(result.data.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'not-embedded', message: expect.stringContaining('huge.png is named in icons.ts but not carried in the file: it is larger than 8 MB')}),
      ]),
    );
  }, 60_000);

  it('carries an image a module or a stylesheet names that the page did not show, and gives every file back', async () => {
    put('named/img/shown.png', PNG);
    put('named/img/other.png', PNG);
    put('named/img/unused-bg.png', PNG);
    put('named/icons.ts', "export const icons = {shown: './img/shown.png', other: './img/other.png'};\n");
    put('named/styles.css', '.used { color: red; }\n.unused { background: url("./img/unused-bg.png"); }\n');
    put('named/page.tsx', "import './styles.css';\nimport {icons} from './icons';\nexport default function Page() { return <img className=\"used\" src={icons.shown} alt=\"\" />; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('named/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['img/shown.png', 'img/other.png', 'img/unused-bg.png']));
    const back = /** @type {any} */ (await render('named/page.html', {cwd: dir, reverse: true, out: 'named-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true});
    expect(back.data.missing).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'named-back/img/other.png'))).toEqual(PNG);
  }, 60_000);

  it('gives back images named any way the render carried them', async () => {
    put('spell/logo.png', PNG);
    put('spell/images/bg.png', PNG);
    put('spell/pic.png', PNG);
    put('spell/tpl.png', PNG);
    put('spell/card.png', PNG);
    put('spell/styles.css', '.hero { background: url(images/bg.png); }\n');
    put('spell/data.json', '{"img": "pic.png"}\n');
    put('spell/components/Card.tsx', 'export function Card() { return <img src="card.png" alt="" />; }\n');
    put(
      'spell/page.tsx',
      [
        "import './styles.css';",
        "import data from './data.json';",
        "import {Card} from './components/Card';",
        "const name = 'tpl';",
        'export default function Page() {',
        '  return <div className="hero"><img src="logo.png" alt="" /><img src={data.img} alt="" /><img src={`./${name}.png`} alt="" /><Card /></div>;',
        '}',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('spell/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']));
    const back = /** @type {any} */ (await render('spell/page.html', {cwd: dir, reverse: true, out: 'spell-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    for (const f of ['logo.png', 'images/bg.png', 'pic.png', 'tpl.png', 'card.png']) {
      expect(fs.existsSync(path.join(dir, 'spell-back', f))).toBe(true);
    }
    const again = /** @type {any} */ (await render('spell-back/page.tsx', {cwd: dir}));
    expect(again.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 60_000);

  it('round-trips an image or font whose bytes and extension disagree', async () => {
    put('mismatch/photo.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]));
    put('mismatch/fonts/face.otf', Buffer.from([0, 1, 0, 0, 0, 10, 0, 128, 0, 3]));
    put('mismatch/styles.css', "@font-face { font-family: Face; src: url(fonts/face.otf); }\n.t { font-family: Face; }\n");
    put('mismatch/page.tsx', "import './styles.css';\nexport default function Page() { return <p className=\"t\"><img src=\"photo.png\" alt=\"\" />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('mismatch/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['photo.png', 'fonts/face.otf']));
    const back = /** @type {any} */ (await render('mismatch/page.html', {cwd: dir, reverse: true, out: 'mismatch-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['mismatch-back/photo.png', 'mismatch-back/fonts/face.otf']));
  }, 60_000);

  it('leaves out a path-named "image" whose bytes are not one, and says so', async () => {
    put('notimg/fake.png', 'console.log(1)\n');
    put('notimg/page.tsx', 'export default function Page() { return <img src="fake.png" alt="" />; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('notimg/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['page.tsx']);
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
  }, 60_000);

  it('inlines style-attribute images in every url() form and keeps the element whole', async () => {
    put('styleattr/a.png', PNG);
    put('styleattr/b.png', PNG);
    put(
      'styleattr/page.tsx',
      [
        'export default function Page() {',
        '  return (',
        '    <div>',
        `      <div id="q" style={{backgroundImage: 'url("./a.png")'}}>Q</div>`,
        `      <div id="u" style={{backgroundImage: 'url(b.png)'}}>U</div>`,
        `      <div id="r" style={{backgroundImage: "url('https://example.com/x.png')"}}>R</div>`,
        '    </div>',
        '  );',
        '}',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('styleattr/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'styleattr/page.html'), 'utf8');
    const {parseHtml} = await import('../../foundation/render/html-reader.mjs');
    /** @param {any} n @param {string} id @returns {any} */
    const byId = (n, id) => {
      if (n.attrs?.id === id) return n;
      for (const c of n.children ?? []) {
        const f = byId(c, id);
        if (f) return f;
      }
      return null;
    };
    const doc = parseHtml(html);
    expect(byId(doc, 'q').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'u').attrs.style).toContain('url("data:image/png;base64,');
    expect(byId(doc, 'q').children[0].text).toBe('Q');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    expect(r.data.files).toEqual(expect.arrayContaining(['a.png', 'b.png']));
    // The check names what the written file loads; it never stops the write.
    expect(r.data.checks.outside).toEqual(['https://example.com/x.png']);
    expect(r.data.checks.roundTrip).toEqual({exact: true, files: 3, differs: []});
    // The size parts add up to no more than the file.
    const {bytes, scriptBytes, cssBytes, markupBytes, sourceBytes} = r.data;
    expect(Math.min(scriptBytes, cssBytes, markupBytes, sourceBytes)).toBeGreaterThan(0);
    expect(scriptBytes + cssBytes + markupBytes + sourceBytes).toBeLessThanOrEqual(bytes);
    const cli = await runCli(['experimental', 'export', 'styleattr/page.tsx', '--out', 'styleattr/again.html'], {cwd: dir});
    expect(cli.status).toBe(0);
    expect(fs.existsSync(path.join(dir, 'styleattr/again.html'))).toBe(true);
    expect(cli.stdout).toMatch(/outside:\s+https:\/\/example\.com\/x\.png/);
    expect(cli.stdout).toContain('loads 1 reference from outside the file when it opens (outside, above), so it does not stand alone.');
    expect(cli.stdout).not.toContain('Share this one file');
    // A file beside the page the render leaves for the browser is from outside
    // the file too, not from the network; a reference that loads nothing is
    // not counted.
    put('relref/page.tsx', 'export default function Page() { return (<main><link rel="icon" href="./bg.png" /><iframe src="about:blank" title="x" /><h1>R</h1></main>); }\nimport "@astryxdesign/core/astryx.css";\n');
    const rel = await runCli(['experimental', 'export', 'relref/page.tsx'], {cwd: dir});
    expect(rel.status).toBe(0);
    expect(rel.stdout).toMatch(/^outside:\s+\.\/bg\.png$/m);
    expect(rel.stdout).toContain('loads 1 reference from outside the file when it opens (outside, above), so it does not stand alone.');
    expect(rel.stdout).not.toContain('about:blank');
  }, 60_000);

  it('warns that an SVG use of a file beside the page loads from outside the file, even when the source carries that file', async () => {
    put('beside/icons.svg', '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="check" viewBox="0 0 1 1"><path d="M0 0h1v1z"/></symbol></svg>');
    put('beside/page.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Icons</h1><svg><use href="./icons.svg#check" /></svg></main>; }\n');
    const r = /** @type {any} */ (await render('beside/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.message)).toContain(
      'The page renders a <use> that loads ./icons.svg#check, which a sandboxed page cannot reach and which loads from outside the file; remove it from the page.',
    );
    expect(r.data.checks.outside).toEqual(['./icons.svg#check']);
  }, 60_000);

  it('notes the script on the bytes line only when the script is more than half the file', async () => {
    const NOTE = ' (most is the script: the page as a live app, with React and the packages it imports)';
    put('note/small.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Small</h1></main>; }\n');
    // An inlined image of about 2 MB makes the script less than half the file.
    put('note/big.png', Buffer.concat([PNG, Buffer.alloc(1_500_000, 7)]));
    put('note/big.tsx', "import '@astryxdesign/core/astryx.css';\n" + 'export default function Page() { return <main><h1>Big</h1><img src="./big.png" alt="" /></main>; }\n');
    for (const [page, noted] of /** @type {const} */ ([['note/small.tsx', true], ['note/big.tsx', false]])) {
      const cli = await runCli(['experimental', 'export', page], {cwd: dir});
      expect(cli.status, page).toBe(0);
      const line = cli.stdout.split('\n').find(l => l.startsWith('bytes:')) ?? '';
      expect(line.endsWith(NOTE), page).toBe(noted);
    }
  }, 120_000);

  it('carries a srcset of local images as data: URIs, and the file still stands alone', async () => {
    put('srcset/dot.png', PNG);
    put('srcset/dot2.png', PNG);
    put('srcset/page.tsx', 'export default function Page() { return (<main><h1>S</h1><img src="./dot.png" srcSet="./dot.png 1x, ./dot2.png 2x" alt="" /></main>); }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('srcset/page.tsx', {cwd: dir}));
    expect(fs.readFileSync(path.join(dir, 'srcset/page.html'), 'utf8')).toMatch(/srcset="data:image\/png;base64,[^"]+ 1x, data:image\/png;base64,[^"]+ 2x"/i);
    expect(r.data.checks.outside).toEqual([]);
  }, 60_000);

  it('names the element a style attribute sits on, caps the outside list in text, and prints an absolute output once', async () => {
    const imgs = Array.from({length: 12}, (_, i) => `<img src="https://img.example/${i}.png" alt="" />`).join('');
    put(
      'many/page.tsx',
      `export default function Page() { return (<main><div style={{backgroundImage: 'image-set("https://img.example/set.png" 1x)'}}>S</div>${imgs}</main>); }\nimport '@astryxdesign/core/astryx.css';\n`,
    );
    const r = /** @type {any} */ (await render('many/page.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.message)).toContain(
      'The page renders a <div> that loads https://img.example/set.png, which a sandboxed page cannot reach and which loads from outside the file; remove it from the page.',
    );
    expect(r.data.checks.outside).toHaveLength(13);
    // An --out outside the current folder is shown as its absolute path, once.
    const abs = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-abs-')), 'abs.html');
    const cli = await runCli(['experimental', 'export', 'many/page.tsx', '--out', abs], {cwd: dir});
    expect(cli.status).toBe(0);
    expect(cli.stdout).toMatch(/^outside:\s+.+, \.\.\. and 3 more( in \S+)?$/m);
    const line = cli.stdout.split('\n').find(l => l.startsWith(`${abs} (`));
    expect(line).toBeDefined();
    expect(line?.split(abs).length).toBe(2);
  }, 60_000);

  it('carries a stylesheet pulled in by @import and gives it back, and says when one is missing', async () => {
    put('imp/styles/main.css', "@import './parts/base.css';\n@import url('https://example.com/f.css');\n.m { color: red; }\n");
    put('imp/styles/parts/base.css', '.b { color: blue; background: url(./dot.png); }\n');
    put('imp/styles/parts/dot.png', PNG);
    put('imp/page.tsx', "import './styles/main.css';\nexport default function Page() { return <p className=\"m b\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('imp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['styles/main.css', 'styles/parts/base.css', 'styles/parts/dot.png']));
    const html = fs.readFileSync(path.join(dir, 'imp/page.html'), 'utf8');
    expect(html).toContain('color: blue');
    expect(html).not.toContain('@import');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('remote-asset');
    const back = /** @type {any} */ (await render('imp/page.html', {cwd: dir, reverse: true, out: 'imp-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(back.data.files).toEqual(expect.arrayContaining(['imp-back/styles/parts/base.css']));
    // A file whose @import target it does not carry says so.
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('imp-missing.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from("import './a.css';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'a.css', bytes: Buffer.from("@import './gone.css';\n")}])}</body>`);
    const partial = /** @type {any} */ (await render('imp-missing.html', {cwd: dir, reverse: true, out: 'imp-missing/page.tsx'}));
    expect(partial.data.exact).toBe(false);
    expect(partial.data.missing).toEqual(['gone.css']);
  }, 60_000);

  it('handles every kind of stylesheet import', async () => {
    // A font stylesheet that imports a remote one.
    put('kinds/fonts.css', "@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&display=swap');\n");
    put('kinds/legacy.css', '.legacy-btn { padding: 3px; }\n');
    put('kinds/main.css', "@import './fonts.css';\n@import './legacy.css' layer(reset);\n@import './print.css' print;\n@import '@astryxdesign/core/astryx.css';\n.k { color: red; }\n");
    put('kinds/print.css', '.p { color: black; }\n');
    put('kinds/page.tsx', "import './main.css';\nexport default function Page() { return <p className=\"k legacy-btn p\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('kinds/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'kinds/page.html'), 'utf8');
    expect(html).toMatch(/@layer reset\s*\{[^}]*\.legacy-btn/);
    expect(html).toMatch(/@media print\s*\{[^}]*\.p/);
    expect(html).not.toContain('@import');
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('remote-asset');
    expect(r.data.warnings.some((/** @type {any} */ w) => w.message.includes('astryx.css'))).toBe(false);
    expect(r.data.files).not.toContain(expect.stringContaining('node_modules'));
    // The package import is neither carried nor missing when given back.
    const back = /** @type {any} */ (await render('kinds/page.html', {cwd: dir, reverse: true, out: 'kinds-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // Sass is named, CSS Modules refused with a clear message.
    put('kinds/sass.tsx', "import './x.scss';\nexport default function Page() { return <p>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const sass = /** @type {any} */ (await render('kinds/sass.tsx', {cwd: dir}));
    expect(sass.data.warnings.some((/** @type {any} */ w) => w.message.includes('x.scss'))).toBe(true);
    put('kinds/x.module.css', '.a { color: red; }\n');
    put('kinds/mod.tsx', "import styles from './x.module.css';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('kinds/mod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('CSS Modules');
  }, 90_000);

  it('refuses any stylesheet imported as a value, inlines Core once, ignores commented imports, and names a broken stylesheet', async () => {
    put('more/x.module.scss', '.a { color: red; }\n');
    put('more/scssmod.tsx', "import styles from './x.module.scss';\nexport default function Page() { return <p className={styles.a}>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('more/scssmod.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain('x.module.scss');
    // A globals.css that imports Core: Core's rules once, listed once.
    put('more/plain.tsx', "export default function Page() { return <p className=\"astryx-text\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    put('more/globals.css', "@import '@astryxdesign/core/astryx.css';\n");
    put('more/withcore.tsx', "import './globals.css';\nexport default function Page() { return <p className=\"astryx-text\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const plain = /** @type {any} */ (await render('more/plain.tsx', {cwd: dir}));
    const withCore = /** @type {any} */ (await render('more/withcore.tsx', {cwd: dir}));
    // Within a few bytes (the emptied import line), not a second copy of Core.
    expect(Math.abs(withCore.data.cssBytes - plain.data.cssBytes)).toBeLessThan(16);
    expect(withCore.data.stylesheets.filter((/** @type {string} */ x) => x.endsWith('astryx.css'))).toHaveLength(1);
    // A commented-out import does not make a full restore partial.
    put('more/commented.css', "/* @import './gone.css'; */\n.c { color: red; }\n");
    put('more/commented.tsx', "import './commented.css';\nexport default function Page() { return <p className=\"c\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('more/commented.tsx', {cwd: dir});
    const back = /** @type {any} */ (await render('more/commented.html', {cwd: dir, reverse: true, out: 'more-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
    // A stylesheet that is not CSS: a documented code, naming the file.
    put('more/broken.css', '.b { color: red;\n');
    put('more/broken.tsx', "import './broken.css';\nexport default function Page() { return <p className=\"b\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let broken;
    try {
      await render('more/broken.tsx', {cwd: dir});
    } catch (e) {
      broken = e;
    }
    expect(broken?.code).toBe('ERR_RENDER_COMPILE');
    expect(broken.message).toContain('broken.css');
  }, 90_000);

  it('resolves aliased stylesheets and images, inlines a shared sheet once in first-import order, and names a broken @import', async () => {
    put('al/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@/*": ["./src/*"]}}}\n');
    put('al/package.json', '{"name":"al","private":true}');
    put('al/src/styles/site.css', '.site { color: red; }\n');
    put('al/src/assets/logo.png', PNG);
    put('al/src/page.tsx', "import '@/styles/site.css';\nimport logo from '@/assets/logo.png';\nexport default function Page() { return <p className=\"site\"><img src={logo} alt=\"\" />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('al/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'al/src/page.html'), 'utf8');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    // One sheet shared by two modules, a third sheet between them.
    put('order/shared.css', '.o { color: red; }\n');
    put('order/middle.css', '.o { color: blue; }\n');
    put('order/A.tsx', "import './shared.css';\nexport const A = () => null;\n");
    put('order/B.tsx', "import './middle.css';\nimport './shared.css';\nexport const B = () => null;\n");
    put('order/page.tsx', "import {A} from './A';\nimport {B} from './B';\nexport default function Page() { return <p className=\"o\"><A /><B />Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('order/page.tsx', {cwd: dir});
    const orderHtml = fs.readFileSync(path.join(dir, 'order/page.html'), 'utf8');
    expect(orderHtml.match(/color: red/g)).toHaveLength(1);
    expect(orderHtml.indexOf('color: red')).toBeLessThan(orderHtml.indexOf('color: blue'));
    // A broken @import target: the same documented code, naming both files.
    put('bad-imp/inner.css', '.x { color: red;\n');
    put('bad-imp/outer.css', "@import './inner.css';\n.y { color: blue; }\n");
    put('bad-imp/page.tsx', "import './outer.css';\nexport default function Page() { return <p className=\"x y\">Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('bad-imp/page.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toContain('inner.css');
    expect(error.message).toContain('outer.css');
    // A stylesheet import naming a missing file, directly or through an alias.
    for (const spec of ['./gone.css', '@/styles/gone.css']) {
      put('al/src/missing.tsx', `import '${spec}';\nexport default function Page() { return <p>Hi</p>; }\nimport '@astryxdesign/core/astryx.css';\n`);
      /** @type {any} */
      let missing;
      try {
        await render('al/src/missing.tsx', {cwd: dir});
      } catch (e) {
        missing = e;
      }
      expect(missing?.code).toBe('ERR_FILE_NOT_FOUND');
      expect(missing.message).toContain('gone.css');
    }
  }, 90_000);

  it('resolves tsconfig paths by TypeScript rules: exact keys, a star anywhere, targets in order', async () => {
    put(
      'tsp/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@lib': ['./libsrc/index.ts'],
            '@lib/*': ['./libsrc/*'],
            '~*': ['./missing/*', './other/*'],
            'theme-*-x': ['./themes/*.ts'],
          },
        },
      }),
    );
    put('tsp/package.json', '{"name":"tsp","private":true}');
    put('tsp/libsrc/index.ts', "export const Lib = 'lib-index';\n");
    put('tsp/libsrc/button.tsx', "export const Button = () => <b>lib-button</b>;\n");
    put('tsp/other/util.ts', "export const util = 'second-target';\n");
    put('tsp/themes/blue.ts', "export const theme = 'mid-star';\n");
    put(
      'tsp/page.tsx',
      [
        "import {Lib} from '@lib';",
        "import {Button} from '@lib/button';",
        "import {util} from '~util';",
        "import {theme} from 'theme-blue-x';",
        'export default function Page() { return <p>{Lib} {util} {theme} <Button /></p>; }',
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n'),
    );
    await render('tsp/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsp/page.html'), 'utf8');
    for (const text of ['lib-index', 'lib-button', 'second-target', 'mid-star']) expect(html).toContain(text);
  }, 60_000);

  it('loads a JSON file through any key shape, from the first target that has it, and gives it back', async () => {
    put('jsonp/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'~*': ['./lib/data/*'], 'cfg-*': ['./lib/missing/*', './lib/more/*']}}}));
    put('jsonp/package.json', '{"name":"jsonp","private":true}');
    put('jsonp/lib/data/cfg.json', '{"label":"first-target-json"}\n');
    put('jsonp/lib/more/extra.json', '{"label":"later-target-json"}\n');
    put(
      'jsonp/page.tsx',
      "import cfg from '~cfg.json';\nimport extra from 'cfg-extra.json';\nexport default function Page() { return <p>{cfg.label} {extra.label}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const r = /** @type {any} */ (await render('jsonp/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(expect.arrayContaining(['page.tsx', 'lib/data/cfg.json', 'lib/more/extra.json']));
    const html = fs.readFileSync(path.join(dir, 'jsonp/page.html'), 'utf8');
    expect(html).toContain('first-target-json');
    expect(html).toContain('later-target-json');
    // Back into a project with the same paths: each file goes where its alias points.
    fs.mkdirSync(path.join(dir, 'jsonp-to'), {recursive: true});
    put('jsonp-to/tsconfig.json', fs.readFileSync(path.join(dir, 'jsonp/tsconfig.json'), 'utf8'));
    put('jsonp-to/package.json', '{"name":"jsonp-to","private":true}');
    fs.copyFileSync(path.join(dir, 'jsonp/page.html'), path.join(dir, 'jsonp-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'jsonp-to'), reverse: true, out: 'lib/app/page.tsx'}));
    // The file sent from the later target goes back under that target.
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/data/cfg.json', 'lib/more/extra.json']));
  }, 60_000);

  it.each([
    ['folder names that end alike', ['./lib/app/*', './lib/webapp/*'], 'lib/webapp/Top.tsx', 'lib/webapp/Top.tsx'],
    ['targets that share their last folder', ['./lib/ui/src/*', './lib/icons/src/*'], 'lib/icons/src/Top.tsx', 'lib/icons/src/Top.tsx'],
    // Every embedded path is relative to the folder that holds them all, so
    // a page inside the later target names no target folder: the first wins.
    ['a page inside the later target', ['./lib/missing/*', './lib/src/*'], 'lib/src/Top.tsx', 'lib/missing/Top.tsx', 'lib/src/pages/page.tsx'],
  ])('gives back an aliased module by whole folder names: %s', async (name, targets, sentFrom, comesBack, pageAt = 'page.tsx') => {
    const base = `segments-${String(name).replace(/\W+/g, '-')}`;
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': targets}}};
    put(`${base}/tsconfig.json`, JSON.stringify(paths));
    put(`${base}/package.json`, '{"name":"segments","private":true}');
    put(`${base}/${sentFrom}`, "export const Top = () => <i>segment-top</i>;\n");
    put(`${base}/${pageAt}`, "import {Top} from '@/Top';\nexport default function Page() { return <p><Top /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render(`${base}/${pageAt}`, {cwd: dir});
    const html = `${base}/${pageAt.replace(/\.tsx$/, '.html')}`;
    fs.mkdirSync(path.join(dir, `${base}-to`), {recursive: true});
    put(`${base}-to/tsconfig.json`, JSON.stringify(paths));
    put(`${base}-to/package.json`, '{"name":"segments-to","private":true}');
    fs.copyFileSync(path.join(dir, html), path.join(dir, `${base}-to/page.html`));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, `${base}-to`), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain(comesBack);
  }, 60_000);

  it('gives back a folder an exact key names under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@cfg': ['./lib/a/settings', './lib/b/settings']}}};
    put('exactdir/tsconfig.json', JSON.stringify(paths));
    put('exactdir/package.json', '{"name":"exactdir","private":true}');
    put('exactdir/lib/b/settings/index.ts', "export const setting = 'from-b';\n");
    put('exactdir/page.tsx', "import {setting} from '@cfg';\nexport default function Page() { return <p>{setting}</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('exactdir/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'exactdir/page.html'), 'utf8')).toContain('from-b');
    fs.mkdirSync(path.join(dir, 'exactdir-to'), {recursive: true});
    put('exactdir-to/tsconfig.json', JSON.stringify(paths));
    put('exactdir-to/package.json', '{"name":"exactdir-to","private":true}');
    fs.copyFileSync(path.join(dir, 'exactdir/page.html'), path.join(dir, 'exactdir-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exactdir-to'), reverse: true, out: 'lib/zz/page.tsx'}));
    expect(back.data.files).toContain('lib/b/settings/index.ts');
    expect(back.data.files).not.toContain('lib/a/settings/index.ts');
  }, 60_000);

  it('resolves path aliases in modules outside the project folder, through every key and target', async () => {
    put(
      'sib/app/tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: {
            '@scope/ui': ['../ui/src/index.tsx'],
            '@scope/tokens': ['../tokens/src/index.ts'],
            '@lib/*': ['../missing/*', '../lib/*'],
          },
        },
      }),
    );
    put('sib/app/package.json', '{"name":"sib-app","private":true}');
    put('sib/tokens/src/index.ts', "export const accent = 'token-accent';\n");
    put('sib/lib/util.ts', "export const util = 'later-target-util';\n");
    put(
      'sib/ui/src/index.tsx',
      "import {accent} from '@scope/tokens';\nimport {util} from '@lib/util';\nexport const Badge = () => <b>{accent} {util}</b>;\n",
    );
    put('sib/app/page.tsx', "import {Badge} from '@scope/ui';\nexport default function Page() { return <p><Badge /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'sib/app/page.html'), 'utf8');
    expect(html).toContain('token-accent');
    expect(html).toContain('later-target-util');
  }, 60_000);

  it('gives the page and a sibling package one copy of a package the aliases place, even when a built copy is linked', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens': ['../tokens/src/index.ts']}}};
    put('mono/app/tsconfig.json', JSON.stringify(paths));
    put('mono/app/package.json', '{"name":"mono-app","private":true}');
    put('mono/tokens/package.json', '{"name":"@scope/tokens","main":"dist/index.js"}');
    put('mono/tokens/src/index.ts', "import {createContext} from 'react';\nexport const Theme = createContext('default-theme');\n");
    put('mono/tokens/dist/index.js', "const {createContext} = require('react');\nexports.Theme = createContext('built-copy');\n");
    // The built package, linked into the sibling's node_modules as a workspace would.
    fs.mkdirSync(path.join(dir, 'mono/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'mono/tokens'), path.join(dir, 'mono/ui/node_modules/@scope/tokens'), 'dir');
    put('mono/ui/src/index.tsx', "import {useContext} from 'react';\nimport {Theme} from '@scope/tokens';\nexport const Badge = () => <b>{useContext(Theme)}</b>;\n");
    put(
      'mono/app/page.tsx',
      "import {Theme} from '@scope/tokens';\nimport {Badge} from '@scope/ui';\nexport default function Page() { return <Theme.Provider value=\"page-theme\"><Badge /></Theme.Provider>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('mono/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'mono/app/page.html'), 'utf8');
    expect(html).toContain('page-theme');
  }, 60_000);

  it('places an aliased subpath that a linked package does not export', async () => {
    put('expo/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/ui': ['../ui/src/index.tsx'], '@scope/tokens/*': ['../tokens/src/*']}}}));
    put('expo/app/package.json', '{"name":"expo-app","private":true}');
    put('expo/tokens/package.json', '{"name":"@scope/tokens","exports":{".":"./dist/index.js"}}');
    put('expo/tokens/dist/index.js', "exports.red = 'built-red';\n");
    put('expo/tokens/src/colors.ts', "export const red = 'source-red';\n");
    fs.mkdirSync(path.join(dir, 'expo/ui/node_modules/@scope'), {recursive: true});
    fs.symlinkSync(path.join(dir, 'expo/tokens'), path.join(dir, 'expo/ui/node_modules/@scope/tokens'), 'dir');
    put('expo/ui/src/index.tsx', "import {red} from '@scope/tokens/colors';\nexport const Swatch = () => <i>{red}</i>;\n");
    put('expo/app/page.tsx', "import {Swatch} from '@scope/ui';\nexport default function Page() { return <p><Swatch /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('expo/app/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'expo/app/page.html'), 'utf8')).toContain('source-red');
  }, 60_000);

  it('compiles a sibling module with the TypeScript it can hold: type assertions and decorators', async () => {
    put('tsx-sib/app/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', experimentalDecorators: true, paths: {'@scope/store': ['../store/src/index.ts']}}}));
    put('tsx-sib/app/package.json', '{"name":"tsx-sib-app","private":true}');
    put(
      'tsx-sib/store/src/index.ts',
      "const raw: unknown = 'asserted-label';\nexport const label = <string>raw;\nfunction tag(target: any) { target.tagged = 'decorated-store'; }\n@tag\nexport class Store { static tagged: string; }\n",
    );
    put('tsx-sib/store/src/other.ts', "const raw: unknown = 'relative-label';\nexport const other = <string>raw;\n");
    put(
      'tsx-sib/app/page.tsx',
      "import {label, Store} from '@scope/store';\nimport {other} from '../store/src/other';\nexport default function Page() { return <p>{label} {(Store as any).tagged} {other}</p>; }\nimport '@astryxdesign/core/astryx.css';\n",
    );
    await render('tsx-sib/app/page.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'tsx-sib/app/page.html'), 'utf8');
    expect(html).toContain('asserted-label');
    expect(html).toContain('decorated-store');
    expect(html).toContain('relative-label');
  }, 60_000);

  it('loads an installed package a prefix key names when the key places no file', async () => {
    put('pkgpre/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@scope/*': ['./src/*']}}}));
    put('pkgpre/package.json', '{"name":"pkgpre","private":true}');
    put('pkgpre/node_modules/@scope/realpkg/package.json', '{"name":"@scope/realpkg","main":"index.js"}');
    put('pkgpre/node_modules/@scope/realpkg/index.js', "exports.real = 'installed-package';\n");
    put('pkgpre/src/local.ts', "export {real} from '@scope/realpkg';\n");
    put('pkgpre/page.tsx', "import {real} from '@scope/realpkg';\nimport {real as again} from './src/local';\nexport default function Page() { return <p>{real} {again}</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('pkgpre/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'pkgpre/page.html'), 'utf8')).toContain('installed-package installed-package');
  }, 60_000);

  it('gives back a nested aliased module under the target it was sent from', async () => {
    const paths = {compilerOptions: {baseUrl: '.', paths: {'@/*': ['./lib/missing/*', './lib/src/*']}}};
    put('nested/tsconfig.json', JSON.stringify(paths));
    put('nested/package.json', '{"name":"nested","private":true}');
    put('nested/lib/src/c/Header.tsx', "export const Header = () => <b>nested-header</b>;\n");
    put('nested/lib/src/Top.tsx', "export const Top = () => <i>top-level</i>;\n");
    put('nested/page.tsx', "import {Header} from '@/c/Header';\nimport {Top} from '@/Top';\nexport default function Page() { return <p><Header /><Top /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('nested/page.tsx', {cwd: dir});
    expect(fs.readFileSync(path.join(dir, 'nested/page.html'), 'utf8')).toContain('nested-header');
    fs.mkdirSync(path.join(dir, 'nested-to'), {recursive: true});
    put('nested-to/tsconfig.json', JSON.stringify(paths));
    put('nested-to/package.json', '{"name":"nested-to","private":true}');
    fs.copyFileSync(path.join(dir, 'nested/page.html'), path.join(dir, 'nested-to/page.html'));
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'nested-to'), reverse: true, out: 'lib/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['lib/src/c/Header.tsx', 'lib/src/Top.tsx']));
    expect(back.data.files).not.toEqual(expect.arrayContaining(['lib/missing/c/Header.tsx']));
  }, 60_000);

  it('names a package a catch-all key cannot place as not installed, and renders a page whose package stylesheet is missing with a warning', async () => {
    put('catchall2/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall2/package.json', '{"name":"catchall2","private":true}');
    put('catchall2/dep.tsx', "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    expect(await codeOf(() => render('catchall2/dep.tsx', {cwd: dir}))).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    put('catchall2/sheet.tsx', "import 'not-a-real-package-xyz/style.css';\nexport default () => <p>styled</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('catchall2/sheet.tsx', {cwd: dir}));
    expect(r.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('missing-asset');
  }, 60_000);

  it('leaves relative and package imports alone under a catch-all paths key', async () => {
    put('catchall/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'*': ['./types/*']}}}));
    put('catchall/package.json', '{"name":"catchall","private":true}');
    // A decoy at baseUrl that `./Header` must not load.
    put('catchall/Header.tsx', "export const Header = () => <b>decoy</b>;\n");
    put('catchall/src/Header.tsx', "export const Header = () => <b>local-header</b>;\n");
    put('catchall/src/styles.css', '.c { color: red; }\n');
    put('catchall/src/logo.png', PNG);
    put(
      'catchall/src/page.tsx',
      [
        "import './styles.css';",
        "import '@astryxdesign/core/astryx.css';",
        "import logo from './logo.png';",
        "import {Header} from './Header';",
        'export default function Page() { return <p className="c"><img src={logo} alt="" /><Header /></p>; }',
        '',
      ].join('\n'),
    );
    const r = /** @type {any} */ (await render('catchall/src/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'catchall/src/page.html'), 'utf8');
    expect(html).toContain('local-header');
    expect(html).not.toContain('decoy');
    expect(html).toContain('color: red');
    expect(html).toContain('data:image/png;base64,');
    expect(r.data.stylesheets).toEqual(expect.arrayContaining(['@astryxdesign/core/astryx.css']));
  }, 60_000);

  it('gives back a file reached through a target with text before its star', async () => {
    put('starseg/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg/package.json', '{"name":"starseg","private":true}');
    put('starseg/icons/icon-home.tsx', "export const Home = () => <i>home-icon</i>;\n");
    put('starseg/page.tsx', "import {Home} from '@icon/home';\nexport default function Page() { return <p><Home /></p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    await render('starseg/page.tsx', {cwd: dir});
    fs.mkdirSync(path.join(dir, 'starseg-to'), {recursive: true});
    put('starseg-to/tsconfig.json', JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@icon/*': ['./icons/icon-*']}}}));
    put('starseg-to/package.json', '{"name":"starseg-to","private":true}');
    fs.copyFileSync(path.join(dir, 'starseg/page.html'), path.join(dir, 'starseg-to/page.html'));
    const cwd = path.join(dir, 'starseg-to');
    const back = /** @type {any} */ (await render('page.html', {cwd, reverse: true, out: 'icons/app/page.tsx'}));
    expect(back.data.files).toEqual(expect.arrayContaining(['icons/icon-home.tsx']));
  }, 60_000);

  it('refuses a rendered file whose source block was stripped, in its own words', async () => {
    put('stripped-own.html', '<!doctype html><html><head><meta name="generator" content="Astryx 0.7.5"></head><body><p>Hello</p></body></html>');
    /** @type {any} */
    let error;
    try {
      await render('stripped-own.html', {cwd: dir, reverse: true});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error.message).toContain('rendered by Astryx');
    expect(error.message).not.toContain('not an Astryx page');
  });

  it('refuses a carried "image" whose bytes are not one', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('fake-img.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [{path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}, {path: 'hook.png', bytes: Buffer.from('process.exit(1)\n')}])}</body>`);
    expect(await codeOf(() => render('fake-img.html', {cwd: dir, reverse: true, out: 'fake-img/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
  });

  it('rebuilds a quoted attribute as JSX that compiles', async () => {
    put(
      'quoted.html',
      '<body><div class="astryx-stack"><img src="data:image/png;base64,iVBORw0KGgo=" alt="say &quot;hi&quot; {now}"><a class="astryx-link" href="/x?a=&quot;b&quot;">Go</a></div></body>',
    );
    const back = /** @type {any} */ (await render('quoted.html', {cwd: dir, reverse: true, out: 'quoted/page.tsx'}));
    expect(back.data.mode).toBe('rebuilt');
    const source = fs.readFileSync(path.join(dir, 'quoted/page.tsx'), 'utf8');
    expect(source).toContain('alt={"say \\"hi\\" {now}"}');
    const again = /** @type {any} */ (await render('quoted/page.tsx', {cwd: dir}));
    expect(again.type).toBe('render.page');
  }, 60_000);

  it('never adds a file outside the page\'s own folder beside existing project files', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('plant/app/keep.txt', 'existing\n');
    for (const [spec, name] of [
      ['../../nodemon.json', 'nodemon.json'],
      ['../../jsr.json', 'jsr.json'],
      ['../../instrumentation', 'instrumentation.ts'],
      ['../middleware', 'src/middleware.ts'],
    ]) {
      const page = {path: 'src/app/page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('plant/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('src/app/page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'plant'), reverse: true, out: 'app/page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'plant', path.basename(name)))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'plant/app/page.tsx'))).toBe(false);
    }
  });

  it('writes all or nothing: a failure part-way leaves nothing behind', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    // The second file's name is longer than a file system allows, so its
    // write fails after the page's has been staged.
    const long = 'C'.repeat(300);
    const page = {path: 'app/page.tsx', bytes: Buffer.from(`import {C} from './components/${long}';\nexport default () => <C />;\nimport '@astryxdesign/core/astryx.css';\n`)};
    const comp = {path: `app/components/${long}.tsx`, bytes: Buffer.from('export const C = () => null;\n')};
    put('atomic/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('app/page.tsx', [page, comp])}</body>`);
    expect(await codeOf(() => render('page.html', {cwd: path.join(dir, 'atomic'), reverse: true, out: 'out/page.tsx'}))).toBe(
      'ERR_WRITE_FAILED',
    );
    expect(fs.readdirSync(path.join(dir, 'atomic'))).toEqual(['page.html']);
  });



  it('restores an exact alias import to the file it names', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('exact-alias/tsconfig.json', '{"compilerOptions": {"baseUrl": ".", "paths": {"@theme": ["./src/theme.ts"]}}}\n');
    const page = {path: 'page.tsx', bytes: Buffer.from("import {t} from '@theme';\nexport default () => t;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('exact-alias/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'theme.ts', bytes: Buffer.from("export const t = 'x';\n")}])}</body>`);
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'exact-alias'), reverse: true, out: 'src/page.tsx'}));
    expect(back.data.files).toEqual(['src/page.tsx', 'src/theme.ts']);
  });

  it('keeps every neighbour inside the one folder the restore creates', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('depth/app/layout.tsx', 'existing\n');
    const page = {path: 'restored/report.tsx', bytes: Buffer.from("import r from '../app/report-export/route';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")};
    put('depth/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('restored/report.tsx', [page, {path: 'app/report-export/route.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    /** @type {any} */
    let refused;
    try {
      await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: 'restored/report.tsx'});
    } catch (e) {
      refused = e;
    }
    expect(refused?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(fs.existsSync(path.join(dir, 'depth/app/report-export'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'depth/restored'))).toBe(false);
    // The suggested folder works.
    const suggestion = refused.suggestions[0].name.replace('--out ', '');
    const back = /** @type {any} */ (await render('page.html', {cwd: path.join(dir, 'depth'), reverse: true, out: suggestion}));
    expect(back.data.mode).toBe('embedded');
  });

  it('refuses test, spec and story files a received page imports', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    for (const name of [
      'report.test.ts',
      'report.spec.tsx',
      'Report.stories.tsx',
      '__tests__/r.ts',
      'report-test.mjs',
      'report_test.mjs',
      'test-report.mjs',
      'test.mjs',
      'test/helper.mjs',
      'test-report.ts',
      'report_test.mts',
      'test.cts',
      'test/helper.ts',
      'spec.ts',
      'test.tsx',
      'report.benchmark.ts',
      'report_test.tsx',
      'tests/helper.js',
      'spectest.js',
      'testtest.ts',
    ]) {
      const page = {path: 'page.tsx', bytes: Buffer.from(`import './${name.replace(/\.(tsx?|[mc]?[jt]s)$/, '')}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('tests-in.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('export {};\n')}])}</body>`);
      expect(await codeOf(() => render('tests-in.html', {cwd: dir, reverse: true, out: 'tests-in/page.tsx'}))).toBe(
        'ERR_RENDER_SOURCE_DAMAGED',
      );
    }
  });

  it('never names the page as a file a test runner picks up', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('runner/report.test.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'runner');
    // The page's name never comes from the received file's name.
    const back = /** @type {any} */ (await render('report.test.html', {cwd, reverse: true}));
    expect(back.data.output).toBe('report.test-restored/page.mjs');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'test/page.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('report.test.html', {cwd, reverse: true, out: 'page.cy.mjs'}))).toBe('ERR_INVALID_ARGUMENT');
    put('runner/spec.html', `<body><p class="astryx-text">x</p>${sourceBlock('report.cy.ts', [{path: 'report.cy.ts', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    expect(await codeOf(() => render('spec.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    // Ordinary names that only contain such words still come back.
    put('runner/results.html', `<body><p class="astryx-text">x</p>${sourceBlock('stories/test-results.tsx', [{path: 'stories/test-results.tsx', bytes: Buffer.from("import d from '../mock-data';\nexport default () => d;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'mock-data.ts', bytes: Buffer.from('export default 1;\n')}])}</body>`);
    // Where a file lands counts, not only its name in the file.
    expect(await codeOf(() => render('results.html', {cwd, reverse: true, out: 'tests/stories/test-results.tsx'}))).toMatch(
      /ERR_INVALID_ARGUMENT|ERR_RENDER_SOURCE_DAMAGED/,
    );
    expect(fs.existsSync(path.join(cwd, 'tests'))).toBe(false);
    const ok = /** @type {any} */ (await render('results.html', {cwd, reverse: true}));
    expect(ok.data.files).toEqual(['results-restored/stories/test-results.tsx', 'results-restored/mock-data.ts']);
  });


  it('judges where a file lands from the project root, not the current folder', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted-runner/package.json', '{"name":"rr","private":true}');
    put('rooted-runner/test/fixtures/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from("import './helper.mjs';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n")}, {path: 'helper.mjs', bytes: Buffer.from('export {};\n')}])}</body>`);
    const cwd = path.join(dir, 'rooted-runner/test/fixtures');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd)).toEqual(['page.html']);
  });

  it('judges a nested package under a test folder from the repository root', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'repo-root/.git'), {recursive: true});
    put('repo-root/package.json', '{"name":"repo","private":true}');
    put('repo-root/test/fixtures/app/package.json', '{"name":"app","private":true}');
    put('repo-root/test/fixtures/app/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.mjs', [{path: 'page.mjs', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'repo-root/test/fixtures/app');
    expect(await codeOf(() => render('page.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(cwd).sort()).toEqual(['package.json', 'page.html']);
  });

  it('warns about a <script> or a loading <link> the page renders', async () => {
    put('scripted/page.tsx', 'export default function Page() { return <main><link rel="stylesheet" href="https://example.com/x.css" /><script dangerouslySetInnerHTML={{__html: "1"}} /><p>Hi</p></main>; }\nimport "@astryxdesign/core/astryx.css";\n');
    const r = /** @type {any} */ (await render('scripted/page.tsx', {cwd: dir}));
    const codes = r.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes).toContain('page-script');
    expect(codes).toContain('remote-asset');
  }, 60_000);

  it('judges the page by where it lands, on both paths', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    fs.mkdirSync(path.join(dir, 'land/.git'), {recursive: true});
    // A page saved as test.tsx comes back under another name with --out.
    put('land/named.html', `<body><p class="astryx-text">x</p>${sourceBlock('test.tsx', [{path: 'test.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')}])}</body>`);
    const cwd = path.join(dir, 'land');
    expect(await codeOf(() => render('named.html', {cwd, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    const back = /** @type {any} */ (await render('named.html', {cwd, reverse: true, out: 'demo/page.tsx'}));
    expect(back.data.output).toBe('demo/page.tsx');
    // A page rebuilt from markup inside __tests__/ is refused too.
    put('land/src/__tests__/stripped.html', '<body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body>');
    expect(
      await codeOf(() => render('stripped.html', {cwd: path.join(cwd, 'src/__tests__'), reverse: true})),
    ).toBe('ERR_INVALID_ARGUMENT');
    expect(fs.readdirSync(path.join(cwd, 'src/__tests__'))).toEqual(['stripped.html']);
  });

  it('refuses --title with --reverse', async () => {
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, title: 'x'}))).toBe('ERR_INVALID_ARGUMENT');
  });

  it('keeps a received title out of the rebuilt code', async () => {
    put('evil-title.html', '<html><head><title>x\rprocess.exit(7)\u2028//</title></head><body><div class="astryx-stack"><p class="astryx-text">Hi</p></div></body></html>');
    await render('evil-title.html', {cwd: dir, reverse: true, out: 'evil-title/page.tsx'});
    const first = fs.readFileSync(path.join(dir, 'evil-title/page.tsx'), 'utf8').split(/\r\n|\r|\n|\u2028|\u2029/)[0];
    expect(first).toContain('process.exit(7)');
    expect(first.startsWith('//')).toBe(true);
  });

  it('never adds a neighbour to an existing folder, a project root included', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put('rooted/package.json', '{"name":"rooted","private":true}');
    for (const name of ['instrumentation.ts', 'middleware.ts', 'nodemon.json']) {
      const spec = `./${name.replace(/\.ts$/, '')}`;
      const page = {path: 'page.tsx', bytes: Buffer.from(`import x from '${spec}';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`)};
      put('rooted/page.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: name, bytes: Buffer.from('{}')}])}</body>`);
      expect(
        await codeOf(() => render('page.html', {cwd: path.join(dir, 'rooted'), reverse: true, out: 'page.tsx', overwrite: true})),
      ).toMatch(/ERR_PATH_TRAVERSAL|ERR_RENDER_SOURCE_DAMAGED/);
      expect(fs.existsSync(path.join(dir, 'rooted', name))).toBe(false);
      expect(fs.existsSync(path.join(dir, 'rooted/page.tsx'))).toBe(false);
    }
    // Without --out, everything comes back into a new folder named after the file given.
    put('rooted/shared.html', `<body><p class="astryx-text">x</p>${sourceBlock('instrumentation.ts', [{path: 'instrumentation.ts', bytes: Buffer.from('export function register() {}\n')}])}</body>`);
    const back = /** @type {any} */ (await render('shared.html', {cwd: path.join(dir, 'rooted'), reverse: true}));
    expect(back.data.output).toBe('shared-restored/instrumentation.ts');
  });

  it('replaces an existing output only when a render wrote it, and never an ignored one', async () => {
    put('fwd/page.tsx', PAGE);
    fs.copyFileSync(path.join(dir, 'dot.png'), path.join(dir, 'fwd/dot.png'));
    put('fwd/mine.html', '<p>hand-written</p>\n');
    const cwd = path.join(dir, 'fwd');
    expect(await codeOf(() => render('page.tsx', {cwd, out: 'mine.html'}))).toBe('ERR_FILE_EXISTS');
    expect(fs.readFileSync(path.join(cwd, 'mine.html'), 'utf8')).toBe('<p>hand-written</p>\n');
    await render('page.tsx', {cwd});
    const again = /** @type {any} */ (await render('page.tsx', {cwd}));
    expect(again.type).toBe('render.page');
    put('fwd/.gitignore', 'page.html\n');
    expect(await codeOf(() => render('page.tsx', {cwd}))).toBe('ERR_FILE_EXISTS');
  }, 120_000);

  it('refuses a received file that lists one path twice', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const page = {path: 'page.tsx', bytes: Buffer.from('export default () => null;\nimport "@astryxdesign/core/astryx.css";\n')};
    put('twice.html', `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', [page, {path: 'page.tsx', bytes: Buffer.from("import './instrumentation';\n")}, {path: 'instrumentation.ts', bytes: Buffer.from('export {};\n')}])}</body>`);
    expect(await codeOf(() => render('twice.html', {cwd: dir, reverse: true, out: 'twice-out/page.tsx'}))).toBe(
      'ERR_RENDER_SOURCE_DAMAGED',
    );
    expect(fs.existsSync(path.join(dir, 'twice-out'))).toBe(false);
  });

  it('reports ERR_WRITE_FAILED when the output cannot be written', async () => {
    fs.mkdirSync(path.join(dir, 'a-folder.html'), {recursive: true});
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'a-folder.html'}))).toBe('ERR_WRITE_FAILED');
  }, 60_000);

  it('writes to an absolute --out in another folder, and never replaces a file there that a render did not write', async () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-elsewhere-')));
    try {
      const out = path.join(elsewhere, 'share', 'page.html');
      const result = /** @type {any} */ (await render('page.tsx', {cwd: dir, out}));
      expect(result.data.output).toBe(out);
      expect(fs.readFileSync(out, 'utf8')).toContain('<meta name="generator" content="Astryx');
      // A render again replaces the file a render wrote.
      await render('page.tsx', {cwd: dir, out});
      const other = path.join(elsewhere, 'notes.html');
      fs.writeFileSync(other, '<p>mine</p>');
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: other}))).toBe('ERR_FILE_EXISTS');
      expect(fs.readFileSync(other, 'utf8')).toBe('<p>mine</p>');
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
    }
  }, 120_000);

  it('refuses a symbolic link at an absolute --out, and leaves the file it points to', async () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-elsewhere-')));
    try {
      const target = path.join(elsewhere, 'precious.html');
      fs.writeFileSync(target, '<meta name="generator" content="Astryx 0.0.0"><p>kept</p>');
      const link = path.join(elsewhere, 'page.html');
      fs.symlinkSync(target, link);
      expect(await codeOf(() => render('page.tsx', {cwd: dir, out: link}))).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(target, 'utf8')).toBe('<meta name="generator" content="Astryx 0.0.0"><p>kept</p>');
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
    }
  }, 120_000);

  it('refuses a relative --out outside the current folder, saying an absolute path works', async () => {
    let error;
    try {
      await render('page.tsx', {cwd: dir, out: '../escaped.html'});
    } catch (e) {
      error = /** @type {any} */ (e);
    }
    expect(error?.code).toBe('ERR_PATH_TRAVERSAL');
    expect(error?.message).toContain('or name an absolute path');
  });

  it('refuses --out outside the current folder, and a write through a symlink that leaves it', async () => {
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: '../escaped.html'}))).toBe('ERR_PATH_TRAVERSAL');
    expect(await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: '../escaped.tsx'}))).toBe(
      'ERR_PATH_TRAVERSAL',
    );
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-outside-')));
    try {
      fs.symlinkSync(outside, path.join(dir, 'link-out'));
      expect(
        await codeOf(() => render('page.html', {cwd: dir, reverse: true, out: 'link-out/page.tsx'})),
      ).toBe('ERR_PATH_TRAVERSAL');
      expect(fs.readdirSync(outside)).toEqual([]);
    } finally {
      fs.rmSync(outside, {recursive: true, force: true});
    }
  });
});

describe('render(): imports with a query, as Vite gives them', () => {
  it('gives ?raw the file text, ?inline a stylesheet text, ?url an image address, and gives the files back', async () => {
    put('queries/notes.css', '.note { color: teal; --note-marker: 1; }\n');
    put('queries/dot.png', PNG);
    put('queries/data.json', '{"a": 1}\n');
    put(
      'queries/page.tsx',
      "import sheet from './notes.css?inline';\nimport text from './data.json?raw';\nimport * as whole from './data.json?raw';\nimport {default as named} from './data.json?raw';\nimport dot from './dot.png?url';\nexport default function Page() {\n  return <main><pre className=\"note\">{sheet}</pre><pre>{text}</pre><pre>{whole.default === text && named === text ? 'every import gets the text' : 'no'}</pre><img src={dot} alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('queries/page.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/page.html'), 'utf8');
    expect(html).toContain('.note { color: teal; --note-marker: 1; }');
    expect(html).toContain('every import gets the text');
    expect(html).toContain('{&quot;a&quot;: 1}');
    expect(html).toContain('src="data:image/png;base64,');
    // A stylesheet imported with ?inline is text, not a sheet of the page:
    // the class it styles is used, and no rule of it is in the page's styles.
    expect(html.match(/<style[^>]*>([\s\S]*?)<\/style>/)?.[1]).not.toContain('--note-marker');
    expect(result.data.files.sort()).toEqual(['data.json', 'dot.png', 'notes.css', 'page.tsx']);
    const back = /** @type {any} */ (await render('queries/page.html', {cwd: dir, reverse: true, out: 'queries-back/page.tsx'}));
    expect(back.data.exact).toBe(true);
  }, 60_000);

  it('loads a file with any other query as it loads without one: an image as its address, a module as itself', async () => {
    put('queries/w.ts', "export const label = 'from the worker module';\n");
    put(
      'queries/others.tsx',
      "import a from './dot.png?w=400';\nimport b from './dot.png?no-inline';\nimport c from './dot.png?url&inline';\nimport * as w from './w.ts?worker';\nexport default function Page() {\n  return <main><img src={a} alt=\"\" /><img src={b} alt=\"\" /><img src={c} alt=\"\" /><p>{w.label}</p></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('queries/others.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'queries/others.html'), 'utf8');
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(3);
    expect(html).toContain('from the worker module');
    expect(result.data.files.sort()).toEqual(['dot.png', 'others.tsx', 'w.ts']);
  }, 60_000);
});

describe('render(): ordinary files named like configuration', () => {
  it('carries modules and JSON data named config or ending in rc, and gives them back exactly', async () => {
    put('names/config.ts', "export const site = {title: 'Named config'};\n");
    put('names/lib/arc.ts', "export const arc = 'an arc';\n");
    put('names/data/chart-config.json', '{"series": ["North", "South"]}\n');
    put('names/data/config.json', '{"footer": "From config.json"}\n');
    put(
      'names/page.tsx',
      "import {site} from './config';\nimport {arc} from './lib/arc';\nimport chart from './data/chart-config.json';\nimport config from './data/config.json';\nexport default function Page() {\n  return <main><h1>{site.title}</h1><p>{arc} {chart.series.join(' ')} {config.footer}</p></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const result = /** @type {any} */ (await render('names/page.tsx', {cwd: dir}));
    expect(result.data.files.sort()).toEqual(['config.ts', 'data/chart-config.json', 'data/config.json', 'lib/arc.ts', 'page.tsx']);
    expect(result.data.warnings.filter((/** @type {any} */ w) => w.code === 'not-embedded')).toEqual([]);
    // Format 1 readers refuse these names, so the file says format 2.
    const back = /** @type {any} */ (await render('names/page.html', {cwd: dir, reverse: true, out: 'names-back/page.tsx'}));
    expect(back.data).toMatchObject({exact: true, format: 2});
    for (const name of ['config.ts', 'lib/arc.ts', 'data/chart-config.json', 'data/config.json']) {
      expect(fs.readFileSync(path.join(dir, 'names-back', name))).toEqual(fs.readFileSync(path.join(dir, 'names', name)));
    }
  }, 60_000);
});

describe('render --reverse: a received file may carry only what a render embeds', () => {
  /** @param {string} name @param {{path: string, text: string}[]} files */
  const crafted = async (name, files) => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    put(
      name,
      `<body><p class="astryx-text">x</p>${sourceBlock(files[0].path, files.map(f => ({path: f.path, bytes: Buffer.from(f.text)})))}</body>`,
    );
  };
  it.each([
    ['a git hook', '.git/hooks/pre-commit', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a dotfile', '.env', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a tool configuration module', 'vite.config.ts', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['an rc module', '.eslintrc.js', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['the Astryx configuration', 'astryx.config.mjs', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['the package manifest', 'package.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a TypeScript configuration', 'tsconfig.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a TypeScript project configuration', 'tsconfig.app.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a JSON tool configuration by its config name', 'renovate.config.json', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a package inside node_modules', 'node_modules/react/index.js', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a shell script', 'scripts/install.sh', 'ERR_RENDER_SOURCE_DAMAGED'],
    ['a climbing path', '../escape.css', 'ERR_PATH_TRAVERSAL'],
    ['an absolute path', '/tmp/escape.css', 'ERR_PATH_TRAVERSAL'],
  ])('refuses %s, writing nothing', async (_, bad, code) => {
    const name = `crafted-${bad.replace(/[^a-z0-9]/gi, '_')}.html`;
    await crafted(name, [
      {path: 'page.tsx', text: 'export default () => null;\nimport "@astryxdesign/core/astryx.css";\n'},
      {path: bad, text: 'echo pwned\n'},
    ]);
    const out = `crafted-out-${bad.replace(/[^a-z0-9]/gi, '_')}`;
    expect(await codeOf(() => render(name, {cwd: dir, reverse: true, out: `${out}/page.tsx`}))).toBe(code);
    expect(fs.existsSync(path.join(dir, out))).toBe(false);
  });

  it.each([
    ['a framework hook file', 'instrumentation.ts'],
    ['a middleware module', 'src/middleware.ts'],
    ['a JSON tool configuration', 'babel.config.json'],
    ['a module in a tools folder', 'tools/plugin.js'],
    ['a stylesheet the page never imports', 'theme.css'],
  ])('refuses %s the page does not import, writing nothing', async (_, extra) => {
    const name = `stray-${extra.replace(/[^a-z0-9]/gi, '_')}.html`;
    await crafted(name, [
      {path: 'page.tsx', text: "import {Header} from './Header';\nexport default () => <Header />;\nimport '@astryxdesign/core/astryx.css';\n"},
      {path: 'Header.tsx', text: 'export const Header = () => <h1>Hi</h1>;\n'},
      {path: extra, text: 'export default {};\n'},
    ]);
    const out = `stray-out-${extra.replace(/[^a-z0-9]/gi, '_')}`;
    /** @type {any} */
    let error;
    try {
      await render(name, {cwd: dir, reverse: true, out: `${out}/page.tsx`});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_SOURCE_DAMAGED');
    expect(error.message).toContain(extra);
    expect(fs.existsSync(path.join(dir, out))).toBe(false);
  });

  it('writes every file the page reaches: re-exports, import(), require() and a folder index', async () => {
    await crafted('reach.html', [
      {
        path: 'page.tsx',
        text: "export {a} from './a';\nconst b = import('./b');\nconst c = require('./c.json');\nimport './parts';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n",
      },
      {path: 'a.ts', text: "import './a.css';\nexport const a = 1;\n"},
      {path: 'a.css', text: '.a{}\n'},
      {path: 'b.tsx', text: 'export default 2;\n'},
      {path: 'c.json', text: '{}\n'},
      {path: 'parts/index.ts', text: 'export {};\n'},
    ]);
    const r = /** @type {any} */ (await render('reach.html', {cwd: dir, reverse: true, out: 'reach/page.tsx'}));
    expect(r.data.files.length).toBe(6);
  });

  it('refuses a page entry that is not a page module, and an --out that names a configuration file', async () => {
    await crafted('crafted-entry.html', [{path: 'vite.config.ts', text: 'export default {};\n'}]);
    expect(await codeOf(() => render('crafted-entry.html', {cwd: dir, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    await crafted('crafted-good.html', [{path: 'page.tsx', text: 'export default () => null;\nimport "@astryxdesign/core/astryx.css";\n'}]);
    expect(await codeOf(() => render('crafted-good.html', {cwd: dir, reverse: true, out: 'vite.config.ts'}))).toBe(
      'ERR_INVALID_ARGUMENT',
    );
    // Refused before the input is read: a missing input gives the same answer.
    expect(await codeOf(() => render('missing.html', {cwd: dir, reverse: true, out: 'vite.config.ts'}))).toBe(
      'ERR_INVALID_ARGUMENT',
    );
    expect(fs.existsSync(path.join(dir, 'vite.config.ts'))).toBe(false);
  });

  it('refuses neighbours into a folder that already exists, naming them, and writes nothing', async () => {
    await crafted('crafted-exists.html', [
      {path: 'page.tsx', text: "import './styles.css';\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n"},
      {path: 'styles.css', text: '.a{}\n'},
    ]);
    put('exists/keep.txt', 'existing\n');
    /** @type {any} */
    let error;
    try {
      await render('crafted-exists.html', {cwd: dir, reverse: true, out: 'exists/page.tsx', overwrite: true});
    } catch (e) {
      error = e;
    }
    expect(error.code).toBe('ERR_PATH_TRAVERSAL');
    expect(error.message).toContain('exists/styles.css');
    expect(fs.readdirSync(path.join(dir, 'exists'))).toEqual(['keep.txt']);
  });

  it('never embeds a configuration file the page imports, and says so', async () => {
    put('cfg/package.json', JSON.stringify({name: 'cfg', version: '1.2.3'}));
    put('cfg/page.tsx', "import pkg from './package.json';\nexport default function Page() { return <p>v{pkg.version}</p>; }\nimport '@astryxdesign/core/astryx.css';\n");
    const r = /** @type {any} */ (await render('cfg/page.tsx', {cwd: dir}));
    expect(r.data.files).toEqual(['page.tsx']);
    expect(r.data.notCarried).toEqual(['package.json']);
    expect(r.data.warnings).toContainEqual({
      code: 'not-carried',
      message:
        "package.json is not carried: it is a tool's configuration, which experimental import never writes. The page shows what it reads from it, but experimental import cannot give it back. Move the values the page reads into a file of its own, such as page-data.json, to carry them.",
    });
    expect(fs.readFileSync(path.join(dir, 'cfg/page.html'), 'utf8')).toContain('v1.2.3');
    // Given back, the page says what it imports that the file did not carry.
    const back = /** @type {any} */ (await render('cfg/page.html', {cwd: dir, reverse: true}));
    expect(back.data.exact).toBe(false);
    expect(back.data.missing).toEqual(['package.json']);
  }, 60_000);
});

describe('astryx experimental export (CLI)', () => {
  it('refuses an unknown experimental subcommand with exit 1', async () => {
    const r = await runCli(['--json', 'experimental', 'nope'], dir);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.code).toBe('ERR_UNKNOWN_SUBCOMMAND');
    expect(
      out.suggestions.some((/** @type {any} */ s) => /experimental export$/.test(s.name)),
    ).toBe(true);
  });

  it('fails with exit 1 and a readable message without --json', async () => {
    const r = await runCli(['experimental', 'export', '--reverse', 'plain.html'], dir);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is not an Astryx page');
    expect(r.stderr).toContain('astryx build');
  });


  it('answers --json with the render.page envelope and --title', async () => {
    const r = await runCli(['--json', 'experimental', 'export', 'page.tsx', '--out', 'cli.html', '--title', 'From the CLI'], dir);
    expect(r.status).toBe(0);
    const json = JSON.parse(r.stdout);
    expect(json.type).toBe('render.page');
    expect(json.data.output).toBe('cli.html');
    expect(fs.readFileSync(path.join(dir, 'cli.html'), 'utf8')).toContain('<title>From the CLI</title>');
  }, 60_000);

  it('prints a command to give back a file rendered to another folder that runs from here', async () => {
    const elsewhere = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-elsewhere-')));
    try {
      const out = path.join(elsewhere, 'shared report.html');
      // Twice: the second round trip names the next free folder.
      for (const folder of ['shared report-restored', 'shared report-restored-2']) {
        const rendered = await runCli(['experimental', 'export', 'page.tsx', '--out', out], dir);
        expect(rendered.status, rendered.stderr).toBe(0);
        const line = rendered.stdout.split('\n').find(l => l.startsWith('Give it back: '));
        expect(line).toBeDefined();
        // The printed command, run as printed after the CLI's own name.
        const words = /** @type {string} */ (line).slice('Give it back: '.length).split(' experimental import ')[1];
        const args = [...words.matchAll(/'((?:[^']|'\\'')*)'|(\S+)/g)].map(m => (m[1] ?? m[2]).replace(/'\\''/g, "'"));
        expect(args).toEqual([out, '--out', `${folder}/page.tsx`]);
        const back = await runCli(['experimental', 'import', ...args], dir);
        expect(back.status, back.stderr).toBe(0);
        expect(fs.readFileSync(path.join(dir, folder, 'page.tsx'), 'utf8')).toBe(
          fs.readFileSync(path.join(dir, 'page.tsx'), 'utf8'),
        );
      }
    } finally {
      fs.rmSync(elsewhere, {recursive: true, force: true});
      for (const folder of ['shared report-restored', 'shared report-restored-2']) {
        fs.rmSync(path.join(dir, folder), {recursive: true, force: true});
      }
    }
  }, 120_000);

  it('fails with exit 1 and a JSON error envelope', async () => {
    const r = await runCli(['--json', 'experimental', 'export', '--reverse', 'plain.html'], dir);
    expect(r.status).toBe(1);
    const json = JSON.parse(r.stdout);
    expect(json.code).toBe('ERR_RENDER_NOT_ASTRYX');
    expect(json.suggestions?.[0]?.name ?? '').toContain('astryx build');
  });

  it('marks itself experimental in help', async () => {
    const r = await runCli(['experimental', '--help'], dir);
    expect(r.stdout).toMatch(/export[^\n]*\[experimental\]/);
  });

  it('names at most 10 restored files in text and keeps every file in JSON', async () => {
    const {sourceBlock} = await import('../../foundation/render/source-block.mjs');
    const sheets = Array.from({length: 12}, (_, i) => `styles/s${String(i + 1).padStart(2, '0')}.css`);
    const page = {
      path: 'page.tsx',
      text: `${sheets.map(s => `import './${s}';`).join('\n')}\nexport default () => null;\nimport '@astryxdesign/core/astryx.css';\n`,
    };
    const files = [page, ...sheets.map(s => ({path: s, text: 'p{}\n'}))];
    put(
      'many-files.html',
      `<body><p class="astryx-text">x</p>${sourceBlock('page.tsx', files.map(f => ({path: f.path, bytes: Buffer.from(f.text)})))}</body>`,
    );
    const text = await runCli(['experimental', 'export', '--reverse', 'many-files.html', '--out', 'many-text/page.tsx'], dir);
    expect(text.status).toBe(0);
    const line = text.stdout.split('\n').find(l => /^\s*files\b/.test(l)) ?? '';
    expect(line).toContain('styles/s09.css');
    expect(line).not.toContain('styles/s10.css');
    expect(line).toContain('... and 3 more in many-text/styles/');
    const json = await runCli(['--json', 'experimental', 'export', '--reverse', 'many-files.html', '--out', 'many-json/page.tsx'], dir);
    expect(JSON.parse(json.stdout).data.files).toHaveLength(13);
  }, 60_000);
});

describe('render(): refusals', () => {
  it.each([
    ['syntax error', 'bad.tsx', 'export default function Page() { return <div>; }\nimport "@astryxdesign/core/astryx.css";\n', 'ERR_RENDER_COMPILE'],
    ['no default export', 'named.tsx', 'export function Page() { return null; }', 'ERR_RENDER_NO_DEFAULT_EXPORT'],
    ['package not installed', 'dep.tsx', "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\nimport '@astryxdesign/core/astryx.css';\n", 'ERR_RENDER_MISSING_DEPENDENCY'],
    ['browser API while rendering', 'win.tsx', 'export default function Page() { return <p>{window.innerWidth}</p>; }\nimport "@astryxdesign/core/astryx.css";\n', 'ERR_RENDER_BROWSER_API'],
    ['missing local module', 'local.tsx', "import X from './nope';\nexport default () => <X />;\nimport '@astryxdesign/core/astryx.css';\n", 'ERR_FILE_NOT_FOUND'],
    ['a throw', 'throw.tsx', "export default function Page() { throw new Error('boom'); }\nimport '@astryxdesign/core/astryx.css';\n", 'ERR_RENDER_FAILED'],
  ])('%s', async (_, name, source, code) => {
    put(name, source);
    expect(await codeOf(() => render(name, {cwd: dir}))).toBe(code);
  }, 30_000);

  it("gives the run folder's integration line only for a page in the run folder's package", async () => {
    put('acme-app/package.json', '{"name":"acme-app","private":true}');
    put('acme-app/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    put('acme-app/page.tsx', "import a from 'not-real-a-xyz';\nexport default () => <p>{String(a)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    put('guided.tsx', "import a from 'not-real-a-xyz';\nexport default () => <p>{String(a)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    recordDeclaredSettings(dir, [{name: '@acme/a', installGuidance: 'acme add {packages}'}]);
    try {
      /** @type {any} */
      let own;
      try {
        await render('guided.tsx', {cwd: dir});
      } catch (e) {
        own = e;
      }
      expect(own?.suggestions?.[0]?.name).toBe('acme add not-real-a-xyz');
      /** @type {any} */
      let other;
      try {
        await render('acme-app/page.tsx', {cwd: dir});
      } catch (e) {
        other = e;
      }
      expect(other?.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
      expect(other?.suggestions ?? []).toEqual([]);
      expect(other?.message).toBe(
        'The page imports not-real-a-xyz, which is not installed. Install it in acme-app, the package that holds this page: from there, run pnpm add not-real-a-xyz',
      );
    } finally {
      recordDeclaredSettings(dir, []);
    }
  }, 60_000);

  it("names a package Astryx releases with Core at the project's Core release in the run folder's integration line", async () => {
    // theme-stone is released with Core and is not linked into the fixture.
    put('core-app/package.json', '{"name":"core-app","private":true}');
    put('core-app/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    put('core-app/page.tsx', "import stone from '@astryxdesign/theme-stone';\nexport default () => <p>{String(stone)}</p>;\n");
    const app = path.join(dir, 'core-app');
    recordDeclaredSettings(app, [{name: '@acme/a', installGuidance: 'acme add {packages}'}]);
    try {
      /** @type {any} */
      let error;
      try {
        await render('page.tsx', {cwd: app});
      } catch (e) {
        error = e;
      }
      expect(error?.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
      expect(error?.suggestions?.[0]?.name).toBe(`acme add @astryxdesign/theme-stone@${CLI_VERSION}`);
    } finally {
      recordDeclaredSettings(app, []);
    }
  }, 60_000);

  it("suggests one install line for every missing package, in the project's package manager", async () => {
    put('pnpm-app/package.json', '{"name":"pnpm-app","private":true}');
    put('pnpm-app/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    put('pnpm-app/page.tsx', "import a from 'not-real-a-xyz';\nimport b from 'not-real-b-xyz';\nexport default () => <p>{String(a)}{String(b)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    put('npm-app/package.json', '{"name":"npm-app","private":true}');
    put('npm-app/page.tsx', "import a from 'not-real-a-xyz';\nexport default () => <p>{String(a)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any[]} */
    const errors = [];
    // Rendered from the page's own package, the line runs as printed.
    for (const [page, cwd] of [
      ['page.tsx', path.join(dir, 'pnpm-app')],
      ['page.tsx', path.join(dir, 'npm-app')],
      // Rendered from the package above, the same line would add the packages
      // there, so the message names the page's package instead.
      ['pnpm-app/page.tsx', dir],
    ]) {
      try {
        await render(page, {cwd});
      } catch (e) {
        errors.push(e);
      }
    }
    expect(errors.map(e => [e.code, e.message, e.suggestions?.[0]?.name ?? null])).toEqual([
      ['ERR_RENDER_MISSING_DEPENDENCY', 'The page imports not-real-a-xyz and not-real-b-xyz, which are not installed', 'pnpm add not-real-a-xyz not-real-b-xyz'],
      ['ERR_RENDER_MISSING_DEPENDENCY', 'The page imports not-real-a-xyz, which is not installed', 'npm install not-real-a-xyz'],
      [
        'ERR_RENDER_MISSING_DEPENDENCY',
        'The page imports not-real-a-xyz and not-real-b-xyz, which are not installed. Install them in pnpm-app, the package that holds this page: from there, run pnpm add not-real-a-xyz not-real-b-xyz',
        null,
      ],
    ]);
  }, 60_000);

  it('gives no install line when the project\'s lockfiles disagree, naming their folder from where the render runs', async () => {
    put('two-locks/package.json', '{"name":"two-locks","private":true}');
    put('two-locks/package-lock.json', '{}\n');
    put('two-locks/pnpm-lock.yaml', "lockfileVersion: '9.0'\n");
    put('two-locks/src/app/page.tsx', "import a from 'not-real-a-xyz';\nexport default () => <p>{String(a)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('src/app/page.tsx', {cwd: path.join(dir, 'two-locks')});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(error.message).toBe(
      'The page imports not-real-a-xyz, which is not installed. Install missing dependencies: not-real-a-xyz. No install command: . has pnpm-lock.yaml and package-lock.json, and nothing there says which package manager to use.',
    );
    expect(error.suggestions ?? []).toEqual([]);
  }, 60_000);

  it('names the file and the line a compile error points at', async () => {
    put('broken/Card.tsx', 'export function Card() { return <div>; }\n');
    put('broken/page.tsx', "import {Card} from './Card';\nexport default function Page() { return <Card />; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('broken/page.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toMatch(/^The page does not compile \((?:broken\/)?Card\.tsx, line 1\): Unterminated JSX contents/);
    // No machine path: the file is named from the project.
    expect(error.message).not.toContain(dir);
  }, 30_000);

  it('names the value and the import when StyleX cannot read an imported value at build time', async () => {
    put('sx/tokens.ts', 'export const gap = 8;\n');
    put(
      'sx/Row.tsx',
      "import * as stylex from '@stylexjs/stylex';\nimport {\n  gap,\n} from './tokens';\nconst styles = stylex.create({row: {display: 'flex', gap}});\nexport function Row() {\n  return <div {...stylex.props(styles.row)} />;\n}\n",
    );
    put('sx/page.tsx', "import {Row} from './Row';\nexport default function Page() { return <Row />; }\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('sx/page.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toMatch(
      /^The page does not compile \((?:sx\/)?Row\.tsx, line 3\): StyleX could not read `gap` from \.\/tokens at build time\. A value a style uses must be written in the style, or come from a \.stylex\.ts or \.stylex\.js file that defines it with stylex\.defineVars or stylex\.defineConsts\.$/,
    );
  }, 30_000);

  it('reads the error the same with colour forced on, and names an aliased import by its local name', async () => {
    const previous = process.env.FORCE_COLOR;
    process.env.FORCE_COLOR = '1';
    try {
      put(
        'sx/AliasRow.tsx',
        "import * as stylex from '@stylexjs/stylex';\nimport {gap as space} from './tokens';\nconst styles = stylex.create({row: {display: 'flex', gap: space}});\nexport function AliasRow() {\n  return <div {...stylex.props(styles.row)} />;\n}\n",
      );
      put('sx/alias.tsx', "import {AliasRow} from './AliasRow';\nexport default function Page() { return <AliasRow />; }\nimport '@astryxdesign/core/astryx.css';\n");
      /** @type {any} */
      let error;
      try {
        await render('sx/alias.tsx', {cwd: dir});
      } catch (e) {
        error = e;
      }
      expect(error?.code).toBe('ERR_RENDER_COMPILE');
      expect(error.message).toMatch(
        /^The page does not compile \((?:sx\/)?AliasRow\.tsx, line 2\): StyleX could not read `space` from \.\/tokens at build time\./,
      );
      expect(error.message).not.toContain('\u001b[');
    } finally {
      if (previous === undefined) delete process.env.FORCE_COLOR;
      else process.env.FORCE_COLOR = previous;
    }
  }, 30_000);

  it('says which .stylex file StyleX could not find', async () => {
    put(
      'sx/missing.tsx',
      "import * as stylex from '@stylexjs/stylex';\nimport {tones} from './gone.stylex';\nconst styles = stylex.create({text: {color: tones.ink}});\nexport default function Page() {\n  return <p {...stylex.props(styles.text)}>Hi</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    /** @type {any} */
    let error;
    try {
      await render('sx/missing.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_COMPILE');
    expect(error.message).toMatch(
      /^The page does not compile \((?:sx\/)?missing\.tsx, line 2\): StyleX could not find \.\/gone\.stylex, which `tones` comes from, at build time\. Check that the file exists, or that its package is installed where the page is\.$/,
    );
  }, 30_000);

  it('refuses wrong inputs and flags', async () => {
    expect(await codeOf(() => render('', {cwd: dir}))).toBe('ERR_MISSING_ARGUMENT');
    expect(await codeOf(() => render('missing.tsx', {cwd: dir}))).toBe('ERR_FILE_NOT_FOUND');
    expect(await codeOf(() => render('page.html', {cwd: dir}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, reverse: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'page.txt'}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, overwrite: true}))).toBe('ERR_INVALID_ARGUMENT');
    expect(await codeOf(() => render('page.tsx', {cwd: dir, out: 'page.tsx'}))).toBe('ERR_INVALID_ARGUMENT');
  });

  it('refuses an image too large to inline', async () => {
    put('big.png', Buffer.alloc(9 * 1024 * 1024));
    put('big.tsx', "import big from './big.png';\nexport default () => <img src={big} alt='' />;\nimport '@astryxdesign/core/astryx.css';\n");
    expect(await codeOf(() => render('big.tsx', {cwd: dir}))).toBe('ERR_RENDER_ASSET_TOO_LARGE');
  }, 30_000);
});

describe('render(): a crash of Node itself', () => {
  // A signal that Node raises when it fails ends only the page's process.
  it.skipIf(process.platform === 'win32')('fails with a message that names this Node', async () => {
    put('crash.tsx', "process.kill(process.pid, 'SIGSEGV');\nexport default () => <p>Hi</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    /** @type {any} */
    let error;
    try {
      await render('crash.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toContain(`Node ${process.version}`);
    expect(error.message).toContain('crashed (SIGSEGV)');
    expect(fs.existsSync(path.join(dir, 'crash.html'))).toBe(false);
  }, 60_000);

  // A page that loops forever must not outlive a CLI that is stopped by its
  // process id, as a caller's own time limit stops it.
  it.skipIf(process.platform === 'win32').each(['SIGTERM', 'SIGKILL'])('ends the page process when the CLI is stopped with %s', async signal => {
    const name = `loop-${signal}`;
    put(
      `${name}.tsx`,
      `import {writeFileSync} from 'node:fs';\nwriteFileSync(${JSON.stringify(path.join(dir, `${name}.pid`))}, String(process.pid));\nwhile (true) {}\nexport default () => <p>Hi</p>;\nimport '@astryxdesign/core/astryx.css';\n`,
    );
    const cli = spawn(process.execPath, [path.join(CLI_DIR, 'clients/cli/bin/astryx.mjs'), 'experimental', 'export', `${name}.tsx`], {cwd: dir, stdio: 'ignore'});
    const pidFile = path.join(dir, `${name}.pid`);
    const until = async (/** @type {() => boolean} */ done, /** @type {number} */ ms) => {
      for (const start = Date.now(); !done() && Date.now() - start < ms; ) await new Promise(r => setTimeout(r, 50));
      return done();
    };
    expect(await until(() => fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8') !== '', 30_000)).toBe(true);
    const pagePid = Number(fs.readFileSync(pidFile, 'utf8'));
    expect(pagePid).not.toBe(cli.pid);
    const alive = () => {
      try {
        process.kill(pagePid, 0);
        return true;
      } catch {
        return false;
      }
    };
    cli.kill(/** @type {NodeJS.Signals} */ (signal));
    const ended = await until(() => !alive(), 10_000);
    if (!ended) process.kill(pagePid, 'SIGKILL');
    expect(ended).toBe(true);
  }, 60_000);
});

describe('render(): a page that ends without an answer', () => {
  // The message says why, so a failure in a list of renders says why too.
  it('says where it ended, how long it ran and the memory left', async () => {
    put('ends.tsx', 'process.exit(0);\nexport default () => <p>Hi</p>;\nimport "@astryxdesign/core/astryx.css";\n');
    /** @type {any} */
    let error;
    try {
      await render('ends.tsx', {cwd: dir});
    } catch (e) {
      error = e;
    }
    expect(error?.code).toBe('ERR_RENDER_FAILED');
    expect(error.message).toMatch(/without an answer \(exit 0\) while importing the page, after \d+ seconds, with \d+ MB of memory free\./);
    expect(fs.existsSync(path.join(dir, 'ends.html'))).toBe(false);
  }, 60_000);
});

describe('render(): Avatar initials without Intl.Segmenter', () => {
  // A render on a Node build that crashes in Intl.Segmenter removes it before
  // the page loads. A local module imported first does the same here.
  const NAMES = [
    ['Ada Lovelace', 'AL', 'AL'],
    ['José Ñúñez', 'JÑ', 'JÑ'],
    ['Zoë Kravitz', 'ZK', 'ZK'],
    ['Åsa Öberg', 'ÅÖ', 'ÅÖ'],
    ['李小龙', '李', '李'],
    ['김민준', '김', '김'],
    // The accent is a separate mark after E.
    ['E\u0301mile Zola', 'E\u0301Z', 'EZ'],
    ['👩‍💻 Dev Team', '👩‍💻T', '👩T'],
    ['🇯🇵 Tanaka', '🇯🇵T', '🇯T'],
  ];
  const body = `import {Avatar} from '@astryxdesign/core/Avatar';
const NAMES = ${JSON.stringify(NAMES.map(([name]) => name))};
export default function Page() {
  return <main>{NAMES.map((name, i) => <div key={i} data-name={i}><Avatar name={name} /></div>)}</main>;
}
`;

  /** @param {string} name */
  async function initialsOf(name) {
    await render(`initials/${name}.tsx`, {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'initials', `${name}.html`), 'utf8');
    // Generated content draws the initials from a private inline custom
    // property, not a text node. The plain string is the one not followed by
    // its empty alternative text.
    return [...html.matchAll(/<div data-name="\d+">([\s\S]*?)(?=<div data-name=|<\/main>)/g)].map(
      m => /--[\w-]+:\s*(?:&quot;|")([^&"]*)(?:&quot;|")\s*(?:;|"|$)/.exec(m[1])?.[1] ?? '',
    );
  }

  // On a Node build that crashes in Intl.Segmenter, both renders run without it.
  const segmenterCrashes =
    spawnSync(process.execPath, ['-e', "[...new Intl.Segmenter('en').segment('a b')]"], {stdio: 'ignore'}).signal !== null;

  it.skipIf(segmenterCrashes)('match for ordinary names and differ only for joined emoji, flags and separate accent marks', async () => {
    put('initials/with.tsx', body);
    put('initials/no-segmenter.ts', 'delete (Intl as any).Segmenter;\nexport {};\n');
    put('initials/without.tsx', `import './no-segmenter';\n${body}`);
    expect(await initialsOf('with')).toEqual(NAMES.map(([, withSegmenter]) => withSegmenter));
    expect(await initialsOf('without')).toEqual(NAMES.map(([, , withoutSegmenter]) => withoutSegmenter));
  }, 60_000);

  it('names the Node build in the warning and says the output may differ slightly', () => {
    const warning = segmenterWarning();
    expect(warning.code).toBe('node-crash');
    expect(warning.message).toContain(`${process.version} at ${process.execPath}`);
    expect(warning.message).toContain('may differ slightly');
  });
});

describe('render(): a page outside a project', () => {
  /** @type {string} */
  let away;
  const BIN = path.join(CLI_DIR, 'clients', 'cli', 'bin', 'astryx.mjs');

  /** @param {string} cwd @param {string[]} args */
  const runBin = (cwd, args) => {
    // A test runner's NODE_PATH would reach this repository's packages.
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, [BIN, '--json', ...args], {cwd, env, encoding: 'utf8', timeout: 60_000});
    return {status: run.status, json: JSON.parse(run.stdout)};
  };

  beforeAll(() => {
    away = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-render-away-')));
  });

  afterAll(() => {
    fs.rmSync(away, {recursive: true, force: true});
  });

  it('uses a .js file that exists under the name as written, not the TypeScript file beside it', () => {
    const tree = path.join(away, 'own-js-exists');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'fmt.js'), "export const fmt = value => `js:${value}`;\n");
    fs.writeFileSync(path.join(tree, 'fmt.ts'), "export const fmt = (value: string): string => `ts:${value}`;\n");
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import {fmt} from './fmt.js';\nexport default function Page() {\n  return <p>{fmt('128')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx', 'fmt.js']);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('js:128');
    expect(readSourceBlock(html)).toMatchObject({found: true, source: {version: 1}});
  }, 60_000);

  it('loads the page\'s own modules imported TypeScript-style by .js names, and gives them back exactly', () => {
    const tree = path.join(away, 'own-ts-js');
    fs.mkdirSync(path.join(tree, 'parts'), {recursive: true});
    const files = {
      'parts/fmt.ts': "export const fmt = (value: string): string => `#${value}`;\n",
      'parts/later.tsx': 'export const Later = () => <p>Later</p>;\n',
      'parts/Kpi.tsx':
        "import {fmt} from './fmt.js';\nexport const loadLater = () => import('./later.js');\nexport function Kpi({label, value}: {label: string; value: string}) {\n  return <p>{label}: {fmt(value)}</p>;\n}\n",
      'page.tsx':
        "import {Kpi} from './parts/Kpi.js';\nexport default function Page() {\n  return <main><Kpi label=\"Signups\" value=\"128\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    };
    for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(tree, name), text);
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status, JSON.stringify(run.json)).toBe(0);
    expect([...run.json.data.files].sort()).toEqual(['page.tsx', 'parts/Kpi.tsx', 'parts/fmt.ts', 'parts/later.tsx']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('Signups: #128');
    // Earlier CLIs cannot follow a .js name to its TypeScript file, so the
    // file says a render format they do not read, and they name this CLI.
    expect(readSourceBlock(html)).toMatchObject({found: true, source: {version: 3}});
    expect(html).toContain('render format 3.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, format: 3});
    expect(back.json.data).not.toHaveProperty('missing');
    for (const [name, text] of Object.entries(files)) {
      expect(fs.readFileSync(path.join(tree, 'page-restored', name), 'utf8'), name).toBe(text);
    }
  }, 60_000);

  it('takes Astryx, React and StyleX from the copy the CLI runs with', () => {
    fs.writeFileSync(path.join(away, 'page.tsx'), PAGE);
    fs.writeFileSync(path.join(away, 'dot.png'), PNG);
    const run = runBin(away, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.stylesheets).toContain('@astryxdesign/core/astryx.css');
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('no-astryx-styles');
    const html = fs.readFileSync(path.join(away, 'page.html'), 'utf8');
    expect(html).toContain('Café ✓ report');
    expect(html).toContain('astryx-button');
    const back = runBin(away, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.json.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(away, 'page-restored', 'page.tsx'), 'utf8')).toBe(PAGE);
  }, 60_000);

  it('carries the modules a page imports from above its own folder, as a restore lays them out', () => {
    const tree = path.join(away, 'tree');
    fs.mkdirSync(path.join(tree, 'app/x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'components'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'components/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above the page</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'app/x/page.tsx'), "import {Banner} from '../../components/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', 'app/x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['app/x/page.tsx', 'components/Banner.tsx']);
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'app/x/page.html']);
    expect(back.json.data).toMatchObject({exact: true, files: ['app/x/page-restored/app/x/page.tsx', 'app/x/page-restored/components/Banner.tsx']});
    // The note names the page by its path among the files it lists.
    const note = fs.readFileSync(path.join(tree, 'app/x/page.html'), 'utf8');
    expect(note).toContain('Page: app/x/page.tsx\n');
    expect(note).toContain('Carried files (2): app/x/page.tsx, components/Banner.tsx');
    expect(note).toContain('edit app/x/page.tsx there instead');
    // The page's own folder still holds the tsconfig.json and the public/
    // images it is rendered with.
    fs.mkdirSync(path.join(tree, 'site/public'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'site/tsconfig.json'), '{"compilerOptions": {"paths": {"@/*": ["./*"]}}}\n');
    fs.writeFileSync(path.join(tree, 'site/public/logo.png'), PNG);
    fs.writeFileSync(path.join(tree, 'site/Note.tsx'), 'export function Note() {\n  return <p>Note by alias</p>;\n}\n');
    fs.writeFileSync(path.join(tree, 'site/page.tsx'), "import {Note} from '@/Note';\nexport default function Page() {\n  return <main><Note /><img src=\"/logo.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const site = runBin(tree, ['experimental', 'export', 'site/page.tsx']);
    expect(site.status).toBe(0);
    const siteHtml = fs.readFileSync(path.join(tree, 'site/page.html'), 'utf8');
    expect(siteHtml).toContain('Note by alias');
    expect(siteHtml).toContain('src="data:image/png;base64,');
    // A page that imports nothing above its own folder is named as it is
    // listed among the files.
    expect(siteHtml).toContain('Page: page.tsx\n');
  }, 60_000);

  it('names an imported *.config.json it does not carry in the warnings, the note and notCarried', () => {
    const tree = path.join(away, 'config-named');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales', unit: 'USD'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import cfg from './chart.config.json';\nexport default function Page() {\n  return <h1>{cfg.title} in {cfg.unit}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.notCarried).toEqual(['chart.config.json']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-carried',
      message:
        "chart.config.json is not carried: its name reads as a tool's configuration, which experimental import never writes. The page shows it, but experimental import cannot give it back. If it holds the page's data, rename it, such as chart-data.json, to carry it. If a tool reads it, move the values the page reads into a file of its own, such as page-data.json.",
    });
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('not-embedded');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).toContain('Sales in USD');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Carried files (1): page.tsx\n  Not carried: chart.config.json (experimental import cannot give them back)\n');
    expect(note).not.toContain('come back exactly');
    expect(note).toContain('It also carries the source of the page, except the files named under "Not carried" below; experimental import gives back the rest.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['chart.config.json']});
  }, 60_000);

  it('names every file it leaves out in the note and notCarried, whatever the reason', () => {
    const tree = path.join(away, 'left-out');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'rows.test.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(path.join(tree, 'fake.png'), 'console.log(1)\n');
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import {rows} from './rows.test';\nimport cfg from './chart.config.json';\nexport default function Page() {\n  return <main><h1>{cfg.title}</h1><p>{rows.join(' ')}</p><img src=\"fake.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect([...run.json.data.notCarried].sort()).toEqual(['chart.config.json', 'fake.png', 'rows.test.ts']);
    const codes = run.json.data.warnings.map((/** @type {any} */ w) => w.code);
    expect(codes.filter((/** @type {string} */ c) => c === 'not-carried')).toHaveLength(1);
    expect(codes.filter((/** @type {string} */ c) => c === 'not-embedded')).toHaveLength(2);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    const note = html.slice(0, html.indexOf('-->'));
    const line = note.split('\n').find(l => l.trim().startsWith('Not carried:'));
    expect(line?.trim().replace(/^Not carried: | \(experimental import cannot give them back\)$/g, '').split(', ').sort()).toEqual([
      'chart.config.json',
      'fake.png',
      'rows.test.ts',
    ]);
    expect(note).not.toContain('come back exactly');
  }, 60_000);

  it('lists notCarried in the text output, as the reverse view lists missing', () => {
    const tree = path.join(away, 'config-named-text');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import cfg from './chart.config.json';\nexport default function Page() {\n  return <h1>{cfg.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, [BIN, 'experimental', 'export', 'page.tsx'], {cwd: tree, env, encoding: 'utf8', timeout: 60_000});
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/notCarried\W+chart\.config\.json/);
    fs.renameSync(path.join(tree, 'chart.config.json'), path.join(tree, 'chart-data.json'));
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import cfg from './chart-data.json';\nexport default function Page() {\n  return <h1>{cfg.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const renamed = spawnSync(process.execPath, [BIN, 'experimental', 'export', 'page.tsx'], {cwd: tree, env, encoding: 'utf8', timeout: 60_000});
    expect(renamed.status).toBe(0);
    expect(renamed.stdout).not.toContain('notCarried');
  }, 60_000);

  it('names a module the page imports from outside the folder it carries from', () => {
    const tree = path.join(away, 'outside-folder');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/helper.ts'), "export const south = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './helper';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    // The module it imports from there, and the one that module imports.
    expect(run.json.data.notCarried).toEqual(['../lib/rows.ts', '../lib/helper.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../lib/rows.ts is not carried: it is outside the folder the render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Render from a folder that holds it, or move it into the page's folder.",
    });
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html).toContain('North South');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: ../lib/rows.ts, ../lib/helper.ts (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    // The import and the record name rows.ts, which is named once; the
    // record also names helper.ts, which only rows.ts imports.
    expect(back.json.data).toMatchObject({exact: false, missing: ['../lib/rows', '../lib/helper.ts']});
    // Rendered from the folder that holds both, the module is carried.
    const whole = runBin(tree, ['experimental', 'export', 'page/page.tsx', '--out', 'whole.html']);
    expect(whole.status).toBe(0);
    expect(whole.json.data).not.toHaveProperty('notCarried');
    expect(whole.json.data.files).toEqual(['page/page.tsx', 'lib/rows.ts', 'lib/helper.ts']);
  }, 60_000);

  it('names a folder the page imports from above the carried folder once on the way back', () => {
    const tree = path.join(away, 'outside-index');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib/rows'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows/index.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['../lib/rows/index.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['../lib/rows']});
  }, 60_000);

  it('names an extensionless JSON import the render leaves out once on the way back', () => {
    const tree = path.join(away, 'extensionless-json');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'site.config.json'), JSON.stringify({title: 'Sales'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import site from './site.config';\nexport default function Page() {\n  return <h1>{site.title}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['site.config.json']);
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['site.config']});
  }, 60_000);

  it('keeps a recorded JSON file that shares its stem with an imported module on the way back', () => {
    const tree = path.join(away, 'outside-stem-json');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows.json'), JSON.stringify(['North', 'South']));
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import data from './rows.json';\nexport const rows: string[] = data;\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.json', '../lib/rows.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    // The import names rows.ts, the file it resolves to first; rows.json is
    // named by itself.
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows.json']);
  }, 60_000);

  it('keeps a recorded folder index beside a same-named module on the way back', () => {
    const tree = path.join(away, 'outside-stem-index');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib/rows'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows/index.ts'), "export const south = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './rows/index';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.ts', '../lib/rows/index.ts']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows/index.ts']);
  }, 60_000);

  it('keeps a recorded image that shares its stem with an imported module on the way back', () => {
    const tree = path.join(away, 'outside-stem');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/rows.tsx'), "export const Rows = () => <img src=\"../lib/rows.png\" alt=\"\" />;\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.png'), PNG);
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {Rows} from '../lib/rows';\nexport default function Page() {\n  return <main><Rows /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect([...run.json.data.notCarried].sort()).toEqual(['../lib/rows.png', '../lib/rows.tsx']);
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect([...back.json.data.missing].sort()).toEqual(['../lib/rows', '../lib/rows.png']);
  }, 60_000);

  it('follows a TypeScript-style .js import in a module from outside the carried folder to its source', () => {
    const tree = path.join(away, 'outside-ts-js');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'lib'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'lib/helper.ts'), "export const south: string = 'South';\n");
    fs.writeFileSync(path.join(tree, 'lib/rows.ts'), "import {south} from './helper.js';\nexport const rows = ['North', south];\n");
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '../lib/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8')).toContain('North South');
    expect(run.json.data.notCarried).toEqual(['../lib/rows.ts', '../lib/helper.ts']);
  }, 60_000);

  it('in a project, tells the reader to move a file from outside the project inside it', () => {
    const tree = path.join(away, 'outside-project');
    fs.mkdirSync(path.join(tree, 'app/src'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'app/package.json'), JSON.stringify({name: 'app', private: true}));
    fs.writeFileSync(path.join(tree, 'shared/rows.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'app/src/page.tsx'),
      "import {rows} from '../../shared/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'app/src'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['../../shared/rows.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../../shared/rows.ts is not carried: it is outside the project's folder, which a render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Move it inside the project's folder.",
    });
  }, 60_000);

  it('names a module the page imports through a path alias from outside the folder it carries from', () => {
    const tree = path.join(away, 'outside-alias');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'shared/rows.ts'), "export const rows = ['North', 'South'];\n");
    fs.writeFileSync(
      path.join(tree, 'page/tsconfig.json'),
      JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'@shared/*': ['../shared/*']}}}),
    );
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import {rows} from '@shared/rows';\nexport default function Page() {\n  return <p>{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.notCarried).toEqual(['../shared/rows.ts']);
    expect(run.json.data.warnings).toContainEqual({
      code: 'not-embedded',
      message:
        "../shared/rows.ts is not carried: it is outside the folder the render carries from, and experimental import writes nothing outside it. The page shows it, but experimental import cannot give it back. Render from a folder that holds it, or move it into the page's folder.",
    });
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html).toContain('North South');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: ../shared/rows.ts (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    // --reverse cannot resolve the alias, but the file records what the
    // render left out, so it names the module as missing.
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: false, missing: ['../shared/rows.ts']});
  }, 60_000);

  it('carries a JSON file and a stylesheet from above the page folder, and names an image from there as not carried', () => {
    const tree = path.join(away, 'above-folder');
    fs.mkdirSync(path.join(tree, 'page'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'data'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'data/rows.json'), JSON.stringify(['North', 'South']));
    fs.writeFileSync(path.join(tree, 'data/site.css'), '.rows { color: teal; }\n');
    fs.writeFileSync(path.join(tree, 'data/dot.png'), PNG);
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import rows from '../data/rows.json';\nimport '../data/site.css';\nexport default function Page() {\n  return <p className=\"rows\">{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page/page.tsx', 'data/rows.json', 'data/site.css']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    expect(run.json.data.warnings).toEqual([]);
    const html = fs.readFileSync(path.join(tree, 'page/page.html'), 'utf8');
    expect(html.slice(0, html.indexOf('-->'))).not.toContain('Not carried');
    const back = runBin(path.join(tree, 'page'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, output: 'page-restored/page/page.tsx'});
    expect(back.json.data).not.toHaveProperty('missing');

    // An image the page shows from there is not carried (only the page's
    // folder's images are), so it is named.
    fs.writeFileSync(
      path.join(tree, 'page/page.tsx'),
      "import rows from '../data/rows.json';\nexport default function Page() {\n  return <p><img src=\"../data/dot.png\" alt=\"\" />{rows.join(' ')}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const shown = runBin(path.join(tree, 'page'), ['experimental', 'export', 'page.tsx', '--out', 'shown.html']);
    expect(shown.status).toBe(0);
    expect(shown.json.data.files).toEqual(['page/page.tsx', 'data/rows.json']);
    expect(shown.json.data.notCarried).toEqual(['data/dot.png']);
    expect(shown.json.data.warnings.map((/** @type {any} */ w) => w.code)).toEqual(['not-embedded']);
  }, 60_000);

  it('names a Sass stylesheet the page imports as not carried', () => {
    const tree = path.join(away, 'sass-import');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'site.scss'), '$c: teal;\np { color: $c; }\n');
    fs.writeFileSync(path.join(tree, 'page.tsx'), "import './site.scss';\nexport default function Page() {\n  return <p>Sales</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.notCarried).toEqual(['site.scss']);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toEqual(['missing-asset']);
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    const note = html.slice(0, html.indexOf('-->'));
    expect(note).toContain('Not carried: site.scss (experimental import cannot give them back)');
    expect(note).not.toContain('come back exactly');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.json.data.exact).toBe(false);
    expect(back.json.data.missing).toEqual(['site.scss']);
  }, 60_000);

  it('carries a config-named file once renamed as its warning says, and gives it back exactly', () => {
    const tree = path.join(away, 'config-renamed');
    fs.mkdirSync(tree, {recursive: true});
    fs.writeFileSync(path.join(tree, 'chart-data.json'), JSON.stringify({title: 'Sales', unit: 'USD'}));
    fs.writeFileSync(
      path.join(tree, 'page.tsx'),
      "import cfg from './chart-data.json';\nexport default function Page() {\n  return <h1>{cfg.title} in {cfg.unit}</h1>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(tree, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx', 'chart-data.json']);
    expect(run.json.data).not.toHaveProperty('notCarried');
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('not-carried');
    const html = fs.readFileSync(path.join(tree, 'page.html'), 'utf8');
    expect(html).not.toContain('Not carried');
    expect(html).toContain('so the page can come back exactly.');
    const back = runBin(tree, ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({exact: true, files: expect.arrayContaining(['page-restored/page.tsx', 'page-restored/chart-data.json'])});
    expect(back.json.data).not.toHaveProperty('missing');
  }, 60_000);

  it('shows a root-relative image from the public/ folder of the folder it runs in, and gives it back there', () => {
    const site = path.join(away, 'public-site');
    fs.mkdirSync(path.join(site, 'public/pics'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/pages/p'), {recursive: true});
    fs.writeFileSync(path.join(site, 'public/pics/shoe.png'), PNG);
    fs.writeFileSync(path.join(site, 'public/pics/bg.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/pages/p/page.css'), '.hero { background: url(/pics/bg.png); }\n');
    fs.writeFileSync(
      path.join(site, 'src/pages/p/page.tsx'),
      "import './page.css';\nconst shoe = {src: '/pics/shoe.png'};\nexport default function Page() {\n  return <main className=\"hero\"><img src={shoe.src} alt=\"Shoe\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
    expect(run.json.data.files).toEqual(expect.arrayContaining(['public/pics/shoe.png', 'public/pics/bg.png']));
    const html = fs.readFileSync(path.join(site, 'src/pages/p/page.html'), 'utf8');
    const markup = html.slice(0, html.indexOf('<script'));
    expect(markup).toContain('alt="Shoe"');
    expect(markup).not.toMatch(/src="\/pics\//);
    expect(markup).toMatch(/<img src="data:image\/png;base64,/);
    expect(markup).not.toContain('url(/pics/bg.png)');
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/pages/p/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    const restored = path.join(site, 'src/pages/p/page-restored');
    expect(fs.readFileSync(path.join(restored, 'public/pics/shoe.png'))).toEqual(PNG);
    expect(fs.readFileSync(path.join(restored, 'public/pics/bg.png'))).toEqual(PNG);
    // The restored folder renders the same page, with its images.
    const again = runBin(restored, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(again.status).toBe(0);
    expect(again.json.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('missing-asset');
  }, 120_000);

  it('reads a root-relative image only from public/: a path that climbs out of it, or a file not there, is named and left as is', () => {
    const site = path.join(away, 'public-climb');
    fs.mkdirSync(path.join(site, 'public'), {recursive: true});
    fs.writeFileSync(path.join(site, 'secret.png'), PNG);
    fs.writeFileSync(path.join(site, 'top.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'page.tsx'),
      'export default function Page() {\n  return <main><img src="/../secret.png" alt="" /><img src="/top.png" alt="" /><img src="/gone.png" alt="" /></main>;\n}\nimport "@astryxdesign/core/astryx.css";\n',
    );
    const run = runBin(site, ['experimental', 'export', 'page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    const missing = run.json.data.warnings.filter((/** @type {any} */ w) => w.code === 'missing-asset').map((/** @type {any} */ w) => w.message);
    expect(missing).toEqual([
      "/../secret.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
      "/top.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
      "/gone.png was not found in public/, where a path from the site's root is read, so it is left as is and will not show.",
    ]);
    const html = fs.readFileSync(path.join(site, 'page.html'), 'utf8');
    expect(html).not.toContain('data:image/png');
  }, 60_000);

  it('names public/ from the page\'s folder in a missing-image warning, also for a stylesheet in another folder', () => {
    const site = path.join(away, 'public-from-page');
    fs.mkdirSync(path.join(site, 'public'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/pages/p'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src/styles'), {recursive: true});
    fs.writeFileSync(path.join(site, 'src/styles/a.css'), '.hero { background: url(/gone-bg.png); }\n');
    fs.writeFileSync(
      path.join(site, 'src/pages/p/page.tsx'),
      "import '../../styles/a.css';\nexport default function Page() {\n  return <main className=\"hero\"><img src=\"/gone.png\" alt=\"\" /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/pages/p/page.tsx']);
    expect(run.status).toBe(0);
    const missing = run.json.data.warnings.filter((/** @type {any} */ w) => w.code === 'missing-asset').map((/** @type {any} */ w) => w.message);
    expect(missing).toEqual(
      expect.arrayContaining([
        "/gone.png was not found in ../../../public/, where a path from the site's root is read, so it is left as is and will not show.",
        "/gone-bg.png was not found in ../../../public/, where a path from the site's root is read, so it is left as is and will not show.",
      ]),
    );
  }, 60_000);

  it('finishes when the folder it runs in is the filesystem root and no public/ is above the page', () => {
    const lone = path.join(away, 'from-root');
    fs.mkdirSync(lone, {recursive: true});
    const page = path.join(lone, 'page.tsx');
    fs.writeFileSync(page, 'export default function Page() {\n  return <main><img src="/none.png" alt="" /></main>;\n}\nimport "@astryxdesign/core/astryx.css";\n');
    const root = path.parse(lone).root;
    const run = runBin(root, ['experimental', 'export', path.relative(root, page), '--out', path.relative(root, path.join(lone, 'page.html'))]);
    expect(run.status).toBe(0);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('missing-asset');
  }, 60_000);

  it('gives back exactly an image the page names with percent-escapes, from public/ and beside the page', () => {
    const site = path.join(away, 'escaped-names');
    fs.mkdirSync(path.join(site, 'public/pics'), {recursive: true});
    fs.mkdirSync(path.join(site, 'src'), {recursive: true});
    fs.writeFileSync(path.join(site, 'public/pics/a b.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/c d.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'src/page.tsx'),
      'export default function Page() {\n  return <main><img src="/pics/a%20b.png" alt="A" /><img src="./c%20d.png" alt="C" /></main>;\n}\nimport \'@astryxdesign/core/astryx.css\';\n',
    );
    const run = runBin(site, ['experimental', 'export', 'src/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(expect.arrayContaining(['public/pics/a b.png', 'src/c d.png']));
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    expect(back.json.data.missing).toBeUndefined();
  }, 120_000);

  it('carries and gives back exactly an image the page loads with import() on a click, its name as written', () => {
    const site = path.join(away, 'lazy-image');
    fs.mkdirSync(path.join(site, 'src'), {recursive: true});
    fs.writeFileSync(path.join(site, 'src/big.png'), PNG);
    fs.writeFileSync(path.join(site, 'src/Screen%20Shot.png'), PNG);
    fs.writeFileSync(
      path.join(site, 'src/page.tsx'),
      "import {useState} from 'react';\nexport default function Page() {\n  const [src, setSrc] = useState('');\n  return <main><button onClick={() => { import('./big.png').then(m => setSrc(m.default)); import('./Screen%20Shot.png'); }}>Show</button>{src ? <img src={src} alt=\"Big\" /> : null}</main>;\n}\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(site, ['experimental', 'export', 'src/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(expect.arrayContaining(['big.png', 'Screen%20Shot.png']));
    const back = runBin(site, ['experimental', 'export', '--reverse', 'src/page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data.exact).toBe(true);
    expect(back.json.data.missing).toBeUndefined();
  }, 120_000);

  it('keeps a page in a folder named like ..x whole: a file above it stays out, and is named', () => {
    const tree = path.join(away, 'dots');
    fs.mkdirSync(path.join(tree, '..x'), {recursive: true});
    fs.mkdirSync(path.join(tree, 'shared'), {recursive: true});
    fs.writeFileSync(path.join(tree, 'shared/Banner.tsx'), 'export function Banner() {\n  return <p>Banner above</p>;\n}\n');
    fs.writeFileSync(path.join(tree, '..x/page.tsx'), "import {Banner} from '../shared/Banner';\nexport default function Page() {\n  return <main><Banner /></main>;\n}\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(tree, ['experimental', 'export', '..x/page.tsx']);
    expect(run.status).toBe(0);
    expect(run.json.data.files).toEqual(['page.tsx']);
    expect(run.json.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('not-embedded');
    const back = runBin(path.join(tree, '..x'), ['experimental', 'export', '--reverse', 'page.html']);
    expect(back.status).toBe(0);
    expect(back.json.data).toMatchObject({mode: 'embedded', output: 'page-restored/page.tsx'});
  }, 60_000);

  describe('a served package whose subpath exports one condition', () => {
    /** @type {string} */
    let set;
    /** @type {string} */
    let page;
    beforeAll(() => {
      set = path.join(away, 'served-conditions');
      const nm = path.join(set, 'node_modules');
      for (const name of ['react', 'react-dom']) {
        const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
        fs.mkdirSync(nm, {recursive: true});
        fs.cpSync(target, path.join(nm, name), {recursive: true, dereference: true});
      }
      const pkg = path.join(nm, 'demo-conditions');
      fs.mkdirSync(path.join(pkg, 'themes'), {recursive: true});
      fs.writeFileSync(
        path.join(pkg, 'package.json'),
        JSON.stringify({
          name: 'demo-conditions',
          type: 'module',
          exports: {
            './themes/demo': {import: './themes/demo.js'},
            './legacy': {require: './legacy.cjs'},
          },
        }),
      );
      fs.writeFileSync(path.join(pkg, 'themes', 'demo.js'), "export const label = 'from the import condition';\n");
      fs.writeFileSync(path.join(pkg, 'legacy.cjs'), "exports.label = 'from the require condition';\n");
      fs.mkdirSync(path.join(set, 'core'), {recursive: true});
      fs.writeFileSync(path.join(set, 'core', 'package.json'), '{"name":"@astryxdesign/core"}');
      page = path.join(away, 'served-conditions-page');
      fs.mkdirSync(page, {recursive: true});
    });
    /** @param {string} name @param {string} spec */
    const exportOf = async (name, spec) => {
      fs.writeFileSync(
        path.join(page, `${name}.jsx`),
        `import {label} from '${spec}';\nexport default function Page() {\n  return <p>{label}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n`,
      );
      const {renderPage} = await import('../../foundation/render/render-page.mjs');
      try {
        const rendered = await renderPage(path.join(page, `${name}.jsx`), {
          served: {dir: path.join(set, 'core'), integrations: ['demo-conditions']},
          markupOnly: true,
        });
        return {html: rendered.html};
      } catch (e) {
        return {code: /** @type {any} */ (e).code, message: /** @type {any} */ (e).message};
      }
    };

    it('loads a subpath exported only under import', async () => {
      const result = /** @type {any} */ (await exportOf('import-only', 'demo-conditions/themes/demo'));
      expect(result.code, JSON.stringify(result)).toBeUndefined();
      expect(result.html).toContain('from the import condition');
    }, 60_000);

    it('loads a subpath exported only under require as before', async () => {
      const result = /** @type {any} */ (await exportOf('require-only', 'demo-conditions/legacy'));
      expect(result.code, JSON.stringify(result)).toBeUndefined();
      expect(result.html).toContain('from the require condition');
    }, 60_000);

    it('keeps the answer for a subpath the package does not export', async () => {
      const result = /** @type {any} */ (await exportOf('missing', 'demo-conditions/themes/none'));
      expect(result).toEqual({
        code: 'ERR_RENDER_MISSING_DEPENDENCY',
        message: 'The page imports demo-conditions, which is not installed',
      });
    }, 60_000);
  });

  it('loads one React outside a project, even when the folder holds its own copy', () => {
    const sub = path.join(away, 'own-react');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(
      path.join(sub, 'page.jsx'),
      "import {useState} from 'react';\nimport {TextInput} from '@astryxdesign/core';\nexport default function Page() {\n  const [v] = useState('typed');\n  return <TextInput label=\"Name\" value={v} onChange={() => {}} />;\n}\n",
    );
    const run = runBin(sub, ['experimental', 'export', 'page.jsx']);
    expect(run.status).toBe(0);
    expect(fs.readFileSync(path.join(sub, 'page.html'), 'utf8')).toContain('typed');
  }, 60_000);

  it('gives a library in the folder the same React, as CommonJS and as an ES module', () => {
    const sub = path.join(away, 'react-app');
    const nm = path.join(sub, 'node_modules');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(nm, {recursive: true});
      fs.cpSync(target, path.join(nm, name), {recursive: true, dereference: true});
    }
    fs.mkdirSync(path.join(nm, 'hook-cjs'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'package.json'), '{"name":"hook-cjs","main":"index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-cjs', 'index.js'), "const {useState} = require('react');\nexports.useCjs = () => useState('cjs-hook')[0];\n");
    fs.mkdirSync(path.join(nm, 'hook-esm'), {recursive: true});
    fs.writeFileSync(path.join(nm, 'hook-esm', 'package.json'), '{"name":"hook-esm","type":"module","exports":"./index.js"}');
    fs.writeFileSync(path.join(nm, 'hook-esm', 'index.js'), "import {useState} from 'react';\nexport const useEsm = () => useState('esm-hook')[0];\n");
    const body = "  const a = useCjs();\n  const b = useEsm();\n";
    fs.writeFileSync(
      path.join(sub, 'plain.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nexport default function Page() {\n${body}  return <p>{a} {b}</p>;\n}\nimport '@astryxdesign/core/astryx.css';\n`,
    );
    fs.writeFileSync(
      path.join(sub, 'core.jsx'),
      `import {useCjs} from 'hook-cjs';\nimport {useEsm} from 'hook-esm';\nimport {Button} from '@astryxdesign/core';\nexport default function Page() {\n${body}  return <Button label={a + ' ' + b} />;\n}\n`,
    );
    for (const page of ['plain', 'core']) {
      const run = runBin(sub, ['experimental', 'export', `${page}.jsx`]);
      expect(run.status).toBe(0);
      const html = fs.readFileSync(path.join(sub, `${page}.html`), 'utf8');
      expect(html).toContain('cjs-hook');
      expect(html).toContain('esm-hook');
    }
  }, 90_000);

  it('says the CLI runs without Core only for a render outside a project', async () => {
    const sub = path.join(away, 'no-core');
    for (const name of ['react', 'react-dom']) {
      const target = path.dirname(createRequire(path.join(CLI_DIR, '../core/package.json')).resolve(`${name}/package.json`));
      fs.mkdirSync(path.join(sub, 'node_modules'), {recursive: true});
      fs.cpSync(target, path.join(sub, 'node_modules', name), {recursive: true, dereference: true});
    }
    fs.writeFileSync(path.join(sub, 'page.jsx'), 'export default () => <p>no core</p>;\nimport "@astryxdesign/core/astryx.css";\n');
    // In a fresh process without the test runner's NODE_PATH, which would reach this repository's Core.
    const script = `
const {renderPage} = await import(${JSON.stringify(path.join(CLI_DIR, 'foundation/render/render-page.mjs'))});
const entry = ${JSON.stringify(path.join(sub, 'page.jsx'))};
const textOf = page => page.warnings.find(w => w.code === 'no-astryx-styles')?.message;
const inside = textOf(await renderPage(entry, {served: null, markupOnly: true}));
const outside = textOf(await renderPage(entry, {served: {dir: ${JSON.stringify(path.join(sub, 'no-such-core'))}, integrations: []}, markupOnly: true}));
console.log(JSON.stringify({inside, outside}));
`;
    const {NODE_PATH: _, ...env} = process.env;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], {cwd: sub, env, encoding: 'utf8', timeout: 60_000});
    const {inside, outside} = JSON.parse(run.stdout.trim().split('\n').pop() ?? '{}');
    expect(inside).toBe('@astryxdesign/core is not installed where the page is, so the page has no Astryx styles; install it, or render from inside the project.');
    expect(outside).toContain('and the CLI runs without one');
  }, 60_000);

  it("compiles a page's StyleX that reads Core's theme variables, with the names Core's stylesheet defines", () => {
    const sub = path.join(away, 'tokens');
    fs.mkdirSync(sub, {recursive: true});
    fs.writeFileSync(
      path.join(sub, 'page.tsx'),
      [
        "import * as stylex from '@stylexjs/stylex';",
        "import {colorVars, spacingVars} from '@astryxdesign/core/theme/tokens.stylex';",
        "import {Text} from '@astryxdesign/core/Text';",
        '',
        "const styles = stylex.create({box: {backgroundColor: colorVars['--color-background-surface'], padding: spacingVars['--spacing-2']}});",
        '',
        'export default function Page() {',
        '  return <div {...stylex.props(styles.box)}><Text>Themed box</Text></div>;',
        '}',
        '',
      ].join('\n'),
    );
    const run = runBin(sub, ['experimental', 'export', 'page.tsx']);
    expect(run.status, JSON.stringify(run.json)).toBe(0);
    const html = fs.readFileSync(path.join(sub, 'page.html'), 'utf8');
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    for (const name of ['--color-background-surface', '--spacing-2']) {
      expect(style).toContain(`var(${name})`);
      expect(style).toContain(`${name}:`);
    }
  }, 60_000);

  it('still names a package the CLI does not carry as not installed', () => {
    fs.writeFileSync(path.join(away, 'dep.jsx'), "import x from 'not-a-real-package-xyz';\nexport default () => <p>{String(x)}</p>;\nimport '@astryxdesign/core/astryx.css';\n");
    const run = runBin(away, ['experimental', 'export', 'dep.jsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
  }, 60_000);

  it('names every package the page and its own modules need in one refusal, with no install line outside a project', () => {
    fs.writeFileSync(
      path.join(away, 'many-deps.tsx'),
      "import {Chart} from './many-deps-chart';\nimport icon from '@not-real-xyz/icons/solid';\nimport type {T} from 'not-real-types-xyz';\nexport default () => <Chart icon={icon} />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    fs.writeFileSync(
      path.join(away, 'many-deps-chart.tsx'),
      "import {Line} from 'not-real-charts-xyz';\nimport fs from 'node:fs';\nexport const Chart = ({icon}: {icon: unknown}) => <Line icon={icon} fs={fs} />;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'many-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    // No package.json holds this folder, so an install would make it a
    // project: the message names the packages for the project that uses the
    // page, with no install line.
    expect(run.json.error).toBe(
      'The page imports @not-real-xyz/icons and not-real-charts-xyz, which are not installed. Install them in the project that uses this page.',
    );
    expect(run.json.suggestions ?? []).toEqual([]);
  }, 60_000);

  it('counts only imports a TypeScript module uses as values, and a missing package image with the rest', () => {
    fs.writeFileSync(
      path.join(away, 'used-deps.tsx'),
      "import {Metadata} from 'not-real-next-xyz';\nimport {unused} from 'not-real-unused-xyz';\nimport {size} from './used-deps-shapes';\nimport logo from 'not-real-brand-xyz/logo.png';\nimport mark from 'not-real-mark-xyz/mark.svg';\nexport const metadata: Metadata = {title: 'x'};\nexport default () => <img src={logo} data-mark={mark} width={size} alt=\"\" />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    fs.writeFileSync(
      path.join(away, 'used-deps-shapes.ts'),
      "import {Model} from 'not-real-model-xyz';\nexport type Shape = Model;\nexport const twice = (Model: number) => Model * 2;\nexport const size = 1;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'used-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports not-real-brand-xyz and not-real-mark-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it('counts every import of a JavaScript module, used or not, as JavaScript loads them all', () => {
    fs.writeFileSync(
      path.join(away, 'js-deps.jsx'),
      "import {unused} from 'not-real-unused-js-xyz';\nimport {Line} from 'not-real-line-js-xyz';\nexport default () => <Line />;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(away, ['experimental', 'export', 'js-deps.jsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports not-real-line-js-xyz and not-real-unused-js-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it('counts a re-export of a package whose type the module also imports without `import type`', () => {
    fs.writeFileSync(
      path.join(away, 're-export-deps.tsx'),
      "import {Shape} from 'not-real-shapes-xyz';\nexport {make} from 'not-real-shapes-xyz';\nexport const shape: Shape | null = null;\nexport default () => <p>x</p>;\nimport '@astryxdesign/core/astryx.css';\n",
    );
    const run = runBin(away, ['experimental', 'export', 're-export-deps.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe('The page imports not-real-shapes-xyz, which is not installed. Install it in the project that uses this page.');
  }, 60_000);

  it('names an Astryx package the package set does not hold with the rest, not one at a time', () => {
    fs.writeFileSync(
      path.join(away, 'unheld.tsx'),
      "import {Line} from 'not-real-charts-xyz';\nimport {x} from '@astryxdesign/not-a-real-package-xyz';\nexport default () => <Line x={x} />;\n",
    );
    const run = runBin(away, ['experimental', 'export', 'unheld.tsx']);
    expect(run.json.code).toBe('ERR_RENDER_MISSING_DEPENDENCY');
    expect(run.json.error).toBe(
      'The page imports @astryxdesign/not-a-real-package-xyz and not-real-charts-xyz, which are not installed. Install them in the project that uses this page.',
    );
  }, 60_000);

  it("uses only the project's own packages inside a project", async () => {
    const {renderPage} = await import('../../foundation/render/render-page.mjs');
    const page = await renderPage(path.join(dir, 'page.tsx'), {
      served: {dir: path.join(away, 'no-such-core'), integrations: []},
    });
    expect(page.fromSet).toEqual([]);
    expect(page.stylesheets).toContain('@astryxdesign/core/astryx.css');
  }, 60_000);
});

describe('render(): media queries asked in JavaScript', () => {
  it("names each media query the page asks with Core's hook or matchMedia, and says to fold the layout with CSS", async () => {
    put(
      'screen-query.tsx',
      `import {useEffect, useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core/hooks';
function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(window.matchMedia(\`(prefers-color-scheme: dark)\`).matches), []);
  return dark;
}
export default function Page() {
  const narrow = useMediaQuery('(max-width: 768px)');
  const alsoNarrow = useMediaQuery('(max-width: 768px)');
  const dark = useDark();
  return <main>{narrow && alsoNarrow ? 'One column' : 'Two columns'}{dark ? ' dark' : ''}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query.tsx', {cwd: dir}));
    const warnings = result.data.warnings.filter((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toBe(
      "The page asks matchMedia('(prefers-color-scheme: dark)'), useMediaQuery('(max-width: 768px)') in JavaScript: this file paints the server answer first and asks again when its script runs, and a viewer that blocks scripts keeps the server answer. To fit every screen from the first paint, fold the layout with CSS: Grid columns={{minWidth}}, or a StyleX @media or @container style.",
    );
  }, 60_000);

  it("names the hook imported from Core's root entry, and an optional matchMedia call", async () => {
    put(
      'screen-query-root.tsx',
      `import {useEffect, useState} from 'react';
import {useMediaQuery} from '@astryxdesign/core';
export default function Page() {
  const wide = useMediaQuery('(min-width: 1024px)');
  const [motion, setMotion] = useState(true);
  useEffect(() => setMotion(!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches), []);
  return <main>{wide ? 'Wide' : 'Narrow'}{motion ? '' : ' still'}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query-root.tsx', {cwd: dir}));
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warning?.message).toContain("The page asks useMediaQuery('(min-width: 1024px)'), matchMedia('(prefers-reduced-motion: reduce)') in JavaScript");
  }, 60_000);

  it("names the hook called through a namespace import of Core, and a call with no query, without failing the render", async () => {
    put(
      'screen-query-namespace.tsx',
      `import * as core from '@astryxdesign/core';
function never() {
  return [window.matchMedia?.(), matchMedia(), core.useMediaQuery()];
}
export default function Page() {
  const narrow = core.useMediaQuery('(max-width: 600px)');
  return <main>{narrow ? 'Narrow' : 'Wide'}{typeof never}</main>;
}
`,
    );
    const result = /** @type {any} */ (await render('screen-query-namespace.tsx', {cwd: dir}));
    expect(result.type).toBe('render.page');
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'screen-query');
    expect(warning?.message).toContain("The page asks matchMedia(), useMediaQuery(), useMediaQuery('(max-width: 600px)') in JavaScript");
  }, 60_000);

  it('says nothing for a page that asks no media query, or calls a function of its own named like the hook', async () => {
    put(
      'no-screen-query.tsx',
      `function useMediaQuery(query: string) {
  return query.length > 100;
}
export default function Page() {
  return <main>{useMediaQuery('(max-width: 768px)') ? 'narrow' : 'wide'}</main>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('no-screen-query.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('screen-query');
  }, 60_000);
});

describe('render(): charts', () => {
  const DATA = "const data = [{d: 'a', v: 1}, {d: 'b', v: 3}, {d: 'c', v: 2}];";
  /**
   * Each drawing in a page, in order: its picture's size and its markup.
   * @param {string} html
   */
  const drawingsIn = html =>
    html
      .split(/(?=<div\b[^>]*class="recharts-wrapper")/)
      .slice(1)
      .map(part => {
        const surface = /<svg\b(?![^>]*legend icon)[^>]*class="recharts-surface"[^>]*>/.exec(part)?.[0] ?? '';
        const [, width, height] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(surface) ?? [];
        return {width: Number(width), height: Number(height), html: part};
      });
  /**
   * Each container chart's drawings, by the container's place in the page.
   * @param {string} html
   */
  const containersIn = html =>
    html
      .split(/(?=<div\b[^>]*class="recharts-responsive-container")/)
      .slice(1)
      .map(part => drawingsIn(part).slice(0, CHART_WIDTHS.length));

  it('draws a chart sized by its container at each width, and a chart of fixed size once', async () => {
    put(
      'charts.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={300} height={120} data={data}><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts.html'), 'utf8');
    expect(html).toContain('recharts-line-curve');
    expect(html).toContain('recharts-bar-rectangle');
    // The container is drawn at each width, all 200 pixels high, in a box
    // with the size the container gives itself in a browser.
    const [container] = containersIn(html);
    expect(container.map(d => [d.width, d.height])).toEqual(CHART_WIDTHS.map(w => [w, 200]));
    expect(html).toContain('<div data-astryx-chart-widths="" style="width:100%;height:200px" class="recharts-responsive-container">');
    // The chart of fixed size is drawn once, as its props give it.
    expect(drawingsIn(html).map(d => [d.width, d.height]).slice(-1)).toEqual([[300, 120]]);
    expect(html).toContain('@container (width <= 71px)');
    expect(html).not.toContain('<astryx-chart');
  }, 60_000);

  it('draws a chart that fills its box at the height the box states', async () => {
    put(
      'charts-box.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <div style={{height: 280}}>
        <ResponsiveContainer width="100%" height="100%"><LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart></ResponsiveContainer>
      </div>
      <section>
        <ResponsiveContainer width="100%" height="50%"><LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /></LineChart></ResponsiveContainer>
      </section>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-box.tsx', {cwd: dir});
    const [fills, unstated] = containersIn(fs.readFileSync(path.join(dir, 'charts-box.html'), 'utf8'));
    expect(new Set(fills.map(d => d.height))).toEqual(new Set([280]));
    // A box that states no height gives none to share: the chart is drawn
    // 300 high and fits the box a browser gives it.
    expect(new Set(unstated.map(d => d.height))).toEqual(new Set([300]));
  }, 60_000);

  it('gives each drawing of a container chart its own ids, so a gradient the page defines in it fills every drawing', async () => {
    put(
      'charts-gradient.tsx',
      `import {ResponsiveContainer, AreaChart, Area, XAxis} from 'recharts';
${DATA}
export default function Page() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data}>
        <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36c" /><stop offset="100%" stopColor="#36c" stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="d" /><Area dataKey="v" fill="url(#fade)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-gradient.tsx', {cwd: dir});
    const [container] = containersIn(renderedMarkupOf(fs.readFileSync(path.join(dir, 'charts-gradient.html'), 'utf8')) ?? '');
    for (const {width, html: part} of container) {
      expect(part).toMatch(new RegExp(`<linearGradient\\b[^>]*\\bid="fade-chart0-at-${width}"`));
      expect(part).toContain(`fill="url(#fade-chart0-at-${width})"`);
      expect(part).not.toMatch(/id="fade"|url\(#fade\)/);
    }
  }, 60_000);

  it("keeps room for a chart's legend where its props place it, and puts a container chart's legend inside its picture", async () => {
    put(
      'charts-legend.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, Legend} from 'recharts';
${DATA}
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      </ResponsiveContainer>
      <LineChart width={400} height={200} data={data}><XAxis dataKey="d" /><Line dataKey="v" /><Legend /></LineChart>
      <LineChart width={550} height={220} data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Visits" /><Legend layout="vertical" align="right" verticalAlign="middle" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Wins" /><Legend layout="vertical" align="left" verticalAlign="bottom" /></LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}><XAxis dataKey="d" /><Line dataKey="v" name="Bold" /><Legend wrapperStyle={{fontSize: 12, fontWeight: 700}} /></LineChart>
      </ResponsiveContainer>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-legend.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    const html = fs.readFileSync(path.join(dir, 'charts-legend.html'), 'utf8');
    /** @param {string} part */
    const axis = part => {
      const line = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(part)?.[0] ?? '';
      return {y: Number(/\by1="([\d.]+)"/.exec(line)?.[1]), x2: Number(/\bx2="([\d.]+)"/.exec(line)?.[1])};
    };
    /** @param {string} part */
    const legendBox = part => {
      const tag = /<foreignObject\b[^>]*>/.exec(part)?.[0] ?? '';
      /** @param {string} name */
      const n = name => Number(new RegExp(`\\b${name}="([\\d.]+)"`).exec(tag)?.[1]);
      return {x: n('x'), y: n('y'), width: n('width'), height: n('height')};
    };
    const fixed = drawingsIn(html);
    const [bottom, right, left, styled] = containersIn(html);
    const wide = bottom.find(d => d.width === 960);
    // Each chart keeps a row for a bottom legend: 200 - 5 - 24 - 30 = 141.
    expect(axis(/** @type {any} */ (wide).html).y).toBe(141);
    expect(axis(fixed.find(d => d.width === 400)?.html ?? '').y).toBe(141);
    // A container chart's legend sits in that row, inside the picture, so it
    // scales with the drawing and never covers it.
    expect(legendBox(/** @type {any} */ (wide).html)).toEqual({x: 5, y: 200 - 5 - 24, width: 950, height: 24});
    expect(/** @type {any} */ (wide).html).toMatch(/<foreignObject\b[^>]*><div style="width:100%" class="recharts-legend-wrapper">/);
    // A legend at the side keeps room there: the plot ends before it, and
    // the legend sits at that edge, at the height recharts gives it.
    const sided = /** @type {any} */ (right.find(d => d.width === 960));
    expect(axis(sided.html).x2).toBeLessThan(960 - 40);
    const box = legendBox(sided.html);
    expect(box.x + box.width).toBe(960 - 5);
    const low = legendBox(/** @type {any} */ (left.find(d => d.width === 960)).html);
    expect(low.x).toBe(5);
    expect(low.y + low.height).toBe(220 - 5);
    // Inside the picture a legend keeps the rest of its own style.
    const styledLegend = /<div style="([^"]*)" class="recharts-legend-wrapper">/.exec(/** @type {any} */ (styled.find(d => d.width === 960)).html)?.[1];
    expect(styledLegend).toContain('font-size:12px');
    expect(styledLegend).toContain('font-weight:700');
    expect(styledLegend).toContain('width:100%');
    expect(styledLegend).not.toMatch(/position|left|bottom/);
    // A chart of fixed size keeps its legend in the layer recharts puts it in.
    expect(fixed.find(d => d.width === 550)?.html).not.toContain('<foreignObject');
    expect(html).not.toContain('data-legend-side');
  }, 60_000);

  it("draws a chart's parts in the React context the page gives them", async () => {
    put(
      'charts-context.tsx',
      `import {createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  const units = useContext(Units);
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {units}</text>;
}
export default function Page() {
  return (
    <Units.Provider value="km">
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </Units.Provider>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-context.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-context.html'), 'utf8');
    expect(html).toContain('a km');
    expect(html).not.toContain('a items');
  }, 60_000);

  it('draws inside a page that uses Core scrolling components, so context still reaches the chart', async () => {
    put(
      'charts-core.tsx',
      `import {createContext, useContext} from 'react';
import {ScrollableArea} from '@astryxdesign/core/ScrollableArea';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  console.log('rendered once');
  return (
    <Units.Provider value="km">
      <ScrollableArea>
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </ScrollableArea>
    </Units.Provider>
  );
}
`,
    );
    const result = /** @type {any} */ (await render('charts-core.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-core.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
    // What the page prints is reported once, from the server render.
    const printed = result.data.warnings.filter((/** @type {any} */ w) => w.code === 'page-output');
    expect(printed.filter((/** @type {any} */ w) => w.message.includes('rendered once'))).toHaveLength(1);
  }, 60_000);

  it("logs no render timings while it draws a chart, so a chart's props are never copied into them", async () => {
    put(
      'charts-timings.tsx',
      `import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
// React's development build logs each render with console.timeStamp when it can.
let timings = 0;
const timeStamp = console.timeStamp;
console.timeStamp = (...args: any[]) => {
  timings += 1;
  return timeStamp?.apply(console, args);
};
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} timings {timings}</text>;
}
function OnlyOnServer() {
  // Throws once a document exists, so each chart is drawn by itself, one after the other.
  if (typeof document !== 'undefined') throw new Error('drawn alone');
  return null;
}
export default function Page() {
  return (
    <div>
      <OnlyOnServer />
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-timings.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-timings.html'), 'utf8');
    expect(html.match(/a timings \d+/g)).toEqual(['a timings 0', 'a timings 0']);
  }, 60_000);

  it('says so when it draws each chart by itself', async () => {
    put(
      'charts-alone.tsx',
      `import {BarChart, Bar} from 'recharts';
${DATA}
function OnlyOnServer() {
  // Throws only once a document exists, so the page draws on the server but not again.
  if (typeof document !== 'undefined') throw new Error('no second draw');
  return null;
}
export default function Page() {
  return <div><OnlyOnServer /><BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart></div>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-alone.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-alone.html'), 'utf8');
    expect(html).toContain('recharts-bar-rectangle');
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('each chart was drawn by itself');
  }, 60_000);

  it('draws charts as the first render gives them, not as the page\'s effects change it', async () => {
    put(
      'charts-effects.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
export default function Page() {
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => setRows(['order one']), []);
  return (
    <div>
      <p>{rows.length === 0 ? 'No orders yet' : rows.join(', ')}</p>
      {rows.length === 0 ? null : <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>}
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effects.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effects.html'), 'utf8');
    expect(html).toContain('No orders yet');
    expect(html.match(/<svg[^>]*class="recharts-surface"/g)).toHaveLength(1);
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain('once its effects ran');
  }, 60_000);

  it('draws a chart as the first render gave it when an effect changes state a closure in it reads', async () => {
    put(
      'charts-effect-closure.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'Mon', v: 1}, {d: 'Tue', v: 2}];
export default function Page() {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return (
    <div>
      <p>Unit: {unit}</p>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tickFormatter={(v: string) => v + ' ' + unit} /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-closure.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-closure.html'), 'utf8');
    expect(html).toContain('Unit: items');
    expect(html).toContain('Mon items');
    expect(html).not.toContain('Mon km');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('A component that makes a chart rendered again');
  }, 60_000);

  it('names a re-render as the cause when a chart\'s maker only re-renders in an effect', async () => {
    put(
      'charts-effect-mounted.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar} from 'recharts';
const data = [{v: 1}, {v: 2}];
export default function Page() {
  const [, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return <BarChart width={300} height={150} data={data}><Bar dataKey="v" /></BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-mounted.tsx', {cwd: dir}));
    const message = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message ?? '';
    expect(message).toContain('A component that makes a chart rendered again');
    expect(message).not.toContain('changed its charts');
  }, 60_000);

  it('keeps first-render data and props, and lets a context an effect changes reach the chart', async () => {
    // The guide promises a chart's data and props from the first render; a
    // value its parts read from a context that an effect changes may show its
    // later value.
    put(
      'charts-effect-provider.tsx',
      `import {createContext, useContext, useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
const data = [{d: 'a', v: 1}, {d: 'b', v: 2}];
const Units = createContext('items');
function UnitsProvider({children}: {children: any}) {
  const [unit, setUnit] = useState('items');
  useEffect(() => setUnit('km'), []);
  return <Units.Provider value={unit}><p>Unit: {unit}</p>{children}</Units.Provider>;
}
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <UnitsProvider>
      <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
    </UnitsProvider>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-effect-provider.tsx', {cwd: dir});
    const html = renderedMarkupOf(fs.readFileSync(path.join(dir, 'charts-effect-provider.html'), 'utf8')) ?? '';
    expect(html).toContain('Unit: items');
    expect(html.match(/\brecharts-bar-rectangle\b(?!s)/g)).toHaveLength(2);
    expect(html).toMatch(/a (items|km)/);
  }, 60_000);

  it('draws a chart with the data of the first render when an effect replaces it', async () => {
    put(
      'charts-effect-data.tsx',
      `import {useEffect, useState} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
export default function Page() {
  const [data, setData] = useState([{d: 'first', v: 1}]);
  useEffect(() => setData([{d: 'later', v: 2}]), []);
  return <BarChart width={300} height={150} data={data}><XAxis dataKey="d" /><Bar dataKey="v" /></BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-effect-data.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-effect-data.html'), 'utf8');
    expect(html).toContain('>first<');
    expect(html).not.toContain('>later<');
    expect(result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size')?.message).toContain('once its effects ran');
  }, 60_000);

  it('keeps room for a legend that wraps onto more rows', async () => {
    put(
      'charts-wrap.tsx',
      `import {LineChart, Line, XAxis, Legend} from 'recharts';
const data = [{d: 'Mon', a: 1, b: 2, c: 3, e: 4, f: 5}, {d: 'Tue', a: 2, b: 3, c: 1, e: 2, f: 3}];
export default function Page() {
  return (
    <LineChart width={480} height={240} data={data}>
      <XAxis dataKey="d" />
      <Line dataKey="a" name="Northern region" /><Line dataKey="b" name="Southern region" />
      <Line dataKey="c" name="Eastern region" /><Line dataKey="e" name="Western region" />
      <Line dataKey="f" name="Central region" />
      <Legend />
    </LineChart>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-wrap.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-wrap.html'), 'utf8');
    const axis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(html)?.[0] ?? '';
    // Five names of about 120 px each wrap into two rows in 470 px, so the
    // axis sits two legend rows up: 240 - 5 - 48 - 30 = 157.
    expect(Number(/\by1="([\d.]+)"/.exec(axis)?.[1])).toBe(157);
    // A container chart drawn 480 wide keeps the same room.
    put('charts-wrap-rc.tsx', fs.readFileSync(path.join(dir, 'charts-wrap.tsx'), 'utf8')
      .replace("import {LineChart,", "import {ResponsiveContainer, LineChart,")
      .replace('<LineChart width={480} height={240} data={data}>', '<ResponsiveContainer width="100%" height={240}><LineChart data={data}>')
      .replace('</LineChart>', '</LineChart></ResponsiveContainer>'));
    await render('charts-wrap-rc.tsx', {cwd: dir});
    const rc = fs.readFileSync(path.join(dir, 'charts-wrap-rc.html'), 'utf8');
    const at480 = drawingsIn(rc).find(d => d.width === 480)?.html ?? '';
    const rcAxis = /<line\b[^>]*class="recharts-cartesian-axis-line"[^>]*>/.exec(at480)?.[0] ?? '';
    expect(Number(/\by1="([\d.]+)"/.exec(rcAxis)?.[1])).toBe(157);
    expect(rc).toContain('recharts-legend-wrapper');
  }, 60_000);

  it('lays out axis labels as a browser does: the last label stays inside, and crowded labels thin out', async () => {
    const times = Array.from({length: 25}, (_, i) => `Apr ${1 + Math.floor((14 + i) / 24)} ${String((14 + i) % 24).padStart(2, '0')}:00`);
    const cats = Array.from({length: 24}, (_, i) => `Category ${String(i + 1).padStart(2, '0')}`);
    put(
      'charts-axis.tsx',
      `import {ResponsiveContainer, LineChart, Line, XAxis, BarChart, Bar} from 'recharts';
const times = ${JSON.stringify(times)}.map((t, i) => ({t, v: i}));
const cats = ${JSON.stringify(cats)}.map((c, i) => ({c, v: i}));
export default function Page() {
  return (
    <div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={times}><XAxis dataKey="t" /><Line dataKey="v" /></LineChart>
      </ResponsiveContainer>
      <BarChart width={400} height={200} data={cats}><XAxis dataKey="c" /><Bar dataKey="v" /></BarChart>
    </div>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    await render('charts-axis.tsx', {cwd: dir});
    const html = fs.readFileSync(path.join(dir, 'charts-axis.html'), 'utf8');
    /** @param {string} part */
    const ticksIn = part =>
      [...part.matchAll(/<text\b([^>]*class="recharts-text recharts-cartesian-axis-tick-value"[^>]*)>\s*<tspan[^>]*>([^<]*)/g)].map(m => ({
        x: Number(/\bx="([\d.]+)"/.exec(m[1])?.[1]),
        anchor: /text-anchor="(\w+)"/.exec(m[1])?.[1],
        text: m[2],
      }));
    const drawings = drawingsIn(html);
    // In each drawing of the container chart, the last label stays inside:
    // an 11-character label at 14 px is about 92 wide. A drawing too narrow
    // for one label shows none, as a browser that narrow does.
    for (const {width, html: part} of drawings.filter(d => d.width !== 400)) {
      const timeTicks = ticksIn(part).filter(t => t.text.startsWith('Apr'));
      const last = timeTicks[timeTicks.length - 1];
      if (width < 240 && !last) continue;
      expect(last.anchor).toBe('middle');
      expect(last.x + Math.round(last.text.length * 14 * 0.6) / 2).toBeLessThanOrEqual(width);
      expect(timeTicks.length).toBeLessThan(25);
    }
    // A narrower drawing shows fewer labels, as a narrower browser does.
    const count = (/** @type {number} */ w) => ticksIn(drawings.find(d => d.width === w)?.html ?? '').length;
    expect(count(339)).toBeLessThan(count(1358));
    const ticks = ticksIn(drawings.find(d => d.width === 400)?.html ?? '');
    const catTicks = ticks.filter(t => t.text.startsWith('Category'));
    expect(catTicks.length).toBeGreaterThan(1);
    expect(catTicks.length).toBeLessThan(24);
  }, 60_000);

  it("keeps a StrictMode page's context in its charts", async () => {
    put(
      'charts-strict.tsx',
      `import {StrictMode, createContext, useContext} from 'react';
import {BarChart, Bar, XAxis} from 'recharts';
${DATA}
const Units = createContext('items');
function Tick(props: any) {
  return <text x={props.x} y={props.y + 12}>{props.payload.value} {useContext(Units)}</text>;
}
export default function Page() {
  return (
    <StrictMode>
      <Units.Provider value="km">
        <BarChart width={300} height={150} data={data}><XAxis dataKey="d" tick={<Tick />} /><Bar dataKey="v" /></BarChart>
      </Units.Provider>
    </StrictMode>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-strict.tsx', {cwd: dir}));
    const html = fs.readFileSync(path.join(dir, 'charts-strict.html'), 'utf8');
    expect(html).toContain('a km');
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).not.toContain('chart-size');
  }, 60_000);

  it('names a chart of fixed size it cannot draw', async () => {
    put(
      'charts-ns-fixed.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return <R.BarChart width={300} height={120} data={data}><R.Bar dataKey="v" /></R.BarChart>;
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-ns-fixed.tsx', {cwd: dir}));
    const warning = result.data.warnings.find((/** @type {any} */ w) => w.code === 'chart-size');
    expect(warning?.message).toContain("from recharts by name");
    expect(warning?.message).not.toContain('fixed width');
  }, 60_000);

  it('warns about a chart it cannot draw', async () => {
    put(
      'charts-ns.tsx',
      `import * as R from 'recharts';
${DATA}
export default function Page() {
  return (
    <R.ResponsiveContainer width="100%" height={200}>
      <R.LineChart data={data}><R.Line dataKey="v" /></R.LineChart>
    </R.ResponsiveContainer>
  );
}
import '@astryxdesign/core/astryx.css';
`,
    );
    const result = /** @type {any} */ (await render('charts-ns.tsx', {cwd: dir}));
    expect(result.data.warnings.map((/** @type {any} */ w) => w.code)).toContain('chart-size');
  }, 60_000);

  it('gives back a page with charts byte for byte', async () => {
    const source = fs.readFileSync(path.join(dir, 'charts.tsx'), 'utf8');
    const back = /** @type {any} */ (await render('charts.html', {cwd: dir, reverse: true, out: 'charts-back/charts.tsx'}));
    expect(back.data.exact).toBe(true);
    expect(fs.readFileSync(path.join(dir, 'charts-back', 'charts.tsx'), 'utf8')).toBe(source);
  }, 60_000);
});
