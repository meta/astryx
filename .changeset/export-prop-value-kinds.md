---
'@astryxdesign/cli': patch
---

[experimental] `astryx experimental export`'s `unknown-prop-value` warning also names a value of the wrong kind for a Core prop: "page.tsx:12: VStack gap expects one of 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10; got a string." for `<VStack gap="md">`, which draws no gap It warns only when the written value is certain (a literal, a conditional of certain branches, a logical expression whose result JavaScript certainly picks (`'' || 'primary'` gives only `'primary'`), a `const` bound to one, or the first value of `useState`) and the prop's declared type in the page's Core is one it can read; anything else is not checked. The same wrong kind for one prop on several lines of a file is one warning that lists the lines. The has-no-value check reads the same certain values, so it also checks a `const` bound to a string and the first value of `useState('…')`. A prop written before a spread attribute (`variant="danger" {...rest}`) is no longer checked, since the spread can replace it. A value cast to `never`, `any` or `unknown` (`variant={'brand' as never}`) is not checked. A page that throws while rendering (`<TextInput status="error">`, whose status takes an object) gets the render error and no warnings.

@josephfarina
