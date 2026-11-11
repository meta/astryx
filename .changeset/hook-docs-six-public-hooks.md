---
'@astryxdesign/core': patch
'@astryxdesign/cli': patch
---

[docs] Six public hooks that app code is meant to call get their hook doc and a live example block: `useOutlineFromDOM`, `useThemeName`, `useSyntaxTheme`, `useChatDictation`, `useSpeechRecognition` and `useChatPasteAsToken` (#11207). Each doc states the contract its source implements, and each example runs against the real components the hook pairs with - an Outline over DOM headings, a brand switcher reading `useThemeName`, a canvas code view painted from `useSyntaxTheme` tokens, a dictating composer, a headless transcript, and a composer that turns a pasted build log into one token chip.

@painbaba
