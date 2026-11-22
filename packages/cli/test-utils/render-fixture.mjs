// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The shared fixture of the render() test files: a linked project with
 *   a sample page, and the helpers that write into it.
 * @input Nothing; a test file calls useRenderFixture() at its top level.
 * @output dir (live), put, codeOf, PNG, PAGE, CLI_DIR and useRenderFixture.
 * @position Test support for packages/cli/api/render/render.*.test.mjs.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {afterAll, beforeAll} from 'vitest';
import {render} from '../api/render/render.mjs';
import {makeLinkedFixture, removeLinkedFixture} from './linked-fixture.mjs';

/** The CLI package root. */
export const CLI_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

/**
 * The fixture project each render test works in. Live: the hooks that
 * useRenderFixture() registers assign it before the first test.
 * @type {string}
 */
export let dir;
/** @type {string} */
let compileCache;
/** @type {string | undefined} */
let previousCompileCache;

/** @param {string} name @param {string | Buffer} content */
export const put = (name, content) => {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content);
  return file;
};

/** @param {() => Promise<unknown>} fn */
export async function codeOf(fn) {
  try {
    await fn();
  } catch (e) {
    return /** @type {any} */ (e).code;
  }
  return 'no error';
}

// A 1×1 PNG.
export const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cf00000301010018dd8db40000000049454e44ae426082',
  'hex',
);

export const PAGE = `import * as stylex from '@stylexjs/stylex';
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

/**
 * Registers the file's fixture: a linked project with the sample page,
 * rendered once, and one compile cache for the file's page processes.
 */
export function useRenderFixture() {
  beforeAll(async () => {
    // Each render starts a new page process. render() stops it as soon as it
    // answers, so each process saves only part of its compiled code. One cache
    // for this file keeps those parts for later processes. A forked process
    // takes this environment.
    previousCompileCache = process.env.NODE_COMPILE_CACHE;
    compileCache = fs.mkdtempSync(
      path.join(os.tmpdir(), 'astryx-render-compile-'),
    );
    process.env.NODE_COMPILE_CACHE = compileCache;
    dir = makeLinkedFixture('astryx-render-test-', [
      '@astryxdesign',
      '@stylexjs',
      'react',
      'react-dom',
      'recharts',
    ]);
    put('dot.png', PNG);
    put('page.tsx', PAGE);
    put(
      'plain.html',
      '<!doctype html><html><body><h1>Hello</h1><p class="lead">Hi</p></body></html>',
    );
    // Every test can read the rendered page, whatever runs first.
    await render('page.tsx', {cwd: dir});
  }, 60_000);

  afterAll(() => {
    try {
      removeLinkedFixture(dir);
    } finally {
      if (previousCompileCache === undefined)
        delete process.env.NODE_COMPILE_CACHE;
      else process.env.NODE_COMPILE_CACHE = previousCompileCache;
      fs.rmSync(compileCache, {recursive: true, force: true});
    }
  });
}
