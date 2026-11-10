//! A Rust API wrapper for Boa's `ArrayBuffer` Builtin ECMAScript Object
use crate::{
    Context, JsResult, JsValue,
    builtins::array_buffer::ArrayBuffer,
    context::intrinsics::StandardConstructors,
    error::JsNativeError,
    object::{JsObject, internal_methods::get_prototype_from_constructor},
    value::TryFromJs,
};
use boa_gc::{Finalize, GcRef, GcRefMut, Trace};
use std::ops::Deref;

#[doc(inline)]
pub use crate::builtins::array_buffer::AlignedVec;

/// `JsArrayBuffer` provides a wrapper for Boa's implementation of the ECMAScript `ArrayBuffer` object
#[derive(Debug, Clone, Trace, Finalize)]
#[boa_gc(unsafe_no_drop)]
pub struct JsArrayBuffer {
    inner: JsObject<ArrayBuffer>,
}

impl From<JsArrayBuffer> for JsObject<ArrayBuffer> {
    #[inline]
    fn from(value: JsArrayBuffer) -> Self {
        value.inner
    }
}

impl From<JsObject<ArrayBuffer>> for JsArrayBuffer {
    #[inline]
    fn from(value: JsObject<ArrayBuffer>) -> Self {
        Self { inner: value }
    }
}

// TODO: Add constructors that also take the `detach_key` as argument.
impl JsArrayBuffer {
    /// Create a new array buffer with byte length.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::JsArrayBuffer,
    /// # Context, JsResult, JsValue
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    /// // Creates a blank array buffer of n bytes
    /// let array_buffer = JsArrayBuffer::new(4, context)?;
    ///
    /// assert_eq!(
    ///     array_buffer.detach(&JsValue::undefined())?.as_slice(),
    ///     &[0u8, 0, 0, 0]
    /// );
    ///
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn new(byte_length: usize, context: &mut Context) -> JsResult<Self> {
        let inner = ArrayBuffer::allocate(
            &context
                .intrinsics()
                .constructors()
                .array_buffer()
                .constructor()
                .into(),
            byte_length as u64,
            None,
            context,
        )?;

        Ok(Self { inner })
    }

    /// Create a new array buffer from byte block.
    ///
    /// This uses the passed byte block as the internal storage, it does not clone it!
    ///
    /// The `byte_length` will be set to `byte_block.len()`.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::{JsArrayBuffer, AlignedVec},
    /// # Context, JsResult, JsValue,
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    ///
    /// // Create a buffer from a chunk of data
    /// let data_block = AlignedVec::from_iter(0, 0..5);
    /// let array_buffer = JsArrayBuffer::from_byte_block(data_block, context)?;
    ///
    /// assert_eq!(
    ///     array_buffer.detach(&JsValue::undefined())?.as_slice(),
    ///     &[0u8, 1, 2, 3, 4]
    /// );
    /// # Ok(())
    /// # }
    /// ```
    pub fn from_byte_block(byte_block: AlignedVec<u8>, context: &mut Context) -> JsResult<Self> {
        let constructor = context
            .intrinsics()
            .constructors()
            .array_buffer()
            .constructor()
            .into();

        // 1. Let obj be ? OrdinaryCreateFromConstructor(constructor, "%ArrayBuffer.prototype%", « [[ArrayBufferData]], [[ArrayBufferByteLength]], [[ArrayBufferDetachKey]] »).
        let prototype = get_prototype_from_constructor(
            &constructor,
            StandardConstructors::array_buffer,
            context,
        )?;

        // 2. Let block be ? CreateByteDataBlock(byteLength).
        //
        // NOTE: We skip step 2. because we already have the block
        // that is passed to us as a function argument.
        let block = byte_block;

        // 3. Set obj.[[ArrayBufferData]] to block.
        // 4. Set obj.[[ArrayBufferByteLength]] to byteLength.
        let obj = JsObject::new(
            context.root_shape(),
            prototype,
            ArrayBuffer::from_data(block, JsValue::undefined()),
        );

        Ok(Self { inner: obj })
    }

    /// Set a maximum length for the underlying array buffer.
    #[inline]
    #[must_use]
    pub fn with_max_byte_length(self, max_byte_len: u64) -> Self {
        self.inner
            .borrow_mut()
            .data_mut()
            .set_max_byte_length(max_byte_len);
        self
    }

    /// Create a [`JsArrayBuffer`] from a [`JsObject`], if the object is not an array buffer throw a `TypeError`.
    ///
    /// This does not clone the fields of the array buffer, it only does a shallow clone of the object.
    #[inline]
    pub fn from_object(object: JsObject) -> JsResult<Self> {
        object
            .downcast::<ArrayBuffer>()
            .map(|inner| Self { inner })
            .map_err(|_| {
                JsNativeError::typ()
                    .with_message("object is not an ArrayBuffer")
                    .into()
            })
    }

    /// Returns the byte length of the array buffer.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::{JsArrayBuffer, AlignedVec},
    /// # Context, JsResult,
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    /// // Create a buffer from a chunk of data
    /// let data_block = AlignedVec::from_iter(0, 0..5);
    /// let array_buffer = JsArrayBuffer::from_byte_block(data_block, context)?;
    ///
    /// // Take the inner buffer
    /// let buffer_length = array_buffer.byte_length();
    ///
    /// assert_eq!(buffer_length, 5);
    /// # Ok(())
    /// # }
    ///  ```
    #[inline]
    #[must_use]
    pub fn byte_length(&self) -> usize {
        self.inner.borrow().data().len()
    }

    /// Take the inner `ArrayBuffer`'s `array_buffer_data` field and replace it with `None`
    ///
    /// # Note
    ///
    /// This tries to detach the pre-existing `JsArrayBuffer`, meaning the original detach
    /// key is required. By default, the key is set to `undefined`.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::{JsArrayBuffer, AlignedVec},
    /// # Context, JsResult, JsValue
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    /// // Create a buffer from a chunk of data
    /// let data_block = AlignedVec::from_iter(0, 0..5);
    /// let array_buffer = JsArrayBuffer::from_byte_block(data_block, context)?;
    ///
    /// // Take the inner buffer
    /// let internal_buffer = array_buffer.detach(&JsValue::undefined())?;
    ///
    /// assert_eq!(internal_buffer.as_slice(), &[0u8, 1, 2, 3, 4]);
    ///
    /// // Anymore interaction with the buffer will return an error
    /// let detached_err = array_buffer.detach(&JsValue::undefined());
    /// assert!(detached_err.is_err());
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    pub fn detach(&self, detach_key: &JsValue) -> JsResult<AlignedVec<u8>> {
        self.inner
            .borrow_mut()
            .data_mut()
            .detach(detach_key)?
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("ArrayBuffer was already detached")
                    .into()
            })
    }

    /// Get an immutable reference to the [`JsArrayBuffer`]'s data.
    ///
    /// Returns `None` if detached.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::{JsArrayBuffer, AlignedVec},
    /// # Context, JsResult, JsValue,
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    /// // Create a buffer from a chunk of data
    /// let data_block = AlignedVec::from_iter(0, 0..5);
    /// let array_buffer = JsArrayBuffer::from_byte_block(data_block, context)?;
    ///
    /// // Get a reference to the data.
    /// let internal_buffer = array_buffer.data();
    ///
    /// assert_eq!(internal_buffer.as_deref(), Some(&[0u8, 1, 2, 3, 4][..]));
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    #[must_use]
    pub fn data(&self) -> Option<GcRef<'_, [u8]>> {
        GcRef::try_map(self.inner.borrow(), |o| o.data().bytes())
    }

    /// Copies the contents of this [`JsArrayBuffer`] into a new [`Vec<u8>`].
    ///
    /// Returns `None` if the buffer has been detached.
    ///
    /// See also [`crate::object::builtins::JsUint8Array::to_vec`] and
    /// [`crate::object::builtins::JsSharedArrayBuffer::to_vec`].
    ///
    /// # Example
    ///
    /// ```
    /// # use boa_engine::object::builtins::{AlignedVec, JsArrayBuffer};
    /// # use boa_engine::{Context, JsResult, JsValue};
    /// # fn main() -> JsResult<()> {
    /// let context = &mut Context::default();
    /// let data = AlignedVec::from_iter(0, [1u8, 2, 3, 4]);
    /// let buffer = JsArrayBuffer::from_byte_block(data, context)?;
    /// assert_eq!(buffer.to_vec(), Some(vec![1u8, 2, 3, 4]));
    ///
    /// buffer.detach(&JsValue::undefined())?;
    /// assert_eq!(buffer.to_vec(), None);
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    #[must_use]
    pub fn to_vec(&self) -> Option<Vec<u8>> {
        self.data().map(|data| data.to_vec())
    }

    /// Get a mutable reference to the [`JsArrayBuffer`]'s data.
    ///
    /// Returns `None` if detached.
    ///
    /// ```
    /// # use boa_engine::{
    /// # object::builtins::{JsArrayBuffer, AlignedVec},
    /// # Context, JsResult, JsValue
    /// # };
    /// # fn main() -> JsResult<()> {
    /// # // Initialize context
    /// # let context = &mut Context::default();
    /// // Create a buffer from a chunk of data
    /// let data_block = AlignedVec::from_iter(0, 0..5);
    /// let array_buffer = JsArrayBuffer::from_byte_block(data_block, context)?;
    ///
    /// // Get a reference to the data.
    /// let mut internal_buffer = array_buffer
    ///     .data_mut()
    ///     .expect("the buffer should not be detached");
    ///
    /// internal_buffer.fill(10);
    ///
    /// assert_eq!(&*internal_buffer, &[10u8, 10, 10, 10, 10]);
    /// # Ok(())
    /// # }
    /// ```
    #[inline]
    #[must_use]
    pub fn data_mut(&self) -> Option<GcRefMut<'_, [u8]>> {
        GcRefMut::try_map(self.inner.borrow_mut(), |o| o.data_mut().bytes_mut())
    }
}

impl From<JsArrayBuffer> for JsObject {
    #[inline]
    fn from(o: JsArrayBuffer) -> Self {
        o.inner.upcast()
    }
}

impl From<JsArrayBuffer> for JsValue {
    #[inline]
    fn from(o: JsArrayBuffer) -> Self {
        o.inner.upcast().into()
    }
}

impl Deref for JsArrayBuffer {
    type Target = JsObject<ArrayBuffer>;

    #[inline]
    fn deref(&self) -> &Self::Target {
        &self.inner
    }
}

impl TryFromJs for JsArrayBuffer {
    fn try_from_js(value: &JsValue, _context: &mut Context) -> JsResult<Self> {
        if let Some(o) = value.as_object() {
            Self::from_object(o.clone())
        } else {
            Err(JsNativeError::typ()
                .with_message("value is not an ArrayBuffer object")
                .into())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{Context, JsValue};

    #[test]
    fn array_buffer_to_vec_roundtrip_and_detach() {
        let context = &mut Context::default();

        let data = AlignedVec::from_iter(0, [1u8, 2, 3, 4, 5]);
        let buffer = JsArrayBuffer::from_byte_block(data, context).unwrap();

        assert_eq!(buffer.to_vec(), Some(vec![1u8, 2, 3, 4, 5]));

        buffer.detach(&JsValue::undefined()).unwrap();
        assert_eq!(buffer.to_vec(), None);
    }

    #[test]
    fn array_buffer_to_vec_empty() {
        let context = &mut Context::default();

        let data = AlignedVec::from_iter(0, []);
        let buffer = JsArrayBuffer::from_byte_block(data, context).unwrap();

        assert_eq!(buffer.to_vec(), Some(Vec::new()));
    }
}
