---
'@astryxdesign/cli': patch
---

[fix] `astryx upgrade` reads each TypeScript file in its own grammar: a `.ts` file as TypeScript without JSX, and a declaration file (`.d.ts`) as declarations. A type assertion (`<Item>value`), a generic arrow (`<T>(value: T) => value`) or a declaration without a value (`export const limit: number;`) no longer stops the run with a parse error, and a codemod changes such a file like any other. A `.tsx` file and JavaScript read as before.

@josephfarina
