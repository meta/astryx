use std::{
    ptr,
    sync::{Arc, atomic::Ordering},
};

use portable_atomic::{AtomicU8, AtomicUsize};

use boa_gc::{Finalize, Trace};

use crate::{
    Context, JsArgs, JsData, JsNativeError, JsObject, JsResult, JsString, JsSymbol, JsValue,
    builtins::{
        Array, BuiltInBuilder, BuiltInConstructor, BuiltInObject, IntrinsicObject,
        array_buffer::{AlignedBox, AlignedVec},
    },
    context::intrinsics::{Intrinsics, StandardConstructor, StandardConstructors},
    js_string,
    object::internal_methods::get_prototype_from_constructor,
    property::Attribute,
    realm::Realm,
    string::StaticJsStrings,
};

use super::{get_max_byte_len, utils::copy_shared_to_shared};

/// The internal representation of a `SharedArrayBuffer` object.
///
/// This struct implements `Send` and `Sync`, meaning it can be shared between threads
/// running different JS code at the same time.
#[derive(Debug, Clone, Trace, Finalize, JsData)]
pub struct SharedArrayBuffer {
    // Shared buffers cannot be detached.
    #[unsafe_ignore_trace]
    data: Arc<Inner>,
}

#[derive(Debug)]
struct Inner {
    // Technically we should have an `[[ArrayBufferData]]` internal slot,
    // `[[ArrayBufferByteLengthData]]` and `[[ArrayBufferMaxByteLength]]` slots for growable arrays
    // or `[[ArrayBufferByteLength]]` for fixed arrays, but we can save some work
    // by just using this representation instead.
    //
    // The maximum buffer length is represented by `buffer.len()`, and `current_len` has the current
    // buffer length, or `None` if this is a fixed buffer; in this case, `buffer.len()` will be
    // the true length of the buffer.
    buffer: AlignedBox<[AtomicU8]>,
    current_len: Option<AtomicUsize>,
}

impl Default for Inner {
    fn default() -> Self {
        Self {
            buffer: AlignedVec::new(0).into_boxed_slice(),
            current_len: None,
        }
    }
}

impl SharedArrayBuffer {
    /// Creates a `SharedArrayBuffer` with an empty buffer.
    #[must_use]
    pub fn empty() -> Self {
        Self {
            data: Arc::default(),
        }
    }

    /// Gets the length of this `SharedArrayBuffer`.
    pub(crate) fn len(&self, ordering: Ordering) -> usize {
        self.data
            .current_len
            .as_ref()
            .map_or_else(|| self.data.buffer.len(), |len| len.load(ordering))
    }

    /// Gets the inner bytes of this `SharedArrayBuffer`.
    pub(crate) fn bytes(&self, ordering: Ordering) -> &[AtomicU8] {
        &self.data.buffer[..self.len(ordering)]
    }

    /// Gets the inner data of the buffer without accessing the current atomic length.
    #[track_caller]
    pub(crate) fn bytes_with_len(&self, len: usize) -> &[AtomicU8] {
        &self.data.buffer[..len]
    }

    /// Gets a pointer to the internal shared buffer.
    pub(crate) fn as_ptr(&self) -> *const AtomicU8 {
        (*self.data.buffer).as_ptr()
    }

    pub(crate) fn is_fixed_len(&self) -> bool {
        self.data.current_len.is_none()
    }
}

impl IntrinsicObject for SharedArrayBuffer {
    fn init(realm: &Realm) {
        let flag_attributes = Attribute::CONFIGURABLE | Attribute::NON_ENUMERABLE;

        let get_species = BuiltInBuilder::callable(realm, Self::get_species)
            .name(js_string!("get [Symbol.species]"))
            .build();

        let get_byte_length = BuiltInBuilder::callable(realm, Self::get_byte_length)
            .name(js_string!("get byteLength"))
            .build();

        let get_growable = BuiltInBuilder::callable(realm, Self::get_growable)
            .name(js_string!("get growable"))
            .build();

        let get_max_byte_length = BuiltInBuilder::callable(realm, Self::get_max_byte_length)
            .name(js_string!("get maxByteLength"))
            .build();

        BuiltInBuilder::from_standard_constructor::<Self>(realm)
            .static_accessor(
                JsSymbol::species(),
                Some(get_species),
                None,
                Attribute::CONFIGURABLE,
            )
            .accessor(
                js_string!("byteLength"),
                Some(get_byte_length),
                None,
                flag_attributes,
            )
            .accessor(
                js_string!("growable"),
                Some(get_growable),
                None,
                flag_attributes,
            )
            .accessor(
                js_string!("maxByteLength"),
                Some(get_max_byte_length),
                None,
                flag_attributes,
            )
            .method(Self::slice, js_string!("slice"), 2)
            .method(Self::grow, js_string!("grow"), 1)
            .property(
                JsSymbol::to_string_tag(),
                Self::NAME,
                Attribute::READONLY | Attribute::NON_ENUMERABLE | Attribute::CONFIGURABLE,
            )
            .build();
    }

    fn get(intrinsics: &Intrinsics) -> JsObject {
        Self::STANDARD_CONSTRUCTOR(intrinsics.constructors()).constructor()
    }
}

impl BuiltInObject for SharedArrayBuffer {
    const NAME: JsString = StaticJsStrings::SHARED_ARRAY_BUFFER;
}

impl BuiltInConstructor for SharedArrayBuffer {
    const CONSTRUCTOR_ARGUMENTS: usize = 1;
    const PROTOTYPE_STORAGE_SLOTS: usize = 9;
    const CONSTRUCTOR_STORAGE_SLOTS: usize = 2;

    const STANDARD_CONSTRUCTOR: fn(&StandardConstructors) -> &StandardConstructor =
        StandardConstructors::shared_array_buffer;

    /// `25.1.3.1 SharedArrayBuffer ( length [ , options ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-sharedarraybuffer-constructor
    fn constructor(
        new_target: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. If NewTarget is undefined, throw a TypeError exception.
        if new_target.is_undefined() {
            return Err(JsNativeError::typ()
                .with_message("ArrayBuffer.constructor called with undefined new target")
                .into());
        }

        // 2. Let byteLength be ? ToIndex(length).
        let byte_len = args.get_or_undefined(0).to_index(context)?;

        // 3. Let requestedMaxByteLength be ? GetArrayBufferMaxByteLengthOption(options).
        let max_byte_len = get_max_byte_len(args.get_or_undefined(1), context)?;

        // 4. Return ? AllocateSharedArrayBuffer(NewTarget, byteLength, requestedMaxByteLength).
        Ok(Self::allocate(new_target, byte_len, max_byte_len, context)?
            .upcast()
            .into())
    }
}

impl SharedArrayBuffer {
    /// `get SharedArrayBuffer [ @@species ]`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-sharedarraybuffer-@@species
    #[allow(clippy::unnecessary_wraps)]
    fn get_species(this: &JsValue, _: &[JsValue], _: &mut Context) -> JsResult<JsValue> {
        // 1. Return the this value.
        Ok(this.clone())
    }

    /// `get SharedArrayBuffer.prototype.byteLength`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-sharedarraybuffer.prototype.bytelength
    pub(crate) fn get_byte_length(
        this: &JsValue,
        _args: &[JsValue],
        _: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[ArrayBufferData]]).
        // 3. If IsSharedArrayBuffer(O) is true, throw a TypeError exception.
        let object = this.as_object();
        let buf = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("SharedArrayBuffer.byteLength called with invalid value")
            })?;

        // 4. Let length be ArrayBufferByteLength(O, seq-cst).
        let len = buf.bytes(Ordering::SeqCst).len() as u64;

        // 5. Return 𝔽(length).
        Ok(len.into())
    }

    /// [`get SharedArrayBuffer.prototype.growable`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-sharedarraybuffer.prototype.growable
    pub(crate) fn get_growable(
        this: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[ArrayBufferData]]).
        // 3. If IsSharedArrayBuffer(O) is false, throw a TypeError exception.
        let object = this.as_object();
        let buf = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("get SharedArrayBuffer.growable called with invalid `this`")
            })?;

        // 4. If IsFixedLengthArrayBuffer(O) is false, return true; otherwise return false.
        Ok(JsValue::from(!buf.is_fixed_len()))
    }

    /// [`get SharedArrayBuffer.prototype.maxByteLength`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-get-sharedarraybuffer.prototype.maxbytelength
    pub(crate) fn get_max_byte_length(
        this: &JsValue,
        _args: &[JsValue],
        _context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[ArrayBufferData]]).
        // 3. If IsSharedArrayBuffer(O) is false, throw a TypeError exception.
        let object = this.as_object();
        let buf = object
            .as_ref()
            .and_then(JsObject::downcast_ref::<Self>)
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("get SharedArrayBuffer.maxByteLength called with invalid value")
            })?;

        // 4. If IsFixedLengthArrayBuffer(O) is true, then
        //     a. Let length be O.[[ArrayBufferByteLength]].
        // 5. Else,
        //     a. Let length be O.[[ArrayBufferMaxByteLength]].
        // 6. Return 𝔽(length).
        Ok(buf.data.buffer.len().into())
    }

    /// [`SharedArrayBuffer.prototype.grow ( newLength )`][spec].
    ///
    /// [spec]: https://tc39.es/ecma262/sec-sharedarraybuffer.prototype.grow
    pub(crate) fn grow(
        this: &JsValue,
        args: &[JsValue],
        context: &mut Context,
    ) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 3. If IsSharedArrayBuffer(O) is false, throw a TypeError exception.
        let Some(buf) = this
            .as_object()
            .and_then(|o| o.clone().downcast::<Self>().ok())
        else {
            return Err(JsNativeError::typ()
                .with_message("SharedArrayBuffer.grow called with non-object value")
                .into());
        };

        // 2. Perform ? RequireInternalSlot(O, [[ArrayBufferMaxByteLength]]).
        if buf.borrow().data().is_fixed_len() {
            return Err(JsNativeError::typ()
                .with_message("SharedArrayBuffer.grow: cannot grow a fixed-length buffer")
                .into());
        }

        // 4. Let newByteLength be ? ToIndex(newLength).
        let new_byte_len = args.get_or_undefined(0).to_index(context)?;

        // TODO: 5. Let hostHandled be ? HostGrowSharedArrayBuffer(O, newByteLength).
        // 6. If hostHandled is handled, return undefined.
        // Used in engines to handle Wasm buffers in a special way, but we don't
        // have a Wasm interpreter in place yet.

        // 7. Let isLittleEndian be the value of the [[LittleEndian]] field of the surrounding agent's Agent Record.
        // 8. Let byteLengthBlock be O.[[ArrayBufferByteLengthData]].
        // 9. Let currentByteLengthRawBytes be GetRawBytesFromSharedBlock(byteLengthBlock, 0, biguint64, true, seq-cst).
        // 10. Let newByteLengthRawBytes be NumericToRawBytes(biguint64, ℤ(newByteLength), isLittleEndian).

        let buf = buf.borrow();
        let buf = &buf.data();

        // d. If newByteLength < currentByteLength or newByteLength > O.[[ArrayBufferMaxByteLength]], throw a RangeError exception.
        // Extracting this condition outside the CAS since throwing early doesn't affect the correct
        // behaviour of the loop.
        if new_byte_len > buf.data.buffer.len() as u64 {
            return Err(JsNativeError::range()
                .with_message(
                    "SharedArrayBuffer.grow: new length cannot be bigger than `maxByteLength`",
                )
                .into());
        }
        let new_byte_len = new_byte_len as usize;

        // If we used let-else above to avoid the expect, we would carry a borrow through the `to_index`
        // call, which could mutably borrow. Another alternative would be to clone the whole
        // `SharedArrayBuffer`, but it's better to avoid contention with the counter in the `Arc` pointer.
        let atomic_len = buf
            .data
            .current_len
            .as_ref()
            .expect("already checked that the buffer is not fixed-length");

        // 11. Repeat,
        //     a. NOTE: This is a compare-and-exchange loop to ensure that parallel, racing grows of the same buffer are
        //        totally ordered, are not lost, and do not silently do nothing. The loop exits if it was able to attempt
        //        to grow uncontended.
        //     b. Let currentByteLength be ℝ(RawBytesToNumeric(biguint64, currentByteLengthRawBytes, isLittleEndian)).
        //     c. If newByteLength = currentByteLength, return undefined.
        //     d. If newByteLength < currentByteLength or newByteLength > O.[[ArrayBufferMaxByteLength]], throw a
        //        RangeError exception.
        //     e. Let byteLengthDelta be newByteLength - currentByteLength.
        //     f. If it is impossible to create a new Shared Data Block value consisting of byteLengthDelta bytes, throw
        //        a RangeError exception.
        //     g. NOTE: No new Shared Data Block is constructed and used here. The observable behaviour of growable
        //        SharedArrayBuffers is specified by allocating a max-sized Shared Data Block at construction time, and
        //        this step captures the requirement that implementations that run out of memory must throw a RangeError.
        //     h. Let readByteLengthRawBytes be AtomicCompareExchangeInSharedBlock(byteLengthBlock, 0, 8,
        //        currentByteLengthRawBytes, newByteLengthRawBytes).
        //     i. If ByteListEqual(readByteLengthRawBytes, currentByteLengthRawBytes) is true, return undefined.
        //     j. Set currentByteLengthRawBytes to readByteLengthRawBytes.

        // We require SEQ-CST operations because readers of the buffer also use SEQ-CST operations.
        atomic_len
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |prev_byte_len| {
                (prev_byte_len <= new_byte_len).then_some(new_byte_len)
            })
            .map_err(|_| {
                JsNativeError::range()
                    .with_message("SharedArrayBuffer.grow: failed to grow buffer to new length")
            })?;

        Ok(JsValue::undefined())
    }

    /// `SharedArrayBuffer.prototype.slice ( start, end )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-sharedarraybuffer.prototype.slice
    fn slice(this: &JsValue, args: &[JsValue], context: &mut Context) -> JsResult<JsValue> {
        // 1. Let O be the this value.
        // 2. Perform ? RequireInternalSlot(O, [[ArrayBufferData]]).
        // 3. If IsSharedArrayBuffer(O) is false, throw a TypeError exception.
        let buf = this
            .as_object()
            .and_then(|o| o.clone().downcast::<Self>().ok())
            .ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("SharedArrayBuffer.slice called with invalid `this` value")
            })?;

        // 4. Let len be ArrayBufferByteLength(O, seq-cst).
        let len = buf.borrow().data().len(Ordering::SeqCst);

        // 5. Let relativeStart be ? ToIntegerOrInfinity(start).
        // 6. If relativeStart = -∞, let first be 0.
        // 7. Else if relativeStart < 0, let first be max(len + relativeStart, 0).
        // 8. Else, let first be min(relativeStart, len).
        let first = Array::get_relative_start(context, args.get_or_undefined(0), len as u64)?;

        // 9. If end is undefined, let relativeEnd be len; else let relativeEnd be ? ToIntegerOrInfinity(end).
        // 10. If relativeEnd = -∞, let final be 0.
        // 11. Else if relativeEnd < 0, let final be max(len + relativeEnd, 0).
        // 12. Else, let final be min(relativeEnd, len).
        let final_ = Array::get_relative_end(context, args.get_or_undefined(1), len as u64)?;

        // 13. Let newLen be max(final - first, 0).
        let new_len = final_.saturating_sub(first);

        // 14. Let ctor be ? SpeciesConstructor(O, %SharedArrayBuffer%).
        let ctor = buf
            .clone()
            .upcast()
            .species_constructor(StandardConstructors::shared_array_buffer, context)?;

        // 15. Let new be ? Construct(ctor, « 𝔽(newLen) »).
        let new = ctor.construct(&[new_len.into()], Some(&ctor), context)?;

        {
            let buf = buf.borrow();
            let buf = &buf.data();
            // 16. Perform ? RequireInternalSlot(new, [[ArrayBufferData]]).
            // 17. If IsSharedArrayBuffer(new) is false, throw a TypeError exception.
            let new = new.downcast_ref::<Self>().ok_or_else(|| {
                JsNativeError::typ()
                    .with_message("SharedArrayBuffer constructor returned invalid object")
            })?;

            // 18. If new.[[ArrayBufferData]] is O.[[ArrayBufferData]], throw a TypeError exception.
            if ptr::eq(buf.as_ptr(), new.as_ptr()) {
                return Err(JsNativeError::typ()
                    .with_message("cannot reuse the same SharedArrayBuffer for a slice operation")
                    .into());
            }

            // 19. If ArrayBufferByteLength(new, seq-cst) < newLen, throw a TypeError exception.
            if (new.len(Ordering::SeqCst) as u64) < new_len {
                return Err(JsNativeError::typ()
                    .with_message("invalid size of constructed SharedArrayBuffer")
                    .into());
            }

            let first = first as usize;
            let new_len = new_len as usize;

            // 20. Let fromBuf be O.[[ArrayBufferData]].
            let from_buf = &buf.bytes_with_len(len)[first..];

            // 21. Let toBuf be new.[[ArrayBufferData]].
            let to_buf = new;

            // Sanity check to ensure there is enough space inside `from_buf` for
            // `new_len` elements.
            debug_assert!(from_buf.len() >= new_len);

            // 22. Perform CopyDataBlockBytes(toBuf, 0, fromBuf, first, newLen).
            // SAFETY: `get_slice_range` will always return indices that are in-bounds.
            // This also means that the newly created buffer will have at least `new_len` elements
            // to write to.
            unsafe { copy_shared_to_shared(from_buf.as_ptr(), to_buf.as_ptr(), new_len) }
        }

        // 23. Return new.
        Ok(new.into())
    }

    /// `AllocateSharedArrayBuffer ( constructor, byteLength [ , maxByteLength ] )`
    ///
    /// More information:
    ///  - [ECMAScript reference][spec]
    ///
    /// [spec]: https://tc39.es/ecma262/#sec-allocatesharedarraybuffer
    pub(crate) fn allocate(
        constructor: &JsValue,
        byte_len: u64,
        max_byte_len: Option<u64>,
        context: &mut Context,
    ) -> JsResult<JsObject<SharedArrayBuffer>> {
        // 1. Let slots be « [[ArrayBufferData]] ».
        // 2. If maxByteLength is present and maxByteLength is not empty, let allocatingGrowableBuffer
        //    be true; otherwise let allocatingGrowableBuffer be false.
        // 3. If allocatingGrowableBuffer is true, then
        //     a. If byteLength > maxByteLength, throw a RangeError exception.
        //     b. Append [[ArrayBufferByteLengthData]] and [[ArrayBufferMaxByteLength]] to slots.
        // 4. Else,
        //     a. Append [[ArrayBufferByteLength]] to slots.
        if let Some(max_byte_len) = max_byte_len
            && byte_len > max_byte_len
        {
            return Err(JsNativeError::range()
                .with_message("`length` cannot be bigger than `maxByteLength`")
                .into());
        }

        // 5. Let obj be ? OrdinaryCreateFromConstructor(constructor, "%SharedArrayBuffer.prototype%", slots).
        let prototype = get_prototype_from_constructor(
            constructor,
            StandardConstructors::shared_array_buffer,
            context,
        )?;

        // 6. If allocatingGrowableBuffer is true, let allocLength be maxByteLength;
        //    otherwise let allocLength be byteLength.
        let alloc_len = max_byte_len.unwrap_or(byte_len);

        // 7. Let block be ? CreateSharedByteDataBlock(allocLength).
        // 8. Set obj.[[ArrayBufferData]] to block.
        let block = create_shared_byte_data_block(alloc_len, context)?;

        // 9. If allocatingGrowableBuffer is true, then
        // `byte_len` must fit inside an `usize` thanks to the checks inside
        // `create_shared_byte_data_block`.
        // a. Assert: byteLength ≤ maxByteLength.
        // b. Let byteLengthBlock be ? CreateSharedByteDataBlock(8).
        // c. Perform SetValueInBuffer(byteLengthBlock, 0, biguint64, ℤ(byteLength), true, seq-cst).
        // d. Set obj.[[ArrayBufferByteLengthData]] to byteLengthBlock.
        // e. Set obj.[[ArrayBufferMaxByteLength]] to maxByteLength.
        let current_len = max_byte_len.map(|_| AtomicUsize::new(byte_len as usize));

        // 10. Else,
        //     a. Set obj.[[ArrayBufferByteLength]] to byteLength.
        let obj = JsObject::new(
            context.root_shape(),
            prototype,
            Self {
                data: Arc::new(Inner {
                    buffer: block,
                    current_len,
                }),
            },
        );

        // 11. Return obj.
        Ok(obj)
    }
}

/// [`CreateSharedByteDataBlock ( size )`][spec] abstract operation.
///
/// Creates a new `Arc<Vec<AtomicU8>>` that can be used as a backing buffer for a [`SharedArrayBuffer`].
///
/// For more information, check the [spec][spec].
///
/// [spec]: https://tc39.es/ecma262/#sec-createsharedbytedatablock
pub(crate) fn create_shared_byte_data_block(
    size: u64,
    context: &mut Context,
) -> JsResult<AlignedBox<[AtomicU8]>> {
    if size > context.host_hooks().max_buffer_size(context) {
        return Err(JsNativeError::range()
            .with_message(
                "cannot allocate a buffer that exceeds the maximum buffer size".to_string(),
            )
            .into());
    }

    // 1. Let db be a new Shared Data Block value consisting of size bytes. If it is impossible to
    //    create such a Shared Data Block, throw a RangeError exception.
    let size = size.try_into().map_err(|e| {
        JsNativeError::range().with_message(format!("couldn't allocate the data block: {e}"))
    })?;

    if size == 0 {
        // Must ensure we don't allocate a zero-sized buffer.
        return Ok(AlignedVec::new(0).into_boxed_slice());
    }

    // 2. Let execution be the [[CandidateExecution]] field of the surrounding agent's Agent Record.
    // 3. Let eventsRecord be the Agent Events Record of execution.[[EventsRecords]] whose
    //    [[AgentSignifier]] is AgentSignifier().
    // 4. Let zero be « 0 ».
    // 5. For each index i of db, do
    //     a. Append WriteSharedMemory { [[Order]]: init, [[NoTear]]: true, [[Block]]: db,
    //        [[ByteIndex]]: i, [[ElementSize]]: 1, [[Payload]]: zero } to eventsRecord.[[EventList]].
    // 6. Return db.
    let mut buf = AlignedVec::<u8>::new(0);
    buf.try_reserve_exact(size).map_err(|e| {
        let message = match e {
            aligned_vec::TryReserveError::CapacityOverflow => {
                format!("capacity overflow for size {size} while allocating data block")
            }
            aligned_vec::TryReserveError::AllocError { layout } => {
                format!("invalid layout {layout:?} while allocating data block")
            }
        };
        JsNativeError::range().with_message(message)
    })?;
    buf.resize(size, 0);
    buf.shrink_to_fit();
    let (data, align, len, _) = buf.into_raw_parts();

    // 3. Return db.
    // SAFETY: `[u8]` must be transparently castable to `[AtomicU8]`.
    Ok(unsafe {
        AlignedBox::from_raw_parts(align, ptr::slice_from_raw_parts_mut(data.cast(), len))
    })
}
