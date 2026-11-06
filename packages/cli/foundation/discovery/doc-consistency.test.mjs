// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What an integration's docs say that no reader serves: a prop listed
 * twice, an overlay's text for a prop the doc lacks, an empty section, two
 * sections with one key, and an overlay of no topic. Each is a warning with a
 * fix; a replaces/extends target is never reported.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {integrationDocConsistency} from './doc-consistency.mjs';

/** @type {string} */
let pkg;

beforeEach(() => {
  pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-doc-consistency-'));
});

afterEach(() => {
  fs.rmSync(pkg, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
function write(rel, text) {
  const file = path.join(pkg, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, text);
}

const WIDGET = {
  type: 'component',
  name: 'Widget',
  displayName: 'Widget',
  props: [
    {name: 'label', type: 'string', description: 'Text.', required: true},
    {name: 'size', type: "'sm' | 'md'", description: 'Size.'},
  ],
};

/** @param {object} [fields] */
const topic = (fields = {}) => ({
  type: 'generic',
  name: 'deploying',
  title: 'Deploying',
  description: 'How to deploy.',
  sections: [{title: 'Overview', content: [{type: 'prose', text: 'Ship it.'}]}],
  ...fields,
});

function check() {
  return integrationDocConsistency(
    {
      components: path.join(pkg, 'components'),
      docs: path.join(pkg, 'docs'),
    },
    pkg,
  );
}

describe('integrationDocConsistency', () => {
  it('passes docs a reader serves whole, overlays with a name included', async () => {
    write(
      'components/Widget.doc.mjs',
      `export default ${JSON.stringify(WIDGET)};\nexport const docsZh = {name: 'Widget', displayName: '小部件', propDescriptions: {label: '文本'}};\n`,
    );
    write(
      'docs/deploying.doc.mjs',
      `export const docs = ${JSON.stringify(topic())};\n`,
    );
    write(
      'docs/deploying.doc.zh.mjs',
      "export const docsZh = {title: '部署'};\n",
    );
    write(
      'docs/more.doc.mjs',
      `export const docs = ${JSON.stringify(topic({name: 'more', extends: 'deploying'}))};\n`,
    );

    expect(await check()).toEqual([]);
  });

  it('names a prop documented twice and an overlay key that names no prop, with the fix', async () => {
    write(
      'components/Widget.doc.mjs',
      `export default ${JSON.stringify({
        ...WIDGET,
        props: [
          ...WIDGET.props,
          {name: 'label', type: 'string', description: 'Again.'},
        ],
      })};\nexport const docsDense = {propDescriptions: {labell: 'txt', nothinglike: 'x'}};\n`,
    );

    const issues = await check();

    expect(issues.map(issue => issue.code)).toEqual([
      'duplicate_prop',
      'unknown_translated_prop',
      'unknown_translated_prop',
    ]);
    expect(issues.every(issue => issue.severity === 'warning')).toBe(true);
    expect(issues[0]).toMatchObject({
      message: `Widget's prop "label" is documented twice: props[0] and props[2].`,
      fix: 'In components/Widget.doc.mjs, delete props[2] (the second "label" entry), keeping what it adds in props[0].',
      file: 'components/Widget.doc.mjs',
    });
    expect(issues[1].fix).toBe(
      'In components/Widget.doc.mjs, rename the key "labell" in docsDense.propDescriptions to "label".',
    );
    expect(issues[2].fix).toBe(
      'In components/Widget.doc.mjs, remove "nothinglike" from docsDense.propDescriptions, or document the prop "nothinglike" first.',
    );
  });

  it("matches an overlay key against each prop entry's whole name, as the overlay applies it", async () => {
    write(
      'components/Field.doc.mjs',
      `export default ${JSON.stringify({
        type: 'component',
        name: 'Field',
        props: [
          {
            name: 'value / onChange',
            type: 'string / (v: string) => void',
            description: 'Controlled pair.',
          },
          {name: 'label', type: 'string', description: 'Text.'},
        ],
      })};\nexport const docsZh = {propDescriptions: {'value / onChange': '受控', value: '值', label: '文本'}};\n`,
    );

    const issues = await check();

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'unknown_translated_prop',
        message: expect.stringContaining(
          'docsZh.propDescriptions names "value"',
        ),
        fix: 'In components/Field.doc.mjs, rename the key "value" in docsZh.propDescriptions to "value / onChange".',
      }),
    ]);
  });

  it("checks a sub-component overlay's keys against that sub-component's props", async () => {
    write(
      'components/Group.doc.mjs',
      `export default ${JSON.stringify({
        type: 'component',
        name: 'Group',
        components: [
          {
            name: 'GroupItem',
            props: [{name: 'value', type: 'string', description: 'V.'}],
          },
        ],
      })};\nexport const docsZh = {components: [{name: 'GroupItem', description: '项', propDescriptions: {valu: '值'}}]};\n`,
    );

    const issues = await check();

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'unknown_translated_prop',
        message: expect.stringContaining(
          'docsZh.components[0].propDescriptions names "valu", but no prop entry of GroupItem',
        ),
      }),
    ]);
  });

  it('names an empty section and two sections whose keys collide, however their titles are written', async () => {
    write(
      'docs/deploying.doc.mjs',
      `export const docs = ${JSON.stringify(
        topic({
          sections: [
            {title: 'Overview', content: [{type: 'prose', text: 'One.'}]},
            {title: 'Next steps', content: []},
            {title: 'overview!', content: [{type: 'prose', text: 'Two.'}]},
          ],
        }),
      )};\n`,
    );

    const issues = await check();

    expect(issues.map(issue => issue.code)).toEqual([
      'empty_section',
      'duplicate_section_key',
    ]);
    expect(issues[0].fix).toContain('give sections[1] content');
    expect(issues[1]).toMatchObject({
      message:
        'Topic "deploying": sections[0] "Overview" and sections[2] "overview!" both have the key "overview", so `astryx docs deploying overview` opens only sections[0]; sections[2] is served at "overview-2", a key no one wrote.',
      fix: "In docs/deploying.doc.mjs, give sections[2] its own title, or write the key it is already served at: id: 'overview-2'.",
    });
  });

  it('leaves a collision whose later section writes its own id to docs discovery, which reports it as an invalid doc', async () => {
    write(
      'docs/deploying.doc.mjs',
      `export const docs = ${JSON.stringify(
        topic({
          sections: [
            {title: 'Overview', content: [{type: 'prose', text: 'One.'}]},
            {
              id: 'overview',
              title: 'More',
              content: [{type: 'prose', text: 'Two.'}],
            },
          ],
        }),
      )};\n`,
    );

    expect(await check()).toEqual([]);
  });

  it('never reports a replaces or extends target: it may be a topic of an integration the consumer installs', async () => {
    write(
      'docs/deploying.doc.mjs',
      `export const docs = ${JSON.stringify(topic({replaces: 'theem'}))};\n`,
    );
    write(
      'docs/more.doc.mjs',
      `export const docs = ${JSON.stringify(topic({name: 'more', extends: 'other-kit-guide'}))};\n`,
    );

    expect(await check()).toEqual([]);
  });

  it('names an overlay file beside no topic file', async () => {
    write(
      'docs/deploying.doc.mjs',
      `export const docs = ${JSON.stringify(topic())};\n`,
    );
    write('docs/ghost.doc.zh.mjs', "export default {title: '幽灵'};\n");
    write('docs/deployng.doc.dense.mjs', "export default {title: 'x'};\n");

    const issues = await check();

    expect(issues).toEqual([
      expect.objectContaining({
        code: 'orphan_doc_overlay',
        file: 'docs/deployng.doc.dense.mjs',
        fix: 'Rename docs/deployng.doc.dense.mjs to docs/deploying.doc.dense.mjs, the overlay of deploying.doc.mjs.',
      }),
      expect.objectContaining({
        code: 'orphan_doc_overlay',
        file: 'docs/ghost.doc.zh.mjs',
        message:
          'docs/ghost.doc.zh.mjs overlays a topic file ghost.doc.mjs that does not exist, so it ships and is never read.',
        fix: 'Delete docs/ghost.doc.zh.mjs, or add the topic it translates as docs/ghost.doc.mjs.',
      }),
    ]);
  });

  it('names the file, the line, and a paste-ready fix for each finding', async () => {
    write(
      'components/Widget.doc.mjs',
      [
        'export default {',
        "  type: 'component',",
        "  name: 'Widget',",
        '  props: [',
        "    {name: 'label', type: 'string', description: 'Text.'},",
        "    {name: 'size', type: 'string', description: 'Size.'},",
        "    {name: 'label', type: 'string', description: 'Again.'},",
        '  ],',
        '};',
        'export const docsZh = {',
        '  propDescriptions: {',
        "    size: '尺寸',",
        "    labell: '文本',",
        '  },',
        '};',
        '',
      ].join('\n'),
    );
    write(
      'docs/deploying.doc.mjs',
      [
        'export const docs = {',
        "  type: 'generic',",
        "  name: 'deploying',",
        "  title: 'Deploying',",
        "  description: 'How to deploy.',",
        '  sections: [',
        "    {title: 'Overview', content: [{type: 'prose', text: 'One.'}]},",
        "    {title: 'Empty', content: []},",
        "    {title: 'Overview', content: [{type: 'prose', text: 'Two.'}]},",
        '  ],',
        '};',
        '',
      ].join('\n'),
    );
    write('docs/ghost.doc.zh.mjs', "export default {title: 'ghost'};\n");

    const issues = await check();
    const at = issues.map(({code, file, line, fix}) => ({
      code,
      file,
      line,
      fix,
    }));

    expect(at).toEqual([
      {
        code: 'duplicate_prop',
        file: 'components/Widget.doc.mjs',
        line: 7,
        fix: 'In components/Widget.doc.mjs, delete props[2] (the second "label" entry), keeping what it adds in props[0].',
      },
      {
        code: 'unknown_translated_prop',
        file: 'components/Widget.doc.mjs',
        line: 13,
        fix: 'In components/Widget.doc.mjs, rename the key "labell" in docsZh.propDescriptions to "label".',
      },
      {
        code: 'empty_section',
        file: 'docs/deploying.doc.mjs',
        line: 8,
        fix: "In docs/deploying.doc.mjs, give sections[1] content, such as content: [{type: 'prose', text: '…'}], or delete the section.",
      },
      {
        code: 'duplicate_section_key',
        file: 'docs/deploying.doc.mjs',
        line: 9,
        fix: "In docs/deploying.doc.mjs, give sections[2] its own title, or write the key it is already served at: id: 'overview-2'.",
      },
      {
        code: 'orphan_doc_overlay',
        file: 'docs/ghost.doc.zh.mjs',
        line: 1,
        fix: 'Delete docs/ghost.doc.zh.mjs, or add the topic it translates as docs/ghost.doc.mjs.',
      },
    ]);
    // The duplicate section's key is in its message, beside its line.
    expect(issues[3].message).toContain('both have the key "overview"');
  });
});
