# Legacy macOS font rendering for Momiji 153 ESR

These patches fix two independently reproduced Noto Serif SC rendering problems
on OS X 10.9.5: variable weights render at the default weight, and overlapping
contours lose their intersection at the lower corners of the 口 component in
络 (U+7EDC), even in a static font.

The package targets the source linked from the Momiji 153.5.0 release:

```text
repository: https://github.com/aobaharuki2005/firefox.git
tag:        v153.5.0esr-mj
commit:     075bc0d96616dac12182c6ac5737d8b6ccd9e2cf
```

The patches also apply to that repository's `153esr_test` branch at
`0a60da47a59f435193510e0da294bd3a6d824304`, which adds only unrelated
extension-signing and CI changes.

## Apply to a source checkout

Run from this package directory, with a clean Momiji source checkout at either
of the revisions above:

```sh
momiji_source="/path/to/momiji-source"
package_dir="$PWD"
while IFS= read -r patch_name; do
  git -C "$momiji_source" apply --check "$package_dir/$patch_name"
  git -C "$momiji_source" apply "$package_dir/$patch_name"
done < series
```

`0001` contains the font implementation. `0002` adds self-contained licensed
font fixtures, standalone and browser verification scripts, results, and
before/after images under `legacy-font-tests/` in the source checkout. The full
series was applied to a temporary checkout of the stable baseline and every
resulting changed file was compared byte-for-byte with the source contribution.
No browser rebuild was needed for packaging these already tested changes.

Rebuild Momiji to use the font changes. Neither patch modifies build workflows
or toolchain requirements.

## Enable independently

Both preferences default to `false` and require a restart:

| Preference | Implementation | OS scope |
| --- | --- | --- |
| `gfx.font_rendering.legacy_macos.variations` | Pin axes with the bundled HarfBuzz subsetter and use static CGFonts for metrics and rasterization | Before macOS 10.13 |
| `gfx.font_rendering.legacy_macos.outlines` | Read original contours with HarfBuzz and fill using the nonzero rule | Before OS X 10.10 |

Variable fonts also require effective
`layout.css.font-variations.enabled=true`; the first preference allows platform
initialization to enable that support on older systems. Requested axes are
preserved through scaled-font serialization and WebRender font cache keys.
Unsupported outline/color fonts retain native drawing fallback. Face and static
instance caches are bounded to 16 and 8 entries per process, respectively.

## Validation on OS X 10.9.5

The full browser was cross-compiled on Linux, then tested on real x86_64
OS X 10.9.5 (13F1911), Momiji 153.5.0, build `20261018150825`. The user also
confirmed that both original website problems disappeared after installation.
Separate SDK 26.1/Rust Linux-host build adjustments are excluded from this
contribution.

Software WebRender and Canvas comparisons, using a static instance for each
requested weight and a fixed-weight geometry control for the overlap:

| Mode | Distinct weights | All five weight controls match | Fixed-weight overlap control matches |
| --- | ---: | --- | --- |
| Both off | 1 | No | No |
| Variations only | 5 | Yes | No |
| Outlines only | 1 | No | Yes |
| Both on | 5 | Yes | Yes |

The corresponding repaired comparisons were pixel-exact for software rendering,
including five weights (200/400/500/550/700), sizes 16/24/128/512, advances,
transformed positioning, and DOM screenshots. With both fixes and hardware
WebRender, all three DOM controls were byte-identical; the few Canvas
differences were at most 1/255 per channel. Repeated weight-550 rendering was
identical.

Standalone checks compared coordinates, glyph IDs and advances with FontTools,
and checked invalid inputs, raw paths and transformed overlap controls. These
passed with bundled HarfBuzz 14.2.0 and MacPorts 14.4.0. Packaged fixtures were
verified again before submission. Color emoji were visible and colored;
identical output across preference modes was not asserted.

After applying the patches, see `legacy-font-tests/README.md` for commands,
raw results, images, font provenance and the SIL Open Font License. The same
material is [viewable in the source contribution][source-tests].

Raw contours change hinting and antialiasing, including LCD appearance, beyond
the damaged corners. Both features remain opt-in: coverage establishes the
supplied TrueType subset on 10.9.5; general CFF2/color-variable-font coverage,
other OS versions and performance remain unverified.

[source-tests]: https://github.com/HoboChen/firefox/tree/c56964cfd93d984b9c5579dbde31411fdd6222cf/legacy-font-tests
