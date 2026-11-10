use std::rc::Rc;

use boa_ast::LinearSpan;
use boa_gc::{Finalize, Trace};

struct Inner {
    source_text: boa_ast::SourceText,
}
impl Inner {
    fn new(source_text: boa_ast::SourceText) -> Self {
        Self { source_text }
    }
}

#[derive(Default, Trace, Finalize, Clone)]
pub(crate) struct SourceText {
    #[unsafe_ignore_trace]
    source_text: Option<Rc<Inner>>,
}

impl SourceText {
    #[must_use]
    pub(crate) fn new(source_text: boa_ast::SourceText) -> Self {
        Self {
            source_text: Some(Rc::new(Inner::new(source_text))),
        }
    }

    fn new_empty() -> Self {
        Self { source_text: None }
    }

    #[inline]
    fn inner(&self) -> Option<&boa_ast::SourceText> {
        self.source_text.as_ref().map(|x| &x.source_text)
    }

    fn is_empty(&self) -> bool {
        self.source_text.is_none()
    }
}

/// Contains pointer to source code and span of the object.
#[derive(Default, Clone)]
pub struct SpannedSourceText {
    source_text: SourceText,
    span: Option<LinearSpan>,
}

impl SpannedSourceText {
    pub(crate) fn new(source_text: SourceText, span: Option<LinearSpan>) -> Self {
        Self { source_text, span }
    }

    pub(crate) fn new_source_only(source_text: SourceText) -> Self {
        Self {
            source_text,
            span: None,
        }
    }

    pub(crate) fn new_empty() -> Self {
        Self {
            source_text: SourceText::new_empty(),
            span: None,
        }
    }

    /// Creates new [`SpannedSourceText`] with the same [`SourceText`] but without its span.
    pub(crate) fn clone_only_source(&self) -> Self {
        Self {
            source_text: self.source_text.clone(),
            span: None,
        }
    }

    /// Returns the [`SourceText`].
    #[must_use]
    pub(crate) fn source_text(&self) -> SourceText {
        self.source_text.clone()
    }

    /// Test if the span is empty.
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        let span_is_empty = if let Some(x) = self.span {
            x.is_empty()
        } else {
            true
        };
        span_is_empty || self.source_text.is_empty()
    }

    /// Gets inner code points.
    #[must_use]
    pub fn to_code_points(&self) -> Option<&[u16]> {
        if let (Some(source_text), Some(span)) = (self.source_text.inner(), self.span) {
            Some(source_text.get_code_points_from_span(span))
        } else {
            None
        }
    }
}

impl std::fmt::Debug for SpannedSourceText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SourceTextSpanned").finish()
    }
}
impl std::fmt::Debug for SourceText {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SourceTextInner").finish()
    }
}
