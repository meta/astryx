// Copyright (c) Meta Platforms, Inc. and affiliates.

/// Draws one node of a wire tree a logic core sends (AST-082 FR19) with the
/// Astryx view for its component; `send` carries its callbacks back to the
/// core. A node this package cannot draw yet, or could not read, renders as
/// unsupported in its place, and its siblings still render.
public struct AstryxNodeView: View {
  let node: AstryxNode
  let send: @Sendable (AstryxAction) -> Void

  public init(_ node: AstryxNode, send: @escaping @Sendable (AstryxAction) -> Void) {
    self.node = node
    self.send = send
  }

  public var body: some View {
    switch node {
    case .text(let text): Text(text.viewProps(send: send))
    case .heading(let heading): Heading(heading.viewProps(send: send))
    case .card(let card): Card(card.viewProps(send: send), children: card.props.children ?? [], send: send)
    case .icon(let icon): Icon(icon.viewProps(send: send))
    default: AstryxUnsupportedNode(component: Self.componentName(node))
    }
  }

  /// The component a node names on the wire.
  static func componentName(_ node: AstryxNode) -> String {
    switch node {
    case .badge: "Badge"
    case .button: "Button"
    case .card: "Card"
    case .divider: "Divider"
    case .heading: "Heading"
    case .hStack: "HStack"
    case .icon: "Icon"
    case .progressBar: "ProgressBar"
    case .selector: "Selector"
    case .switch: "Switch"
    case .text: "Text"
    case .textInput: "TextInput"
    case .vStack: "VStack"
    case .unsupported(let component, _): component
    }
  }
}

/// A node drawn in place of one the package cannot draw: a dashed box naming
/// the component, so a developer sees what is missing and the rest of the tree
/// keeps its layout.
struct AstryxUnsupportedNode: View {
  let component: String
  @Environment(\.astryx) private var astryx

  var body: some View {
    let shape = RoundedRectangle(cornerRadius: astryx.tokens.radius.element, style: .continuous)
    SwiftUI.Text(component)
      .font(astryx.font(TypeStyle(astryx.tokens.font.code, families: astryx.tokens.font.family.code)))
      .foregroundStyle(astryx.tokens.color.textSecondary)
      .padding(astryx.tokens.space.s2)
      .overlay(shape.strokeBorder(astryx.tokens.color.borderEmphasized, style: StrokeStyle(lineWidth: astryx.tokens.size.borderWidth, dash: [4, 3])))
      .accessibilityLabel(SwiftUI.Text(component))
  }
}

/// Wire nodes drawn in order, as a content slot holds them.
public struct AstryxNodeList: View {
  let nodes: [AstryxNode]
  let send: @Sendable (AstryxAction) -> Void

  public var body: some View {
    ForEach(nodes, id: \.key) { node in
      AstryxNodeView(node, send: send)
    }
  }
}
