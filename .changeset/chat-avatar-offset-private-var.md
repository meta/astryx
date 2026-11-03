---
'@astryxdesign/core': patch
---

[chore] Internal: ChatMessage's avatar offset variable now has the private literal name `--_chat-avatar-offset` instead of a hashed name, so the published stylesheet no longer declares an internal variable that looks public. The avatar's offset is unchanged. Not exported from the package entry point. (#9602)

@cixzhang
