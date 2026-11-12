// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {loadLocalIntegration} from './integrations.mjs';
import {
  componentExamplesCheck,
  isListingImage,
  packageListingCheck,
} from './validate-contributions.mjs';
import {validateIntegration} from '../../api/integration/validate-integration.mjs';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#06f"/></svg>';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0))
    fs.rmSync(dir, {recursive: true, force: true});
});

/**
 * A package folder with these files (contents as strings or Buffers).
 * @param {Record<string, string | Buffer>} files
 */
function makePackage(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-listing-'));
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

const DOC =
  "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n";

const manifest = (/** @type {string} */ body) => `export default {${body}};\n`;

/** @param {object} extra */
const packageJson = extra =>
  JSON.stringify({name: '@acme/widgets', version: '1.0.0', ...extra});

async function check(/** @type {string} */ dir) {
  const loaded = await loadLocalIntegration(dir, {fresh: true});
  const integration = /** @type {any} */ (loaded.integration ?? loaded);
  const {examples} = await componentExamplesCheck(integration);
  return packageListingCheck(integration, examples);
}

const codes = (/** @type {{notes: {code: string}[]}} */ result) =>
  result.notes.map(note => note.code);

describe('isListingImage', () => {
  it('accepts PNG and shapes-only SVG, refuses scripts, links and oversize', () => {
    expect(isListingImage(PNG, 'logo.png')).toBe(true);
    expect(isListingImage(Buffer.from(SVG), 'logo.svg')).toBe(true);
    expect(
      isListingImage(
        Buffer.from('<svg><script>x()</script></svg>'),
        'logo.svg',
      ),
    ).toBe(false);
    expect(
      isListingImage(
        Buffer.from('<svg><image href="https://e.x/a.png"/></svg>'),
        'logo.svg',
      ),
    ).toBe(false);
    expect(isListingImage(Buffer.from('not an image'), 'logo.svg')).toBe(false);
    expect(isListingImage(Buffer.alloc(512 * 1024 + 1, 137), 'logo.png')).toBe(
      false,
    );
  });

  it.each([
    [
      'an XML declaration and a comment',
      `<?xml version="1.0" encoding="UTF-8"?>\n<!-- logo -->\n${SVG}`,
    ],
    [
      'a gradient fill by fragment',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><defs><linearGradient id="g"><stop offset="0" stop-color="#06f"/></linearGradient></defs><rect width="8" height="8" fill="url(#g)"/></svg>',
    ],
    [
      'a use of a local symbol',
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 8 8"><defs><circle id="c" r="2"/></defs><use href="#c"/><use xlink:href="#c" x="4"/></svg>',
    ],
    [
      'a design tool generator comment',
      `<?xml version="1.0"?>\n<!-- Generator: Adobe Illustrator 24.0.0, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->\n${SVG}`,
    ],
    [
      'a title',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><title>Acme &amp; Co</title><rect width="8" height="8"/></svg>',
    ],
  ])('accepts a shapes-only SVG with %s', (_label, svg) => {
    expect(isListingImage(Buffer.from(svg), 'logo.svg')).toBe(true);
  });

  it.each([
    [
      'an event set by animation',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"><set attributeName="onmouseover" to="alert(1)"/></rect></svg>',
    ],
    [
      'an href set by animation',
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>',
    ],
    [
      'an outside use',
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://e.x/a.svg#c"/></svg>',
    ],
    [
      'an outside fill',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https://e.x/p)"/></svg>',
    ],
    [
      'a style attribute',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red"/></svg>',
    ],
    [
      'a doctype',
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    ],
    [
      'a comment opened inside an attribute value',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="<!--"/><script>alert(1)</script><rect fill="-->"/></svg>',
    ],
    [
      'a character reference spelling an outside fill',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#117;rl(https:&#47;&#47;e.x/p)"/></svg>',
    ],
    [
      'a character reference in a mask',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect mask="&#117;rl(https://e.x/m)"/></svg>',
    ],
    [
      'a comment ended early by --!>',
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- --!><image href="x" onerror="alert(1)"/> --></svg>',
    ],
    [
      'a comment ended early by <!-->',
      '<svg xmlns="http://www.w3.org/2000/svg"><!--><image href="x" onerror="alert(1)"/>--></svg>',
    ],
    [
      'a comment ended early by <!--->',
      '<svg xmlns="http://www.w3.org/2000/svg"><!---><image href="x" onerror="alert(1)"/>--></svg>',
    ],
    [
      'PNG bytes ahead of SVG markup',
      Buffer.concat([
        PNG,
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
        ),
      ]),
    ],
    [
      'a CSS escape in a url',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="u\\rl(https:\\/\\/e.x/p)"/></svg>',
    ],
    [
      'a CSS hex escape in a mask',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect mask="\\75 rl(https:\\2f\\2f e.x/m)"/></svg>',
    ],
    [
      'an unclosed outside url',
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(https:e.x/p"/></svg>',
    ],
    [
      'markup inside the XML declaration',
      '<?xml version="1.0" x="><img src=x onerror=alert(1)>"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    ],
    [
      'an XML declaration in another encoding',
      '<?xml version="1.0" encoding="UTF-7"?><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>',
    ],
    [
      'elements inside a title',
      '<svg xmlns="http://www.w3.org/2000/svg"><title><title><!--</title><img src=x onerror=alert(1)>--></title></title></svg>',
    ],
    [
      'markup in the namespace value',
      '<svg xmlns="<!--javascript:alert(1)"><rect/></svg>',
    ],
    [
      'text outside a title',
      '<svg xmlns="http://www.w3.org/2000/svg"><g>hi</g></svg>',
    ],
  ])('refuses an SVG with %s', (_label, svg) => {
    expect(isListingImage(Buffer.from(svg), 'logo.svg')).toBe(false);
  });

  it('takes the format from the extension and refuses a mismatch', () => {
    const jpeg = Buffer.from([255, 216, 255, 224, 0, 16]);
    const webp = Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1');
    expect(isListingImage(jpeg, 'logo.jpg')).toBe(true);
    expect(isListingImage(jpeg, 'logo.JPEG')).toBe(true);
    expect(isListingImage(webp, 'logo.webp')).toBe(true);
    expect(isListingImage(PNG, 'logo.jpg')).toBe(false);
    expect(isListingImage(Buffer.from(SVG), 'logo.png')).toBe(false);
    expect(isListingImage(PNG, 'logo.gif')).toBe(false);
    expect(isListingImage(Buffer.from(SVG), 'logo')).toBe(false);
  });
});

describe('packageListingCheck', () => {
  it('notes a package with no logo, and names the field to set', async () => {
    const dir = makePackage({
      'package.json': packageJson({}),
      'astryx.integration.mjs': manifest("docs: './docs'"),
      'docs/widgets.doc.mjs':
        "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
    });
    const result = await check(dir);
    expect(codes(result)).toEqual(['package_without_logo']);
    expect(result.notes[0].message).toContain(
      'astryx.integration.mjs `logo.light` is not set',
    );
    expect(result.notes[0].message).toContain(
      "set `logo: {light: './marketplace/logo.svg'}` in astryx.integration.mjs",
    );
  });

  it('reads the logo from the integration file', async () => {
    const dir = makePackage({
      'package.json': packageJson({}),
      'astryx.integration.mjs': manifest(
        "docs: './docs', logo: {light: './marketplace/logo.svg'}",
      ),
      'marketplace/logo.svg': SVG,
      'docs/widgets.doc.mjs': DOC,
    });
    expect(codes(await check(dir))).toEqual([]);
  });

  it('prefers the integration file to package.json, and names it in the note', async () => {
    const dir = makePackage({
      'package.json': packageJson({
        marketplace: {logo: {light: 'logo.png'}},
      }),
      'logo.png': PNG,
      'astryx.integration.mjs': manifest(
        "docs: './docs', logo: {light: './missing.svg'}",
      ),
      'docs/widgets.doc.mjs': DOC,
    });
    const result = await check(dir);
    expect(codes(result)).toEqual(['package_without_logo']);
    expect(result.notes[0].message).toContain(
      'astryx.integration.mjs `logo.light` names missing.svg, which does not exist',
    );
  });

  it('checks an integration-file dark logo the same way', async () => {
    const dir = makePackage({
      'package.json': packageJson({}),
      'logo.png': PNG,
      'astryx.integration.mjs': manifest(
        "docs: './docs', logo: {light: './logo.png', dark: './dark.png'}",
      ),
      'docs/widgets.doc.mjs': DOC,
    });
    const result = await check(dir);
    expect(codes(result)).toEqual(['package_without_logo']);
    expect(result.notes[0].message).toContain('point `logo.dark` at');
  });

  it('is quiet for a packed shapes-only SVG logo and a docs-only package', async () => {
    const dir = makePackage({
      'package.json': packageJson({
        marketplace: {logo: {light: 'marketplace/logo.svg'}},
      }),
      'astryx.integration.mjs': manifest("docs: './docs'"),
      'marketplace/logo.svg': SVG,
      'docs/widgets.doc.mjs':
        "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
    });
    expect(codes(await check(dir))).toEqual([]);
  });

  it('notes a logo that is missing, outside the package, or not an image', async () => {
    for (const [light, extra] of [
      ['marketplace/missing.svg', {}],
      ['../logo.svg', {}],
      [
        'marketplace/logo.svg',
        {'marketplace/logo.svg': '<svg><script>x()</script></svg>'},
      ],
    ]) {
      const dir = makePackage({
        'package.json': packageJson({marketplace: {logo: {light}}}),
        'astryx.integration.mjs': manifest("docs: './docs'"),
        'docs/widgets.doc.mjs':
          "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
        ...extra,
      });
      expect(codes(await check(dir))).toEqual(['package_without_logo']);
    }
  });

  it('notes a logo no `files` entry packs', async () => {
    const dir = makePackage({
      'package.json': packageJson({
        files: ['docs', 'astryx.integration.mjs'],
        marketplace: {logo: {light: 'marketplace/logo.svg'}},
      }),
      'astryx.integration.mjs': manifest("docs: './docs'"),
      'marketplace/logo.svg': SVG,
      'docs/widgets.doc.mjs':
        "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
    });
    const result = await check(dir);
    // npm answers (packed list) or the files field decides; either way it is a note.
    expect(codes(result)).toEqual(['package_without_logo']);
    expect(result.notes[0].message).toMatch(/npm leaves out|no `files` entry/u);
  });

  it('notes a component package with no example block, not a theme-only one', async () => {
    const component = makePackage({
      'package.json': packageJson({marketplace: {logo: {light: 'logo.png'}}}),
      'logo.png': PNG,
      'astryx.integration.mjs': manifest("components: './components'"),
      'components/AcmeBadge.tsx':
        'export function AcmeBadge() { return null; }\n',
      'components/AcmeBadge.doc.mjs':
        "export default {name: 'AcmeBadge', description: 'A badge.', category: 'Data display', props: []};\n",
    });
    const result = await check(component);
    expect(codes(result)).toEqual(['package_without_example']);
    expect(result.notes[0].message).toContain('1 component ');
  });

  it('draws no note for a themes-only package with a packed logo', async () => {
    const dir = makePackage({
      'package.json': packageJson({}),
      'astryx.integration.mjs': manifest(
        "themes: './themes', logo: {light: './logo.svg'}",
      ),
      'logo.svg': SVG,
      'themes/acme/acme.theme.mjs': 'export default {};\n',
    });
    expect(codes(await check(dir))).toEqual([]);
  });

  it('is quiet once a block template is the example of a component', async () => {
    const dir = makePackage({
      'package.json': packageJson({marketplace: {logo: {light: 'logo.png'}}}),
      'logo.png': PNG,
      'astryx.integration.mjs': manifest(
        "components: './components', templates: './templates'",
      ),
      'components/AcmeBadge.tsx':
        'export function AcmeBadge() { return null; }\n',
      'components/AcmeBadge.doc.mjs':
        "export default {name: 'AcmeBadge', description: 'A badge.', category: 'Data display', props: []};\n",
      'templates/acme-badge-showcase.tsx':
        'export default function AcmeBadgeShowcase() { return null; }\n',
      'templates/acme-badge-showcase.doc.mjs':
        "export default {type: 'block', name: 'acme-badge-showcase', displayName: 'AcmeBadge showcase', description: 'A badge in use.', exampleFor: 'AcmeBadge', isShowcase: true};\n",
    });
    expect(codes(await check(dir))).toEqual([]);
  });

  it('reaches `integration check` as a note that fails nothing', async () => {
    const dir = makePackage({
      'package.json': packageJson({}),
      'astryx.integration.mjs': manifest("docs: './docs'"),
      'docs/widgets.doc.mjs':
        "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
    });
    const result = await validateIntegration(undefined, {cwd: dir});
    const note = result.data.notes.find(
      (/** @type {{code: string}} */ each) =>
        each.code === 'package_without_logo',
    );
    expect(note).toBeDefined();
    expect(note).not.toHaveProperty('next');
  });

  it('draws no listing note for a package of icon sets alone', async () => {
    const dir = makePackage({'package.json': packageJson({})});
    const result = packageListingCheck(
      /** @type {any} */ ({
        __packageDir: dir,
        experimental: {iconSets: path.join(dir, 'icon-sets')},
      }),
    );
    expect(codes(result)).toEqual([]);
  });

  it('names the field it read the logo from in the note', async () => {
    const dir = makePackage({
      'package.json': packageJson({
        marketplace: {logo: {light: 'logo.png', dark: 'missing.png'}},
      }),
      'logo.png': PNG,
      'astryx.integration.mjs': manifest("docs: './docs'"),
      'docs/widgets.doc.mjs':
        "export const docs = {type: 'generic', name: 'widgets', title: 'Widgets', description: 'Widgets.', sections: [{title: 'Use', content: [{type: 'prose', text: 'Use them.'}]}]};\n",
    });
    const result = await check(dir);
    expect(codes(result)).toEqual(['package_without_logo']);
    expect(result.notes[0].message).toContain(
      'package.json `marketplace.logo.dark`',
    );
  });
});
