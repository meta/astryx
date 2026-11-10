use crate::vm::flowgraph::Color;

/// Represents the edge (connection) style.
#[derive(Debug, Clone, Copy)]
pub enum EdgeStyle {
    /// Represents a solid line.
    Line,
    /// Represents a dotted line.
    Dotted,
    /// Represents a dashed line.
    Dashed,
}

/// Represents the edge type.
#[derive(Debug, Clone, Copy)]
pub enum EdgeType {
    /// Represents no decoration on the edge line.
    None,
    /// Represents arrow edge type.
    Arrow,
}

/// Represents an edge/connection in the flowgraph.
#[derive(Debug, Clone)]
pub struct Edge {
    /// The location of the source node.
    pub(super) from: usize,
    /// The location of the destination node.
    pub(super) to: usize,
    /// The label on top of the edge.
    pub(super) label: Option<Box<str>>,
    /// The color of the line.
    pub(super) color: Color,
    /// The style of the line.
    pub(super) style: EdgeStyle,
    /// The type of the line.
    pub(super) type_: EdgeType,
}

impl Edge {
    /// Construct a new edge.
    pub(super) const fn new(
        from: usize,
        to: usize,
        label: Option<Box<str>>,
        color: Color,
        style: EdgeStyle,
    ) -> Self {
        Self {
            from,
            to,
            label,
            color,
            style,
            type_: EdgeType::Arrow,
        }
    }

    /// Set the type of the edge.
    #[inline]
    pub fn set_type(&mut self, type_: EdgeType) {
        self.type_ = type_;
    }
}
