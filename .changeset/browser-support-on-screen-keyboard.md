---
'@astryxdesign/cli': patch
---

[docs] The browser-support guide has a section on the on-screen keyboard: a fully expanded Tall BottomSheet measures it as the layout viewport's height minus the visual viewport's, and keeps the focused field above it in Safari on iOS, Firefox for Android and Chrome on Android. In Chrome, by default (`interactive-widget=resizes-visual`), the sheet adds its scroll room once Chrome reports the keyboard; with `interactive-widget=resizes-content` Chrome shrinks the page for the keyboard itself and the sheet changes nothing. Your app owns its viewport `<meta>` element; Astryx never sets it.

@vjeux
