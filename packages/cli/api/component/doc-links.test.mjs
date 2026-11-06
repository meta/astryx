// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Links in a component doc's text and a topic's description
 * (spec:AST-047 FR9): a read resolves each `{@link <target>}` to the command
 * that opens its doc, in text and JSON, the way a topic section's links read.
 * Code fields and code ticks show the syntax as written.
 *
 * Fixtures live under a repo-local temp dir, not /tmp, because Vite refuses to
 * dynamically import a module from outside the project root.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {component} from './component.mjs';
import {CORE_PACKAGE, linkComponentResponse} from './_adapter.mjs';
import {docs} from '../docs/docs.mjs';
import {search} from '../search/search.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const SLOW = 60_000;

let tmpDir;

const ACME_BUTTON = {
  type: 'component',
  name: 'AcmeButton',
  displayName: 'Acme Button',
  usage: {
    description:
      'A button. Set it up as {@link generic:acme-setup} says; theme it with {@link @astryxdesign/cli:generic:theme}.',
    bestPractices: [
      {
        guidance: true,
        description: 'Pair it with {@link component:AcmeButton}.',
      },
    ],
  },
  props: [
    {
      name: 'tone',
      type: 'string',
      description:
        'Read {@link generic:acme-setup}; write `{@link generic:acme-setup}` to link.',
      default: "'{@link generic:acme-setup}'",
    },
  ],
  examples: [
    {
      label: 'As {@link generic:acme-setup} shows',
      code: '// {@link generic:acme-setup}',
    },
  ],
};

const ACME_SETUP = {
  type: 'generic',
  name: 'acme-setup',
  title: 'Acme setup',
  description:
    'Set up Acme, then theme it as {@link @astryxdesign/cli:generic:theme} says.',
  sections: [
    {title: 'Overview', content: [{type: 'prose', text: 'Install it.'}]},
  ],
};

function scaffold() {
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({name: 'consumer'}),
  );
  fs.writeFileSync(
    path.join(tmpDir, 'astryx.config.mjs'),
    "export default {integrations: ['@acme/widgets']};\n",
  );
  const pkgDir = path.join(tmpDir, 'node_modules', '@acme', 'widgets');
  fs.mkdirSync(path.join(pkgDir, 'components'), {recursive: true});
  fs.mkdirSync(path.join(pkgDir, 'docs'), {recursive: true});
  fs.writeFileSync(
    path.join(pkgDir, 'package.json'),
    JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
  );
  fs.writeFileSync(
    path.join(pkgDir, 'astryx.integration.mjs'),
    "export default {components: './components', docs: './docs'};\n",
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'AcmeButton.doc.mjs'),
    `export default ${JSON.stringify(ACME_BUTTON, null, 2)};\n`,
  );
  fs.writeFileSync(
    path.join(pkgDir, 'components', 'AcmeButton.tsx'),
    'export function AcmeButton() { return null; }\n',
  );
  fs.writeFileSync(
    path.join(pkgDir, 'docs', 'acme-setup.doc.mjs'),
    `export default ${JSON.stringify(ACME_SETUP, null, 2)};\n`,
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-component-links-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

describe("a link in a component doc's text", () => {
  it(
    "reads as the command that opens its doc, against the integration's own docs",
    async () => {
      scaffold();
      const read = /** @type {any} */ (
        await component('AcmeButton', {cwd: tmpDir})
      );
      expect(read.type).toBe('component.detail');
      expect(read.data.usage.description).toBe(
        'A button. Set it up as `astryx docs acme-setup` says; theme it with `astryx docs theme`.',
      );
      expect(read.data.usage.bestPractices[0].description).toBe(
        'Pair it with `astryx component AcmeButton --package @acme/widgets`.',
      );
      // Code ticks and code fields show the syntax as written.
      expect(read.data.props[0].description).toBe(
        'Read `astryx docs acme-setup`; write `{@link generic:acme-setup}` to link.',
      );
      expect(read.data.props[0].default).toBe("'{@link generic:acme-setup}'");
      expect(read.data.examples[0]).toEqual({
        label: 'As `astryx docs acme-setup` shows',
        code: '// {@link generic:acme-setup}',
      });
    },
    SLOW,
  );

  it(
    'reads the same in `astryx discover <package>/<Component>`',
    async () => {
      scaffold();
      const json = await runCli(
        ['--json', 'discover', '@acme/widgets/AcmeButton'],
        tmpDir,
      );
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout).data.usage.description).toBe(
        'A button. Set it up as `astryx docs acme-setup` says; theme it with `astryx docs theme`.',
      );
    },
    SLOW,
  );

  it(
    "reads the same in a search hit's description",
    async () => {
      scaffold();
      const found = /** @type {any} */ (
        await search('AcmeButton', {cwd: tmpDir, type: 'component'})
      );
      const hit = found.data.results.find(
        (/** @type {any} */ result) => result.name === 'AcmeButton',
      );
      expect(hit.description).toBe(
        'A button. Set it up as `astryx docs acme-setup` says; theme it with `astryx docs theme`.',
      );
    },
    SLOW,
  );

  it(
    'reads the same in the props projection, in JSON, and in text',
    async () => {
      scaffold();
      const props = /** @type {any} */ (
        await component('AcmeButton', {cwd: tmpDir, props: true})
      );
      expect(props.data[0].description).toBe(
        'Read `astryx docs acme-setup`; write `{@link generic:acme-setup}` to link.',
      );

      const json = await runCli(['--json', 'component', 'AcmeButton'], tmpDir);
      expect(json.status).toBe(0);
      expect(JSON.parse(json.stdout).data.usage.description).toContain(
        '`astryx docs acme-setup`',
      );

      const text = await runCli(['component', 'AcmeButton'], tmpDir);
      expect(text.status).toBe(0);
      expect(text.stdout).toContain('`astryx docs acme-setup`');
      expect(text.stdout).not.toContain('{@link generic:acme-setup} says');
    },
    SLOW,
  );

  it("resolves a Core component's links against the CLI's own docs", async () => {
    const read = await linkComponentResponse(
      {
        type: 'component.detail',
        package: CORE_PACKAGE,
        data: {
          usage: {description: 'Theme it with {@link generic:theme}.'},
          props: [
            {
              name: 'x',
              type: 'string',
              description: 'See {@link generic:nope}.',
            },
          ],
        },
      },
      tmpDir,
    );
    expect(read.data.usage.description).toBe(
      'Theme it with `astryx docs theme`.',
    );
    // A link that names no doc prints as written.
    expect(read.data.props[0].description).toBe('See {@link generic:nope}.');
  });
});

describe("doc tokens in a component doc's text", () => {
  it(
    'render with no link beside them, in the read and in search, for the project in cwd',
    async () => {
      scaffold();
      fs.writeFileSync(path.join(tmpDir, 'bun.lock'), '{}\n');
      const docFile = path.join(
        tmpDir,
        'node_modules/@acme/widgets/components/AcmeButton.doc.mjs',
      );
      fs.writeFileSync(
        docFile,
        `export default ${JSON.stringify({
          ...ACME_BUTTON,
          usage: {
            description:
              'A button. Install with {@pm install @acme/widgets}; check with {@command doctor}.',
          },
          props: [],
          examples: [],
        })};\n`,
      );
      const read = /** @type {any} */ (
        await component('AcmeButton', {cwd: tmpDir})
      );
      expect(read.data.usage.description).toBe(
        'A button. Install with `bun add @acme/widgets`; check with `astryx doctor`.',
      );
    },
    SLOW,
  );
});

describe("a link in a topic's description", () => {
  it(
    'reads as the command that opens its doc, in the detail and the list',
    async () => {
      scaffold();
      const detail = /** @type {any} */ (
        await docs('acme-setup', undefined, {cwd: tmpDir, full: true})
      );
      expect(detail.data.description).toBe(
        'Set up Acme, then theme it as `astryx docs theme` says.',
      );
      const listed = /** @type {any} */ (
        await docs(undefined, undefined, {cwd: tmpDir})
      );
      expect(
        listed.data.find((/** @type {any} */ t) => t.topic === 'acme-setup')
          .description,
      ).toBe('Set up Acme, then theme it as `astryx docs theme` says.');
    },
    SLOW,
  );
});

describe("a link in a guide's description, as the docs tree shows it", () => {
  it(
    'reads as the command that opens its doc in the guide and its namespace',
    async () => {
      const expected =
        'Document a theme by extending the core theme topic, so an app reads it in `astryx docs theme`.';
      const guide = /** @type {any} */ (
        await docs(
          'authoring/building-blocks/themes/document-the-theme',
          undefined,
          {cwd: tmpDir, full: true},
        )
      );
      expect(guide.data.description).toBe(expected);
      const namespace = /** @type {any} */ (
        await docs('authoring/building-blocks/themes', undefined, {
          cwd: tmpDir,
        })
      );
      const child = namespace.data.slots
        .flatMap((/** @type {any} */ slot) => slot.children)
        .find((/** @type {any} */ each) => each.name === 'document-the-theme');
      expect(child.summary).toBe(expected);
    },
    SLOW,
  );
});

describe("a reference block's summary of another package's component", () => {
  it(
    "resolves the summary's links against the component's own package",
    async () => {
      const write = (
        /** @type {string} */ file,
        /** @type {string} */ text,
      ) => {
        fs.mkdirSync(path.dirname(path.join(tmpDir, file)), {recursive: true});
        fs.writeFileSync(path.join(tmpDir, file), text);
      };
      const doc = (/** @type {object} */ value) =>
        `export default ${JSON.stringify(value)};\n`;
      write('package.json', JSON.stringify({name: 'consumer'}));
      write(
        'astryx.config.mjs',
        "export default {integrations: ['@acme/widgets', '@acme/other']};\n",
      );
      const widgets = 'node_modules/@acme/widgets';
      write(
        `${widgets}/package.json`,
        JSON.stringify({name: '@acme/widgets', version: '1.0.0'}),
      );
      write(
        `${widgets}/astryx.integration.mjs`,
        "export default {docs: './docs'};\n",
      );
      write(
        `${widgets}/docs/acme-ref.doc.mjs`,
        doc({
          type: 'generic',
          name: 'acme-ref',
          title: 'Acme ref',
          description: 'Where the card is documented.',
          sections: [
            {
              title: 'Overview',
              content: [
                {
                  type: 'reference',
                  target: '@acme/other:component:OtherCardBody',
                },
              ],
            },
          ],
        }),
      );
      const other = 'node_modules/@acme/other';
      write(
        `${other}/package.json`,
        JSON.stringify({name: '@acme/other', version: '1.0.0'}),
      );
      write(
        `${other}/astryx.integration.mjs`,
        "export default {components: './components', docs: './docs'};\n",
      );
      write(
        `${other}/docs/other-setup.doc.mjs`,
        doc({
          type: 'generic',
          name: 'other-setup',
          title: 'Other setup',
          description: 'Set up Other.',
          sections: [
            {
              title: 'Overview',
              content: [{type: 'prose', text: 'Install it.'}],
            },
          ],
        }),
      );
      write(
        `${other}/components/OtherCard.doc.mjs`,
        doc({
          type: 'component',
          name: 'OtherCard',
          displayName: 'Other Card',
          usage: {description: 'A card.'},
          props: [],
        }),
      );
      write(
        `${other}/components/OtherCard.tsx`,
        'export function OtherCard() { return null; }\n',
      );
      write(
        `${other}/components/OtherCardBody.doc.mjs`,
        doc({
          type: 'component',
          name: 'OtherCardBody',
          displayName: 'Other Card Body',
          subComponentOf: 'OtherCard',
          description: 'Its body, set up as {@link generic:other-setup} says.',
          props: [],
        }),
      );
      write(
        `${other}/components/OtherCardBody.tsx`,
        'export function OtherCardBody() { return null; }\n',
      );

      const read = /** @type {any} */ (
        await docs('acme-ref', undefined, {cwd: tmpDir, full: true})
      );

      // `other-setup` is @acme/other's topic: from @acme/widgets, the
      // linking package, the same link names no doc.
      expect(read.data.sections[0].content[0].text).toContain(
        'Its body, set up as `astryx docs other-setup` says.',
      );
    },
    SLOW,
  );
});
