---
'@astryxdesign/cli': patch
'@astryxdesign/core': patch
---

[feat] CodeBlock's `tokenizer` prop is deprecated in favour of a custom language value: pass `language={createCodeLanguage({name, identifiers, tokenize})}` with the same function. The prop still works exactly as released. `astryx upgrade` rewrites it when it sits beside a static `language`. A function literal becomes `language={createCodeLanguage({name: 'zig', identifiers: ['zig'], tokenize: (code) => …})}`. A name or call-free property becomes `language={fn ? createCodeLanguage({…, tokenize: fn}) : 'zig'}`, since it may be undefined. Uses it cannot prove are left unchanged, with a TODO comment: a computed, missing, or `plaintext` language, any other tokenizer value, or a block that spreads props.

@cixzhang
