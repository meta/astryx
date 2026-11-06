// Copyright (c) Meta Platforms, Inc. and affiliates.

import Astryx

/// The host app UI tests drive: one screen per Swift component with a host
/// screen, chosen by the launch argument `-component <Name>`, such as
/// `-component Button`. Without it, the app lists every screen.
@main
struct AstryxHostApp: App {
  var body: some Scene {
    WindowGroup {
      if let name = UserDefaults.standard.string(forKey: "component"),
        let screen = ComponentScreen(rawValue: name)
      {
        ScreenHost(screen: screen)
      } else {
        NavigationStack {
          SwiftUI.List(ComponentScreen.allCases) { screen in
            NavigationLink(screen.rawValue) { ScreenHost(screen: screen) }
          }
          .navigationTitle("Astryx")
        }
      }
    }
  }
}

/// One screen in the theme, scrolled, as an app would place it.
struct ScreenHost: View {
  let screen: ComponentScreen

  var body: some View {
    ScrollView {
      screen.content
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
    }
    .astryxTheme()
    .accessibilityIdentifier("screen.\(screen.rawValue)")
  }
}
