---
'@astryxdesign/cli': patch
---

[fix] The release cache's lock takeover checks the owner record of the lock it moved aside. A lock another command took in the moment between the check and the move is put back instead of removed, and the takeover waits for it.

@josephfarina
