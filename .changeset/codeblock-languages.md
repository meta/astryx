---
'@astryxdesign/core': patch
---

[feat] `CodeBlock` highlights C, C++, SQL, Rust, Kotlin, Swift, and Go with no setup.

Every other language is opt in, one at a time:

- Import that language on its own and pass it as `language`, for example `graphql` from `@astryxdesign/core/CodeBlock/languages/graphql`.
- Modules ship for `graphql`, `java`, `thrift`, `objectiveC` (path `languages/objective-c`), `toml`, `powershell`, `ruby`, `lua`, and `dockerfile`.
- A string such as `language="graphql"` still selects only a built-in language.

Your own languages work the same way. `createCodeLanguage({name, identifiers, fileExtensions, fileNames, tokenize})` makes a language value from your own tokenize function.

The built-in tokenizer stays within 4,608 bytes gzipped. Each module adds at most 512 bytes, and only when you import it.

@cixzhang
