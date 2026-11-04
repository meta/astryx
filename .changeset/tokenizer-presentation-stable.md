---
'@astryxdesign/core': patch
---

[feat] Tokenizer's `presentation` prop is stable, and its default is `'adaptive'`. `presentation` takes `'popover' | 'bottom-sheet' | 'adaptive'`, typed by the new exported `TokenizerPresentation`. The API change is additive: the prop is new and optional, and no existing stable prop, type or export is removed or narrowed (`TokenizerProps['ref']` keeps its input type, and the component also accepts a ref typed `Ref<HTMLInputElement | HTMLButtonElement>`). The behavior changes only on compact coarse-pointer screens (phones), which is what `'adaptive'` is for: there a Tokenizer with no `presentation` shows a trigger that opens the bottom sheet, the sheet edits a draft so `onChange` reports once, on Save, `ref` receives the trigger button, and `renderItem`, `renderToken`, `endContent`, `hasClear`, `hasEntriesOnFocus`, `menuWidth`, `tokenOverflowBehavior` and `hasAutoFocus` are not rendered, with one development warning that names them. With a mouse or trackpad, on a screen that is not compact, in the server render and while hydrating, nothing changes. Pass `presentation="popover"` to keep the previous behavior on every device. Shipping this default in a patch is a product decision of the engineering owner, agreed with the owner of the compatibility policy.

@imdreamrunner
