// Copyright (c) Meta Platforms, Inc. and affiliates.

// `import Astryx` is the only import an app file needs: it brings SwiftUI and
// the generated contracts with it. In a file that imports only Astryx, a name
// Astryx shares with SwiftUI (`Button`, `Text`) means Astryx's view, and
// `SwiftUI.Button` names the system one (Swift component API spec, A1, A1a).
@_exported import AstryxNative
@_exported import SwiftUI
