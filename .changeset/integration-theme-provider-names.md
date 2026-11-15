---
'@astryxdesign/cli': patch
---

[feat] For an app whose theme its integration's provider wires, `astryx doctor` names the theme a stylesheet of the package belongs to (one in that theme's own folder, or one its stylesheet imports), and `astryx theme list` starts with the theme the app has ("This app's theme comes from <provider> (<theme>), rendered in <file>") and its `wiredBy` line says where the provider is rendered, or that the theme applies where the app renders it (`renderedIn` and `meta.appTheme` in the JSON).

@josephfarina
