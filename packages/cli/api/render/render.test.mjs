// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for render() (`astryx experimental export`): a page to one self-contained HTML file and back, a page without Astryx, atomic writes, the reverse direction, the CLI command, each refusal, and the warnings.
 */

import {spawn, spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {render} from './render.mjs';
import {segmenterWarning} from '../../foundation/render/render-page.mjs';
import {renderedMarkupOf} from '../../foundation/render/source-block.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {recordDeclaredSettings} from '../../foundation/env/cli-command.mjs';
import {CLI_VERSION} from '../../test-utils/release-fixtures.mjs';
import {makeLinkedFixture, removeLinkedFixture} from '../../test-utils/linked-fixture.mjs';
import {COMPONENT_REPLACES_CLI} from '../../foundation/integrations/cli-requirement.mjs';
import {CLI_DIR, PAGE, codeOf, dir, put, useRenderFixture} from '../../test-utils/render-fixture.mjs';

useRenderFixture();

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
    expect(html).toMatch(/ -->\n<script type="module">[^<]/);
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
      'values.tsx:11: Button has no size "huge"; its sizes are sm, md, lg.',
      'values.tsx:12: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive.',
    ]);
  });

  it('warns for a value of a kind the prop does not take, and only when both sides are certain', async () => {
    put(
      'kinds.tsx',
      `import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {DateInput} from '@astryxdesign/core/DateInput';
import {Grid} from '@astryxdesign/core/Grid';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/Stack';
const columns = 3;
export default function Page({valid = true, note}: {valid?: boolean; note?: string}) {
  const [born, setBorn] = useState<Date | null>(new Date(1990, 5, 15));
  return (
    <main>
      <DateInput label="Born" value={born} onChange={setBorn} />
      <TextInput label="Hook" status={valid ? undefined : 'error'} />
      <Grid columns="3"><span /></Grid>
      <TextInput label="Name" status={valid ? undefined : {type: 'error', message: 'Required'}} />
      <TextInput label="Note" status={note} />
      <Grid columns={columns}><span /></Grid>
      <Button label="Off" isDisabled onClick={() => {}} />
      <VStack gap="md"><span /></VStack>
      <VStack gap="3"><span /></VStack>
      <TextInput label="Spread" status="error" {...{status: undefined}} />
    </main>
  );
}
`,
    );
    const answer = /** @type {any} */ (await render('kinds.tsx', {cwd: dir, out: 'kinds.html'}));
    const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
    expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
      'kinds.tsx:12: DateInput value expects a string; got a Date.',
      'kinds.tsx:13: TextInput status expects an object {type, message}; got a string.',
      'kinds.tsx:14: Grid columns expects a number or an object {minWidth, max, repeat}; got a string.',
      'kinds.tsx: VStack gap expects one of 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10; got a string on 2 lines (19, 20).',
    ]);
  });

  it('checks each branch of a prop value whose branches are all string literals', async () => {
    put(
      'branches.tsx',
      `import {Button} from '@astryxdesign/core/Button';
import {Icon} from '@astryxdesign/core/Icon';
import {Text} from '@astryxdesign/core/Text';
export default function Page({busy = false, ok = true, tone}: {busy?: boolean; ok?: boolean; tone?: string}) {
  return (
    <main>
      <Button label="A" variant={busy ? 'ghost' : 'danger'} />
      <Button label="B" size={busy ? 'sm' : 'lg'} />
      <Button label="C" size={busy ? 'sm' : tone} />
      <Button label="D" size={busy ? undefined : 'huge'} />
      <Icon icon="check" size="sm" color={ok ? 'success' : 'danger'} />
      <Text color={busy && 'subtle'}>Skipped</Text>
      <Text color={busy ? null : 'muted'}>Muted</Text>
    </main>
  );
}
`,
    );
    const answer = /** @type {any} */ (await render('branches.tsx', {cwd: dir, out: 'branches.html'}));
    const unknown = answer.data.warnings.filter((/** @type {any} */ w) => w.code === 'unknown-prop-value');
    expect(unknown.map((/** @type {any} */ w) => w.message)).toEqual([
      'branches.tsx:7: Button has no variant "danger"; its variants are primary, secondary, ghost, destructive.',
      'branches.tsx:10: Button has no size "huge"; its sizes are sm, md, lg.',
      'branches.tsx:11: Icon has no color "danger"; its colors are primary, secondary, tertiary, disabled, accent, info, success, error, warning, inherit, blue, red, green, gray, cyan, teal, yellow, orange, pink, purple.',
      'branches.tsx:13: Text has no color "muted"; its colors are primary, secondary, disabled, placeholder, accent, inherit.',
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
