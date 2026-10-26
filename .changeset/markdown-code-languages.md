---
'@astryxdesign/core': patch
---

[feat] `Markdown` takes `codeLanguages`, a list of CodeBlock language values, each imported on its own or made with `createCodeLanguage`. A fence whose language word names a listed value renders with that value, ahead of a built-in language with the same name. A `diff-<name>` fence gets the diff layer over that value.

@cixzhang
