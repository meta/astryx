// Copyright (c) Meta Platforms, Inc. and affiliates.

import Astryx

/// The `login` template's state and rules, kept apart from the drawing so
/// they can be tested without a screen.
public struct LoginForm: Equatable, Sendable {
  public var email = ""
  public var password = ""
  public var error: String?
  public var isLoading = false

  public init() {}

  /// Checks the fields as the web template does: both are required. Returns
  /// true when sign-in may start.
  public mutating func submit() -> Bool {
    error = nil
    guard !email.isEmpty, !password.isEmpty else {
      error = "Please enter both email and password."
      return false
    }
    isLoading = true
    return true
  }
}

/// The `login` template: a centered credential form on the page ground, two
/// fields and a submit. It matches `astryx template login` in content and
/// states, and draws with SwiftUI's own layout.
public struct LoginTemplate: View {
  @State private var form = LoginForm()
  @Environment(\.astryx) private var astryx

  public init() {}

  public var body: some View {
    ScrollView {
      LoginTemplateContent(form: $form, signIn: signIn)
    }
    .background(astryx.color("color-background-body").ignoresSafeArea())
  }

  private func signIn() {
    guard form.submit() else { return }
    // The template has no backend: it shows the loading state, then returns.
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2))
      form.isLoading = false
    }
  }
}

/// The template's column, apart from its scroll view so it can be drawn to
/// an image (an image render draws a scroll view empty).
struct LoginTemplateContent: View {
  @Binding var form: LoginForm
  let signIn: () -> Void
  @Environment(\.astryx) private var astryx

  var body: some View {
    VStack(spacing: astryx.space(4)) {
      VStack(spacing: astryx.space(2)) {
        Image(systemName: "cube")
          .font(.system(size: astryx.fontSize("font-size-2xl", 24)))
          .foregroundStyle(astryx.color("color-icon-primary"))
          .accessibilityHidden(true)
        Text("Product Inc.", size: .lg, weight: .bold)
      }

      Card(padding: 8) {
        VStack(alignment: .leading, spacing: astryx.space(4)) {
          VStack(spacing: astryx.space(1)) {
            Heading("Sign in", level: .v2)
            Text("Enter your credentials to continue", size: .sm, color: .secondary)
          }
          .frame(maxWidth: .infinity)

          if let error = form.error {
            Banner(status: .error, title: error)
          }

          TextInput(
            label: "Email",
            value: $form.email,
            type: .email,
            size: .lg,
            placeholder: "you@example.com"
          )
          TextInput(
            label: "Password",
            value: $form.password,
            type: .password,
            size: .lg,
            placeholder: "Enter your password"
          )
          Button(
            label: "Sign in",
            variant: .primary,
            size: .lg,
            isLoading: form.isLoading,
            fillsWidth: true,
            action: signIn
          )
        }
      }
    }
    .frame(maxWidth: 400)
    .padding(astryx.space(6))
    .frame(maxWidth: .infinity)
  }
}

// A PreviewProvider rather than `#Preview`: the macro needs Xcode, and this
// package builds with the command-line tools alone.
struct LoginTemplatePreviews: PreviewProvider {
  static var previews: some View {
    LoginTemplate().astryxTheme()
  }
}
