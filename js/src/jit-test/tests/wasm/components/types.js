// |jit-test| skip-if: !wasmComponentsEnabled()

// ----------------------------------------------------------------------------
// Primitive types
{
  const primitives = [
    "bool", "s8", "u8", "s16", "u16", "s32", "u32",
    "s64", "u64", "f32", "f64", "char", "string",
  ];
  for (const prim of primitives) {
    wasmValidateText(`
      (component
        (type ${prim})
      )
    `);
  }
}

// ----------------------------------------------------------------------------
// Record types

// Basic record.
wasmValidateText(`
(component
  (type (record (field "x" u32) (field "y" u32)))
)
`);

// Empty record - should fail (spec requires at least one field).
wasmFailValidateText(`
(component
  (type (record))
)
`, /at least one field/);

// Record with type reference to a previously-defined type.
wasmValidateText(`
(component
  (type u32)
  (type (record
    (field "foo" f64)
    (field "bar" bool)
    (field "baz" 0)
  ))
)
`);

// Record with invalid type index.
wasmFailValidateText(`
(component
  (type u32)
  (type (record
    (field "baz" 1)
  ))
)
`, /invalid type index/);

// Record referencing non-value type (func type).
wasmFailValidateText(`
(component
  (type (func (param "a" s32) (result s32)))
  (type (record (field "f" 0)))
)
`, /not a value type/);

// Duplicate field names in a record - should fail (labels must be
// strongly-unique per spec).
wasmFailValidateText(`
(component
  (type (record (field "x" u32) (field "x" u32)))
)
`, /not strongly-unique/);

// Valid labels in record fields.
wasmValidateText(`
(component
  (type (record
    (field "x" u32)
    (field "my-field" u32)
    (field "a0" u32)
    (field "get-HTTP-header" u32)
  ))
)
`);

// ----------------------------------------------------------------------------
// Variant types

// Basic variant.
wasmValidateText(`
(component
  (type (variant (case "ok" u32) (case "err" string)))
)
`);

// Variant with no-payload case.
wasmValidateText(`
(component
  (type (variant (case "none") (case "some" u32)))
)
`);

// Empty variant (invalid).
wasmFailValidateText(`
(component
  (type (variant))
)
`, /at least one case/);

// Variant with invalid type reference.
wasmFailValidateText(`
(component
  (type (variant (case "bad" 99)))
)
`, /invalid type index/);

// Duplicate case names in a variant.
wasmFailValidateText(`
(component
  (type (variant (case "a" u32) (case "a" u32)))
)
`, /not strongly-unique/);

// Valid labels in variant cases.
wasmValidateText(`
(component
  (type (variant (case "ok" u32) (case "not-found") (case "HTTP-error" string)))
)
`);

// Invalid label in a variant case.
wasmFailValidateText(`
(component
  (type (variant (case "has space" u32)))
)
`, /invalid character/);

// ----------------------------------------------------------------------------
// List types

// Basic list.
wasmValidateText(`
(component
  (type (list u32))
)
`);

// List of a compound type.
wasmValidateText(`
(component
  (type (record (field "x" f64) (field "y" f64)))
  (type (list 0))
)
`);

// ----------------------------------------------------------------------------
// Tuple types

// Basic tuple.
wasmValidateText(`
(component
  (type (tuple u32 u32 f64))
)
`);

// Empty tuple (invalid).
wasmFailValidateText(`
(component
  (type (tuple))
)
`, /at least one type/);

// Tuple with type reference.
wasmValidateText(`
(component
  (type (record (field "a" u32) (field "b" u32)))
  (type (tuple 0 u32 f64))
)
`);

// ----------------------------------------------------------------------------
// Flags types

// Basic flags.
wasmValidateText(`
(component
  (type (flags "read" "write" "execute"))
)
`);

// Empty flags (invalid).
wasmFailValidateText(`
(component
  (type (flags))
)
`, /at least one label/);

// More than 32 flags (invalid).
wasmFailValidateText(`
(component
  (type (flags
    "a" "b" "c" "d" "e" "f" "g" "h"
    "i" "j" "k" "l" "m" "n" "o" "p"
    "q" "r" "s" "t" "u" "v" "w" "x"
    "y" "z" "aa" "bb" "cc" "dd" "ee" "ff"
    "gg"
  ))
)
`, /too many labels/);

// Duplicate flag labels.
wasmFailValidateText(`
(component
  (type (flags "read" "read"))
)
`, /not strongly-unique/);

// Valid labels in flags.
wasmValidateText(`
(component
  (type (flags "can-read" "can-write" "O-APPEND"))
)
`);

// Invalid label in flags.
wasmFailValidateText(`
(component
  (type (flags "trailing-"))
)
`, /ended unexpectedly/);

// ----------------------------------------------------------------------------
// Enum types

// Basic enum.
wasmValidateText(`
(component
  (type (enum "red" "green" "blue"))
)
`);

// Empty enum (invalid).
wasmFailValidateText(`
(component
  (type (enum))
)
`, /at least one case/);

// Duplicate enum labels.
wasmFailValidateText(`
(component
  (type (enum "red" "red"))
)
`, /not strongly-unique/);

// Valid labels in enums.
wasmValidateText(`
(component
  (type (enum "left" "top-right" "BOTTOM-LEFT"))
)
`);

// Invalid label in an enum.
wasmFailValidateText(`
(component
  (type (enum "" "ok"))
)
`, /cannot be empty/);

// ----------------------------------------------------------------------------
// Option types

// Basic option.
wasmValidateText(`
(component
  (type (option u32))
)
`);

// Option of a compound type.
wasmValidateText(`
(component
  (type (record (field "x" u32) (field "y" u32)))
  (type (option 0))
)
`);

// ----------------------------------------------------------------------------
// Result types

// Result with ok and error.
wasmValidateText(`
(component
  (type (result u32 (error string)))
)
`);

// Result with ok only.
wasmValidateText(`
(component
  (type (result u32))
)
`);

// Result with error only.
wasmValidateText(`
(component
  (type (result (error string)))
)
`);

// Result with neither.
wasmValidateText(`
(component
  (type (result))
)
`);

// ----------------------------------------------------------------------------
// Own and borrow types (resources not supported per plan)
// TODO(wasm-cm): Resource type parsing (0x3f) not yet implemented

wasmFailValidateText(`
(component
  (type (resource (rep i32)))
  (type (own 0))
)
`, /unexpected type/);

wasmFailValidateText(`
(component
  (type (resource (rep i32)))
  (type (borrow 0))
)
`, /unexpected type/);

// ----------------------------------------------------------------------------
// Func types

// Basic func type.
wasmValidateText(`
(component
  (type (func (param "a" s32) (param "b" s32) (result s32)))
)
`);

// Func with no result.
wasmValidateText(`
(component
  (type (func (param "a" s32)))
)
`);

// Func with no params.
wasmValidateText(`
(component
  (type (func (result s32)))
)
`);

// Func with no params or result.
wasmValidateText(`
(component
  (type (func))
)
`);

// Func with compound param types.
wasmValidateText(`
(component
  (type (record
    (field "foo" f64)
    (field "bar" bool)
  ))
  (type (func (param "a" 0) (param "b" 0)))
)
`);

// Func with compound result type.
wasmValidateText(`
(component
  (type (record (field "x" f64) (field "y" f64)))
  (type (func (param "a" f64) (param "b" f64) (result 0)))
)
`);

// Duplicate param names (invalid).
wasmFailValidateText(`
(component
  (type (func (param "a" s32) (param "a" s32)))
)
`, /not strongly-unique/);

// Valid labels in func params.
wasmValidateText(`
(component
  (type (func (param "my-param" s32) (result s32)))
)
`);

// Invalid label in a func param.
wasmFailValidateText(`
(component
  (type (func (param "0starts-with-digit" s32) (result s32)))
)
`, /invalid character/);

// ----------------------------------------------------------------------------
// Name well-formedness

// Labels must start with a letter, not a digit.
wasmFailValidateText(`
(component
  (type (record (field "0bad" u32)))
)
`, /invalid character/);

// Labels cannot contain underscores.
wasmFailValidateText(`
(component
  (type (record (field "no_underscores" u32)))
)
`, /invalid character/);

// Labels cannot contain spaces.
wasmFailValidateText(`
(component
  (type (record (field "no spaces" u32)))
)
`, /invalid character/);

// Labels cannot be empty.
wasmFailValidateText(`
(component
  (type (record (field "" u32)))
)
`, /cannot be empty/);

// Labels cannot have consecutive hyphens.
wasmFailValidateText(`
(component
  (type (record (field "no--double" u32)))
)
`, /invalid character/);

// Labels cannot end with a hyphen.
wasmFailValidateText(`
(component
  (type (record (field "trailing-" u32)))
)
`, /ended unexpectedly/);

// ----------------------------------------------------------------------------
// Plain name annotations
//
// [constructor], [method], and [static] are only valid on function names per
// the component model spec, so we use function imports as the test vehicle.

// [constructor] accepts a single label.
wasmValidateText(`
(component
  (import "[constructor]foo" (func))
)
`);

// [constructor] with a multi-word label.
wasmValidateText(`
(component
  (import "[constructor]my-resource" (func))
)
`);

// [constructor] does not accept a dotted name.
wasmFailValidateText(`
(component
  (import "[constructor]foo.bar" (func))
)
`, /invalid character/);

// [method] requires <label>.<label>.
wasmValidateText(`
(component
  (import "[method]foo.bar" (func))
)
`);

// [method] with multi-word labels on both sides.
wasmValidateText(`
(component
  (import "[method]my-resource.my-method" (func))
)
`);

// [method] with acronym in second label.
wasmValidateText(`
(component
  (import "[method]foo.BAR" (func))
)
`);

// [method] without a dot is invalid.
wasmFailValidateText(`
(component
  (import "[method]foo" (func))
)
`, /ended unexpectedly/);

// [method] with empty second label.
wasmFailValidateText(`
(component
  (import "[method]foo." (func))
)
`, /ended unexpectedly/);

// [method] with empty first label.
wasmFailValidateText(`
(component
  (import "[method].bar" (func))
)
`, /invalid character/);

// [method] may not contain more than one dot.
wasmFailValidateText(`
(component
  (import "[method]foo.bar.baz" (func))
)
`, /invalid character/);

// [static] requires <label>.<label>.
wasmValidateText(`
(component
  (import "[static]foo.bar" (func))
)
`);

// [static] with multi-word labels.
wasmValidateText(`
(component
  (import "[static]my-res.my-meth" (func))
)
`);

// [static] without a dot is invalid.
wasmFailValidateText(`
(component
  (import "[static]foo" (func))
)
`, /ended unexpectedly/);

// [static] with empty second label.
wasmFailValidateText(`
(component
  (import "[static]foo." (func))
)
`, /ended unexpectedly/);

// Unrecognized annotations are rejected.
wasmFailValidateText(`
(component
  (import "[unknown]foo" (func))
)
`, /invalid character/);

// Unclosed annotation bracket is rejected.
wasmFailValidateText(`
(component
  (import "[methodfoo.bar" (func))
)
`, /invalid character/);

// Invalid label after a valid annotation.
wasmFailValidateText(`
(component
  (import "[constructor]0bad" (func))
)
`, /invalid character/);

// ----------------------------------------------------------------------------
// Edge cases

// Forward type reference - should fail.
wasmFailValidateText(`
(component
  (type (record (field "x" 1)))
  (type u32)
)
`, /invalid type index/);

// Multiple type definitions referencing each other in order.
wasmValidateText(`
(component
  (type u32)
  (type (record (field "a" 0) (field "b" f64)))
  (type (tuple 0 1))
  (type (list 1))
  (type (option 2))
  (type (func (param "x" 1) (param "y" 2) (result 0)))
)
`);
