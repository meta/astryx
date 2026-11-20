// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for remote-images.mjs and for how a render uses it: an image a
 * page names by an https address is fetched once and carried, and every way
 * a fetch can fail leaves the address and says why.
 */

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {render} from '../../api/render/render.mjs';
import {imageRequest, imageTypeOf, remoteImages} from './remote-images.mjs';
import {renderPage} from './render-page.mjs';
import {readSourceBlock, renderedMarkupOf} from './source-block.mjs';
import {ROOT_ID, imageSinks} from './client-bundle.mjs';
import {showsImage} from './image-attributes.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {pageDom, pageDrawn, pageTasks} from '../../test-utils/page-dom.mjs';

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
      'https://example.com/dropped.png': respond(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(PNG.subarray(0, 8)));
            controller.error(new Error('connection reset'));
          },
        }),
        {headers: {'content-type': 'image/png'}},
      ),
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
      'https://example.com/dropped.png',
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
      'https://example.com/dropped.png':
        'the connection closed before the image arrived',
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

  it('asks for no more images once the network answers none of the first ones', async () => {
    const urls = Array.from(
      {length: 10},
      (_, i) => `https://example.com/${i}.png`,
    );
    const {fetch, asked} = fetchFrom(
      Object.fromEntries(urls.map(url => [url, never])),
    );
    const remote = remoteImages({fetch, answerMs: 50, timeoutMs: 10_000});
    const started = Date.now();
    await remote.get(urls);
    remote.done();
    expect(Date.now() - started).toBeLessThan(2000);
    // The first six went out at once and got no answer; the rest were never asked.
    expect(asked).toHaveLength(6);
    const reasons = remote.summary().failed.map(f => f.reason);
    expect(reasons.slice(0, 6)).toEqual(
      Array(6).fill('no answer within 0.05 s'),
    );
    expect(reasons.slice(6)).toEqual(
      Array(4).fill(
        'not asked: the network answered none of the first images the render asked for',
      ),
    );
  });

  it('counts no error status as the network answering, as a proxy with no way out answers', async () => {
    const {fetch, asked} = fetchFrom({
      'https://pay.example/badge.png': respond('', {status: 403}),
      'https://cdn.example/a.svg': never,
      'https://cdn.example/b.svg': never,
    });
    const remote = remoteImages({fetch, answerMs: 50, timeoutMs: 10_000});
    const started = Date.now();
    await remote.get([
      'https://pay.example/badge.png',
      'https://cdn.example/a.svg',
    ]);
    await remote.get(['https://cdn.example/b.svg']);
    remote.done();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(asked.map(a => a.url)).not.toContain('https://cdn.example/b.svg');
    expect(remote.summary().failed.map(f => f.reason)).toEqual([
      'the server answered 403',
      'no answer within 0.05 s',
      'not asked: the network answered none of the first images the render asked for',
    ]);
  });

  it('keeps asking when the network answers, even if one server is slow', async () => {
    const {fetch, asked} = fetchFrom({
      'https://slow.example/a.png': never,
      'https://slow.example/b.png': never,
      'https://example.com/ok.png': png(),
      'https://example.com/late.png': png(),
    });
    const remote = remoteImages({fetch, answerMs: 50, timeoutMs: 10_000});
    await remote.get([
      'https://example.com/ok.png',
      'https://slow.example/a.png',
      'https://slow.example/b.png',
    ]);
    await remote.get(['https://example.com/late.png']);
    remote.done();
    expect(asked.map(a => a.url)).toContain('https://example.com/late.png');
    expect(remote.summary().fetched).toEqual([
      'https://example.com/ok.png',
      'https://example.com/late.png',
    ]);
  });

  it('lists the addresses in the order the page names them, whichever answers first', async () => {
    const {fetch} = fetchFrom({
      'https://example.com/slow.png': () =>
        new Promise(resolve => setTimeout(() => resolve(png()), 40)),
      'https://example.com/fast.png': png(),
    });
    const remote = remoteImages({fetch});
    await remote.get([
      'https://example.com/slow.png',
      'https://example.com/fast.png',
    ]);
    remote.done();
    expect(remote.summary().fetched).toEqual([
      'https://example.com/slow.png',
      'https://example.com/fast.png',
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

describe('imageRequest', () => {
  /** @type {http.Server} */
  let server;
  let base = '';
  /** @type {http.IncomingHttpHeaders[]} */
  const seen = [];
  let holdClosed = false;
  /** @type {() => void} */
  let held = () => {};
  const heldArrived = new Promise(resolve => {
    held = () => resolve(undefined);
  });
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      seen.push(req.headers);
      if (req.url === '/hold') {
        req.on('close', () => {
          holdClosed = true;
        });
        held();
        return;
      }
      if (req.url === '/moved') {
        res.writeHead(302, {location: '/a.png'});
        res.end();
        return;
      }
      if (req.url === '/broken') {
        res.writeHead(302, {location: 'http://[bad'});
        res.end();
        return;
      }
      if (req.url === '/away') {
        res.writeHead(302, {location: 'https://example.com/a.png'});
        res.end();
        return;
      }
      if (req.url === '/userinfo') {
        res.writeHead(302, {
          location: `http://user:secret@${req.headers.host}/a.png`,
        });
        res.end();
        return;
      }
      res.writeHead(200, {'content-type': 'image/png'});
      res.end(PNG);
    });
    await new Promise(resolve =>
      server.listen(0, '127.0.0.1', () => resolve(undefined)),
    );
    const address = /** @type {import('node:net').AddressInfo} */ (
      server.address()
    );
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(() => resolve(undefined)));
  });

  it('reads an image through a redirect of the same scheme, with no cookie and no open connection', async () => {
    const answer = await imageRequest(
      `${base}/moved`,
      {headers: {accept: 'image/*'}},
      /** @type {any} */ (http),
    );
    expect(answer.ok).toBe(true);
    expect(answer.url).toBe(`${base}/a.png`);
    expect(answer.headers.get('content-type')).toBe('image/png');
    const chunks = [];
    for await (const chunk of answer.body) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(PNG);
    expect(
      seen.every(
        headers =>
          headers.cookie === undefined && headers.authorization === undefined,
      ),
    ).toBe(true);
    expect(seen.at(-1)?.connection).toBe('close');
  });

  it('follows no redirect to an address that holds a user name or password, and sends none', async () => {
    const before = seen.length;
    const answer = await imageRequest(
      `${base}/userinfo`,
      {},
      /** @type {any} */ (http),
    );
    expect(answer.ok).toBe(false);
    expect(answer.credentialsLocation).toBe(true);
    expect(seen.length - before).toBe(1);
    expect(seen.every(headers => headers.authorization === undefined)).toBe(
      true,
    );
  });

  it('answers a redirect to an address that is not valid as such, and never throws', async () => {
    const answer = await imageRequest(
      `${base}/broken`,
      {},
      /** @type {any} */ (http),
    );
    expect(answer.ok).toBe(false);
    expect(answer.badLocation).toBe(true);
  });

  it('does not follow a redirect to another scheme', async () => {
    const answer = await imageRequest(
      `${base}/away`,
      {},
      /** @type {any} */ (http),
    );
    expect(answer.ok).toBe(false);
    expect(answer.url).toBe('https://example.com/a.png');
  });

  it('closes its socket at once when the render stops it', async () => {
    const stop = new AbortController();
    const asked = imageRequest(
      `${base}/hold`,
      {signal: stop.signal},
      /** @type {any} */ (http),
    );
    await heldArrived;
    stop.abort();
    await expect(asked).rejects.toThrow();
    // The server sees the closed socket in a later turn of the event loop,
    // which a loaded machine can delay past any fixed wait. The request has
    // no timeout, so nothing but the stop closes this socket.
    await vi.waitFor(() => expect(holdClosed).toBe(true), {
      timeout: 10_000,
      interval: 10,
    });
  });
});

describe('imageSinks', () => {
  it('counts an address as an image only where an HTML element shows one from it', () => {
    const shown = [
      ['img', 'src'],
      ['input', 'src'],
      ['img', 'srcset'],
      ['source', 'srcset'],
      ['video', 'poster'],
    ];
    for (const [tag, attr] of shown) expect(showsImage(tag, attr)).toBe(true);
    const other = [
      ['iframe', 'src'],
      ['video', 'src'],
      ['audio', 'src'],
      ['source', 'src'],
      ['script', 'src'],
      ['img', 'poster'],
      ['a', 'href'],
    ];
    for (const [tag, attr] of other) expect(showsImage(tag, attr)).toBe(false);
  });

  it('gives the carried data where the browser takes an image address, and nowhere else', async () => {
    const data = 'data:image/png;base64,QUJD';
    const dom = new JSDOM('<!doctype html><body></body>', {
      runScripts: 'outside-only',
    });
    dom.window.eval(imageSinks([['https://x.example/a.png', data]]));
    const doc = dom.window.document;
    const img = doc.createElement('img');
    img.src = 'https://x.example/a.png';
    expect(img.getAttribute('src')).toBe(data);
    img.setAttribute('src', 'https://x.example/a.png#top');
    expect(img.getAttribute('src')).toBe(data);
    // Another query can name another image, so it keeps its own address.
    img.setAttribute('src', 'https://x.example/a.png?u=alex');
    expect(img.getAttribute('src')).toBe('https://x.example/a.png?u=alex');
    img.setAttribute(
      'srcset',
      'https://x.example/a.png 1x, https://y.example/b.png 2x',
    );
    expect(img.getAttribute('srcset')).toBe(
      `${data} 1x, https://y.example/b.png 2x`,
    );
    // A style takes the carried data before the browser next draws: set on
    // an element in the page, or on one the script then adds.
    const settle = () => pageTasks(dom);
    const box = doc.createElement('div');
    doc.body.append(box);
    box.style.backgroundImage = 'url("https://x.example/a.png")';
    await settle();
    expect(box.style.backgroundImage).toContain(data);
    box.style.setProperty('--hero', 'url(https://x.example/a.png#top)');
    await settle();
    expect(box.style.getPropertyValue('--hero')).toContain(data);
    box.setAttribute('style', 'background: url(https://x.example/a.png)');
    expect(box.getAttribute('style')).toContain(data);
    const later = doc.createElement('section');
    later.innerHTML =
      '<p style="background-image: url(https://x.example/a.png)">Later</p>';
    doc.body.append(later);
    await settle();
    expect(later.querySelector('p')?.getAttribute('style')).toContain(data);
    const button = doc.createElement('input');
    button.src = 'https://x.example/a.png';
    expect(button.getAttribute('src')).toBe(data);
    const video = doc.createElement('video');
    video.setAttribute('poster', 'https://x.example/a.png');
    expect(video.getAttribute('poster')).toBe(data);
    // An element that takes the address for something else keeps it: a
    // frame's or a video's `src`.
    const frame = doc.createElement('iframe');
    frame.setAttribute('src', 'https://x.example/a.png');
    expect(frame.getAttribute('src')).toBe('https://x.example/a.png');
    video.src = 'https://x.example/a.png';
    expect(video.getAttribute('src')).toBe('https://x.example/a.png');
    // A link, a text and an unknown address keep what the page gave them.
    const link = doc.createElement('a');
    link.setAttribute('href', 'https://x.example/a.png');
    expect(link.getAttribute('href')).toBe('https://x.example/a.png');
    const other = doc.createElement('img');
    other.src = 'https://y.example/b.png';
    expect(other.getAttribute('src')).toBe('https://y.example/b.png');
    dom.window.close();
  });
});

/**
 * A rendered file opened as a browser opens it, with its script running.
 * @param {string} html
 */
async function opened(html) {
  const dom = await pageDom(html);
  const settle = () => pageTasks(dom);
  await pageDrawn(dom);
  const doc = dom.window.document;
  return {
    doc,
    /** @param {string} selector */
    click: async selector => {
      /** @type {any} */ (doc.querySelector(`#${ROOT_ID} ${selector}`)).click();
      await settle();
    },
    close: () => dom.window.close(),
  };
}

describe('a render with images from the web', () => {
  it('fetches nothing for a page it refuses as not Astryx', async () => {
    const dir = makeLinkedFixture('astryx-render-remote-refused-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() {\n  return <img src="https://example.com/shoe.png" alt="Shoe" />;\n}\n',
      );
      const {fetch, asked} = fetchFrom({'https://example.com/shoe.png': png()});
      await expect(
        renderPage(file, {cwd: dir, remoteImages: {fetch}}),
      ).rejects.toMatchObject({code: 'ERR_RENDER_NOT_ASTRYX'});
      expect(asked).toEqual([]);
    } finally {
      removeLinkedFixture(dir);
    }
  });

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
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({'https://example.com/shoe.png': png()});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const markup = renderedMarkupOf(page.html) ?? '';
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(markup).toContain(`src="${data}"`);
      expect(markup).toContain('src="http://example.com/plain.png"');
      expect(asked.map(a => a.url)).toEqual(['https://example.com/shoe.png']);
      // The script keeps the page's address; the image sinks give the data
      // where the browser takes an image's address.
      const script = page.html.slice(page.html.indexOf('<script type="module">'));
      expect(script).toContain('"https://example.com/shoe.png"');
      // The first paint shows it, so the image sinks read its data there:
      // the file holds it once.
      expect(script).toContain('[["https://example.com/shoe.png",0]]');
      expect(script).not.toContain(data);
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

  it('fetches an address by the image word in its name, never by a word that only holds one', async () => {
    const dir = makeLinkedFixture('astryx-render-names-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'const links = {',
          "  logoutUrl: 'https://example.com/logout',",
          "  apiConfigUrl: 'https://example.com/api/config',",
          "  discoverUrl: 'https://example.com/discover',",
          "  recoveryUrl: 'https://example.com/recovery',",
          '};',
          "const team = {iconUrl: 'https://example.com/team-icon'};",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <a href={links.logoutUrl}>Out</a>',
          '      <button onClick={() => setOpen(true)}>Team</button>',
          '      {open && <img src={team.iconUrl} alt="Team" />}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://example.com/team-icon': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url)).toEqual(['https://example.com/team-icon']);
      expect(page.remoteImages?.fetched).toEqual([
        'https://example.com/team-icon',
      ]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('keeps a fetched background image once the script draws the page', async () => {
    const dir = makeLinkedFixture('astryx-render-style-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <div style={{backgroundImage: "url(https://example.com/bg.png)"}}>Hero</div>; }\nimport "@astryxdesign/core/astryx.css";\n',
      );
      const {fetch} = fetchFrom({'https://example.com/bg.png': png()});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(renderedMarkupOf(page.html)).toContain(data);
      // Drawn again by the script, the style still shows the carried data.
      const dom = await pageDom(page.html);
      await pageDrawn(dom);
      const box = dom.window.document.querySelector(`#${ROOT_ID} div`);
      /** @type {any} */ (box).style.backgroundImage =
        'url(https://example.com/bg.png)';
      await pageTasks(dom);
      expect(/** @type {any} */ (box).style.backgroundImage).toContain(data);
      dom.window.close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('requests an API address an image-named property holds, and keeps it with no warning when the answer is not an image', async () => {
    const dir = makeLinkedFixture('astryx-render-api-', ['react', 'react-dom']);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const config = {imageUploadUrl: 'https://api.example.com/v1/upload'};",
          'export default function Page() {',
          '  const [sent, setSent] = useState(false);',
          "  return <main><button onClick={() => fetch(config.imageUploadUrl, {method: 'POST'}).then(() => setSent(true))}>Upload</button>{sent && <p>Sent</p>}</main>;",
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({
        'https://api.example.com/v1/upload': respond('{"ok":true}', {
          headers: {'content-type': 'application/json'},
        }),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toEqual([]);
      expect(page.remoteImages?.failed).toEqual([
        {url: 'https://api.example.com/v1/upload', reason: 'not an image'},
      ]);
      expect(page.html.slice(page.html.lastIndexOf('<script type="module">'))).toContain(
        '"https://api.example.com/v1/upload"',
      );
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it("never asks for a link's address, even when it names an image file", async () => {
    const dir = makeLinkedFixture('astryx-render-link-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <a href="https://example.com/first.png">First</a>',
          '      <button onClick={() => setOpen(true)}>More</button>',
          '      {open && <a href="https://example.com/brochure.png">Brochure</a>}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      expect(renderedMarkupOf(page.html)).toContain(
        'href="https://example.com/first.png"',
      );
      expect(page.html.slice(page.html.lastIndexOf('<script type="module">'))).toContain(
        '"https://example.com/brochure.png"',
      );
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for an image the script draws later when its server answers an error status', async () => {
    const dir = makeLinkedFixture('astryx-render-late-404-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const user = {avatarUrl: 'https://example.com/gone'};",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Me</button>{open && <img src={user.avatarUrl} alt="Me" />}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({
        'https://example.com/gone': respond('', {status: 404}),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          "https://example.com/gone, which the page's code names as an image, is loaded from the network when the script draws it, which a sandboxed page cannot reach; save it beside the page and import it instead. The render could not fetch it: the server answered 404.",
      });
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for an address counted by its path when its server answers with a page', async () => {
    const dir = makeLinkedFixture('astryx-render-late-page-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const rows = [{url: 'https://example.com/shoe.png'}];",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Show</button>{open && rows.map(r => <img key={r.url} src={r.url} alt="" />)}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({
        'https://example.com/shoe.png': respond(
          '<!doctype html><title>Sign in</title>',
          {headers: {'content-type': 'text/html'}},
        ),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          "https://example.com/shoe.png, which the page's code names as an image, is loaded from the network when the script draws it, which a sandboxed page cannot reach; save it beside the page and import it instead. The render could not fetch it: not an image.",
      });
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it("never asks for an address a variable holds when the page uses it as a link's address", async () => {
    const dir = makeLinkedFixture('astryx-render-link-var-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const fullSize = 'https://cdn.example.com/shoe-large.png';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>More</button>{open && <a href={fullSize}>Full size</a>}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      expect(page.html.slice(page.html.lastIndexOf('<script type="module">'))).toContain(
        '"https://cdn.example.com/shoe-large.png"',
      );
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('fetches no first part of an address built with +, and warns for the built address', async () => {
    const dir = makeLinkedFixture('astryx-render-plus-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [size, setSize] = useState(0);',
          '  return <main><button onClick={() => setSize(640)}>Show</button>{size > 0 && <img src={\'https://cdn.example.com/hero.png?size=\' + size} alt="" />}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      expect(page.html.slice(page.html.lastIndexOf('<script type="module">'))).toContain(
        'https://cdn.example.com/hero.png?size=',
      );
      expect(
        page.warnings.some(
          w =>
            w.code === 'remote-asset' &&
            w.message.includes('builds an image address in code'),
        ),
      ).toBe(true);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('carries each candidate of a srcSet the script draws later', async () => {
    const dir = makeLinkedFixture('astryx-render-srcset-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Show</button>{open && <img srcSet="https://example.com/a.png 1x, https://example.com/a@2x.png 2x" alt="" />}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://example.com/a.png': png(),
        'https://example.com/a@2x.png': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url).sort()).toEqual([
        'https://example.com/a.png',
        'https://example.com/a@2x.png',
      ]);
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const {doc, click, close} = await opened(page.html);
      await click('button');
      expect(doc.querySelector(`#${ROOT_ID} img`)?.getAttribute('srcset')).toBe(
        `${data} 1x, ${data} 2x`,
      );
      close();
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toEqual([]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('carries the https candidates of a srcSet written over several lines, or listed beside a local file', async () => {
    const dir = makeLinkedFixture('astryx-render-srcset-lines-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <button onClick={() => setOpen(true)}>Show</button>',
          '      {open && <img id="lines" alt="" srcSet={`',
          '        https://example.com/m.png 1x,',
          '        https://example.com/m@2x.png 2x',
          '      `} />}',
          '      {open && <img id="mixed" alt="" srcSet="./local.png 1x, https://example.com/l@2x.png 2x" />}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      fs.writeFileSync(path.join(dir, 'local.png'), PNG);
      const {fetch, asked} = fetchFrom({
        'https://example.com/m.png': png(),
        'https://example.com/m@2x.png': png(),
        'https://example.com/l@2x.png': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url).sort()).toEqual([
        'https://example.com/l@2x.png',
        'https://example.com/m.png',
        'https://example.com/m@2x.png',
      ]);
      expect([...(page.remoteImages?.fetched ?? [])].sort()).toEqual([
        'https://example.com/l@2x.png',
        'https://example.com/m.png',
        'https://example.com/m@2x.png',
      ]);
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const {doc, click, close} = await opened(page.html);
      await click('button');
      expect(doc.querySelector(`#${ROOT_ID} #lines`)?.getAttribute('srcset')).toBe(
        `${data} 1x, ${data} 2x`,
      );
      expect(doc.querySelector(`#${ROOT_ID} #mixed`)?.getAttribute('srcset')).toContain(
        `${data} 2x`,
      );
      close();
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toEqual([]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for a srcSet the code builds when any of its candidates is an https image', async () => {
    const dir = makeLinkedFixture('astryx-render-srcset-built-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [id, setId] = useState(0);',
          '  return <main><button onClick={() => setId(3)}>Show</button>{id > 0 && <img alt="" srcSet={`./${id}.png 1x, https://cdn.example.com/${id}@2x.png 2x`} />}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      const built = page.warnings.filter(
        w =>
          w.code === 'remote-asset' &&
          w.message.includes('builds an image address in code'),
      );
      expect(built).toHaveLength(1);
      expect(built[0].message).toContain('https://cdn.example.com/${id}@2x.png');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('reads an https image a first-paint srcset lists from that srcset, so the file holds it once', async () => {
    const dir = makeLinkedFixture('astryx-render-srcset-read-', ['react', 'react-dom']);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const b = 'https://cdn.example.com/b.png';",
          "const a1 = 'https://cdn.example.com/a1.png';",
          "const a2 = 'https://cdn.example.com/a2.png';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <img srcSet="https://cdn.example.com/b.png 2x" alt="B" />',
          '      <img srcSet={`${a1} 1x, ${a2} 2x`} alt="A" />',
          '      <button onClick={() => setOpen(true)}>Show</button>',
          '      {open && <img src={b} alt="LaterB" />}',
          '      {open && <img src={a2} alt="LaterA2" />}',
          '    </main>',
          '  );',
          '}',
          "import '@astryxdesign/core/astryx.css';",
          '',
        ].join('\n'),
      );
      /** @param {number} n */
      const image = n => respond(Buffer.concat([PNG, Buffer.from([n])]), {headers: {'content-type': 'image/png'}});
      const {fetch} = fetchFrom({
        'https://cdn.example.com/b.png': image(1),
        'https://cdn.example.com/a1.png': image(2),
        'https://cdn.example.com/a2.png': image(3),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const dataOf = (/** @type {number} */ n) => `data:image/png;base64,${Buffer.concat([PNG, Buffer.from([n])]).toString('base64')}`;
      // Each image's data is in the file once: in the first paint's srcset.
      for (const n of [1, 2, 3]) expect(page.html.split(dataOf(n)).length - 1, String(n)).toBe(1);
      const dom = await pageDom(page.html);
      const settle = () => pageTasks(dom);
      await pageDrawn(dom);
      const doc = dom.window.document;
      expect(doc.querySelector(`#${ROOT_ID} img[alt="B"]`)?.getAttribute('srcset')).toBe(`${dataOf(1)} 2x`);
      expect(doc.querySelector(`#${ROOT_ID} img[alt="A"]`)?.getAttribute('srcset')).toBe(`${dataOf(2)} 1x, ${dataOf(3)} 2x`);
      /** @type {HTMLButtonElement} */ (doc.querySelector(`#${ROOT_ID} button`)).click();
      await settle();
      expect(doc.querySelector(`#${ROOT_ID} img[alt="LaterB"]`)?.getAttribute('src')).toBe(dataOf(1));
      expect(doc.querySelector(`#${ROOT_ID} img[alt="LaterA2"]`)?.getAttribute('src')).toBe(dataOf(3));
      dom.window.close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('keeps a srcSet literal that lists an https candidate and a local one as written in the script, so the code reads the address it wrote', async () => {
    const dir = makeLinkedFixture('astryx-render-mixed-srcset-', ['react', 'react-dom']);
    try {
      fs.writeFileSync(path.join(dir, 'b.png'), Buffer.concat([PNG, Buffer.from([5])]));
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const SET = 'https://cdn.example.com/a.png 1x, ./b.png 2x';",
          'export default function Page() {',
          "  const [first, setFirst] = useState('');",
          '  return (',
          '    <main>',
          '      <img srcSet={SET} alt="M" />',
          "      <button onClick={() => setFirst(SET.split(' ')[0])}>Read</button>",
          '      <p>{first}</p>',
          '    </main>',
          '  );',
          '}',
          "import '@astryxdesign/core/astryx.css';",
          '',
        ].join('\n'),
      );
      const {fetch} = fetchFrom({
        'https://cdn.example.com/a.png': respond(Buffer.concat([PNG, Buffer.from([4])]), {headers: {'content-type': 'image/png'}}),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const dataOf = (/** @type {number} */ n) => `data:image/png;base64,${Buffer.concat([PNG, Buffer.from([n])]).toString('base64')}`;
      const dom = await pageDom(page.html);
      const settle = () => pageTasks(dom);
      await pageDrawn(dom);
      const doc = dom.window.document;
      expect(doc.querySelector(`#${ROOT_ID} img[alt="M"]`)?.getAttribute('srcset')).toBe(`${dataOf(4)} 1x, ${dataOf(5)} 2x`);
      /** @type {HTMLButtonElement} */ (doc.querySelector(`#${ROOT_ID} button`)).click();
      await settle();
      expect(doc.querySelector(`#${ROOT_ID} p`)?.textContent).toBe('https://cdn.example.com/a.png');
      dom.window.close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('gives a first-paint https image its data from the first paint, with no second copy, and leaves an address the code extends as written', async () => {
    const dir = makeLinkedFixture('astryx-render-extend-carried-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const hero = 'https://cdn.example.com/hero.png';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><img src={hero} alt="Now" /><button onClick={() => setOpen(true)}>Show</button>{open && <img src={`${hero}?w=640`} alt="Later" />}</main>;',
          '}',
          "import '@astryxdesign/core/astryx.css';",
          '',
        ].join('\n'),
      );
      const {fetch} = fetchFrom({'https://cdn.example.com/hero.png': png()});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const script = page.html.slice(page.html.indexOf('<script type="module">', page.html.indexOf('application/x-astryx-source')));
      // The script holds no copy: the image sinks read the first paint's.
      expect(script).not.toContain(data);
      expect(script).toContain('__astryxCarried[i]');
      const dom = await pageDom(page.html);
      const settle = () => pageTasks(dom);
      await pageDrawn(dom);
      const doc = dom.window.document;
      expect(doc.querySelector(`#${ROOT_ID} img[alt="Now"]`)?.getAttribute('src')).toBe(data);
      /** @type {HTMLButtonElement} */ (doc.querySelector(`#${ROOT_ID} button`)).click();
      await settle();
      // An address the code extends with a query keeps it, as the sinks read
      // only the exact address or one with a fragment.
      expect(doc.querySelector(`#${ROOT_ID} img[alt="Later"]`)?.getAttribute('src')).toBe('https://cdn.example.com/hero.png?w=640');
      dom.window.close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('reads a srcSet address that holds commas whole, and leaves a srcSet it carried nothing from as written', async () => {
    const dir = makeLinkedFixture('astryx-render-srcset-commas-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <button onClick={() => setOpen(true)}>Show</button>',
          '      {open && <img srcSet="https://img.example.com/upload/c_fill,w_400/a.png 1x, https://img.example.com/upload/c_fill,w_800/a.png 2x" alt="" />}',
          '      {open && <img srcSet="https://offline.example.com/b.png 1x, https://offline.example.com/b@2x.png 2x" alt="" />}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://img.example.com/upload/c_fill,w_400/a.png': png(),
        'https://img.example.com/upload/c_fill,w_800/a.png': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url)).toEqual(
        expect.arrayContaining([
          'https://img.example.com/upload/c_fill,w_400/a.png',
          'https://img.example.com/upload/c_fill,w_800/a.png',
        ]),
      );
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const {doc, click, close} = await opened(page.html);
      await click('button');
      const sets = [...doc.querySelectorAll(`#${ROOT_ID} img`)].map(img =>
        img.getAttribute('srcset'),
      );
      expect(sets).toEqual([
        `${data} 1x, ${data} 2x`,
        'https://offline.example.com/b.png 1x, https://offline.example.com/b@2x.png 2x',
      ]);
      close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('asks for no src of an element that shows no image, such as an iframe or a video', async () => {
    const dir = makeLinkedFixture('astryx-render-iframe-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <main><iframe src="https://example.com/embed.png" title="x" /><video src="https://example.com/clip.png" /></main>; }\nimport "@astryxdesign/core/astryx.css";\n',
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      expect(page.remoteImages).toBeUndefined();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('fetches an address a variable holds where the page shows it in an image, and none it gives only a frame', async () => {
    const dir = makeLinkedFixture('astryx-render-variable-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const logoUrl = 'https://cdn.example.com/logo';",
          "const embed = 'https://player.example.com/clip.png';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Show</button>{open && <><img src={logoUrl} alt="Logo" /><iframe src={embed} title="Clip" /></>}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://cdn.example.com/logo': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url)).toEqual(['https://cdn.example.com/logo']);
      expect(page.remoteImages?.fetched).toEqual([
        'https://cdn.example.com/logo',
      ]);
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toEqual([]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it("lists an object's src that answers with another type, with no warning, and asks for no clip", async () => {
    const dir = makeLinkedFixture('astryx-render-player-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const player = {src: 'https://player.example.com/embed/1'};",
          "const clip = {src: 'https://cdn.example.com/clip.mp4'};",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Play</button>{open && <><iframe src={player.src} title="Player" /><video src={clip.src} /></>}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://player.example.com/embed/1': respond(
          '<!doctype html><p>Player</p>',
          {headers: {'content-type': 'text/html'}},
        ),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url)).toEqual([
        'https://player.example.com/embed/1',
      ]);
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toEqual([]);
      expect(page.remoteImages?.failed).toEqual([
        {url: 'https://player.example.com/embed/1', reason: 'not an image'},
      ]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it("puts no carried data in a frame's src in the first paint, and adds no fetch's reason to its warning", async () => {
    const dir = makeLinkedFixture('astryx-render-frame-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "const player = {src: 'https://player.example.com/embed/1'};",
          'export default function Page() {',
          '  return <main><iframe src={player.src} title="Player" /></main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const frameWarnings = (/** @type {any} */ page) =>
        page.warnings.filter(
          (/** @type {any} */ w) =>
            w.code === 'remote-asset' &&
            w.message.startsWith('https://player.example.com/embed/1'),
        );
      // An answer that is an image: the frame still keeps its address.
      const answered = fetchFrom({
        'https://player.example.com/embed/1': png(),
      });
      const shown = await renderPage(file, {
        cwd: dir,
        remoteImages: {fetch: answered.fetch},
      });
      expect(renderedMarkupOf(shown.html)).toContain(
        'src="https://player.example.com/embed/1"',
      );
      expect(renderedMarkupOf(shown.html)).not.toMatch(/<iframe[^>]*src="data:/);
      // An answer of another type: the frame's warning names the network,
      // not the fetch.
      const page = await renderPage(file, {
        cwd: dir,
        remoteImages: {
          fetch: fetchFrom({
            'https://player.example.com/embed/1': respond(
              '<!doctype html><p>Player</p>',
              {headers: {'content-type': 'text/html'}},
            ),
          }).fetch,
        },
      });
      for (const rendered of [shown, page]) {
        const warned = frameWarnings(rendered);
        expect(warned).toHaveLength(1);
        expect(warned[0].message).not.toContain('could not fetch');
      }
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('counts a variable by the reads in its own file', async () => {
    const dir = makeLinkedFixture('astryx-render-exported-', [
      'react',
      'react-dom',
    ]);
    try {
      fs.writeFileSync(
        path.join(dir, 'avatars.js'),
        "export const DEFAULT_AVATAR = 'https://cdn.example.com/default-avatar';\n",
      );
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "import {DEFAULT_AVATAR} from './avatars.js';",
          "const own = 'https://cdn.example.com/own-avatar';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Show</button>{open && <><img src={DEFAULT_AVATAR} alt="" /><img src={own} alt="" /></>}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({
        'https://cdn.example.com/own-avatar': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked.map(a => a.url)).toEqual([
        'https://cdn.example.com/own-avatar',
      ]);
      expect(page.remoteImages?.fetched).toEqual([
        'https://cdn.example.com/own-avatar',
      ]);
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for an image address a helper builds by its extension, and for no link it builds', async () => {
    const dir = makeLinkedFixture('astryx-render-helper-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'function avatar(id) {',
          '  return `https://cdn.example.com/${id}.png`;',
          '}',
          'export default function Page() {',
          '  const [ids, setIds] = useState([]);',
          '  return <main><button onClick={() => setIds([1, 2])}>Show</button>{ids.map(id => <img key={id} src={avatar(id)} alt="" />)}{ids.map(id => <a key={`a${id}`} href={`https://cdn.example.com/${id}.png`}>Full</a>)}{ids.map(id => <video key={`v${id}`} src={\'https://cdn.example.com/\' + id + \'.mp4\'} />)}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      const built = page.warnings.filter(
        w =>
          w.code === 'remote-asset' &&
          w.message.includes('builds an image address in code'),
      );
      expect(built).toHaveLength(1);
      expect(built[0].message).toContain('https://cdn.example.com/${id}.png');
      expect(built[0].message).toContain('page.jsx:3');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for an address built in code only where a whole one would count as an image', async () => {
    const dir = makeLinkedFixture('astryx-render-built-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [id, setId] = useState(0);',
          '  return <main><button onClick={() => setId(7)}>Show</button>{id > 0 && <><img src={`https://cdn.example.com/${id}.png`} alt="" /><video src={`https://cdn.example.com/${id}.mp4`} /><iframe src={`https://player.example.com/${id}`} title="Player" /></>}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch, asked} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(asked).toEqual([]);
      const built = page.warnings.filter(
        w =>
          w.code === 'remote-asset' &&
          w.message.includes('builds an image address in code'),
      );
      expect(built).toHaveLength(1);
      expect(built[0].message).toContain('https://cdn.example.com/${id}.png');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('draws later images from the carried data where the browser takes their address, and leaves every other use of an address as written', async () => {
    const dir = makeLinkedFixture('astryx-render-sinks-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const hero = 'https://cdn.example.com/h.png';",
          "const photos = [{url: 'https://cdn.example.com/p.png'}];",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          "  const sized = photos.map(photo => { const url = new URL(photo.url); url.searchParams.set('w', '200'); return url.href; });",
          '  return (',
          '    <main>',
          '      <button onClick={() => setOpen(true)}>Show</button>',
          '      {open && (',
          '        <section>',
          '          <a href={hero}><img src={hero} alt="Hero" /></a>',
          '          <img src={`${hero}?w=640`} alt="Wide" />',
          '          <img src={sized[0]} alt="Sized" />',
          '          <p>{hero}</p>',
          '          <p>{new URL(hero).hostname}</p>',
          '          <div style={{backgroundImage: `url(${photos[0].url})`}}>Back</div>',
          '        </section>',
          '      )}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({
        'https://cdn.example.com/h.png': png(),
        'https://cdn.example.com/p.png': png(),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.remoteImages?.fetched.sort()).toEqual([
        'https://cdn.example.com/h.png',
        'https://cdn.example.com/p.png',
      ]);
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const {doc, click, close} = await opened(page.html);
      await click('button');
      const src = (/** @type {string} */ alt) =>
        doc.querySelector(`#${ROOT_ID} img[alt="${alt}"]`)?.getAttribute('src');
      // Every image the file carries draws from its data; an address the
      // code gives another query is another image, which keeps its address.
      expect(src('Hero')).toBe(data);
      expect(src('Wide')).toBe('https://cdn.example.com/h.png?w=640');
      expect(src('Sized')).toBe('https://cdn.example.com/p.png?w=200');
      expect(
        doc.querySelector(`#${ROOT_ID} div`)?.getAttribute('style'),
      ).toContain(data);
      // A link, a text and the URL API read the page's own address.
      expect(doc.querySelector(`#${ROOT_ID} a`)?.getAttribute('href')).toBe(
        'https://cdn.example.com/h.png',
      );
      expect(
        [...doc.querySelectorAll(`#${ROOT_ID} p`)].map(p => p.textContent),
      ).toEqual(['https://cdn.example.com/h.png', 'cdn.example.com']);
      close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('keeps an address with no scheme as written in the script, and draws its image from the carried data', async () => {
    const dir = makeLinkedFixture('astryx-render-no-scheme-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const hero = '//cdn.example.com/h.png';",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return (',
          '    <main>',
          '      <img src={hero} alt="Hero" />',
          '      <button onClick={() => setOpen(true)}>Show</button>',
          '      {open && <section><a href={hero}>Full size</a><p>{hero}</p><img src={`${hero}?w=640`} alt="Wide" /></section>}',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({'https://cdn.example.com/h.png': png()});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(renderedMarkupOf(page.html)).toContain(`src="${data}"`);
      const {doc, click, close} = await opened(page.html);
      await click('button');
      const src = (/** @type {string} */ alt) =>
        doc.querySelector(`#${ROOT_ID} img[alt="${alt}"]`)?.getAttribute('src');
      expect(src('Hero')).toBe(data);
      // A link, a text and another query read the page's own address.
      expect(doc.querySelector(`#${ROOT_ID} a`)?.getAttribute('href')).toBe(
        '//cdn.example.com/h.png',
      );
      expect(doc.querySelector(`#${ROOT_ID} p`)?.textContent).toBe(
        '//cdn.example.com/h.png',
      );
      expect(src('Wide')).toBe('//cdn.example.com/h.png?w=640');
      close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('keeps the data of a local image whose name holds a comma and a space when the script draws it', async () => {
    const dir = makeLinkedFixture('astryx-render-comma-name-', [
      'react',
      'react-dom',
    ]);
    try {
      fs.writeFileSync(path.join(dir, 'Logo, dark.png'), PNG);
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          'export default function Page() {',
          '  const [count, setCount] = useState(0);',
          '  return (',
          '    <main>',
          '      <img src="./Logo, dark.png" alt="Logo" />',
          '      <button onClick={() => setCount(count + 1)}>Clicked {count}</button>',
          '    </main>',
          '  );',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      const {doc, click, close} = await opened(page.html);
      await click('button');
      expect(doc.querySelector(`#${ROOT_ID} button`)?.textContent).toBe(
        'Clicked 1',
      );
      expect(doc.querySelector(`#${ROOT_ID} img`)?.getAttribute('src')).toBe(
        data,
      );
      close();
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('names the whole address of first-paint images that differ only by their query', async () => {
    const dir = makeLinkedFixture('astryx-render-query-two-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <main><img src="https://example.com/a.png?w=1" alt="" /><img src="https://example.com/a.png?w=2" alt="" /></main>; }\nimport "@astryxdesign/core/astryx.css";\n',
      );
      const {fetch} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      const messages = page.warnings
        .filter(w => w.code === 'remote-asset')
        .map(w => w.message);
      expect(messages).toHaveLength(2);
      expect(messages[0]).toContain('https://example.com/a.png?w=1');
      expect(messages[1]).toContain('https://example.com/a.png?w=2');
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns once for a first-paint image whose address has a query', async () => {
    const dir = makeLinkedFixture('astryx-render-query-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        'export default function Page() { return <img src="https://example.com/a.png?w=2" alt="" />; }\nimport "@astryxdesign/core/astryx.css";\n',
      );
      const {fetch} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.warnings.filter(w => w.code === 'remote-asset')).toHaveLength(
        1,
      );
    } finally {
      removeLinkedFixture(dir);
    }
  }, 120_000);

  it('warns for an image the script draws later when its fetch fails', async () => {
    const dir = makeLinkedFixture('astryx-render-late-fail-', [
      'react',
      'react-dom',
    ]);
    try {
      const file = path.join(dir, 'page.jsx');
      fs.writeFileSync(
        file,
        [
          "import {useState} from 'react';",
          "const user = {avatarUrl: 'https://example.com/me'};",
          'export default function Page() {',
          '  const [open, setOpen] = useState(false);',
          '  return <main><button onClick={() => setOpen(true)}>Me</button>{open && <img src={user.avatarUrl} alt="Me" />}</main>;',
          '}',
          '', "import '@astryxdesign/core/astryx.css';",
        ].join('\n'),
      );
      const {fetch} = fetchFrom({});
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          "https://example.com/me, which the page's code names as an image, is loaded from the network when the script draws it, which a sandboxed page cannot reach; save it beside the page and import it instead. The render could not fetch it: the network could not reach it.",
      });
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
        'export default function Page() { return <img src="https://example.com/away.png" alt="Away" />; }\nimport "@astryxdesign/core/astryx.css";\n',
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
          'https://example.com/away.png is loaded from the network, which a sandboxed page cannot reach; save it beside the page and import it instead. The render could not fetch it: the network could not reach it.',
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
        '', "import '@astryxdesign/core/astryx.css';",
      ].join('\n');
      fs.writeFileSync(file, source);
      const {fetch, asked} = fetchFrom({
        'https://i.example.com/40?u=alex': png(),
        'https://i.example.com/40?u=jo': png(),
        'https://example.com/not-really-an-image': respond('<html></html>', {
          headers: {'content-type': 'text/html'},
        }),
      });
      const page = await renderPage(file, {cwd: dir, remoteImages: {fetch}});
      // A link or an API address is never fetched; only image-named literals are.
      expect(asked.map(a => a.url).sort()).toEqual([
        'https://example.com/not-really-an-image',
        'https://i.example.com/40?u=alex',
        'https://i.example.com/40?u=jo',
      ]);
      expect(page.remoteImages).toEqual({
        fetched: [
          'https://i.example.com/40?u=alex',
          'https://i.example.com/40?u=jo',
        ],
        failed: [
          {
            url: 'https://example.com/not-really-an-image',
            reason: 'not an image',
          },
        ],
      });
      expect(page.warnings).toContainEqual({
        code: 'remote-asset',
        message:
          '`https://i.example.com/40?u=${item.name}&big=1` (page.jsx:15) builds an image address in code, so the render cannot carry it: the file asks the network for it when the script draws it. Write the address whole, or save the image beside the page and import it.',
      });
      // Opened after the click, offline: the avatars draw from the carried data.
      fs.writeFileSync(path.join(dir, 'page.html'), page.html);
      const dom = await pageDom(page.html);
      const settle = () => pageTasks(dom);
      await pageDrawn(dom);
      const doc = dom.window.document;
      expect(doc.querySelectorAll(`#${ROOT_ID} img`)).toHaveLength(0);
      /** @type {HTMLButtonElement} */ (
        doc.querySelector(`#${ROOT_ID} button`)
      ).click();
      await settle();
      const srcOf = (/** @type {string} */ alt) =>
        doc.querySelector(`#${ROOT_ID} img[alt="${alt}"]`)?.getAttribute('src');
      const data = `data:image/png;base64,${PNG.toString('base64')}`;
      expect(srcOf('Alex')).toBe(data);
      expect(srcOf('Jo')).toBe(data);
      expect(srcOf('Cover')).toBe('https://example.com/not-really-an-image');
      expect(doc.querySelector(`#${ROOT_ID} a`)?.getAttribute('href')).toBe(
        'https://example.com/guide',
      );
      dom.window.close();
      // The way back is the page as written.
      const back = /** @type {any} */ (
        await render('page.html', {
          cwd: dir,
          reverse: true,
          out: 'back/page.jsx',
        })
      );
      expect(back.data.exact).toBe(true);
      expect(fs.readFileSync(path.join(dir, 'back/page.jsx'), 'utf8')).toBe(
        source,
      );
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
        'export default function Page() { return <img src="https://example.com/shoe.png" alt="Shoe" />; }\nimport "@astryxdesign/core/astryx.css";\n',
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
