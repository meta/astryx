---
'@astryxdesign/cli': patch
---

[experimental] Icon sets: authoring a set is easier. An author sees which icon meanings the bundled templates use that the set does not map yet, such as `document` and `share`; a copied template shows a placeholder for each. Only the experimental icon commands, the icon-set lists in `integration check` and Doctor, two icon definitions' search words, and the icon-set guide change.

- **Authoring receipts.** `experimental icon new-set`, `add`, and `map` end with one line when the set leaves template meanings unmapped: how many there are, the most used first with their template counts, and the `map` command to run. The JSON adds `templateMeanings: {unmapped: [{definition, templates}]}`. A dry run adds nothing.
- **`experimental icon --definitions`.** Each definition shows how many bundled templates use it (`templates`) and whether the set maps it (`mapped`). The set is the one `--set` names, else the project's main set, else the only set of the icon-set package you run it in. `--set` is now accepted with `--definitions`.
- **`integration check`.** Each set's `iconSets` entry adds `templateMeanings`, printed under "Template icon meanings not mapped". It is never counted and never fails a check, even with `--strict`.
- **`new-set --adapter ./<path>#<export>`.** Declares the adapter a library of icon data objects or SVG strings needs, so the set wraps it with no hand edit to the data file.
- **Clearer receipts.** The first `new-set --from` into a set with no icons says the set was created, not refreshed. `add --variant <look> --all` names the first ten icons the module lacks and how many more; the JSON still lists every one. The command that adds unlisted sets as backups (from `icon use` and Doctor) names every set the same way: by its name, or as `<package>/<set>` when two packages ship that name.
- **Better suggestions.** A suggested icon whose id only starts with the definition's name and adds another thing (`delete-left`, a backspace key) comes after the icons the definition's words name (`trash`), and a word two definitions share (`store`) comes after the words only one has. `save` adds the word "floppy disk", and `bank` reads "building library" instead of "library".

@josephfarina
