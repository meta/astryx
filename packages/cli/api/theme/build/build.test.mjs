// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Direct API tests for `themeBuild()` — the programmatic surface behind
 * `astryx theme build` (`@astryxdesign/cli/api`).
 *
 * The CLI suites (cli/commands/build-theme.*.test.mjs) drive `registerTheme`
 * end-to-end; these assert the API contract you get calling `themeBuild()` in
 * code: the typed `theme.build` receipt (with files actually written to disk),
 * that it honors the `cwd` option, stays SILENT under the default noopLogger,
 * returns `null` when there is nothing to build, and rejects unsupported icon
 * registries without creating or changing outputs in build and check modes.
 *
 * `themeBuild` compiles via @astryxdesign/core's generator, so it needs a built
 * core — the `node` project's globalSetup (vitest.global-setup.node.mjs) builds
 * it once before workers fork.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateThemeRulesSplit as mockGenerateThemeRulesSplit,
  generateOnMediaCSS as mockGenerateOnMediaCSS,
} from '@astryxdesign/core/theme';
import {
  themeBuild,
  validateComponentOverridesAgainstRegistry,
  validateThemePrivateInputs,
} from './build.mjs';

// `themeBuild` captures core's generator once at module load. Wrap the two
// CSS-emitting exports in vi.fn (call-through by default) so the receipt tests
// exercise the REAL generator, while the "nothing to build" test can force an
// empty result for a single call — the only way to reach that branch, since
// core's prose element defaults otherwise always ship a non-empty CSS block.
vi.mock('@astryxdesign/core/theme', async importActual => {
  const actual = /** @type {Record<string, unknown>} */ (await importActual());
  return {
    ...actual,
    generateThemeRulesSplit: vi.fn(actual.generateThemeRulesSplit),
    generateOnMediaCSS: vi.fn(actual.generateOnMediaCSS),
  };
});

vi.setConfig({testTimeout: 30000});

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-theme-build-api-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
  // Clear call history only — do NOT restore, which would drop the vi.fn
  // call-through implementations set up in the factory above.
  vi.clearAllMocks();
});

describe('themeBuild() — receipt', () => {
  it('compiles a minimal theme and returns a theme.build receipt with files on disk', async () => {
    const themeFile = path.join(tmpDir, 'apitheme.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'apitheme', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );

    // Resolve `file` against the cwd option (not process.cwd()).
    const result = await themeBuild('apitheme.mjs', {}, {cwd: tmpDir});

    expect(result).not.toBeNull();
    expect(result?.type).toBe('theme.build');
    expect(result?.data.name).toBe('apitheme');
    expect(result?.data.sizeKB).toBeGreaterThan(0);

    // Output paths are cwd-relative and derive from the theme name…
    expect(result?.data.outputs.css).toBe('apitheme.css');
    expect(result?.data.outputs.cssDts).toBe('apitheme.css.d.ts');
    expect(result?.data.outputs.js).toBe('apitheme.js');
    expect(result?.data.outputs.dts).toBe('apitheme.d.ts');
    // …and every declared output actually exists on disk.
    for (const rel of [
      result?.data.outputs.css,
      result?.data.outputs.cssDts,
      result?.data.outputs.js,
      result?.data.outputs.dts,
    ]) {
      expect(
        fs.existsSync(path.join(tmpDir, /** @type {string} */ (rel))),
      ).toBe(true);
    }
    expect(
      fs.readFileSync(path.join(tmpDir, 'apitheme.css.d.ts'), 'utf8'),
    ).toContain('export {};');
  });

  it('emits local tokens and preserves enrollment metadata in the built module', async () => {
    const themeFile = path.join(tmpDir, 'local-theme.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'local-theme',
        localTokens: {
          '--ac-selection-ink': ['#0077b6', '#48cae4'],
        },
        components: {
          badge: {
            'variant:info': {
              backgroundColor: 'var(--ac-selection-ink)',
            },
          },
        },
      };\n`,
    );

    const result = await themeBuild('local-theme.mjs', {}, {cwd: tmpDir});
    const css = fs.readFileSync(path.join(tmpDir, 'local-theme.css'), 'utf8');
    const built = fs.readFileSync(path.join(tmpDir, 'local-theme.js'), 'utf8');

    expect(result?.data.tokenCount).toBe(1);
    expect(css).toContain('--ac-selection-ink: light-dark(#0077b6, #48cae4);');
    expect(built).toContain('localTokens: {');
    expect(built).toContain('__localTokenOwners: {');
    expect(built).toContain('__localTokenLineage: ["local-theme"]');
  });

  it.each(['VAR', 'vAr'])(
    'rejects local-token cycles using %s() before writing outputs',
    async functionName => {
      const themeFile = path.join(tmpDir, 'cyclic-local-theme.mjs');
      fs.writeFileSync(
        themeFile,
        `export default {
          name: 'cyclic-local-theme',
          localTokens: {
            '--astryx-theme-cyclic-local-theme-color-a': '${functionName}(--astryx-theme-cyclic-local-theme-color-b)',
            '--astryx-theme-cyclic-local-theme-color-b': '${functionName}(--astryx-theme-cyclic-local-theme-color-a)',
          },
        };\n`,
      );

      await expect(
        themeBuild('cyclic-local-theme.mjs', {}, {cwd: tmpDir}),
      ).rejects.toThrow(/cycle detected/);
      expect(fs.existsSync(path.join(tmpDir, 'cyclic-local-theme.css'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tmpDir, 'cyclic-local-theme.js'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(tmpDir, 'cyclic-local-theme.d.ts'))).toBe(
        false,
      );
    },
  );

  it('rejects cross-map duplicate token names before writing outputs', async () => {
    const themeFile = path.join(tmpDir, 'duplicate-local-theme.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'duplicate-local-theme',
        tokens: {
          '--astryx-theme-duplicate-local-theme-color-accent': '#0077b6',
        },
        localTokens: {
          '--astryx-theme-duplicate-local-theme-color-accent': '#48cae4',
        },
      };\n`,
    );

    await expect(
      themeBuild('duplicate-local-theme.mjs', {}, {cwd: tmpDir}),
    ).rejects.toThrow(/both tokens and localTokens/);
    expect(fs.existsSync(path.join(tmpDir, 'duplicate-local-theme.css'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, 'duplicate-local-theme.js'))).toBe(
      false,
    );
    expect(fs.existsSync(path.join(tmpDir, 'duplicate-local-theme.d.ts'))).toBe(
      false,
    );
  });

  it('is silent by default (noopLogger) — no console output for a scripted caller', async () => {
    const themeFile = path.join(tmpDir, 'quiet.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'quiet', tokens: { '--color-bg': '#fff' } };\n`,
    );

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const outSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      const result = await themeBuild('quiet.mjs', {}, {cwd: tmpDir});
      expect(result?.type).toBe('theme.build');
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errSpy).not.toHaveBeenCalled();
      expect(outSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
      errSpy.mockRestore();
      outSpy.mockRestore();
    }
  });
});

describe.each(['mjs', 'ts'])('a .%s theme module with no theme export', ext => {
  beforeEach(() => {
    fs.writeFileSync(
      path.join(tmpDir, `none.${ext}`),
      'export const notATheme = 42;\n',
    );
  });

  it('fails the build as a module that does not load a theme', async () => {
    const build = themeBuild(`none.${ext}`, {}, {cwd: tmpDir});
    await expect(build).rejects.toThrow(
      /Could not find a defineTheme\(\) result/,
    );
    await expect(build).rejects.toMatchObject({code: 'ERR_THEME_LOAD'});
  });

  it("fails doctor's private-input check the same way, rather than read its exports as a theme", async () => {
    await expect(
      validateThemePrivateInputs(`none.${ext}`, {cwd: tmpDir}),
    ).rejects.toThrow(/Could not find a defineTheme\(\) result/);
  });
});

describe('themeBuild() — a theme module that does not load', () => {
  it('fails with the import error, rather than build the theme from the file text', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'unresolved.mjs'),
      "import './missing-helper.mjs';\nexport default {name: 'unresolved', tokens: {'--color-bg': '#000'}};\n",
    );
    await expect(
      themeBuild('unresolved.mjs', {}, {cwd: tmpDir}),
    ).rejects.toThrow(
      /Failed to load theme from .*unresolved\.mjs: .*missing-helper\.mjs/s,
    );
    expect(fs.existsSync(path.join(tmpDir, 'unresolved.css'))).toBe(false);
  });

  it('fails with the error the module throws, rather than build the theme from the file text', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'throws.mjs'),
      "throw new Error('the theme module failed');\nexport default {name: 'throws', tokens: {'--color-bg': '#000'}};\n",
    );
    await expect(themeBuild('throws.mjs', {}, {cwd: tmpDir})).rejects.toThrow(
      /the theme module failed/,
    );
    expect(fs.existsSync(path.join(tmpDir, 'throws.css'))).toBe(false);
  });
});

describe('themeBuild() — dropped declarations reach the receipt', () => {
  // Core's generator refuses a declaration whose value would end it early
  // (an unquoted `;` or brace, an unclosed string/comment/url). The runtime
  // says so on the console; a build has a receipt, so every drop must land in
  // `warnings` — a programmatic caller otherwise sees `warnings: []` while the
  // CSS silently omits a value the generated JS still carries.
  it('reports every dropped declaration, from every generator path, in warnings', async () => {
    const themeFile = path.join(tmpDir, 'dropped.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'dropped',
        tokens: {
          '--color-bg': '#0a0a0a } body { background: url(https://example.com/token) ',
        },
        components: {
          button: {
            'variant:secondary': {
              backgroundColor: 'red; background-image: url(https://example.com/component)',
              ':hover': {color: '"https://example.com/pseudo'},
            },
          },
        },
        onDark: {
          tokens: {'--color-bg': 'url(https://example.com/dark'},
        },
        adaptations: {
          rules: [
            {
              when: {pointer: 'coarse'},
              value: {tokens: {'--color-bg': 'red /* https://example.com/adaptation'}},
            },
          ],
        },
      };\n`,
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let result;
    try {
      result = await themeBuild('dropped.mjs', {}, {cwd: tmpDir});
      // Drops are collected, not printed: the programmatic API stays silent.
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }

    const css = fs.readFileSync(path.join(tmpDir, 'dropped.css'), 'utf8');
    expect(css).not.toContain('example.com');

    const warnings = result?.data.warnings ?? [];
    expect(warnings).toHaveLength(5);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^Declaration dropped "--color-bg" in tokens: an unquoted "}" would close the rule/,
        ),
        expect.stringMatching(
          /^Declaration dropped "background-color" in components\.button\["variant:secondary"\]: an unquoted ";" would end the declaration/,
        ),
        expect.stringMatching(
          /^Declaration dropped "color" in components\.button\["variant:secondary"\]\[":hover"\]: an unclosed " string/,
        ),
        expect.stringMatching(
          /^Declaration dropped "--color-bg" in onDark\.tokens: an unclosed url\(/,
        ),
        expect.stringMatching(
          /^Declaration dropped "--color-bg" in adaptations\[0\]\.tokens: an unclosed \/\* comment/,
        ),
      ]),
    );
    for (const w of warnings) {
      expect(w).toContain('The generated CSS omits it');
    }
  });

  it('generates CSS for legacy null tokens without losing neighboring declarations', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'legacy.mjs'),
      `export default {
        name: 'legacy',
        tokens: {'--color-background-body': null, '--spacing-4': 12},
        onDark: {tokens: {'--color-background-body': null}},
        components: {button: {base: {borderRadius: '4px'}}},
      };\n`,
    );

    const result = await themeBuild('legacy.mjs', {}, {cwd: tmpDir});
    const css = fs.readFileSync(path.join(tmpDir, 'legacy.css'), 'utf8');
    expect(css).toContain('--color-background-body: null;');
    expect(css).toContain('--spacing-4: 12;');
    expect(css).toContain('border-radius: 4px;');
    expect(result?.data.warnings).toEqual([]);
  });

  it('keeps valid CSS that carries semicolons, and reports nothing', async () => {
    const themeFile = path.join(tmpDir, 'kept.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'kept',
        tokens: {'--font-family-body': 'Gill\\\\ Sans, "Segoe;UI", serif /* ; */'},
        components: {
          button: {
            'variant:secondary': {
              backgroundImage: 'URL(data:image/svg+xml;base64,PHN2Zz4=)',
              WebkitLineClamp: '2',
            },
          },
        },
      };\n`,
    );

    const result = await themeBuild('kept.mjs', {}, {cwd: tmpDir});
    const css = fs.readFileSync(path.join(tmpDir, 'kept.css'), 'utf8');

    expect(css).toContain(
      '--font-family-body: Gill\\ Sans, "Segoe;UI", serif /* ; */;',
    );
    expect(css).toContain(
      'background-image: URL(data:image/svg+xml;base64,PHN2Zz4=);',
    );
    expect(css).toContain('-webkit-line-clamp: 2;');
    expect(result?.data.warnings).toEqual([]);
  });
});

describe('themeBuild() — nothing to build', () => {
  it('returns null and writes nothing when the generator yields no CSS', async () => {
    const themeFile = path.join(tmpDir, 'empty.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'empty', tokens: {} };\n`,
    );

    // Force the generator to emit nothing for this one build (prose defaults
    // otherwise always ship, so this branch is unreachable with real output).
    mockGenerateThemeRulesSplit.mockReturnValueOnce({component: [], prose: []});
    mockGenerateOnMediaCSS.mockReturnValueOnce('');

    const result = await themeBuild('empty.mjs', {}, {cwd: tmpDir});

    expect(result).toBeNull();
    // Nothing written — the tmp dir still holds only the source fixture.
    expect(fs.readdirSync(tmpDir)).toEqual(['empty.mjs']);
  });
});

describe('themeBuild() — check mode', () => {
  it('reports upToDate with no stale files and writes nothing when outputs match the source', async () => {
    const themeFile = path.join(tmpDir, 'chk.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'chk', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );

    // Build once for real to produce the committed outputs.
    await themeBuild('chk.mjs', {}, {cwd: tmpDir});
    const before = fs.readFileSync(path.join(tmpDir, 'chk.css'), 'utf8');

    const result = await themeBuild('chk.mjs', {check: true}, {cwd: tmpDir});

    expect(result?.type).toBe('theme.build.check');
    expect(result?.data.upToDate).toBe(true);
    expect(result?.data.stale).toEqual([]);
    expect(result?.data.checked).toContain('chk.css');
    // Check mode must not rewrite the file.
    expect(fs.readFileSync(path.join(tmpDir, 'chk.css'), 'utf8')).toBe(before);
  });

  it('accepts released outputs that do not have a CSS type stub', async () => {
    const themeFile = path.join(tmpDir, 'released.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'released', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );
    await themeBuild('released.mjs', {}, {cwd: tmpDir});
    fs.rmSync(path.join(tmpDir, 'released.css.d.ts'));

    const result = await themeBuild(
      'released.mjs',
      {check: true},
      {cwd: tmpDir},
    );

    expect(result?.data.upToDate).toBe(true);
    expect(result?.data.stale).toEqual([]);
    expect(result?.data.checked).toEqual([
      'released.css',
      'released.js',
      'released.d.ts',
    ]);
    expect(fs.existsSync(path.join(tmpDir, 'released.css.d.ts'))).toBe(false);
  });

  it('flags a stale output when the committed CSS content drifts from the source', async () => {
    const themeFile = path.join(tmpDir, 'drift.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'drift', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );
    await themeBuild('drift.mjs', {}, {cwd: tmpDir});

    // Tamper with the committed CSS (real content change, not just the header).
    const cssPath = path.join(tmpDir, 'drift.css');
    fs.writeFileSync(
      cssPath,
      fs.readFileSync(cssPath, 'utf8') + '\n.injected{}\n',
    );

    const result = await themeBuild('drift.mjs', {check: true}, {cwd: tmpDir});

    expect(result?.data.upToDate).toBe(false);
    expect(
      result?.data.stale.some(
        s => s.path === 'drift.css' && s.reason === 'outdated',
      ),
    ).toBe(true);
  });

  it('flags a missing output', async () => {
    const themeFile = path.join(tmpDir, 'gone.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'gone', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );
    await themeBuild('gone.mjs', {}, {cwd: tmpDir});
    fs.rmSync(path.join(tmpDir, 'gone.css'));

    const result = await themeBuild('gone.mjs', {check: true}, {cwd: tmpDir});

    expect(result?.data.upToDate).toBe(false);
    expect(
      result?.data.stale.some(
        s => s.path === 'gone.css' && s.reason === 'missing',
      ),
    ).toBe(true);
  });

  it('ignores volatile @generated header lines (a differing timestamp is NOT stale)', async () => {
    const themeFile = path.join(tmpDir, 'stamp.mjs');
    fs.writeFileSync(
      themeFile,
      `export default { name: 'stamp', tokens: { '--color-bg': '#0a0a0a' } };\n`,
    );
    await themeBuild('stamp.mjs', {}, {cwd: tmpDir});

    // Rewrite ONLY the Generated: timestamp line in the committed CSS.
    const cssPath = path.join(tmpDir, 'stamp.css');
    const tampered = fs
      .readFileSync(cssPath, 'utf8')
      .replace(/Generated: .*/, 'Generated: 1999-01-01T00:00:00.000Z');
    fs.writeFileSync(cssPath, tampered);

    const result = await themeBuild('stamp.mjs', {check: true}, {cwd: tmpDir});

    expect(result?.data.upToDate).toBe(true);
    expect(result?.data.stale).toEqual([]);
  });
});

describe('themeBuild() — component override validation', () => {
  it('accepts documented state keys without an "Unknown prop" warning', async () => {
    // The state-key syntax the Theming Infrastructure wiki documents —
    // `radio-indicator: {checked}`, `calendar-day: {today, selected}` — is declared in
    // each component's doc under `theming.targets[].states`, not
    // `visualProps`. `loadKnownComponents()` read only `visualProps`, so every
    // one of these warned "Unknown prop": documented syntax that looked broken.
    const themeFile = path.join(tmpDir, 'states.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'states',
        tokens: {'--color-bg': '#0a0a0a'},
        components: {
          'radio-indicator': {
            checked: {borderColor: 'var(--color-accent)'},
            'checked+disabled': {opacity: '0.5'},
          },
          'calendar-day': {
            today: {fontWeight: '700'},
            selected: {backgroundColor: 'var(--color-accent)'},
          },
        },
      };\n`,
    );

    const result = await themeBuild('states.mjs', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toEqual([]);
  });

  it('accepts the heading type rules a type scale generates', async () => {
    // `typography.scale` makes defineTheme emit `heading: {'type:display-1' …}`
    // (Heading renders a `type:` class alongside `level:`), so any theme with a
    // type scale carried override keys the validator called unknown — including
    // the shipped neutralTheme.
    const themeFile = path.join(tmpDir, 'typescale.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'typescale',
        tokens: {'--color-bg': '#0a0a0a'},
        components: {
          heading: {'type:display-1': {letterSpacing: '0.01em'}},
        },
      };\n`,
    );

    const result = await themeBuild('typescale.mjs', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toEqual([]);
  });

  it('still warns on a key that is neither a visual prop nor a state', async () => {
    // Widening the known set to states must not turn the guard off.
    const themeFile = path.join(tmpDir, 'bogus.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'bogus',
        tokens: {'--color-bg': '#0a0a0a'},
        components: {'radio-indicator': {notAState: {opacity: '0.5'}}},
      };\n`,
    );

    const result = await themeBuild('bogus.mjs', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toEqual([
      expect.stringContaining(
        'Unknown prop "notAState" on component "radio-indicator"',
      ),
    ]);
  });

  it('deduplicates removed aliases as unknown across root and conditional layers', () => {
    const registry = {
      propsByKey: {'new-target': ['variant']},
    };

    expect(
      validateComponentOverridesAgainstRegistry(
        {
          components: {'old-target': {base: {color: 'red'}}},
          onDark: {
            components: {'old-target': {'variant:quiet': {color: 'pink'}}},
          },
          adaptations: {
            rules: [
              {
                when: {contrast: 'more'},
                value: {
                  components: {
                    'old-target': {'variant:loud': {color: 'purple'}},
                  },
                },
              },
            ],
          },
        },
        registry,
      ),
    ).toEqual(['Unknown component "old-target".']);
  });

  it('reports a removed target alias as an unknown component key', async () => {
    const themeFile = path.join(tmpDir, 'removed-target.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'removed-target',
        tokens: {},
        components: {progressbar: {base: {color: 'red'}}},
      };\n`,
    );

    const result = await themeBuild('removed-target.mjs', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toContain(
      'Unknown component "progressbar". Did you mean: progress-bar?',
    );
    expect(
      fs.readFileSync(path.join(tmpDir, 'removed-target.css'), 'utf8'),
    ).toContain('.astryx-progressbar');
  });
});

describe('themeBuild() — Icon size dimensions', () => {
  it('writes width and height on an icon size into the vars the glyph reads, with no warnings', async () => {
    // spec:AST-087 FR10: a built theme sets an Icon size's glyph dimension the
    // way the runtime provider does, through the shared compiler's derived
    // vars. Raw width/height would lose to a consumer's unlayered StyleX.
    const themeFile = path.join(tmpDir, 'iconsizes.mjs');
    fs.writeFileSync(
      themeFile,
      `export default {
        name: 'iconsizes',
        tokens: {'--color-bg': '#0a0a0a'},
        components: {icon: {'size:sm': {width: '18px', height: '22px'}}},
      };\n`,
    );

    const result = await themeBuild('iconsizes.mjs', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toEqual([]);
    const css = fs.readFileSync(path.join(tmpDir, 'iconsizes.css'), 'utf8');
    const rule =
      css.match(/\.astryx-icon\[data-size="sm"\]\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/--_icon-width:\s*18px/);
    expect(rule).toMatch(/--_icon-height:\s*22px/);
    expect(rule).not.toMatch(/(^|[\s;])(width|height)\s*:/);
  });
});

describe('themeBuild() — the shipped theme template', () => {
  // `assets/theme.template.ts` is what `astryx theme template` puts in a
  // consumer's project. It is the one theme file we hand out, so it has to
  // compile as shipped — and cleanly: a template that greets its first reader
  // with warnings teaches them to ignore warnings. The claims its comments make
  // are checked separately by scripts/check-theme-template.test.mjs.
  it('compiles as shipped, with no warnings', async () => {
    const src = path.resolve(
      import.meta.dirname,
      '../../../assets/theme.template.ts',
    );
    fs.copyFileSync(src, path.join(tmpDir, 'theme.template.ts'));

    const result = await themeBuild('theme.template.ts', {}, {cwd: tmpDir});

    expect(result?.data.warnings).toEqual([]);
    // It DOES name Inter and Geist Mono without loading them, to teach "SHIP
    // THE FONTS YOU NAME" — advisories about a correct file, which is why they
    // are notices. Asserted here so moving them out of `warnings` cannot
    // quietly become dropping them.
    expect(result?.data.notices).toHaveLength(2);
    expect(fs.existsSync(path.join(tmpDir, 'my-theme.css'))).toBe(true);
    // The template teaches custom variants; the augmentation it promises the
    // reader has to actually be generated.
    expect(fs.existsSync(path.join(tmpDir, 'my-theme.variants.d.ts'))).toBe(
      true,
    );
  });
});

describe('themeBuild() — icon registry detection', () => {
  /**
   * The emitted icon import statement, or null. Reads the statement rather
   * than the whole file: the `@generated` header quotes a usage example, so a
   * substring search over the file would match comment text too.
   */
  function iconImportLine(generated) {
    const match = generated.match(/^import .*$/m);
    return match ? match[0] : null;
  }

  it('emits the import, icons key and re-export for a registry that arrives via an import', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'icons.mjs'),
      'export const liveIcons = {};\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'live.mjs'),
      `import {liveIcons} from './icons';\n` +
        `export default {name: 'live', icons: liveIcons, tokens: {'--color-bg': '#fff'}};\n`,
    );

    const result = await themeBuild('live.mjs', {}, {cwd: tmpDir});

    const generated = fs.readFileSync(path.join(tmpDir, 'live.js'), 'utf8');
    expect(iconImportLine(generated)).toBe(
      "import { liveIcons } from './icons';",
    );
    expect(generated).toContain('icons: liveIcons,');
    expect(generated).toContain('export { liveIcons };');
    expect(result?.data.warnings).toEqual([]);
  });

  it('does not re-emit an import that only appears inside a comment (#5058)', async () => {
    // The reported repro: the registry was inlined into the theme source, and
    // a doc comment kept the old import line for context. The comment's
    // specifier was scraped and emitted as live code in the built module,
    // pointing at a file that no longer exists.
    fs.writeFileSync(
      path.join(tmpDir, 'commented.mjs'),
      `/**\n` +
        ` * The scaffold put this in a sibling icons file, so the built module\n` +
        ` * carried \`import { ghostIcons } from './icons'\` — which Node\n` +
        ` * cannot resolve.\n` +
        ` */\n` +
        `const ghostIcons = {close: 'inline'};\n` +
        `export default {name: 'commented', icons: ghostIcons, tokens: {'--color-bg': '#fff'}};\n`,
    );

    await expect(
      themeBuild('commented.mjs', {}, {cwd: tmpDir}),
    ).rejects.toMatchObject({
      code: 'ERR_THEME_INVALID',
      message: expect.stringContaining('icons: ghostIcons'),
    });
    expect(fs.readdirSync(tmpDir)).toEqual(['commented.mjs']);
  });

  it('scrapes the live import even when a comment quotes a stale one', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'icons.mjs'),
      'export const realIcons = {};\n',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'both.mjs'),
      `// was: import { realIcons } from './old-icons';\n` +
        `import {realIcons} from './icons';\n` +
        `export default {name: 'both', icons: realIcons, tokens: {'--color-bg': '#fff'}};\n`,
    );

    const result = await themeBuild('both.mjs', {}, {cwd: tmpDir});

    // The comment comes first in the source, so the old scan matched it first
    // and emitted `./old-icons` — the live import must win.
    const generated = fs.readFileSync(path.join(tmpDir, 'both.js'), 'utf8');
    expect(iconImportLine(generated)).toBe(
      "import { realIcons } from './icons';",
    );
    expect(generated).not.toContain('old-icons');
    expect(result?.data.warnings).toEqual([]);
  });

  it('ignores a commented-out icons: field entirely', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'nofield.mjs'),
      `// icons: retiredIcons,\n` +
        `export default {name: 'nofield', tokens: {'--color-bg': '#fff'}};\n`,
    );

    const result = await themeBuild('nofield.mjs', {}, {cwd: tmpDir});

    const generated = fs.readFileSync(path.join(tmpDir, 'nofield.js'), 'utf8');
    expect(iconImportLine(generated)).toBeNull();
    expect(generated).not.toContain('icons:');
    // No icons field means nothing was dropped — no warning either.
    expect(result?.data.warnings).toEqual([]);
  });

  describe.each([false, true])('unsupported registries (check: %s)', check => {
    it('rejects before the generator can return no CSS', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'inline.mjs'),
        `const inlineIcons = {chevron: 'stub'};\n` +
          `export default {name: 'inline', icons: inlineIcons, tokens: {}};\n`,
      );

      await mockGenerateThemeRulesSplit.withImplementation(
        () => ({component: [], prose: []}),
        async () => {
          await mockGenerateOnMediaCSS.withImplementation(
            () => '',
            async () => {
              await expect(
                themeBuild('inline.mjs', {check}, {cwd: tmpDir}),
              ).rejects.toMatchObject({code: 'ERR_THEME_INVALID'});
            },
          );
        },
      );
      expect(mockGenerateThemeRulesSplit).not.toHaveBeenCalled();
      expect(fs.readdirSync(tmpDir)).toEqual(['inline.mjs']);
    });

    it.each([
      ['local binding', 'icons: inlineIcons'],
      ['object literal', "icons: {chevron: 'stub'}"],
      ['shorthand', 'icons'],
    ])('rejects a %s without creating output files', async (_label, field) => {
      fs.writeFileSync(
        path.join(tmpDir, 'inline.mjs'),
        `const inlineIcons = {chevron: 'stub'};\n` +
          `const icons = inlineIcons;\n` +
          `export default {name: 'inline', ${field}, tokens: {'--color-bg': '#fff'}};\n`,
      );

      await expect(
        themeBuild(
          'inline.mjs',
          {check, out: 'dist/inline.css'},
          {cwd: tmpDir},
        ),
      ).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining(
          'Move the registry to its own module and import it',
        ),
      });
      expect(fs.readdirSync(tmpDir)).toEqual(['inline.mjs']);
    });

    it('rejects even when committed output already matches the missing-icons result', async () => {
      const themeFile = path.join(tmpDir, 'inline.mjs');
      const withoutIcons =
        `export default {name: 'inline', tokens: {'--color-bg': '#fff'}, ` +
        `components: {button: {'variant:custom': {color: 'red'}}}};\n`;
      fs.writeFileSync(themeFile, withoutIcons);
      const built = await themeBuild('inline.mjs', {}, {cwd: tmpDir});
      expect(built?.data.outputs.variantsDts).toBe('inline.variants.d.ts');
      const outputs = Object.values(built.data.outputs);
      const before = outputs.map(file =>
        fs.readFileSync(path.join(tmpDir, file), 'utf8'),
      );
      // This source used to emit exactly the same output as the icon-free
      // theme, so --check passed after the incomplete artifacts were committed.
      fs.writeFileSync(
        themeFile,
        `const inlineIcons = {chevron: 'stub'};\n` +
          withoutIcons.replace(
            "name: 'inline',",
            "name: 'inline', icons: inlineIcons,",
          ),
      );
      const filesBefore = fs.readdirSync(tmpDir).sort();

      await expect(
        themeBuild('inline.mjs', {check}, {cwd: tmpDir}),
      ).rejects.toMatchObject({
        code: 'ERR_THEME_INVALID',
        message: expect.stringContaining('icons: inlineIcons'),
      });
      expect(
        outputs.map(file => fs.readFileSync(path.join(tmpDir, file), 'utf8')),
      ).toEqual(before);
      expect(fs.readdirSync(tmpDir).sort()).toEqual(filesBefore);
    });
  });
});

describe('themeBuild() — extends', () => {
  // These fixtures `import {defineTheme} from '@astryxdesign/core/theme'` the
  // way a real theme file does, so they have to sit somewhere that specifier
  // resolves — an OS temp dir has no node_modules above it.
  let extDir;
  beforeEach(() => {
    extDir = fs.mkdtempSync(
      path.join(path.resolve(import.meta.dirname, '../../..'), '.tmp-extends-'),
    );
  });
  afterEach(() => {
    fs.rmSync(extDir, {recursive: true, force: true});
  });

  /**
   * Every `prop: value` a generated stylesheet actually applies. Header
   * comments and scope wrappers are ignored — two themes never share those.
   */
  function declarations(css) {
    return new Set(
      css
        .split('\n')
        .map(l => l.trim())
        .filter(l => /^[-a-z][^{}]*:.+;$/.test(l)),
    );
  }
  /** Every component rule a stylesheet opens, e.g. `.astryx-switch {`. */
  function selectors(css) {
    return new Set(
      css
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.endsWith('{') && l.startsWith('.')),
    );
  }

  /** A base theme with geometry, elevation and a component override. */
  const BASE_SOURCE = `export const brandTheme = {
    name: 'ext-base',
    tokens: {
      '--radius-element': '6px',
      '--shadow-low': '0 1px 3px rgb(0 0 0 / 0.1)',
      '--color-border-emphasized': '#D4D4D4',
    },
    components: {
      switch: {base: {backgroundColor: 'var(--color-border-emphasized)'}},
    },
  };\n`;

  /**
   * The child names its base with a plain relative specifier, exactly as a
   * generated palette does. `theme build` writes `ext-base.js` next to
   * `ext-base.mjs`, so `./ext-base` is ambiguous — and the artifact, which
   * exports `extBaseTheme` rather than `brandTheme`, is the wrong answer.
   */
  const CHILD_SOURCE = `import {defineTheme} from '@astryxdesign/core/theme';
  import {brandTheme} from './ext-base';
  export const paletteTheme = defineTheme({
    name: 'ext-child',
    extends: brandTheme,
    tokens: {'--color-accent': 'hsl(220 88% 72%)'},
  });\n`;

  it('emits every declaration its base emits (the child stylesheet is self-contained)', async () => {
    fs.writeFileSync(path.join(extDir, 'ext-base.mjs'), BASE_SOURCE);
    fs.writeFileSync(path.join(extDir, 'ext-child.mjs'), CHILD_SOURCE);

    // Build the base FIRST, as any real project does — that write is what
    // used to poison the child's build.
    await themeBuild('ext-base.mjs', {}, {cwd: extDir});
    await themeBuild('ext-child.mjs', {}, {cwd: extDir});

    const baseCss = fs.readFileSync(path.join(extDir, 'ext-base.css'), 'utf8');
    const childCss = fs.readFileSync(
      path.join(extDir, 'ext-child.css'),
      'utf8',
    );

    const childDecls = declarations(childCss);
    expect([...declarations(baseCss)].filter(d => !childDecls.has(d))).toEqual(
      [],
    );

    const childSelectors = selectors(childCss);
    expect([...selectors(baseCss)].filter(s => !childSelectors.has(s))).toEqual(
      [],
    );

    // …and the child's own override still wins.
    expect(childCss).toContain('--color-accent: hsl(220 88% 72%);');
  });

  it('resolves the base from its source, not from the generated sibling artifact', async () => {
    fs.writeFileSync(path.join(extDir, 'ext-base.mjs'), BASE_SOURCE);
    fs.writeFileSync(path.join(extDir, 'ext-child.mjs'), CHILD_SOURCE);

    await themeBuild('ext-base.mjs', {}, {cwd: extDir});
    const result = await themeBuild('ext-child.mjs', {}, {cwd: extDir});

    expect(result?.data.componentCount).toBe(1);
    expect(result?.data.tokenCount).toBe(4);
  });

  it('inherits component overrides when the base IS a built theme module', async () => {
    fs.writeFileSync(path.join(extDir, 'ext-base.mjs'), BASE_SOURCE);
    await themeBuild('ext-base.mjs', {}, {cwd: extDir});

    // Extending a package's pre-built theme module (e.g. the `./built`
    // subpath the shipped themes expose) must not silently drop its
    // component overrides.
    fs.writeFileSync(
      path.join(extDir, 'ext-built-child.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';
      import {extBaseTheme} from './ext-base.js';
      export const builtChildTheme = defineTheme({
        name: 'ext-built-child',
        extends: extBaseTheme,
      });\n`,
    );

    await themeBuild('ext-built-child.mjs', {}, {cwd: extDir});
    const css = fs.readFileSync(
      path.join(extDir, 'ext-built-child.css'),
      'utf8',
    );

    expect(css).toContain('.astryx-switch {');
    expect(css).toContain('--radius-element: 6px;');
  });

  it('preserves local-token enrollment when extending a built theme module', async () => {
    fs.writeFileSync(
      path.join(extDir, 'local-base.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';
      export const localBaseTheme = defineTheme({
        name: 'local-base',
        localTokens: {
          '--astryx-theme-local-base-color-status-fill': ['#123456', '#abcdef'],
        },
        components: {
          badge: {
            base: {
              backgroundColor: 'var(--astryx-theme-local-base-color-status-fill)',
            },
          },
        },
      });\n`,
    );
    await themeBuild('local-base.mjs', {}, {cwd: extDir});

    fs.writeFileSync(
      path.join(extDir, 'local-child.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';
      import {localBaseTheme} from './local-base.js';
      export const localChildTheme = defineTheme({
        name: 'local-child',
        extends: localBaseTheme,
        localTokens: {
          '--astryx-theme-local-base-color-status-fill': '#654321',
          '--astryx-theme-local-child-color-surface-raised': '#fedcba',
        },
      });\n`,
    );

    await themeBuild('local-child.mjs', {}, {cwd: extDir});
    const css = fs.readFileSync(path.join(extDir, 'local-child.css'), 'utf8');
    const built = fs.readFileSync(path.join(extDir, 'local-child.js'), 'utf8');

    expect(css).toContain(
      '--astryx-theme-local-base-color-status-fill: #654321;',
    );
    expect(css).toContain(
      '--astryx-theme-local-child-color-surface-raised: #fedcba;',
    );
    expect(built).toContain(
      '__localTokenLineage: ["local-base","local-child"]',
    );
  });

  it('resolves extends on a plain object theme file (no defineTheme call)', async () => {
    fs.writeFileSync(path.join(extDir, 'ext-base.mjs'), BASE_SOURCE);
    fs.writeFileSync(
      path.join(extDir, 'ext-plain.mjs'),
      `import {brandTheme} from './ext-base.mjs';
      export default {
        name: 'ext-plain',
        extends: brandTheme,
        tokens: {'--color-accent': '#ff0000'},
      };\n`,
    );

    await themeBuild('ext-base.mjs', {}, {cwd: extDir});
    await themeBuild('ext-plain.mjs', {}, {cwd: extDir});

    const css = fs.readFileSync(path.join(extDir, 'ext-plain.css'), 'utf8');
    expect(css).toContain('--radius-element: 6px;');
    expect(css).toContain('.astryx-switch {');
  });

  it('fails loudly when the base import resolved to nothing', async () => {
    fs.writeFileSync(
      path.join(extDir, 'ext-broken.mjs'),
      `import {defineTheme} from '@astryxdesign/core/theme';
      import {notAThing} from './ext-missing.mjs';
      export const brokenTheme = defineTheme({
        name: 'ext-broken',
        extends: notAThing,
        tokens: {'--color-accent': '#ff0000'},
      });\n`,
    );
    fs.writeFileSync(
      path.join(extDir, 'ext-missing.mjs'),
      `export const somethingElse = 1;\n`,
    );

    await expect(
      themeBuild('ext-broken.mjs', {}, {cwd: extDir}),
    ).rejects.toThrow(/extends/);
  });
});

// =============================================================================
// Theme name → valid JS identifier contract (deterministic from theme.name)
// =============================================================================

describe('themeBuild() — theme name identifier sanitization', () => {
  /**
   * Write a theme source with a given theme name and return the generated JS
   * and declarations. The identifier is derived only from theme.name.
   */
  async function buildNamed(themeName) {
    const themeFile = path.join(
      tmpDir,
      `src-${themeName.replace(/[^a-z0-9]/gi, '')}.mjs`,
    );
    // Use a default export so no source export name is available — the
    // identifier must come purely from toIdentifier(themeName) + 'Theme'.
    fs.writeFileSync(
      themeFile,
      `export default { name: '${themeName}', tokens: { '--color-bg': '#000' } };\n`,
    );
    await themeBuild(path.basename(themeFile), {}, {cwd: tmpDir});
    const js = fs.readFileSync(path.join(tmpDir, `${themeName}.js`), 'utf8');
    const dts = fs.readFileSync(path.join(tmpDir, `${themeName}.d.ts`), 'utf8');
    return {js, dts};
  }

  // -- Core bug: hyphen followed by digit -----------------------------------

  it('chaos-07 → chaos07Theme (the motivating bug)', async () => {
    const {js, dts} = await buildNamed('chaos-07');
    expect(js).toContain('export const chaos07Theme = {');
    expect(js).not.toMatch(/export const chaos-07/);
    expect(dts).toContain('export declare const chaos07Theme: DefinedTheme;');
    // Must parse as valid JS
    expect(() => new Function(js.replace(/^export /gm, ''))).not.toThrow();
  });

  // -- Dot separator --------------------------------------------------------

  it('brand.v2 → brandV2Theme', async () => {
    const {js, dts} = await buildNamed('brand.v2');
    expect(js).toContain('export const brandV2Theme = {');
    expect(dts).toContain('export declare const brandV2Theme: DefinedTheme;');
  });

  it('ui.dark.3 → uiDark3Theme', async () => {
    const {js, dts} = await buildNamed('ui.dark.3');
    expect(js).toContain('export const uiDark3Theme = {');
    expect(dts).toContain('export declare const uiDark3Theme: DefinedTheme;');
  });

  // -- Underscore preserved (already valid) ---------------------------------

  it('my_theme → my_themeTheme (underscore preserved)', async () => {
    const {js, dts} = await buildNamed('my_theme');
    expect(js).toContain('export const my_themeTheme = {');
    expect(dts).toContain('export declare const my_themeTheme: DefinedTheme;');
  });

  // -- Mixed separators -----------------------------------------------------

  it('neo_wave-2.x → neo_wave2XTheme (underscore kept, others camelCased)', async () => {
    const {js, dts} = await buildNamed('neo_wave-2.x');
    expect(js).toContain('export const neo_wave2XTheme = {');
    expect(dts).toContain(
      'export declare const neo_wave2XTheme: DefinedTheme;',
    );
  });

  // -- Multiple and consecutive separators ----------------------------------

  it('a-1-b → a1BTheme', async () => {
    const {js, dts} = await buildNamed('a-1-b');
    expect(js).toContain('export const a1BTheme = {');
    expect(dts).toContain('export declare const a1BTheme: DefinedTheme;');
  });

  it('my--theme → myThemeTheme (consecutive hyphens)', async () => {
    const {js, dts} = await buildNamed('my--theme');
    expect(js).toContain('export const myThemeTheme = {');
    expect(dts).toContain('export declare const myThemeTheme: DefinedTheme;');
  });

  it('trailing- → trailingTheme (trailing separator stripped)', async () => {
    const {js, dts} = await buildNamed('trailing-');
    expect(js).toContain('export const trailingTheme = {');
    expect(dts).toContain('export declare const trailingTheme: DefinedTheme;');
  });

  it('neon-green-42 → neonGreen42Theme', async () => {
    const {js, dts} = await buildNamed('neon-green-42');
    expect(js).toContain('export const neonGreen42Theme = {');
    expect(dts).toContain(
      'export declare const neonGreen42Theme: DefinedTheme;',
    );
  });

  // -- JS and d.ts agree on every case --------------------------------------

  it('JS, d.ts, and install example agree', async () => {
    const {js, dts} = await buildNamed('dark-v2');
    const jsMatch = js.match(/export const (\w+) = \{/);
    const dtsMatch = dts.match(/export declare const (\w+): DefinedTheme;/);
    expect(jsMatch?.[1]).toBe('darkV2Theme');
    expect(dtsMatch?.[1]).toBe('darkV2Theme');
    // Import example in JSDoc
    expect(js).toContain("import { darkV2Theme } from './dark-v2'");
  });

  // -- Check mode -----------------------------------------------------------

  it('check mode agrees with the deterministic identifier', async () => {
    await buildNamed('wave-99');
    // Source file was written by buildNamed; re-run in check mode
    const checkResult = await themeBuild(
      path.basename(
        fs.readdirSync(tmpDir).find(f => f.startsWith('src-wave99')),
      ),
      {check: true},
      {cwd: tmpDir},
    );
    expect(checkResult?.data.upToDate).toBe(true);
  });

  // -- Reserved words are safe via the Theme suffix -------------------------

  it('reserved word "for" → forTheme (safe)', async () => {
    const {js, dts} = await buildNamed('for');
    expect(js).toContain('export const forTheme = {');
    expect(dts).toContain('export declare const forTheme: DefinedTheme;');
    expect(() => new Function(js.replace(/^export /gm, ''))).not.toThrow();
  });

  // -- Simple name (no separators) is unchanged -----------------------------

  it('ocean → oceanTheme (no-op sanitization)', async () => {
    const {js, dts} = await buildNamed('ocean');
    expect(js).toContain('export const oceanTheme = {');
    expect(dts).toContain('export declare const oceanTheme: DefinedTheme;');
  });
});
