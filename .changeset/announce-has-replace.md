---
'@astryxdesign/core': patch
---

[feat] useAnnounce takes an optional `{hasReplace: true}`. An instance created with it states one current state, such as a search's result count: each message it writes withdraws that instance's previous message while it has not been spoken yet, whatever their politeness, and is spoken at its own politeness, so input faster than a frame (a barcode scanner, dictation, automation) says only the latest. Messages from other instances, and from instances without it, still join. MultiSelector sends its result count, its create row and its empty-search message through such an instance, so fast typing no longer says `1 result Create "Urg" Create "Urge" …`; its selection changes keep their own instance and still join. This follows spec:AST-086 FR9 and FR13 (#9070).

@vjeux
