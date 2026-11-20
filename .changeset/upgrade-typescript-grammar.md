---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` reads a `.ts` file as TypeScript without JSX and a declaration file as declarations, as TypeScript does. A type assertion (`<Item>value`) in a `.ts` file, or a declaration without a value (`export const limit: number;`) in a declaration file (`.d.ts`, `.d.mts`, `.d.cts`, or an arbitrary-extension declaration file such as `styles.d.css.ts`), no longer stops the run with a parse error, and a codemod changes such a file like any other. A `.tsx` file and JavaScript read as before.

@josephfarina
