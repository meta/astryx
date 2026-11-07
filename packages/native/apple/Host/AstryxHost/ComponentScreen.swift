// Copyright (c) Meta Platforms, Inc. and affiliates.

import Astryx

/// The Swift components with a host screen. A component adds a case and its
/// states here, and the UI tests audit it.
enum ComponentScreen: String, CaseIterable, Identifiable {
  case Banner, Button, Card, Heading, Icon, Text, TextInput

  var id: String { rawValue }

  @MainActor @ViewBuilder var content: some View {
    switch self {
    case .Banner: BannerScreen()
    case .Button: ButtonScreen()
    case .Card: CardScreen()
    case .Heading: HeadingScreen()
    case .Icon: IconScreen()
    case .Text: TextScreen()
    case .TextInput: TextInputScreen()
    }
  }
}

struct BannerScreen: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(AstryxBannerStatus.allCases, id: \.self) { status in
        Astryx.Banner(status: status, title: "Changes saved", description: "Your draft is up to date.")
      }
    }
  }
}

struct ButtonScreen: View {
  @State private var taps = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Astryx.Button(label: "Save", variant: .primary) { taps += 1 }
      Astryx.Button(label: "Sending", variant: .primary, isLoading: true) { taps += 1 }
      Astryx.Button(label: "Delete", variant: .destructive, isDisabled: true) { taps += 1 }
      Astryx.Button(label: "Small", size: .sm) { taps += 1 }
      SwiftUI.Text("Taps: \(taps)").accessibilityIdentifier("button.taps")
    }
  }
}

struct CardScreen: View {
  var body: some View {
    Astryx.Card {
      VStack(alignment: .leading, spacing: 8) {
        Astryx.Heading("Order 1042", level: .v3)
        Astryx.Text("Two items, arriving Thursday.")
      }
    }
  }
}

struct HeadingScreen: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(HeadingLevel.allCases, id: \.self) { level in
        Astryx.Heading("Heading level \(level.rawValue)", level: level)
      }
    }
  }
}

struct IconScreen: View {
  var body: some View {
    HStack(spacing: 16) {
      Astryx.Icon("search", label: "Search")
      Astryx.Icon("success", color: .success, label: "Done")
      Astryx.Icon("warning")
    }
  }
}

struct TextScreen: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Astryx.Text("Body text that wraps onto a second line when the screen is narrow.")
      Astryx.Text("Large", type: .large)
      Astryx.Text("Secondary", color: .secondary)
    }
  }
}

struct TextInputScreen: View {
  @State private var name = ""
  @State private var email = "ada@example.com"
  @State private var password = ""

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Astryx.TextInput(
        label: "Name", value: name, onChange: { name = $0 }, placeholder: "Your name")
      Astryx.TextInput(label: "Email", value: email, type: .email, onChange: { email = $0 })
      Astryx.TextInput(
        label: "Password", value: password, type: .password, onChange: { password = $0 })
    }
  }
}
