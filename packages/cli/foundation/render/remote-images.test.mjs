// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for remote-images.mjs and for how a render uses it: an image a
 * page names by an https address is fetched once and carried, and every way
 * a fetch can fail leaves the address and says why.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {describe, expect, it} from 'vitest';
import {JSDOM} from 'jsdom';
import {render} from '../../api/render/render.mjs';
import {imageTypeOf, remoteImages} from './remote-images.mjs';
import {renderPage} from './render-page.mjs';
import {readSourceBlock, renderedMarkupOf} from './source-block.mjs';
import {ROOT_ID} from './client-bundle.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';

/** A fetch answer. @param {any} body @param {ResponseInit} [init] */
const respond = (body, init) => new globalThis.Response(body, init);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A fetch that answers each address from `answers`: a Response, or a
 * function of the request's signal.
 * @param {Record<string, any>} answers
 */
function fetchFrom(answers) {
  /** @type {{url: string, init: RequestInit}[]} */
  const asked = [];
  /** @type {typeof globalThis.fetch} */
  const fetch = async (url, init = {}) => {
    asked.push({url: String(url), init});
    const answer = answers[String(url)];
    if (answer === undefined) throw new TypeError('fetch failed');
    return typeof answer === 'function' ? answer(init.signal) : answer;
  };
  return {fetch, asked};
}

/** An answer that never comes, until the request is stopped. @param {any} signal */
const never = signal =>
  new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  });

const png = () => respond(PNG, {headers: {'content-type': 'image/png'}});

describe('remoteImages', () => {
  it('fetches an https image once, with no credentials, as a data: URI', async () => {
    const {fetch, asked} = fetchFrom({'https://example.com/a.png?w=2': png()});
    const remote = remoteImages({fetch});
    await remote.get([
      'https://example.com/a.png?w=2',
      'https://example.com/a.png?w=2',
    ]);
    await remote.get(['https://example.com/a.png?w=2']);
    remote.done();
    expect(asked).toHaveLength(1);
    expect(asked[0].init.credentials).toBe('omit');
    expect(asked[0].init.referrerPolicy).toBe('no-referrer');
    expect(remote.results.get('https://example.com/a.png?w=2')).toEqual({
      uri: `data:image/png;base64,${PNG.toString('base64')}`,
    });
    expect(remote.summary()).toEqual({
      fetched: ['https://example.com/a.png?w=2'],
      failed: [],
    });
  });

  it('says why an image was not fetched: offline, too slow, too large, not an image, not https', async () => {
    const big = Buffer.alloc(300, 1);
    const {fetch, asked} = fetchFrom({
      'https://example.com/slow.png': never,
      'https://example.com/page.png': respond('<html></html>', {
        headers: {'content-type': 'text/html'},
      }),
      'https://example.com/lies.png': respond('not a picture', {
        headers: {'content-type': 'image/png'},
      }),
      'https://example.com/said-big.png': respond(PNG, {
        headers: {'content-type': 'image/png', 'content-length': '999999999'},
      }),
      'https://example.com/is-big.png': respond(Buffer.concat([PNG, big]), {
        headers: {'content-type': 'image/png'},
      }),
      'https://example.com/gone.png': respond('', {status: 404}),
    });
    const remote = remoteImages({fetch, timeoutMs: 50, maxBytes: 200});
    await remote.get([
      'https://example.com/offline.png',
      'https://example.com/slow.png',
      'https://example.com/page.png',
      'https://example.com/lies.png',
      'https://example.com/said-big.png',
      'https://example.com/is-big.png',
      'https://example.com/gone.png',
      'http://example.com/plain.png',
      'https://me:secret@example.com/private.png',
    ]);
    remote.done();
    const reasons = Object.fromEntries(
      remote.summary().failed.map(({url, reason}) => [url, reason]),
    );
    expect(remote.summary().fetched).toEqual([]);
    expect(reasons).toEqual({
      'https://example.com/offline.png': 'the network could not reach it',
      'https://example.com/slow.png': 'no answer within 0.05 s',
      'https://example.com/page.png': 'not an image',
      'https://example.com/lies.png': 'not an image',
      'https://example.com/said-big.png': `larger than ${200 / 1048576} MB, the most a rendered page carries of one file`,
      'https://example.com/is-big.png': `larger than ${200 / 1048576} MB, the most a rendered page carries of one file`,
      'https://example.com/gone.png': 'the server answered 404',
      'http://example.com/plain.png': 'not an https address',
      'https://me:secret@example.com/private.png':
        'the address holds a user name or password, which a render never sends',
    });
    // An address that is not https, or that holds credentials, is never asked.
    expect(asked.map(a => a.url)).not.toContain('http://example.com/plain.png');
    expect(asked.some(a => a.url.includes('secret'))).toBe(false);
  });

  it('stops every image still waiting when the render runs out of time', async () => {
    const {fetch} = fetchFrom({
      'https://example.com/1.png': never,
      'https://example.com/2.png': never,
    });
    const remote = remoteImages({fetch, timeoutMs: 10_000, budgetMs: 50});
    const started = Date.now();
    await remote.get([
      'https://example.com/1.png',
      'https://example.com/2.png',
    ]);
    remote.done();
    expect(Date.now() - started).toBeLessThan(5000);
    expect(remote.summary().failed.map(f => f.reason)).toEqual([
      'the render ran out of the time it gives remote images',
      'the render ran out of the time it gives remote images',
    ]);
  });

  it('tells an image by its bytes', () => {
    expect(imageTypeOf(PNG)).toBe('image/png');
    expect(imageTypeOf(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      'image/jpeg',
    );
    expect(
      imageTypeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBe('image/svg+xml');
    expect(imageTypeOf(Buffer.from('wOF2'))).toBeNull();
    expect(imageTypeOf(Buffer.from('<html><body>hi</body></html>'))).toBeNull();
  });
});

describe('a render with images from the web', () => {
  it('carries a fetched image in the markup and the script, and keeps the address in the source', async () => {
    const dir = makeLinkedFixture('astryx-render-remote-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          'export default function Page() {',
          '  return (',
          '    <main>',
          '      <img src="https://example.com/shoe.png" alt="Shoe" />',
          '      <img src="http://example.com/plain.png" alt="Plain" />',
          '      <div style={{backgroundImage: "url(https://example.com/shoe.png)"}}>Back</div>',
          '      <link rel="preload" href="https://example.com/font.woff2" />',
          '    </main>',
          '  );',
          '}',
          '',
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({'https://example.com/shoe.png': png()});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const markup = renderedMarkupOf(page.html) ?? '';
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(markup).toContain(`src="${data}"`);
      expect(markup).toContain('src="http://example.com/plain.png"');
      expect(asked.map(a => a.url)).toEqual(['https://example.com/shoe.png']);
      // The script draws the page with the same data.
      const script = page.html.slice(page.html.lastIndexOf('<script>'));
      expect(script).not.toContain('"https://example.com/shoe.png"');
      expect(page.remoteImages).toEqual({
        fetched: ['https://example.com/shoe.png'],
        failed: [
          {url: 'http://example.com/plain.png', reason: 'not an https address'},
        ],
      });
      const warned = page.warnings
        .filter(w => w.code === 'remote-asset')
        .map(w => w.message);
      expect(
        warned.some(m => m.startsWith('http://example.com/plain.png')),
      ).toBe(true);
      expect(
        warned.some(m => m.startsWith('https://example.com/shoe.png')),
      ).toBe(false);
      // The source keeps the address the page wrote, so the way back is the page.
      const source = readSourceBlock(page.html);
      const carried = Buffer.from(
        /** @type {any} */ (source).source.files[0].base64,
        'base64',
      ).toString('utf8');
      expect(carried).toContain('src="https://example.com/shoe.png"');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('keeps the address and says why when the network cannot reach it', async () => {
    const dir = makeLinkedFixture('astryx-render-offline-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <img src="https://example.com/away.png" alt="Away" />; }\n',
      );
      const {fetch} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(renderedMarkupOf(page.html)).toContain(
        'src="https://example.com/away.png"',
      );
      expect(page.remoteImages).toEqual({
        fetched: [],
        failed: [
          {
            url: 'https://example.com/away.png',
            reason: 'the network could not reach it',
          },
        ],
      });
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          'https://example.com/away.png is loaded from the network, which a sandboxed page cannot reach (the render could not fetch it: the network could not reach it); save it beside the page and import it instead.',
      });
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('carries the images a feed shows after a click, fetches no link, and warns for an address built in code', async () => {
    const dir = makeLinkedFixture('astryx-render-remote-late-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      const source = [
        "import {useState} from 'react';",
        'const feed = [',
        "  {name: 'Alex', avatarUrl: 'https://i.example.com/40?u=alex', docsUrl: 'https://example.com/guide'},",
        "  {name: 'Jo', avatarUrl: 'https://i.example.com/40?u=jo', docsUrl: 'https://example.com/api/items'},",
        '];',
        "const cover = {photoUrl: 'https://example.com/not-really-an-image'};",
        'export default function Page() {',
        '  const [open, setOpen] = useState(false);',
        '  return (',
        '    <main>',
        '      <button type="button" onClick={() => setOpen(true)}>Show the feed</button>',
        '      {open && feed.map(item => (',
        '        <p key={item.name}>',
        '          <img src={item.avatarUrl} alt={item.name} />',
        '          <img src={`https://i.example.com/40?u=${item.name}&big=1`} alt={`${item.name} large`} />',
        '          <a href={item.docsUrl}>Guide</a>',
        '        </p>',
        '      ))}',
        '      {open && <img src={cover.photoUrl} alt="Cover" />}',
        '    </main>',
        '  );',
        '}',
        '',
      ].join('\n');
      fs.writeFileSync(file, source);
      const {fetch, asked} = fetchFrom({
        'https://i.example.com/40?u=alex': png(),
        'https://i.example.com/40?u=jo': png(),
        'https://example.com/not-really-an-image': respond('<html></html>', {headers: {'content-type': 'text/html'}}),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      // A link or an API address is never fetched; only image-named literals are.
      expect(asked.map(a => a.url).sort()).toEqual([
        'https://example.com/not-really-an-image',
        'https://i.example.com/40?u=alex',
        'https://i.example.com/40?u=jo',
      ]);
      expect(page.remoteImages).toEqual({
        fetched: ['https://i.example.com/40?u=alex', 'https://i.example.com/40?u=jo'],
        failed: [{url: 'https://example.com/not-really-an-image', reason: 'not an image'}],
      });
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          '`https://i.example.com/40?u=${item.name}&big=1` (page.jsx:15) builds an image address in code, so the render cannot carry it: the file asks the network for it when the script draws it. Write the address whole, or save the image beside the page and import it.',
      });
      // Opened after the click, offline: the avatars draw from the carried data.
      fs.writeFileSync(path.join(dir, 'page.html'), page.html);
      const dom = new JSDOM(page.html, {runScripts: 'dangerously', pretendToBeVisual: true});
      const settle = () => new Promise(resolve => dom.window.setTimeout(resolve, 100));
      await settle();
      const doc = dom.window.document;
      expect(doc.querySelectorAll(`#${ROOT_ID} img`)).toHaveLength(0);
      /** @type {HTMLButtonElement} */ (doc.querySelector(`#${ROOT_ID} button`)).click();
      await settle();
      const srcOf = (/** @type {string} */ alt) => doc.querySelector(`#${ROOT_ID} img[alt="${alt}"]`)?.getAttribute('src');
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(srcOf('Alex')).toBe(data);
      expect(srcOf('Jo')).toBe(data);
      expect(srcOf('Cover')).toBe('https://example.com/not-really-an-image');
      expect(doc.querySelector(`#${ROOT_ID} a`)?.getAttribute('href')).toBe('https://example.com/guide');
      dom.window.close();
      // The way back is the page as written.
      const back = /** @type {any} */ (await render('page.html', {cwd: dir, reverse: true, out: 'back/page.jsx'}));
      expect(back.data.exact).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'back/page.jsx'), 'utf8')).toBe(source);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('reaches no network in a markup-only render', async () => {
    const dir = makeLinkedFixture('astryx-render-markup-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <img src="https://example.com/shoe.png" alt="Shoe" />; }\n',
      );
      const {fetch, asked} = fetchFrom({'https://example.com/shoe.png': png()});
      const page = await renderPage(file, {
        cwd: dir,
        markupOnly: true,
        remoteImages: {fetch},
      });
      expect(asked).toEqual([]);
      expect(page.remoteImages).toBeUndefined();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);
});
