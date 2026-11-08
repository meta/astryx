---
'@astryxdesign/cli': patch
---

[fix] Every import in an `astryx swizzle` copy now names a file the copy holds or a path the owner package exports. Before, the copy sent every import that left the component folder to the package's folder entry, which does not export the internal helpers most components use, so `Button`, `Dialog`, `Table` and about 100 other copies failed to type-check or bundle. Now the copy imports what the package exports from the package, carries every internal module it needs beside it in the package's folder layout, and copies the nested folders it imports (such as `Table`'s `plugins/`). Test helpers and notes are no longer copied. A helper an earlier swizzle wrote is reused when it is the same and is never replaced by a copy that carries it, even with `--overwrite`: a different one stays, and the new copy writes its own under a version-suffixed name. Swizzling the component whose folder holds that helper treats it as one of that component's own files, which `--overwrite` replaces. A private attribute owner module and the style modules it imports are the exception, as before: a changed copy fails the command without `--overwrite` and is replaced with it. Fixes #3506.

@cixzhang @jiunshinn
