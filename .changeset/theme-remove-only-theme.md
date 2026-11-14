---
'@astryxdesign/cli': patch
---

[feat] `astryx theme remove` can remove the only added theme. Before, it refused and said to add another theme and make it the default first, so removing a theme left the app on a theme nobody chose. Now it deletes the generated theme module when the module is exactly what the CLI wrote, and prints the module import and the `Theme` wrapper the app root must drop. A module with changes the CLI did not write stays, and the command says how to finish by hand. Removing the default while other themes are added still asks for `theme use` first. In `--json`, the `theme.app` result of that removal has no themes, an empty `default`, and `change.moduleRemoved: true` (and `change.themeModes: true` when the deleted module exported `themeModes`).

@josephfarina
