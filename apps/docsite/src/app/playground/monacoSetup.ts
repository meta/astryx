// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file monacoSetup.ts
 * @input The Monaco runtime instance passed to the editor's onMount
 * @output Self-hosted loader config + TypeScript-service setup with Astryx typedefs
 *   + the Prettier document formatter ("Format code" / Shift+Alt+F)
 * @position Playground Code editor — keeps Monaco wiring out of PlaygroundClient.
 *
 * Configures Monaco's TypeScript service with real Astryx type definitions loaded
 * from a pre-built JSON bundle (generated at build time), so the editor offers
 * accurate autocomplete and diagnostics for @astryxdesign/core, React, StyleX,
 * icons, and Recharts.
 *
 * Also registers Prettier (see ./formatCode) as the document formatter, which is
 * what powers both the "Format code" toolbar button and Monaco's built-in
 * Shift+Alt+F keybinding. This is the ONLY seam between the playground and that
 * formatter — PlaygroundClient's `onMount` calls `configureMonaco` and nothing
 * else — so `src/__tests__/playground-format.test.ts` pins the registration here
 * to stop the feature being silently unwired.
 */

import {loader} from '@monaco-editor/react';
import type * as MonacoTypes from 'monaco-editor';
import {
  registerPrettierFormatter,
  type FormatFailureHandler,
} from './formatCode';

// Self-host Monaco from public/monaco/vs — corpnet blocks the default CDN.
if (typeof window !== 'undefined') {
  loader.config({paths: {vs: '/monaco/vs'}});
}

/** Monaco instance type — the full runtime object passed to onMount. */
export type MonacoInstance = typeof MonacoTypes & {
  languages: typeof MonacoTypes.languages & {
    typescript: {
      typescriptDefaults: {
        setCompilerOptions: (options: Record<string, unknown>) => void;
        setDiagnosticsOptions: (options: Record<string, unknown>) => void;
        addExtraLib: (content: string, filePath: string) => void;
      };
      ScriptTarget: Record<string, number>;
      ModuleKind: Record<string, number>;
      JsxEmit: Record<string, number>;
      ModuleResolutionKind: Record<string, number>;
    };
  };
  editor: typeof MonacoTypes.editor & {
    defineTheme: (name: string, data: Record<string, unknown>) => void;
  };
};

/** Options for {@link configureMonaco}. */
export type ConfigureMonacoOptions = {
  /**
   * Called when the "Format code" action could not run because Prettier itself
   * failed to load — never for a user syntax error. Optional: formatCode always
   * warns to the console regardless, this is for a user-visible surface.
   */
  onFormatFailure?: FormatFailureHandler;
};

/**
 * Configure Monaco's TypeScript service with real Astryx type definitions.
 * Loads .d.ts files from a pre-built JSON bundle (generated at build time).
 * Also registers Prettier as the document formatter.
 *
 * Safe to call on every editor mount: `registerPrettierFormatter` de-dupes on
 * the Monaco instance itself, so neither a remount (React's dev-mode double
 * effect) nor a Fast Refresh re-evaluation of this module can stack duplicate
 * providers.
 */
export function configureMonaco(
  monaco: MonacoInstance,
  options: ConfigureMonacoOptions = {},
) {
  const ts = monaco.languages.typescript.typescriptDefaults;

  registerPrettierFormatter(monaco, options.onFormatFailure);

  ts.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
    esModuleInterop: true,
    allowSyntheticDefaultImports: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowJs: true,
    strict: false,
  });

  ts.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
  });

  // Global declarations for React hooks (available without import in playground)
  ts.addExtraLib(
    `declare function useState<T>(init: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void];
    declare function useEffect(fn: () => void | (() => void), deps?: readonly unknown[]): void;
    declare function useCallback<T extends Function>(fn: T, deps: readonly unknown[]): T;
    declare function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;
    declare function useRef<T>(init: T): { current: T };
    declare function useReducer<S, A>(reducer: (state: S, action: A) => S, init: S): [S, (action: A) => void];
    declare function useContext<T>(ctx: unknown): T;`,
    'file:///globals.d.ts',
  );

  // Load real type definitions from the pre-built JSON bundle
  fetch('/playground-types.json')
    .then(r => r.json())
    .then((packages: Record<string, Record<string, string>>) => {
      const reactFiles = packages['react'] ?? {};
      for (const [fileName, content] of Object.entries(reactFiles)) {
        ts.addExtraLib(
          content,
          `file:///node_modules/@types/react/${fileName}`,
        );
        // Also register react/jsx-runtime as a resolvable module path
        if (fileName === 'jsx-runtime.d.ts') {
          ts.addExtraLib(
            content,
            'file:///node_modules/react/jsx-runtime.d.ts',
          );
        }
      }

      const stylexFiles = packages['@stylexjs/stylex'] ?? {};
      for (const [fileName, content] of Object.entries(stylexFiles)) {
        ts.addExtraLib(
          content,
          `file:///node_modules/@stylexjs/stylex/${fileName}`,
        );
      }

      // Heroicons ambient declarations, one per size/style variant
      // ('@heroicons/react/{16,20,24}/{outline,solid}'), so those imports
      // resolve once semantic validation turns on below.
      const heroiconFiles = packages['@heroicons/react'] ?? {};
      for (const [fileName, content] of Object.entries(heroiconFiles)) {
        const variant = fileName.replace(/\.d\.ts$/, '');
        ts.addExtraLib(
          content,
          `file:///node_modules/@heroicons/react/${variant}/index.d.ts`,
        );
      }

      const rechartsFiles = packages.recharts ?? {};
      for (const [fileName, content] of Object.entries(rechartsFiles)) {
        ts.addExtraLib(content, `file:///node_modules/recharts/${fileName}`);
      }

      // Every other package in the bundle (lucide-react, the theme packages,
      // next/image, the bare `stylex` alias) is an ambient `declare module`,
      // so the file path only has to be unique. Registering them generically
      // keeps the editor in step with whatever generate-playground-types.mjs
      // emits for the preview scope.
      const AMBIENT_HANDLED = new Set([
        'react',
        '@stylexjs/stylex',
        '@heroicons/react',
        'recharts',
        '@astryxdesign/core',
      ]);
      for (const [pkg, files] of Object.entries(packages)) {
        if (AMBIENT_HANDLED.has(pkg)) {
          continue;
        }
        for (const [fileName, content] of Object.entries(files)) {
          ts.addExtraLib(content, `file:///node_modules/${pkg}/${fileName}`);
        }
      }

      const coreFiles = packages['@astryxdesign/core'] ?? {};
      const submoduleReexports: string[] = [];

      for (const [relPath, content] of Object.entries(coreFiles)) {
        ts.addExtraLib(
          content,
          `file:///node_modules/@astryxdesign/core/dist/${relPath}`,
        );

        // Mount at the package root as well, so every subpath the preview
        // scope serves resolves the way it would from node_modules: a
        // directory through its index.d.ts, a flat file such as
        // `BaseProps` or `theme/tokens.stylex` through its own .d.ts.
        ts.addExtraLib(
          content,
          `file:///node_modules/@astryxdesign/core/${relPath}`,
        );
        if (relPath.endsWith('/index.d.ts')) {
          submoduleReexports.push(relPath.replace('/index.d.ts', ''));
        }
      }

      const barrelContent = submoduleReexports
        .map(m => `export * from '@astryxdesign/core/${m}';`)
        .join('\n');
      ts.addExtraLib(
        `declare module '@astryxdesign/core' {\n${barrelContent}\n}`,
        'file:///node_modules/@astryxdesign/core/index.d.ts',
      );

      ts.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });
    })
    .catch(() => {
      // Types unavailable — keep semantic validation disabled
    });
}
