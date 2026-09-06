# A. Critical changes in Firefox Dynasty

**Relation summary:**

Available categories:
* Syntax/API backport
* Metadata override
* Feature gating
* Class schema extension
* UI rendering restoration
* Build graph surgery
* Build environment constraint
* Linker behavior modification
* Runtime library/API/toolchain substitution
* Preprocessor branch collapse
* Driver behavior compensation
* API availability guarding
* Upstream revert/source restoration
* Diagnostic posture adjustment
* Dynamic symbol resolution with manual fallback
* Safety fix
* Non legacy-specific fix
* OS-version-parameterized behaviour
* System layer bypass
* Toolchain API compatibility shim
* *Non legacy-macOS specific*

*! Consider grouping `vda-restoration` cohesion group (019-023)*

Notable address:
1. `media/ffvpx/libavutil/x86`, `media/ffvpx/libavutil/libmozavutil.dylib.symbols.stub` [clock_gettime]
2. `config/external/gkcodecs/libgkcodecs.dylib` [clock_gettime]
3. Differences in `nsCocoaWindow`
4. Pinch-zoom patches

# B. Changes in detail

## 1. `Cargo.lock` child

**Summary:**
* Add `whatsys` dependencies in the following Rust packages:
	* `crashreporter`
	* `metal`
	* `osclientcerts`
	* `zeitstempel`

**Taxonomy classification:**

1. *Addition*
1. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

...

---

## 2. `accessible\mac` subtree

### Files affected:

* `accessible\mac\MOXAccessibleBase.mm`
* `accessible\mac\MOXTextMarkerDelegate.mm`
* `accessible/mac/mozAccessible.mm`

### 2.1. `accessible\mac\MOXAccessibleBase.mm`

**Summary:**
* Modernize Objective-C syntax in Firefox's macOS base accessibility layer (`MOXAccessibleBase.mm`) for compatibility with older runtimes.

**Taxonomy classification:**

1. *Syntax/API backport*: modern subscript syntax --> explicit message-send syntax. Detail:

| Before (modern) | After (legacy) |
| --- | --- |
| `dictionary(key)` | `[dictionary objectForKey:key]` |
| `array[index]` | `[array objectAtIndex:index]` |

2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

The subscript operators (`[]`) for `NSDictionary` and `NSArray` were introduced as part of **Objective-C literals and subscripting**, a feature added in **Xcode 4.4 / LLVM 4.0 (2012)**. While the syntax itself compiles fine with a modern compiler, the runtime support it relies on — specifically `-objectForKeyedSubscript:` and `-objectAtIndexedSubscript:` — was only added to Foundation in OS X 10.8 Mountain Lion.

On macOS 10.7 (Lion), which Momiji targets, these methods don't exist in the system's Foundation framework, so code using subscript syntax will crash at runtime even if it compiles cleanly.

The fix touches five categories of lookups in the accessibility dispatch logic:

1. ***Attribute getter/setter lookups*** — resolving attribute names to selectors via NSDictionary
2. ***Text marker delegate lookups*** — same pattern for the text marker delegate path
3. ***Action lookups*** — resolving action names to selectors
4. ***Parameterized attribute lookups*** — both standard and text marker variants
5. ***Array element access*** — one instance of `value[i]` → `[value objectAtIndex:i]`

### 2.2. `accessible\mac\MOXTextMarkerDelegate.mm`

**Summary:**
* Modernize Objective-C syntax in text marker delegate (`MOXTextMarkerDelegate.mm`) — the component responsible for managing text selection and caret state in the macOS accessibility tree - for compatibility with older runtimes.

**Taxonomy classification:**

1. *Syntax/API backport*: 

Two categories of substitution, detail:

Dictionary subscript writes → explicit `setObject:forKey:`

| Before | After |
| --- | --- |
| `info[@"AXTextStateSync"] = @YES` | `[info setObject:@YES forKey:@"AXTextStateSync"]` |
| `info[@"AXTextSelectionDirection"] = @(...)` | `[info setObject:@(...) forKey:@"AXTextSelectionDirection"]` |
| `info[@"AXTextSelectionChangedFocus"] = @YES` | `[info setObject:@YES forKey:@"AXTextSelectionChangedFocus"]` |

Array subscript reads → explicit `objectAtIndex:`

| Before | After |
| --- | --- |
| `textMarkers[i]` | `[textMarkers objectAtIndex:i]` |

2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

This patch deals with the same problem with Patch No. 2, however with some subtle difference.
> *In detail:* 
>
> Patch No 2. `accessible\mac\MOXAccessibleBase.mm` only dealt with reding from dictionaries (`objectForKey:`). 
>
> This patch, dealing with the same problem, but introduces the *write side*, using `setObject:forKey:` in place of subscript assignment (`dict[key] = value`). The same macOS 10.8 runtime requirement applies: `NSMutableDictionary`'s `-setObject:forKeyedSubscript:` does not exist on 10.7, so original subscript assignment would crash at runtime just as subscript reads do.

### 2.3. `accessible/mac/mozAccessible.mm`

**Summary:**

Modernize Objective-C syntax in Firefox's macOS overall accessibility layer (`mozAccessible.mm`) for compatibility with older runtimes.

**Taxonomy classification:**

1. *Syntax/API backport*: 

Only one substitution in `mozAccessible.mm`:
| Before | After |
| --- | --- |
| `userInfo[@"AXTextChangeElement"] = self` | `[userInfo setObject:self forKey:@"AXTextChangeElement"]` |

2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

This is the **same dictionary subscript write →** `setObject:forKey:` conversion from patch 002, applied to the main `mozAccessible` implementation file.

### Conclusion

**Problem:**

The entire `accessible/mac` subtree was written in Objective-C style using modern **subscript syntax** (`dict[key]`, `array[index]`, `dict[key] = value`) introduced in LLVM 4.0 / Xcode 4.4. While this syntax compiles cleanly, the runtime methods it depends on (`-objectForKeyedSubscript:`, `-setObject:forKeyedSubscript`, `objectAtIndexedSubScript:`) does not exist on macOS 10.7 Foundation framework.

**Approach:**

A single, uniform remediation strategy applied consistently accross all affected files: **replace every instance of Objective-C subscript syntax with its explicit pre-10.8 equivalent:**

| Pattern | Replacement |
| --- | --- |
| `dict[key]` (read) | `[dict objectForKey:key]` |
| `array[index]` (read) | `[array objectAtIndex:index]` |
| `dict[key] = value` (write) | `[dict setObject:value forKey:key]` |

### Thesis relevance

**[Patch 001]** This patch is a clean example of the **runtime compatibility problem** that sits at the heart of your framework: a dependency (here, Foundation's subscripting API) evolved silently — the source compiles without warnings on a modern toolchain, but the resulting binary fails on the target platform. No static analysis or version pin catches this automatically. It's precisely the kind of issue your framework needs a detection and remediation strategy for.

**[Patch 002]** Alongside patch 001, this confirms a **pattern**: the subscripting incompatibility is not isolated to one file or one subsystem. It is a cross-cutting issue introduced uniformly by the modern Objective-C style used throughout Firefox's codebase. This is useful for your framework — it illustrates how a single dependency evolution event (the introduction of subscript syntax in LLVM 4.0) can produce **a diffuse, silent failure surface** that requires systematic scanning rather than targeted fixes.

**[Patch 003]** Three patches, one root cause, three different files — this is a strong empirical illustration of what your framework calls **diffuse silent failure**: a single dependency evolution event (subscript syntax becoming idiomatic in modern Objective-C) propagates invisibly across a codebase and only manifests at runtime on the legacy target. The remediation strategy your framework should articulate isn't "fix each file as you find it" but ***rather systematic detection first*** — a grep or AST scan for subscript syntax on NSDictionary/NSArray types — followed by batch remediation. These three patches together would make a compelling concrete example of that principle in your case study section.

**[The Broader Pattern]** What makes this subtree interesting as a case study is that the root cause is ***one dependency evolution event*** — the adoption of subscript syntax — that silently scattered failure points across three files and multiple subsystems (dispatch, selection, text change). The remediation required was not deep, but it required knowing where to look. A developer without prior awareness of the 10.7 Foundation limitation would have no compile-time signal pointing them here.

## 3. `accessible\xpcom` subtree

### Files affected: 
* `accessible\xpcom\xpcAccessibleMacInterface.mm`

### 3.1. `accessible\xpcom\xpcAccessibleMacInterface.mm`

**Summary:**

Same class of fix (**subscript syntax**) is applied, but with the cross-platform component object model bridge exposing accessibility tree to JavaScript (`xpcAccessibleMacInterface.mm`).

**Taxonomy classification:**

1. *Syntax/API backport*

Three substitutions, covering all three subscript patterns:

| Before | After |
| --- | --- |
| `objArr[i]` | `[objArr objectAtIndex:i]` |
| `attrRun[@"string"] = str` | `[attrRun setObject:str forKey:@"string"]` |
| `dict[unwrappedKey] = unwrappedValue` | `[dict setObject:unwrappedValue forKey:unwrappedKey]` |

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**
* `NSObjectToJsValue` **(array read)** — iterates over an NSArray of accessibility objects and converts each to a JS value. The subscript read on `objArr[i]` would crash on 10.7 inside any accessibility property that returns an array.
* `NSObjectToJsValue` **(attributed string dict write)** — builds an attributed run dictionary representing text with formatting attributes, adding a `"string"` key. This is on the path for exposing rich text content to JS consumers.
* `JsValueToSpecifiedNSObject` **(dictionary write)** — converts a JS object back into an `NSMutableDictionary`, writing each unwrapped key-value pair. This is the reverse bridge direction — JS → native.

### Conclusion

*(none)*

### Thesis relevance

This is a strong illustration for your framework's **scope discovery** problem. A developer patching accessible/mac might reasonably assume the fix is contained there — but the same root cause has leaked into a neighbouring subsystem through the same stylistic convention. Your framework should account for this: remediation of a dependency evolution issue requires **codebase-wide scanning**, not subtree-local inspection, particularly when the affected pattern (subscript syntax) is a language-level idiom that travels freely across file and module boundaries.

## 4. `browser\app\macbuild\Contents` subtree

### Files affected:
* `browser\app\macbuild\Contents\Info.plist.in`

### 4.1. `browser\app\macbuild\Contents\Info.plist.in`

**Summary:**

This patch remoeves the OS-level launch gate, allowing the app bundle to open on macOS 10.7-10.14 without the Finder blocking it outright.

**Taxonomy classification:**
1. *Metadata override*

This is specifically one kind of ***deployment contract amendment***

2. *Runtime compatibility problem*

**Relation:** none

**Explanation:**

The key being set here is `LSMinimumSystemVersion` - an Info.plist entry declaring minimum macOS version the application bundle will launch on. macOS uses this value to gate execution at OS level; if the running system is below the declared minimum, the Finder refuses to open the app before any code even runs.


### Conclusion

*(none)*

### Thesis relevance

This is a useful example of a **non-code dependency**: the build system's metadata must be patched in addition to the source. A framework for maintaining software on EOL platforms needs to account for this category — version declarations in manifests, plists, and build descriptors that encode the upstream's support assumptions and must be overridden explicitly. It is easy to fix all the runtime crashes and miss this, shipping a binary that the OS refuses to launch anyway.

## 5. `browser\modules` subtree

### Files affected:
* `browser\modules\SharingUtils.sys.mjs`

### 5.1. `browser\modules\SharingUtils.sys.mjs`

**Summary**

This patch add an early-exit guard which silently disables the **Share URL menu item** on any macOS version below 12.

**Taxonomy classification:**

1. *Feature gating*: 

Unlikes patches 001-004, this is a **feature gating decision** - a conscious choice to disable functionality unable to be made to work on legacy platforms rather than attempting a compatibility shim. It represents a different category of legacy maintenance response:

| Category | Examples so far |
| --- | --- |
| Syntax/API backport | Patches 0001-0004 (subscript syntax) |
| Metadata override | `Info.plist` version floor |
| Feature gating | ***This change*** |

1. *Runtime compatibility problem*


**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

The Share URL feature on macOS relies on `NSSharingServicePicker` — the native macOS sharing sheet. While this API has existed since 10.8, the specific integration Firefox uses (likely the modern `NSSharingServicePicker` delegate callbacks and the menu-embedded sharing workflow) depends on behaviour that either changed substantially or was introduced in macOS 12. On older systems, showing the menu item would either crash, silently fail, or present a broken UI to the user.

### Conclusion:

***(none)***

### Thesis relevance

This is a valuable addition to your case study because it illustrates a **decision point** your framework needs to explicitly model: when a dependency evolves in a way that cannot be papered over with a compatibility fix, the maintainer must choose between attempting a deep shim or gating the feature off entirely. The framework should provide criteria for making that call — complexity of the underlying API gap, user-facing impact, maintenance burden of a shim — rather than leaving it as an ad hoc judgement. This conflict is a concrete example of i3roly choosing the gate, and it's worth examining why that was the right call here.

## 6. `browser\themes\osx` subtree

### Files affected
* `browser\themes\osx\browser.css`

### 6.1. `browser\themes\osx\browser.css`

**Summary:**

A single new CSS rule is added to restore the **native macOS fullscreen button** appearance for the titlebar's fullscreen button element.

**Taxonomy classification:**

1. *UI rendering restoration*: 

This is a **UI rendering restoration** fix — a new category distinct from anything seen in patches 001–004. The dependency here isn't a Foundation API or a system service; it's the **native widget rendering pipeline**, which behaves differently across macOS versions. Modern Firefox increasingly moves toward custom-drawn UI; legacy macOS systems expect native AppKit widgets.

1. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

This rule explicitly restores the native macOS fullscreen button appearance for the titlebar's fullscreen button element. The two declarations work together:

* `appearance: auto` — tells the browser engine to use the platform's native widget rendering for this element, rather than custom styling
* `-moz-default-appearance: -moz-mac-fullscreen-button` — specifies which native widget to use: Mozilla's internal identifier for the macOS green fullscreen button (the leftmost of the three traffic light window controls)

In modern Firefox, the fullscreen button rendering was likely refactored — either the element lost its native appearance binding through a CSS specificity change elsewhere, or upstream moved to a custom-drawn implementation that doesn't exist in the older rendering pipeline Momiji runs on. On legacy macOS, the native widget renderer still expects to draw this button itself, and without this rule the button either renders incorrectly or disappears entirely.

### Conclusion

***(none)***

### Thesis relevance

This patch introduces a fourth category of legacy maintenance response to add to your framework's taxonomy:

| **Category** | **Examples** |
| --- | --- |
| Syntax/API backport | Patches 001-004 (subscript syntax) |
| Metadata override | `Info.plist` version floor |
| Feature gating | `SharingUtils` macOS 12 guard |
| UI Rendering restoration | This patch |

It also points to a subtler dependency evolution dynamic: upstream projects don't just change APIs — they progressively **detach from platform conventions**, replacing native widget rendering with custom implementations. For a legacy maintainer, this means the rendering layer itself becomes a moving target that drifts away from what the legacy platform's compositor knows how to handle.


## 7. `build` subtree

### Files affected
* `build\gyp.mozbuild`

### 7.1. `build\gyp.mozbuild`

**Summary:**

This is a build system deployment target override, setting two GYP variables that control how the C/C++ and Objective-C compiler toolchain targets the platform:

* `mac_sdk_min` — the minimum SDK version the build system will accept
* `mac_deployment_target` — passed directly to the compiler as `-mmacosx-version-min`, which controls which OS APIs the linker will treat as available at runtime

142base_dynasty floors both from 10.9 down to 10.7.

**Taxonomy classification:**

1. *Metadata override*: build system deployment target override 
2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

`mac_deployment_target` is the most consequential of the two. When the compiler sees `-mmacosx-version-min=10.7`, it:

* **Emits availability warnings** for any API call that didn't exist on 10.7
* **Selects older ABI conventions** where they differ between OS versions
* **Instructs the linker to use weak linking for symbols** introduced after 10.7, so the binary can load on 10.7 even if those symbols are absent

Without this change set to 10.7, the toolchain silently assumes 10.9 as a safe baseline — meaning the subscript runtime methods fixed in patches 001–004 would appear available to the linker, the binary would hard-link against them, and the result would crash on 10.7 at load time rather than producing a fixable availability warning.

### Conclusion:

***(none)***

### Thesis relevance:

This conflict is important for your framework for two reasons. First, it is the **compiler-level counterpart** to the `Info.plist` version floor — together they form a pair: one governs what the OS will launch, the other governs what the toolchain will tolerate. A complete legacy port requires both to be set consistently, and a framework should treat them as a coupled configuration concern rather than independent settings.

Second, it illustrates that **dependency evolution can be masked by toolchain assumptions**. The subscript syntax crashes in patches 001–004 existed in the codebase before this deployment target was corrected — but the compiler was never asked to flag them because its assumed baseline already included the missing runtime methods. Fixing the deployment target is what would surface those warnings systematically going forward, turning silent runtime failures into visible compile-time signals. ***That sequencing — fix the target first, then scan for warnings — is a procedural insight worth capturing in your framework.***

## 8.  `config` subtree

### Files affected:
* `config/recurse.mk`
* `config/rules.mk`

### 8.1. `config/recurse.mk`

**Summary:**

* Remove `media/libsoundttouch/src/pre-compile` from Clang plugin dependency chain
* Restructure WASM sandboxing dependency chain: instead of 
```
# various targets -> security/rlbox/pre-compile
# dom/media targets -> media/libsoundtouch/src/pre-compile
```

Now become:
```
security/rlbox/pre-compile -> config/external/wasm2c_sandbox_compiler/host
# dom/media targets + various targets -> security/rlbox/pre-compile
```

**Taxonomy classification:**

1. *Build graph surgery*

Unlike the previous patches which fixed runtime behaviour or compiler targeting, this operates at the level of the build system's own dependency resolution. It is a necessary precondition for the build to complete at all on a legacy host, rather than a fix that affects the shipped binary's behaviour.

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

1. Remove `media/libsoundtouch/src/pre-compile` from the clang plugin dependency chain

The long filter rule that gates compilation targets on the clang plugin being built first had `media/libsoundtouch/src/pre-compile` removed from its target list. This decouples libsoundtouch's pre-compile step from the clang plugin build.

2. Restructure the WASM sandboxing dependency chain
The original two-line rule:
```
# various targets → security/rlbox/pre-compile
# dom/media targets → media/libsoundtouch/src/pre-compile
```
Is replaced with a three-node chain:
```
security/rlbox/pre-compile → config/external/wasm2c_sandbox_compiler/host
# all media and parser targets → security/rlbox/pre-compile
```
This does two things simultaneously: it inserts `wasm2c_sandbox_compiler/host` as a prerequisite for `rlbox/pre-compile`, and it collapses the `dom/media` targets (previously dependent on `libsoundtouch/src/pre-compile`) directly into the `rlbox/pre-compile` dependency instead.

Both changes point to the same underlying problem: **WASM sandboxing and its toolchain don't build cleanly on legacy macOS**. RLBox is Mozilla's sandboxing framework that uses WebAssembly as an isolation boundary; `wasm2c_sandbox_compiler` is the tool that compiles C libraries to WASM for that purpose. This toolchain has hard dependencies on modern compiler infrastructure and system libraries that are unavailable or broken on 10.7–10.14.

By restructuring the dependency graph, i3roly is either:

* Isolating the WASM toolchain so it builds in the correct order on a legacy host, or
* Detaching components that can't build under the legacy toolchain from the critical path, preventing them from blocking the rest of the build


### 8.2. `config/rules.mk`

**Summary:**

**Reverts the dylib loading strategy** introduced by Mozilla in [Bug 1770484](https://hg-edge.mozilla.org/mozilla-unified/rev/1bc4ee894015268a6be66950b80705e73f17147e)

**Taxonomy classification:**

1. *Linker behavior modification*: 

This is a **linker behaviour reversion** — a new category distinct from anything seen in previous patches. It operates below the source code and below the compiler, at the level of how the dynamic linker itself resolves library dependencies at process load time. Getting this wrong doesn't produce a crash inside running code; it produces a dyld load failure before any application code executes at all.

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

Two coordinated changes:
1. Comment out the `@rpath` linker flag for executables
```
# Before: adds -Wl,-rpath,@executable_path to all Mac executables
# After: entire ifeq block commented out
```
2. Revert the dylib install name from `@rpath` back to `@executable_path`
```
# Before:
_LOADER_PATH := @rpath

# After:
_LOADER_PATH := @executable_path
```

Mozilla's Bug 1770484 changed how Firefox's dylibs identify themselves and how executables find them at load time:

* **Old system** (@executable_path): Each dylib's install name bakes in `@executable_path/<dylib>`. dyld resolves this relative to wherever the loading executable lives. For executables not co-located with the dylibs, Firefox injected `DYLD_LIBRARY_PATH` at runtime to help dyld find them.
* **New system ** (@rpath): Dylibs use `@rpath/<dylib>` as their install name, and each executable declares its own `@rpath` at compile time pointing to wherever the dylibs live. No environment variable injection needed.

The `@rpath` mechanism was introduced in macOS 10.5 at the dyld level, but the specific linker flag combination Mozilla uses — particularly how `@rpath` is embedded via `-Wl,-rpath` and consumed across process boundaries — behaves unreliably on older dyld versions present in 10.7 and 10.8. The `@executable_path` approach, being older and simpler, is universally reliable across all of Momiji's target range.


### 8.3. `config/external/rlbox/rlbox_config.h`

**Summary:**

Replaces RLBox's default C++17 `std::shared_lock` with Firefox's own `mozilla:StaticRWLock` implementatyion, activated via RLBox's custom lock macro interface.

**Taxonomy classification:**

1. *Standard library implementation gap filling*

This is a standard library implementation gap, distinct from anything seen so far. C++17 `std::shared_lock` requires `<shared_mutex>`, which Apple only fully implemented in the libc++ shipping with macOS 10.12+. On 10.9–10.11, the header may exist but the implementation is absent or incomplete — meaning code that compiles successfully will fail at link time or runtime.

2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
1. `config/recures.mk`: — restructured the build dependency graph so `security/rlbox/pre-compile` depends on `wasm2c_sandbox_compiler/host` being built first, and detached libsoundtouch from the clang plugin chain. This fixes the build ordering problem for RLBox on a legacy host.
2. `rules.mk` — reverted the `@rpath` dylib loading strategy back to `@executable_path`. RLBox's sandboxed libraries are among the dylibs affected by this loading mechanism, so this fixes the binary loading problem for RLBox's compiled sandboxes.

This patch: substitutes the unavailable C++17 `std::shared_lock` with Firefox's own lock primitives. This fixes the runtime library problem within RLBox itself.

Together they address the RLBox compatibility at 3 distinct layers:

| Patch | Layer | Problem Solved |
| --- | --- | --- |
| `recurse.mk` | Build graph | Incorrect compilation ordering on legacy host |
| `rules.mk` | Linker | dylib load failure before execution |
| `rlbox_config.h` | Runtime library | Missing C++17 standard library primitive |

**Explanation:**

A macOS-specific block is inserted into `rlbox_config.h `that replaces RLBox's default C++17 `std::shared_lock` with Firefox's own `mozilla::StaticRWLock` implementation, activated via RLBox's custom lock macro interface:

```c++
#ifdef XP_MACOSX
#  define RLBOX_USE_CUSTOM_SHARED_LOCK
#  define RLBOX_SHARED_LOCK(name) rlbox::rlbox_shared_lock name
#  define RLBOX_ACQUIRE_SHARED_GUARD(name, ...) ...
#  define RLBOX_ACQUIRE_UNIQUE_GUARD(name, ...) ...
#endif
```

The comment is explicit about the cause: `std::shared_lock` is not supported on macOS 10.9–10.11 despite being a C++17 feature, because Apple's libc++ implementation on those OS versions predates or incompletely implements that part of the standard.

### 8.4. `config/external/rlbox_wasm2c_sandbox/rlbox_wasm2c_thread_locals.cpp`

**Summary:**

Remove the conditional include guard and the conditional crash path, both centered on the `WASM_RT_GROW_FAILED_CRASH` preprocessor flag.

**Taxonomy classification:**

1. *Preprocessor branch collapse*: 

The patch addresses the issue that upstream introduced a conditional compilation path to handle environmental variation, but that branching itself became the source of a build failure on the legacy target — so the fix is to collapse the branch and commit unconditionally to the path that works. It's the opposite instinct from feature gating: rather than adding a condition, you're removing one.

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
1. `config/recurse.mk`
2. `config/rules.mk`
3. `config/external/rlbox/rlbox_config.h`
4. `config/external/rlbox_wasm2c_sandbox/rlbox_wasm2c_thread_locals.cpp`

This patch is a fourth patch in the same RLBox compatibility cluster, extending it further:

| Patch | Layer | Problem Solved |
| --- | --- | --- |
| `config/recurse.mk` | Build graph | Compilation ordering on legacy host |
| `config/rules.mk` | Linker | dylib load failure via `@rpath` |
| `config/external/rlbox/rlbox_config.h` | Runtime Library | Missing C++17 `std::shared_lock` |
| `rlbox_wasm2c_thread_locals.cpp` | Build configuration | Preprocessor branching causing header unavailability |

The first three patches addressed RLBox's external interfaces — how it is built, loaded, and locked. This patch goes inside the wasm2c sandbox implementation itself, fixing a preprocessor configuration problem in the sandbox's memory failure handling. The cluster now spans four distinct technical layers across two subdirectories (`config/external/rlbox/` and `config/external/rlbox_wasm2c_sandbox/`).

**Explanation:**

Two related removals in r`lbox_wasm2c_thread_locals.cpp`, both centred on the `WASM_RT_GROW_FAILED_CRASH` preprocessor flag:

1. The conditional include guard is removed:
```c++
// Before:
#ifndef WASM_RT_GROW_FAILED_CRASH
#  include "nsExceptionHandler.h"
#endif

// After:
#include "nsExceptionHandler.h"  // always included
```
2. The conditional crash path is removed:
```c++
// Before:
void moz_wasm2c_memgrow_failed() {
#ifdef WASM_RT_GROW_FAILED_CRASH
  MOZ_CRASH("wasm2c memory grow failed");
#else
  CrashReporter::RecordAnnotationBool(...);
#endif
}

// After:
void moz_wasm2c_memgrow_failed() {
  CrashReporter::RecordAnnotationBool(...);
}
```

**What `WASM_RT_GROW_FAILED_CRASH` represents:**

This flag selects between two behaviours when a WASM sandbox runs out of memory:

* **When defined:** Hard crash immediately via `MOZ_CRASH` — a lightweight path that needs no crash reporting infrastructure
* **When not defined**: Record a crash annotation via `CrashReporter` and continue — requires `nsExceptionHandler.h` and the full crash reporter being available

The patch eliminates the `MOZ_CRASH` path entirely, unconditionally routing memory growth failures through the crash reporter annotation path.

**Why This Is Needed on Legacy macOS?**

The `WASM_RT_GROW_FAILED_CRASH` flag was introduced upstream precisely to allow building without a fully functional crash reporter — a configuration that arises when the crash reporter itself fails to build on a given platform. On legacy macOS, the crash reporter infrastructure builds correctly, so the lightweight fallback path is unnecessary. However the inverse problem is likely the real issue: the `#ifndef` guard was preventing `nsExceptionHandler.h` from being included in configurations where `WASM_RT_GROW_FAILED_CRASH` was defined, which under certain legacy build configurations caused the crash reporter annotation call to be unavailable while still being referenced, producing a build failure.

By removing the conditional entirely and always including `nsExceptionHandler.h` and always using the annotation path, i3roly makes the build unconditionally correct on the legacy macOS target where crash reporting is available.

### Conclusion

The `config` subtree required the most architecturally diverse set of interventions of anything seen so far. Rather than a single repeated pattern like the ObjC subscript fixes, each change addressed a different layer of the build and deployment stack.

**Compiler and deployment targeting (`gyp.mozbuild`)** was the foundational fix - flooring `mac_sdk_min` and `mac_deployment_target` from 10.9 to 10.7. This is the change that makes the toolchain aware of the legacy target, and it is a logical prerequisite for everything else: without it, the compiler never surfaces availability warnings which otherwise reveal compatibility problems throughout the codebase.

**Binary loading infrastructure (`rules.mk`)** reverted Mozilla's modernisation of dylib resolution from `@rpath` back to `@executable_path`. This was a reversion of a specific upstream commit, explicitly cited inline, restoring a loading strategy that is universally reliable across Momiji's entire target range. Without this, the built binary would fail to load before any application code executes.

**The RLBox cluster** (`recurse.mk`, `rlbox_config.h`, `rlbox_wasm2c_thread_locals.cpp`) required three coordinated fixes across three layers to make a single subsystem build and run correctly: dependency ordering in the build graph, substitution of an unavailable C++17 standard library primitive, and collapse of a preprocessor branch that was incorrectly excluding a required header. No single fix was sufficient alone.

### Thesis relevance

Several imporant framework insights emerge from this subtree collectively.

1. **The toolchain target is a *prerequisite*, not a fix**.

Correcting `mac_deployment_target` doesn't solve any compatibility problem directly — it makes the toolchain capable of `surfacing` compatibility problems that would otherwise remain silent until runtime. A framework for legacy porting should treat deployment target correction as phase zero: it must be done before any meaningful audit of the codebase can begin, because without it the compiler is not asking the right questions.

2. **Compatibility failures are stratified.**

The `config` subtree alone surfaces failures at six distinct layers: the compiler target, the build dependency graph, the linker, the dynamic loader, the C++ standard library, and the preprocessor configuration. These layers are largely independent — a fix at one layer does not reveal or resolve problems at another. A framework must treat each layer as a separate audit domain with its own detection and remediation approach, rather than assuming that fixing source-level compatibility issues is sufficient.

3. **Upstream modernization commits are a structured reversion risk.**

The `rules.mk` patch is notable because i3roly identified and reverted a specific, named upstream commit - Mozilla Bug 1770484 - rather than discovering the problem empirically. This suggests a useful framework practice: when beginning a legacy port, known modernisation commits that explicitly drop old platform support should be catalogued first and treated as candidate reversions before any build attempt is made. The upstream commit message itself often documents exactly what assumption changed and why.

4. **Multi-layer failures require coordinated remediation**

The RLBox cluster is the clearest demonstration that some compatibility failures cannot be fixed incrementally — all four layers (build ordering, dylib loading, lock primitive, preprocessor branching) had to be addressed before RLBox could participate in a successful build. A framework should flag subsystems with this characteristic early, as partial fixes can produce misleading build states that obscure whether progress is being made.

5. **Portability guards can themselves become incompatibilities**

The `rlbox_wasm2c_thread_locals.cpp` patch inverts the unusual intuition: the problematic code was not modern code ignoring legacy constraints, but upstream portability code whose conditionally logic interacted badly with the legacy build environment. A framework should explicitly note that `#ifdef` guards introduced for portability purposes are not neutral - they require their own compatibility audit on the legacy target.

## 9. `dom` subtree

### Files affected:
* **[added]** dom/media/RLBoxSoundTouch.cpp
* **[added]** dom/media/RLBoxSoundTouch.h
* **[added]** dom/media/RLBoxSoundTouchTypes.h
* **[added]** dom/media/platforms/apple/AppleCMFunctions.h
* **[added]** dom/media/platforms/apple/AppleCMLinker.cpp
* **[added]** dom/media/platforms/apple/AppleCMLinker.h
* **[added]** dom/media/platforms/apple/AppleCVLinker.cpp
* **[added]** dom/media/platforms/apple/AppleCVLinker.h
* **[added]** dom/media/platforms/apple/AppleVDADecoder.cpp
* **[added]** dom/media/platforms/apple/AppleVDADecoder.h
* **[added]** dom/media/platforms/apple/AppleVDAFunctions.h
* **[added]** dom/media/platforms/apple/AppleVDALinker.cpp
* **[added]** dom/media/platforms/apple/AppleVDALinker.h
* **[added]** dom/media/platforms/apple/AppleVTFunctions.h
* **[added]** dom/media/platforms/apple/AppleVTLinker.cpp
* **[added]** dom/media/platforms/apple/AppleVTLinker.h
* dom/canvas/WebGLContext.cpp
* dom/canvas/WebGLContext.h
* dom/canvas/WebGLContextTextures.cpp
* dom/canvas/WebGLContextValidate.cpp
* dom/ipc/ProcessHangMonitor.cpp
* dom/media/mediasink/moz.build
* dom/media/moz.build
* dom/media/platforms/apple/AppleDecoderModule.cpp
* dom/media/platforms/apple/AppleDecoderModule.h
* dom/media/platforms/apple/AppleVTDecoder.cpp
* dom/media/platforms/apple/AppleVTDecoder.h
* dom/media/platforms/apple/AppleVTEncoder.cpp
* dom/media/platforms/moz.build
* dom/media/systemservices/objc_video_capture/device_info_avfoundation.mm
* dom/media/systemservices/objc_video_capture/video_capture_avfoundation.mm
* dom/system/mac/nsOSPermissionRequest.mm
* dom/webauthn/MacOSWebAuthnService.mm

### 9.1. `dom/canvas/WebGLContext.cpp`

**Summary:**

This patch modifies `dom/canvas/WebGLContext.cpp` and addresses a WebGL stencil buffer bug specific to Intel GPUs on macOS versions older than 10.12. 

**Taxonomy classification:**

1. *Driver behaviour compensation*: 

What this patch actually is: a narrowly scoped, hardware-and-OS-specific **driver bug workaround**— it detects a known-bad environment (Intel GPU + macOS < 10.12) at runtime and adjusts GL state to compensate for incorrect driver behaviour, without changing the WebGL API surface or the user's framebuffer configuration.

2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* `widget/cocoa/nsCocoaFeatures.h`
	Providing `IsAtLeastVersion()` API for runtime macOS version checks.

* `dom/canvas/WebGLContext.h`
	Providing `bool mNeedsFakeNoStencil_UserFBs = false` definition

**Explanation:**

1. New include (macOS-only)

Under the `MOZ_WIDGET_COCOA` guard, it pulls in `nsCocoaFeatures.h`, which provides the `IsAtLeastVersion()` API for runtime macOS version checks.

2. New flag initialized in `FinishInit()`

A new member flag — `mNeedsFakeNoStencil_UserFBs` — is introduced and initialized to false. On macOS, if the system is older than 10.12 and the GL vendor is Intel, the flag is set to true. This is a targeted hardware/OS workaround for a known driver quirk on Intel-based Macs running pre-Sierra macOS.

3. Stencil suppression logic in `ScopedDrawCallWrapper`

The draw call wrapper previously handled `mNeedsFakeNoStencil` only for the default framebuffer path (the if branch). The patch adds an else branch covering user-provided framebuffers (FBOs): if `mNeedsFakeNoStencil_UserFBs` is set and the FBO has a depth attachment but no stencil attachment, `driverStencilTest` is forced to false — suppressing stencil testing even if the WebGL-level state has it enabled.

In short: this is a legacy Intel/macOS compatibility shim that prevents the driver from enabling stencil testing on user FBOs that lack a stencil attachment, working around what is likely a driver bug on Intel GPUs prior to macOS 10.12 (Sierra) where such a configuration would produce incorrect rendering or a crash. It's a classic example of the kind of mNeedsFake* guard patterns that appear throughout Momiji's legacy compatibility layer.

### 9.2. `dom/canvas/WebGLContext.h`

**Summary:**

Add `bool mNeedsFakeNoStencil_UserFBs = false` definition

**Taxonomy classification:**

1. *Class member declaration*

This is a **class member declaration** — specifically a data member added to a class definition to support new runtime state introduced elsewhere in the implementation. It's a distinct and recurring pattern, and none of your eight existing categories capture it well.

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* `dom/canvas/WebGLContext.cpp`
	This is where the `mNeedsFakeNoStencil_UserFBs` definition is being called

**Explanation:**

The `WebGLContext.cpp` patch does three things with this member — initializes it in `FinishInit()`, conditionally sets it to `true` under the Intel/macOS guard, and reads it in `ScopedDrawCallWrapper`. All three of those are dead references until this header conflict is resolved in favour of 142base_dynasty's addition. If the tree were compiled without the `mNeedsFakeNoStencil_UserFBs` definition, it would fail to build entirely.

### 9.3. `dom\canvas\WebGLContextTextures.cpp`

**Summary:**

Include `nsCocoaFeatures.h` providing checking API in case of macOS to see if current OS is lower than 10.7

**Taxonomy classification:**

1. *Feature gating*: 
2. *Runtime/Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* `widget/cocoa/nsCocoaFeatures.h`
	Providing `IsAtLeastVersion()` API for runtime macOS version checks.

**Explanation:**

Without this library, checking whether current macOS is lower than 10.7 is impossible, which is necessary to gate incompatible codes.

### 9.4. `dom\canvas\WebGLContextValidate.cpp`

**Summary:**

Add a workaround inside `InitAndValidateGL()` for a known ATI/AMD GPU driver bug on macOS pre-10.9 and include `nsCocoaFeatures.h`

**Taxonomy classification:**

1. *Driver behaviour compensation*
2. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* `widget/cocoa/nsCocoaFeatures.h`
	Providing `IsAtLeastVersion()` API for runtime macOS version checks.

**Explanation:**

It adds a workaround inside `InitAndValidateGL()` for a known ATI/AMD GPU driver bug on macOS older than 10.9 (Mavericks). On those systems, the Mac ATI driver renders point sprites upside-down — a confirmed Apple bug (referenced by internal bug ID 11778921). The fix calls `fPointParameterf` with `GL_POINT_SPRITE_COORD_ORIGIN` set to `GL_LOWER_LEFT`, flipping the coordinate origin to compensate. It also gates on `gl->WorkAroundDriverBugs()` as an additional runtime guard, meaning the workaround can be disabled via a preference if needed.

The `nsCocoaFeatures.h` include is added under MOZ_WIDGET_COCOA for the same version-check API used in the .cpp patch.

### 9.5. `dom/ipc/ProcessHangMonitor.cpp`

**Summary:**

Wrap two separate call sites in `ProcessHangMonitor.cpp` with `__builtin_available(macOS 10.10, *)` guards, which disable macOS QoS APIs on macOS 10.9 and earlier.

**Taxonomy classification:**

1. *API availability guard*: 

This patch, rather than feature gating, is wrapping code which cannot legally execute on older OS, because the undelying OS symbols have not existed yet. The `__builtin_available` check is a **symbol availability guard** and the specific mechanism used by Clang to handling weak-linked OS APIs on Apple platform.

To be more specific, this kind of patches:
* Uses `__builtin_available()` or equivalent OS availability checks
* Wraps code which references symbols introduced at a specific OS version
* The guarded code is **completely skipped** on older targets without fallback - it's not replaced, just omitted
* The motivation is symbol existence, not feature policy.

1. *Runtime compatibility problem*

**Relations:**

This change relations to these other changes:
* *none*

**Explanation:**

This patch wraps two separate call sites in `ProcessHangMonitor.cpp` with `__builtin_available(macOS 10.10, *)` guards. Both sites use macOS QoS (Quality of Service) thread priority APIs — `pthread_set_qos_class_self_np`, `pthread_override_qos_class_start_np`, and `pthread_override_qos_class_end_np` — which were introduced in macOS 10.10 (Yosemite) and simply do not exist on earlier OS versions. Without the guard, calling these functions on 10.7–10.9 would be a hard crash or link failure at runtime. The logic inside both guards is otherwise unchanged.

### 9.6. `dom/media/moz.build`

**Summary:**
* Add 2 header exports: `RLBoxSoundTouch.h` and `RLBoxSoundTouchTypes.h` (`EXPORTS` list)
* Add 1 new compiled source: `RLBoxSoundTouch.cpp` to `UNIFIED_SOURES`
* Replace a local include path: `!/media/libsoundtouch/src` with `!/security/rlbox` (The exclamation point means 'pointing directly' to that directory)

**Taxonomy classification:**

1. *Build graph surgery*: 

While the above, previous `config/recurse.mk` patch is the **graph topology patch**, then this `dom/media/moz.build` patch is the **graph node definition** patch.

2. *Buildtime compatibility problem*

**Relations:**

This change relations to these other changes:
* `config/recurse.mk` patch

| In `config/recurse.mk` | In `dom/media/moz.build` |
| --- | --- |
| Removes `media/libsoundtouch/src/pre-compile` from the clang plugin dependency chain | `!media/libsoundtouch/src` is being exised as an independent compilation and replaced with `!security/rlbox` |
| Both `dom/media/target-objects` and `dom/media/mediasink/target-objects` now depend directly on `security/rlbox/pre-compile` instead of `media/libsoundtouch/src/pre-compile` | `!media/libsoundtouch/src` is replaced with `!/security/rlbox` in `LOCAL_INCLUDES` to reflect this change | 

* `dom/media/RLBoxSoundTouch.cpp` **[added sources]**

New compiled source added in `UNIFIED_SOURCE`

* `dom/media/RLBoxSoundTouch.h` **[added headers]**

New header export

* `dom/media/RLBoxSoundTouchTypes.h` **[added headers]**

New header export

**Explanation:**

This patch makes three changes to `dom/media/moz.build`, the build descriptor for Firefox's media subsystem:

* Adds two header exports — `RLBoxSoundTouch.h` and `RLBoxSoundTouchTypes.h` are added to the `EXPORTS` list, making them visible to other build units that depend on dom/media.
* Adds one new compiled source — `RLBoxSoundTouch.cpp` is added to `UNIFIED_SOURCES`, meaning it will be compiled as part of the media module.
* Replaces a local include path — the generated include path `!/media/libsoundtouch/src` (pointing directly into the SoundTouch library source) is replaced with `!/security/rlbox` (pointing into the RLBox sandboxing infrastructure).

Together these three changes indicate that the SoundTouch audio processing library is being **migrated from a direct linkage model into an RLBox sandbox wrapper**. Instead of `dom/media` code calling into `libsoundtouch` directly and including its headers, it now goes through an RLBox intermediary (`RLBoxSoundTouch.cpp/.h`) whose type definitions live in `RLBoxSoundTouchTypes.h`. 

These build configurations reflect exactly what has happedned in `config/recurses.mk` where lived the build graph modification counteracts.

### 9.7. `dom/media/mediasink/moz.build`

**Summary:**

* Replace a local include path: `!/media/libsoundtouch/src` with `!/security/rlbox` (The exclamation point means 'pointing directly' to that directory)

**Taxonomy classification:**
1. *Build graph surgery*
2. *Buildtime compatibility problem*

**Relations:**

This change relates to the following other changes:
1. `config/recurse.mk`

| In `config/recurse.mk` | In `dom/media/mediasink/moz.build` |
| --- | --- |
| Removes `media/libsoundtouch/src/pre-compile` from the clang plugin dependency chain | `!media/libsoundtouch/src` is being exised as an independent compilation and replaced with `!security/rlbox` |
| Both `dom/media/target-objects` and `dom/media/mediasink/target-objects` now depend directly on `security/rlbox/pre-compile` instead of `media/libsoundtouch/src/pre-compile` | `!media/libsoundtouch/src` is replaced with `!/security/rlbox` in `LOCAL_INCLUDES` to reflect this change | 

**Explanation:**

This patch makes solely one change to `dom/media/mediasink/moz.build`, the build descriptor for Firefox's mediasink subsystem:
* Replaces a local include path — the generated include path `!/media/libsoundtouch/src` (pointing directly into the SoundTouch library source) is replaced with `!/security/rlbox` (pointing into the RLBox sandboxing infrastructure).

Similar to the `dom/media/moz.build` patch, it does reflect exactly what has happedned in `config/recurses.mk` where lived the build graph modification counteracts.

### 9.8. `dom/media/platforms/moz.build`

**Summary:**

This patch modifies `dom/media/platforms/moz.build` to re-register 5 Apple media source files into the build graph under the `MOZ_APPLEMEDIA` guard (`AppleCMLinker.cpp`, `AppleCVLinker.cpp`, `AppleVDADecoder.cpp`, `AppleVDALinker.cpp` and `AppleVTLinker.cpp`), and adds one new framework linkage directive (`-framework VideoDecodeAcceleration`)

**Taxonomy classification:**

1. *Upstream revert/source restoration*: 

This patch is reintroducing deleted upstream nodes (in build graph term)/deleted source files (in source management term) from a historical revision. So it should be classified as a new category: **Upstream revert/source restoration.**

Defining characteristics are:
* Source files removed by upstream (for legitimate modern reasons) are pulled back from a historical revision
* The restoration is motivated by a capability gap on legacy targets, not by a disagreement with upstream's direction
* The `moz.build` registration is a necessary but secondary consequence — the primary act is the source restoration itself
* Creates a permanent divergence from upstream's file tree that will need to be carried forward through every future rebase

2. *Buildtime compatibility problem*


**Relations:**

This change relates to these other changes:
* **[added]** dom/media/platforms/apple/AppleCMFunctions.h
* **[added]** dom/media/platforms/apple/AppleCMLinker.cpp
* **[added]** dom/media/platforms/apple/AppleCMLinker.h
* **[added]** dom/media/platforms/apple/AppleCVLinker.cpp
* **[added]** dom/media/platforms/apple/AppleCVLinker.h
* **[added]** dom/media/platforms/apple/AppleVDADecoder.cpp
* **[added]** dom/media/platforms/apple/AppleVDADecoder.h
* **[added]** dom/media/platforms/apple/AppleVDAFunctions.h
* **[added]** dom/media/platforms/apple/AppleVDALinker.cpp
* **[added]** dom/media/platforms/apple/AppleVDALinker.h
* **[added]** dom/media/platforms/apple/AppleVTFunctions.h
* **[added]** dom/media/platforms/apple/AppleVTLinker.cpp
* **[added]** dom/media/platforms/apple/AppleVTLinker.h

**Explanation:**

This patch modifies `dom/media/platforms/moz.build` to re-register five Apple media source files into the build graph under the `MOZ_APPLEMEDIA` guard, and adds one new framework linkage directive:

* `AppleCMLinker.cpp` and `AppleCVLinker.cpp` — dynamic linker shims for CoreMedia and CoreVideo frameworks respectively
* `AppleVDADecoder.cpp` and `AppleVDALinker.cpp` — decoder and linker shim for the Video Decode Acceleration (VDA) framework, a legacy hardware decoding API that Apple deprecated and eventually removed
* `AppleVTLinker.cpp` — dynamic linker shim for VideoToolbox
* `-framework VideoDecodeAcceleration` — the actual framework linkage that makes VDA symbols available at build time

Mozilla removed these files from the current Firefox tree because they dropped support for the VDA framework (and the associated dynamic linker pattern for CM/CV/VT) in favour of a unified VideoToolbox path. On modern macOS, VideoToolbox is always present and can be linked directly. But on macOS 10.7–10.9, VideoToolbox is either absent or severely limited, and VDA was the only viable hardware decoding path. The `*Linker.cpp` files implement runtime weak linking — they `dlopen` their respective frameworks at runtime rather than hard-linking them, so the binary can launch on systems where those frameworks are absent and degrade gracefully.

i3roly's restoration means these files were pulled from an older Firefox revision and reintroduced wholesale into the current tree, then registered here in `moz.build` so the build system knows to compile them.

### 9.9. `dom/media/platforms/apple/AppleDecoderModule.cpp`

**Summary:**

This is the implement counterpart to `dom/media/platforms/moz.build` patch, which wires the restored file into the runtime logic of `AppleDecoderModule.cpp`. There are 4 distinct changes in total:
1. Include all five restored headers (`AppleVDADecoder.h`, `AppleVDALinker.h`, `AppleCMLinker.h`, `AppleCVLinker.h`, `AppleVTLinker.h`) and remove `mozilla/ScopeExit.h`.
2. Four static booleans are defined at translation unit scope: `sIsCoreMediaAvailable`, `sIsCoreVideoAvailable`
3. Runtime framework linking in `Init()`
4. Two `__builtin_available` guards

**Taxonomy classification:**

1. *Upstream source restoraion*: the includes and static flag definitions are direct consequences of restoring deleted files.
2. *API availability guarding*: the `__builtin_available(macOS 10.13, *)` guard on `VTIsHardwareDecodeSupported` is a textbook instance.
3. *Class schema extension*: 4 static member definitions require corresponding header declarations
4. *Runtime compatibility problem*

**Relations:**

This change relates to these other changes:
* **[added]** `dom/media/platforms/apple/AppleCMLinker.h`
* **[added]** dom/media/platforms/apple/AppleCVLinker.h
* **[added]** dom/media/platforms/apple/AppleVDADecoder.h
* **[added]** dom/media/platforms/apple/AppleVDALinker.h
* **[added]** dom/media/platforms/apple/AppleVTLinker.h
* `dom/media/platforms/moz.build`

**Explanation:**

This patch is the implementation counterpart to `dom/media/platforms/moz.build.patch`, where that patch registered the restored files in the build graph, this pach wires them into the runtime logic of `AppleDecoderModule.cpp`. It makes four distinct changes:

1. Include the restored headers

All five restored components (`AppleVDADecoder.h`, `AppleVDALinker.h`, `AppleCMLinker.h`, `AppleCVLinker.h`, `AppleVTLinker.h`) are included. `mozilla/ScopeExit.h` is removed, presumably because it was only needed by code paths that no longer exist or were reorganised.

2. Static availability flags defined

Four static booleans are defined at transation unit scope:
* `sIsCoreMediaAvailable`
* `sIsCoreVideoAvailable`
* `sIsVTAvailable`
* `sIsVDAAvailable`

These are the static member definitions corresponding to declarations that would live in the class header - this is the **class schema extension** pattern again, mirroring what was seen with `mNeedsFakeNoStencil_UserFBs`.

3. Runtime framework linking in `Init()`

The four *Linker::Link() calls are inserted at the top of Init(), with an inline comment attributing the approach to a contributor ("thanks jya"). Each linker attempts to dlopen its framework at runtime and records success into the corresponding static flag. The comment 10.7.3 -> 10.7 is notable — it suggests the VDA/CM/CV path was originally needed from 10.7.3 onwards but is being applied to all of 10.7 for simplicity or safety.

4. Two `__builtin_available` guards

First, in CreateVideoDecoder(): the existing AppleVTDecoder path is wrapped in __builtin_available(macOS 10.7, *), with AppleVDADecoder as the else branch. This is the actual decoder dispatch — on any macOS 10.7 or newer, use VideoToolbox; on anything older (which in practice means never within Momiji's range, since 10.7 is the floor), fall back to VDA. The guard reads strangely at first — __builtin_available(macOS 10.7, *) is true on virtually all of Momiji's targets — but its real purpose is to satisfy the compiler's availability checking for AppleVTDecoder's API dependencies, not to produce a runtime branch.

Second, in CanCreateHWDecoder(): VTIsHardwareDecodeSupported — a VideoToolbox function introduced in macOS 10.13 — is wrapped in __builtin_available(macOS 10.13, *). This is a clean API availability guard preventing a hard crash on 10.7–10.12 where that symbol doesn't exist.

### 9.10. `dom/media/platforms/apple/AppleDecoderModule.h`

**Summary:**

This patch make 2 changes to `AppleDecoderModule.h`:
1. Remove the included header `MediaCodecsSupport.h`
2. Add 4 public static member declarations for `sIsCoreMediaAvailable`, `sIsCoreVideoAvailable`, `sIsVDAAvailable`, and `sIsVTAvailable`

**Taxonomy classification:**

1. *Upstream source restoraion*: the includes and static flag definitions are direct consequences of restoring deleted files.
2. *Class schema extension*: 4 static header declarations
3. *Runtime compatibility problem*

**Relations:**

This change relates to these other changes:
* `dom/media/platforms/apple/AppleDecoderModule.cpp`

**Explanation:**

This patch makes two changes to AppleDecoderModule.h:

1. Removes the `#include "MediaCodecsSupport.h"` — a header that was presumably only needed to support code paths that the `.cpp` patch reorganised or removed.
2. dds four static member declarations for `sIsCoreMediaAvailable`, `sIsCoreVideoAvailable`, `sIsVDAAvailable`, and `sIsVTAvailable` into the public section of the AppleDecoderModule class.

The relationship with `AppleDecoderModule.cpp` is precise and mandatory in both directions:
* The `.cpp` patch defines the four statics at translation unit scope (bool `AppleDecoderModule::sIsCoreMediaAvailable = false` etc.) — which is only legal C++ if the class declares them first. Without this `.h` patch, the `.cpp` patch produces a compiler error.
* This `.h` patch declares members that would be unreferenced and meaningless without the `.cpp` patch that defines and populates them. Without the `.cpp` patch, this header change is dead schema.

They are a tightly coupled patch pair with a strict compilation dependency: `.h` must be present for `.cpp` to compile, and `.cpp` must be present for the `.h` additions to have any meaning at runtime.

### 9.11. `dom/media/platforms/apple/AppleVTDecoder.h`

**Summary:**

Adds `#include "AppleVDADecoder.h"` just before existing `AppleDecoderModule.h` include.

**Taxonomy classification:**

1. *Class schema extension*
2. *Runtime/Buildtime compatibility problem*

**Relations:**

This change relates to these other changes:
* **[added]** `dom/media/platforms/apple/AppleVDADecoder.h`
* `dom/media/platforms/apple/AppleVTDecoder.cpp`. 

`AppleVTDecoder.h` is directly included in the subsequent patch.

**Explanation:**

This is a minimal single-line patch — it adds #include `"AppleVDADecoder.h"` to `AppleVTDecoder.h`, inserted just before the existing `AppleDecoderModule.h` include. Its role is **establishing type visibility** to the target of `AppleVDADecoder.c`, which means that compiler can get access to things defined in `AppleVDADecoder.h` through `AppleVTDecoder.h`.

### 9.12. `dom/media/platforms/apple/AppleVTDecoder.cpp`

**Summary:**

This patch makes 5 distinct changes to `AppleVTDecoder.cpp`:
1. New includes `AppleVTLinker.h` and `AppleUtils.h`
2. Explicit `nullptr` initialization on `AutoCFTypeRef` objects
3. Replace `kVTDecompressionPropertyKey_UsingHardwareAcceleratedVideoDecoder` with `AppleVTLinker::skPropUsingHWAccel_Decode`
4. `CreateDecoderSpecification()` guarded on `AppleVTLinker::skPropEnableHWAccel_Decode`
5. `__builtin_available(macOS 10.8, *)` guard on pixel format selection

**Taxonomy classification:**
1. *Upstream revert/source restoration*
2. *API availability guarding*
3. *Driver behaviour compensation*

**Relations**

This change relates to these other changes:
* **[added]** `dom/media/platforms/apple/AppleVTLinker.h`
* `dom/media/platforms/apple/AppleVTDecoder.h`

**Explanations:**

> `020`: AppleDecoderModule.cpp patch

This patch makes five distinct changes to AppleVTDecoder.cpp:
1. Two new includes

`AppleVTLinker.h` and `AppleUtils.h` are added. The VTLinker include is the direct implementation consequence of `022`'s header change — `AppleVTDecoder.cpp` now needs the linker's static property symbols at the call sites changed below.
2. Explicit `nullptr` initialisation on `AutoCFTypeRef` objects

`block` and `sample` are changed from default-constructed to explicitly `nullptr`-initialised. This is a subtle compatibility fix — on older macOS SDKs or compiler versions, the default constructor for AutoCFTypeRef may not zero-initialise the underlying CF reference, making explicit `nullptr` necessary to avoid undefined behaviour on pre-10.9 systems where the CF runtime behaves differently.
3. `kVTDecompressionPropertyKey_UsingHardwareAcceleratedVideoDecoder` replaced with `AppleVTLinker::skPropUsingHWAccel_Decode`

The hardcoded VideoToolbox property key constant is replaced with a symbol from `AppleVTLinker`. This matters because on older macOS versions where VideoToolbox is present but limited, this property key may not exist as a compile-time constant in the SDK — routing through `AppleVTLinker`'s dynamically resolved symbol is the safe path.

4. `CreateDecoderSpecification()` guarded on `AppleVTLinker::skPropEnableHWAccel_Decode`

An early return of `nullptr` is added if the linker's hardware acceleration property is unavailable, and the hardcoded `kVTVideoDecoderSpecification_EnableHardwareAcceleratedVideoDecoder` constant is replaced with the linker symbol for the same reason as above. If the symbol didn't resolve at runtime (because VideoToolbox on this OS version doesn't support it), building a decoder specification around it would crash or produce an invalid CF dictionary.

5. `__builtin_available(macOS 10.8, *)` guard on pixel format selection
The most substantial functional change. On macOS 10.8 and newer, the existing BiPlanar YCbCr pixel formats are used. On 10.7, those formats are unavailable, so a fallback to `kCVPixelFormatType_422YpCbCr8FullRange` / `kCVPixelFormatType_422YpCbCr8_yuvs` — older planar formats that exist on 10.7 — is provided. This is a functional availability guard (as opposed to the compiler-appeasement guard seen in `020`), since the else branch genuinely executes on 10.7 targets within Momiji's supported range.

### 9.13. `dom/media/platforms/apple/AppleVTEncoder.cpp`

**Summary:**

The changes fall into three separable layers:
1. Replace `#include "AppleVTEncoder.h"` with two restored `#include "AppleCVLinker.h"` and `#include "AppleVTLinker.h"` from historical revisions.
2. Wholesale replacement of hardcoded VideoToolbox and CoreVideo property key constants
3. String literal syntax normalisation
4. Some other minor structural and logic changes.

**Taxonomy classification:**
1. *Upstream revert/source restoration*
2. *Syntax/API backport*

**Relations:**

This change relates to these other changes:
* **[added]** dom/media/platforms/apple/AppleCVLinker.h
* **[added]** dom/media/platforms/apple/AppleVTLinker.h

**Explanation:**

> Note: `023` is `AppleVTDecoder.cpp` patch

This is the largest and most wide-ranging patch in the series so far. Its changes fall into three clearly separable layers:

1. Wholesale replacement of hardcoded VideoToolbox and CoreVideo property key constants

This is the dominant change by line count. Every hardcoded `kVTCompressionPropertyKey_*`, `kVTVideoEncoderSpecification_*`, `kVTEncodeFrameOptionKey_*`, and `kCVImageBufferColorPrimaries_*` / `kCVImageBufferYCbCrMatrix_*` / `kCVImageBufferTransferFunction_*` constant is replaced with its counterpart accessed through `AppleVTLinker::skProp*` or `AppleCVLinker::ColorPrimaries_*` / `YCbCrMatrix_*` / `TransferFunction_*`. The motivation is identical to what was seen in `023`: these constants are defined in Apple's SDK headers and resolve to string literals or numeric values that may not exist as compile-time symbols in older SDKs. Routing through the restored *Linker classes — which dlopen their frameworks and resolve symbols at runtime — makes the binary safe to load on macOS versions where some of these constants are absent from the system framework.

2. String literal syntax normalisation

A large number of `"..."_ns` (Mozilla's `nsLiteralString` user-defined literal) usages in MediaResult error messages are replaced with plain `"..."` C string literals. This is a Syntax/API backport — `_ns` literals require C++17 or later user-defined literal support in a form that apparently causes issues on older compilers or SDK combinations in Momiji's build environment. Replacing them with plain C strings eliminates the dependency on that language feature at these call sites.

3. Minor structural and logic changes
* `mIsHardwareAccelerated = false` is removed from `ProcessShutdown()` — a small behavioural correction, likely reflecting that resetting this flag during shutdown is unnecessary or incorrect given the restored shutdown sequence.
* Several `mgr.Set(...)` calls are restructured from a two-statement `status = mgr.Set(...); if (status != noErr)` pattern into an inline `if (mgr.Set(...) != noErr)` pattern — a cosmetic/style normalisation with no semantic difference.
* `AssertOnTaskQueue()` is removed from `ForceOutputIfNeeded()` — probably because the restored code path makes that assertion fire incorrectly on older macOS where the `__builtin_available(macos 11.0, *)` branch is not taken.
* A few line-break reformattings in `SetBitrateAndMode` call sites — purely cosmetic.

### 9.14. `dom/media/systemservices/objc_video_capture/device_info_avfoundation.mm`

**Summary:**

This patch backports a syntax at the Objective-C message send level.

**Taxonomy classification:**
1. *Syntax/API backport*

**Relations:**
> none

**Explanations:**

The patch replaces the `captureDevicesWithDeviceTypes:` call with the older `captureDevices` method, while commenting out the newer call inline. The newer `captureDevicesWithDeviceTypes:defaultCaptureDeviceTypes:` API was introduced in a later version of WebRTC's `RTCCameraVideoCapturer` (which is the Google WebRTC Objective-C wrapper, not a native Apple API), and is unavailable in the version of `libwebrtc` that Momiji builds against for legacy macOS support.

### 9.15. `dom/media/systemservices/objc_video_capture/video_capture_avfoundation.mm`

**Summary:**

Same as `device_info_foundation.mm` patch, This patch backport a syntax at the Objective-C message send level in an exactly similar field and manner.

**Taxonomy classification:**
1. *Syntax/API backport*

**Relations:**
> none

**Explanations:**

Same as `device_info_foundation.mm` patch (subsection 9.15)

### 9.16. `dom/system/mac/nsOSPermissionRequest.mm`

**Summary:**

This patches modifies `nsOSPermissionRequest.mm` to gate all macOS permission request APIs behind runtime OS version checks.

**Taxonomy classification:**
1. *API availability guarding*

**Relations:**
1. `widget/cocoa/nsCocoaFeatures.h`

Here is where custom, self-defined `OnMojaveOrLater()` and `OnCatalinaOrLater()` locate.

**Explanations:**

This patch modifies `nsOSPermissionRequest.mm` to gate all macOS permission request APIs behind runtime OS version checks. It adds `nsCocoaFeatures.h` and then wraps every method — `GetAudioCapturePermissionState`, `GetVideoCapturePermissionState`, `GetScreenCapturePermissionState`, `RequestVideoCapturePermission`, `RequestAudioCapturePermission`, and `MaybeRequestScreenCapturePermission` — with an early-return guard that falls back to `nsOSPermissionRequestBase` on older systems.
The version thresholds are:
* **Mojave (10.14)** — gates all audio, video capture permission state queries and the corresponding request methods. The macOS permission system for camera and microphone (`AVCaptureDevice` authorization APIs) was introduced in Mojave.
* **Catalina (10.15)** — gates screen capture permission specifically. `CGRequestScreenCaptureAccess` and the associated screen recording permission model arrived in Catalina.

The fallback in all cases is `nsOSPermissionRequestBase`, which is the cross-platform base class implementation — on pre-Mojave/Catalina systems it either returns a default permissive state or a no-op, since those OS versions have no permission model to query.

### 9.17. `dom/webauthn/MacOSWebAuthnService.mm`

**Summary:**
* Modernize Objective-C syntax in Firefox's Web Authentication DOM service (`MacOSWebAuthnService.mm`) for compatibility with older runtimes.

**Taxonomy classification:**

1. *Syntax/API backport*: modern subscript syntax --> explicit message-send syntax. Detail:

| Before (modern) | After (legacy) |
| --- | --- |
| `array[index]` | `[array objectAtIndex:index]` |

2. *Runtime compatibility problem*

**Relations:**
> none

**Explanations:**

Same as backporting Objective-C modern subscript syntax back into legacy message-explicit sent syntax in `accessible/mac` subtree.

### Conclusion

In this `dom` subtree, the changes cluster into 4 functional areas:

* WebGL canvas layer — Two driver behaviour compensation patches targeting specific GPU vendor and OS version combinations. Both use the (vendor, OS version) tuple detection idiom and `nsCocoaFeatures.h` for runtime version checks. One requires a class schema extension companion; the other is stateless and self-contained.
* Build graph restructuring — A node definition patch completing the RLBox/SoundTouch migration initiated in the config subtree. Meaningless without `config/recurse.mk` and `config/rules.mk` patches; together they form a three-file cohesion group spanning build system topology, compilation rules, and module declaration.
* Apple media pipeline restoration — The largest and most structurally complex cluster. Five source files deleted upstream are restored from historical Firefox revisions and wired back into the build graph and runtime logic. The restoration propagates across six patches covering build registration, runtime linker initialisation, decoder dispatch, encoder property management, and header type visibility. This cluster also contains the only Syntax/API backport (`_ns literal` removal) produced as a secondary cost of fitting restored code into the current compiler environment.
* OS permission and capture APIs — Runtime version guards ensuring that macOS permission model APIs (camera, microphone, screen capture) and WebRTC capture device enumeration APIs are only called on OS versions where their semantic contracts hold. Includes both `__builtin_available` style guards and `nsCocoaFeatures` version checks depending on whether the problem is symbol absence or semantic absence.

### Thesis relevance

1. The system layer failure mode spectrum is fully articulated here

Across the `dom` subtree alone, 3 distinct failure modes appear, each requiring a different remediation strategy:
* Symbol absent -> `__builtin_available` guard (`016`, `023`)
* Symbol present, valid parameter domain changed -> version-gated dispatch (`023` pixel formats)
* Symbol present, semantic contrscy absent -> base class fallback with `nsCocoaFeatures` check (`027`)

This is one of the strongest empirical contributions to your case study chapter can make. No existing dependency management framework distinguishes these tree; your framework names them as a spectrum and provides concrete patch evidence for each.

2. Upstream revert/source resrtoration as a distinct maintenance obligation

The VDA restoration cluster (`019`-`024`) is qualitatively different from every other patch type in the series. Mozilla removed these files for legitimate modern reasons; Momiji/Firefox-Dynasty reintroduces them because the capability gap they fill is real on legacy targets. This creates a **permanent divergence** from upstream's source tree that must be carried forward through every future base - and it carries hidden secondary costs (Syntax/API backports, class schema extensions, header visibility patches) which is unpredictable from inspecting the restoration decision alone. The framework needs to treat upstream revert as a 1st-class category with its own rebase cost model distinct from adaptation patches.

3. Patch cohesion fragmentation is empirically demonstrated at 3 scales
* **Two-file scale:** every class schema extension patch is coupled to a `.cpp` patch (`020`/`021`, `022`/`023`)
* **Three-file scale:** the RLBox build graph cohesion group (`009`, `010`, `017`)
* **Six-file scale:** the VDA restoration cohesion group (`019`-`024`)

These three scales provide graduated evidence that logical atomicity in legacy maintenance work does not correspond to file-level atomicity, and that a patch management process operating file-by-file will systematically fail to surface cross-file coherence requirements.

4. Human-in-the-loop necessity is demonstrated across multiple dimensions
The `dom` subtree adds three new axes on which human judgment is irreplaceable:
* Knowing which historical Firefox revision contains the correct version of a deleted file (`019`)
* Knowing which OS version introduced a semantic contract, not just a symbol (`027`)
* Knowing which GPU vendor on which OS version exhibits a specific driver bug (`013`, `015`)

None of these can be derived from static analysis of the dependency graph. They require institutional knowledge of Apple's platform history, Mozilla's development history, and GPU driver behaviour — confirming that the human-in-the-loop requirement is structural, not incidental.

5. The `dom` subtree introduces compound patch types

Several patches in this subtree span 2 or more categories simultaneously - most clearly `020` (restoration + availability guarding + class schema extension) and `024` (restoration + Syntax/API backport). This is important for your framework because it shows that category labels are not mutually exclusive in practice, and that the combination of categories in a single patch is itself informative: restoration work almost always carries Syntax/API backport or schema extension obligations as secondary costs, which your framework can use to generate rebase checklists.


## 10. `gfx` subtree

### Files affected:

`gfx/2d` child:
* gfx/2d/DrawTargetCairo.cpp
* gfx/2d/MacIOSurface.cpp
* gfx/2d/NativeFontResourceMac.cpp
* gfx/2d/NativeFontResourceMac.h
* gfx/2d/ScaledFontMac.cpp

`gfx/gl` child:
* gfx/gl/GLContext.cpp
* gfx/gl/GLContext.h
* gfx/gl/GLContextProviderCGL.mm

`gfx/layers` child:
* gfx/layers/MacIOSurfaceImage.cpp
* gfx/layers/NativeLayerCA.mm
* gfx/layers/ipc/CompositorBridgeChild.cpp
* gfx/layers/ipc/CompositorBridgeChild.h
* gfx/layers/opengl/CompositorOGL.cpp
* gfx/layers/wr/WebRenderLayerManager.cpp
* gfx/layers/wr/WebRenderLayerManager.h

`gfx/skia` child:
* gfx/skia/skia/src/core/SkScalerContext.h
* gfx/skia/skia/src/core/SkStrikeCache.cpp
* gfx/skia/skia/src/ports/SkScalerContext_mac_ct.cpp
* gfx/skia/skia/src/ports/SkTypeface_mac_ct.cpp
* gfx/skia/skia/src/sksl/SkSLDefines.h
* gfx/skia/skia/src/sksl/SkSLPool.cpp
* gfx/skia/skia/src/utils/mac/SkCTFont.cpp
* gfx/skia/skia/src/utils/mac/SkCTFontCreateExactCopy.cpp
* gfx/skia/skia/src/utils/mac/SkCreateCGImageRef.cpp

`gfx/thebes` child:
* gfx/thebes/CoreTextFontList.cpp
* gfx/thebes/CoreTextFontList.h
* gfx/thebes/gfxCoreTextShaper.cpp
* gfx/thebes/gfxCoreTextShaper.h
* gfx/thebes/gfxFontEntry.cpp
* gfx/thebes/gfxGraphiteShaper.cpp
* gfx/thebes/gfxGraphiteShaper.h
* gfx/thebes/gfxMacFont.cpp
* gfx/thebes/gfxMacPlatformFontList.h
* gfx/thebes/gfxMacPlatformFontList.mm
* gfx/thebes/gfxMacUtils.cpp
* gfx/thebes/gfxPlatform.cpp
* gfx/thebes/gfxPlatformMac.cpp

`gfx/wr` child:
* gfx/wr/wr_glyph_rasterizer/src/platform/macos/font.rs

### `gfx/2d` site

#### 10.1. `gfx/2d/DrawTargetCairo.cpp`

**Summary:**

This is a minimal patch, replacing a runtime guard (`NS_WARN_IF` + early return) with a debug assertion (`MOZ_ASSERT`).

**Taxonomy classification:**

1. *Diagnostic posture adjustment*: 

This patch is neither a backport not a feature gate. It looks more like a **diagnostic posture adjustment** which tightens assumptions about call-site correctness, likely to surface latent bugs during the active one (rahter than Metal/CoreGraqphics paths in which Mozilla now defaults to). The change may reflect that on legacy macOS targets, this code path is exercised more heavily and developers expect hard failures rather than silent degradation.

**Relations:**
> none

**Explanation:**

It replaces a runtime guard (`NS_WARN_IF` + early return) with a debug assertion (`MOZ_ASSERT`). The original code checked whether `mClipDepth <= 0` (meaning `PopClip` was called with no clip on the stack), emitted a warning if so, and bailed out gracefully. The patch replaces this with an assertion that simply demands `mClipDepth > 0` is always true at that point.

Practical difference:

* `NS_WARN_IF` + return: logs a warning in debug builds but lets the program continue in production — a defensive, forgiving pattern.
* `MOZ_ASSERT`: crashes in debug builds if the condition is violated, but compiles away entirely in release builds — an optimistic, strict pattern that trusts the invariant holds.

#### 10.2. `gfx/2d/MacIOSurface.cpp`

**Summary:**

API substitution: `CGColorSpaceCopyICCData` (macOS 10.12 and later) with `CGColorSpaceCopyICCProfile`.

**Taxonomy classification:**
1. *Syntax/API backport*: 

**Relations:**
> none

**Explanation:**

This is a clean API substitution. `CGColorSpaceCopyICCData` was introduced in macOS 10.12 as a replacement for the older `CGColorSpaceCopyICCProfile`. Since Momiji targets down to 10.7–10.11, calling the newer function would either fail to link or crash at runtime on those systems. The patch reverts to `CGColorSpaceCopyICCProfile`, which has been available since macOS 10.0 and is deprecated but still present on the legacy targets.

Both functions do the same thing — they copy the ICC profile data out of a `CGColorSpaceRef` as a `CFDataRef` — so the behavioural output is identical. The only difference is availability across OS versions.

<!-- Separation line -->

#### 10.3. `gfx/2d/NativeFontResourceMac.cpp`

**Summary:**

This is a substantial patch, with 2 distinct layers:
1. Layer 1: Font loading path replacement (dominant change)
2. Layer 2: Removed caching concern

**Taxonomy classification:**
1. *Syntax/API backport*

**Relations:**
> none

**Explanation:**

There are 2 distinct layers of change happening simultaneously in this patch:
1. **Layer 1: Font loading path replacement (the dominant change)**

| Original code | New code |
| --- | --- |
| Use a CTFont-based pipeline to load fonts from raw data:<br> | A much simpler routine:<br> |
| <br>1. Allocate a custom `CFAllocator` to manage the font data buffer's lifetime<br> | <br>1. Copy the data into a plain `CFDataRef` via `CFDataCreate`<br> |
| <br>2. Wrap it in a `CFDataRef` via `CFDataCreateWithBytesNoCopy`<br> | <br>2. Wrap it in a `CGDataProviderRef`<br> |
| <br>3. Call `CTFontManagerCreateFontDescriptorFromData` to get a `CTFontDescriptorRef`<br> | <br>3. Call `CGDataProviderCreateWithCFData` → `CGFontCreateWithDataProvider` directly<br> |
| <br>4. Construct a `CTFontRef` from the descriptor, then copy a `CGFontRef` out of it<br> | <br>4. Pass only `fontRef` into the constructor |
| <br>5. Extract the PostScript name and store it in `sWeakFontDataMap` keyed by the raw buffer pointer<br> | |
| <br>6. Pass both `ctFontDesc` and `fontRef` into the `NativeFontResourceMac` constructor | |

The entire `CTFontDescriptor` path, the custom allocator, the `sWeakFontDataMap` bookkeeping, and the PostScript name extraction are all removed. `mFontDescRef` disappears from the object entirely. Why this matters for legacy targets: `CTFontManagerCreateFontDescriptorFromData` was introduced in macOS 10.8. The `CGDataProvider`-based path using `CGFontCreateWithDataProvider` is available all the way back to macOS 10.0. So this is an API backport — replacing a newer, higher-level CT API with an older, lower-level CG API that achieves the same end result (a usable `CGFontRef`) while working on 10.7. 

2. **Layer 2: The removed caching concern**

The original code's inline comments explain a specific Mozilla optimisation concern: the CT-based path was chosen precisely to avoid the font data being retained in an internal `TDescriptorSource` cache. The patch abandons that concern entirely — the `CGDataProvider` path has no such cache avoidance guarantee. This is an accepted trade-off: on legacy platforms, correctness and availability take priority over the memory optimisation Mozilla engineered for modern macOS.

#### 10.4. `gfx/2d/NativeFontResourceMac.h`

**Summary:**

This is the counterpart make `NativeFontResourcesMac.cpp` valid:
1. Removes `mFontDescRef` from the object layour
2. Simplifies the constructor signature
3. Removes the `CFRelease(mFontDescRef)` from the destructor

**Taxonomy classification:**
1. *Syntax/API backport*

**Relations:**
1. `gfx/2d/NativeFontResourceMac.cpp`: this is the patch of the header counterpart.

**Explanations:**
This header patch is the structural counterpart that makes the .cpp changes valid. Three things it does:

1. **Removes `mFontDescRef` from the object layout**. The `.cpp` patch eliminated the entire `CTFontDescriptorRef` pipeline at creation time, but the object still held that descriptor as a member. Without this header change, the class would still carry `mFontDescRef`, the constructor would still require it, and the compiler would reject the new single-argument constructor call in the `.cpp`. Removing the member field here completes the excision.

2. Simplifies the constructor signature. The old constructor took both `CTFontDescriptorRef` and `CGFontRef`. The new one takes only `CGFontRef`. This is what allows the `.cpp` to write new `NativeFontResourceMac(fontRef, aDataLength)` — that call would not compile against the old header.

3. Removes the `CFRelease(mFontDescRef)` from the destructor. Since the descriptor is no longer stored, it no longer needs to be released at teardown. This is a necessary correctness fix — releasing a member that no longer exists would be undefined behaviour.

#### 10.5. `gfx/2d/ScaledFontMac.cpp`

**Summary:**

All changes revolve around the single theme: **font variation APIs are unreliable on older macOS, and this patch adds OS-version guards to prevent those from being called.** There are 4 distinct change sites:
1. `CreateCTFontFromCGFontWithVariations` — Sierra-specific branching (line ~22)
2. `GetFontDescriptor` — variation font bail-out before Catalina (line ~383)
3. `GetVariationsForCTFont` — pre-Sierra guard (line ~451)
4. `CreateVariationDictionaryOrNull` and `CreateVariationTagDictionaryOrNull` — same pre-Sierra guard (lines ~528, ~644)

**Taxonomy classification:**
1. *Feature gating*: 

**Relations:**
> none

**Explanation:**

All changes revolve around a single theme: font variation APIs are unreliable on older macOS versions, and the patch adds OS-version guards throughout to prevent those APIs from being called on systems where they misbehave.
There are four distinct change sites:

1. `CreateCTFontFromCGFontWithVariations` — Sierra-specific branching (line ~22)

The original condition for entering the variation-copy path was simply `aInstalledFont` (whether the font is system-installed). The patch replaces this with a two-part condition:
* Always enter the path on Sierra (10.12) exactly
* Enter the path on High Sierra or later (10.13+) only if the font is also installed

This is a nuanced version-specific behaviour correction — Sierra apparently needs variation data copied even for non-installed fonts, while High Sierra and later follow the original installed-only rule.

2. `GetFontDescriptor` - variation font bail-out before Catalina

A new early-return block checks: if the platform has variation font support and the OS is before Catalina (10.15), and the font contains an `fvar` table (the OpenType table that marks a font as variable), return `false` immediately. This skips the font descriptor serialisation path for variable fonts on 10.12–10.14. The comment references Mozilla bug 1690235 — using a font descriptor for variation fonts on pre-10.15 systems is known to fail.

3. `GetVariationsForCTFont` — pre-Sierra guard (line ~451)

An early return of true (success/no-op) is added if the OS is pre-Sierra (before 10.12). The comment cites Mozilla bug 1331683 — variation APIs themselves are considered buggy before Sierra, so the function simply skips all work and reports success vacuously.

4. `CreateVariationDictionaryOrNull` and `CreateVariationTagDictionaryOrNull` — same pre-Sierra guard (lines ~528, ~644)

The same `OnSierraOrLater()` guard is added to both dictionary-creation helpers, returning `nullptr` immediately on pre-Sierra. These are the lower-level functions that the variation pipeline calls to build the axis/value dictionaries, so guarding them at entry is the correct choke point.

#### Conclusion

Changes applied:

| Patch | File | Change |
| --- | --- | --- |
| 028 | `DrawTargetCairo.cpp` | Replace runtime warning+return with `MOZ_ASSERT` in `PopClip()` |
| 029 | `MacIOSurface.cpp` | Substitute `CGColorSpaceCopyICCData` -> `CGColorSpaceCopyICCProfile` |
| 030 | `NativeFontResourceMac.cpp` | Replace CT-based font loading pipeline with CG-based pipeline |
| 031 | `NativeFontResourceMac.h` | Remove `mFontDescRef` member and simplify constructor to match 030 |
| 032 | `ScaledFontMac.cpp` | Add OS version guards throughout font variation API call sites |

These patches in `gfx/2d` site address three independent failure modes on legacy macOS:
1. **API unavailability** (029, 030/031): Two CoreGraphics/CoreText APIs introduced after 10.7 — `CGColorSpaceCopyICCData` (10.12) and `CTFontManagerCreateFontDescriptorFromData` (10.8) — are replaced with functionally equivalent older APIs available from 10.0. The font loading replacement (030/031) is structurally invasive because the newer and older APIs have different interface models (descriptor-based vs. data provider-based), requiring removal of the descriptor-carrying infrastructure from the object entirely across both the `.cpp` and `.h`.
2. **API unreliability** (032): Font variation APIs exist on Sierra through Mojave but are documented as buggy (Mozilla bugs 1331683 and 1690235). The patch adds OS-version guards at multiple call sites to disable variation font processing below Sierra entirely, and to avoid font descriptor serialisation for variable fonts below Catalina. This is not a substitution — the feature is simply disabled on affected versions.
3. **Diagnostic posture** (028): A defensive runtime guard in the Cairo drawing path is replaced with a hard assertion, tightening correctness assumptions for a code path that is actively exercised on legacy targets where Cairo remains the rendering backend.

#### Thesis relevance

1. Two distinct modes of system-layer constraint

Patches 029/030 and patch 032 represent two fundamentally different reasons why a system-layer symbol cannot be relied upon:
* *Absence*: the symbol does not exist on the target OS version — caught at link time or runtime crash
* *Unreliability*: the symbol exists but behaves incorrectly on specific versions — caught only through empirical bug reports, not through any automated verification

This distinction is significant for the framework. Absence is in principle mechanically detectable (linker errors, availability annotations). Unreliability is not — it requires human knowledge of bug history. This strengthens the human-in-the-loop as structural necessity argument: even a complete symbol availability oracle would be insufficient to surface the constraints addressed in patch 032.

2. Multi-file atomic changes

Patches 030 and 031 together form a single logical intervention that happens to span a header/source pair. This is a concrete example of why patch granularity in the framework should be defined at the logical change level rather than the per-file level. A framework that tracks changes file-by-file without linking 030 and 031 would misrepresent the dependency structure of the intervention.

3. Accepted trade-off: correctness over optimisation

The CT→CG font loading replacement (030) explicitly abandons a Mozilla-engineered memory optimisation (avoiding the `TDescriptorSource` cache) in exchange for availability on legacy targets. This is a clean empirical instance of the trade-off axis the framework should acknowledge: on legacy platforms, correctness and availability constraints can force regression on non-functional properties that the upstream project had deliberately optimised for.

4. Taxonomy refinement

The `gfx/2d` subtree motivates splitting the existing API backport category into two sub-cases:
* *API substitution*: a newer symbol is replaced by an older equivalent with the same interface shape (029)
* *API pipeline replacement*: the newer and older APIs have different interface models, requiring structural changes to surrounding code (030/031)

And confirms feature gating warrants a sub-case distinction:
* *Capability-absence gating*: feature disabled because the required API does not exist
* *Capability-correctness gating*: feature disabled because the API exists but cannot be trusted (032)

These refinements add resolution to the taxonomy without changing its fundamental structure.

### `gfx/gl` site

#### 10.6. `gfx/gl/GLContext.h`

**Summary:**
Add `nsCocoaFeatures.h` to inclusion list in case of macOS target for feature gating purpose in `GLContext.cpp`.

**Taxonomy classification:**
1. *Feature gating*

**Relations:**
> none

**Explanation:**

No further explanation is required.

#### 10.7. `gfx/gl/GLContext.cpp`

**Summary:**

Two distinct GPU workaround restorations:
1. OpenGL version floor for Intel on macOS 10.7
2. Texture size caps, stratified by OS version and GPU vendor.

**Taxonomy classification:**
1. **Fearure gating**

**Relations:**
1. `gfx/gl/GLContext.h`: use gating functions declared in the newly included `nsCocoaFeatures.h` library

**Explanation:**

This patch, together with the previous 033 patch, forms a single coherent change: **restoring GPU workaround logic** for **legacy macOS versions** (10.6 through pre-10.12 Sierra) that Mozilla removed when they dropped support for those systems.

1. Hunk 1 - OpenGL version floor for Intel on macOS 10.6/10.7

Mozilla's original code simply bailed out if `mVersion < 200` (i.e., the GPU reported OpenGL < 2.0). The patch changes this hard failure into a silent version override:

```c
if (mVersion < 200) {
	// Mac OSX 10.6/10.7 machines with Intel GPUs claim only OpenGL 1.4 but
	// have all the GL2+ extensions that we need.
	mVersion = 200;
}
```

The driver lie problem: certain Intel GPUs on early macOS report OpenGL 1.4 in their version string, but actually expose all OpenGL 2.0+ extensions required by Firefox. Mozilla's generic check would falsely reject these GPUs. The workaround forces `mVersion` to 200 to pass the gate, trusting the extensions rather than the version advertisement.

2. Hunk 2 - Texture size caps, stratified by OS version and GPU vendor

Mozilla's modern code had a single blanket cap for macOS (Mojave-era, 8192) referencing Bug 1544446. The patch wraps this in an `IsAtLeastVersion(10, 12)` branch and restores the older, more granular GPU/OS workarounds for pre-Sierra systems:

| Condition | Cap applied |
| --- | --- |
| <10.12, Intel GPU | `maxTexSize = 4096`, `maxCubeSize = 512` (Bugs 737182, 684882) |
| (10.8,10.12), Nvidia | `maxTextureSize` and `maxRenderbufferSize` capped at 8191 (Bug 879656) |
| <10.8, Nvidia | Both capped at 4096 (Bug 877949) |
| >=10.12, any vendors | Original Mozilla cap of 8192 |

The NVIDIA cap of 8191 (not 8192) is a known hardware quirk — the bug reference notes 8192 actually fails on those GPUs.

#### 10.8. `gfx/gl/GLContextProviderCGL.mm`

**Summary:**

Conditional replace modern `[NSOpenGLContext pixelFormat]` call with the legacy equivalent `CGLGetPixelFormat([aContext CGLContextObj])` call.

**Taxonomy classification:**
1. *Syntax/API backport*

**Relations:**
> none

**Explanations:**

`[NSOpenGLContext pixelFormat]` is an instance method that was only introduced in macOS 10.10. On 10.7–10.9, sending this message to an NSOpenGLContext object causes a crash (unrecognized selector). The patch wraps the call in a helper function that uses `-respondsToSelector`: to probe for the method at runtime, and falls back to the equivalent CGL-level call — `CGLGetPixelFormat([aContext CGLContextObj])` — wrapped in an `NSOpenGLPixelFormat` object, which achieves the same result on older systems.

This is similar in spirit to the Objective-C subscript patches in `accessible/mac`: the issue is a `missing API symbol` on the target OS, not a syntax incompatibility. The fix pattern is identical — runtime availability check via `respondsToSelector:`, with a semantically equivalent fallback.

#### Conclusion

Three patches, two files of concern (`GLContext.h/.cpp`) plus one (`GLContextProviderCGL.mm`), forming two distinct technical threads:

**Thread 1: GPU capability workarounds (033 + 034)**

The header patch conditionally includes `nsCocoaFeatures.h` as a prerequisite. The implementation patch then restores two categories of GPU workarounds that Mozilla discarded when dropping legacy macOS support:

- An OpenGL version floor that overrides false `< 2.0` reports from Intel GPUs on 10.6/10.7, trusting extension availability over the version string
- A stratified texture/renderbuffer size cap table, keyed on `(osver, gpu_vendor)`, restoring limits known to be necessary for Intel and NVIDIA hardware on pre-Sierra systems — including the NVIDIA-specific 8191 quirk

**Thread 2: API availability backport (035)**

Introduces a helper `GetPixelFormatForContext()` that guards the macOS 10.10+ `-[NSOpenGLContext pixelFormat]` method behind `respondsToSelector:`, falling back to the equivalent CGL-level call on 10.7–10.9. The call site in `MigrateToActiveGPU()` is updated to use this helper.

---

| Patch | Classification |
|---|---|
| 033 | Prerequisite header inclusion (build graph surgery at micro-scale) |
| 034 hunk 1 | Feature gating (runtime capability probe overriding driver self-report) |
| 034 hunk 2 | Feature gating (stratified runtime workaround keyed on system tuple) |
| 035 | API availability backport (runtime `respondsToSelector:` guard) |

---

#### Thesis Relevance

**1. The system layer has independent, overlapping fault surfaces**

The NVIDIA 8600M GT bug discussion made this concrete: patches 033/034 correctly address version-reporting and texture-size faults for that GPU family, yet a third fault surface — shader language compatibility — remains. This illustrates a structural property of your framework: for a given target tuple, the implicit system layer can fail at multiple independent points, and workarounds must be applied at each. Completeness of coverage is not guaranteed by addressing one surface.

**2. GPU vendor and OS version as joint system tuple parameters**

Hunk 2 of patch 034 is the clearest empirical example yet of the `(osver, gpu_vendor)` interaction determining correct behaviour. The workaround isn't keyed on `osver` alone or `gpu_vendor` alone — it requires both simultaneously. This validates the claim that the system layer parameter space is multi-dimensional and that treating it as a single axis (as most dependency models implicitly do) is insufficient.

**3. Runtime probing as the necessary response to open system layer boundaries**

Both `respondsToSelector:` in patch 035 and the version floor logic in patch 034 hunk 1 are runtime probes — they cannot be resolved at compile time because the SDK exposes the symbols as available while the actual runtime system layer on older `osver` values does not provide them. This is a precise empirical instance of your claim that complete automated verification is structurally impossible: the build-time dependency graph presents these symbols as satisfied, yet the runtime system layer contradicts that. Human knowledge of the discrepancy (recovered here from Mozilla's bug trail) is what makes the correct workaround possible.

**4. Knowledge archaeology as a maintenance cost**

All workarounds in patches 033/034 are anchored to specific Mozilla bug numbers (737182, 684882, 877949, 879656, 1544446). The knowledge encoding *why* these limits are necessary does not live in the codebase — it lives in Bugzilla. When Mozilla dropped legacy support and removed these workarounds, the institutional knowledge became externally stored. i3roly had to recover it from that external source. This is a concrete cost your framework should account for: legacy maintenance requires not just technical capability but **knowledge recovery**, and the cost of that recovery scales with how thoroughly the upstream project has erased the relevant history.

**5. The Newton-to-Einstein framing holds at the micro level**

Mozilla's modern code is not wrong for its target domain — the blanket 8192 Mojave cap is correct for macOS 12+ on modern hardware. The patches don't refute it; they nest it inside a branch that activates only when the system tuple falls outside Mozilla's supported range. This is the extension pattern playing out at the function level.




### `gfx/layers` site

#### 10.9. `gfx/layers/MacIOSurfaceImage.cpp`

**Summary:**

The patch makes two substantive changes to `MacIOSurfaceRecycleAllocator::Allocate`, both concerning how IOSurfaces are created for YUV video content on old macOS.

**Taxonomy classification:**
1. Feature gating

**Relations:** none

**Explanation:**

The patch makes two substantive changes to `MacIOSurfaceRecycleAllocator::Allocate`, both concerning how IOSurfaces are created for YUV video content on old macOS:

---

**1. New import: `nsCocoaFeatures.h`**

A conditional include of `nsCocoaFeatures.h` is added under `#ifdef XP_MACOSX`. This header exposes OS version detection utilities — specifically the `nsCocoaFeatures::OnMountainLionOrLater()` check used below.

---

**2. Logic change: force single-planar surface on macOS ≤ 10.7**

The original condition for creating a **single-planar** IOSurface was:

```cpp
if (aChromaSubsampling == HALF_WIDTH && aColorDepth == COLOR_8)
```

i.e., only when the content is 4:2:2 subsampled with 8-bit color. Otherwise a bi-planar surface was created.

The patch adds an OR clause:

```cpp
|| !nsCocoaFeatures::OnMountainLionOrLater()
```

So on macOS 10.7 (Lion) and earlier, a single-planar surface is *always* created, regardless of color depth or subsampling format. The inline comment explains the rationale directly: Lion doesn't support 10-bit color, so attempting to create bi-planar 10-bit surfaces would fail or behave incorrectly on that OS version. Mountain Lion (10.8) is used as the version gate, meaning 10.7 and below fall through to the safe single-planar path.

---

#### 10.10. `gfx/layers/NativeLayerCA.mm`

**Summary:**

This patch addresses multiple distinct incompatibilities across the Core Animation layer pipeline.
1. Subscript syntax backport (like `accessibile/mac` patch)
2. `CheckVideoLowPower:` early exit pre-High Sierra
3. `NativeLayerRootSnapshotterCA` destructor: `AutoCATranslation` guard
4. `CGColorCreateRGB`: dynamic symbol resolution with fallback
5. `ShouldSpecializeVideo`: High Sierra version guard + `@available` for DRM
6. `CGColorSpaceCopyICCData` → `CGColorSpaceCopyICCProfile`
7. `preventsCapture` wrapped in `@available(macOS 10.15, *)`
8. `maskedCorners`/rounded clip logic wrapped in `@available(macOS 10.13, *)` 
9. `mMutatedIsDRM` flag removal

**Taxonomy classification:**
1. Syntax/API backport
2. Feature gating
3. Dynamic symbol resolution with manual fallback
4. Safety fix (CA translation safety fix)

**Explanations:**

---

**File:** `gfx/layers/NativeLayerCA.mm`

This patch addresses multiple distinct incompatibilities across the Core Animation layer pipeline. In detail:

---

**1. Subscript syntax backport (line 10)**

```objc
// Before
CALayer* topContentCALayer = topCALayer.sublayers[0];
// After
CALayer* topContentCALayer = [topCALayer.sublayers objectAtIndex:0];
```

Identical pattern to what was seen in the `accessible/mac` patches — modern Objective-C subscript syntax on `NSArray` is unavailable on 10.7, replaced with the explicit message-send form. Straightforward **syntax backport**.

---

**2. `CheckVideoLowPower`: early exit below High Sierra (lines 15–17)**

A guard is inserted so that if the OS is below 10.13 (High Sierra), `VideoLowPowerType::FailMacOSVersion` is returned immediately, before any attempt to check for `AVSampleBufferDisplayLayer`. This is necessary because `AVSampleBufferDisplayLayer` as a video specialization mechanism was introduced in High Sierra; probing for it on earlier systems would either crash or produce meaningless results.

---

**3. `NativeLayerRootSnapshotterCA` destructor: `AutoCATransaction` guard (line 25)**

An `AutoCATransaction` is inserted before `[mRenderer release]` in the destructor. Core Animation operations — including releasing certain layer-backed objects — need to occur within a CA transaction context to be safe. On older macOS, the implicit transaction scoping that modern versions provide may be absent or behave differently, making explicit scoping necessary here.

---

**4. `CGColorCreateSRGB`: dynamic symbol resolution with fallback (lines 36–50)**

This is the most technically elaborate change. `CGColorCreateSRGB` was introduced in macOS 10.15. The original code called it directly, which would cause a link-time or load-time failure on older systems.

The patch replaces the direct call with a three-layer strategy:
- An `@available(macOS 10.15, *)` runtime check first confirms the OS version.
- Inside that guard, `dlsym(RTLD_DEFAULT, "CGColorCreateSRGB")` dynamically resolves the symbol at runtime, storing it in a `static` function pointer. The comment explains why both checks are needed: `@available` satisfies the compiler's availability checker, while `dlsym` avoids the direct symbol reference that would cause the older SDK build to fail.
- If the symbol isn't found (or the OS is older), the fallback manually constructs the sRGB color via `CGColorSpaceCreateWithName(kCGColorSpaceSRGB)` + `CGColorCreate`, then releases the intermediate `colorSpace` object. The comment acknowledges this path incurs an extra allocation for the color space.

This is a **Runtime library/API substitution** pattern — the same category as the C++17 substitutions in the `config` subtree, but applied here at the CoreGraphics API level.

---

**5. `ShouldSpecializeVideo`: High Sierra version guard + `@available` for DRM (lines 75–90)**

Two related guards are added:
- An early return `false` if below High Sierra, preventing the specialized video layer path from being attempted at all on unsupported OS versions. This mirrors change #2 in intent.
- The `mTextureHost->IsFromDRMSource()` check is wrapped in `@available(macOS 10.15, *)`, since DRM video capture prevention (`preventsCapture`) is a Catalina+ feature.

---

**6. `CGColorSpaceCopyICCData` → `CGColorSpaceCopyICCProfile` (line 112)**

```cpp
// Before
CGColorSpaceCopyICCData(colorSpace.get())
// After
CGColorSpaceCopyICCProfile(colorSpace.get())
```

`CGColorSpaceCopyICCData` is the modern (10.12+) API. `CGColorSpaceCopyICCProfile` is the older equivalent available on earlier macOS versions. This is an **API substitution** — swapping a newer function for an older one with equivalent semantics.

---

**7. `preventsCapture` wrapped in `@available(macOS 10.15, *)` (lines 122–125)**

The `preventsCapture` property on `AVSampleBufferDisplayLayer` is a 10.15+ addition. The patch wraps its use in an availability check, preventing a crash or undefined behavior on earlier systems.

---

**8. `maskedCorners` / rounded clip logic wrapped in `@available(macOS 10.13, *)` (lines 163–214)**

`CACornerMask` and the `maskedCorners` property on `CALayer` were introduced in macOS 10.13 (High Sierra). The entire per-corner rounding logic is wrapped inside `if(@available(macOS 10.13, *))`, so on 10.7–10.12 the rounding is silently skipped (the layer's `cornerRadius` and `masksToBounds` are still reset to defaults, but per-corner selection is not attempted).

---

**9. `mMutatedIsDRM` flag removal (line 225)**

The `mMutatedIsDRM = false` reset at the end of `ApplyChanges` is removed. This is likely a consequence of wrapping the `preventsCapture` usage in `@available` — on older systems the DRM path is never taken, so resetting the mutation flag there would be unreachable or misleading. The flag management is effectively folded into the availability-gated block.

---

#### 10.11,12. `gfx/layers/ipc/CompositorBridgeChild.h` and gfx/layers/ipc/CompositorBridgeChild.cpp`

**Summary:**

A new boolean member field introduced accross the header/implementation split.

**Taxonomy classification:**
1. Class schema extension

**Relations:**
> none

**Explanation:**

These two patches are tightly coupled as a single logical unit — a new boolean member field introduced across the header/implementation split.

---

**`.h` patch — declaration side**

Two additions are made to the `CompositorBridgeChild` class:

- A new public inline method `WindowOverlayChanged()` that sets `mWindowOverlayChanged = true` when called — the setter.
- A new private member field `bool mWindowOverlayChanged` — the state variable itself.

**`.cpp` patch — implementation side**

Two corresponding additions:

- In the constructor's member initializer list, `mWindowOverlayChanged(false)` — the field is initialized to `false` at construction time.
- In `EndCanvasTransaction()`, `mWindowOverlayChanged = false` is inserted before the canvas manager transaction ends — the reset.

The `.h` and `.cpp` patches together implement the full lifecycle of a single dirty flag:

| Stage | Location | What happens |
|---|---|---|
| Declaration | `.h` | Field and setter method declared |
| Initialization | `.cpp` constructor | Field starts as `false` |
| Set | `.h` inline method | External callers signal overlay changed |
| Reset | `.cpp` `EndCanvasTransaction` | Flag cleared at transaction boundary |

The flag tracks whether the window overlay has changed since the last canvas transaction. The reset point — at `EndCanvasTransaction` — confirms this is a per-frame or per-transaction dirty bit, consumed and cleared each time the canvas pipeline finishes a round.


#### 10.13. `gfx/layers/opengl/CompositorOGL.cpp`

**Summary:**

After blend function setup in `DrawGeometry`, a macOS-only workaround block is inserted targeting a specific GPU driver bug: `Bug 987497: NVIDIA driver on macOS 10.8 and below`.

**Taxonomy classification:**
1. Driver behaviour compensation

**Relations:** none

**Explanations:**

---

After blend function setup in `DrawGeometry`, a macOS-only workaround block is inserted targeting a specific GPU driver bug:

```
Bug 987497: NVIDIA driver on macOS 10.8 and below
```

The condition is triple-gated:
- `gl()->WorkAroundDriverBugs()` — a general flag that enables known driver workarounds, presumably user- or config-controlled
- `gl()->Vendor() == GLVendor::NVIDIA` — applies only to NVIDIA GPUs
- `!nsCocoaFeatures::OnMavericksOrLater()` — applies only below macOS 10.9

When all three conditions are met, the workaround re-activates the currently bound shader by reading the current program with `fGetIntegerv(LOCAL_GL_CURRENT_PROGRAM)` and immediately re-issuing `fUseProgram` with the same handle. The comment explains why: the NVIDIA driver on 10.8 and below sometimes fails to propagate uniform changes (specifically `TexturePass2`) unless the shader is explicitly re-bound, even to itself.

---

#### 10.14,15. `gfx/layers/wr/WebRenderLayerManager.h` and `gfx/layers/wr/WebRenderLayerManager.cpp`

**Summary:**

Introduction of `mWindowOverlayChanges` dirty flag into `WebRenderLayerManager` with exactly the same shape as in `CompositorBridgeChild`.

**Taxonomy classification:**
1. Class schema extension

**Relations:**
* `gfx/layers/ipc/CompositorBridgeChild.h` 
* `gfx/layers/ipc/CompositorBridgeChild.cpp`

This is where the `mWindowOverlayChanges` flag was implemented.

**Explanation:**

These two patches are again a matched header/implementation pair, but unlike patches 038/039, this pair includes the **read site** that was missing there — making it a complete implementation of the flag's full lifecycle.

---

***Structure: same pattern as 038/039, different class**
*
The `mWindowOverlayChanged` dirty flag is introduced into `WebRenderLayerManager` with exactly the same shape as in `CompositorBridgeChild`:

| Stage | Location | What happens |
|---|---|---|
| Declaration | `.h` | `bool mWindowOverlayChanged` field + inline `WindowOverlayChanged()` setter |
| Initialization | `.cpp` constructor | `mWindowOverlayChanged(false)` |
| Set | `.h` inline method | External callers signal overlay changed |
| Reset | `.cpp` `EndTransactionWithoutLayer` | Cleared after a full transaction completes |

---

***The key difference: this pair contains the read site**
*
In `EndEmptyTransaction`, the flag is actually *checked*:

```cpp
if (mWindowOverlayChanged) {
	return false;  // force a full transaction
}
```

The comment is explicit: an empty transaction (one that skips rebuilding the WebRender display list) cannot correctly handle a changed window overlay, because overlay repainting is only supported in full transactions. If the flag is set, the empty transaction path is aborted, forcing the caller to fall through to a full transaction. The `XXX` note acknowledges this is a blunt instrument — a future optimization could send just the updated overlay image rather than rebuilding the entire display list.

The reset then happens in `EndTransactionWithoutLayer`, which is the full-transaction path — confirming the flag is consumed and cleared only when a full repaint has occurred.

---

**Relationship between 038/039 and 041/042**

These two patch pairs are implementing the same concept — `mWindowOverlayChanged` as a dirty flag signalling that a window overlay repaint is needed — on two parallel classes that sit at different levels of the compositor architecture:

- `CompositorBridgeChild` is the IPC bridge between the content process and the compositor process
- `WebRenderLayerManager` is the WebRender-specific layer manager that owns the display list and transaction lifecycle

Both classes expose an identical `WindowOverlayChanged()` public setter, suggesting there is a caller upstream that notifies both (or dispatches to whichever is active). The `CompositorBridgeChild` pair only had the set/reset infrastructure; this pair reveals the *semantics* — the flag exists to prevent empty transactions from silently dropping window overlay updates.

#### Conclusion

| # | File | Primary change |
|---|---|---|
| 036 | `MacIOSurfaceImage.cpp` | Force single-planar IOSurface on 10.7 |
| 037 | `NativeLayerCA.mm` | Multi-site CA/CG compatibility fixes |
| 038/039 | `CompositorBridgeChild.h/.cpp` | `mWindowOverlayChanged` flag infrastructure |
| 040 | `CompositorOGL.cpp` | NVIDIA driver bug workaround for 10.8 |
| 041/042 | `WebRenderLayerManager.h/.cpp` | `mWindowOverlayChanged` flag with read logic |

**Syntax backport** (037)
One instance of Objective-C subscript syntax replaced with `objectAtIndex:` — same pattern as `accessible/mac`.

**Feature gating** (036, 037 ×3)
The most prevalent category in this subtree. Multiple capabilities are guarded by runtime OS version checks:
- Bi-planar 10-bit IOSurface creation gated below 10.8
- `AVSampleBufferDisplayLayer` video path gated below 10.13
- `preventsCapture` (DRM) gated below 10.15
- `maskedCorners` per-corner rounding gated below 10.13
Each gate substitutes either a safe fallback or a silent skip.

**Runtime library/API substitution** (037)
`CGColorCreateSRGB` (10.15+) resolved via `dlsym` with a manual `CGColorCreate` fallback — the most elaborate single change in the subtree. Notably combines `@available` for compiler satisfaction with `dlsym` for link safety, a two-layer resolution strategy not seen in previous subtrees.

**API substitution** (037)
`CGColorSpaceCopyICCData` → `CGColorSpaceCopyICCProfile`, swapping a newer function for an older equivalent with identical semantics.

**CA transaction safety** (037)
Explicit `AutoCATransaction` guard inserted in a destructor, addressing implicit transaction scoping differences on older macOS.

**Driver behaviour workaround** (040)
NVIDIA shader re-bind workaround for a known GPU driver bug on 10.8 and below — a reinstated historical fix that upstream had removed when 10.8 support was dropped.

**Rendering correctness fix** (038/039, 041/042)
A `mWindowOverlayChanged` dirty flag introduced across two compositor classes to prevent empty transactions from silently dropping window overlay updates. No OS version guards present; motivation is likely a rendering correctness issue that needed to be carried independently.

#### Thesis relevance

**1. The system layer is not monolithic**

This subtree makes concrete what earlier analysis described abstractly. The system layer contains at least three distinct sub-layers, each requiring a different resolution strategy:

- *OS API availability* — resolved by `@available` + `dlsym` (CGColorCreateSRGB)
- *OS feature support* — resolved by version-gated fallback (bi-planar IOSurface, AVSampleBufferDisplayLayer)
- *Driver behaviour contracts* — resolved by conditional workaround reinstatement (NVIDIA bug 987497)

These are not the same kind of dependency. A framework that treats the system layer as a flat set of symbols misses this structure. The framework should model these as distinct sub-categories with distinct resolution strategies.

**2. The historical dimension of legacy maintenance**

Patch 040 is the clearest evidence yet that legacy maintenance is not only about the present state of the system layer, but about its *history*. The NVIDIA workaround existed upstream, was removed when 10.8 support was dropped, and had to be reinstated. The dependency on a specific driver behaviour was always there — it was the *upstream codebase* that forgot about it. This supports the framing that a legacy fork must maintain awareness of the full temporal trajectory of upstream changes, not just the current delta.

**3. Two-layer flag pattern as cross-cutting evidence**

Patches 038/039 and 041/042 together implement the same `mWindowOverlayChanged` flag across two parallel classes. The absence of OS version guards is notable — this is not a legacy-specific fix in the obvious sense, yet it appears in Momiji and apparently not (or not stably) in the upstream. This is a case where the system layer dependency is indirect: older compositor paths on legacy macOS may be more sensitive to empty transaction shortcuts, making a rendering correctness bug latent upstream but surface-visible on the legacy fork. This illustrates that the system layer can *indirectly* cause correctness issues in code that has no explicit system layer dependencies of its own — a subtlety worth acknowledging in the framework's scope definition.

**4. Density of change categories in a single file**

Patch 037 (`NativeLayerCA.mm`) alone contains six or seven distinct change sites spanning syntax backport, feature gating at three different version thresholds, Runtime library/API substitution, API substitution, and CA transaction safety. This concentration illustrates that in a graphics pipeline file with heavy OS API surface, the maintenance burden is not uniform — certain files become disproportionate complexity concentrators. The framework may need to acknowledge that change density per file is not predictable from file size or apparent scope alone.

### `gfx/skia` site

#### 10.16. `gfx/skia/skia/src/core/SkScalerContext.h`

**Summary:**

This adds a single new flag to `Flags` enum in `SkScalerContext`:`kLightOnDark_Flag = 0x8000`.

**Taxonomy classification:**
1. Feature gating

**Relations:**
1. `gfx/skia/skia/src/ports/SkScalerContext_mac_ct.cpp`

This is where it is explicitly stated that: *"If light-on-dark is requested, draw white on black"*, which directly linked to the content and purpose of this flag.

**Explanations:**

This adds a single new flag to the `Flags` enum in `SkScalerContext`: `kLightOnDark_Flag = 0x8000`. The flag occupies the next available bit after `kNeedsForegroundColor_Flag = 0x4000`.

This flag is what enables the comment added in patch 045 (`SkScalerContext_mac_ct.cpp`, Change 3): *"If light-on-dark is requested, draw white on black."* The flag signals to the glyph rendering pipeline that the rendering context is dark-mode or inverted, so the mask generation should use white-on-black rather than the default black-on-white. Without this enum value declared in the header, any `.cpp` file that checks or sets `kLightOnDark_Flag` would fail to compile.

#### 10.17. `gfx/skia/skia/src/core/SkStrikeCache.cpp`

**Summary:**

The patch modifies `SkStrikeCache::GlobalStrikeCache()`, a function that returns the global font strike cache — a cache for glyph rasterization data used by Skia's text rendering pipeline.

**Taxonomy classification:**
1. Preprocessor branch collapse

In this patch, a runtime branch that depends on a platform capability (`thread_local` storage) is replaced by compile-time elimination of that branch on targets where the capability is absent.

**Relations:**
* `gfx/skia/skia/src/sksl/SkSLDefines.h`

This is where `SKSL_USE_THREAD_LOCAL` flag defined.

**Explanations:**

The patch modifies `SkStrikeCache::GlobalStrikeCache()`, a function that returns the global font strike cache — a cache for glyph rasterization data used by Skia's text rendering pipeline.

Upstream, this function contains a branch: if a specific experimental flag (`gSkUseThreadLocalStrikeCaches_IAcknowledgeThisIsIncrediblyExperimental`) is set, it returns a **thread-local** cache instance rather than the single global one. Thread-local storage (`thread_local`) is a C++11 feature, but its runtime support on legacy macOS is inconsistent — in particular, prior to macOS 10.7's libstdc++ and early clang/libc++ combinations, `thread_local` may not be supported or may require runtime support from `libsupc++` that isn't available.

The patch wraps that entire branch in a `#if !defined(SKSL_USE_THREAD_LOCAL)` guard, and pulls in `src/sksl/SkSLDefines.h` (which presumably defines or undefines `SKSL_USE_THREAD_LOCAL` depending on platform capabilities) to supply that macro.

**Effect**: on legacy macOS targets where `SKSL_USE_THREAD_LOCAL` is not defined (i.e., thread-local storage isn't reliably available), the experimental thread-local cache path is compiled out entirely — the function always returns the single global cache.

#### 10.18. `gfx/skia/skia/src/ports/SkScalerContext_mac_ct.cpp`

**Summary:**

This patch contain 4 distinct changes, some of which interact with each other.
1. Runtime OS version dtection infrastructure
2. Mavericks (10.9) crash guard in `generateMetrics`
3. Double-application bug fix in linear gamma correction
4. `generatePath` early return on Mavericks

**Categories**
1. **Feature gating:** 
* Darwin version detector
* Mavericks guard in `generateMetrics`
* `generatePath` early return on Mavericks
2. Non legacy-specific bugfix
* Linear gamma double-application fix

**Relations:** none

**Explanations:**

This is the richest patch in the `gfx/skia` subtree so far. It contains four distinct changes, some of which interact with each other.

---

**Change 1 — Runtime OS version detection infrastructure (lines 9–46)**

The patch injects a self-contained Darwin kernel version detector, sourced (per the comment) from WebKit's `mac_util.mm`. It calls `uname()` at runtime, parses the major version number from the kernel release string (e.g. `11.x` → Lion, `12.x` → Mountain Lion, `13.x` → Mavericks), and memoizes it in a static. Three predicate functions are then defined: `isLion()`, `isMountainLion()`, and `isMavericks()`.

This is a runtime analogue of compile-time `#ifdef` guards. Instead of conditioning code on `TARGET_OS_MAC` or SDK version macros at compile time, it conditions behavior on the actual running OS version detected at runtime. The distinction matters for your thesis: this is an implicit system layer dependency (the actual OS symbol and behavior set) that cannot be resolved at compile time because the same binary must run across a range of OS versions.

---

**Change 2 — Mavericks (10.9) crash guard in `generateMetrics` (line 64)**

An existing comment already acknowledged a crash in CoreText's `CTFontCreatePathForGlyph` on 10.9 for color fonts. The upstream code guarded against this for color glyphs (`kARGB32_Format`) but still called `CTFontCreatePathForGlyph` for zero-advance non-color glyphs on Mavericks. The patch adds `&& !isMavericks()` to skip the path creation call entirely on 10.9. This is a **feature gating** change driven by a known OS-specific API defect.

---

**Change 3 — Double-application bug fix in linear gamma correction (lines 75–77)**

The upstream code reads pixel channel values, applies a `linear[]` lookup table twice — once to compute `r`, `g`, `b` (which upstream incorrectly reads raw from `addr[x]` without the table), then applies `linear[]` again when composing the output. The patch corrects this: it applies `linear[]` once during channel extraction and then uses the pre-corrected `r`, `g`, `b` values directly in the output expression. This is a straightforward **bug fix** — the linear gamma mapping was being double-applied, which would produce incorrectly darkened glyph rendering. This change is not legacy-specific; it's a correctness fix that happens to be included here.

---

**Change 4 — `generatePath` early return on Mavericks (lines 85–86)**

`generatePath` is unconditionally short-circuited on 10.9 with an early `return false`. This is broader than Change 2: rather than guarding a specific call site, it disables the entire glyph path generation code path on Mavericks. Combined with Change 2, the patch adopts a belt-and-suspenders approach — both the call site in `generateMetrics` and the entire `generatePath` function are guarded. This suggests the crash surface on 10.9 was wide enough that a localized guard wasn't considered sufficient.

---

#### 10.19. `gfx/skia/skia/src/ports/SkTypeface_mac_ct.cpp`

**Summary:**

This patch wraps the entire `getVariationAxes()` block in `if(__builtin_available(macOS 10.13, *))`.

**Taxonomy classification:**
1. **Feature gating:** via SDK availability guard

**Relations:** none

**Explanations:**

This patch is small but makes a precise and important point.

---

**What it does**

`getVariationAxes()` retrieves the variation axes of a font — the named dimensions (weight, width, slant, etc.) along which a variable font can be interpolated. The upstream code has two strategies for this, applied in order of preference:

1. Query `kCTFontVariationAxesAttribute` via `CTFontDescriptorCopyAttribute` — faster because it skips localizing axis names.
2. Fall back to `CTFontCopyVariationAxes`.

The patch wraps the **entire block** — both strategies — in `if (__builtin_available(macOS 10.13, *))`. On anything older than 10.13 (High Sierra), the function simply does nothing and returns whatever `fVariationAxes` was initialized to (effectively null/empty).

---

**Why `__builtin_available` here vs. the `darwinVersion()` runtime detector from patch 045**

This is worth noting explicitly. Patch 045 introduced a hand-rolled `uname()`-based version checker. This patch uses Clang's `__builtin_available`, which is the *compiler-supported* availability check mechanism — it consults the SDK's availability annotations and generates the appropriate `NSProcessInfo` / `dyld` version check at runtime.

The choice of mechanism here likely reflects that `kCTFontVariationAxesAttribute` and the associated descriptor query path have formal SDK availability annotations tied to 10.13, making `__builtin_available` both semantically appropriate and compiler-verifiable. The `darwinVersion()` approach in patch 045 was used for a crash workaround (no SDK annotation captures "crashes on 10.9") — a case where the formal mechanism doesn't apply.

---

**What this means for variable font support**

On macOS 10.7–10.12, `getVariationAxes()` returns empty. This means variable font axis introspection is completely disabled on those targets. Whether this is acceptable depends on whether Firefox's text stack has a fallback for absent variation axes — most likely it degrades gracefully to a static font instance.

---

#### 10.20. `gfx/skia/skia/src/sksl/SkSLDefines.h`

**Summary:**

This patch add the definition logic for `SKSL_USE_THREAD_LOCAL` capaibility flag, which used in `SkStrikeCache.cpp` and `SkSLPool.cpp`.

**Taxonomy classification:**
1. Feature gating

**Relations:**
* `gfx/skia/skia/src/core/SkStrikeCache.cpp`
* `gfx/skia/skia/src/sksl/SkSLPool.cpp`

**Explanations:**

This patch adds the definition logic for `SKSL_USE_THREAD_LOCAL`, the macro that patches 044 and 048 both depend on. The logic is:

- On Darwin (`XP_DARWIN`), pull in `<AvailabilityMacros.h>` to get the SDK's version constants.
- If the minimum deployment target (`MAC_OS_X_VERSION_MIN_REQUIRED`) is below 10.7, or if `MAC_OS_X_VERSION_10_7` is not defined at all, set `SKSL_USE_THREAD_LOCAL 0`.
- Otherwise set it to `1`.

This is a **compile-time capability probe** — it inspects the build environment's declared minimum OS target and produces a single binary flag that downstream code can branch on. The comment references a specific upstream Skia commit (`3d9c73c1`), indicating this is an adaptation of a previously proposed or landed upstream change, applied here in the context of Momiji's target range.

This single definition makes two things possible:
- **Patch 044** (`SkStrikeCache.cpp`): the `#if !defined(SKSL_USE_THREAD_LOCAL)` guard that suppresses the `thread_local` strike cache path.
- **Patch 048** (`SkSLPool.cpp`): the `#if SKSL_USE_THREAD_LOCAL` / `#else` branch that substitutes the `pthread` TLS implementation.

Without this header patch, neither `.cpp` patch has a well-defined macro to branch on — they would fail to compile or silently take the wrong branch.

#### 10.21. `gfx/skia/skia/src/sksl/SkSLPool.cpp`

**Summary:**

This patch wraps entire `thread_local` implementation using `#if SKSL_USE_THREAD_LOCAL` then provides a complete alternative implementation in the `#else` using **POSIX thread-specific storage** (`pthread_key_t` / `pthread_getspecific` / `pthread_setspecific`)

**Taxonomy classification:**
1. **Runtime library/API substitution:**

A modern language or standard library fearture unavailable or unreliable on the target platform is replaced with a lower-level POSIX or platform-stable equivalennt that provides the same semantics.

**Relations:** none

**Explanation:**

This is the most technically substantial patch in the `gfx/skia` subtree so far, and it connects directly back to patch 044.

---

***What it does***

`SkSLPool` manages a per-thread memory pool used by SkSL (Skia's shader language compiler) to allocate IR nodes during compilation. The pool pointer must be thread-local — each thread gets its own pool so shader compilation can proceed concurrently without locking.

Upstream, this is implemented with `thread_local`:

```cpp
static thread_local MemoryPool* sMemPool = nullptr;
```

The patch wraps this entire implementation in `#if SKSL_USE_THREAD_LOCAL`, then provides a complete alternative implementation in the `#else` branch using **POSIX thread-specific storage** (`pthread_key_t` / `pthread_getspecific` / `pthread_setspecific`).

The alternative works as follows: a single `pthread_key_t` is lazily initialized once via a static lambda (a common C++11 once-init idiom), and `get_thread_local_memory_pool` / `set_thread_local_memory_pool` are reimplemented on top of `pthread_getspecific` and `pthread_setspecific` respectively. The external interface — those two functions — is identical in both branches, so all call sites in `SkSLPool.cpp` above and below this block remain untouched.

---

***Why `thread_local` is unavailable on early macOS***

`thread_local` (C++11) requires runtime support from the dynamic linker for TLS slot allocation. On macOS, this is implemented in `libSystem` and `dyld`. On macOS 10.7 and earlier, `dyld`'s TLS implementation has known deficiencies — in particular, `thread_local` for non-trivially-destructible types or in dynamically loaded libraries (`dlopen`-ed `.dylib`s, which Firefox's components are) can fail silently or crash. `pthread` TLS keys (`pthread_key_t`) have been reliably available since POSIX on macOS and carry none of these constraints.

#### 10.22. `gfx/skia/skia/src/utils/mac/SkCreateCGImageRef.cpp`

**Summary:**

API substitution: `CGColorSpaceCopyICCData` (macOS 10.12 and later) with `CGColorSpaceCopyICCProfile`.

**Taxonomy classification:**
1. *Syntax/API backport*: 

**Relations:**
> none

**Explanation:**

This patch exactly resembles what was changed in `gfx/2d/MacIOSurface.cpp` both in terms of how and which API was backported.

#### 10.23. `gfx/skia/skia/src/utils/mac/SkCTFont.cpp`

**Summary:**

This patch contains 3 logically distinct changes, all gated on the same runtime version infrastructure.
1. Duplicate of Darwin version detector (`gfx/skia/skia/src/ports/SkScalerContext_mac_ct.cpp`, change 1)
2. Font loading path in `SkCTFontGetSmoothBehavior`
3. Weight mapping probe loop in `SkCTFontGetDataFontWeightMapping`

**Taxonomy classification:**
1. **Feature gating:**
* Darwin version detector - Mavericks path
* Smooth behaviour font load
* Weight probe loop - Mavericks font load
2. **Syntax/API backport**
* Smooth font behaviour load - Mavericks path
* Weight probe loop - mavericks font load
3. **Preprocessor branch collapse**
* macOS 15 weight clamping removal

**Relations:** none

**Explanations:**

This is the most complex patch in the `gfx/skia` subtree so far. It contains three logically distinct changes, all gated on the same runtime version infrastructure.

---

**Change 1 — Duplicate of the Darwin version detector (lines 9–49)**

The patch injects the same `readVersion()` / `darwinVersion()` / `isLion()` / `isMountainLion()` / `isMavericks()` block from patch 045, verbatim (same `blueboxd` attribution comment, same logic). It also adds a compile-time array-count macro `SK_ARRAY_COUNT` since `std::size()` — used in the upstream code it replaces — requires C++17, which may not be uniformly available.

The duplication rather than sharing (via a header) is a maintenance-quality observation: the same infrastructure appears in at least two translation units, meaning a change to version detection logic would need to be applied in multiple places. This is worth a brief note in your thesis as an artifact of patch-based maintenance rather than a systematic refactoring.

---

**Change 2 — Font loading path in `SkCTFontGetSmoothBehavior` (lines 68–89)**

`SkCTFontGetSmoothBehavior` detects whether CoreText applies subpixel smoothing by rendering a test glyph from an embedded font (`kSpiderSymbol_ttf`) and inspecting the pixel output. Upstream it loads this font via `CTFontManagerCreateFontDescriptorFromData`, which is the modern API for loading fonts from in-memory data.

On Mavericks (10.9), `CTFontManagerCreateFontDescriptorFromData` is either absent or misbehaves for this use case. The patch provides an alternative path: load via `CGDataProviderCreateWithData` → `CGFontCreateWithDataProvider` → `CTFontCreateWithGraphicsFont`. This is the older CG-first loading path, routing through CoreGraphics rather than CoreText to create the font reference.

**Taxonomy**: feature gating with API-level substitution. Same goal (a `CTFontRef` from raw bytes), different API chain selected at runtime based on OS version.

---

**Change 3 — Weight mapping probe loop in `SkCTFontGetDataFontWeightMapping` (lines 101–178)**

This is the most layered change. `SkCTFontGetDataFontWeightMapping` builds a mapping from OS/2 `usWeightClass` values (0–1000) to CoreText's normalized weight floats, by iterating over weight values, synthesizing a font for each, and querying CT's weight trait. Two things are changed:

**3a — macOS 15 weight class clamping logic removed.** Upstream added special handling for macOS 15.0+, which pins `usWeightClass=0` to 1, requiring a workaround using value 11 as the lowest probe, then projecting back to 0 via linear extrapolation. This entire block (the `kLowestUsefulWeightClassValue` constant, the conditional assignment, and the slope extrapolation at the end) is removed. The loop now simply iterates `i * 100` from 0 to 1000 with no special casing. Since Momiji targets 10.7–10.14, macOS 15 behavior is irrelevant — this is a **preprocessor branch collapse** equivalent at the source level, removing dead code for the target range.

**3b — Mavericks font loading substitution in the probe loop.** The same CG-first loading chain from Change 2 is applied here for each iteration on Mavericks, while the non-Mavericks path retains the `CTFontManagerCreateFontDescriptorFromData` chain along with its existing comment about 10.14 font caching behavior (pointer identity affecting cache lookups). The comment is preserved verbatim, which is significant — it documents a known behavioral quirk on ≤10.14 that is handled by always copying data rather than using `CFDataCreateWithBytesNoCopy`.

---

#### 10.24. `gfx/skia/skia/src/utils/mac/SkCTFontCreateExactCopy.cpp`

**Summary:**

This patch changes the condition guarding the CGFont path from:
```cpp
if (IsInstalledFont(baseFont))
```
to:
```cpp
if (nsCocoaFeatures::OnSierraExactly() ||
		(IsInstalledFont(baseFont) && nsCocoaFeatures::OnHighSierraOrLater()))
```

**Taxonomy classification:**
1. Feature gating

**Relation:**
1. `widget/cocoa/nsCocoaFeatures.h`

This is where Cocoa version gating methods (`OnHighSierraOrLater()`, etc.) live.

**Explanations:**

This patch is compact but introduces a new kind of dependency not seen in the previous patches.

`SkCTFontCreateExactCopy` creates an exact copy of a `CTFontRef` at a specified size, preserving all variation axis values. A known issue with `CTFontCreateCopyWithAttributes` on system (installed) fonts is that CoreText may silently substitute a different underlying font, so the code has a branch: for installed fonts, it goes through `CTFontCopyGraphicsFont` (the CGFont API path) to avoid this substitution.

The patch changes the condition guarding this CGFont path from:

```cpp
if (IsInstalledFont(baseFont))
```

to:

```cpp
if (nsCocoaFeatures::OnSierraExactly() ||
		(IsInstalledFont(baseFont) && nsCocoaFeatures::OnHighSierraOrLater()))
```

This means:
- **On Sierra (10.12) exactly**: always use the CGFont path, regardless of whether the font is installed or not.
- **On High Sierra (10.13) and later**: retain the original installed-font check.
- **On anything older than Sierra (10.12-)**: neither condition fires, so the CGFont path is skipped entirely — `CTFontCreateCopyWithAttributes` is used directly for all fonts.

---

***What behavioral problem this addresses***

The condition structure reveals two distinct issues:

1. **Sierra (10.12) exactly**: `CTFontCreateCopyWithAttributes` appears to misbehave for *all* fonts on Sierra, not just installed ones — hence the blanket CGFont path override.
2. **Pre-Sierra (<10.12)**: the CGFont path is avoided entirely, suggesting it either doesn't work correctly or isn't needed on those versions.

Again, neither of these is expressible as a version constraint in any dependency specification — they are empirically discovered behavioral boundaries of CoreText across OS versions.

---

#### Conclusion

**Patches Applied:**

| Patch | File | Category |
|---|---|---|
| 043 | `SkScalerContext.h` | Header extension |
| 044 | `SkStrikeCache.cpp` | Preprocessor branch collapse |
| 045 | `SkScalerContext_mac_ct.cpp` | Feature gating + bug fix |
| 046 | `SkTypeface_mac_ct.cpp` | Feature gating |
| 047 | `SkSLDefines.h` | Capability flag definition |
| 048 | `SkSLPool.cpp` | Runtime library/API substitution |
| 049 | `SkCreateCGImageRef.cpp` | API backport |
| 050 | `SkCTFont.cpp` | Feature gating + dead code elimination |
| 051 | `SkCTFontCreateExactCopy.cpp` | Feature gating + build graph coupling |

**Changes by Category:**

1. Capability flag infrastructure (043, 047)

These two header patches are the enabling layer for the entire subtree. `SkSLDefines.h` defines `SKSL_USE_THREAD_LOCAL` by inspecting `MAC_OS_X_VERSION_MIN_REQUIRED` at compile time — a value injected by the build environment, not the dependency graph. `SkScalerContext.h` adds `kLightOnDark_Flag` to the scaler context flag enum, enabling dark-mode-aware glyph rendering downstream.

Neither patch produces observable runtime behavior on its own; both establish shared vocabulary consumed by implementation files.

2. Thread-local storage substitution (044, 048)

The paired patches address `thread_local` unreliability on pre-10.7 macOS targets and in `dlopen`-loaded libraries. `SkSLDefines.h`'s flag governs both: `SkSLPool.cpp` provides a complete `pthread_key_t`-based alternative implementation when `SKSL_USE_THREAD_LOCAL` is 0; `SkStrikeCache.cpp` suppresses the experimental thread-local cache path entirely under the same condition. The external interface (two accessor functions) is identical in both branches, leaving all call sites untouched.

3. Runtime OS version detection (045, 050)

Two translation units independently embed the same `darwinVersion()` / `isLion()` / `isMountainLion()` / `isMavericks()` infrastructure, sourced from WebKit's `mac_util.mm` and attributed to contributor `blueboxd`. This is the hand-rolled runtime version detection mechanism, used where the incompatibility is not formally annotated in the SDK and therefore cannot be handled by `__builtin_available`.

4. Feature gating across OS versions (045, 046, 050, 051)

Several API call sites are guarded or redirected based on OS version:

- **Mavericks (10.9)**: `CTFontCreatePathForGlyph` crashes for zero-advance glyphs → suppressed in `generateMetrics`; `generatePath` short-circuited entirely. Font loading via `CTFontManagerCreateFontDescriptorFromData` misbehaves → replaced with the CG-first chain (`CGDataProvider` → `CGFont` → `CTFontCreateWithGraphicsFont`) in both `SkCTFontGetSmoothBehavior` and the weight mapping probe loop.
- **High Sierra (10.13)**: `kCTFontVariationAxesAttribute` availability gated with `__builtin_available(macOS 10.13, *)` in `SkTypeface_mac_ct.cpp`; variable font axis introspection silently disabled on older targets.
- **Sierra (10.12) exactly**: `CTFontCreateCopyWithAttributes` misbehaves for all fonts, not just installed ones → blanket CGFont path override in `SkCTFontCreateExactCopy.cpp`.
- **macOS 15 weight clamping**: upstream workaround for a macOS 15.0+ CoreText behavior removed entirely in `SkCTFont.cpp`, as it is irrelevant to Momiji's 10.7–10.14 target range.

5. API backport (049)

`CGColorSpaceCopyICCData` (introduced in macOS 10.13) replaced with its predecessor `CGColorSpaceCopyICCProfile` in `SkCreateCGImageRef.cpp`. Clean substitution — same type contract, no semantic tradeoff, unlike the `MacIOSurface.cpp` constant-to-string downgrade seen in `gfx/2d`.

6. Bug fix (045)

Linear gamma lookup table double-application in `SkScalerContext_mac_ct.cpp` corrected: channel values were passed through `linear[]` twice, producing over-darkened glyph rendering. Not legacy-specific — a correctness fix included alongside the OS-version patches.

7. Build graph coupling (051)

`SkCTFontCreateExactCopy.cpp` calls `nsCocoaFeatures::OnSierraExactly()` and `nsCocoaFeatures::OnHighSierraOrLater()`, crossing the boundary from vendored Skia into Firefox's platform abstraction layer. This introduces a compile-time include path dependency on a Firefox internal header, making Skia within Momiji non-separable from Firefox's platform layer.

---

#### Thesis Relevances

1. The two-layer model demonstrated end-to-end

The `SKSL_USE_THREAD_LOCAL` causal chain is the clearest full-stack illustration of the two-layer model in the entire codebase analyzed so far. The chain is: `config` subtree sets `-mmacosx-version-min=10.7` (build environment B) → compiler populates `MAC_OS_X_VERSION_MIN_REQUIRED` → `SkSLDefines.h` reads it and defines `SKSL_USE_THREAD_LOCAL` → `SkSLPool.cpp` selects the `pthread` implementation. The dependency being resolved (`dyld`'s `thread_local` TLS reliability) lives entirely in the system layer — it has no package version, no dependency graph node, no formal specification. The resolution propagates from B through a preprocessor flag into implementation code.

2. Two mechanisms for the same problem — and why both exist

The subtree uses three distinct OS version detection mechanisms: `darwinVersion()` (hand-rolled runtime), `__builtin_available` (compiler-supported SDK annotations), and `nsCocoaFeatures` (Firefox platform abstraction). Their coexistence is not arbitrary:

- `__builtin_available` applies where the SDK formally annotates availability (e.g. `kCTFontVariationAxesAttribute` on 10.13).
- `darwinVersion()` applies where the incompatibility is empirically discovered and has no SDK annotation (e.g. the `CTFontCreatePathForGlyph` crash on 10.9, the CoreText caching behavior on ≤10.14).
- `nsCocoaFeatures` applies where Firefox's own abstraction already encodes the relevant version logic.

The framework must accommodate all three, because the system layer's implicit dependencies surface through whichever channel happens to carry the relevant information — and that channel is itself a judgment call requiring human knowledge of the codebase.

3. Behavioral defects as the hardest class of system layer dependency

The CoreText font caching behavior on ≤10.14 — where `CFDataGetBytePtr` pointer identity affects cache lookups — is the strongest example in the subtree of a dependency that is structurally undetectable by any automated tool. The API is present. The symbols resolve. The function returns a valid result. The defect only manifests as incorrect behavior (wrong font returned) under specific conditions discoverable only through empirical testing. The mitigation (always copy data via `CFDataCreate`) is correct but non-obvious; it requires understanding CoreText's internal cache implementation well enough to reason about pointer identity semantics. No version constraint, no symbol availability check, no static analysis can derive this.

4. Legacy maintenance introduces new dependencies

Patch 051's `nsCocoaFeatures` coupling illustrates that fixing one system layer problem can introduce a new implicit dependency: Skia now requires Firefox's platform header at compile time, which is invisible to any dependency specification of Skia as a library. This points to a general principle worth stating in the framework: each legacy maintenance patch must be evaluated not only for what system layer dependency it resolves, but for what new dependencies — including build graph couplings — it introduces.

5. Dead code elimination as a maintenance signal

The removal of the macOS 15 weight clamping logic in `SkCTFont.cpp` is a concrete example of the framework's target range parameter doing real work: patches added upstream for newer OS versions become dead code relative to a fixed target tuple, and should be actively removed to reduce maintenance surface. This is the inverse of the usual direction — most patches in the subtree *add* code to handle older OS behavior; this one *removes* code that handles newer OS behavior outside the target range.

### `gfx/thebes` site

#### 10.25-26. `gfx/thebes/CoreTextFontList.h/.cpp`

**Summary:**

This is a substantial paired header-source (`.cpp`/`.h`) patch, with 5 distinct layers of change.

1. Class restructuring and access visibility fix (`.h`)
2. `InitFontListForPlatform` / `InitSharedFontListForPlatform` moved out (`.h` + `.cpp`)
3. Deprecated font family list removed (`.cpp`)
4. OS X 10.11 size-sensitive system font handling added (`.h` + `.cpp`)
5. API substitution: `CTFontManagerRegisterFontURLs` -> `CTFontManagerRegisterFontsForURLs` (`.cpp`)

**Taxonomy classification:**
1. Syntax/API backport
* Reverting newer API with `CTFontManagerRegisterFontsForURLs` (rejecting Mozilla upstream updates)
2. Feature gating
* The `OnLionOrLater()` guard on `CTFontInfo::Load` is straightforward OS-version gating
3. Build graph surgery
* Moving `InitFontListForPlatform` back to `gfxMacPlatformFontList`.
4. OS-version-parameterized behaviour
* The 10.11 size-sensitive system font logic

**Relations:** none

**Explanations:**

This is a substantial patch with five distinct layers of change.

1. Class restructuring and access visibility fix (`.h`)

The empty `gfxMacFontFamily` subclass of `CTFontFamily` is removed. More significantly, `FontFamilyListEntry` (a `typedef` alias) is moved from `private` to `public` scope inside `CoreTextFontList`. This is a functional correctness fix — the alias needs to be accessible to `gfxMacPlatformFontList`, which apparently cannot reach a private `using` declaration from a subclass.

2. `InitFontListForPlatform` / `InitSharedFontListForPlatform` moved out (`.h` + `.cpp`)

Both font-list initialization methods are **commented out and excised** from `CoreTextFontList`, with the header comment explicitly stating they are "moved back to `gfxMacPlatformFontList` for compatibility." This is a class responsibility reassignment — the logic for enumerating available font families (querying Core Text in the parent process, consuming the pre-built list in content processes) is pulled back up the class hierarchy. This almost certainly means a sibling patch in `gfx/thebes` will show these methods appearing in `gfxMacPlatformFontList`.

Closely related: `InitSystemFontNames()` and the helper `CopyRealFamilyName()` are also deleted from `CoreTextFontList.cpp` for the same reason — they are part of the initialization bundle being relocated.

3. Deprecated font family list removed (`.cpp`)

The entire `USE_DEPRECATED_FONT_FAMILY_NAMES` block is deleted — including the compile-time `#define`, the ~120-entry `kDeprecatedFontFamilies` array of Hiragino, Noto, and other fonts hidden by newer macOS SDKs, and all usage sites inside the excised `InitFontListForPlatform` / `InitSharedFontListForPlatform` bodies. Since those methods are being relocated, this list presumably moves with them (or is intentionally dropped as part of legacy scope reduction).

4. OS X 10.11 size-sensitive system font handling added (`.h` + `.cpp`)

This is the most legacy-relevant addition. macOS 10.11 (El Capitan) used **two separate font families** for the system font: a text-size family and a display-size family (used above ~20pt). Modern macOS consolidated this into a single adaptive font.

The patch restores support for this split:

- **New header fields**: `mUseSizeSensitiveSystemFont` (bool flag) and `mSystemDisplayFontFamilyName` (only populated on 10.11).
- **New enum entry**: `kDisplaySizeSystemFontFamily = 2` added to `FontFamilyEntryType`, so the display-size family can be serialized and passed to content processes.
- **`ReadSystemFontList`**: conditionally emits a second `FontFamilyListEntry` for the display family when `mUseSizeSensitiveSystemFont` is true.
- **`FindAndAddFamiliesLocked`**: the `-apple-system` lookup now selects between `mSystemFontFamilyName` and `mSystemDisplayFontFamilyName` based on a size threshold constant `kTextDisplayCrossover = 20.0`. It also branches on whether the shared font list is active *and* whether we're on Catalina or later — on older systems without a shared font list, it falls through to `FindSystemFontFamily` directly.
- **`CTFontInfo::Load`**: gated behind `nsCocoaFeatures::OnLionOrLater()`, confirming that font info loading is simply skipped on 10.6 Snow Leopard.
- **`nsCocoaFeatures.h`** is added as a new `#include`, providing the version-check APIs needed by all the above.

5. API substitution: `CTFontManagerRegisterFontURLs` → `CTFontManagerRegisterFontsForURLs` (`.cpp`)

Inside `ActivateFontsFromDir`, the call to `CTFontManagerRegisterFontURLs` (a newer API) is replaced with `CTFontManagerRegisterFontsForURLs` (the older API). The comment left by i3roly is blunt and expressive about the sentiment. The older API is the one available on the legacy macOS versions Momiji targets — this is the same class of **linker behaviour / API reversion** seen in the `config` subtree's Bug 1770484 reversion, applied here at the font registration layer.

---

#### 10.27-28. `gfx/thebes/gfxCoreTextShaper.h/.cpp` 

**Summary:**

This paired patch focuses on restoring compatibility with older macOS versions which lack `kCTWritingDirectionAttributeName`, a CoreText API for explicitly setting text direction.

**Taxonomy classification:**
1. Feature gating
* New method of gating using `dlsym` probing
* `OnLionOrLater()` guard on `CTFontInfo::Load`

**Relations:** none

**Explanations:**

This patch has one central purpose: restoring compatibility with older macOS versions that lack `kCTWritingDirectionAttributeName`, a Core Text API for explicitly setting text direction. Everything else in the patch is mechanically downstream of that single fact.

1. Runtime symbol probe for `kCTWritingDirectionAttributeName`

The patch introduces a static `sCTWritingDirectionAttributeName` pointer, initialized to `nullptr`, and adds a one-time `dlsym(RTLD_DEFAULT, "kCTWritingDirectionAttributeName")` probe in the `gfxCoreTextShaper` constructor:

```cpp
CFStringRef* pstr = (CFStringRef*)
	dlsym(RTLD_DEFAULT, "kCTWritingDirectionAttributeName");
if (pstr) {
	sCTWritingDirectionAttributeName = *pstr;
}
```

This is the **availability guarding** pattern you just established as a distinct taxonomy category. The symbol is a Core Text string constant introduced in a later macOS version; on older targets it simply doesn't exist. Rather than using `__builtin_available`, i3roly probes it via `dlsym` at runtime — functionally equivalent, and appropriate here since it's a data symbol (a `CFStringRef*`) rather than a function. The result is that `sCTWritingDirectionAttributeName` is non-null on capable systems and null on older ones, and all subsequent logic branches on this single sentinel.

The constant `kCTWritingDirectionOverride` from the SDK header is also replaced by a locally-defined `kMyCTWritingDirectionOverride` with the same bit value (`1 << 1`), and `kCTWritingDirectionAttributeName` is replaced by `sCTWritingDirectionAttributeName` throughout `CreateAttrDict`. This ensures the code compiles cleanly even when the SDK constant is unavailable.

2. Fallback direction control via Unicode bidi wrap characters

When `sCTWritingDirectionAttributeName` is null (old OS), the modern approach of passing a direction attribute to Core Text is unavailable. The fallback reinstates an older technique: **wrapping the text string itself with Unicode bidi control characters** before handing it to Core Text.

The logic in `ShapeText` is now split on the sentinel:

- **Modern path** (`sCTWritingDirectionAttributeName` non-null): behaves exactly as before — direction attribute dict, no string modification, `startOffset = 0`.
- **Legacy path** (null): determines whether a bidi wrap is needed (`bidiWrap` flag), then prepends `U+202D U+0020` (LTR override + space) or `U+202E U+0020` (RTL override + space) and appends `U+0020 U+002E U+202C` (space + period + pop directional formatting) to a new `CFMutableStringRef`. The `startOffset` variable records the number of prepended characters so that downstream index arithmetic can compensate.

A new `CreateAttrDictWithoutDirection()` method is added and used in the legacy path — it creates an attribute dictionary with only the font attribute, omitting the direction key entirely.

3. `startOffset` propagated through glyph index arithmetic

Since the legacy path physically shifts the text content inside the `CFString` by `startOffset` characters, every place that maps Core Text run string indices back to the original text buffer must subtract `startOffset`. This affects:

- The run-skip guard in the run iteration loop (filtering out runs that correspond to the prepended/appended wrap characters).
- The single-character special-case check inside the fallback font substitution path (`aText[range.location - startOffset]`).
- The call to `SetGlyphsFromRun`, which now receives `startOffset` as an additional `int32_t` parameter — hence the signature change in both `.h` and `.cpp`.
- Inside `SetGlyphsFromRun` itself: the bounds check on `stringRange`, and both the LTR and RTL computations of `baseCharIndex` / `endCharIndex`, all subtract `aStringOffset`.

4. `CTFontInfo::Load` guard (cross-reference)

Worth noting that the `OnLionOrLater()` guard on `CTFontInfo::Load` seen in the previous patch belongs to the same compatibility push — this patch is its natural companion, handling the shaping layer in the same way that patch handled font enumeration.

#### 10.29. `gfx/thebes/gfxFontEntry.cpp`

**Summary:**

This patch addresses solely one specific incompatibility: `thread_local` storage class was unavailable until macOS 10.6.

**Taxonomy classification:**
1. Runtime library/API substitution

This patch is structurally similar to C++17 standard library substitution in the `config` subtree — a language/runtime feature unavailable on the legacy target is replaced by a lower-level but semantically equivalent mechanism. The distinguishing feature is that the substituted construct (`thread_local`) is a **language storage class**, not an API call, so neither `__builtin_available` nor `#if MAC_OS_X_VERSION_MIN_REQUIRED` is the right instrument — the correct guard is a build-system-defined feature macro, which is itself an instance of the project-layer mechanism multiplicity you identified in the previous discussion. This patch is therefore another data point supporting the claim that **the boundary between toolchain-verifiable and human-verifiable compatibility work is not sharp.**

**Relations:** none

**Explanations:**

1. The problem

Mozilla's code uses a `thread_local` variable `tl_grGetFontTableCallbackData` to pass a `gfxFontEntry*` pointer into Graphite font sandbox callbacks without going through the sandboxed `appFaceHandle` argument (which is intentionally excluded for security reasons). `thread_local` as a storage class specifier requires both compiler and OS runtime support — on macOS 10.6, the latter is absent.

2. The fix: POSIX thread-local storage as fallback

The patch introduces a compile-time branch on a feature macro `GFX_FONT_USE_THREAD_LOCAL` (presumably defined for 10.7+ in the build configuration):

**When the macro is absent (10.6):** a classic POSIX TLS implementation is substituted — `pthread_key_t lckey_fontEntry` with a `pthread_once` initializer, a `make_key()` function, and a `tl_grGetFontTableCallbackData()` accessor function that calls `pthread_getspecific`. The variable that was a plain pointer becomes a function call with the same name at all usage sites.

**When the macro is present (10.7+):** the original `static thread_local gfxFontEntry* tl_grGetFontTableCallbackData = nullptr` is preserved verbatim, just relocated from its original position to within the `#else` branch.

The three usage sites — setting the pointer before `gr_make_face_with_ops`, clearing it after, and reading it inside the `GrGetTable` callback — are all wrapped in matching `#ifdef` / `#else` guards to call `pthread_setspecific` / `pthread_getspecific` on 10.6 and use the `thread_local` variable directly on 10.7+.

One subtle asymmetry worth noting: on the 10.6 path, `tl_grGetFontTableCallbackData` is never explicitly reset to null after `gr_make_face_with_ops` or `gr_face_destroy` completes — the `pthread_setspecific(lckey, nullptr)` calls are absent (only the `set to this` calls are present). This may be intentional — POSIX TLS values survive until the thread exits or are explicitly overwritten — or it may be a minor oversight in the port.

#### 10.30-31. `gfx/thebes/gfxGraphiteShaper.cpp/.h`

**Summary:**

This patch is the direct sibling of the `gfxFontEntry.cpp` patch (056), which moved macro definition to the header, 10.6 TLS fallback for `tl_GrGetAdvanceData` and call sites in `gfxGraphiteShaper.cpp`.

**Taxonomy classification:**
1. Runtime library/API substitution

This patch shares the same category as patch `056`: Runtime library/API substitution at the language/compiler level, compile-time selected.

**Relations:** none

**Explanations:**

This patch is the direct sibling of the `gfxFontEntry.cpp` patch (056), and together they form a matched pair. The problem and mechanism are identical, applied here to the Graphite shaper's own TLS variable.

The Graphite font engine uses a sandboxed callback `GrGetAdvance` to retrieve glyph advance widths during shaping. Like the `GrGetTable` callback in `gfxFontEntry`, it needs access to a `CallbackData*` pointer that cannot be passed through the sandboxed call boundary. Mozilla's solution is `thread_local` storage; Momiji must provide a POSIX fallback for 10.6. In detail:

**Macro definition moved to the header.** The `GFX_FONT_USE_THREAD_LOCAL` macro (0 on 10.6, 1 on 10.7+) is defined here in `gfxGraphiteShaper.h`, based on the SDK's `MAC_OS_X_VERSION_MIN_REQUIRED` check. Since `gfxFontEntry.cpp` (patch 056) consumes the same macro, this header is implicitly the canonical definition point for both files — both shapers share the same compile-time branch via this single macro.

The `pthread_key_t` and `pthread_once_t` statics for *both* shapers are declared here too: `lckey_shaper` / `lckey_shaper_once` for the Graphite shaper, and `lckey_fontEntry` / `lckey_fontEntry_once` for the font entry callbacks seen in patch 056.

**10.6 TLS fallback for `tl_GrGetAdvanceData`.** In the header, when `GFX_FONT_USE_THREAD_LOCAL` is 0, the `thread_local CallbackData* tl_GrGetAdvanceData` static member is replaced with a static method of the same name. The method wraps `pthread_once` + `pthread_getspecific`, following the same lazy-initialisation pattern as in `gfxFontEntry`. Notably, it allocates a `CallbackData` on first access if none exists (`new struct CallbackData()`), whereas the font entry version returns `nullptr` in that case — reflecting that the Graphite shaper always needs a valid callback data object on the thread, not just a nullable pointer.

**Call sites in `gfxGraphiteShaper.cpp`.** Three sites are guarded:

- The `thread_local` definition in the `.cpp` file is wrapped in `#ifdef GFX_FONT_USE_THREAD_LOCAL` so it is only emitted on 10.7+.
- In `GrGetAdvance` (the callback), the read `tl_GrGetAdvanceData` (variable) becomes `tl_GrGetAdvanceData()` (function call) on 10.6.
- In `ShapeText`, the set-before / clear-after pattern around the sandbox invoke becomes `pthread_setspecific(lckey_shaper, &mCallbackData)` on 10.6. There is no explicit `pthread_setspecific(lckey_shaper, nullptr)` cleanup after the sandbox call — the `MakeScopeExit` RAII cleanup is simply dropped on the 10.6 path, which is safe for the same reason as in 056: the key is per-thread and the value will be overwritten on the next shaping call.

---

#### 10.32. `gfx/thebes/gfxMacFont.cpp`

**Summary:**

The constant `kCTFontOrientationDefault` is replaced with `kCTFontDefaultOrientation` in the call to `CTFontGetAdvancesForGlyphs`.

**Taxonomy classification:**
1. Syntax/API backport

**Relations:** none

**Explanations:**

This is a minimal single-line patch with a clear cause. The constant `kCTFontOrientationDefault` is replaced with `kCTFontDefaultOrientation` in the call to `CTFontGetAdvancesForGlyphs`.

Both constants represent the same semantic value — the default (horizontal) font orientation — but they come from different SDK generations. `kCTFontDefaultOrientation` is the original name present in the Core Text API on older macOS versions including 10.6 and 10.7. `kCTFontOrientationDefault` is a renamed alias introduced in a later SDK as part of an Apple naming convention update for the `CTFontOrientation` enum.

When building against the legacy target, the newer name either does not exist in the SDK headers or triggers a deprecation/availability error, so the patch reverts to the older name that compiles cleanly across the full supported range.

#### 10.33-34. `gfx/thebes/gfxMacPlatformFontList.h/.mm`

**Summary:**

This is a large, complex patch which does the following:
1. Receiving the relocated initialization methods (`.h` + `.mm`)
2. `InitSystemFontNames()` - verson-branched system font resoltion (`.mm`)
3. `InitFontListForPlatform()` - full font enumeration with OS awareness (`.mm`)
4. `InitSharedFontListForPlatform()` - shared memory font list construction (`.mm`)
5. Telemetry header substitution (`.mm`)

**Taxonomy classification:**
1. Build graph surgery

The move of `InitFontListForPlatform` out of `CoreTextFontList` and into `gfxMacPlatformFontList` is itself a legacy maintenance intervention at the architectural level. Mozilla's upstream refactoring had consolidated platform-specific logic into the base class in a way that broke on legacy targets. The patch surgically reverses that consolidation.

2. OS-version-parameterized behavior

The entire function is a decision tree over `(os, osver)` values drawn from your system layer. The fact that the correct system font family name, the correct lookup strategy, and the correct IPC serialisation format all vary by OS version illustrates concretely why the target tuple's `osver` component cannot be abstracted away in the dependency model. It must remain an **explicit parameter**.

**Relations:** none

**Explanation:**

This is the largest and most architecturally significant patch in the `gfx/thebes` subtree so far. It is the direct counterpart to patch 052/053: what was excised from `CoreTextFontList` lands here, substantially expanded and adapted for legacy compatibility.

---

1. Receiving the relocated initialization methods (`.h` + `.mm`)

As foreshadowed in patch 052/053, `InitFontListForPlatform()`, `InitSharedFontListForPlatform()`, and `InitSystemFontNames()` are now declared in `gfxMacPlatformFontList` and implemented in the `.mm`. This completes the class responsibility reassignment begun in that earlier patch. The reason the methods live here rather than in `CoreTextFontList` is that their correct implementation requires Objective-C (`NSFont`, `NSString`, `nsAutoreleasePool`) and version-specific macOS logic — concerns that belong in the platform-specific subclass, not the Core Text abstraction layer.

---

2. `InitSystemFontNames()` — version-branched system font resolution (`.mm`)

This is a full reimplementation of the deleted method from `CoreTextFontList.cpp`. The key addition is `GetRealFamilyName(NSFont*)`, a helper that resolves the *actual* font family name from an `NSFont` object by routing through the PostScript name via Core Graphics and back through Core Text. This detour is necessary because `[NSFont familyName]` returns internal "meta" names like `.AppleSystemUIFont` on newer macOS, which cannot be used as lookup keys. It also includes a special-case workaround for macOS 10.9 Mavericks, where `.LucidaGrandeUI` must be manually remapped to `LucidaGrande`.

`InitSystemFontNames()` itself branches on three OS version tiers:

- **Pre-El Capitan (10.10 and below):** `mUseSizeSensitiveSystemFont = false`. Single system font family.
- **El Capitan through Mojave (10.11–10.14):** `mUseSizeSensitiveSystemFont = true` if querying at 128pt returns a *different* family than at 0pt. If they match (i.e., the split font behaviour isn't present despite the OS version), the flag is forced false. The display-size family name is stored in `mSystemDisplayFontFamilyName`.
- **Catalina and later (10.15+):** `mUseSizeSensitiveSystemFont = false`. Additionally, a `CTFontFamily` in-process entry is pre-registered in `mFontFamilies` for the system font, because Catalina's hidden system fonts may be entirely absent from the shared font list.

The DEBUG block cross-checks that all the different `NSFont` system font accessors (`systemFont`, `boldSystemFont`, `controlContentFont`, `menuBarFont`, `toolTipsFont`) resolve to the same family and emits a warning if they diverge.

---

3. `InitFontListForPlatform()` — full font enumeration with OS-version awareness (`.mm`)

The parent process path enumerates `CTFontManagerCopyAvailableFontFamilyNames()` and optionally supplements it with the deprecated font family list (now re-homed here after being deleted from `CoreTextFontList.cpp`). The `USE_DEPRECATED_FONT_FAMILY_NAMES` block is identical to what was removed in patch 053 — confirming it was relocated, not discarded.

The content process path (consuming the IPC font list from the chrome process) now handles three `entryType` cases rather than two, adding `kDisplaySizeSystemFontFamily` to restore `mSystemDisplayFontFamilyName` and set `mUseSizeSensitiveSystemFont = true`. Note the entry type enum here uses `kTextSizeSystemFontFamily = 1` (renamed from the `kSystemFontFamily` in `CoreTextFontList`), making the naming more precise.

There is also a Catalina-specific skip: when receiving the font list from the chrome process, if the family name matches either system font family name and we're on Catalina+, the entry is skipped — because `InitSystemFontNames()` already pre-registered it in-process.

---

4. `InitSharedFontListForPlatform()` — shared memory font list construction (`.mm`)

Substantially the same as the version deleted from `CoreTextFontList.cpp`, with the deprecated font family list re-integrated. The `NSString`-based iteration (`for (NSString* familyName in ...)`) replaces the CF-based loop, consistent with this being Objective-C++ (`.mm`) rather than plain C++.

---

5. Telemetry header substitution (`.mm`)

`mozilla/Telemetry.h` is replaced with `mozilla/glean/GfxMetrics.h`. This reflects Mozilla's ongoing migration from its legacy Telemetry system to the Glean metrics framework. A matching timer call (`glean::fontlist::dwritefont_delayedinit_total.Measure()`) appears in `InitFontListForPlatform()`. This is a straightforward **API substitution** within Mozilla's own internal tooling, not a legacy platform concern.

#### 10.35. `gfx/thebes/gfxMacUtils.cpp`

**Summaries:**

Adds local definition for three `CFStringRef` constants which do not exist in older macOS SDKs.

**Taxonomy classification:**
1. API availability guard

**Relations:** none

**Explanations:**

A small but categorically precise patch. It adds local definitions for three `CFStringRef` constants that do not exist in older macOS SDKs.

Three `kCVImageBufferTransferFunction_*` constants used in the `CFStringForTransferFunction` switch are conditionally defined as local string literals when the SDK version predates macOS 10.13:

- `kCVImageBufferTransferFunction_sRGB` → `"IEC_sRGB"`
- `kCVImageBufferTransferFunction_SMPTE_ST_2084_PQ` → `"SMPTE_ST_2084_PQ"`
- `kCVImageBufferTransferFunction_ITU_R_2100_HLG` → `"ITU_R_2100_HLG"`

These are CoreVideo colour transfer function identifier strings introduced in the High Sierra (10.13) SDK. When building against an older SDK where these symbols are not declared, the `switch` statement fails to compile. The patch injects the correct string values directly, guarded by `#if !defined(MAC_OS_VERSION_10_13) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_13`.

#### 10.36. `gfx/thebes/gfxPlatform.cpp`

**Summaries:**
Additional inclusion of `nsCocoaFeatures.h`

**Taxonomy classification:**
1. Feature gating

**Relations:** none

**Explanations:**

Simply include additional `nsCocoaFeatures.h` for feature gating purposes.

#### 10.37. `gfx/thebes/gfxPlatformMac.cpp`

**Summaries:**

There are two independent changes in this patch:
1. `CGColorSpaceCopyICCData` -> `CGColorSpaceCopyICCProfile`
2. `CheckVariationFontSupport()` - feature gate for variable fonts

**Taxonomy classification:**
1. Syntax/API backport:
* `CGColorSpaceCopyICCData` (modern) -> `CGColorSpaceCopyICCProfile` (legacy)
2. Feature gating
* Specific sub-type worth noting: the gate is not "this API doesn't exist below X" but **"this API is unreliable below X."**

**Relations:** none

**Explanations:**

1. `CGColorSpaceCopyICCData` → `CGColorSpaceCopyICCProfile`

Mozilla's upstream code calls `CGColorSpaceCopyICCData`, the modern API for extracting ICC colour profile data from a `CGColorSpaceRef`. This function was introduced in macOS 10.12. On older targets it does not exist, so the patch substitutes `CGColorSpaceCopyICCProfile`, the original API available since macOS 10.5 that returns the same data as a `CFDataRef`.

This is **API reversion** — the same category as the `CTFontManagerRegisterFontsForURLs` substitution in patch 052/053 and the dylib loading reversion in the `config` subtree. Mozilla adopted the newer API as the old one was deprecated; Momiji reverts to the old API that remains available across the full target range.

---

2. `CheckVariationFontSupport()` — feature gate for variable fonts

Mozilla's upstream unconditionally returns `true`, enabling variable/variation font support on all macOS. The patch replaces this with `nsCocoaFeatures::OnHighSierraOrLater()`, gating the feature to macOS 10.13+.

The comment is explicit about the reasoning: the Core Text variation font APIs existed before 10.13, but were known to be buggy. Safari itself drew the same line. This is therefore not an API *absence* problem but a quality/correctness problem — enabling the feature on older OS versions would produce broken output even though it would compile and run.

This is **feature gating**, but of a specific sub-type worth noting: the gate is not "this API doesn't exist below X" but "this API is unreliable below X." The distinction matters for the framework because it represents a case where the system layer *technically* satisfies the dependency but does so incorrectly — a qualitative incompatibility rather than a binary presence/absence one.

---

#### Conclusion


| # | File(s) | Primary change |
|---|---------|---------------|
| 052/053 | `CoreTextFontList.h/.cpp` | Class restructuring, method relocation, OS 10.11 system font split, API reversion |
| 054/055 | `gfxCoreTextShaper.h/.cpp` | `dlsym` availability guard, bidi-wrap fallback for pre-10.6 CT |
| 056 | `gfxFontEntry.cpp` | `thread_local` → `pthread_key` substitution (font table TLS) |
| 057/058 | `gfxGraphiteShaper.h/.cpp` | `thread_local` → `pthread_key` substitution (advance data TLS) |
| 059 | `gfxMacFont.cpp` | Enum constant rename backport |
| 060/061 | `gfxMacPlatformFontList.h/.mm` | Full init method relocation + OS-version-branched system font resolution |
| 062 | `gfxMacUtils.cpp` | Compile-time constant injection for missing SDK declarations |
| 063 | `gfxPlatformMac.cpp` | API reversion + variation font quality gate |

---

*Changes by taxonomy category*

**Syntax backport**
`kCTFontOrientationDefault` for `kCTFontOrientationDefault` (059) — purely nominal substitution, zero behavioural change.

**API reversion**
`CTFontManagerRegisterFontsForURLs` (052/053) and `CGColorSpaceCopyICCProfile` (063) both revert Mozilla's adoption of newer macOS APIs to older equivalents that compile and function correctly across the full target range. Both follow the same pattern as the `config` subtree's Bug 1770484 reversion.

**Availability guarding — runtime (dlsym)**
`kCTWritingDirectionAttributeName` (054/055): the symbol's runtime presence is uncertain, so a `dlsym` probe gates whether the modern or fallback shaping path runs. Distinct from compile-time guarding because the uncertainty is resolved only at runtime.

**Availability guarding — compile-time (constant injection)**
`kCVImageBufferTransferFunction_*` constants (062): the SDK does not declare these symbols under old deployment targets, but their values are stable string literals. Local definitions are injected under a preprocessor guard. No runtime uncertainty — the guard is resolved entirely at compile time.

**Feature gating**
`CTFontInfo::Load` gated on `OnLionOrLater()` (052/053); variation font support gated on `OnHighSierraOrLater()` (063); `bidiWrap` path in `ShapeText` (054/055). All are runtime OS-version branches over behaviour, with no build-time implications.

**Runtime library/API substitution**
`thread_local` → `pthread_key_t` + accessor function, applied twice as a coordinated unit across `gfxFontEntry.cpp` (056) and `gfxGraphiteShaper.h/.cpp` (057/058), sharing a single macro definition point.

**Build graph surgery / class responsibility reassignment**
`InitFontListForPlatform`, `InitSharedFontListForPlatform`, `InitSystemFontNames`, and `CopyRealFamilyName` excised from `CoreTextFontList` (052/053) and re-implemented in `gfxMacPlatformFontList` (060/061). Mozilla's upstream refactoring had collapsed platform-specific logic into the base class; the patch reverses that consolidation because the correct implementations require Objective-C and OS-version branching that cannot live in the Core Text abstraction layer.

**OS-version-parameterised behaviour (system font split)**
The 10.11–10.14 dual system font family logic threads through four patches (052/053, 060/061) as a coordinated unit: the field declarations, the `kDisplaySizeSystemFontFamily` enum entry, IPC serialisation, and the size-threshold resolution in `FindAndAddFamiliesLocked` all form a single cross-file feature.

---

#### Taxonomy refinement yielded by this subtree

The most important conceptual output of this subtree is the **split of availability guarding into two subcategories**:

- *Runtime availability guarding* (`dlsym`): the symbol may or may not exist in the process's loaded libraries; a probe is required at runtime. The binary contains both paths.
- *Compile-time availability guarding* (constant injection): the SDK header simply omits the declaration; the value is a known constant that can be hardcoded. Resolved entirely by the preprocessor; no runtime branching.

The distinguishing criterion is the locus of uncertainty — dynamic linker at runtime vs. SDK headers at compile time.

---

#### Thesis relevance

**1. Co-occurrence of multiple change categories in a single patch is the norm, not the exception.**
The `CoreTextFontList` pair (052/053) simultaneously contains API reversion, feature gating, class restructuring, and OS-version-parameterised behaviour. The `gfxCoreTextShaper` pair (054/055) combines runtime availability guarding and feature gating in a causally linked structure — the guard determines which behavioural branch is taken. The framework must be able to classify patches as multi-category and articulate the relationships between co-occurring categories, not just assign a single label.

**2. Cross-file coordination is a unit of analysis.**
The `thread_local` substitution (056, 057/058) spans three files but constitutes one logical intervention: a single system-layer deficit (`thread_local` absent on 10.6) whose resolution is distributed across multiple translation units sharing one macro definition. Similarly, the system font split logic spans four patches. The framework should treat these coordinated units as single interventions at the analytical level even when they appear across multiple files.

**3. Soft deficits are definitionally outside the scope of graph-theoretic formalisation.**

The variation font quality gate (063) introduces the category of qualitative implementation failure — the symbol is present and links, but the implementation is wrong. This is not detectable by any static analysis over symbol presence. The knowledge that the variation font API is "buggy before 10.13" is empirical, cross-project (Safari drew the same line), and human-carried. It cannot be recovered from the dependency graph alone. This sharpens the human-in-the-loop argument: the necessity of human judgment is not merely a practical limitation but a structural one for this entire class of deficit.

**4. The `osver` component of the target tuple is irreducibly load-bearing.**
`InitSystemFontNames()` (060/061) is the clearest single-function demonstration in the entire codebase so far of how deeply `osver` penetrates correct behaviour. The right font family name, the right lookup strategy, the right IPC serialisation format, and the right in-process pre-registration decision all vary by OS version in ways that cannot be abstracted away. This empirically validates the thesis claim that every dependency graph has open boundaries to the system layer parameterised by the target tuple, and that `osver` is a genuine free variable, not a constant.

**5. Class hierarchy restructuring as a legacy maintenance intervention.**
The relocation of init methods from `CoreTextFontList` to `gfxMacPlatformFontList` is a form of build graph surgery applied at the object-oriented architecture level. Mozilla's upstream refactoring assumed a platform configuration (modern macOS, pure C++) that does not hold on legacy targets. The patch reverses the abstraction boundary. This is worth noting in the thesis as evidence that legacy maintenance pressure can propagate upward into architectural decisions, not just localised code changes.


### `gfx/wr` site

### 10.38. `gfx/wr/wr_glyph_rasterizer/src/platform/macos/font.rs`

**Summary:**

This patch does the following to the WebRender glyph rasterizer's macOS font backend:
1. Core architectural shift: `CTFontDescriptor` -> `CGFont`
2. Font loading rewritten around `CGDataProvider` and `CGFont::from_data_provider`
3. `add_native_font` resolution path changed
4. `new_ct_font_with_variations` completely rewritten

**Taxonomy classification:**
1. Runtime library/API substitution: swapping a higher-level API (`CTFontDescriptor` / CoreText font manager) for a lower-level one (`CGFont` / CoreGraphics) to avoid version-gated entry points
2. Linker behaviour modification: 
* The manual `extern "C"` FFI block for `CTFontCopyVariationAxes` and the five `kCTFontVariationAxis*` constants is a direct instance of explicit symbol procurement from a framework, bypassing the Rust crate's own bindings — the same pattern as other symbol-declaration patches in Momiji.
* The variation axis clamping and default-skipping logic is a functional correctness addition that falls out of doing the work manually rather than delegating to a CoreText descriptor copy — not purely a legacy fix, but a consequence of taking ownership of the lower-level path.

**Relations:** none

**Explanation:**

This patch is entirely contained in `gfx/wr/wr_glyph_rasterizer/src/platform/macos/font.rs` — the WebRender glyph rasterizer's macOS font backend. 

1. Core architectural shift: `CTFontDescriptor` → `CGFont` as the primary font handle

The central change is replacing the `FontContext`'s internal map from `FastHashMap<FontKey, CTFontDescriptor>` to `FastHashMap<FontKey, CGFont>`. This reroutes the entire font loading and instantiation pipeline through a lower-level API.

**Why this matters:** `CTFontDescriptor` is a CoreText abstraction representing a font *description* (not a loaded font); it was being used to construct sized, varied CTFont instances at rasterization time. `CGFont` is a CoreGraphics construct that represents a loaded font more directly. The shift is from a descriptor-based lazy approach to a more concrete, data-backed one.

2. Font loading rewritten around `CGDataProvider` + `CGFont::from_data_provider`

In `add_raw_font` (loading fonts from raw bytes), the old code used `CFData::from_arc(bytes)` and then called `font_manager::create_font_descriptor_with_data()` — a CoreText font manager function. The replacement constructs a `CGDataProvider` from the byte buffer and calls `CGFont::from_data_provider()` directly. This bypasses the CoreText font manager entirely for raw font data, relying instead on CoreGraphics.

3. `add_native_font` resolution path changed

For fonts referenced by name (native fonts), the old code built a `CTFontDescriptor` from the resolved `CFString` name. The replacement calls `CGFont::from_name(&cf_name).unwrap()` — again going through CoreGraphics rather than CoreText descriptors.

4. `new_ct_font_with_variations` completely rewritten

This is the most substantial change. The old implementation:
- Created a `CTFont` from a descriptor via `core_text::font::new_from_descriptor`
- Built a variation dict of `(CFNumber tag → CFNumber value)` pairs
- Called `copy_descriptor().create_copy_with_attributes()` on the font descriptor — a CoreText-level variation mechanism

The new implementation:
- Creates a `CTFont` from a `CGFont` via `core_text::font::new_from_CGFont`
- Calls `CTFontCopyVariationAxes()` via a raw `extern "C"` FFI block linked against `ApplicationServices.framework`
- Iterates the axis array manually, extracting identifier, name, min, max, and default values — then **clamps** the variation value to the axis bounds and skips it if it equals the default
- Builds a `(CFString name → CFNumber value)` variation dict (keyed by *name*, not numeric tag)
- Calls `cg_font.create_copy_from_variations()` and then `new_from_CGFont_with_variations()` — a two-stage process that applies variations at the CGFont level first, then wraps into a CTFont

The FFI block manually declares five `kCTFontVariationAxis*` constants (`IdentifierKey`, `NameKey`, `MinimumValueKey`, `MaximumValueKey`, `DefaultValueKey`) rather than pulling them from the `core_text` Rust crate.

---

*Why This Pattern Exists on Legacy macOS*

The old `CTFontDescriptor`-based path — specifically `create_font_descriptor_with_data` and `create_copy_with_attributes` for variations — relies on CoreText APIs that either behave differently or are unavailable on older macOS versions (10.7–10.11 in particular). The `CGFont`-based path is considerably older: `CGFont` and `CGDataProvider` are available going back to Mac OS X 10.0, and `CGFont::from_name` is equally ancient. By rerouting through CoreGraphics, the patch avoids CoreText font manager entry points that may not exist or may silently misbehave on legacy targets.

The manual FFI block for `CTFontCopyVariationAxes` and the `kCTFontVariationAxis*` constants is also significant: rather than depending on a version of the `core_text` Rust crate that may have wrapped these symbols in a way that fails to link on older systems, the patch declares them directly from `ApplicationServices.framework` with explicit linkage. This is the same pattern seen in other Momiji patches — when a Rust binding's version assumptions conflict with the target system's available symbols, the fallback is a raw `extern "C"` declaration against the framework directly.

---

### Thesis relevance

This patch is strong empirical evidence for the implicit dependency layer concept in the framework. The explicit dependency graph says: depends on `core_text`, `core_graphics`, `core_foundation`. What the graph doesn't say — can't say, structurally — is:

* which symbols within those frameworks are available at (`macos`, `x86_64`, `10.7`, `rustc-X.Y`),
* which crate versions wrap which framework symbols,
* which framework-level memory management conventions the code relies on,
* that the correct fix involves dropping to raw FFI against `ApplicationServices.framework`

All of that knowledge lives in the system layer, parameterized by the target tuple. The patch is the human-in-the-loop intervention that bridges the gap — and the extern "C" block is the most direct signature of that: it's the point where the developer reached past the entire Rust dependency graph and addressed the system layer directly.

## 11. `image` subtree

### Files affected:
1. `image/decoders/icon/mac/nsIconChannelCocoa.mm`

### 11.1. `image/decoders/icon/mac/nsIconChannelCocoa.mm`

**Summary:**
This patch includes 2 changes:
1. API substitution on the graphics context factory call
2. Feature gating the `drawInRect:` call

**Taxonomy classification:**
1. Syntax/API backport: `graphicsContextWithGraphicsPort:` substitution
2. Feature gating: `@available` guard on `drawInRect:`

**Relations:** none

**Explanation:**

Two changes, both in `nsIconChannelCocoa.mm` — the Cocoa-side implementation of Firefox's icon channel (the subsystem that decodes and supplies app/file icons on macOS).

***Change 1 — API substitution on the graphics context factory call (line 9–11)***

`graphicsContextWithCGContext:ctx flipped:NO` is replaced with `graphicsContextWithGraphicsPort:ctx flipped:NO`.

`graphicsContextWithCGContext:` was introduced in macOS 10.10 (Yosemite) as the modern replacement for the older `graphicsContextWithGraphicsPort:`. On 10.7–10.9 it simply does not exist. This is a direct **syntax/API backport**: the call is swapped back to the pre-10.10 API so the method can be resolved at runtime on those older OS versions.

***Change 2 — Feature-gating the `drawInRect:` call (lines 13–17)***

`[iconImage drawInRect:...]` is wrapped in an `@available(macOS 10.9, *)` guard.

The `NSImage -drawInRect:` signature that Mozilla uses here has behavioural differences on older OS versions. Guarding it at 10.9+ means the draw step is silently skipped on 10.7–10.8. This is a **defensive feature gate** — the icon may not render on those oldest targets, but it prevents a crash or undefined behaviour.

---

### Thesis relevance

This patch is a clean illustration of the two-layer model at the API level: `graphicsContextWithCGContext:` exists in the *system layer* only from 10.10 onward, and is invisible to the project layer on earlier targets. The patch resolves this by substituting the equivalent pre-10.10 symbol — analogous to what was seen in `accessible/mac` with Objective-C subscript syntax. The feature gate on `drawInRect:` is an acknowledgment that full fidelity cannot be guaranteed across all target OS versions; the framework must account for this graceful degradation trade-off explicitly.

## 12. `ipc` subtree

### Files affected:
* `ipc/app/moz.build`
* `ipc/chromium/src/base/process_util.h`
* `ipc/chromium/src/base/process_util_mac.mm`
* `ipc/chromium/src/base/process_util_posix.cc`
* `ipc/chromium/src/chrome/common/mach_ipc_mac.cc`
* `ipc/glue/GeckoChildProcessHost.cpp`

### 12.1. `ipc/app/moz.build`

**Summary:**

This patch commented out 2 lines:

```python
# BEFORE (active):
if CONFIG["OS_ARCH"] == "Darwin":
	LDFLAGS += ["-Wl,-rpath,@executable_path/../../../"]

# AFTER (commented out):
#if CONFIG["OS_ARCH"] == "Darwin":
#    LDFLAGS += ["-Wl,-rpath,@executable_path/../../../"]
```

**Taxonomy classification:**
1. **Linker behaviour reversion**

**Relations:**
1. `config/rules.mk`: same mechanism (linker flag modification/revocation), same motivation (hurts backward compatibility)

**Explanation:**

This patch commented out 2 lines:

```python
# BEFORE (active):
if CONFIG["OS_ARCH"] == "Darwin":
	LDFLAGS += ["-Wl,-rpath,@executable_path/../../../"]

# AFTER (commented out):
#if CONFIG["OS_ARCH"] == "Darwin":
#    LDFLAGS += ["-Wl,-rpath,@executable_path/../../../"]
```

The commit comment explicitly names the upstream Mozilla changeset being reverted and gives the reason: *"it hurts backwards compatibility"*.

Technically: the `-rpath` flag tells the dynamic linker where to search for shared libraries at runtime, using a path relative to the executable itself (`@executable_path` is a macOS-specific token resolving to the directory containing the binary). The specific path `../../../` walks three levels up from the executable — navigating out of `Firefox.app/Contents/MacOS/` to the bundle root.

### `ipc/chromium/src` site

#### 12.2. `ipc/chromium/src/base/process_util.h`

**Summary:**

It adds a macOS-only function declaration, gated behind `#if defined(XP_MACOSX)`.

**Taxonomy classification:**
1. Feature gating: this function is only exposed in macOS for compatibility purpose
2. Syntax/API backport: re-exposing a function in which has been deprecated by upstream, but the legacy platform still needs it.

**Relations:** none

**Explanations:**

It adds a **macOS-only function declaration** inside `ipc/chromium/src/base/process_util.h`, gated behind `#if defined(XP_MACOSX)`:

```c
void SetAllFDsToCloseOnExec();
```

The function's comment describes it as setting all file descriptors to close-on-exec, except for `stdin`, `stdout`, and `stderr`. The comment also carries two notable annotations inherited from Chromium's codebase: a `TODO(agl): remove this function` and a `WARNING: do not use. It's inherently race-prone in the face of multi-threading.`

The only other change is cosmetic: the blank line between `CloseSuperfluousFds` and the `typedef` declarations is removed.

#### 12.3. `ipc/chromium/src/base/process_util_posix.cc`

**Summary:**

This patch has 3 distinct layers of changes:
1. `SetAllFDsToCloseOnExec()` implementation
2. Completely rewrite `handleForkServer` lambda
3. `WaitForProcess` - `waitid` gating for macOS 10.7

**Categorize:**
1. Syntax/API backport: explicit implementation of `SetAllFDsToCloseOnExec()` for legacy platform needs
2. Feature gating
* `handleForkServer` polling rewrite
* `waitid` runtime version gate

**Relations:**
1. `ipc/chromium/src/base/process_util.h`: this is where `SetAllFDsToCloseOnExec()` is declared.

**Explanations:**

This change touches simulateously 3 layers, including:

---

1. Layer 1: `SetAllFDsToCloseOnExec()` implementation

This provides the function body declared in the previous patch. The implementation walks the fd directory (`/dev/fd` on macOS/FreeBSD, `/proc/self/fd` on Linux), and for each open fd above `stderr`, sets the `FD_CLOEXEC` flag via `fcntl`. It's a brute-force sweep rather than a targeted close — which is exactly why the Chromium TODO warning about multi-threading danger applies. The gating inside the body mirrors the header: it compiles on Linux, macOS, and FreeBSD, but was declared in the header only for `XP_MACOSX`. The implementation is thus broader than the declaration — a deliberate asymmetry, keeping the symbol visible only where needed while sharing the implementation file.

---

2. Layer 2: `handleForkServer` lambda — complete rewrite

The upstream version of `handleForkServer` delegated process-wait responsibility to the fork server via `forkService->SendWaitPid(...)`, an IPC call that returns a structured result. The patched version replaces this entirely with a **polling loop** using `kill(pid, 0)`:

- It polls up to 10 times with 500ms delays.
- `kill(pid, 0)` doesn't send a signal — it just tests whether the process exists.
- If the process is gone (`ESRCH`), it returns `Exited`. If still present, `Running`.
- A zombie edge case (container environments where pid 1 isn't a real init) is handled via `IsZombieProcess()`, which is also added by this patch and reads `/proc/{pid}/stat` on Linux.

The comment in the patch is candid about the approach's weakness: pid reuse means `kill(pid, 0)` returning 0 could mean the original process is still running *or* that a new process has been assigned the same pid. The `kAttempts` limit exists precisely because of this unreliability — after 10 failed attempts to confirm non-existence, it gives up and returns `Error` with `ETIME`.

This is a significant behavioral change. The upstream approach was synchronous and reliable (IPC round-trip to the fork server). The patched approach is a best-effort poll, explicitly acknowledged as imperfect. The reason is almost certainly that `SendWaitPid` relies on IPC infrastructure that doesn't work correctly on older macOS, or that the fork server design itself was introduced after 10.7.

---

3. Layer 3: `WaitForProcess` — `waitid` gating for macOS 10.7

This is the most architecturally interesting part. The upstream code uses `waitid` (with `WNOWAIT`) when `HAVE_WAITID` is defined, falling back to `waitpid` on platforms without it. The patch inserts a macOS-specific runtime version check around the `waitid` path:

```cpp
#ifdef XP_MACOSX
  if (__builtin_available(macOS 10.8, *)) {
#endif
  // ... waitid path ...
#ifdef XP_MACOSX
  } else {
	// waitpid fallback for 10.7 and lower
  }
#endif
```

The comment is explicit: *"10.8 and higher have a working waitid, broken on 10.7 and lower"*. On 10.7, the code falls through to a `waitpid`-based path that is, as the comment notes, the same logic that already exists in the `#else // no waitid` branch for non-`HAVE_WAITID` platforms like OpenBSD.

Two smaller cleanups accompany this: the local `handleStatus` lambda is removed (its inline logic is now spelled out directly in both the `waitid` and `waitpid` paths), and error logging is promoted from `INFO` to `ERROR` severity in the `waitpid` failure cases.

---

#### 12.4. `ipc/chromium/src/base/process_util_mac.mm`

**Summary:**

This patch make the following substantial changes to the IPC logic:
1. Layer 1: `pthread_chdir_np`/`pthread_fchdir_np` - syscall-level unwrapping
2. Layer 2: `posix_spawn_file_actions_addchdir_np` - working directory fallback
3. Layer 3: `POSIX_SPAWN_CLOEXEC_DEFAULT` - broken on macOS 10.7

**Taxonomy classification:**
1. **System layer bypass:** syscall-level `pthread_*` wrappers
2. **Feature gating:**
* `addchdir_np` fallback via `pthread_chdir_np`
* `POSIX_SPAWN_CLOEXEC_DEFAULT` gate with `SetAllFDsToCloseOnExec` fallback

**Relations:**
1. `ipc/chromium/src/base/process_util.h`: this is where `SetAllFDsToCloseOnExec` fallback is declared
2. `ipc/chromium/src/base/process_util_posix.cc`: this is where `SetAllFDsToCloseOnExec` fallback is conditionally implemented

**Explanation:**

This patch incoporates three distinct layers, each targeting a different API availability boundary.

---

1. Layer 1: `pthread_chdir_np` / `pthread_fchdir_np` — syscall-level unwrapping

The upstream code declared only `pthread_fchdir_np` with an `API_AVAILABLE(macosx(10.12))` annotation, treating it as a symbol that simply doesn't exist before 10.12. The patch replaces both declarations with **direct syscall wrappers**:

```cpp
int pthread_chdir_np(const char* dir) {
	return syscall(SYS___pthread_chdir, dir);
}
int pthread_fchdir_np(int fd) {
	return syscall(SYS___pthread_fchdir, fd);
}
```

The original comment already conceded that *"the syscalls are available back to 10.5, but the C wrappers only in 10.12"*. The patch acts on that knowledge directly — bypassing the C wrapper entirely and calling the kernel interface, which has existed since 10.5. The `API_AVAILABLE` annotation is dropped because it's no longer relevant: the symbol isn't being resolved from a library anymore, it's being generated inline. This is a **system layer bypass**: the implicit dependency on the C wrapper's availability is eliminated by descending one layer deeper into the OS ABI.

---

2. Layer 2: `posix_spawn_file_actions_addchdir_np` — working directory fallback

The upstream code called `posix_spawn_file_actions_addchdir_np` unconditionally to set the child process's working directory as part of the spawn file actions. This API only exists on 10.15+. The patch wraps it in a runtime check and provides a complete fallback path for older systems:

```
if (@available(macOS 10.15, *)) {
	posix_spawn_file_actions_addchdir_np(...)   // preferred
} else {
	old_cwd_fd = open(".", O_RDONLY | O_CLOEXEC | O_DIRECTORY);
	pthread_chdir_np(options.workdir.c_str());  // thread-local chdir
}
```

The fallback uses `pthread_chdir_np` (now available via syscall since Layer 1) to temporarily change the *calling thread's* working directory. Since `posix_spawnp` inherits the thread's cwd, the child gets the right directory. A `MakeScopeExit` guard then calls `pthread_fchdir_np(old_cwd_fd)` to restore the original directory after spawning, whether or not spawning succeeded. This is a careful, RAII-managed approach to what is inherently a stateful, thread-local side-effect.

---

3. Layer 3: `POSIX_SPAWN_CLOEXEC_DEFAULT` — broken on macOS 10.7

The most directly consequential change. The patch gates the `POSIX_SPAWN_CLOEXEC_DEFAULT` spawn flag behind a `@available(macOS 10.8, *)` check, with the following comment:

> *"thanks to @kencu at macports for suggesting posix_spawn has problems on 10.7. he was close, but it turns out it's the POSIX_SPAWN_CLOEXEC_DEFAULT flag on the spawn attributes. kudos to the @textmate lads for confirming it"*

`POSIX_SPAWN_CLOEXEC_DEFAULT` is an Apple extension that closes all file descriptors not explicitly named in the file actions, preventing fd leakage into child processes. On 10.7 it is broken. The upstream code uses it unconditionally.

The fallback for 10.7 is exactly `SetAllFDsToCloseOnExec()` — the function declared in patch 067 and implemented in patch 068. This closes the loop: the entire `SetAllFDsToCloseOnExec` resurrection across the previous two patches existed *specifically* to serve as the 10.7 fallback here. The three patches form a single coherent unit of work.

---

#### 12.5. `ipc/chromium/src/chrome/common/mach_ipc_mac.cc`

**Summary:**

This patch backports a single function call in a Mach IPC check-in validation.

**Taxonomy classification:**
1. **System layer bypass:**

`audit_token_to_pid()` is a BSM library function whose availability on older macOS is constrained. It is a private/semi-private Apple API — not part of the public SDK headers in all versions — and its symbol availability on macOS 10.7–10.11 is unreliable. Rather than gating it behind a runtime `@available` check (which wouldn't work for a symbol not declared in public headers), it was bypassed entirely by directly accessing the known memory layout of `audit_token_t`.

**Relations:** none

**Explanations:**

It replaces a single function call in a Mach IPC check-in validation:

```cpp
// BEFORE:
if (audit_token_to_pid(request.trailer.msgh_audit) != child_pid)

// AFTER:
if (((pid_t) request.trailer.msgh_audit.val[5]) != child_pid)
```

The purpose of both expressions is identical: extract the PID from a Mach message's audit token to verify that the IPC check-in message was sent by the expected child process. The upstream approach calls `audit_token_to_pid()`, a BSM (Basic Security Module) C function. The patch replaces this with a direct struct field access — `val[5]` of the audit_token_t struct — which is a fixed-offset raw read of the same underlying data.
The comment references both the motivation and the source: an OpenBSM patch in NixOS's nixpkgs that documents that the sixth member (`val[5]`, zero-indexed) of the `audit_token_t` value array holds the PID.

#### Conclusion

| Patch | Role |
|---|---|
| 067 `process_util.h` | Declares `SetAllFDsToCloseOnExec()` for macOS |
| 068 `process_util_posix.cc` | Implements it; also fixes `waitid` on 10.7 |
| 069 `process_util_mac.mm` | Consumes it as 10.7 fallback; adds two more version-gated fallbacks |
| 070 `mach_ipc_mac.cc` | Backports single function call in a Mach IPC check-in validation |

---

***Taxonomy***

| Change | Category |
|---|---|
| Syscall-level `pthread_*` wrappers | **System layer bypass** — descending below the C API to reach a stably-available kernel interface |
| `addchdir_np` fallback via `pthread_chdir_np` | **Feature gating with runtime substitution** — `@available` dispatch to an alternative mechanism |
| `POSIX_SPAWN_CLOEXEC_DEFAULT` gate + `SetAllFDsToCloseOnExec` fallback | **Feature gating with runtime substitution** — consuming the resurrected API from the previous patches |

---

####

#### Thesis relevance

1. The multi-file patch cluster as the atomic unit of legacy maintenance work

The three patches 067–069 form an indivisible unit. `SetAllFDsToCloseOnExec()` is declared in the header, implemented in the `.cc` file, and *consumed* in the `.mm` file — all to solve a single problem: `POSIX_SPAWN_CLOEXEC_DEFAULT` being broken on macOS 10.7. No single patch in the cluster is meaningful in isolation.

**Thesis implication:** The framework's change taxonomy must operate at two levels of granularity. The *leaf level* is the individual patch (one file, one diff). The *cluster level* is a set of coordinated patches implementing one semantic goal across multiple files. Dependency evolution events in legacy maintenance often manifest as clusters, not atoms. The framework needs a notion of cluster identity to correctly attribute effort, traceability, and risk.

---

2. Depth within the system layer: library ABI vs. syscall ABI

Patch 069 bypasses `pthread_fchdir_np` (C wrapper, available 10.12+) by calling `SYS___pthread_fchdir` directly (syscall ABI, available 10.5+). The original comment in the upstream source already acknowledged this gap — the knowledge was present, but no action was taken upstream because their deployment baseline was 10.15.

**Thesis implication:** The system layer is not flat. It contains at minimum two sub-layers: the *library ABI* (C wrappers, framework symbols) and the *syscall ABI* (kernel interface numbers). These have independent availability envelopes indexed against the same `osver` component of the target tuple. The two-layer dependency model (project layer + system layer) may need to acknowledge this internal structure, or at least note it as a refinement direction. A maintainer targeting legacy versions must be aware of both sub-layers and know when descending from one to the other is valid.

---

3. Runtime version dispatch as a first-class maintenance strategy

Patches 068 and 069 both use runtime version checks — `__builtin_available` and `@available` — rather than compile-time `#if` guards. This means the shipped binary contains *all* code paths simultaneously, with dispatch happening at execution time against the actual `osver`. Three boundaries are gated this way: `waitid` (10.8), `posix_spawn_file_actions_addchdir_np` (10.15), and `POSIX_SPAWN_CLOEXEC_DEFAULT` (10.8).

**Thesis implication:** The framework's change taxonomy distinguishes compile-time preprocessor branch collapse from runtime feature gating, but patch 068/069 shows these are not the same thing and must not be conflated. Runtime gating preserves all code paths in the binary at the cost of binary size and testing surface. The human-in-the-loop must decide *which* strategy is appropriate for a given API gap — a decision that cannot be automated because it depends on knowledge of whether the missing symbol is a compile-time or runtime deficiency.

---

4. The `POSIX_SPAWN_CLOEXEC_DEFAULT` case as empirical evidence of the implicit system layer

The breakage on 10.7 was not detectable from any formal dependency graph. `POSIX_SPAWN_CLOEXEC_DEFAULT` is a preprocessor constant defined in a system header — it *compiles* successfully on all targets. The failure is purely behavioural: the flag is accepted by the OS but produces incorrect results on 10.7. No static analysis tool, no version checker, no dependency resolver would catch this. It was found empirically, traced through community knowledge (MacPorts' @kencu, TextMate's changelog), and resolved by a human who understood both the failure mode and the available substitutes.

**Thesis implication:** This is one of the strongest concrete examples in the entire Momiji codebase for the claim that the implicit system layer cannot be fully formalized. The failure is not a missing symbol (detectable) nor a compile error (detectable) — it is a silent behavioural defect in a present, compilable API. This category of compatibility hazard lies structurally outside the reach of automated verification. Human-in-the-loop is not a limitation of the current framework implementation; it is the only correct response to this class of problem.

---

5. Provenance trails as load-bearing thesis evidence

Patch 069 carries explicit attribution: a MacPorts contributor (@kencu) identified the general problem area, and the TextMate changelog confirmed the specific cause. This is not incidental commentary — it documents the actual knowledge-discovery process that made the fix possible.

**Thesis implication:** In legacy maintenance, the *provenance* of a fix — where the knowledge came from, how it was validated — is part of the maintenance record in a way that is absent from ordinary software development. The framework should acknowledge that legacy compatibility knowledge is often tacit, community-held, and non-authoritative (a changelog note from an unrelated project served as the confirming reference). This reinforces why no closed-world model of dependencies can capture legacy maintenance fully: the knowledge required exists outside any formal specification.

---

6. The `SetAllFDsToCloseOnExec` resurrection as a deprecation reversal pattern

Upstream Chromium had deprecated and effectively removed `SetAllFDsToCloseOnExec` — it carries a `TODO(agl): remove this function` comment and an explicit safety warning. Momiji re-exposes it. This is not a bug fix or a new feature; it is the deliberate resurrection of a rejected upstream API because the legacy target has no better option.

**Thesis implication:** Legacy maintenance involves a category of change with no analogue in forward-compatible software development: *deprecation reversal*. An API the upstream project has decided is wrong becomes the correct choice when the deployment target lacks the replacement. The framework's taxonomy should include this as a named category distinct from ordinary backports. It also has a risk profile all its own: the deprecated API carries known hazards (race-proneness in this case) that the maintainer accepts knowingly, which should be surfaced in any framework-guided maintenance record.

---

7. The linker reversion cluster and the process-spawn cluster as parallel structural evidence

The `config` subtree's linker behaviour reversions (patches on `rules.mk` and `ipc/app/moz.build`) and the process-spawn cluster here (067–069) are structurally parallel: both are multi-file clusters, both revert or bypass upstream decisions that assumed a deployment baseline higher than Momiji's, and both required community knowledge outside the codebase to diagnose. This parallelism across two independent subsystems strengthens the generalisability claim of the framework — the same patterns of implicit system-layer dependency and human-mediated diagnosis recur independently, which is exactly what a framework validated under stress conditions should exhibit.

8. Struct-layout-as-stable-substrate strategy

This patch adds a second concrete example of the struct-layout-as-stable-substrate strategy, reinforcing that the system layer has multiple sub-layers with different stability profiles. For the thesis, these two instances together — syscall numbers and struct field offsets — are sufficient to establish the pattern as a general maintenance strategy deserving a named subcategory within system layer bypass: ABI substrate access, where the maintainer reaches past an unavailable or unreliable C wrapper to the underlying stable binary interface that the wrapper itself encodes.

### 12.6. `ipc/glue/GeckoChildProcessHost.cpp`

**Summary:**

One line is moved — `mLaunchOptions->env_map["DYLD_LIBRARY_PATH"] = new_dyld_lib_path.get()` — from inside the `if (PR_GetEnv("MOZ_RUN_GTEST"))` block to outside it, immediately after the closing brace.

**Taxonomy classification:**
1. **Environment propagation fix**:

This is patch which provides correction to the *runtime environment construction logic* which ensures legacy-specific dylib resolution context is inherited across the process boundary. It belongs within the broader linker behaviour reversion cluster but operates one layer higher - at process launch rather than at link time.

**Relations:** none

**Explanation:**

1. What the patch does

One line is moved — `mLaunchOptions->env_map["DYLD_LIBRARY_PATH"] = new_dyld_lib_path.get()` — from *inside* the `if (PR_GetEnv("MOZ_RUN_GTEST"))` block to *outside* it, immediately after the closing brace.

**Before:** `DYLD_LIBRARY_PATH` is only set in the child process's environment when running GTesting. In all other launch paths — which is every normal browser launch — the assignment never executes.

**After:** `DYLD_LIBRARY_PATH` is always set, using whatever `new_dyld_lib_path` was constructed above (which may or may not have had the `/gtest:` prefix prepended, depending on whether `MOZ_RUN_GTEST` is set).

`DYLD_LIBRARY_PATH` is the environment variable that tells `dyld` where to search for dynamic libraries *before* its default search paths. On modern macOS (10.11+, with System Integrity Protection), `DYLD_LIBRARY_PATH` is silently stripped for protected processes. But on legacy macOS (10.7–10.10), it is the *primary* reliable mechanism for directing `dyld` to find dylibs that are not at their default system locations — including, critically, any substitution or shimmed libraries Momiji ships alongside Firefox (such as `libMacportsSystemLegacy.B.dylib` or any C++17 standard library substitutes from earlier patches).

In the upstream code, the only circumstance under which a child process would inherit a correctly-populated `DYLD_LIBRARY_PATH` is during a GTest run. In every normal browser session on legacy macOS, child processes — content process, GPU process, socket process — would be launched *without* this variable, meaning `dyld` would fall back to default search paths and potentially fail to find shimmed libraries that the parent process had already resolved. The fix ensures `DYLD_LIBRARY_PATH` propagates to all child processes unconditionally.

---

## 13. `js` subtree

### Files affected:
* `js/src/jit/ProcessExecutableMemory.cpp`

### 13.1. `js/src/jit/ProcessExecutableMemory.cpp`

**Summary:**

This patch add preprocessor guard substitution in `CommitPages` and `DecommitPages` in how SpiderMonkey (Firefox's JS engine) allocates, commits and decommits executable memory for JIT-compiled code.

**Categories (Framework relevance):**
1. **Preprocessor branch collapse:**

The dependency beign resolved here is a **runtime behavioral incompatibility:** the `madvise`-based memory management path was written for a macOS feature (`MAP_JIT` + Fast WX) that post-dates the legacy target range. Leaving it active for all Darwin targets would either silently misbehave or require dead nested guards. The patch removes that implicit dependency on OS capability by narrowing the guard to the exact feature macro, making the implicit assumption explicit and collapsing the dead branch. This also illustrates the system layer of your two-layer model: `JS_USE_APPLE_FAST_WX` is effectively a capability signal from the system layer, and the patch makes the project layer's dependency on it precise rather than approximate. 

**Relations:** none

**Explanations:**

This file manages how SpiderMonkey (Firefox's JS engine) allocates, commits, and decommits executable memory for JIT-compiled code. On macOS, this involves platform-specific `mmap`/`madvise` calls governed by preprocessor guards.

1. Whitespace fix (cosmetic)

In `ReserveProcessExecutableMemory`, the line `flags |= MAP_JIT;` gains an extra indent to align consistently under the `#if defined(XP_DARWIN)` block. No semantic change.

---

2. Preprocessor guard substitution in `CommitPages` and `DecommitPages` (substantive)

This is the core change. In both functions, the outer conditional branch is rewritten:

| Before | After |
|---|---|
| `#if defined(XP_DARWIN)` | `#if defined(JS_USE_APPLE_FAST_WX)` |

**What this means technically:** The original code activated a macOS-specific `madvise`-based path for *all* Darwin targets. Inside that Darwin block, there was a nested `#if !defined(JS_USE_APPLE_FAST_WX)` guard that conditionally ran `mprotect` (for memory permission changes) — only skipping it on Apple Fast WX systems. The patch collapses this two-level nesting into a single flat condition: the `madvise`-only path now runs *only* when `JS_USE_APPLE_FAST_WX` is defined, and everything else falls through to the generic `MozTaggedAnonymousMmap`/`mprotect` path.

**Net effect on the non-Fast-WX Darwin path (i.e., macOS 10.7–10.14):** These older macOS versions do *not* define `JS_USE_APPLE_FAST_WX` (that feature requires at least macOS 11+ hardware capabilities). After the patch, they no longer enter the `madvise` branch at all — they fall through to the `#else` branch that uses `mprotect` and `MozTaggedAnonymousMmap`, which is the same code path used on Linux and other non-Darwin platforms. The `madvise(MADV_FREE_REUSE)` / `madvise(MADV_FREE_REUSABLE)` calls that were gated behind `XP_DARWIN` (but not useful without Fast WX) are simply dropped for legacy macOS.

The `CommitPages` function is also tightened: the old error-handling pattern (`if (ret != 0) { return false; }` followed by a separate `return true`) is simplified to the single expression `return ret == 0;`.

---

## 14. `layout` subtree

### Files affected:
* `layout/base/nsDocumentViewer.cpp`
* `layout/base/nsLayoutUtils.cpp`
* `layout/generic/nsContainerFrame.cpp`

### 14.1. `layout/base/nsDocumentViewer.cpp`

**Summaries:**

macOS platform gate on `ShouldAttachToTopLevel()`

**Taxonomy classification:**
1. **Feature gating:**

It is a compile-time platform restoring pre-regression behavior on macOS.

**Relations:** none

**Explanations:**

`ShouldAttachToTopLevel()` is a predicate that determines whether the document viewer should attach its presentation to the *top-level* native widget rather than a child widget. This affects how the layout engine roots its widget hierarchy.

Mozilla's upstream version returns `true` unconditionally (after the puppet widget check), preceded by a debug-only assertion that the parent widget has no existing view. The patch inserts a `#ifdef XP_MACOSX` branch **before** that assertion, making the function return `false` on macOS — short-circuiting the rest of the logic entirely.

The debug assertion is left in place but is now nested inside both `#ifdef XP_MACOSX … #else` and `#ifdef DEBUG`, so it only runs on non-macOS debug builds.

Mozilla's own comment attached to the change acknowledges this as a deliberate unresolved divergence: `TODO(emilio, bug 1919165): Unify this between macOS and other platforms?`

Returning `false` on macOS means the document viewer will attach to a *child* widget rather than the top-level widget on that platform. This is a widget hierarchy routing decision with downstream consequences for hit testing, compositing, and event delivery. The fact that Mozilla's upstream code was presumably updated to return `true` universally (triggering the bug that necessitated this patch) suggests a regression was introduced on legacy macOS when Mozilla unified this behavior.

### 14.2. `layout/base/nsLayoutUtils.cpp`

**Summaries:**

Legacy backports in widget offset computation via widget tree traversal

**Taxonomy classification:**
1. **UI rendering restoration:**

The upstream API `WidgetToScreenOffset` is not removed or disabled - it's retained as a fallback. The patch inserts an alternative computation path which is preferred when it is safe to use (same widget root) and degrades gracefully otherwise.

**Relations:** none

**Explanations:**
1. What the function does

`WidgetToWidgetOffset()` computes the positional offset between two widgets — used by the layout engine to translate coordinates between widget spaces, which is fundamental to hit testing, event dispatch, and compositing.

2. What the upstream version does

Upstream simply calls `WidgetToScreenOffset()` on both widgets and subtracts them. This works correctly when both widgets have a valid and consistent screen-coordinate mapping — which is the normal case on modern platforms where the window server provides accurate global coordinates.

3. What the patch does

The patch introduces a new static helper `GetWidgetOffset()` that instead computes an offset by **walking the widget parent chain** — accumulating `GetBounds().TopLeft()` at each step until it reaches a non-child (top-level) widget. The root widget reached at the end of that walk is returned via an output parameter.

`WidgetToWidgetOffset()` is then replaced with logic that:
1. Calls `GetWidgetOffset()` for both `aFrom` and `aTo`, getting their widget-tree-relative offsets and their respective root widgets.
2. **Only if the two root widgets are different** — meaning they are in separate widget hierarchies — falls back to the original `WidgetToScreenOffset()` screen-coordinate approach.
3. If they share the same root, uses the widget-tree-accumulated offsets directly.

`WidgetToScreenOffset()` relies on the OS window server to correctly report a widget's global screen position. On legacy macOS (particularly 10.7–10.9), the Cocoa/Carbon window server has known inaccuracies or inconsistencies in reporting child widget positions in screen coordinates, especially for child widgets embedded in a parent native window. Walking the widget tree directly using `GetBounds()` — which queries local, relative geometry managed by Gecko itself — bypasses the OS-reported screen coordinates entirely and uses only internally-known layout geometry.

The fallback to `WidgetToScreenOffset()` for cross-hierarchy widgets is correct: when the two widgets are in separate top-level windows, there is no common parent to walk, and screen coordinates are the only common reference frame.

### 14.3. `layout/generic/nsContainerFrame.cpp`

**Summaries:**

This patch incorporates 3 independent fixes:
1. Widget variable scope lift in `SetSizeContraints()`
2. Inner-to-outer window size difference computation
3. Debug frame listing simplification (2 related hunks)

**Taxonomy classification:**
1. **Syntax/API backport:**
* Compiler compatibility (scope lift)
* Widget API substitution (probe computation replacing a missing method)
* API signature rollback (debug tooling)

**Relations:** none

**Explanations:**

1. Change 1: Widget variable scope lift in `SetSizeConstraints()`

The `rootWidget` pointer retrieved from `aPresContext->GetNearestWidget()` was previously declared inside the `if` condition that used it. The patch hoists it to a separate declaration before the `if`, then checks it as a plain boolean condition. This is a purely mechanical scope change — the logic is identical. The likely motivation is compiler compatibility: older Clang versions on macOS 10.7–10.9 may not reliably support variable declarations in `if` conditions depending on the C++ standard mode in effect, or this style was flagged as ambiguous in the version of Clang available on those targets.

---

2. Change 2: Inner-to-outer window size difference computation

This is the most substantive change. Upstream computes the inner-to-outer window size difference by calling `NormalSizeModeClientToWindowSizeDifference()` — a method that returns the size delta directly. The patch replaces this with a **probe computation**: it calls `ClientToWindowSize(LayoutDeviceIntSize(200, 200))` with a concrete size and extracts the difference as `windowSize.width - 200` / `windowSize.height - 200`.

The semantic result is the same — both approaches yield the border/chrome size delta to add when converting inner constraints to outer window constraints. The difference is in which API is called. `NormalSizeModeClientToWindowSizeDifference()` is likely a newer API absent from the Cocoa widget implementation on older macOS SDK targets, while `ClientToWindowSize()` is an older, more widely available method. This is a **Runtime library/API substitution** at the widget API level — the same value is obtained through a compatible older call.

---

3. Change 3: Debug frame listing simplification (two related hunks)

The final two hunks affect debug-only frame tree listing code (`#ifdef`-gated). Two changes:

- `ExtraContainerFrameInfo()` loses its `bool` parameter (`OnlyListDeterministicInfo` flag) and becomes a no-op stub with `(void)aTo`. The call site in `List()` is updated to match.
- `ListChildLists()` replaces a two-step string construction (build string, call `ListPtr()`, append suffix) with a single `nsPrintfCString` format call that inlines the pointer directly.

Both are **API signature rollbacks** — the upstream versions rely on newer overloads or helper methods (`ListPtr()` with flags, the boolean parameter on `ExtraContainerFrameInfo`) that either don't exist or behave differently in the older codebase Momiji targets.

---

### Conclusions
...in progress...

### Thesis relevance
...in progress...

## 15. `media` subtree

### Files affected
* `media/libjpeg/simd/x86_64/jsimd.c`
<!-- media/libsoundtouch site -->
* **[added]** `media/libsoundtouch/src/sources.mozbuild`
* `media/libsoundtouch/moz-libsoundtouch.patch`
* `media/libsoundtouch/moz.yaml`
* `media/libsoundtouch/src/RLBoxSoundTouchFactory.h`
* `media/libsoundtouch/src/STTypes.h`
* `media/libsoundtouch/src/SoundTouch.h`
* `media/libsoundtouch/src/SoundTouchFactory.cpp`
* `media/libsoundtouch/src/SoundTouchFactory.h`
* `media/libsoundtouch/src/moz.build`
<!--  -->
* `media/libvpx/libvpx/vpx_ports/vpx_timer.h`

### 15.1. `media/libjpeg/simd/x86_64/jsimd.c`

**Summary:**

This patch inserts a preprocessor guard, which redefines `THREAD_LOCAL` as an empty string if the deployment target is below 10.7.

**Taxonomy classification:**
1. **Syntax/ABI backport:** redefinition of `THREAD_LOCAL`
2. **Feature gating:** valid for deployment target below 10.7

**Relations:** none

**Explanation:**

`libjpeg-turbo` uses a macro called `THREAD_LOCAL` (typically expanding to `__thread` or `_Thread_local`) to declare two static variables — `simd_support` and `simd_huffman` — as thread-local storage. The problem: `__thread` thread-local storage was not supported on macOS until 10.7, and even then its availability in the Apple toolchain was inconsistent.

The patch inserts a preprocessor guard:

1. On macOS (`XP_DARWIN`), it includes `<AvailabilityMacros.h>` to get the `MAC_OS_X_VERSION_*` constants.
2. If the **deployment target is below 10.7** (i.e., `MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7`), it redefines `THREAD_LOCAL` as an empty string — effectively stripping the thread-local qualifier from those two variables.

The inline comment explicitly cites the upstream `libjpeg-turbo` commit that made this same change, notes that the only consequence is reduced thread safety in the JPEG error handler, and quotes the upstream developer's own assessment that it is "innocuous."

### `media/libsoundtouch` site

#### 15.2. `media/libsoundtouch/moz-libsoundtouch.patch`

**Summary:**

This is a patch of Mozilla's patch, with the introduction of `SOUNTOUCH_API` visibility macro in `STTypes.h` and applying it to the main class in `SoundTouch.h`.

**Taxonomy classification:**
1. **Linker behavior modification:** it adds explicit symbol visibility control to a vendored library's public interface. No runtime logic is affected, but how the linker resolves `SoundTouch` accross DLL boundaries on Windows. On macOS, it's a no-op at code level, but the presence is needed for cross-platform build correctness.
2. **Non legacy-macOS specific**

**Explanation:**

1. **Hunk 1 — `STTypes.h`: introduce `SOUNDTOUCH_API` visibility macro**

After replacing the original platform-detection block with `#include "soundtouch_config.h"`, this adds a new macro definition:

- On Windows (`WIN32`), `SOUNDTOUCH_API` expands to `__declspec(dllexport)` when building the library, and `__declspec(dllimport)` when consuming it.
- On all other platforms (including macOS), `SOUNDTOUCH_API` expands to nothing.

This is the standard cross-platform DLL visibility pattern. The macro itself is inert on macOS/Linux but enables correct symbol visibility on Windows.

2. **Hunk 2 — `SoundTouch.h`: apply `SOUNDTOUCH_API` to the main class**

The `SoundTouch` class declaration is changed from a plain `class SoundTouch` to `class SOUNDTOUCH_API SoundTouch`. This marks the class for export/import on Windows while leaving macOS behaviour unchanged.

---

#### 15.3. `media/libsoundtouch/moz.yaml`

**Summary:**

Replace wildcard glob `src/RLBoxSoundTouch*` with explicit pattern `src/RLBoxSoundTouchFactory.*`

**Taxonomy classification:**
1. **Build graph surgery:** specifically, a vendoring manifest correction. It does not touch source code at all; it adjusts the metadata that governs how the vendored library tree is managed during future upstream syncs.

**Relations:** none

**Explanations:**

A single-line change in the `keep:` list of the vendoring manifest. The wildcard glob `src/RLBoxSoundTouch*` is replaced with the explicit pattern `src/RLBoxSoundTouchFactory.*`.

`moz.yaml` is Mozilla's `mach vendor` configuration file. The `keep:` list tells the vendoring tool which files in the vendored tree to **retain** when updating to a new upstream version — i.e., files that Mozilla (or Momiji) added themselves and which are not present in the upstream source.

The original glob `src/RLBoxSoundTouch*` would match *any* file whose name starts with `RLBoxSoundTouch` — including hypothetical future files. The replacement `src/RLBoxSoundTouchFactory.*` is a precise match for only the `RLBoxSoundTouchFactory` file (any extension), tightening the retention scope.

---

#### 15.4. `media/libsoundtouch/src/RLBoxSoundTouchFactory.h`

**Summary:**

This patch applies `SOUNDTOUCH_API` to every C-linkage function declared in the `RLBoxSoundTouchFactory` header.

**Taxonomy classification:**
1. Linker behaviour patch:

This is the completion of the `moz-libsoundtouch.patch` which annotated the `SoundTouch` class itself, and this patch propagates the same annotation to the entire C wrapper API surface that consumers actually call across the sandbox boundary.

**Relations:** none

**Explanations:**

This patch applies `SOUNDTOUCH_API` to every C-linkage function declared in the `RLBoxSoundTouchFactory` header — the thin C wrapper layer that exposes libsoundtouch's C++ API across the RLBox sandbox boundary. All 11 functions (`SetSampleRate`, `SetChannels`, `SetPitch`, `SetSetting`, `SetTempo`, `SetRate`, `NumChannels`, `NumSamples`, `NumUnprocessedSamples`, `PutSamples`, `ReceiveSamples`, `Flush`) each receive a SOUNDTOUCH_API annotation on the line immediately preceding their declaration.

`SOUNDTOUCH_API` was introduced in patch 077 — it expands to `__declspec(dllexport/dllimport)` on Windows and to nothing on macOS/Linux. So on macOS this is a no-op at the compiler level; on Windows it ensures these symbols are correctly exported from the DLL and importable by consumers.

#### 15.5. `media/libsoundtouch/src/SoundTouch.h`

**Summary:**

A single-line change: applies `SOUNDTOUCH_API` to the `SoundTouch` class declaration, changing `class SoundTouch` to `class SOUNDTOUCH_API` SoundTouch.

**Taxonomy classification:**
1. Linker behavior modification

**Explanations:**

This is immediately recognisable as a duplicate of the hunk already introduced in `RLBoxSoundTouchFactory.h` patch. Recall that the previous patch modified moz-libsoundtouch.patch — Mozilla's vendored patch record — to include this same `SOUNDTOUCH_API` annotation on SoundTouch. This patch applies the identical change directly to the actual source file SoundTouch.h in the tree.

#### 15.6-7. `media/libsoundtouch/src/SoundTouchFactory.h/.cpp`

**Summary:**

Same `SOUNDTOUCH_API` synchronizing logic applied with `createSoundTouchObj()` and `destroySoundTouchObj()`.

**Taxonomy classification:**
1. Linker behavior modification

**Relations:** none

**Explanation:**

Patches 081 and 082 apply `SOUNDTOUCH_API` to `createSoundTouchObj()` and `destroySoundTouchObj()` — the object lifecycle functions — in both their definition (`SoundTouchFactory.cpp`) and declaration (`SoundTouchFactory.h`). The pattern is mechanically identical to patches 079 and 080.

This completes the **full `SOUNDTOUCH_API` propagation sweep** across the libsoundtouch C/C++ API surface:

| Patch | File | What was annotated |
|---|---|---|
| 077 | `moz-libsoundtouch.patch` | `SoundTouch` class (patch record) |
| 079 | `RLBoxSoundTouchFactory.h` | All 11 RLBox C wrapper functions |
| 080 | `SoundTouch.h` | `SoundTouch` class (live source) |
| 081 | `SoundTouchFactory.cpp` | `createSoundTouchObj`, `destroySoundTouchObj` (definitions) |
| 082 | `SoundTouchFactory.h` | `createSoundTouchObj`, `destroySoundTouchObj` (declarations) |

Patch 078 (`moz.yaml`) is the manifest bookkeeping that holds the cluster together.

---

#### 15.8. `media/libsoundtouch/src/STTypes.h`

**Summary:**

This is the duplication of `moz-libsoundtouch.patch`, which populates `SOUNDTOUCH_API` definition, however to the direct C header level.

**Taxonomy classification:**
1. Linker behaviour detection

**Relations:** none

**Explanations:** 

*Critical question: Why the macro is re-implemented directly in `STTypes.h`?*

**`moz-libsoundtouch.patch` is not source code — it is a future instruction.** It records what `mach vendor` should apply the *next time* Mozilla syncs libsoundtouch from upstream. It has no effect on the files that are actually sitting in the tree and being compiled right now.

The definition added in patch 077 landed inside the patch record's representation of `STTypes.h` — i.e., it describes what `STTypes.h` *should* look like after a future vendor run applies that patch. But the live file at `media/libsoundtouch/src/STTypes.h` in the working tree was never touched by patch 077. So when the compiler processes `STTypes.h` today, `SOUNDTOUCH_API` is simply undefined — and every use of it in `SoundTouch.h`, `SoundTouchFactory.h`, and `RLBoxSoundTouchFactory.h` (patches 079–082) would produce a compile error or silently expand to nothing unpredictably.

Patch 083 closes that gap by writing the macro definition directly into the live `STTypes.h`.

---

*The complete dual-track picture for `STTypes.h`*

| Track | File | Patch | Status after that patch |
|---|---|---|---|
| Patch record | `moz-libsoundtouch.patch` | 077 | Macro defined for future vendor runs |
| Live source | `STTypes.h` | 083 | Macro defined for current compilation |

This is the exact same dual-track invariant as 077/080 for `SoundTouch.h`, now repeated for `STTypes.h`. The cluster boundary actually expands to include patch 083.

---

*Question: Why `STTypes.h` specifically?*

`STTypes.h` is the **foundational type header** for the entire libsoundtouch library — it defines primitive typedefs and platform configuration that everything else includes. It is the natural and correct place to define a library-wide visibility macro, because any translation unit that includes *any* libsoundtouch header will transitively include `STTypes.h`. Defining `SOUNDTOUCH_API` here guarantees it is available at every point of use without requiring each header to include an additional file.

---

#### 15.9. `media/libsoundtouch/src/moz.build`

**Summary:**

The entire RLBox/WASM sandboxing conditional tree is excised, only the **pre-RLBox, non-sandboxed build path** - the simpler `INTEL_ARCHITECTURE` branch inside the `else` cause remains.

**Taxonomy classification:**
1. **Build graph surgery:** 

Specifically, the complete removal of RLBox WASM sandboxing feature from the libsoundtouch build, which is combined with a feature gating reversion.

**Relations:**
1. **[added]** `media/libsoundtouch/src/sources.mozbuild`

**Explanations:**

This is a **wholesale replacement of the build system logic** for libsoundtouch.

The entire RLBox/WASM sandboxing conditional tree is excised:

- All `MOZ_WASM_SANDBOXING_SOUNDTOUCH` conditional logic
- The `RLBoxLibrary()` build target and its Segue/WASM configuration
- References to `/third_party/rlbox_wasm2c_sandbox/` and `/third_party/simde/`
- `RLBoxSoundTouch.cpp` and its `MOZILLA_INTERNAL_API` flag
- The `RLBoxSoundTouch.h` / `RLBoxSoundTouchTypes.h` exports
- The dynamic `soundtouch_sources`/`soundtouch_defines` variable aliasing pattern (where variables pointed to either `WASM_SOURCES`/`WASM_DEFINES` or `UNIFIED_SOURCES`/`DEFINES` depending on the sandbox path)
- The `rlbox_thread_locals.cpp` source and the `WASM_RT_GROW_FAILED_CRASH` define
- The `wasm2c` runtime sources

What remains is the **pre-RLBox, non-sandboxed build path** — the simpler `INTEL_ARCHITECTURE` branch that was previously only the fallback inside the `else` clause.

---

*What `sources.mozbuild` does*

Rather than listing the source files inline in `moz.build`, the patch delegates to `include("sources.mozbuild")` and consumes `soundtouch_sources` and `soundtouch_defines` as variables. The `sources.mozbuild` file you provided contains exactly the source list and defines that were previously embedded in the `soundtouch_sources +=` block at the bottom of the original `moz.build` — just extracted into a standalone file.

Your note that this file was restored from historical Firefox revisions is telling: Mozilla previously used this split-file pattern before the RLBox sandboxing was introduced. Momiji is **reverting to an earlier architectural state** of the build system, and restoring `sources.mozbuild` is part of making that reversion work cleanly.

---

*Why RLBox had to go?*

RLBox is Mozilla's in-process sandboxing framework. Its WASM-based sandboxing path (`MOZ_WASM_SANDBOXING_SOUNDTOUCH`) depends on:

- A WASM compiler toolchain (`WASM_CC_VERSION`) — not present on legacy macOS build environments
- `wasm2c` runtime libraries — introduce their own system-layer dependencies
- Clang ≥ 14 for WASM SIMD intrinsics — legacy macOS may be constrained to older toolchains
- `/third_party/rlbox_wasm2c_sandbox/` — a third-party dependency that itself carries modern system requirements

None of these are compatible with macOS 10.7–10.14 target environments. Rather than attempting to backport each dependency individually, the decision was to revert to the pre-sandboxing build path entirely.

---

#### Conclusion

| # | File | Change |
|---|---|---|
| 077 | `moz-libsoundtouch.patch` | Introduces `SOUNDTOUCH_API` macro; annotates `SoundTouch` class (patch record) |
| 078 | `moz.yaml` | Tightens vendoring manifest glob to `RLBoxSoundTouchFactory.*` |
| 079 | `RLBoxSoundTouchFactory.h` | Applies `SOUNDTOUCH_API` to all 11 RLBox C wrapper functions |
| 080 | `SoundTouch.h` | Applies `SOUNDTOUCH_API` to `SoundTouch` class (live source) |
| 081 | `SoundTouchFactory.cpp` | Applies `SOUNDTOUCH_API` to `createSoundTouchObj`, `destroySoundTouchObj` (definitions) |
| 082 | `SoundTouchFactory.h` | Applies `SOUNDTOUCH_API` to same two functions (declarations) |
| 083 | `STTypes.h` | Re-implements `SOUNDTOUCH_API` macro definition in live source |
| 084 | `moz.build` + `sources.mozbuild` | Removes entire RLBox/WASM sandboxing build infrastructure; reverts to pre-sandboxing build path |

---

*Technical narrative*

The libsoundtouch scope required two independent but related interventions.

**First**, Mozilla's modern build of libsoundtouch routes audio processing through RLBox — an in-process WASM sandbox — whose build infrastructure depends on a modern Clang toolchain, `wasm2c` runtime libraries, and WASM SIMD intrinsics unavailable on legacy macOS targets. Rather than attempting piecemeal backporting of each sub-dependency, patch 084 excises the entire sandboxing layer and restores an earlier pre-RLBox build path, recovering `sources.mozbuild` from historical Firefox revisions to do so cleanly.

**Second**, with RLBox removed, the active ABI surface becomes the C factory APIs (`SoundTouchFactory`, `RLBoxSoundTouchFactory`) and the `SoundTouch` class itself. These lacked proper DLL symbol visibility annotations (`SOUNDTOUCH_API`) needed for correct Windows builds. Patches 077–083 propagate this macro consistently across the entire API surface, following Mozilla's dual-track vendoring discipline: each change lands in both the live source tree (for current compilation) and the patch record `moz-libsoundtouch.patch` (for survival across future vendor syncs). The manifest patch 078 keeps the vendoring metadata consistent with the new file set.

---

#### Thesis relevance

**1. Feature excision as a first-class legacy maintenance strategy**
Patch 084 demonstrates that when a modern upstream feature's dependency subtree is wholly incompatible with a legacy system layer, the correct response is complete removal rather than incremental backporting. This should be recognised in the framework as a distinct strategy — *feature excision* — alongside syntax backport, runtime substitution, and linker reversion. The decision boundary between excision and backporting is itself a human judgment call that no automated tool can make.

**2. Dual-track vendoring as a structural maintenance invariant**
The relationship between patches 077/083 (patch record vs. live source for `SOUNDTOUCH_API`) formalises a general invariant specific to Mozilla's vendoring workflow: *any change to a vendored library must be applied to both the live source tree and the vendoring patch record simultaneously.* Violation produces a tree that compiles today but silently loses the change on the next `mach vendor` run — a deferred failure mode invisible to the build system. This is a concrete instance of the framework's human-in-the-loop principle: no tooling enforces dual-track consistency, making it a permanent manual checkpoint.

**3. Patch cluster atomicity**
Patches 077–084 must be understood and applied as a single atomic unit. Partial application leaves the build in a broken intermediate state — either with undefined `SOUNDTOUCH_API` uses, an inconsistent vendoring manifest, or RLBox infrastructure referencing files that no longer exist. The thesis can use this cluster as a primary example when arguing that **the meaningful unit of legacy maintenance change is often a patch cluster, not a single patch file**, and that cluster boundary identification is itself a non-trivial maintenance skill.

**4. Recovered historical artefacts as maintenance resources**
The restoration of `sources.mozbuild` from a historical Firefox revision illustrates that legacy maintenance sometimes requires recovering prior states of the build graph rather than patching forward. This introduces a subtle dependency on *historical knowledge of the upstream project* — a resource that degrades over time and cannot be fully captured in a static dependency graph model. The framework should acknowledge this as a dimension of maintenance cost that grows with the age of the fork.

**5. Co-dependency between feature excision and API surface changes**
The visibility cluster (077–083) is only meaningful because patch 084 keeps the non-RLBox C factory API as the live interface. Had RLBox been retained, those annotations would target the wrong entry points. This co-dependency — where the correctness of one patch cluster is conditional on the outcome of another — is a strong argument for treating the entire scope as a single logical change, and reinforces the framework's position that dependency evolution on legacy systems cannot be fully automated: understanding *why* a cluster is coherent requires semantic knowledge of the codebase's architecture.

### 15.9. `media/libvpx/libvpx/vpx_ports/vpx_timer.h`

**Summary:**

This patch introduces a complete `clock_gettime` emulation layer for pre-10.12 macOS.

**Taxonomy classification:**
1. Runtime library/API substitution

Specifically, a POSIX symbol emulation via Mach kernel APIs, guarded by both a compile-time availability check (`MAC_OS_X_VERSION_MAX_ALLOWED`) and a runtime availability check (`__builtin_available`). It is the most complete example of this category seen in the `media` subtree so far, implementing a non-trivial emulation rather than a simple macro redefinition.

**Relations:** none

**Explanations:**

`vpx_timer.h` provides the microsecond-precision timing infrastructure used throughout libvpx for performance measurement. On POSIX systems the original code calls `clock_gettime()` directly. The problem: `clock_gettime` was not available on macOS until **10.12** — it exists in the POSIX standard but Apple only added it to their libc in Sierra.

The patch introduces a complete `clock_gettime` emulation layer for pre-10.12 macOS, structured in two parts:

**Part 1 — Emulation implementation (conditional on `MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12`):**

A `clock_gettime_missing()` function is implemented using macOS-native Mach kernel APIs (`<mach/mach.h>`, `<mach/clock.h>`), sourced from the [PosixMachTiming](https://github.com/ChisholmKyle/PosixMachTiming/) project. It handles both `CLOCK_REALTIME` (via `clock_get_time` on a calendar clock service) and `CLOCK_MONOTONIC` (via a mach clock port), translating `mach_timespec_t` results into POSIX `struct timespec`. Supporting state (`RoTimingMach`, `clock_port`) is declared as static globals.

**Part 2 — Runtime dispatch in `vpx_usec_timer_start` and `vpx_usec_timer_mark`:**

Both timer functions are restructured with `__builtin_available(macOS 10.12, *)` runtime checks on macOS:
- If running on 10.12+: call `clock_gettime()` as before (via `CLOCK_MONOTONIC_RAW` or `CLOCK_MONOTONIC`)
- If running below 10.12: call `clock_gettime_missing()` as the fallback

The Windows path is carefully preserved by adding `!defined(_WIN32)` guards around the `#else` branch — the inline comment explicitly acknowledges this was needed because restructuring the original `#elif` chain broke Windows.

---

## 16. `memory/build` subtree

### Files affected:
* `memory/build/Mutex.cpp`
* `memory/build/Mutex.h`

### 16.1-2. `memory/build/Mutex.h/.cpp`

**Summary:**

This coupled patch backports `os_unfair_lock` and its associated APIs for compatibility with pre-macOS 10.12 targets.

**Taxonomy classification:**
1. **Runtime library/API substitution:**

Substitution `os_unfair_lock` and associated ABIs with the `OSSpinLock` family equivalents in combination with additional emulations.

2. **Structural ABI bridge:**

This is what to do with the union with `static_assert` guards - both APIs are binary-compatible, but not source (parameters) compatible. Storage (input) layout must also be guaranteed to be interchangeable to make sure that the substitution is safe.

**Relations:** none.

**Explanations:**

This coupled patch addresses a single problem: `os_unfair_lock` and its associated APIs (`os_unfair_lock_lock_with_options`, `os_unfair_lock_trylock`, etc.) were introduced in macOS 10.12. On macOS 10.7–10.11, those symbols simply do not exist. The patch retrofits the `memory/build/Mutex` implementation to fall back gracefully to the older `OSSpinLock` API on those pre-10.12 targets, while preserving the modern path on 10.12+.

1. A union-based dual-personality lock storage (`Mutex.h`)

The `mMutex` field is widened from a bare `os_unfair_lock` into an anonymous union:

```cpp
union {
	os_unfair_lock mUnfairLock;
	OSSpinLock     mSpinLock;
} mMutex;
```

This is the structural heart of the patch. Because the two types are binary-identical (both are a 32-bit integer initialized to zero — verified by two `static_assert`s added just above), they can share the same storage. The correct member is selected at runtime via the `gSpinInKernelSpace` flag.

2. Compile-time safety assertions (`Mutex.h`)

Two `static_assert`s are inserted to make the union trick safe:

```cpp
static_assert(OS_UNFAIR_LOCK_INIT._os_unfair_lock_opaque == OS_SPINLOCK_INIT, ...);
static_assert(sizeof(os_unfair_lock) == sizeof(OSSpinLock), ...);
```

These guard against any future ABI divergence breaking the hack silently.

3. A runtime version gate (`Mutex.cpp`)

A new static initializer determines at startup which path to take:

```cpp
bool Mutex::SpinInKernelSpace() {
	if (__builtin_available(macOS 10.12, *)) return true;
	return false;
}
const bool Mutex::gSpinInKernelSpace = SpinInKernelSpace();
```

The choice of **10.12** (not Mozilla upstream's 10.15) is deliberate and explained in the comment: Mozilla's original used 10.15 because they paired `os_unfair_lock` with `OS_UNFAIR_LOCK_ADAPTIVE_SPIN`, which requires 10.15. i3roly separates those concerns — the lock itself needs only 10.12, and the adaptive-spin behavior is handled separately in the lock path.

4. A three-tier lock path on x86-64 (`Mutex.h` — `Lock()`)

The lock acquisition logic becomes a nested decision tree:

- **`gSpinInKernelSpace == false` (< 10.12):** use `OSSpinLockLock` directly.
- **`gSpinInKernelSpace == true` (≥ 10.12), running on macOS ≥ 10.15:** use `os_unfair_lock_lock_with_options` with both `OS_UNFAIR_LOCK_ADAPTIVE_SPIN | OS_UNFAIR_LOCK_DATA_SYNCHRONIZATION` flags.
- **`gSpinInKernelSpace == true`, running on macOS 10.12–10.14:** `OS_UNFAIR_LOCK_ADAPTIVE_SPIN` is unavailable, so the patch emulates user-space spinning manually: up to 100 `trylock`/`pause` iterations, then falls through to `os_unfair_lock_lock_with_options` with only `OS_UNFAIR_LOCK_DATA_SYNCHRONIZATION`.

The 100-iteration spin count is consciously reduced from `OSSpinLock`'s x86 default of 1000, with the reasoning documented inline — benchmarks show no regression and it reduces the risk of excessive spinning.

ARM is explicitly excluded from the user-space spin path with a `MOZ_CRASH`, matching Apple's own implementation which does not spin on ARM.

5. Symmetric unlock and trylock (`Mutex.h`, `Mutex.cpp`)

`Unlock()` and `TryLock()` mirror the same branching:

- `Unlock`: `OSSpinLockUnlock` vs. `os_unfair_lock_unlock` based on the flag.
- `TryLock`: `OSSpinLockTry` vs. `os_unfair_lock_trylock` based on `__builtin_available(macOS 10.12)`.

6. Static mutex initializer fixup (`Mutex.h`)

`STATIC_MUTEX_INIT` is updated from `OS_UNFAIR_LOCK_INIT` to a designated initializer targeting the union member:

```cpp
#define STATIC_MUTEX_INIT { .mUnfairLock = OS_UNFAIR_LOCK_INIT }
```

This is necessary because the union's default initializer must specify which member it addresses; the comment repeats the zero-equivalence justification so the hack is self-documenting.

---

### Thesis relevance

**Evidence of implicit system-layer dependency:** `os_unfair_lock_lock_with_options` and `os_unfair_lock_trylock` are symbols whose availability is entirely determined by the OS version component of the target tuple — they are not expressible in any project-layer dependency graph. This is a clean, concrete example of the implicit dependency layer your two-layer model formalizes.

**Human judgment as structural necessity:** The decision to lower the version gate from 10.15 to 10.12 — and then manually re-implement the adaptive-spin behavior for the 10.12–10.14 range — is not mechanically derivable. It required i3roly to read Apple's open-source `darwin-libplatform` implementation, understand why Mozilla's author chose 10.15, separate the concerns, and construct a three-tier fallback. No automated verification tool could reconstruct this reasoning chain.

**`OSSpinLock` itself is deprecated** (since macOS 10.12, in favour of `os_unfair_lock`). This means the patch is using a deprecated API as a fallback for a newer one — an inversion of the normal upgrade direction. This is a good concrete example for the thesis of a situation where dependency evolution cannot be handled by any "update to latest" heuristic; the *direction* of the substitution is determined by the target OS floor, not by recency.

## 17. `mfbt` subtree

### Files affected:
* `mfbt/RandomNum.cpp`

### 17.1. `mfbt/RandomNum.cpp`

**Summaries:**

This patch introduces a **runtime macOS version probe** and utilize it to **branch the random byte generation path** on Darwin/macOS.

**Taxonomy classification:**
1. **API availability guarding: (runtime)**

It is distinct from compile-time feature gating (preprocessor guards resolved at build time) — here the branching happens at runtime, because the same compiled binary must run correctly across a range of macOS versions within Momiji's support window. This patch shows that the implicit system layer dependency here is not merely a linker symbol (`getentropy`) but a conditional runtime dependency — the symbol exists in the binary's environment but must only be called when the runtime OS version confirms it is present.

**Relations:** none

**Explanations:**

`mfbt/RandomNum.cpp` implements `GenerateRandomBytesFromOS()`, the cross-platform OS-level CSPRNG (cryptographically secure pseudorandom number generator) interface in Mozilla's base library (`mfbt`). It dispatches to the appropriate OS primitive depending on the build target: `RtlGenRandom` on Windows, `arc4random_buf` on BSDs/WASI/older Apple platforms, and `/dev/urandom` or `getrandom()` on Linux.

The patch introduces a **runtime macOS version probe** and uses it to **branch the random byte generation path on Darwin**.

1. Darwin version detection (`readVersion` / `darwinVersion`)

A `readVersion()` function is added, using `uname()` to query the kernel's release string (e.g. `"16.7.0"` for macOS 10.12). It extracts the major Darwin kernel version as an integer. `darwinVersion()` wraps it with a static initialiser so the probe only runs once.

The static `macOSXVer` variable is lazily populated at the call site on first use.

2. Conditional `getentropy()` vs `arc4random_buf()`

Inside the `USE_ARC4RANDOM` branch — which covers Darwin among other targets — the patch inserts a Darwin-specific sub-branch:

- If the runtime Darwin version is **≥ 16** (i.e. macOS 10.12 Sierra and later), use **`getentropy()`** instead.
- Otherwise (Darwin < 16, i.e. macOS 10.11 and earlier), fall through to the original `arc4random_buf()`.

`getentropy()` was introduced in macOS 10.12 and is considered higher-quality entropy than `arc4random_buf()` for direct buffer filling. Its header `<sys/random.h>` is therefore conditionally included only on Darwin.

3. The `macOSXVer >= 16` threshold

Darwin kernel versions map to macOS versions as follows:

| Darwin | macOS |
|--------|-------|
| 11 | 10.7 Lion |
| 12 | 10.8 Mountain Lion |
| 13 | 10.9 Mavericks |
| 14 | 10.10 Yosemite |
| 15 | 10.11 El Capitan |
| **16** | **10.12 Sierra** |
| 17 | 10.13 High Sierra |
| 18 | 10.14 Mojave |

Momiji targets 10.7–10.14 (Darwin 11–18). The ≥ 16 branch therefore covers the upper portion of Momiji's supported range (10.12–10.14), while the `arc4random_buf` fallback covers 10.7–10.11.

---

This is necessary because `getentropy()` does not exist on macOS prior to 10.12. If Firefox's upstream code were compiled and run on 10.11 or earlier with `getentropy()` in the call path, it would either fail to link or crash at runtime. Since Mozilla dropped support for these older macOS versions, they had no reason to guard this; from their perspective, all Darwin targets have `getentropy()`. Momiji must re-introduce the guard.

The comment *"they left me with no choice"* and *"LEFT ME NO CHOICE"* are i3roly's annotations expressing that `getentropy()` is genuinely the better API and would have been used unconditionally if not for the legacy support constraint.

---

## 18. `mozglue` subtree

### Files affected:
* mozglue/baseprofiler/core/Flow.cpp
* mozglue/misc/AwakeTimeStamp.cpp
* mozglue/misc/Mutex_posix.cpp
* mozglue/misc/Now.cpp
* mozglue/static/rust/build.rs
* mozglue/static/rust/lib.rs

### 18.1. `mozglue/baseprofiler/core/Flow.cpp`

**Summary:**

Backport `clock_gettime` availability to macOS versions prior to 10.12.

**Taxonomy classification:**
1. **Runtime API/library substitution**

This patch is distinct from the *runtime library substitution* seen in the `config/recurse.mk` patch, which swapped a whole C++ standard library.

**Relations:** none

**Explanation:**

`Flow.cpp` contains a `CurrentTime()` function used by the base profiler to timestamp events. On non-Windows platforms, it calls `clock_gettime(CLOCK_MONOTONIC, &ts)` — a POSIX standard API. The problem: **`clock_gettime` was only introduced to macOS in 10.12 (Sierra)**. On 10.7–10.11, the symbol simply does not exist.

The patch introduces a polyfill:

1. **Guard block** (`#if !defined(MAC_OS_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_VERSION_10_12`): On pre-10.12 targets, it pulls in the older Mach kernel clock APIs (`mach/mach.h`, `mach/clock.h`) and defines a `RoTimingMach` struct (credited inline to [ChisholmKyle/PosixMachTiming](https://github.com/ChisholmKyle/PosixMachTiming)) with a static `clock_port`.

2. **`clock_gettime_missing()`**: A drop-in function that emulates `clock_gettime` semantics using `clock_get_time()` against Mach clock services — `CLOCK_REALTIME` via `cclock`, `CLOCK_MONOTONIC` via `clock_port`.

3. **Call-site branch** in `CurrentTime()`: On pre-10.12 builds, it routes through `clock_gettime_missing(CLOCK_UPTIME_RAW, ...)` instead of the native `clock_gettime`. (Note: `CLOCK_UPTIME_RAW` is passed here — a Mach-specific constant — rather than `CLOCK_MONOTONIC`, which is slightly more appropriate for raw uptime-based profiling timestamps on Apple hardware.)

---

### 18.2. `mozglue/misc/AwakeTimeStamp.cpp`

**Summary:**
1. Backporting `clock_gettime_nsec_np` to pre-10.12 macOS
2. Apply 2 independent housekeeping fixes on Windows and Linux

**Taxonomy classification:**
1. Runtime API/library substitution

**Relations:** none

**Explanation:**

The patch modifies three distinct platform branches.

**macOS branch — the primary legacy fix**

`AwakeTimeStamp::Now()` originally called `clock_gettime_nsec_np(CLOCK_UPTIME_RAW)`, a convenience wrapper that returns a raw `uint64_t` nanosecond count. This function was introduced in macOS 10.12 alongside `clock_gettime`. On 10.7–10.11 it is absent entirely.

The patch injects the same `RoTimingMach` / `clock_gettime_missing` polyfill block already seen in patch 089, guarded by the same `MAC_OS_VERSION_10_12` condition. The call site is then branched: pre-10.12 targets call `clock_gettime_missing(CLOCK_UPTIME_RAW, &tv)` and divide the result by `kNSperUS`; 10.12+ targets keep the original `clock_gettime_nsec_np` call.

There is a notable semantic issue here: `clock_gettime_missing` returns an `int` (a success/error code), not a nanosecond count. Dividing that return value by `kNSperUS` and feeding it into `AwakeTimeStamp(...)` would always yield a near-zero or garbage timestamp. The `tv` struct is populated as a side effect but its value is never read. This appears to be a **bug in the patch itself** — the correct expression would be something like `tv.tv_sec * kNSperUS + tv.tv_nsec / kNSperUS` or an equivalent conversion from `tv`. This is worth flagging as a case where a legacy compatibility fix introduced a silent correctness defect — the code compiles and links, but `AwakeTimeStamp::Now()` would return a meaningless value on pre-10.12 builds.

**Windows branch — dead code removal**

The second `AwakeTimeStamp::Now()` implementation using `QueryUnbiasedInterruptTimePrecise` is deleted. Only the `NowLoRes()` variant using `QueryUnbiasedInterruptTime` (non-precise) remains. This likely reflects that the precise variant was either redundant or had availability concerns on older Windows targets, but without the corresponding header or Windows-side patch it is harder to confirm.

**Linux branch — function rename/swap**

The `Now()` and `NowLoRes()` implementations are swapped: the body previously under `Now()` (using `clock_gettime(CLOCK_MONOTONIC, ...)`) is reassigned to `NowLoRes()`, and the `NowLoRes() { return Now(); }` forwarding stub is removed. This is a semantic clarification — the `CLOCK_MONOTONIC` path is lower resolution than whatever `Now()` is intended to use on Linux, so it belongs under the low-resolution variant.

---

### 18.3. `mozglue/misc/Now.cpp`

**Summaries:**

Backport `clock_gettime_nsec_np` to pre-10.12 macOS across two time-querying functions, with two minor incidental changes.

**Taxonomy classification:**
1. **Runtime library/API substitution**

**Relations:** none

**Explanation:**

1. **macOS branch — dual call-site polyfill**

`Now.cpp` exposes two functions: `NowExcludingSuspendMs()` (uptime excluding sleep) and `NowIncludingSuspendMs()` (monotonic time including sleep). Both originally called `clock_gettime_nsec_np`, one with `CLOCK_UPTIME_RAW` and the other with `CLOCK_MONOTONIC_RAW`. As established in patches 089 and 090, this symbol does not exist before macOS 10.12.

The patch injects the now-familiar `RoTimingMach` / `clock_gettime_missing` polyfill block under the same guard, then branches both call sites. On pre-10.12 builds, both functions route through `clock_gettime_missing` — `CLOCK_UPTIME_RAW` for the exclude-suspend variant, `CLOCK_MONOTONIC_RAW` for the include-suspend variant.

The **same correctness defect** from patch 090 is present here: both pre-10.12 branches divide the `int` return code of `clock_gettime_missing` by `kNSperMS` rather than converting the populated `ts` struct. The `ts` variable is allocated and passed in, but its value is never used — only the error/success integer comes back. This reinforces that the defect is a systematic copy-paste error across all three files sharing this polyfill pattern, not a one-off slip.

2. **`constexpr` → non-`constexpr` demotion**

`kNSperMS` is changed from `static constexpr uint64_t` to `const uint64_t` (dropping both `static` and `constexpr`). This is likely driven by a compiler constraint on older toolchains or older C++ standard modes — `constexpr` on non-literal or translation-unit-scoped variables can behave differently across compilers, and removing it makes the constant compatible with a wider range of compiler versions. This is a minor but deliberate compiler compatibility adjustment.

---

### 18.4. `mozglue/misc/Mutex_posix.cpp`

**Summaries:**

Guard a macOS-only mutex policy API behind a runtime availability check, preventing a crash on macOS versions below 10.14

**Taxonomy classification:**
1. **Feature gating:** 

**Relations:** none

**Explanation:**

`MutexImpl::MutexImpl()` initialises a POSIX mutex with optional policy attributes. On certain Apple platforms, when `POLICY_KIND` is defined, it calls `pthread_mutexattr_setpolicy_np` — a non-portable (`_np`) Apple extension that sets scheduling policy on a mutex attribute. This function was introduced in macOS 10.14 (Mojave).

The original code called it unconditionally. On any macOS version below 10.14, this would either fail to link (if the symbol is weak-linked and resolved to null) or crash at runtime (if the symbol is simply absent in the dynamic linker's view). Since Momiji targets as low as 10.7, this is a hard runtime hazard across the majority of the supported range.

The fix wraps the call in `__builtin_available(macOS 10.14, *)` — Clang's runtime availability guard. This compiles to a runtime OS version check: on 10.14+ the call proceeds normally; on older versions the block is silently skipped, leaving the mutex initialised without the policy attribute. The mutex remains functional — it just does not carry the scheduling policy hint.

This is structurally different from the previous three patches. Rather than substituting a missing symbol with a polyfill, the fix **conditionally omits the feature** when the host cannot support it. The behaviour degrades gracefully rather than being emulated.

---

### 18.5-6, `mozglue/static/rust/"build/lib.rs"`

**Summary:**

Maintain compatibility with both pre-1.81 and post-1.81 Rust compilers across the renaming of `std::panic::PanicInfo` to `std::panic::PanicHookInfo`.

**Taxonomy classification:**
1. **Toolchain API compatibility shim:**

The condition dealt with there is toolchain version rather than OS version. This newly definied abstraction boundary inserted to absorb a breaking change in the compiler's standard library across a version boundary.

**Relations:** none

**Explanations:**

1. **The deprecation event**

In Rust 1.81, `std::panic::PanicInfo` — previously the type passed to panic hook callbacks — was deprecated and replaced by `std::panic::PanicHookInfo`. The old name becomes a compiler warning in 1.82 and will eventually be removed. The two types are semantically equivalent but nominally distinct: code that imports `PanicInfo` for use as a panic hook parameter will produce warnings on 1.82+ and will eventually fail to compile entirely.

2. **`build.rs` — compiler version detection and flag emission (patch 093)**

`build.rs` is Rust's build script, executed by Cargo before compilation. The existing script already queries the Rust compiler version (`ver`) and emits conditional `cfg` flags based on it.

The patch makes two changes. First, the unconditional emission of `cargo::rustc-check-cfg` declarations for `has_panic_hook_info` and `oom_with` is wrapped in a `ver >= 1.80.0-alpha` guard — because `rustc-check-cfg` itself (the mechanism for declaring expected `cfg` keys) was stabilised in Rust 1.80. Emitting it on older compilers would produce an unknown flag warning or error.

Second, a new block emits `cargo:rustc-cfg=has_panic_hook_info` when `ver >= 1.81.0-beta` — that is, on any compiler that has the new type. This flag becomes available to the crate's source code as a `#[cfg(has_panic_hook_info)]` attribute.

3. **`lib.rs` — conditional type alias (patch 094)**

With the flag now available, `lib.rs` uses it to select which type to import under the name `PanicHookInfo`:

- On 1.81+: `use std::panic::PanicHookInfo` — the real, current type, no alias needed.
- On pre-1.81: `use std::panic::PanicInfo as PanicHookInfo` — the old type, imported under the new name via a type alias.

The rest of the codebase uses `PanicHookInfo` uniformly throughout. Neither branch requires any further change to calling code.

This is a textbook **type alias compatibility shim**: the divergence between compiler versions is absorbed entirely at the import boundary, and the downstream code is insulated from it.

---

### Conclusion

...in progress...

### Thesis relevance 

... in process ...

## 19. `netwerk` subtree

### Files affected:
* `netwerk/protocol/http/MicrosoftEntraSSOUtils.mm`
* `netwerk/test/http3server/moz.build`

### 19.1. `netwerk/protocol/http/MicrosoftEntraSSOUtils.mm`

**Summaries:**

Implements Microsft Entra SSO integration for Firefox on macOS. Replace modern Objective-C keyed **subscript syntax** with older **explicit message-send syntax** (identical to `accessible/mac`)

**Taxonomy classification:**
1. Syntax/API backport

**Relations:** none

**Explanations:**

Every change in this patch is a single mechanical substitution: modern Objective-C **keyed subscript syntax** (`dict[@"key"]`) is replaced with the older **explicit message-send syntax** (`[dict objectForKey:@"key"]`).

There are six such replacements across two logical contexts:

**1. `NSDictionary* headers` (HTTP response headers from the SSO delegate)**
```objc
// Before
[headersString appendFormat:@"%@: %@\n", key, headers[key]];
NSString* ssoCookies = headers[@"sso_cookies"];

// After
[headersString appendFormat:@"%@: %@\n", key, [headers objectForKey:key]];
NSString* ssoCookies = [headers objectForKey:@"sso_cookies"];
```

**2. `NSDictionary* ssoCookiesDict` (parsed JSON SSO payload)**
```objc
// Before
if (ssoCookiesDict[@"device_headers"]) { ... }
if (ssoCookiesDict[@"prt_headers"]) { ... }

// After
if ([ssoCookiesDict objectForKey:@"device_headers"]) { ... }
if ([ssoCookiesDict objectForKey:@"prt_headers"]) { ... }
```

**3. Inner `NSDictionary* headers` (individual header dicts in the SSO arrays)**
```objc
// Before
NSDictionary* headers = headerDict[@"header"];
NSString* value = headers[key];

// After
NSDictionary* headers = [headerDict objectForKey:@"header"];
NSString* value = [headers objectForKey:key];
```

**Root cause:** The `[]` subscript operator on `NSDictionary` was introduced as part of Objective-C *object literal and subscript syntax*, standardised in Clang with the **`objc_subscripting`** feature. This feature requires the Apple LLVM toolchain from approximately Xcode 4.4+ (2012) and, critically, requires the **`NSObject+NSKeyValueCoding`** category or a runtime that supports `objectForKeyedSubscript:`. On macOS 10.7 (Lion), the system Objective-C runtime predates reliable support for this subscript sugar at the compiler/runtime intersection that Momiji targets. The patch replaces the sugar with the canonical pre-10.8 message-send form that has always worked.

This is the same root issue as the `accessible/mac` patches (095-series share a pattern with the earlier subscript backports), just occurring in a completely different subsystem — network protocol handling rather than accessibility.

---

### 19.2. `netwerk/test/http3server/moz.build`

**Summaries:**

Revert the bug 1772575 patch for backward compatiblity

**Taxonomy classification:**
1. Linker behaviour modification

**Relations:** none

**Explanations:**

This patch explicitly cites a different commit (`1bc4ee894015`) and refers to Bug 1772575, which was a follow-up to 1770484 — it extended the same rpath-as-`@executable_path` logic to a specific executable (`http3server`) that wasn't covered by the global rules change. It is also narrower: comments out a single `LDFLAGS` addition scoped to one test binary. The mechanism is also slightly different — here the rpath is added directly as a linker flag rather than via whatever build system abstraction `rules.mk` uses.

### Conclusion
...in progress...

### Thesis relevance
...in progress...

## 20. `python` subtree

### Files affected:
* `python/mozboot/mozboot/osx.py`
* `python/mozboot/mozboot/util.py`
* `python/mozbuild/mozbuild/test/configure/macos_fake_sdk/SDKSettings.plist`
* `python/mozbuild/mozbuild/test/configure/test_toolchain_configure.py`

### 20.1. `python/mozboot/mozboot/util.py`

**Summaries:**

This patch a single logical change: it lowers the minimum required Rust version from 1.82.0 to 1.72.0.

**Taxonomy classification:**
1. **Build environment constraint**

**Relations:** none

**Explanation:**

The patch makes a single logical change: it lowers the minimum required Rust version from 1.82.0 to 1.72.0.
It also removes the comment `# Keep in sync with rust-version in top-level Cargo.toml.` — which is not cosmetic cleanup but a deliberate signal that this version pin is now intentionally decoupled from the upstream `Cargo.toml`. i3roly is explicitly acknowledging that the two values will diverge and the synchronization invariant no longer applies.

`mozboot` is the bootstrapping component of the build system — when a developer runs `./mach bootstrap`, `mozboot` checks the host environment and validates that prerequisites like Rust are at or above this minimum before proceeding. Lowering the floor means the build system accepts an older Rust toolchain as sufficient.

This connects directly to the host environment constraint. macOS 10.14 Mojave is the build machine's OS. Newer Rust compiler releases progressively raise their own minimum macOS deployment target and may produce binaries or link against system APIs unavailable on 10.14. Rust 1.82.0 (released October 2024) requires a considerably more modern host environment than 1.72.0 (released August 2023). By pinning to 1.72.0, i3roly ensures that:
1. The Rust toolchain itself can actually run on a 10.14 host.
1. Rust-compiled components don't inadvertently link against symbols absent from the 10.14 SDK.


### 20.2. `python/mozbuild/mozbuild/test/configure/test_toolchain_configure.py`

**Summaries:**

The patch modifies a unit test inside mozbuild's toolchain configuration test suite. Specifically, it updates the expected value of the `-mmacosx-version-min` compiler flag in the `OSXToolchainTest` class — from 10.15 down to 10.13.

**Taxonomy classification:**
1. **Build environment constraint**

**Relations:** none

**Explanation:**

The patch modifies a unit test inside `mozbuild`'s toolchain configuration test suite. Specifically, it updates the expected value of the `-mmacosx-version-min` compiler flag in the `OSXToolchainTest` class — from 10.15 down to 10.13.

This test asserts what compiler flags the build system should emit when targeting macOS. The assertion is effectively: *"when configuring the toolchain for macOS, the compiler invocation must include `-mmacosx-version-min=10.13`."* Changing the expected value from 10.15 to 10.13 updates the test to match the actual deployment target that Momiji is built against.

### 20.3. `python/mozbuild/mozbuild/test/configure/macos_fake_sdk/SDKSettings.plist`

**Summaries:**

The patch modifies a test fixture — a fake macOS SDK used by `mozbuild`'s toolchain configuration tests. It lowers the declared SDK version inside `SDKSettings.plist` from 15.5 (macOS Sequoia's SDK) to 10.13.

**Taxonomy classification:**
1. **Build environment constraint**

**Explanation:**

The patch modifies a test fixture — a fake macOS SDK used by mozbuild's toolchain configuration tests. It lowers the declared SDK version inside `SDKSettings.plist` from 15.5 (macOS Sequoia's SDK) to 10.13.

`SDKSettings.plist` is the file that Xcode and the macOS toolchain read to determine what SDK version is present at a given sysroot path. The `macos_fake_sdk` directory is a minimal stub that mimics this structure so the test suite can exercise SDK-detection logic without requiring a real Xcode installation. By changing the declared version here, the fake SDK now reports itself as a 10.13 SDK rather than a 15.5 one.

This is the direct companion to the previous patch. Patch 099 updated the test assertion — the expected output of toolchain configuration — to require `-mmacosx-version-min=10.13`. This patch updates the input side of the same test: the fake SDK that the test feeds into the toolchain configuration logic now declares itself as version 10.13. Together, the two patches form a coherent unit: input (fake SDK version) and expected output (compiler flag) are brought into alignment with each other and with the real deployment target.
Without this patch, the test logic would be internally inconsistent — the fake SDK would claim to be a 15.5 SDK while the test asserts a 10.13 deployment flag is emitted, which may or may not cause test failures depending on how the SDK version feeds into the flag derivation logic, but would certainly represent a misleading test environment.

### 20.4. `python/mozboot/mozboot/osx.py`

**Summaries:**

This patch modifies core `mach` bootstraper so as to make it works on macOS 10.14.

**Taxonomy classification:**
1. **Runtime toolchain substitution**: replace Homebrew by Macports
2. **Build environment constraint:** `os_version > 10.15` preprocessor-style in Python
3. **Feature gating:** artifact mode is disabled globally

**Relations:** none

**Explanations:**

1. Package manager switch: Homebrew → MacPorts

The most structurally significant change is in `_ensure_homebrew_found()`:

```python
# Before
self.brew = to_optional_path(which("brew"))
# After
self.brew = to_optional_path(which("port"))
```

`port` is the MacPorts package manager, not Homebrew's `brew`. Despite the method retaining its `homebrew`-prefixed name, the underlying tool being invoked is now MacPorts. All subsequent command construction — `install`, `installed`, `outdated` — is also updated to match MacPorts's CLI conventions (e.g., `port installed` vs `brew list`, `port outdated` vs `brew outdated --quiet`). Commands are also prepended with `sudo`, which MacPorts requires and Homebrew explicitly discourages. The `--formula`/`--cask` flag distinction (a Homebrew concept) is dropped entirely since MacPorts has no equivalent.

This is a wholesale substitution of package manager, not a compatibility shim.

2. macOS version-gated installation logic

A new conditional branch is introduced around `self.os_version < Version("10.15")`, targeting macOS Mojave (10.14) and below:

- **LLVM is force-installed first** (`llvm-11`), with a comment explaining that if it isn't, the system will attempt to install a newer LLVM that fails to build on this OS. This is a sequencing constraint imposed by the system layer.
- LLVM is then added to an `exclude_recent_versions` list, causing it to be skipped during the general dependency installation loop via `--ignore-dependencies`. This prevents the package manager from pulling in a newer incompatible LLVM version as a transitive dependency.
- **`watchman` is explicitly excluded** on Mojave with a comment that it is not mandatory and is "very problematic" to manage. This is a pragmatic carve-out — watchman is a file-watching utility used for development convenience, not a build requirement.
- The install and upgrade loops are wrapped in `try/except` with `traceback.print_exc()`, acknowledging that package installation on Mojave is unreliable enough to warrant graceful degradation rather than hard failure.

3. Android toolchain: artifact mode disabled, AVD handling restructured

Several changes affect the Android bootstrapping path:

- `artifact_mode` is hardcoded to `False` throughout — in `install_mobile_android_packages`, `install_mobile_android_artifact_mode_packages`, and `generate_mobile_android_artifact_mode_mozconfig`. Mozilla's artifact mode (downloading pre-built binaries instead of compiling) is disabled.
- The AVD (Android Virtual Device) manifest selection is restructured: the first `ensure_android` call no longer selects an AVD manifest; instead, separate subsequent calls with `system_images_only=True` handle each architecture's AVD images explicitly. On x86_64 hosts, both `AVD_MANIFEST_X86_64` and `AVD_MANIFEST_ARM` are installed; on arm64, only `AVD_MANIFEST_ARM64`.
- AVD artifact constants are renamed: `X86_64_ANDROID_AVD` → `MACOS_X86_64_ANDROID_AVD`, `ARM64_ANDROID_AVD` → `MACOS_ARM64_ANDROID_AVD`, with a new `MACOS_ARM_ANDROID_AVD` added.

4. Minor: `gnu-tar` → `gnutar`, `rust` and `cargo` added to packages

The package name `gnu-tar` is corrected to `gnutar` (the MacPorts port name). `rust` and `cargo` are added to the base package list, likely because the MacPorts environment does not guarantee their availability the way a modern Homebrew setup might, or to ensure a controlled version consistent with patch 098's lowered minimum.

5. `OSXAndroidBootstrapper(object)` explicit base class

A cosmetic Python 2-era compatibility marker — making the class explicitly inherit from `object`. Given everything else in this patch, this is likely a residual artefact from the Firefox-Dynasty codebase rather than a meaningful change.

---

## 21. `security` subtree

### Files affected:
[`security/manager/ssl/osclientcerts` site]
* **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/moz.build`
* **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/osclientcerts.symbols`
* **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/stub.cpp`
* **[new file]** `security/manager/ssl/osclientcerts/moz.build`
* `security/manager/ssl/osclientcerts/Cargo.toml`
* `security/manager/ssl/osclientcerts/src/backend_macos.rs`
* `security/manager/ssl/osclientcerts/src/bindings_macos.rs`

[`security/certverifier` site]
* `security/certverifier/NSSCertDBTrustDomain.cpp`

[`security/rlbox` site]
* `security/rlbox/moz.build`

[`security/sandbox` aite]
* `security/sandbox/common/test/SandboxTestingChildTests.h`
* `security/sandbox/mac/Sandbox.mm`
* `security/sandbox/mac/SandboxPolicyContent.h`
* `security/sandbox/mac/SandboxPolicyGMP.h`
* `security/sandbox/mac/SandboxPolicyRDD.h`
* `security/sandbox/mac/SandboxPolicySocket.h`
* `security/sandbox/mac/SandboxPolicyUtility.h`

### 21.1. `security/certverifier/NSSCertDBTrustDomain.cpp`

**Summaries:**

Conditionally includes `nsCocoaFeatures.h` when building for macOS (`MOZ_WIDGET_COCOA` guard).

**Taxonomy classification:**
1. **Feature gating:** runtime OS version check infrastructure
2. **API/Syntax backport:** provide version-query surface which enables conditional branching over legacy-incompatible code paths

**Relations:** none

**Explanation:**

The patch adds exactly 4 lines to this file's include block:
```c
#ifdef MOZ_WIDGET_COCOA
#   include "nsCocoaFeatures.h"
#endif
```

This conditionally includes `nsCocoaFeatures.h` only when building on macOS (`MOZ_WIDGET_COCOA` is `true`). `nsCocoaFeatures.h` is the standard Gecko header which exposes runtime macOS version query functions - same header which has been seen throughout Momiji's `accessible/mac` patches.

The patch itself only introduces the *include*; it does show which call sites that use it. This mean the patch is a **prerequisite** for downstream code elsewhere in `NSSCertDBTrustDomain.cpp` which calls `nsCocoaFeatures` APIs to gate security behaviour based on macOS version at runtime. The patch file is narrow by design - it isolates the header dependency addition as a clean, reviewable unit.

The most likely consumer is version-gated logic about **Certificate Transparency** enforcement or **trut evaluation paths** that diverged among macOS releases - where Apple's security framework APIs or behaviour changed across macOS 10.7-10.14.

### 21.2. `security/rlbox/moz.build`

**Summaries:**

The patch replaces a 2-line abstraction (`include("rlbox.mozbuild") / RLBoxLibrary("rlbox")`) with the full, explicit build definition that the abstraction would have generated - plus several additions for newer sandboxed libraries.

**Taxonomy classification:**
1. **Build graph surgery:**
* `GeneratedFile` rule
* Explicit `WASM_SOURCES`/`SOURCES` declarations reconstruct the dependency graph edges that the `RLBoxLibrary()` abstraction was generating implicitly but incorrectly (or not at all) on the legacy toolchain.

2. **Preprocessor branch collapse:**
* `DEFINES` block collapses runtime configuration decisions that the macro was making internally into explicit, visible preprocessor constants.

**Relations:** none

**Explanation:**

The patch replaces a 2-line abstraction (`include("rlbox.mozbuild") / RLBoxLibrary("rlbox")`) with the full, explicit build definition that the abstraction would have generated - plus several additions for newer sandboxed libraries.

The old code delegated to a `RLBoxLibrary()` macro and a shared `.mozbuild` include, which presumably worked on the build toolchain versions that Mozilla targets. The patch **inlines and expands** what that abstraction produces.

1. **WASM compilation pipeline made explicit.**

`WASM_SOURCES` now directly lists the allocator (`mozalloc.cpp`) and the wasm2c sandbox wrapper. `SOURCES` adds the generated C translation of the WASM module (`!rlbox.wasm.c`) and the wasm2c runtime implementation files. The `!` prefix denotes a generated (not source-tree) file.

2. **Runtime configuration** via `RLoxLibrary()`

Six `DEFINES` are added to configure the wasm2c runtime for Firefox's development:
* `WASM_RT_USE_MMAP`: use mmap-style allocation (legacy compatible on macOS 10.7+)
* `WASM_RT_SKIP_SIGNAL_RECOVERY`: defer to Firefox's own signal handler rather than registering a competing one.
* `WASM_RT_TRAP_HANDLER`/`WASM_RT_GROW_FAILED_HANDLER`: hook wasm traps and memory growth failures into Firefox's crash reporting infrastructure.
* `WASM_RT_USE_STACK_DEPTH_COUNT = 0`: disable nested call depth limiting.

3. `GeneratedFile` **rule added**. 

This is the most important structural addition. It defines the build graph edge that takes `rlbox.wasm` (compiled WASM binary) and runs `wasm2c.py` to produce `rlbox.wasm.c` - the C translation that is then compiled as a normal source file. Without this rule, the generated file has no declared provenance in the build graph.

4. **SoundTouch sandbox added.**

The patch extends the conditional sandboxing blocks (which already existed for Hunspell and WOFF2) to cover `libsoundtouch`, including optional SIMD/SSE paths via `simde` (SIMD Everywhere, the same portability shim seen the `LOCAL_INCLUDES` line that was already present).

**Reason that the abstraction dropping the `GeneratedFile` rule:** The `RLBoxLibrary()` macro likely relied on a newer version of the Mozilla build system that knows how to synthesize the `GeneratedFile` step automatically. On the older toolchain which Momiji targets, that synthesis either does not exist ot produces incorrect output - so the macro is patched with the fully spelled-out equivalent.

### `security/manager/ssl/osclientcerts` site

#### 21.3. `security/manager/ssl/osclientcerts/Cargo.toml`

**Summaries:**

Add a single Rust dependency: `whatsys` crate at version 0.3.

**Taxonomy classification:**
1. **Feature gating:** provide runtime OS version check infrastructure - same category as Patch 101, now in the Rust subsystem.
2. **Build graph surgery:** adding a Cargo dependency modifies the project layer of the dependency graph, introducing a new node (`whatsys 0.3`) and its transitive closure into the build.

**Relations:** none

**Explanation:**

`whatsys` is a small cross-platform Rust crate whose sole purpose is to report the **host OS version at runtime**. On macOS it returns the version triple (major, minor, patch) of the running system. It is deliberately minimal - no unsafe code beyond what the OS call requires, no large dependency tree.

The addition is unconditional (no `[target.cfg(...)]` guard), meaning it is pulled into the build on all platforms, through on non-macOS platforms it simply returns the relevant OS version for whatever platform it is on and is presumably used only inside `#[cfg(target_os = "macos")]` gated code blcoks in the crate's Rust source.

This is, as you suspected, a dependency *prerequisite* patch - the same pattern as Patch 101. The actual call sites will appear in companion patches to the `.rs` source files of this crate.

#### 21.4. `security/manager/ssl/osclientcerts/src/backend_macos.rs`

**Summaries:**

This patch has 4 distinct but tightly related layers:
1. **The `whatsys` version gating mechanism**
2. **Migration of 3 Security framework functions from static to dynamic loading**
3. **Migration of algorithm string constants from static to dynamic**
4. **Addition of `SecTrustEvaluate` as a deprecated-API fallback.**

**Taxonomy classification:**
1. **Feature gating**: using `macos_kernel_major_version()` predicate gates based on `osver` property.
2. **Linker behaviour modification:** migrate static symbol references to dynamic `library.get()` calls
3. **Syntax/API backport:** migrating all static-linked methods to dynamic-linked methods under the `SECURITY_FRAMEWORK` implementation.

**Relations:**
1. `security/manager/ssl/osclientcerts/src/backend_macos.rs`
1. `security/manager/ssl/osclientcerts/src/bindings_macos.rs`

These files are where the above static-to-dynamic migration is explicitly implemented.

1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/moz.build`
1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/osclientcerts.symbols`
1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/stub.cpp`
1. **[new file]** `security/manager/ssl/osclientcerts/moz.build`

These restored files are necessary to restore the old dynamic link schema which was eliminated in recent Firefox revisions.

**Explanation:**

**1. The `whatsys` version-gating mechanism.**

```rust
const MACOS_KERNEL_MAJOR_VERSION_MOJAVE: u32 = 18;

fn macos_kernel_major_version() -> Result<u32, ParseMacOSKernelVersionError> {
    let ver = whatsys::kernel_version();
    // splits "18.7.0" → takes "18" → parses to u32
}
```

The constant `18` is the Darwin kernel major version corresponding to macOS 10.14 (Mojave). This is the version boundary at which `SecTrustEvaluateWithError` became available. Below Mojave (kernel < 18), the patch falls back to the deprecated `SecTrustEvaluate`. The comment explicitly attributes the technique to `cubeb-coreaudio`, a Mozilla audio crate that faced the same problem.

Note the version query is at the **kernel** level (`whatsys::kernel_version()`), not the macOS marketing version — Darwin 18 = macOS 10.14, Darwin 17 = 10.13, etc. This is consistent with how `darwinVersion()` works in the C layer, and avoids the unreliability of parsing the marketing version string.

**2. Migration of three Security framework functions from static to dynamic loading.**

The original code called `SecKeyCreateSignature`, `SecKeyCopyAttributes`, and `SecKeyCopyExternalRepresentation` as statically linked symbols — meaning the binary would fail to load entirely on macOS versions where these symbols don't exist in `Security.framework`. These three functions were introduced in macOS **10.12**.

The patch migrates them into the `SecurityFramework` struct's dynamic loading machinery (the same `library.get::<FnType>(b"SymbolName\0")` pattern already used for `SecCertificateCopyKey` and `SecTrustEvaluateWithError`). They are loaded at runtime via `libloading` and wrapped in safe accessor methods on `SecurityFrameworkHolder`. If they fail to load, calls return `Err` rather than causing a crash.

**3. Migration of algorithm string constants from static to dynamic.**

The original code accessed `kSecKeyAlgorithmECDSASignatureDigestX962SHA1` and related constants directly as static C symbols. These are also 10.12+ additions. The patch moves all of them into the `SecStringConstant` enum and loads them through the `get_sec_string_constant()` lookup table — the same mechanism already used for the 10.13 PSS algorithm constants. The `SecAttrKeyTypeECSECPrimeRandom` attribute constant is similarly migrated.

**4. Addition of `SecTrustEvaluate` as a deprecated-API fallback.**

```rust
if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_MOJAVE) {
    let _ = SECURITY_FRAMEWORK.sec_trust_evaluate_with_error(&trust)?;
} else {
    let _ = SECURITY_FRAMEWORK.sec_trust_evaluate(&trust)?;
}
```

`SecTrustEvaluateWithError` is 10.14+. On 10.7–10.13, the patch falls back to `SecTrustEvaluate`, which is deprecated since 10.15 but available all the way back to OS X 10.3. The `null_mut()` passed for the result pointer is intentional — the comment in the original code explains the result is ignored (only the side effect of building the issuer chain matters).

---

#### 21.5. `security/manager/ssl/osclientcerts/src/bindings_macos.rs`

**Summaries:**

This patch delete all 21 static declarations which is only available since macOS 10.12.

**Taxonomy classification:**
1. **Linker behaviour reversion**: removing static `extern "C"` declarations

**Relations:**
1. `security/manager/ssl/osclientcerts/src/backend_macos.rs`

In `backend_macos.rs`, all static methods are replaced with dynamically linked methods; the deletion of static declarations in `binding_macos.rs` is simply its counterpart.

These files are where the above static-to-dynamic migration is explicitly implemented.

1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/moz.build`
1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/osclientcerts.symbols`
1. **[new file]** `security/manager/ssl/osclientcerts/dynamic-library/stub.cpp`
1. **[new file]** `security/manager/ssl/osclientcerts/moz.build`

These restored files are necessary to restore the old dynamic link schema which was eliminated in recent Firefox revisions.

**Explanation:**

This patch is a **pure deletion** — 21 lines removed, nothing added.

Every declaration removed here is a macOS 10.12+ symbol:

- Three function bindings: `SecKeyCreateSignature`, `SecKeyCopyAttributes`, `SecKeyCopyExternalRepresentation`
- Eight algorithm string constants: `kSecKeyAlgorithmECDSA*`, `kSecKeyAlgorithmRSASignatureDigestPKCS1v15*`, `kSecKeyAlgorithmRSASignatureRaw`
- One attribute constant: `kSecAttrKeyTypeECSECPrimeRandom`

These are precisely the symbols that Patch 104 migrated from static to dynamic loading. The deletion here is the necessary **counterpart** to that migration: Patch 104 removed the call sites that used these static bindings and replaced them with `library.get()` dynamic calls; this patch removes the static declarations themselves.

Leaving the `extern "C"` declarations in place after the migration would cause the linker to attempt to resolve them as static symbols at link time — exactly the failure mode the migration was designed to avoid. A Rust `extern "C" { pub fn Foo(...) }` declaration is an unconditional promise to the linker that `Foo` exists as a linked symbol; `pub static kSomeConstant: CFStringRef` likewise. On macOS 10.7–10.11, those symbols do not exist in `Security.framework`, so the binary would fail to load.

The one `extern "C"` declaration that is **not** removed — `SecTrustSetNetworkFetchAllowed` (10.9+) — remains because it is still accessed statically. Since Momiji's minimum target is 10.7 but the certificate handler presumably requires at least 10.9 for basic operation, this is an acceptable residual assumption.

---

### `security/sandbox` site - SBPL cluster

#### 21.6. `security/sandbox/common/test/SandboxTestingChildTests.h`

**Summaries:**

Add `nsCocoaFeatures.h` under `XP_MACOSX`, then use its `OnCatalinaOrLater()` to select between 2 filesystem paths.

**Taxonomy classification:**
1. **Feature gating:** runtime OS version check (`OnCatalinaOrLater()`)

**Relations:** none

**Explanation:**

The substantive change there is the path selection:
```cpp
if (nsCocoaFeatures::OnCatalinaOrLater()) {
    uri = "/System/Applications/Utilities/Console.app";
} else {
    uri = "/Applications/Utilities/Console.app";
}
```

Why two paths? Apple reorganised the system application layout in macOS 10.15 (Catalina). Before Catalina, system utilities lived under `/Applications/Utilities/`. From Catalina onwards, they moved to `/System/Applications/` (or `/System/Applications/Utilities/` for the utilities subdirectory), and `/Applications/Utilities/` became a set of symlinks pointing to the new location. The sandbox test needs a path that actually exists as a real application bundle on the running system, because the test verifies that `LSOpenCFURLRef` attempts the open and is then blocked by the sandbox policy — if the path doesn't exist, the call would fail for the wrong reason, invalidating the test result.

The `OnCatalinaOrLater()` boundary is macOS 10.15, which is slightly above Mojave (10.14) but within the range that Momiji's extended support touches via the existing `nsCocoaFeatures` version ladder.

#### 21.7. `security/sandbox/mac/SandboxPolicyContent.h`

**Summaries:**

This is the most complicated patch so far, which incorporates 8 distinct layers:
1. 10.7 IPC shared memory compatibility
2. Capability-guarded deny rules via `defined?`
3. `file-map-executable` fallback
4. `sysctl-name` predicate compatibility

**Taxonomy classification:**
1. **Feature gating:**
* Pervasive use of both `(defined? 'operation')` and `(>= macosVersion NNNN)` predicates to gate SBPL operations across a version range spanning 10.7-10.14 (and beyond).

2. **Syntax/API backport**
* 10.7 IPC shared memory aliasing block is a direct backport of a syntax compatibility shim: redifining newer operation names to point at the coarser older equivalent so that later policy rules can be written uniformly.

**Relations:** none

**Explanation:**

**1. macOS 10.7 (Lion) IPC shared memory compatibility.**
```scheme
(if (<= macosVersion 1007)
  (begin
    (define ipc-posix-shm* ipc-posix-shm)
    (define ipc-posix-shm-read-data ipc-posix-shm)
    ...))
```
On 10.7, SBPL's granular `ipc-posix-shm-read-data` / `ipc-posix-shm-write-data` operations do not exist — only the coarse `ipc-posix-shm` does. The patch **aliases** the fine-grained names to the coarse one for 10.7, so that later policy rules using the fine-grained names compile correctly on Lion. The technique is sourced directly from Apple's own WebKit2 sandbox profiles (the comment cites the opensource.apple.com URL explicitly).

**2. Capability-guarded deny rules via `defined?`.**
```scheme
(if (defined? 'nvram*) (moz-deny nvram*))
(if (defined? 'iokit-get-properties) (moz-deny iokit-get-properties))
(if (defined? 'file-map-executable) (moz-deny file-map-executable))
```
`process-info*`, `nvram*`, `iokit-get-properties`, and `file-map-executable` are SBPL operations introduced at different macOS versions. The original code unconditionally denied them, which would cause the sandbox profile to fail to compile on older macOS where the operation names are undefined. The patch guards each with either a `defined?` check (for named operations) or a version predicate (for `process-info*`, which is 10.9+).

**3. `file-map-executable` fallback.**
The `file-map-executable` operation needs two treatments: on systems where it exists, both `file-map-executable` and `file-read*` must be allowed for system paths; on systems where it doesn't exist, only `file-read*` is needed (executable mapping is implicitly permitted). The patch restructures the relevant block into an if/else on `defined?`.

**4. `sysctl-name` predicate compatibility.**
```scheme
(if (<= macosVersion 1009)
  (allow sysctl-read)        ; allow ALL sysctl reads on 10.9
  (allow sysctl-read         ; allow specific names on 10.10+
    (sysctl-name-regex ...)
    ...))
```
The `sysctl-name` predicate was introduced in 10.10. On 10.9, the only option is `(allow sysctl-read)` without a filter. The patch also removes several `sysctl-name` entries that reference hardware features not present on pre-Apple-Silicon hardware (`hw.perflevel0.logicalcpu_max`, `hw.perflevel1.logicalcpu_max`, `hw.optional.avx512f`) — these were added for M1/M2 Macs and are irrelevant to Momiji's x86 target range.

**5. `ipc-posix-shm` granularity on 10.7.**
The `cfprefs` IPC shared memory rule uses `ipc-posix-shm-read-data`, which doesn't exist on 10.7. The patch wraps it in an if/else: coarse `ipc-posix-shm` on ≤10.7, fine-grained on later versions.

**6. Mach service versioning.**
Several Mach service lookups are wrapped in version predicates:
- `com.apple.coremedia.videodecoder/videoencoder` (XPC services) — gated to ≥10.13 where XPC service name lookups in sandboxes are supported
- `com.apple.xpcd` — only on exactly 10.9 (bug 1312273)
- `com.apple.trustd.agent` — previously gated to ≥11.0 (Big Sur), now unconditional (the gate is removed, making it available on all versions)
- `com.apple.MTLCompilerService` — gated to ≥10.14 where Metal became the required graphics API
- `com.apple.FontServer` — only on ≤10.11 where the old font server was still used
- `com.apple.audio.AudioComponentRegistrar` — gated to ≥10.13

**7. IOKit client expansion.**
The `iokit-open` block gains several GPU-related user client classes (`AppleGraphicsPolicyClient`, `AppleIntelMEUserClient`, `AppleMGPUPowerControlClient`, etc.) that are needed for WebGL and graphics acceleration on older hardware configurations common in the 10.7–10.14 era. The ARM-specific `iokit-get-properties` rules for `IOPlatformDevice` and `IOService` are additionally wrapped in a `(>= macosVersion 1100)` guard with the comment that these are Big Sur+ / Apple Silicon rules.

**8. Font access workaround for ≤10.11.**
```scheme
(if (<= macosVersion 1011)
  (allow file-read*
    (regex #"\.[oO][tT][fF]$" ...)
    ...))
```
On 10.11 and earlier, sandbox extensions for fonts are not automatically issued (bug 1460917), so the patch explicitly allows reading font files by extension. This is a known regression in Apple's sandbox framework that was only fixed in 10.12.

The `SandboxPolicyContentAudioAddend` section receives a parallel treatment: the same 10.7 IPC shared memory aliases are reproduced there, along with a ≤10.7 guard for the audio-specific IPC names, plus restoration of several audio plug-in path allowances that appear to have been dropped from a historical version.

---

#### 21.8. `security/sandbox/mac/SandboxPolicyGMP.h`

**Summaries:**

This patch is the direct continuation of SBPL patching scheme from the previous patch, all of which have direct counterparts in Patch 107 across 6 compatibility layers:
1. `macosVersion` parameter - newly introduced in this policy
2. **Capability-guarded deny rules**
3. `file-map-executable` **if/else fallback** (identical to 21.7 patch)
3. **New unconditional allowances**
4. `user-preference-read` block
5. `sysctl-read` remains unconditional.

**Taxonomy classification:**
1. **Feature gating:** same as patch 21.7 with `macosVersion` predicates and `defined?` guards
2. **Syntax backport:**

The `(define macosVersion ...)` addition is the necessary precondition for all version-gated rules; without it the GMP policy had no access to the version parameter at all.

**Relations:**
1. `security/sandbox/mac/SandboxPolicyContent.h`

This patch is the direct continuation of SBPL patching scheme from this patch.

**Explanation:**

The structural pattern is identical, and several blocks are **literally copied** from Patch 107 into this file. This is not coincidence — it reflects the fact that both policies share the same SBPL compatibility surface: both run on the same OS, encounter the same missing operations on older releases, and need the same version-gated workarounds.

The patch applies six compatibility layers, all of which have direct counterparts in Patch 107:

**1. `macosVersion` parameter — newly introduced in this policy.**
```scheme
(define macosVersion (string->number (param "MAC_OS_VERSION")))
```
The GMP policy did not previously bind the `MAC_OS_VERSION` parameter at all. This is the prerequisite for every version-gated rule that follows — without this `define`, every `(>= macosVersion ...)` predicate would be an error. The content policy already had this; the GMP policy is receiving it for the first time.

**2. Capability-guarded deny rules — identical to Patch 107.**
`process-info*` (≥10.9), `nvram*` (`defined?`), and `file-map-executable` (`defined?`) receive exactly the same treatment as in the content policy. The `process-info-pidinfo` and `process-info-setcontrol` allowances are correspondingly wrapped in `(>= macosVersion 1009)`.

**3. `file-map-executable` if/else fallback — identical pattern to Patch 107.**
System library paths, plugin paths, and test paths are wrapped in the same `(defined? 'file-map-executable)` if/else structure: where the operation exists, both `file-map-executable` and `file-read*` are granted; where it doesn't, only `file-read*` is granted. The GMP policy needs this for the plugin binary path specifically — the plugin `.dylib` must be executable-mapped for the process to load it.

**4. New unconditional allowances.**
Three rules are added without version guards:
- `(allow job-creation (literal "/Library/CoreMediaIO/Plug-Ins/DAL"))` — DAL (Device Abstraction Layer) camera plug-ins, needed for media capture in GMP
- `(allow iokit-set-properties (iokit-property "IOAudioControlValue"))` — audio volume/control IOKit property
- `com.apple.trustd.agent` Mach lookup — certificate trust daemon, now unconditional (same change as in Patch 107, where it was also de-gated from ≥11.0)

**5. `user-preference-read` block — gated to ≥10.8, copied from Patch 107.**
The large `preference-domain` block covering `kCFPreferencesAnyApplication`, `com.apple.ATS`, `com.apple.CoreGraphics`, and ~20 others is added verbatim from the content policy, wrapped in `(>= macosVersion 1008)`. The `user-preference-read` operation with named preference domains requires 10.8+; on 10.7 this block would fail to compile.

**6. `sysctl-read` remains unconditional.**
Unlike the content policy which gates `sysctl-read` with name predicates on ≥10.10, the GMP policy retains `(allow sysctl-read)` without predicates — a broader allowance, but consistent with the GMP process having less strict sandboxing requirements than the content process.

---

#### 21.9. `security/sandbox/mac/SandboxPolicyRDD.h`

**Summaries:**

The 3rd consecutive SBPL policy patch, which fix 9 distinct layers:
1. **10.7 IPC shared memory compatibility block** (present in all 3)
2. **Capability-guarded deny rules** (same as (107/108))
3. **`var_folders` regrex infrastructure.** (*unique*)
4. **`sysctl-read` fallback:** (consistent with patch 107)
5. **IPC POSIX shared memory for <= 10.7 - variant form**
6. **XPC service name lookups** - gated to >= 10.13
7. **Substantial new Mach service allowances - unconditional.**
8. **`user-preference-read` and Metal - version-gated.**
9. **Audio and AppKit framework services - expanded.**

**Taxonomy classification:**
1. **Feature gating**
2. **Build graph surgery**

**Relations:**

1. `security/sandbox/mac/SandboxPolicyGMP.h`

This patch is the direct continuation of SBPL patching scheme from the previous patch.

**Explanation:**

**1. The 10.7 Lion IPC shared memory compatibility block — copied verbatim from Patch 107.**
Same `ipc-posix-shm*` aliasing as in the content and GMP policies. Now present in all three.

**2. Capability-guarded deny rules — same pattern as Patches 107/108.**
`process-info*` (≥10.9), `nvram*` (`defined?`), `iokit-get-properties` (`defined?`), `file-map-executable` (`defined?`) — all four, consistently applied.

**3. `var-folders` regex infrastructure — unique to this patch.**
```scheme
(define resolving-regex regex)
(define var-folders-re "^/private/var/folders/[^/][^/]")
(define var-folders2-re ...)
(define (var-folders-regex ...) ...)
(define (var-folders2-regex ...) ...)
```
This is new relative to the other two policies. The `var-folders` hierarchy (`/private/var/folders/XX/...`) is macOS's system for per-user temporary directories. Media subsystems write lock files there (specifically `mds.lock` for the metadata server). The patch adds both the regex helper definitions and the rule that uses them:
```
(allow file-write* (var-folders2-regex "/mds\.lock"))
```
Note the unusual dual definition pattern: the regex helpers are defined both as embedded string literals (the `"    (define var-folders-re ...)\\n"` lines) *and* as direct SBPL `define` forms. This is almost certainly a compatibility artifact — the string-interpolated forms ensure the definitions are present even if the SBPL compiler on an older macOS version handles inline `define` differently.

**4. `sysctl-read` fallback — consistent with Patch 107's content policy.**
```scheme
(if (<= macosVersion 1009)
  (allow sysctl-read)
  (allow sysctl-read
    (sysctl-name-regex ...) ...))
```
Exact same structure: coarse allow-all on ≤10.9, fine-grained name predicates on ≥10.10.

**5. IPC POSIX shared memory for ≤10.7 — variant form.**
Unlike the content policy which uses the previously defined aliases, the RDD policy's shm block is wrapped in `(if (<= macosVersion 1007) ...)` and explicitly names the legacy IPC names: `^/tmp/com.apple.csseed:`, `^CFPBS:`, and `^AudioIO`. These are media-process-specific IPC names not present in the content policy. On ≥10.8, finer-grained IPC controls make this unnecessary.

**6. XPC service name lookups — gated to ≥10.13.**
The entire `xpc-service-name` block is wrapped in `(>= macosVersion 1013)`. XPC service name lookups in sandbox profiles were unreliable before High Sierra. The specific services added include `com.apple.coremedia.videodecoder/videoencoder` (previously unconditional), `com.apple.ViewBridgeAuxiliary`, and `com.apple.audio.SandboxHelper` — all High Sierra+ additions.

**7. Substantial new Mach service allowances — unconditional.**
A large block of `global-name` lookups is added: directory services (`opendirectoryd`), trust daemon (`trustd`/`trustd.agent`), preferences daemon (`cfprefsd`), notification center, system logger, and others. These are services that the RDD process needs for basic system interaction but that were missing from the original policy — presumably causing intermittent failures on the legacy target range where the process couldn't fall back to defaults.

**8. `user-preference-read` and Metal — version-gated.**
OpenGL/NVIDIA preference reads gated to ≥10.8 (`user-preference-read` with named domains requires 10.8+). `com.apple.MTLCompilerService` gated to ≥10.14 (Metal became mandatory in Mojave). `com.apple.cvmsServ` (Core VM Server, the pre-Metal GPU service) remains unconditional — it is available on all versions in the target range.

**9. Audio and AppKit framework services — expanded.**
`com.apple.audio.AudioComponentRegistrar` and `com.apple.assertiond.processassertionconnection` appear both gated (≥10.13) and then again ungated in an expanded `mach-lookup` block — indicating these were needed on older versions too, with the gated block being the original fix and the ungated block being the correct comprehensive fix. The large ungated block adds ~25 additional Mach services covering font servers, audio hardware, camera I/O, pasteboard, window server, and network configuration.

---

#### 21.10. `security/sandbox/mac/SandboxPolicySocket.h`

**Summaries:**

This patch applies now-familiar SBPL compatibility layer plus 2 socket-process-specific changes:
1. **Standard compatibility block (consistent with patches 107-109)**
2. **`file-map-executable` if/else - same pattern as all prior patches**
3. **Distributed notifications IPC - version-branched**
4. **Certificate database path expansion**
5. **`sysctl-write` for TCSM - gated to >10.9**

**Taxonomy classification:**
1. **Feature gating**
2. **Metadata override**

the certificate database path additions (the security plist literals and the `home-literal` tightening) are adjustments to what the policy declares about filesystem access, not about version compatibility per se. They are correctness fixes to the declared access surface for the certificate subsystem, relevant across the full target range.

**Relations:**
1. `security/sandbox/mac/SandboxPolicyContent.h`
1. `security/sandbox/mac/SandboxPolicyGMP.h`
1. `security/sandbox/mac/SandboxPolicyRDD.h`

This patch is the continuation of all previous SBPL patch scheme in these files.

**Explanation:**

The patch applies the now-familiar SBPL compatibility layer plus two socket-process-specific changes:

**1. Standard compatibility block — consistent with Patches 107–109.**
`macosVersion` parameter binding (newly added, same as GMP in 108), the 10.7 IPC shared memory aliases, and all four capability-guarded deny rules (`process-info*`, `nvram*`, `iokit-get-properties` absent here but `file-map-executable` present) are applied identically. The socket process policy is now the fourth consecutive policy file to receive this treatment.

**2. `file-map-executable` if/else — same pattern as all prior policies.**
Rosetta path, `/System/Library`, `/usr/lib`, and `app-path` wrapped in `(defined? 'file-map-executable)` if/else with the same fallback-to-`file-read*` structure.

**3. Distributed notifications IPC — version-branched.**
```scheme
(if (<= macosVersion 1007)
  (allow ipc-posix-shm)
  (allow ipc-posix-shm-read-data
    (ipc-posix-name "apple.shm.notification_center")))
```
On 10.7, the granular `ipc-posix-shm-read-data` with a name predicate is unavailable, so the patch falls back to a coarse `(allow ipc-posix-shm)` — broader than desired but the only option on Lion. This is a security/compatibility trade-off: the 10.7 branch allows all POSIX shared memory reads rather than just the notification center segment.

**4. Certificate database path expansion.**
The original block had `(subpath "/private/var/db/mds")` and four keychain paths. The patch adds two explicit plist literals:
- `/Library/Preferences/com.apple.security.plist` — system-wide security preferences
- `~/Library/Preferences/com.apple.security.plist` — per-user security preferences
- `~/Library/Preferences/com.apple.security.revocation.plist` — certificate revocation preferences (cited to crbug.com/1024000)

And changes `(home-subpath "/Library/Keychains")` to `(home-literal "/Library/Keychains")` — a tightening from allowing the entire subtree to allowing only the directory entry itself. The `home-subpath` on Keychains was likely overly broad; `home-literal` is more precise for the directory access needed.

**5. `sysctl-write` for TCSM — gated to >10.9.**
```scheme
(if (> macosVersion 1009)
  (allow sysctl-write (sysctl-name "kern.tcsm_enable")))
```
TCSM (Transparent Cache Storage Management) is a kernel feature for network performance tuning introduced in 10.10. The `kern.tcsm_enable` sysctl write permission is meaningless — and the `sysctl-name` predicate itself unavailable — on ≤10.9, so the rule is correctly suppressed.

---

#### 21.11. `security/sandbox/mac/SandboxPolicyUtility.h`

**Summaries:**

This is the most minimal of 5 SBPL policy patches, which applies only the base compatibility latyer with no process-specific additions - and contains 1 notable removal.

1. `app-binary-path` parameter removed.
2. Standard compatibility block - identical to patches 107-110
3. `SandboxPolicyUtilityMediaServiceAppleMediaAddend` - addend receives its own `macosVersion` binding

**Taxonomy classification:**
1. **Feature gating**: same as entire SBPL cluster

**Relations:**
1. `security/sandbox/mac/SandboxPolicyContent.h`
1. `security/sandbox/mac/SandboxPolicyGMP.h`
1. `security/sandbox/mac/SandboxPolicyRDD.h`
1. `security/sandbox/mac/SandboxPolicySocket.h`

This patch, together with patches of 4 previous files, forms a complete, entire SBPL policy cluster patch.

**Explanation:**

The patch is the most minimal of the five SBPL policy patches. It applies only the base compatibility layer with no process-specific additions — and contains one notable removal.

**1. `app-binary-path` parameter removed.**
The existing definition `(define app-binary-path (param "APP_BINARY_PATH"))` is replaced entirely by `(define macosVersion ...)`. This is not just a substitution for the version binding — `app-binary-path` is also removed from the `file-map-executable` / `file-read*` allowance block, reducing the allowed executable-mapping paths from four (`/System/Library`, `/usr/lib`, `app-path`, `app-binary-path`) to three (without `app-binary-path`). This is a **policy tightening**: the separate binary path parameter, which presumably allowed the utility process to map-execute its own binary from a second location, is dropped. Whether this is intentional tightening or a maintenance oversight is not resolved by the patch alone.

**2. Standard compatibility block — identical to Patches 107–110.**
`macosVersion` binding, `process-info*` (≥10.9), `nvram*` (`defined?`), `file-map-executable` (`defined?`), `process-info-pidinfo`/`process-info-setcontrol` (≥10.9), and the `file-map-executable` if/else fallback — all five consistent with the rest of the cluster.

Notably, the 10.7 IPC shared memory aliasing block is **absent** here. The utility process does not use POSIX shared memory in its base policy, so the Lion compatibility shim is not needed — a correct omission rather than an oversight.

**3. `SandboxPolicyUtilityMediaServiceAppleMediaAddend` — addend receives its own `macosVersion` binding.**
The addend is a separate C string literal that is appended to the base policy when needed. It gets its own `(define macosVersion ...)` because addends are compiled independently and cannot inherit definitions from the base policy string. The `com.apple.audio.AudioComponentRegistrar` lookup is then gated to ≥10.13, consistent with the same gate in Patches 109 and 110 — the Audio Component Registrar Mach service behaves differently (or is absent) on earlier releases.

---

#### 21.12. `security/sandbox/mac/Sandbox.mm`

**Summaries:**

This patch adds exactly 2 lines in 3 different places: Socket process, RDD process, GMP process
```cpp
params.push_back("MAC_OS_VERSION");
params.push_back(combinedVersion.c_str());
```

**Taxonomy classification:**
1. **Feature gating:**

This patch is the C++ parameter-passing infrastructure which delivers `osver` into the SBPL runtime, completing the version-gating chain which the policy cluster depends on.

**Relations:**
1. `security/sandbox/mac/SandboxPolicyGMP.h`
1. `security/sandbox/mac/SandboxPolicyRDD.h`
1. `security/sandbox/mac/SandboxPolicySocket.h`

This patch injects `MAC_OS_VERSION` into all these 3 libraries at runtime (runtime counterpart). Without this patch, `macosVersion` bindings would evaluate to `0` at runtime, inverting every version predicate: 10.7 IPC aliases would *always* activate, `process-info*` would *never* be denied, and `file-map-executable` guards would *always* fall through to the permissive branch. The policies would be both silently broken and in the wrong direction, in a much more destructive and difficult-to-trace manner.

**Explanation:**

The patch adds exactly two lines in three places:

```cpp
params.push_back("MAC_OS_VERSION");
params.push_back(combinedVersion.c_str());
```

These three insertions correspond to three process types:
- **Socket process** (first hunk, ~line 332)
- **RDD process** (second hunk, ~line 358)
- **GMP process** (third hunk, ~line 380)

`combinedVersion` is a variable already computed earlier in `StartMacSandbox()` — it contains the macOS version as a four-digit integer string (e.g. `"1014"` for Mojave), which is what `(string->number (param "MAC_OS_VERSION"))` in the SBPL policies reads and compares against.

The **content process** and **utility process** are not in this diff — they already had `MAC_OS_VERSION` being passed before this patch, which is consistent with the observation from Patches 108–111 that GMP, RDD, Socket, and Utility each had to *add* the `macosVersion` binding on the SBPL side. If the parameter is not pushed from the C++ side, `(param "MAC_OS_VERSION")` returns an empty string and `string->number` returns `0` — silently making every `(>= macosVersion 1009)` predicate false and every `(<= macosVersion 1007)` predicate true, a catastrophic silent misconfiguration.

---

***Relationship to the SBPL Policy Cluster (Patches 107–111)***

This patch is the **runtime counterpart** of the SBPL policy cluster — and is required for any of those patches to function correctly. The relationship is exact:

| SBPL policy | `macosVersion` binding added in | `MAC_OS_VERSION` param pushed in 112 |
|---|---|---|
| Content (107) | Already present | Already present (not in this patch) |
| RDD (109) | Already present | **Added here** |
| Socket (110) | Added in 110 | **Added here** |
| GMP (108) | Added in 108 | **Added here** |
| Utility (111) | Added in 111 | Not in this patch — presumably already present or handled elsewhere |

Without Patch 112, the `macosVersion` bindings added in Patches 108–110 would evaluate to `0` at runtime, inverting every version predicate: the 10.7 IPC aliases would *always* activate, `process-info*` would *never* be denied, and `file-map-executable` guards would *always* fall through to the permissive branch. The policies would be both broken and, in the wrong direction, *more permissive* than intended on modern macOS.

---

### Conclusion

...in progress...

### Thesis relevance

...in process...

## 22. `servo/components` subtree

### Files affected:
* `servo/components/style/values/specified/box.rs`
* `servo/components/style/values/specified/color.rs`

### 22.1. `servo/components/style/values/specified/box.rs`

**Summaries:**

This patch extends the `Appearance` enum in Firefox's style engine - which maps CSS `-moz-appearance` keyword values to internal widget identifiers.

**Taxonomy classification:**
1. **Feature gating:**

Every added variant is gated behind `chrome_rules_enabled` - the mechainsm which governs whether privileged UI keywords are exposed to the parser at all. Adding the variants without this guard would be a security regression (web content could address internal widget types); adding them with the guard is the correct completeness-preserving pattern.

2. **UI rendering restoration:**

Like what was established in the `accessible/mac` analysis: the macOS-specific vibrancy and source list variants in particular represent rendering behaviours (native transparency layers, sidebar visual treatment) that are specific to macOS platform semantics. On a legacy macOS target, some of these — vibrancy materials especially — may resolve to no-ops or degraded fallbacks if the underlying NSVisualEffectView API is unavailable, but the enum variant must exist in the parser layer regardless for the style engine to remain internally consistent.

**Relations:** none

**Explanation:**

This patch extends the `Appearance` enum in Firefox's style engine — the Rust enum that maps CSS `-moz-appearance` keyword values to internal widget identifiers. Each new variant added is a distinct CSS keyword that the style engine can parse and resolve to a native widget type.

Every added variant carries the attribute:
```rust
#[parse(condition = "ParserContext::chrome_rules_enabled")]
```
This is a parse-time guard: these keywords are only valid when parsed in a privileged (chrome/UA) stylesheet context, not in author-level web content. The guard is not new — it was already applied to the surrounding variants — but every newly introduced variant must carry it explicitly to be consistent with the existing security boundary.

The additions fall into several semantic clusters:

**Menu/contextual UI widgets:** `Menuitem`, `Checkmenuitem`, `Menuseparator` — sub-parts of `<menu>` and `<menuitem>` elements that require platform-native rendering (e.g., checkmarks, separators in native menu popups).

**Progress and range controls:** `Progresschunk` (the filled bar of a `<progress>` element), `Meterchunk` (the indicator of a `<meter>` element), `RangeThumb` (the draggable handle of `<input type=range>`).

**Spinner/separator controls:** `Separator` (horizontal or vertical), `Spinner` (the full spin control container, complementing the already-existing `SpinnerUpbutton`/`SpinnerDownbutton`).

**Status bar:** `Statusbar` — a platform chrome element for application status bars.

**macOS-specific vibrancy and windowing:** `MozMacFullscreenButton`, `MozMacSourceList`, `MozMacSourceListSelection`, `MozMacActiveSourceListSelection`, `MozMacVibrancyDark`, `MozMacVibrancyLight`, `MozMacVibrantTitlebarDark`, `MozMacVibrantTitlebarLight` — these map directly to macOS-native visual effects layer concepts (NSVisualEffectView vibrancy materials, source list sidebar styling, fullscreen button appearance).

Crucially, these are **additions**, not modifications. No existing variant is removed, renamed, or reordered. The enum is being populated with variants that were present in the widget back-end (C++ layer) but had not yet been surfaced into the Rust style parser — making this a **completeness restoration** across a language boundary.

---

### 22.2. `servo/components/style/values/specified/color.rs`

**Summaries:**

This patch extends the `SystemColor` enum in Firefox's style engine - the Rust enum that maps CSS system colour keyword values to platform-resolved color tokens.

**Taxonomy classification:**
1. **Feaature gating**
2. **UI rendering restoration**

This patch closely mirrors the structure of `box.rs` patch, but at the color resolution layer, rather than the widget identifier layer.

**Relations:**
1. `servo/components/style/values/specified/box.rs`

This patch deals with the same structure with `box.rs`, but at the color resolution layer.

**Explanation:**

This patch extends the `SystemColor` enum in Firefox's style engine — the Rust enum that maps CSS system colour keyword values to platform-resolved colour tokens. The additions introduce eleven new macOS-specific system colour variants, all grouped under a comment identifying them as "font smoothing background colors needed by the Mac OS X theme, based on `-moz-appearance` names."

The variants added are:

**Vibrancy surface colours:** `MozMacVibrancyLight`, `MozMacVibrancyDark`, `MozMacVibrantTitlebarLight`, `MozMacVibrantTitlebarDark` — background colour tokens associated with NSVisualEffectView vibrancy material surfaces. On macOS, these are not static RGBA values but dynamic colours resolved by the system compositor at paint time, varying with wallpaper content and the window's focus state.

**Menu and contextual UI colours:** `MozMacMenupopup`, `MozMacMenuitem`, `MozMacActiveMenuitem` — background fill tokens for native menu surfaces and item highlight states.

**Source list colours:** `MozMacSourceList`, `MozMacSourceListSelection`, `MozMacActiveSourceListSelection` — tokens for the sidebar/source-list visual style (e.g., Finder's left panel), including selection highlight variants for active and inactive window states.

**Tooltip colour:** `MozMacTooltip` — background colour token for the native tooltip surface.

A structurally significant observation: **none of these variants carry the `#[parse(condition = "ParserContext::chrome_rules_enabled")]` guard**, unlike the surrounding `MozSidebarborder` variant immediately above the insertion point and the majority of `moz-`-prefixed system colour variants. This means these colour keywords are parseable from *any* stylesheet context, including author-level web content — a deliberate or incidental distinction worth noting.

---




## 23. `third_party` subtree

### Files affected:

[`libwebrtc` cluster]
* `third_party/libwebrtc/sdk/objc/base/RTCVideoCapturer.h`
* `third_party/libwebrtc/sdk/objc/components/capturer/RTCCameraVideoCapturer.h`
* `third_party/libwebrtc/sdk/objc/components/capturer/RTCCameraVideoCapturer.m`
* `third_party/libwebrtc/sdk/objc/helpers/RTCDispatcher.m`

[`rlbox` cluster]
* `third_party/rlbox/include/rlbox_noop_sandbox.hpp`
* `third_party/rlbox_wasm2c_sandbox/include/rlbox_wasm2c_tls.hpp`

[`rust` cluster]****

In this cluster, all files are managed with integrity through SHA-256 hash in its component's equivalent `.cargo-checksum.json`. Do note to update the hash value once having modified its content.

List of all `.cargo-checksum.json`:
        both added:      third_party/rust/cc/.cargo-checksum.json
        both added:      third_party/rust/coreaudio-sys-utils/.cargo-checksum.json
        both added:      third_party/rust/cubeb-coreaudio/.cargo-checksum.json
        both added:      third_party/rust/getrandom/.cargo-checksum.json
        both added:      third_party/rust/metal/.cargo-checksum.json
        both added:      third_party/rust/neqo-bin/.cargo-checksum.json
        both added:      third_party/rust/neqo-udp/.cargo-checksum.json
        both added:      third_party/rust/quinn-udp/.cargo-checksum.json
        both added:      third_party/rust/zeitstempel/.cargo-checksum.json

* *third_party/rust/cc/.cargo-checksum.json [CHECKSUM ONLY]*
* `third_party/rust/cc/src/lib.rs`

* third_party/rust/coreaudio-sys-utils/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/coreaudio-sys-utils/src/dispatch.rs

* third_party/rust/cubeb-coreaudio/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/cubeb-coreaudio/src/backend/device_property.rs
* third_party/rust/cubeb-coreaudio/src/backend/mod.rs
* third_party/rust/cubeb-coreaudio/src/backend/tests/interfaces.rs
* third_party/rust/cubeb-coreaudio/src/lib.rs

* third_party/rust/getrandom/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/getrandom/src/backends.rs
* third_party/rust/getrandom/src/backends/getentropy.rs
* third_party/rust/getrandom/src/util_libc.rs

* third_party/rust/metal/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/metal/Cargo.toml
* third_party/rust/metal/src/argument.rs
* third_party/rust/metal/src/blitpass.rs
* third_party/rust/metal/src/computepass.rs
* third_party/rust/metal/src/device.rs
* third_party/rust/metal/src/pipeline/compute.rs
* third_party/rust/metal/src/pipeline/mod.rs
* third_party/rust/metal/src/pipeline/render.rs
* third_party/rust/metal/src/renderpass.rs
* third_party/rust/metal/src/vertexdescriptor.rs

* third_party/rust/neqo-bin/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/neqo-bin/Cargo.toml

* third_party/rust/neqo-udp/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/neqo-udp/Cargo.toml

* third_party/rust/quinn-udp/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/quinn-udp/Cargo.toml

* third_party/rust/zeitstempel/.cargo-checksum.json [CHECKSUM ONLY]
* third_party/rust/zeitstempel/Cargo.lock
* third_party/rust/zeitstempel/Cargo.toml
* third_party/rust/zeitstempel/src/mac.rs

* third_party/wasm2c/src/wast-parser.cc

### `libwebrtc` cluster

#### 23.1. `third_party/libwebrtc/sdk/objc/base/RTCVideoCapturer.h`

**Summaries:**

This patch is a subset of what was analysed in patch 115/116 (23.2-3): **the standalone header-only extraction** of the `weak`->`strong` delegate guard, which was already covered as change 1 in 115/116 cluster - same logical change expressed twice, once as part of implementation cluster and once as an independent header patch.

**Taxonomy classification:**
1. **Syntax backport**
2. **API availability guard**

**Relations:**
1. third_party/libwebrtc/sdk/objc/components/capturer/RTCCameraVideoCapturer.h
1. third_party/libwebrtc/sdk/objc/components/capturer/RTCCameraVideoCapturer.m

Same logical changes, different locations - implementation vs. header declaration

**Explanation:**

The change wraps the `delegate` property declaration in a compile-time guard:

```cpp
#if !defined(MAC_OS_X_VERSION_10_7) || \
    MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7
@property(nonatomic, strong) id<RTC_OBJC_TYPE(RTCVideoCapturerDelegate)> delegate;
#else
@property(nonatomic, weak) id<RTC_OBJC_TYPE(RTCVideoCapturerDelegate)> delegate;
#endif
```

The `weak` storage qualifier requires the Obj-C runtime's zeroing-weak pointer machinery, which was introduced in macOS 10.7. Below that threshold, `weak` compiles but produces dangling pointers on dealloc rather than zeroing the reference — a silent memory safety violation. `strong` is the only ARC-safe substitute on pre-10.7 runtimes.

#### 23.2-3. `third_party/libwebrtc/sdk/objc/components/capturer/RTCCameraVideoCapturer.h/.m`

**Summaries:**

This is a 2-file coordinated cluster. The `.h` patch changes a property declaration; the `.m` patch propagates the consequence of that change through the implementation. There are 3 substantive changes in total:
1. **`weak` -> `strong` delegate property under 10.7 (both)**
2. **`captureDevices` API reversion, removing `defaultCaptureDeviceTypes` and the macOS 14 branch (`RTCCameraVideoCapturer.m`)**
3. **Cosmetic reformatting (`.m`, no semantic changes)**

**Taxonomy classification:**
1. **Syntax backport:** change 1
2. **API availability guard:** change 1
2. **Build graph surgery:** change 2

**Relations:** none

**Explanation:**

This is a two-file coordinated cluster. The `.h` patch changes a property declaration; the `.m` patch propagates the consequence of that change through the implementation, while also performing a substantive API reversion in the device enumeration logic. The formatting changes throughout are cosmetic noise — the substantive changes are three.

---

1. Change 1 — `weak` → `strong` delegate property under 10.7 (`RTCVideoCapturer.h` + `.m`)

**Technical explanation:**

In Objective-C, `weak` references require ARC (Automatic Reference Counting) *and* the Objective-C runtime's weak reference machinery, which in turn requires a minimum of macOS 10.7 (Lion). Before 10.7, the runtime had no zeroing weak pointer support — a `__weak` variable would silently decay to a dangling pointer rather than being zeroed on dealloc, which is a memory safety violation.

The `.h` patch wraps the `delegate` property declaration:

```objc
#if !defined(MAC_OS_X_VERSION_10_7) || \
    MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7
@property(nonatomic, strong) id<...> delegate;
#else
@property(nonatomic, weak) id<...> delegate;
#endif
```

The `.m` patch mirrors this exactly at both `initWithDelegate:` signatures, switching the parameter qualifier from `__weak` to `__strong` under the same guard. The `if (self = [super initWithDelegate:delegate])` refactor (collapsing the `self = ...; if (self)` two-liner) is a minor Obj-C idiom cleanup bundled in.

**Taxonomy:** **Syntax backport** + **runtime API availability guard**

The `weak` qualifier is not merely syntax — it invokes zeroing-weak runtime machinery. Falling back to `strong` on pre-10.7 is the only ARC-safe choice; the alternative (using `assign`/`unsafe_unretained`) would compile but produce dangling pointers.

**Framework implication:** This is a clean example of what the framework should flag as an *implicit dependency on runtime object lifecycle machinery*, not a named API. No symbol lookup or `@available` probe can detect this — it is a compile-time decision driven by `MAC_OS_X_VERSION_MIN_REQUIRED`. This belongs squarely in the system layer of the two-layer model, and it illustrates a maintenance burden that static dependency graphs are structurally blind to: the *semantic availability* of a language feature is gated by `τ_fixed.osver` at compile time.

---

2. Change 2 — `captureDevices` API reversion, removing `defaultCaptureDeviceTypes` and the macOS 14 branch (`RTCCameraVideoCapturer.m`)

**Technical explanation:**

The upstream code had:

```objc
+ (NSArray<AVCaptureDevice *> *)captureDevicesWithDeviceTypes:(NSArray<AVCaptureDeviceType> *)deviceTypes { ... }
+ (NSArray<AVCaptureDeviceType> *)defaultCaptureDeviceTypes {
    NSArray *types = @[ AVCaptureDeviceTypeBuiltInWideAngleCamera ];
    #if !defined(WEBRTC_IOS)
    if (@available(macOS 14.0, *)) {
        types = [types arrayByAddingObject:AVCaptureDeviceTypeExternal];
    } else {
        types = [types arrayByAddingObject:AVCaptureDeviceTypeExternalUnknown];
    }
    #endif
    return types;
}
```

The patch collapses this into:

```objc
+ (NSArray<AVCaptureDevice *> *)captureDevices {
#if defined(WEBRTC_IOS) && defined(__IPHONE_10_0) && \
    __IPHONE_OS_VERSION_MIN_REQUIRED >= __IPHONE_10_0
    AVCaptureDeviceDiscoverySession *session = [...];
    return session.devices;
#else
    return [AVCaptureDevice devicesWithMediaType:AVMediaTypeVideo];
#endif
}
```

`AVCaptureDeviceTypeExternal` and `AVCaptureDeviceTypeExternalUnknown` are macOS 13/14-era additions to the `AVCaptureDeviceType` enum. On macOS 10.7–10.14, these symbols do not exist at all — not just unavailable at runtime, but absent from the SDK headers for those deployment targets. The `@available(macOS 14.0, *)` runtime probe is also irrelevant when you are targeting a system that predates the API by a decade.

The fallback `[AVCaptureDevice devicesWithMediaType:AVMediaTypeVideo]` is the pre-`AVCaptureDeviceDiscoverySession` enumeration API (the discovery session API arrived in iOS 10 / macOS 10.13). On macOS (the `#else` branch), this older call is unconditionally used, sidestepping both the device-type enum problem and the discovery session availability question entirely.

**Taxonomy:** **Build graph surgery** (removal of a macOS 14 runtime dispatch branch that cannot compile against the target SDK) + **deprecation reversal** (reinstating the older `devicesWithMediaType:` enumeration path as the operative call) + **preprocessor branch collapse** (the `defaultCaptureDeviceTypes` helper method is eliminated entirely)

**Framework implication:** This is a high-value example for the framework's *system layer implicit dependency* concept. The upstream code assumes a minimum deployment target of at least macOS 13–14 for the macOS-side device type branch. This assumption is never stated in any dependency manifest — it lives silently inside an `if (@available(...))` call. When `τ_fixed.osver` is 10.7–10.14, that assumption is violated not at runtime but at *compile time*, because the enum values referenced in the `else` branch (`AVCaptureDeviceTypeExternalUnknown`) may not exist in the SDK at all for sufficiently old targets. This illustrates exactly why the framework posits that system-layer dependencies require human-in-the-loop verification: no automated dependency scanner reads SDK header availability annotations as versioned dependency edges.

---

3. Change 3 — Formatting / cosmetic reformatting (`.m`, pervasive)

The remainder of the `.m` diff is wholesale reformatting: long Obj-C method call chains collapsed onto single lines, `[RTCDispatcher dispatchAsyncOnType:... block:^{ ... }]` calls re-indented to align the block body with the closing `}]`, multi-line string literals collapsed, and comments reflowed to fit a tighter column width. Zero semantic content.

**Taxonomy:** Not classifiable under the maintenance taxonomy — purely editorial. Worth noting only because it inflates the diff considerably and could obscure the two substantive changes above during review.

---


#### 23.4. `third_party/libwebrtc/sdk/objc/helpers/RTCDispatcher.m`

**Summaries:**

A single-function runtime availability guard wrapping `isOnQueueForType:`, which is `RTCDispatcher`'s method for asserting that execution is occuring on the expected GCD queue. The entire method is wrapped inside `@available(macOS 10.9, *)` branch; on pre-10.9 systems, the method unconditionally returns `true`.

**Taxonomy classification:**
1. **API availability guard:** classic `@available(macOS N, *)`

**Relations:** none

**Explanation:**

`isOnQueueForType:` identifies the current dispatch queue by label, using two calls:

```objc
dispatch_queue_get_label(targetQueue);          // label of the expected queue
dispatch_queue_get_label(DISPATCH_CURRENT_QUEUE_LABEL);  // label of the actual running queue
```

`DISPATCH_CURRENT_QUEUE_LABEL` is the critical piece. It is a special sentinel constant — not a real queue pointer — that, when passed to `dispatch_queue_get_label`, causes libdispatch to introspect the currently executing queue and return its label. This introspection mechanism was introduced in macOS 10.9 / iOS 7 alongside the broader GCD queue-targeting and monitoring improvements in that release cycle. On macOS 10.7–10.8, `DISPATCH_CURRENT_QUEUE_LABEL` may be defined in the header but the underlying runtime behaviour is unreliable or absent — the comment "something wrong with <10.9 systems" is i3roly's shorthand for this.

The consequence of calling `dispatch_queue_get_label(DISPATCH_CURRENT_QUEUE_LABEL)` on <10.9 is unspecified behaviour: it may return a null pointer, an empty string, or garbage, causing either the `NSAssert` to fire (crashing debug builds) or `strcmp` to produce a meaningless result (silently wrong queue validation in release builds). Both outcomes are worse than skipping the check entirely.

The `else { return true; }` fallback is a deliberate safe no-op: it tells callers "yes, you are on the right queue" unconditionally, which disables the queue-identity assertion on legacy systems. This sacrifices the safety guarantee — queue misuse will not be caught at the assertion point on pre-10.9 — but preserves runtime correctness. The upstream `NSAssert` calls are defensive programming aids, not load-bearing logic; removing their effect does not change what the capturer actually does.

### `rlbox` cluster

#### 23.5. `third_party/rlbox/include/rlbox_noop_sandbox.hpp`

**Summaries:**

This patch modifies the macro `RLBOX_NOOP_SANDBOX_STATIC_VARIABLES()`, which is responsible for defining per-thread storage for RLBox's no-op sandbox thread-local data struct (`rlbox_noop_sandbox_thread_data`).

**Taxonomy classification:**
1. **API availability guard**

The entire change is gated on a compile-time version probe via `MAC_OS_X_VERSION_MIN_REQUIRED`

2. **Syntax backport:**

`thread_local` (C+11 keyword with Darwin runtime requirement) is replaced by semantically equivalent POSIX primitives.

**Relations:** none

**Explanation:**

This patch modifies the macro `RLBOX_NOOP_SANDBOX_STATIC_VARIABLES()`, which is responsible for defining per-thread storage for RLBox's no-op sandbox thread-local data struct (`rlbox_noop_sandbox_thread_data`).

The original macro (modern path) uses C++11 `thread_local` storage:

```cpp
thread_local rlbox::rlbox_noop_sandbox_thread_data rlbox_noop_sandbox_thread_info{ 0, 0 };
```

On macOS 10.6 (Snow Leopard) and earlier Darwin targets, `thread_local` is not available — it requires both compiler and runtime support that didn't exist until later. The patch introduces a **POSIX TLS fallback** gated on the `MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7` condition:

```cpp
static pthread_key_t lckey_noop;
static pthread_once_t lckey_noop_once = PTHREAD_ONCE_INIT;
// ... pthread_key_create, pthread_once, pthread_getspecific/setspecific
```

This manually emulates `thread_local` semantics using POSIX thread-local storage primitives: `pthread_key_create` allocates a key, `pthread_once` ensures it's initialized exactly once, and `pthread_getspecific`/`pthread_setspecific` read and write the per-thread data pointer. On first access by a thread, the struct is heap-allocated via `new` and attached to the key.

The guard condition `!defined(MAC_OS_X_VERSION_10_7) || MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7` activates the POSIX path when targeting Snow Leopard or below; the modern `thread_local` path is preserved for ≥ 10.7 via `#else`.

`<AvailabilityMacros.h>` is conditionally included under `#ifdef XP_DARWIN` to supply the `MAC_OS_X_VERSION_*` constants.

---

#### 23.6. `third_party/rlbox_wasm2c_sandbox/include/rlbox_wasm2c_tls.hpp`

**Summaries:**

This patch applies the **identical TLS substitution strategy** from previous patch - but this to a different RLBox component (`rlbox_wasm2c_sandbox`)

**Taxonomy classification:**
1. **API availability guard**
2. **Syntax backport**

**Relations:**
1. `third_party/rlbox/include/rlbox_noop_sandbox.hpp`

Same purpose (alternative paths on `thread_local` for legacy platforms) - different components

**Explanation:**

This patch applies the **identical TLS substitution strategy** from patch 119 — but to a different RLBox component. Where patch 119 targeted `rlbox_noop_sandbox` (the no-op/passthrough sandbox), this patch targets `rlbox_wasm2c_sandbox` — the **WASM-to-C compiled sandbox**, which is the actual isolation mechanism used when RLBox sandboxing is active (e.g., for libvpx on modern targets).

The structure is a precise mirror:

- `MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_7` activates the POSIX TLS fallback path, using `pthread_key_t lckey_wasm2c`, `pthread_once_t lckey_wasm2c_once`, `pthread_key_create`, `pthread_getspecific`/`pthread_setspecific`, and on-demand heap allocation via `new rlbox_wasm2c_sandbox_thread_data()`.
- `#ifdef XP_DARWIN` guards the inclusion of `<AvailabilityMacros.h>` to supply the version constants — same as patch 119.
- The modern `thread_local` path is preserved under the `#else` branch for ≥ 10.7 targets.

One structural detail worth noting: in the original code, the `static_assert(true, "Enforce semi-colon")` terminator is present only in the modern path — the legacy POSIX branch omits it (same as in patch 119). This is intentional: `static_assert` is a C++11 feature and, while technically available on 10.7+, the macro boundary under the legacy path ends without it to maintain consistency with the older compilation environment.

---

### `rust/cc` cluster

**Files affected:**
* *third_party/rust/cc/.cargo-checksum.json [CHECKSUM ONLY]*
* `third_party/rust/cc/src/lib.rs` [23.7]

**Summaries:**

The change is a 1-line modification, which lower the minor version floor from `9` to `6`.

**Taxonomy classification:**
1. **Build graph surgery:**

This patch modifies the build graph **at a particularly subtle layer**, which has not witnessed before: this is not restructuring which source files get compiled (as seen in prior `sources.mozbuild` patches) but rather correcting the *parameter propagation* within the build toolchain itself. The deployment target is a value which flows from the build confifguration down into every C/C++ compilation unit; a slient override mid-pipeline would corrupt the entire flow.

**Relations:** none

**Explanation:**

The change is a one-line threshold modification inside a guard block that validates the macOS deployment target:

```rust
// Before (upstream):
if major == 10 && minor < 9 {
    // warn and override — deployment target too low

// After (Momiji):
if major == 10 && minor < 6 {
    // warn and override — deployment target too low
```

**What this guard does:** When `cc` reads `MACOSX_DEPLOYMENT_TARGET` from the environment (e.g. `10.7`), it checks whether the value is "too low" to be meaningful. If it is, it emits a warning and silently raises the target to the SDK minimum. The threshold defines what "too low" means.

**Upstream behaviour:** Upstream `cc` considers anything below `10.9` too low and overrides it. This means that passing `MACOSX_DEPLOYMENT_TARGET=10.7` — which is exactly Momiji's intended target — would be silently discarded and replaced, causing compiled C code to be built for a *higher* OS version than intended, potentially pulling in symbols unavailable on 10.7–10.8.

**Momiji's change:** By lowering the threshold to `10.6`, `cc` now accepts deployment targets from `10.6` through `10.8` as valid, passing them through to the compiler unchanged. `10.7` and `10.8` are no longer in the "too low" zone.

The comment "let the SDK's target definitions handle it" is the upstream rationale — below 10.9, the SDK's own target stubs take over. Momiji is effectively asserting: "our SDK and toolchain are configured to handle 10.7+ correctly, so do not override our explicitly declared target."

---

### `rust/coreaudio-sys-utils` cluster

**Files affected:**
* *third_party/rust/coreaudio-sys-utils/.cargo-checksum.json [CHECKSUM ONLY]*
* `third_party/rust/coreaudio-sys-utils/src/dispatch.rs` [23.8]

**Summaries:**

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Deprecation reversal**

Specifically, this is an **API decomposition substitution:** replace a newer 10.10+ API (`dispatch_queue_create_with_target`) by sequential application of 2 older component APIs (`dispatch_queue_create` + `dispatch_set_target_queue`, 10.6+). The combined API is not deprecated, it simply does not exist on the target OS versions.

**Relations:** none

**Explanation:**

***Upstream behaviour:***

```rust
dispatch_queue_create_with_target(label, DISPATCH_QUEUE_SERIAL, target_queue)
```

`dispatch_queue_create_with_target` is a single API that atomically creates a new serial dispatch queue *and* sets its target queue in one step. This function was introduced in **macOS 10.10 (Yosemite)**.

***Momiji's replacement:***

```rust
// Step 1: create the queue without a target
let queue = dispatch_queue_create(label, DISPATCH_QUEUE_SERIAL);

// Step 2: set the target queue separately
dispatch_set_target_queue(
    mem::transmute::<dispatch_queue_t, dispatch_object_t>(queue),
    target_queue
);
```

`dispatch_queue_create` has been available since **macOS 10.6**, and `dispatch_set_target_queue` since **macOS 10.6** as well. This decomposition achieves the same semantic result while using only APIs that exist on Momiji's target range (10.7–10.14).

**The `mem::transmute` call** deserves specific attention. `dispatch_set_target_queue` takes a `dispatch_object_t` as its first argument — a generic GCD object handle — while `dispatch_queue_create` returns a `dispatch_queue_t`. On Apple platforms these are ABI-compatible (both are opaque pointer types in the underlying C runtime), but the Rust type system does not know this. The `transmute` is a deliberate, informed type coercion to bridge the Rust type boundary while preserving the underlying pointer value. This is sound on Apple platforms where this coercion is guaranteed by the GCD ABI, but requires the developer to know that fact — it cannot be inferred from the types alone.

The lock acquisition (`target.queue.lock().unwrap()`) is preserved and occurs *before* both calls, maintaining the same concurrency-safety guarantee as the original.

---

### `rust/cubeb-coreaudio` cluster

**Files affected:**
* *third_party/rust/cubeb-coreaudio/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/cubeb-coreaudio/src/backend/device_property.rs`
* `third_party/rust/cubeb-coreaudio/src/backend/mod.rs`
* `third_party/rust/cubeb-coreaudio/src/backend/tests/interfaces.rs`
* `third_party/rust/cubeb-coreaudio/src/lib.rs`

#### 23.9. `third_party/rust/cubeb-coreaudio/src/backend/device_property.rs`

**Summaries:**

Removes a single `assert_ne!(id, kAudioObjectUnknown)` guard from the `get_device_uid` function.

**Taxonomy classification:**


**Runtime error handling strategy revision** — a subtype of precondition boundary relaxation. The change shifts failure signalling from a panic-based hard assertion (crash-on-violation) to the function's existing `Result`-typed error propagation path. This is distinct from:

* *Feature gating* (no capability is being conditionally enabled/disabled)
* *Runtime API availability guard* (no version dispatch occurs)
* *Deprecation reversal* (no API substitution)

This category has not appeared before in the Momiji subtree analyses. It represents a contract renegotiation at an API boundary.

**Relations:** none

**Explanation:**

In CoreAudio, `kAudioObjectUnknown` is a sentinel value (defined as `0`) representing an invalid/unresolved audio device. The removed assertion was a hard precondition check — it would panic at runtime if the caller passed an unknown device ID into `get_device_uid`. After the patch, the function proceeds unconditionally to:

* call `debug_assert_running_serially()` (a debug-only serialization check that compiles away in release builds), and
* query the `DeviceUID` property via `get_property_address`.

The effect is that passing `kAudioObjectUnknown` to `get_device_uid` no longer panics — instead, the CoreAudio API call itself will be made with the invalid ID, and the `OSStatus` error return path handles the failure gracefully (since `get_device_uid` already returns `Result<StringRef, OSStatus>`).

This is a **precondition relaxation**: the function's contract is loosened from "caller must guarantee a valid device ID" to "caller may pass any ID; failures are reported via the existing error channel."

#### 23.10. `third_party/rust/cubeb-coreaudio/src/backend/mod.rs`

**Summaries:**

This patch makes 4 related changes, all revolving around macOS kernel version dispatch for CoreAudio audio subsystem behaviour.
1. **New kernel version constants**
2. **`PartialOrd` derived on `ParseMacOSKernelVersionError`**
3. **`audio_device_duck` gated behind Mavericks floor**
4. **VPIO usage b gated with a Sierra floor**

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Runtime capability branching**

**Relations:** none

**Explanation:**

1. **New kernel version constants (lines 9–11)**

Three new Darwin kernel major version constants are added alongside the existing `MACOS_KERNEL_MAJOR_VERSION_MONTEREY` (21):

| Constant | Kernel Major | macOS Name |
|---|---|---|
| `MACOS_KERNEL_MAJOR_VERSION_LION` | 11 | macOS 10.7 |
| `MACOS_KERNEL_MAJOR_VERSION_MAVERICKS` | 13 | macOS 10.9 |
| `MACOS_KERNEL_MAJOR_VERSION_SIERRA` | 16 | macOS 10.12 |

These directly anchor to Momiji's target range (10.7–10.14 / Darwin 11–18).

2. **`PartialOrd` derived on `ParseMacOSKernelVersionError` (line 13)**

The error enum gains `PartialOrd` in addition to the existing `PartialEq`. This is a prerequisite for the `>=` comparisons introduced below — `macos_kernel_major_version()` returns a `Result<u32, ParseMacOSKernelVersionError>`, and `Result<T, E>` implements `PartialOrd` only when both `T` and `E` do. Without `PartialOrd` on the error type, the `>=` operator on the `Result` would not compile.

3. **`audio_device_duck` gated behind Mavericks floor (lines 30–38)**

The call to `audio_device_duck(id, 1.0, ...)` — which undoes VoiceProcessing I/O (VPIO) ducking on the output device — is now wrapped in:

```rust
if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_MAVERICKS)
```

`audio_device_duck` was introduced in macOS 10.9 (Mavericks / Darwin 13). On 10.7–10.8, this symbol does not exist. Without the guard, calling it on Lion or Mountain Lion would either fail to link or crash at runtime. The guard is a **runtime API availability gate** with a floor at Darwin 13.

4. **VPIO usage gated with a Sierra floor (lines 47–48)**

The condition controlling whether VoiceProcessing AudioUnit is used at all gains an additional lower-bound constraint:

```diff
- && macos_kernel_major_version() != Ok(MACOS_KERNEL_MAJOR_VERSION_MONTEREY)
+ && (macos_kernel_major_version() != Ok(MACOS_KERNEL_MAJOR_VERSION_MONTEREY)
+     && macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_SIERRA))
```

The existing exclusion of Monterey (a known regression in VPIO behaviour on that version) is preserved, and a Sierra floor is added. VPIO is therefore disabled on Darwin < 16 (pre-10.12), likely because the VPIO AudioUnit component's behaviour on 10.7–10.11 is unstable, incomplete, or produces audio defects.

---


#### 23.11. `third_party/rust/cubeb-coreaudio/src/backend/tests/interfaces.rs`

**Summaries:**

This patch is the **test-layer mirror** of the production logic change introduced in patch 128. The identical windowed capability gate visible in the test suite was made visible across 18 test sites.

**Taxonomy classification:**
1. **Test oracle synchronization**

This patch is a **test oracle synchronisation** — a category not previously named in the taxonomy. It is distinct from all prior categories:

* It makes no change to production code
* It updates test expected values and skip predicates to match a production logic change made in an adjacent patch (128)
* The semantic error in Pattern B skip guards makes this an instance of incomplete test oracle synchronisation — the production invariant is partially reflected in the tests but not fully propagated

This reinforces that `mod.rs` (patch 128) and `interfaces.rs` (patch 129) form a patch cluster: neither patch is independently interpretable without the other.

**Relations:** 
1. `third_party/rust/cubeb-coreaudio/src/backend/mod.rs`: these 2 files together make a cluster

**Explanation:**

This patch is the **test-layer mirror** of the production logic change introduced in patch 128. It makes the identical windowed capability gate visible in the test suite across 18 test sites.

There are two structural patterns of change:

1. **Pattern A — `assert_eq!` on `using_voice_processing_unit()` (9 sites)**

Tests that assert the stream is actually using VPIO update their expected value from:
```rust
macos_kernel_major_version().unwrap() != MACOS_KERNEL_MAJOR_VERSION_MONTEREY
```
to:
```rust
(macos_kernel_major_version().unwrap() != MACOS_KERNEL_MAJOR_VERSION_MONTEREY) &&
(macos_kernel_major_version().unwrap() >= MACOS_KERNEL_MAJOR_VERSION_SIERRA)
```
The expected boolean now correctly reflects the windowed gate: VPIO is expected to be active only if running on Darwin ≥ 16 (Sierra) AND not Darwin 21 (Monterey).

2. **Pattern B — early-return skip guards (9 sites)**

Tests that skip execution when VPIO is disabled update their guard condition from:
```rust
if macos_kernel_major_version().unwrap() == MACOS_KERNEL_MAJOR_VERSION_MONTEREY { return; }
```
to:
```rust
if (macos_kernel_major_version().unwrap() == MACOS_KERNEL_MAJOR_VERSION_MONTEREY) &&
   (macos_kernel_major_version().unwrap() >= MACOS_KERNEL_MAJOR_VERSION_SIERRA) { return; }
```
However — and this is important — this skip-guard logic has a **semantic error**. The original intent was: *"skip this test if VPIO is disabled."* After patch 128, VPIO is disabled on *either* Monterey or pre-Sierra. The correct skip condition should be:

```rust
if macos_kernel_major_version().unwrap() == MACOS_KERNEL_MAJOR_VERSION_MONTEREY ||
   macos_kernel_major_version().unwrap() < MACOS_KERNEL_MAJOR_VERSION_SIERRA { return; }
```

The patch instead uses `&&` with `>= SIERRA`, which evaluates to `false` on pre-Sierra systems (since `== MONTEREY` is false there), meaning **the skip guard fires only on Monterey running Darwin ≥ 16** — a condition that is always false in practice because Monterey *is* Darwin 21 ≥ 16. The guard is logically redundant and fails to skip VPIO tests on pre-Sierra systems. This appears to be a **test logic defect** introduced by the patch: the `assert_eq!` sites (Pattern A) are correctly updated, but the early-return sites (Pattern B) are not.

---



#### 23.12. `third_party/rust/cubeb-coreaudio/src/lib.rs`

**Summaries:**

This patch adds a single crate-level feature gate declaration:
```rust
#![feature(result_option_inspect)]
```

**Taxonomy classification:**

**Compiler/toolchain feature gate activation** — a new category for the `cubeb-coreaudio` subtree, though conceptually adjacent to the *build graph surgery* and *preprocessor branch collapse* categories seen in earlier subtrees. The distinction is:

* *Preprocessor branch collapse* operates on C/C++ `#ifdef` guards at the source level
* *Compiler/toolchain feature gate activation* operates on Rust's `#![feature(...)]` mechanism, which is a build-time opt-in to unstable language or library features gated behind the nightly compiler

This is a **toolchain version boundary artefact**: the feature exists in the language but is not yet stabilised in the pinned toolchain, so the crate must explicitly declare it wants the unstable version.

**Relations:** none

**Explanation:**

`result_option_inspect` is an unstable Rust feature that adds `.inspect()` and `.inspect_err()` methods to `Result` and `Option`. These methods allow side-effectful observation of a value (e.g. logging) in a method chain without consuming or transforming it — equivalent to a no-op tap:
```rust
some_result
    .inspect(|v| cubeb_log!("got value: {:?}", v))
    .inspect_err(|e| cubeb_log!("got error: {:?}", e))
    .ok()
```

The `!#[feature(...)]` attribute at crate root is a **nightly-only gate:** it compiles only with a nightly Rust toolchain.  On stable Rust, this line causes a hard compile error. This means the patch **locks the crate to nightly Rust** for the duration that this feature remains unstable.

The context matters: `result_option_inspect` was stabilised in Rust 1.76.0 (released February 2024). On older toolchains — including whatever Rust version the legacy Firefox build system pins — the feature is unstable and requires this explicit opt-in. The patch is therefore a build toolchain compatibility shim: it enables a method that is available unconditionally on modern stable Rust, but requires explicit feature activation on the pinned older nightly the Momiji build uses.

### `rust/getrandom` cluster

**Files affected:**
* *third_party/rust/getrandom/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/getrandom/src/backends.rs`
* `third_party/rust/getrandom/src/backends/getentropy.rs`
* `third_party/rust/getrandom/src/util_libc.rs`

#### 23.13. `third_party/rust/getrandom/src/backends.rs`

**Summaries:**

Add a single line `mod use_file`

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Build graph surgery**

**Relations:** none

**Explanation:**

The single added line is:

```rust
mod use_file;
```

inserted immediately **before** `mod getentropy;` inside a `cfg_if!` branch that targets macOS/Apple platforms (and a handful of others: `vita`, `emscripten`).

To understand why this matters, the surrounding structure needs to be read carefully. The `cfg_if!` block selects which backend module to compile for a given target OS. The branch in question — the one covering macOS — currently compiles and re-exports the `getentropy` backend. The patch inserts a declaration for `use_file` **into the same branch**, alongside `getentropy`, but does **not** change the `pub use` re-export line. That means `use_file` is declared (made visible to the compiler as a submodule) but its symbols are **not** publicly re-exported from this branch.

1. Why `use_file` must be declared here

`getrandom`'s `use_file` backend implements entropy acquisition by reading from `/dev/random` or `/dev/urandom` — the POSIX file-descriptor path. On modern macOS, this path exists and works but is not the primary backend; `getentropy(2)` is preferred because it avoids file descriptor overhead and is available since macOS 10.12.

The `getentropy` backend in getrandom, however, is almost certainly implemented **on top of** `use_file` on older targets — or it internally references symbols (types, helper functions, error paths) defined in `use_file`. If those symbols are referenced from `getentropy.rs` without `use_file` being declared as a module in the same compilation unit, the build fails with an unresolved module error.

In other words: **`mod use_file` must appear in scope so that `getentropy.rs` can reference it**, even though `use_file`'s public API is not being exported. This is a **dependency declaration without re-export** — a pattern Rust requires explicitly because modules are not auto-discovered.

1. Why this is needed for legacy macOS

`getentropy(2)` was introduced in macOS 10.12. For targets 10.7–10.11, the syscall does not exist. The `getentropy` backend in this vendored getrandom crate is therefore presumably written with a runtime fallback or compile-time conditional that routes to `use_file` when `getentropy` is unavailable. Without `mod use_file` being declared in the same `cfg_if` branch, that fallback path cannot compile.

This is structurally identical to the pattern already observed in `mfbt` — where `getentropy`/`arc4random_buf` dispatch was handled via a `uname()`-based runtime probe. Here, the same conceptual split appears at the **Rust crate level**, in the vendored `getrandom` dependency.

---



#### 23.14. `third_party/rust/getrandom/src/backends/getentropy.rs`

**Summaries:**

The upstream `fill_inner` functioncalled `libc::getentropy(...)` directly and unconditionally. The patch replaces that with a 3-part runtime dispatch structure:
1. A `Weak` symbol probe is declared as a static
2. A function pointer type alias is introduced
3. The fallback path routes to `use_file`

**Taxonomy classification:** 
1. **Runtime API availability guard**
2. **Layered runtime library substitution**
3. **Deprecation reversal (implicit)**

**Relations:** 
1. `third_party/rust/getrandom/src/backends.rs`

In `backends.rs`, patch 131 declared `mod use_file` in macOS `cfg_if` branch without re-exporting it. This patch is the consumer of that declaration: `crate::backends::use_file::fill_inner(dest)` in the else-branch is precisely why `use_file` needed to be in scope. The two patches are a single atomic unit — patch 132 cannot compile without patch 131, and patch 131 is meaningless without patch 132.

**Explanation:**

The upstream `fill_inner` function called `libc::getentropy(...)` directly and unconditionally. The patch replaces that with a **three-part runtime dispatch structure**:

**1. A `Weak` symbol probe is declared as a static:**
```rust
static GETENTROPY: Weak = unsafe { Weak::new("getentropy\0") };
```
`Weak` is a type from `util_libc` (already present in the crate) that performs a **lazy `dlsym`-style lookup** of a symbol by name at runtime. The null terminator in `"getentropy\0"` is required by the C string convention that `dlsym` expects. If the symbol is not present in the process's loaded libraries, `.ptr()` returns `None`.

**2. A function pointer type alias is introduced:**
```rust
type GetEntropyFn = unsafe extern "C" fn(*mut u8, libc::size_t) -> libc::c_int;
```
This matches the C signature of `getentropy(2)`. The resolved pointer is transmuted to this type before being called.

**3. The fallback path routes to `use_file`:**
```rust
} else {
    crate::backends::use_file::fill_inner(dest)
}
```
When `getentropy` is not found in the runtime symbol table, entropy is acquired by reading from `/dev/random`. The comment explicitly explains the alternative (`SecRandomCopyBytes`) was rejected due to startup cost and the Security framework linkage it would require.

---

`Weak` in getrandom's `util_libc` is a well-established pattern in this codebase: it wraps a `OnceLock` (or equivalent) around a `dlsym` call, resolving the symbol **once** on first use and caching the result. This is functionally equivalent to the `dlopen`/`dlsym` pattern seen in the `ipc` and `memory` subtrees, but expressed idiomatically in Rust rather than C++.

The key consequence: **the binary links against no hard reference to `getentropy`**. The symbol is looked up by name at runtime, so the binary loads and runs on macOS versions where `getentropy` does not exist (pre-10.12) without a dynamic linker error.

---



#### 23.15. `third_party/rust/getrandom/src/util_libc.rs`

**Summaries:**

This patch appends a complete implementation of the `Weak` struct to `util_libc.rs`. 

**Taxonomy classification:**
1. **Structural ABI bridge**
2. **Build graph surgery**
3. **Runtime API availability guard**

**Relations:**
This completes a three-patch atomic cluster with a strict dependency order: 133 → 131 → 132.
The logical build order is:

* Patch 133 defines `Weak` in `util_libc.rs`
* Patch 131 declares `mod use_file` in the macOS `cfg_if` branch
* Patch 132 uses both `Weak` and `use_file` in getentropy.rs

**Explanation:**

The patch appends a complete implementation of the `Weak` struct to `util_libc.rs`. This is the type that patch 132 imported and used as `Weak::new("getentropy\0")` — which means patch 132 **referenced this type before it existed in the vendored codebase**. Patch 133 is what makes the crate compile.

The implementation consists of:

**A struct with two fields:**
```rust
pub struct Weak {
    name: &'static str,
    addr: AtomicPtr<c_void>,
}
```
- `name`: the null-terminated C string name of the symbol to probe.
- `addr`: an atomic pointer used as a one-time cache for the resolved address.

**A sentinel constant:**
```rust
const UNINIT: *mut c_void = 1 as *mut c_void;
```
Address `1` is used as a sentinel for "not yet resolved." It is chosen because it is almost certainly not a valid function pointer address, but the design is explicitly tolerant of the edge case where `dlsym` returns exactly `1` — in that case, the lookup is simply repeated on each call (inefficient but correct, as the comment states).

**A `const unsafe fn new(name)`:**
Constructs a `Weak` with `addr` initialised to `UNINIT`. It is `const` so it can be placed in a `static` (as done in patch 132). It is `unsafe` because the caller must guarantee `name` is null-terminated — a C ABI contract that Rust cannot enforce statically.

**A `ptr()` method with explicit memory ordering:**
```rust
pub fn ptr(&self) -> Option<NonNull<c_void>> {
    match self.addr.load(Ordering::Relaxed) {
        Self::UNINIT => {
            let addr = unsafe { libc::dlsym(libc::RTLD_DEFAULT, symbol) };
            self.addr.store(addr, Ordering::Release);
            NonNull::new(addr)
        }
        addr => {
            let func = NonNull::new(addr)?;
            fence(Ordering::Acquire);
            Some(func)
        }
    }
}
```

The memory ordering pattern here is deliberate and worth unpacking:
- The initial load uses `Relaxed` — it does not need to synchronise with anything yet.
- If the symbol was already resolved (the cached-address branch), an `Acquire` **fence** is inserted before the pointer is returned. This ensures that any memory written by the `dlsym` call (on whichever thread first resolved it) is **visible to the current thread** before it dereferences the function pointer.
- The store after `dlsym` uses `Release`, pairing with the `Acquire` fence on subsequent callers.
- The comment acknowledges this mirrors `libstd`'s own `DlsymWeak` and notes that the non-relaxed operations are *probably* unnecessary for a single atomic variable — but are kept for safety, matching the libstd precedent.

This is a **lock-free, safe-for-concurrent-callers, one-time initialisation** pattern. Multiple threads may call `ptr()` simultaneously; multiple `dlsym` calls may occur (the store is not guarded by a mutex), but all outcomes are correct.

* **The provenance acknowledgment in the comment**

```
// Based off of the DlsymWeak struct in libstd:
// https://github.com/rust-lang/rust/blob/1.61.0/library/std/src/sys/unix/weak.rs#L84
```

This is an explicit upstream citation. The implementation is not invented here — it is a manual backport of a Rust standard library internal. The reference is pinned to Rust 1.61.0, which is significant: it means the version of libstd being mirrored is **frozen at a known point**, providing a stable reference for future auditors. This comment is itself a provenance trail artefact.

The reason this needs to exist at all as a manual copy: `std::sys::unix::weak::DlsymWeak` is an **internal, non-public** type in libstd. It is not accessible from `no_std` or `core` contexts. `getrandom` is a crate that targets `no_std` environments, so it cannot use `std` directly. The patch therefore vendors the implementation into `util_libc.rs`.

---

### `rust/metal` cluster
**Files affected:**
* *third_party/rust/metal/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/metal/Cargo.toml`
* `third_party/rust/metal/src/argument.rs`
* `third_party/rust/metal/src/blitpass.rs`
* `third_party/rust/metal/src/computepass.rs`
* `third_party/rust/metal/src/device.rs`
* `third_party/rust/metal/src/pipeline/compute.rs`
* `third_party/rust/metal/src/pipeline/mod.rs`
* `third_party/rust/metal/src/pipeline/render.rs`
* `third_party/rust/metal/src/renderpass.rs`
* `third_party/rust/metal/src/vertexdescriptor.rs`

#### 23.16. `third_party/rust/metal/Cargo.toml`

**Summaries:**

This patch adds a new single entry to the `dependencies` section of the `metal` crate:
```
[dependencies.whatsys]
version = "0.3"
```

**Taxonomy classification:**
1. **Runtime API availability guard/runtime capability branching**
2. **Dependency graph surgery**

**Relations:** none

**Explanation:**

`whatsys`  is a small Rust crate that provides runtime macOS version detection — it exposes the host OS version at runtime, typically by querying the kernel (via `uname()` or equivalent). Adding it as a dependency to the `metal` crate means that somewhere in `metal`'s source code (in a companion patch not included here), the crate will perform a runtime OS version probe to gate Metal API usage or behavior based on what version of macOS is actually running. 

This is the same `whatsys`-based runtime probing pattern seen previously in `mfbt`, where `getentropy`/`arc4random_buf` dispatch was conditioned on runtime-detected OS version.

#### 23.17. `third_party/rust/metal/src/argument.rs`

**Summaries:**

This patch changes a single Obj-C message send within the `object_at` method of `StructMemberArrayRef`.

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Syntax backport**

**Relations:** none

**Explanation:**
```rust
// Before
unsafe { msg_send![self, objectAtIndexedSubscript: index] }

// After
unsafe { msg_send![self, objectAtIndex: index] }
```

Both selectors retrieve an element from a collection at a given integer index, but they represent different protocols:
* `objectAtIndexedSubscript:` is part of the `NSFastEnumeration`/subscript protocol introduced in modern Objective-C (alongside the `obj[i]` subscript syntax sugar). It was formalised relatively late and may not be available — or may not be correctly implemented on the underlying `MTLStructMember`-related collection type — on older macOS versions within Momiji's target range.
* `objectAtIndex:` is the classical `NSArray`-era selector, present since the earliest versions of Cocoa/Foundation. It is universally available across all Darwin versions Momiji targets.

The change is a **direct selector substitution**: the modern subscript-protocol message is replaced with the older, universally supported equivalent, restoring compatibility with legacy OS versions without any change to observable behaviour or return type.

#### 23.18. `third_party/rust/metal/src/blitpass.rs`

**Summaries:**

This patch applies **2 selector substitutions** within `BlitPassSampleBufferAttachmentDescriptorArrayRef`, targeting both the getter and setter of the indexed access pair.

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**
```rust
// Getter — Before / After
msg_send![self, objectAtIndexedSubscript: index]
msg_send![self, objectAtIndex: index]

// Setter — Before / After
msg_send![self, setObject:attachment atIndexedSubscript:index]
msg_send![self, setObject:attachment atIndex:index]
```

The pattern is identical to patch 135 (argument.rs): the modern subscript-protocol selectors (`objectAtIndexedSubscript:` / `setObject:atIndexedSubscript:`) are replaced with their classical NSArray-era equivalents (`objectAtIndex:` / `setObject:atIndex:`). The target type here is `BlitPassSampleBufferAttachmentDescriptorArray`, which is part of the Metal blit command encoder's sample buffer attachment API — a relatively late addition to Metal.
The getter/setter pair must be changed together to maintain symmetry: an indexed collection accessed via objectAtIndex: should also be mutated via `setObject:atIndex:`. Changing only one would create an asymmetric interface that, while it might work in practice, would be semantically inconsistent and a potential source of future confusion.

#### 23.19. `third_party/rust/metal/src/computepass.rs`

**Summaries:**

Continuation of selector substitutions happened in patch 136 `blitpass.rs`

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:** no further exlanations needed

#### 23.20. `third_party/rust/metal/src/device.rs`

**Summaries:**

This patch contains 5 distinct, layered changes:
1. `whatsys` runtime probe implementation
2. `MTLCopyAllDevices` guarded behind El Capitan runtime check
3. `Os` -> `OS` rename (cosmetic)
4. `_dispatch_main_q` type and mutability correction
5. `#[cfg_attr]` formatting and `c_char` import restructure

**Taxonomy classification:**
1. **Runtime API availability guard/runtime capability branching**
2. **ABI substrate access correction + syntax backport**

**Relations:** none

**Explanation:**

**Change 1 — `whatsys` runtime probe implementation**

The patch introduces the infrastructure promised by patch 134's `Cargo.toml` addition. A new function and error type are defined:

```rust
enum ParseMacOSKernelVersionError { SysCtl, Malformed, Parsing }

fn macos_kernel_major_version() -> Result<u32, ParseMacOSKernelVersionError> {
    let ver = whatsys::kernel_version();
    // parse the major component of the kernel version string
    ...
}

const MACOS_KERNEL_MAJOR_VERSION_ELCAPITAN: u32 = 15;
```

`whatsys::kernel_version()` returns the Darwin kernel version string (e.g. `"15.6.0"` for macOS 10.11 El Capitan). The function extracts only the **major component** and parses it to `u32`. The constant `15` is the Darwin kernel major version corresponding to macOS 10.11 El Capitan — the **first macOS version to support Metal**.

This is the `whatsys` runtime dispatch implementation completing the cluster opened in patch 134.

---

**Change 2 — `MTLCopyAllDevices` guarded behind El Capitan runtime check**

```rust
// Before
let array = MTLCopyAllDevices();

// After
let mut array: *mut Object = ptr::null_mut();
if macos_kernel_major_version() >= Ok(MACOS_KERNEL_MAJOR_VERSION_ELCAPITAN) {
    let array = MTLCopyAllDevices();
}
```

`MTLCopyAllDevices()` is a Metal API that enumerates all available GPU devices on the system. It **does not exist before macOS 10.11** — calling it on macOS 10.10 or earlier would be a fatal dynamic linker error or a null function pointer call. The runtime check gates this call behind a kernel version comparison, defaulting to a null array (no devices) on pre-El Capitan systems.

This is the **core correctness fix** for the entire `metal` subtree — without it, Firefox would crash on launch on any macOS version before 10.11 simply by attempting to enumerate Metal devices.

> **Note:** There is a subtle bug visible in the patch: the inner `let array = MTLCopyAllDevices()` shadows the outer `let mut array`, meaning the outer array remains `null_mut()` even on El Capitan+. This appears to be an error in i3roly's patch — the correct form should be `array = MTLCopyAllDevices()` (assignment, not a new binding). This is worth flagging explicitly.

---

**Change 3 — `Os` → `OS` rename**

A purely cosmetic rename of the internal `enum Os` to `enum OS`, propagated across every match arm and comparison in the file — which, given the density of `MTLFeatureSet` capability methods, accounts for the vast majority of the diff's line count. No behavioural change whatsoever.

---

**Change 4 — `_dispatch_main_q` type and mutability correction**

```rust
// Before
static mut _dispatch_main_q: Object;

// After
static _dispatch_main_q: dispatch_queue_t;
```

And at the call site:

```rust
// Before
library_data.as_ptr().cast(),
&raw mut _dispatch_main_q,

// After
library_data.as_ptr() as *const std::ffi::c_void,
&_dispatch_main_q as *const _ as dispatch_queue_t,
```

`_dispatch_main_q` is a C symbol from libdispatch (GCD) representing the main dispatch queue. Two corrections here:

- **Type correction**: changing it from `Object` (an Objective-C opaque object type) to `dispatch_queue_t` (its correct C type). Using `Object` was an incorrect typing of a C symbol.
- **Mutability removal**: `static mut` → `static`. The main queue is a singleton that should never be mutated; `mut` was incorrect and unnecessary.
- **Cast syntax downgrade**: `&raw mut` is a Rust 2024 edition raw pointer syntax; `&x as *const _ as T` is the stable, older equivalent compatible with the Rust edition used in this crate.

---

**Change 5 — `#[cfg_attr]` formatting and `c_char` import restructure**

Minor cosmetic/formatting changes: collapsing multi-line `cfg_attr` attribute expressions onto single lines, and restructuring the `std` imports (pulling `c_char` out of `ffi` into `os::raw`). No behavioural effect.

---

#### 23.21. `third_party/rust/metal/src/pipeline/compute.rs`

**Summaries:**

2 getter/setter substitution pairs, applied to 2 distinct Metal collection types within the compute pipeline descriptor module.

**Taxonomy classification:**
1. **Deprecation Reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**

Two getter/setter selector substitution pairs, applied to two distinct Metal collection types within the compute pipeline descriptor module:

**`AttributeDescriptorArrayRef`** — wraps the vertex attribute descriptor array used in compute pipeline stages that consume mesh or stage-in data:
```rust
objectAtIndexedSubscript:  →  objectAtIndex:
setObject:atIndexedSubscript:  →  setObject:atIndex:
```

**`BufferLayoutDescriptorArrayRef`** — wraps the buffer layout descriptor array that describes how vertex buffer data is laid out for compute pipelines:
```rust
objectAtIndexedSubscript:  →  objectAtIndex:
setObject:atIndexedSubscript:  →  setObject:atIndex:
```

Both substitutions are byte-for-byte identical to those in patches 135–137. No behavioural change; the fix is purely at the Objective-C selector level.

---

#### 23.22. `third_party/rust/metal/src/pipeline/mod.rs`

**Summaries:**

Same 2 getter/setter Obj-C selector substitution as other patches in this subtree.

**Taxonomy classification:**
1. **Deprecation Reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**

One getter/setter selector substitution pair, applied to `PipelineBufferDescriptorArrayRef`:

```rust
// Getter
objectAtIndexedSubscript:  →  objectAtIndex:

// Setter
setObject:atIndexedSubscript:  →  setObject:atIndex:
```

Identical substitution to all prior instances in the sweep. The target type, `PipelineBufferDescriptorArray`, holds `MTLPipelineBufferDescriptor` objects — one entry per buffer slot in a pipeline state — which describe the **mutability** of each buffer binding in a render or compute pipeline (i.e., whether a given buffer slot is read-only or read-write from the GPU's perspective).

`PipelineBufferDescriptorArray` sits at the intersection of pipeline state configuration and memory access control in Metal. Understanding its role requires a brief sketch of how Metal pipelines manage buffer access:

When creating a Metal pipeline state object (render or compute), each buffer binding slot can be annotated with a **mutability attribute** — Metal uses this to reason about memory hazards and to potentially optimise access. `MTLPipelineBufferDescriptor` is the object that carries this annotation per slot. The array of these descriptors is attached to a `MTLRenderPipelineDescriptor` or `MTLComputePipelineDescriptor` before the pipeline state is compiled.

So `object_at` and `set_object_at` on `PipelineBufferDescriptorArrayRef` are the **read and write accessors for pipeline-level buffer mutability configuration** — used during pipeline setup, not during command encoding. This is distinct from the buffer arrays accessed during draw calls; this array is consulted at pipeline **compilation time** by the Metal driver.

In the context of Firefox's WebGPU/WebGL implementation (which is what the `metal` crate serves), these accessors are called when translating WebGPU pipeline descriptor objects into native Metal pipeline state objects. The correctness of buffer mutability annotations affects both correctness (wrong access patterns trigger Metal validation errors) and performance (Metal can elide certain hazard barriers when it knows a buffer is read-only).

---

#### 23.23. `third_party/rust/metal/src/pipeline/render.rs`

**Summaries:**

3 selector substitutions across 2 distinct types in the render pipeline module:
* **objectAtIndexedSubscript** (getter only)
* **RenderPipelineColorAttachmentDescriptorArrayRef** (getter + setter pair)

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**


Three selector substitutions across two distinct types in the render pipeline module:

**`ArgumentArrayRef` — getter only:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:
```
Note there is no setter substitution here — `ArgumentArrayRef` exposes only a read accessor and a `count()` method, making it a **read-only collection binding**. This is consistent with Metal's argument reflection API, where argument arrays are introspected but not mutated at runtime.

**`RenderPipelineColorAttachmentDescriptorArrayRef` — getter + setter pair:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:
setObject:atIndexedSubscript:  →  setObject:atIndex:
```
The full read/write pair, consistent with all prior sweep instances where the type is mutable.

---


**`ArgumentArrayRef`** wraps `MTLArgumentArray` — the array of `MTLArgument` objects returned by Metal's shader **reflection API**. When a pipeline state is compiled, Metal can return metadata about the shader's arguments (buffer bindings, texture bindings, sampler bindings, their types, access patterns, array lengths, etc.). `ArgumentArrayRef::object_at` is the accessor for iterating over this reflected argument list.

This function sits on the **pipeline introspection path**, not the rendering path itself. It is called when Firefox's WebGPU layer needs to understand what resources a compiled shader expects — used for binding validation, resource layout construction, and API-level error checking. A broken `object_at` here would not cause a crash during rendering but would silently return incorrect reflection data, leading to malformed resource bindings downstream. This is a **silent correctness hazard** rather than an immediate crash.

**`RenderPipelineColorAttachmentDescriptorArrayRef`** wraps `MTLRenderPipelineColorAttachmentDescriptorArray` — the array of per-attachment descriptors that configure how each color render target is written to in a render pipeline. Each slot in this array describes: pixel format, blending mode, blend factors, write masks. This is set during render pipeline state creation and determines how fragment shader outputs are composited onto render targets.

`object_at` and `set_object_at` here are the accessors for **configuring color attachment blending per render target slot** — a core part of pipeline state setup for any non-trivial rendering (transparency, compositing, UI rendering). A broken setter here would produce pipelines with incorrect blend state, causing visual corruption rather than a crash — again a **silent correctness hazard**.

---

#### 23.24. `third_party/rust/metal/src/renderpass.rs`

**Summaries:**

4 selector substitutions across 2 types - both getter/setter pairs - in the render pass module:
* `RenderPassColorAttachmentDescriptorArrayRef`
* `RenderPassSampleBufferAttachmentDescriptorArrayRef`
Mechanically identical to all prior sweep instances.

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**

Four selector substitutions across two types — both getter/setter pairs — in the render pass module:

**`RenderPassColorAttachmentDescriptorArrayRef`:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:        // getter
setObject:atIndexedSubscript:  →  setObject:atIndex:  // setter
```

**`RenderPassSampleBufferAttachmentDescriptorArrayRef`:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:        // getter
setObject:atIndexedSubscript:  →  setObject:atIndex:  // setter
```

Mechanically identical to all prior sweep instances.

Every prior sweep patch either fixed one type per file (patches 135, 137, 140) or fixed two types that belong to the same layer (patch 139 fixed two pipeline-layer types in `compute.rs`). Here, the two types fixed in `renderpass.rs` are architecturally distinct:

**`RenderPassColorAttachmentDescriptorArrayRef`** configures the color attachments of a **render pass** — the actual render targets (textures) that fragment shaders write to during a draw call. This is set on the `MTLRenderPassDescriptor` before `beginRenderCommandEncoder` is called. It belongs to the **command encoding setup layer** — the configuration of where rendering output goes.

**`RenderPassSampleBufferAttachmentDescriptorArrayRef`** configures the GPU performance counter sample buffer attachments of the same render pass — the same type seen in `blitpass.rs` (patch 136) and `computepass.rs` (patch 137) for their respective pass types. It belongs to the **GPU instrumentation layer** — profiling and performance measurement.

So this patch simultaneously completes two sub-sweeps:

- The **color attachment descriptor array sweep**: `RenderPipelineColorAttachmentDescriptorArrayRef` (pipeline, patch 141) now paired with `RenderPassColorAttachmentDescriptorArrayRef` (pass, this patch). These are related but distinct — the pipeline descriptor configures *how* to blend; the pass descriptor configures *where* to write.
- The **sample buffer attachment sweep**: `BlitPassSampleBufferAttachmentDescriptorArrayRef` (patch 136), `ComputePassSampleBufferAttachmentDescriptorArrayRef` (patch 137), now completed with `RenderPassSampleBufferAttachmentDescriptorArrayRef` (this patch). All three command encoder types — blit, compute, render — have now been covered.

---

#### 23.25. `third_party/rust/metal/src/vertexdescriptor.rs`

**Summaries:**

4 selector substitutions across 2 types - both getter/setter pairs:
* `VertexBufferLayoutDescriptorArrayRef`
* `VertexAttributeDescriptorArrayRef`

**Taxonomy classification:**
1. **Deprecation reversal/API downgrade**
2. **Selector substitution**

**Relations:** none

**Explanation:**

Four selector substitutions across two types — both getter/setter pairs:

**`VertexBufferLayoutDescriptorArrayRef`:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:        // getter
setObject:atIndexedSubscript:  →  setObject:atIndex:  // setter
```

**`VertexAttributeDescriptorArrayRef`:**
```rust
objectAtIndexedSubscript:  →  objectAtIndex:        // getter
setObject:atIndexedSubscript:  →  setObject:atIndex:  // setter
```

Mechanically identical to all prior sweep instances.

---

Both types live within the **vertex descriptor** subsystem — the part of Metal that describes how raw vertex buffer memory is interpreted and fed into a vertex shader.

**`VertexBufferLayoutDescriptorArrayRef`** describes, per buffer slot, how to *stride* through the data: step rate, step function (per-vertex vs. per-instance), and byte stride. Each entry answers: "for buffer binding N, how do I advance through memory to get successive vertices or instances?"

**`VertexAttributeDescriptorArrayRef`** describes, per vertex attribute, how to *decode* a single attribute from the buffer: which buffer it comes from, its byte offset within a vertex, and its data format (float2, float4, etc.). Each entry answers: "for attribute N, where exactly in the buffer layout do I find it and how do I interpret the bytes?"

Together, these two arrays fully specify the vertex fetch stage of a render pipeline — the bridge between raw GPU memory and typed shader inputs. They are set on a `MTLVertexDescriptor` attached to a `MTLRenderPipelineDescriptor` before pipeline compilation.

---

Patch 139 (`pipeline/compute.rs`) already fixed `AttributeDescriptorArrayRef` and `BufferLayoutDescriptorArrayRef`. This patch fixes `VertexAttributeDescriptorArrayRef` and `VertexBufferLayoutDescriptorArrayRef`. These are **not the same types**, despite the names being superficially similar:

| Patch 139 (compute pipeline) | Patch 143 (vertex descriptor) |
|---|---|
| `AttributeDescriptorArrayRef` | `VertexAttributeDescriptorArrayRef` |
| `BufferLayoutDescriptorArrayRef` | `VertexBufferLayoutDescriptorArrayRef` |

The compute pipeline variants describe argument/buffer layout for compute shader dispatch. The vertex descriptor variants describe vertex fetch layout for render pipeline vertex shaders. They are parallel structures in Metal's API design — the same conceptual shape (attribute array, layout array) instantiated for two different pipeline types — but they are distinct Objective-C classes with separate implementations.

This is the most taxonomically subtle distinction in the sweep so far: **name similarity masking type distinctness**. A maintainer doing a superficial name-match review might incorrectly conclude that patch 139 already covered these types. The correct enumeration strategy is by **Objective-C class identity**, not by Rust type name similarity.

---

### `fast-apple-datapath` exclusion cluster

#### `rust/neqo-bin` crate

**Files affected**
* *third_party/rust/neqo-bin/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/neqo-bin/Cargo.toml`

**Summaries:**

This patch remove the `-fast-apple-datapath` feature gate line - which forwarded to `quinn-udp`'s own `fast-apple-datapath` feature - entirely from `neqo-bin`'s feature set.

**Taxonomy classification:**
1. **Feature gating/Build graph surgery:**

A capability that is unavailable on legacy targets is excised from the feature graph at the manifest level, preventing any downstream activation of incompatible code paths.

**Explanations:** 

The patch removed the following line:

```toml
-fast-apple-datapath = ["quinn-udp/fast-apple-datapath"]
```

The `fast-apple-datapath` feature gate — which forwarded to `quinn-udp`'s own `fast-apple-datapath` feature — is removed entirely from `neqo-bin`'s feature set.

What `fast-apple-datapath` is: This feature activates an optimised UDP I/O path on Apple platforms using `sendmsg_x` and `recvmsg_x` — vectorised, batched socket syscalls that allow multiple UDP datagrams to be sent or received in a single kernel call, significantly reducing syscall overhead for QUIC traffic. These syscalls (`sendmsg_x` / `recvmsg_x`) are Apple-private/Darwin-specific extensions that were introduced in a relatively recent macOS version — they are not available on macOS 10.7–10.9 and are not part of the POSIX socket API. The feature therefore cannot be offered on Momiji's target platforms.

The removal propagates upward: since `neqo-bin` no longer declares `fast-apple-datapath`, no caller can activate it through this crate's feature graph, cleanly severing the dependency on `quinn-udp`'s optimised path from this entry point.

#### `rust/neqo-udp` crate

**Files affected**
* *third_party/rust/neqo-udp/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/neqo-udp/Cargo.toml`

**Summaries:**

This patch remove the `-fast-apple-datapath` feature gate line - which forwarded to `quinn-udp`'s own `fast-apple-datapath` feature - entirely from `neqo-bin`'s feature set.

**Taxonomy classification:**
1. **Feature gating/Build graph surgery**

**Explanations:**

Exactly the same as `rust/neqo-bin` cluster's `Cargo.toml` patch.

#### `rust/quinn-udp` crate

**Files affected**
* *third_party/rust/quinn-udp/.cargo-checksum.json [CHECKSUM]*
* `third_party/rust/quinn-udp/Cargo.toml`

**Summaries:**

Remove the `fast-apple-datapath` feature declaration from `quinn-udp`'s feature table.

**Taxonomy classification:**
1. **Feature gating/build graph surgery**

**Relations:**
1. `third_party/rust/neqo-bin/Cargo.toml`
2. `third_party/rust/neqo-udp/Cargo.toml`

This patch is the **root-level cut**, where patches 123 and 124 removed the forwarding declarations from `neqo-bin` and `neqo-udp` into this crate.

**Explanations:**

This patch is a single line deletion:
```toml
-fast-apple-datapath = []
```

This removes the `fast-apple-datapath` feature declaration from `quinn-udp`'s `[features]` table. The empty `[]` value is significant: it means this feature had no dependency implications at the Cargo level — it activated no additional crates. Instead, it was a pure compile-time signal used as a `#[cfg(feature = "fast-apple-datapath")]` gate within the Rust source code to conditionally compile the `sendmsg_x`/`recvmsg_x`code paths.

Removing it here, at the definition site, is the root-level cut. Patches 123 and 124 removed the forwarding declarations (`fast-apple-datapath = ["quinn-udp/fast-apple-datapath"]`) in neqo-bin and neqo-udp respectively; this patch removes the feature that those forwards were pointing to.

---

### `rust/zeitstempel` cluster

**Files affected**
* *third_party/rust/zeitstempel/.cargo-checksum.json [CHECKSUM]*
* *third_party/rust/zeitstempel/Cargo.lock [package dependency database]*
* `third_party/rust/zeitstempel/Cargo.toml`
* third_party/rust/zeitstempel/src/mac.rs

#### `third_party/rust/zeitstempel/Cargo.toml`

**Summaries:**

This patch makes a single manifest-level change - `whatsys = "0.3"` injection as a new unconditional (non-platform-guard) dependency.

**Taxonomy classification:**
1. **Runtime API availability guard/runtime capability branching**
2. **Layered runtime library substitution**
3. **Build graph surgery**

**Relations:** none

**Explanation:**

`zeitstempel` is a Mozilla crate for obtaining high-resolution monotonic timestamps. On macOS/iOS it uses `mach_absolute_time()` or `clock_gettime(CLOCK_MONOTONIC)`, on Linux/Android `clock_gettime`, and on Windows the Win10+ high-resolution path (gated by the `win10plus` feature). The crate already has a conditional `libc` dependency for POSIX platforms and a `once_cell` dependency for lazy initialization.

The patch makes a single manifest-level change: it injects `whatsys = "0.3"` as a new unconditional (non-platform-gated) dependency.

**`whatsys`** is a lightweight Rust crate that exposes the host operating system's version at runtime — specifically, it queries the OS version string (e.g., macOS `10.13.6`, kernel `17.7.0`) without requiring any OS-specific compile-time configuration. It typically wraps `uname(2)` on Unix-likes, the same syscall seen in the `mfbt` runtime probe analyzed earlier.

The dependency is added without a `[target.*]` qualifier, meaning it is pulled in unconditionally across all platforms at build time, though the actual runtime probing call within `zeitstempel`'s source code would only be invoked on the code paths that need it.

The whitespace addition (`\n` after `win10plus = []`) is cosmetic normalization only.

---


#### `third_party/rust/zeitstempel/src/mac.rs`

**Summaries:**

Backporting and rerouting `clock_gettime_nsec_np` to fallback `Instant::now()`

**Taxonomy classification:**
1. **Runtime API availability guard/runtime capability branching**
2. **Layered runtime library substitution**
3. **Deprecation reversal**

**Relations:** none

**Explanation:**

This patch implements the actual runtime dispatch logic that patch 144 made possible by injecting `whatsys` as a dependency. The site of change is `now_including_suspend()` — `zeitstempel`'s single public entry point for monotonic high-resolution timestamps on macOS.

**Before the patch**, the function was unconditional:
```rust
unsafe { clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW) }
```
This calls Apple's `clock_gettime_nsec_np`, which first appeared in **macOS 10.12 Sierra** (Darwin kernel 16). On any earlier system, the symbol does not exist — the call would fail at runtime or link time depending on how symbol resolution is handled.

**After the patch**, the function branches on a runtime Darwin kernel major version probe:

- **Darwin ≥ 16 (macOS 10.12+):** use `clock_gettime_nsec_np(CLOCK_MONOTONIC_RAW)` — the preferred, hardware-precise path.
- **Darwin < 16 (macOS 10.7–10.11):** fall back to `Instant::now()` relative to a lazily-initialized `INIT_TIME` epoch, converting the duration to nanoseconds via `checked_duration_since`.

The kernel version probe itself is `macos_kernel_major_version()`, which calls `whatsys::kernel_version()`, splits the version string on `.`, parses the major component as `u32`, and returns a typed `Result` with three distinct error variants (`SysCtl`, `Malformed`, `Parsing`). The comment explicitly credits **cubeb-audio** as the source of this pattern — giving us a rare, named provenance trail directly in the code.

The `INIT_TIME: Lazy<Instant>` is a `once_cell`-backed static, initialized on first access, serving as the monotonic epoch anchor for the fallback path.

---

### `third_party/wasm2c` cluster

**Files affected**
* `third_party/wasm2c/src/wast-parser.cc`

**Summaries:**

This is a single-line change, which turns `return tokens[i ^ static_cast<bool>(n)].value();` into `return *tokens[i ^ static_cast<bool>(n)];`

**Taxonomy classification:**
* **Preprocessor branch collapse / compiler compatibility substitution** — specifically, this is a **C++ exception dependency elimination**: replacing a standard library accessor that requires exception support (`.value()`) with a semantically equivalent but exception-free accessor (`operator*`). This is closely related to the **C++17 substitution** pattern seen in the `config` subtree (substituting modern standard library features with equivalents compatible with the build environment's constraints), but the axis of constraint here is not *language standard version* but *exception ABI availability*.

A new sub-category worth noting: **exception ABI elimination** — the systematic replacement of standard library calls that implicitly depend on `-fexceptions` with equivalents that do not.

**Relations:** none

**Explanation:**

The `TokenQueue` is a fixed-size 2-slot ring buffer (indexed by `i`) used to look ahead during parsing. The at(n) accessor computes a slot index via `i ^ static_cast<bool>(n)` — a bitwise trick that selects either slot 0 or 1 depending on n.

**Before:**
```cpp
return tokens[i ^ static_cast<bool>(n)].value();
```

**After:**
```cpp
return *tokens[i ^ static_cast<bool>(n)];
```

The difference is in how the token is extracted from its container. The `.value()` call is characteristic of `std::optional<T>` - returning the contained value but **throws `std::bad_optional_access` if the optional is empty**, and this exception mechanism requires C++ exception support (`-fexceptions`). The dereference operator `*` on an `std::optional` also returns the contained value but does so **without the exception guard** - it is an undefined behaviour if empty, equivalent to a raw pointer dereference.

Mozilla's SpiderMonkey/wasm2c build environment typically compiles with `-fno-exceptions` to reduce binary size and avoid exception-handling overhead, which is standard practice for embedded runtimes and legacy platform targets. On platforms or toolchain configurations where `-fno-exceptions` is active, `.value()` either fails to compile or produces broken code because the exception throw path cannot be emitted. The `*` dereference sidesteps this entirely.

## 24. `toolkit` subtree

### Files affected:
* `toolkit/components/browser/nsWebBrowser.cpp`
* `toolkit/components/browser/nsWebBrowser.h`
* `toolkit/components/remote/nsMacRemoteServer.mm`

* `toolkit/moz.configure`

* `toolkit/xre/MacApplicationDelegate.mm`
* `toolkit/xre/MacLaunchHelper.mm`
* `toolkit/xre/MacRunFromDmgUtils.mm`
* `toolkit/xre/MacUtils.mm`
* `toolkit/xre/nsNativeAppSupportCocoa.mm`

### 24.1. `toolkit/moz.configure`

**Summaries:**

WASM sandboxing exclusion for `soundtouch`

**Taxonomy classification:**
1. **Preprocessor branch collapse**
2. **Build graph surgery**

**Relations:** none

**Explanation:**

`toolkit/moz.configure` is Mozilla's high-level build configuration DSL. The function `default_wasm_sandboxing_libraries()` computes the **default set of libraries that will be wrapped in RLBox/WASM sandboxing** at build time. It does so by starting from the full candidate list (`wasm_sandboxing_libraries`) and filtering out anything listed in `non_default_libs`.

The upstream code sets `non_default_libs = {}` — an empty set, meaning *all* eligible libraries are sandboxed by default. The patch changes this to `non_default_libs = {"soundtouch"}`, which **opts `soundtouch` out of WASM sandboxing** at the configure stage, before any Makefile or `moz.build` logic even runs.

In other words: this is the configuration-layer gate that tells the entire build system *"do not attempt to sandbox soundtouch via RLBox/WASM."*

---


### `toolkit/components` cluster

#### 24.2-3. `toolkit/components/browser/nsWebBrowser.h/.cpp`

**Summaries:**

Internal Widget construction with Delegate lifetime bridge

**Taxonomy classification:**
1. **UI rendering restoration**
2. **Reference safety bridge**

**Relations:** none

**Explanation:**

`nsWebBrowser` is Firefox's core embedding browser component — it wraps a `DocShell` and exposes a windowed browser surface. Upstream, `EnsureWidget()` had a single, hard assertion:

```cpp
MOZ_DIAGNOSTIC_ASSERT(mParentWidget);
return mParentWidget;
```

This assumed a parent widget *always* exists before any widget operation is needed. On certain legacy macOS embedding paths this assumption is violated — there is no parent widget at the time `EnsureWidget()` is called. The assertion fires, and the browser either crashes or produces a non-functional surface.

1. **What the Patch Builds**

The patch introduces a **two-path widget strategy** inside `nsWebBrowser`:

**Path A (unchanged):** If `mParentWidget` exists, return it directly, as before.

**Path B (new):** If no parent widget exists, *create an internal owned child widget*:
```cpp
mInternalWidget = nsIWidget::CreateChildWindow();
widgetInit.mClipChildren = true;
widgetInit.mWindowType = widget::WindowType::Child;
mInternalWidget->SetWidgetListener(&mWidgetListenerDelegate);
mInternalWidget->Create(mParentWidget, bounds, &widgetInit);
return mInternalWidget;
```

`mInternalWidget` is owned by `nsWebBrowser` itself (stored as `nsCOMPtr<nsIWidget>`), and its lifetime is explicitly managed: created in `EnsureWidget()`, destroyed in `InternalDestroy()` with an explicit `SetWidgetListener(nullptr)` before `Destroy()` to prevent dangling listener callbacks.

All downstream widget operations (`SetPositionAndSize`, `GetPositionAndSize`, `SetVisibility`, `GetEnabled`, `SetEnabled`, `GetMainWidget`) are updated with `if (mInternalWidget)` guards that route through the internal widget when present.

2. **The `WidgetListenerDelegate` Pattern**

`nsIWidgetListener` is *not* reference-counted (it does not inherit from `nsISupports`). `nsWebBrowser` *is* reference-counted. This creates a lifetime hazard: the widget can call back into the listener while the browser object is being torn down.

The patch introduces an inner class `WidgetListenerDelegate` to solve this:

```cpp
class WidgetListenerDelegate : public nsIWidgetListener {
  nsWebBrowser* mWebBrowser;  // raw pointer — lifetime bound to nsWebBrowser
public:
  void WindowActivated() override;
  void WindowDeactivated() override;
  bool PaintWindow(...) override;
};
```

The delegate is a **value member** of `nsWebBrowser` (not heap-allocated separately), so its lifetime is exactly co-extensive with the browser object. When any widget event fires, the delegate implementation does:

```cpp
void WidgetListenerDelegate::WindowActivated() {
  RefPtr<nsWebBrowser> holder = mWebBrowser;  // acquire strong ref on stack
  holder->WindowActivated();                   // call MOZ_CAN_RUN_SCRIPT method safely
}
```

The `RefPtr<nsWebBrowser> holder` elevates the raw pointer to a strong reference *on the stack* before dispatching into `MOZ_CAN_RUN_SCRIPT` methods. This is a deliberate pattern for satisfying Gecko's static analysis annotations (`MOZ_CAN_RUN_SCRIPT` / `MOZ_CAN_RUN_SCRIPT_BOUNDARY`): methods that can trigger script execution must be called with a guaranteed live reference in scope.

The actual implementations of `WindowActivated()`, `WindowDeactivated()`, and `PaintWindow()` on `nsWebBrowser` dispatch to `FocusActivate()`, `FocusDeactivate()`, and a `FallbackRenderer`-based background paint respectively.

---


#### 24.4. `toolkit/components/remote/nsMacRemoteServer.mm`

**Summaries:**

NSDictionary Subscript syntax backport

**Taxonomy classification:**
1. **Syntax backport**

**Relations:** none

**Explanation:**

This is `nsMacRemoteServer.mm`, the macOS implementation of Firefox's remote control server — the component that receives IPC messages from a second Firefox instance (e.g., `firefox --remote`) and dispatches command-line arguments into the running instance. The message payload arrives as a serialized `NSDictionary`, deserialized via `NSKeyedUnarchiver`.

Two consecutive key lookups are changed:

```objc
// Upstream (modern subscript syntax)
NSArray*  args  = dict[@"args"];
NSNumber* raise = dict[@"raise"];

// Patch (explicit message syntax)
NSArray*  args  = [dict objectForKey:@"args"];
NSNumber* raise = [dict objectForKey:@"raise"];
```

Both are identical in semantics. `dict[@"args"]` is syntactic sugar introduced in **Xcode 4.4 / clang 3.1 (2012)** that desugars exactly to `[dict objectForKey:@"args"]`. On older toolchains targeting the legacy macOS range the subscript literal syntax is not available, so the patch substitutes the explicit message form.

* Is This the Same Pattern as `accessible/mac`?

Yes, exactly — with one small but worth-noting contextual difference.

In `accessible/mac` the subscript backports appeared on `NSArray` index access (`array[i]` → `[array objectAtIndex:i]`) and `NSDictionary` key access (`dict[key]` → `[dict objectForKey:key]`). This patch is purely the `NSDictionary` variant. The transformation rule is the same; the container type happens to be the same subtype as the dictionary cases in `accessible/mac`.

The file context is different — this is remote IPC command dispatch, not accessibility — but the syntactic constraint is identical: the compiler version available for the legacy target does not support the modern subscript notation, so the explicit runtime message form must be used throughout.

---

### `toolkit/xre` cluster

#### 24.5. `toolkit/xre/MacApplicationDelegate.mm`

**Summaries:**

This patch makes 4 distinct changes to Firefox's `NSApplicationDelegate` implementation:
1. Runtime-gated Apple Event Handler Registration (`-init` and `-dealloc`)
2. New `-handleAppleEvent:withReplyEvent:` implementation
3. New `-application:openFile:` method (pre-10.13 gate)
4. Preprocessor guard on `continueUserActivity:restorationHandler:` signature

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **UI Rendering restoration**
3. **Deprecation reversal**
4. **Syntax backport**

**Relations:** none

**Explanation:**

1. Runtime-Gated Apple Event Handler Registration (`-init` and `-dealloc`)

The most substantive addition. In `-init`, three `NSAppleEventManager` handlers are registered, all guarded by `!nsCocoaFeatures::OnHighSierraOrLater()`:

```objc
if (!nsCocoaFeatures::OnHighSierraOrLater()) {
    NSAppleEventManager* aeMgr = [NSAppleEventManager sharedAppleEventManager];
    [aeMgr setEventHandler:self andSelector:@selector(handleAppleEvent:withReplyEvent:)
             forEventClass:kInternetEventClass andEventID:kAEGetURL];
    [aeMgr setEventHandler:self andSelector:@selector(handleAppleEvent:withReplyEvent:)
             forEventClass:'WWW!' andEventID:'OURL'];
    [aeMgr setEventHandler:self andSelector:@selector(handleAppleEvent:withReplyEvent:)
             forEventClass:kCoreEventClass andEventID:kAEOpenDocuments];
}
```

These three event classes cover:
- `kInternetEventClass` / `kAEGetURL` — the standard "open URL" Apple Event
- `'WWW!'` / `'OURL'` — a legacy WWW open-URL event code, predating the modern `kInternetEventClass` convention
- `kCoreEventClass` / `kAEOpenDocuments` — the standard "open document" Apple Event

On **High Sierra (10.13) and later**, `NSApplicationDelegate` receives URL and document open events through modern delegate methods (`application:openURLs:`, `application:openFile:`) automatically, and `NSApplication` manages Apple Event routing internally. On **pre-High Sierra systems**, this automatic routing either does not exist or is unreliable for these event classes, so the application delegate must register with `NSAppleEventManager` directly to receive them.

The symmetric `-dealloc` method (also newly added) removes all three handlers on pre-High Sierra, which is correct hygiene: failing to deregister leaves dangling handler registrations in `NSAppleEventManager` pointing at a deallocated object.

---

2. New `-handleAppleEvent:withReplyEvent:` Implementation

The handler registered above is fully implemented as a new delegate method. It dispatches on event class/ID:

- `kInternetEventClass/kAEGetURL` or `'WWW!'/'OURL'` → extracts the URL string from `keyDirectObject`, constructs an `NSURL`, calls `[self openURLs:@[url]]`
- `kCoreEventClass/kAEOpenDocuments` → iterates the descriptor list (one-based indexing, as the comment notes), constructs each `NSURL` from path strings, and calls back through `-application:openFile:` for each

This is a complete Apple Event dispatch handler, not a stub.

---

3. New `-application:openFile:` Method (Pre-High Sierra Gate)

```objc
- (BOOL)application:(NSApplication*)theApplication openFile:(NSString*)filename {
    if (nsCocoaFeatures::OnHighSierraOrLater()) return false;
    NS_OBJC_BEGIN_TRY_BLOCK_RETURN;
    return [self openURLs:((NSArray<NSURL*>*) @[filename])];
    NS_OBJC_END_TRY_BLOCK_RETURN(NO);
}
```

`-application:openFile:` is an older `NSApplicationDelegate` method (single-file variant, as opposed to the modern `application:openFiles:`). It is gated to return early on High Sierra and later — on modern systems, this pathway is unused and the modern delegate methods handle file opens. On legacy systems, this routes back through `openURLs:` which normalizes the path into the URL-processing pipeline.

---

4. Preprocessor Guard on `continueUserActivity:restorationHandler:` Signature

```objc
#if defined(MAC_OS_X_VERSION_10_14) && \
    MAC_OS_X_VERSION_MAX_ALLOWED >= MAC_OS_X_VERSION_10_14
    restorationHandler:(void (^)(NSArray<id<NSUserActivityRestoring>>*))restorationHandler {
#else
    restorationHandler:(void (^)(NSArray*))restorationHandler {
#endif
```

The `restorationHandler` block parameter type changed between SDK versions. `NSArray<id<NSUserActivityRestoring>>*` (the typed generic form) was introduced with the `NSUserActivityRestoring` protocol in the 10.14 SDK. On earlier SDKs this type is unavailable, so the block type must fall back to the untyped `NSArray*`. This is a **compile-time SDK version guard** on a method signature, not a runtime branch.

---

#### 24.6. `toolkit/xre/MacLaunchHelper.mm`

**Summaries:**
This patch implements modifications to reroute API calls for pre-10.15 compatibility:
1. `LaunchMacAppWithBundle` - `NSWorkspaceOpenConfiguration` guarded to 10.15+
2. `LaunchChildMac` - `NSTask` API guarded to 10.13+

**Taxonomy classification:**
1. **Runtime API availability guards**

**Relations:** none

**Explanation:**

`MacLaunchHelper.mm` implements two functions used by Firefox's update and restart machinery: `LaunchMacAppWithBundle()` (restarts Firefox as a full `.app` bundle, used for macOS session resume) and `LaunchChildMac()` (launches a child process directly by path, used for the updater subprocess). Both functions call into `NSWorkspace` and `NSTask` APIs that have version-bounded availability.

---

1. Change 1: `LaunchMacAppWithBundle` — `NSWorkspaceOpenConfiguration` guarded to 10.15+

The upstream code uses `NSWorkspaceOpenConfiguration` + `-openApplicationAtURL:configuration:completionHandler:` unconditionally. This API was introduced in **macOS 10.15 (Catalina)**. On any system in the 10.7–10.14 range it does not exist.

The patch wraps the entire existing block in `if(@available(macOS 10.15, *))` and adds an `else` branch using the older API:

```objc
} else {
    NSError *error = nil;
    [[NSWorkspace sharedWorkspace]
        launchApplicationAtURL:[NSBundle mainBundle].bundleURL
                       options:NSWorkspaceLaunchAsync | NSWorkspaceLaunchNewInstance
                 configuration:@{
                     NSWorkspaceLaunchConfigurationArguments: aArguments,
                     NSWorkspaceLaunchConfigurationEnvironment:
                         [[NSProcessInfo processInfo] environment]
                 }
                         error:&error];
}
```

`-launchApplicationAtURL:options:configuration:error:` is the pre-Catalina launch API. It accepts `options` as a bitmask (`NSWorkspaceLaunchAsync | NSWorkspaceLaunchNewInstance`) and `configuration` as a plain `NSDictionary` with string keys, rather than the typed `NSWorkspaceOpenConfiguration` object. This API was deprecated in 10.15 in favour of the configuration-object form, but it is available throughout the 10.7–10.14 range.

Note that the `else` branch does not replicate the semaphore-based synchronous wait — `NSWorkspaceLaunchAsync` means the call returns immediately. This is functionally consistent: the synchronous wait in the 10.15+ branch exists because the completion handler pattern requires it; the older API with `NSWorkspaceLaunchAsync` does not have a completion handler and simply fires-and-forgets.

---

2. Change 2: `LaunchChildMac` — `NSTask` API guarded to 10.13+

Upstream calls `-setExecutableURL:` and `-launchAndReturnError:` on `NSTask` unconditionally. Both were introduced in **macOS 10.13 (High Sierra)**. Prior to 10.13, `NSTask` used the string-based `-setLaunchPath:` and the exception-throwing `-launch`.

The patch reorders the setup so `setArguments:` comes first (no version dependency), then branches:

```objc
if (@available(macOS 10.13, *)) {
    [task setExecutableURL:[NSURL fileURLWithPath:launchPath]];
    [task launchAndReturnError:&error];
} else {
    [task setLaunchPath:launchPath];
    [task launch];
}
```

The pre-10.13 path uses `-setLaunchPath:` (accepts `NSString*`) and `-launch` (void return, throws `NSInvalidArgumentException` on failure rather than populating an `NSError*`). The `if (!error && aPid)` check below the branch remains correct: in the legacy path `error` is never populated (it stays `nil`), so the condition passes and PID capture proceeds normally — equivalent behaviour.

---

#### 24.7. `toolkit/xre/MacRunFromDmgUtils.mm`

**Summaries:**

This patch makes 2 logically independent changes:
1. `NSTask` Launch API Backport (identical structure to `MacLaunchHelper.mm`)
2. Namespace and Include cleanup

**Taxonomy classification:** 
1. **Runtime API availability guard**
2. **Build graph surgery**

**Relations:** none

**Explanation:**

1. Change 1: `NSTask` Launch API Backport (identical structure to `MacLaunchHelper.mm`)

The upstream code calls `-setExecutableURL:` and `-launchAndReturnError:` on `NSTask` unconditionally — the same 10.13+ API dependency seen in `MacLaunchHelper.mm`. The patch applies the exact same `@available(macOS 10.13, *)` branch:

```objc
if (@available(macOS 10.13, *)) {
    [task setExecutableURL:[NSURL fileURLWithPath:aBundlePath]];
    [task launchAndReturnError:nil];
} else {
    [task setLaunchPath:aBundlePath];
    [task launch];
}
```

The pre-10.13 path uses `-setLaunchPath:` (string-based) and `-launch` (void, exception-throwing), identically to `MacLaunchHelper.mm`. The fix is structurally a direct copy of the same resolution applied one file earlier.

---

2. Change 2: Namespace and Include Cleanup

Three upstream lines are removed:

```cpp
#include "MacUtils.h"
using namespace mozilla::MacUtils;
using namespace mozilla::MacLaunchHelper;
```

and the include order is adjusted: `MacRunFromDmgUtils.h` is moved before `MacLaunchHelper.h`. The `using namespace` directives are dropped entirely.

This suggests one of two things: either the symbols from `MacUtils` and the `MacLaunchHelper` namespace are no longer referenced directly in this file under the Momiji build (possibly because some functionality was removed or rerouted), or the namespaces were being pulled in unnecessarily and caused conflicts under the legacy toolchain. Given that `MacLaunchHelper.h` is still included (just reordered), the most likely explanation is that `MacUtils.h` and the `using namespace` declarations became dead includes under the patched build configuration — perhaps because the symbols they provided are now supplied differently or are simply unused after other changes in the patch set.

---

#### 24.8. toolkit/xre/MacUtils.mm

**Summaries:**

This is the recurrence of previously seen `NSTask` Launch API Backport.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:** none

#### 24.9. `toolkit/xre/nsNativeAppSupportCocoa.mm`

**Summaries:**

Minimum OS version floor lowered to 10.7

**Taxonomy classification:**
1. **Metadata override**

**Relations:** none

**Explanation:**

`nsNativeAppSupportCocoa.mm` implements the native application support layer for macOS — startup, shutdown, and OS-level lifecycle integration. This specific check runs early in the launch sequence and gates whether Firefox proceeds or aborts with a "minimum OS version requirement not met" message. It reads the OS version via `major`/`minor` integers (almost certainly populated from `NSProcessInfo` or `Gestalt`) and compares against a hard floor.

Upstream sets that floor at `minor < 12` — i.e., anything below macOS 10.12 (Sierra) is rejected. The patch lowers it to `minor < 7`, accepting everything from macOS 10.7 (Lion) onward.

---

## 25. `tools/profiler/core/platform.cpp`

**Summaries:**

Introduce a guarded availability check using `__builtin_available(macOS 10.10, *)` against the syscall `qos_class_self()`

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch modifies `tools/profiler/core/platform.cpp` within the Gecko profiler subsystem. The specific site is the `profiler_mark_thread_awake()` function, which emits a profiler marker to record when a thread transitions from sleep to awake — including, on Darwin, the thread's current QoS (Quality of Service) class.

The original code called `qos_class_self()` directly as an argument to `PROFILER_MARKER`. This function was introduced in macOS 10.10 (Yosemite). On macOS 10.7–10.9 — all targets within Momiji's support range — the symbol is simply absent from the system library, causing a link-time or runtime resolution failure.

The patch introduces a guarded availability check using `__builtin_available(macOS 10.10, *)`, which is Clang's mechanism for emitting runtime OS version checks. If running on 10.10+, `qos_class_self()` is called and the result stored in `qos_self_retval`; otherwise the fallback value `QOS_CLASS_UNSPECIFIED (= 0)` is assigned. The stored value is then passed into the marker call in place of the direct API call.

One subtle structural detail: the `__builtin_available` guard block is inserted before the `#endif` that closes the existing `GP_OS_darwin` block, and the variable `qos_self_retval` is declared outside the conditional branch, so it remains in scope for the subsequent marker invocation inside a separate `#if defined(GP_OS_darwin)` block. This is a deliberate scope management choice to avoid code duplication in the marker call site.

## 26. `uriloader/exthandler/mac/nsOSHelperAppService.mm`

**Summaries:**

This patch introduces an Obj-C runtime availability guard using `@available(macOS 10.10, *)`, reroute the `LSCopyDefaultApplicationURLForURL()` to `LSGetApplicationForURL()` for macOS 10.7-10.9.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch modifies `uriloader/exthandler/mac/nsOSHelperAppService.mm`, the macOS implementation of Firefox's external application handler — the subsystem responsible for resolving which application should handle a given URL scheme or MIME type (e.g. opening `mailto:` links in Mail.app, or `http:` links in another browser).

The function `GetDefaultBundleURL` queries Launch Services to find the default application bundle URL for a given scheme. The original code called `LSCopyDefaultApplicationURLForURL()` unconditionally. This API was introduced in macOS 10.10; on 10.7–10.9 it does not exist.

The patch introduces an Objective-C runtime availability guard using `@available(macOS 10.10, *)` — the Objective-C/Swift counterpart to the C `__builtin_available` seen in the previous patch. On 10.10+, the existing path is preserved unchanged. On 10.7–10.9, the patch substitutes `LSGetApplicationForURL()`, which is an older Launch Services API that performs an equivalent lookup but returns the result through an out-parameter (`aBundleURL`) and signals success via an `OSStatus` return value rather than a direct return. The success condition is checked as `theErr == noErr && *aBundleURL != NULL`, which is the correct idiomatic check for this API. Critically, the `CFRelease(lookupCFURL)` call remains outside both branches, so memory management is unaffected — the patch does not introduce any resource leak.

It is worth noting that `LSGetApplicationForURL()` was itself deprecated in macOS 12.0, but it remains functional throughout the entire Momiji target range (10.7–10.14), so it is the correct choice for the pre-10.10 fallback slot.

## 27. `widget` subtree

### Files affected:
* `widget/InitData.h`
* `widget/LookAndFeel.h`
* `widget/TextRecognition.cpp`
* `widget/nsBaseWidget.cpp`
* `widget/nsBaseWidget.h`
* `widget/nsIWidget.h`
* `widget/nsPrinterListCUPS.cpp`
* `widget/nsXPLookAndFeel.cpp`


**[widget/cocoa cluster]**
* `widget/cocoa/GfxInfo.mm`
* `widget/cocoa/MacThemeGeometryType.h`
* `widget/cocoa/MediaHardwareKeysEventSourceMacMediaCenter.mm`
* `widget/cocoa/MediaKeysEventSourceFactory.cpp`
* `widget/cocoa/NativeKeyBindings.mm`
* `widget/cocoa/NativeMenuMac.mm`

* `widget/cocoa/OSXNotificationCenter.h`
* `widget/cocoa/OSXNotificationCenter.mm`

* `widget/cocoa/ScreenHelperCocoa.mm`

* `widget/cocoa/TextInputHandler.h`
* `widget/cocoa/TextInputHandler.mm`

* `widget/cocoa/TextRecognition.mm`

* `widget/cocoa/VibrancyManager.h`
* `widget/cocoa/VibrancyManager.mm`

* `widget/cocoa/ViewRegion.h`
* `widget/cocoa/ViewRegion.mm`

* widget/cocoa/moz.build

* `widget/cocoa/nsAppShell.mm`

* `widget/cocoa/nsChildView.h`
* **[new file]** `widget/cocoa/nsChildView.mm`

* `widget/cocoa/nsClipboard.mm`

* `widget/cocoa/nsCocoaFeatures.h`
* `widget/cocoa/nsCocoaFeatures.mm`

* `widget/cocoa/nsCocoaUtils.h`
* `widget/cocoa/nsCocoaUtils.mm`

* `widget/cocoa/nsCocoaWindow.h`
* `widget/cocoa/nsCocoaWindow.mm`

* `widget/cocoa/nsDragService.mm`

* `widget/cocoa/nsLookAndFeel.h`
* `widget/cocoa/nsLookAndFeel.mm`

* **[new file]** `widget/cocoa/SDKDeclarations.h`
* `widget/cocoa/nsMacDockSupport.mm`
* `widget/cocoa/nsMacFinderProgress.mm`
* `widget/cocoa/nsMacSharingService.mm`
* `widget/cocoa/nsMacUserActivityUpdater.mm`
* `widget/cocoa/nsMenuX.mm`

* `widget/cocoa/nsNativeThemeCocoa.h`
* `widget/cocoa/nsNativeThemeCocoa.mm`

* `widget/cocoa/nsNativeThemeColors.h`

* `widget/cocoa/nsTouchBar.mm`
* `widget/cocoa/nsTouchBarInput.mm`

* **[new file]** `widget/cocoa/nsTouchBarNativeAPIDefines.h`
* `widget/cocoa/nsTouchBarUpdater.mm`

### 27.1. `widget/InitData.h`

**Summaries:**

This patch introduces 2 related changes:
1. Re-introduction of `WindowType::Child` into the `WindowType` enum
2. Change of the default `mWindowType` field in `InitData`

**Taxonomy classification:**
1. **Deprecation reversal**
2. **Runtime API availbility guard** (implicit)

**Relations:** none

**Explanation:**

This patch makes two related changes to `widget/InitData.h`, which defines the `InitData` struct used to parameterise widget construction across the entire Gecko widget layer:

**1. Re-introduction of `WindowType::Child` into the `WindowType` enum**

The upstream `WindowType` enum contains `TopLevel`, `Dialog`, `Popup`, and `Invisible`. The patch inserts `Child` between `Popup` and `Invisible`, restoring a window type that was removed from mainline Firefox at some point after legacy macOS support was dropped. `Child` semantics are defined in the comment: a window contained *inside* another window on the desktop, with no border decoration. This is the classical embedded/in-process child window model, the kind used for plugin containers and legacy embedding APIs (NSView subviews embedded in a parent NSWindow on macOS).

**2. Change of the default `mWindowType` field in `InitData`**

The default initialiser for `mWindowType` is changed from `WindowType::TopLevel` to `WindowType::Child`. This is architecturally significant: every `InitData` instance that does not explicitly set `mWindowType` will now default to `Child` rather than `TopLevel`.

The combined effect is: the `Child` type is made available *and* becomes the implicit fallthrough for code paths that do not specify a window type — presumably because legacy macOS window management code expects embedded child window semantics as the normative case for widget creation.

---

### 27.2. `widget/LookAndFeel.h`

**Summaries:**

This patch insert 3 new metric variants into the `IntID` enum:
1. `MacGraphiteTheme` (for pre-10.15 target)
2. `MacLionTheme` (for 10.7 target)
3. `MacYosemiteTheme` (for 10.10 target)

**Taxonomy classification:**
1. **Deprecation reversal**
2. **fearure gating**

**Relations:** none

**Explanation:**

`LookAndFeel.h` defines the cross-platform theming query interface for Gecko — it provides the abstract enumeration of system appearance metrics that the browser can query at runtime to adapt rendering to the host platform's visual style. Each variant in the IntID (or equivalent) enum represents a queryable Boolean or integer metric; platform backends implement the query, and non-applicable platforms return `NS_ERROR_NOT_IMPLEMENTED`.

This patch inserts three new metric variants into that enum:
* `MacGraphiteTheme` — a Boolean querying whether the user has selected the Graphite appearance in macOS System Preferences. The Graphite theme replaces the default Aqua blue accent colour with uniform grey across all UI controls. This preference was present from Mac OS X 10.0 through Mojave (10.14); it was removed in macOS 10.15 Catalina as Apple unified appearance handling under the new Accent Color system.
* `MacLionTheme` — a Boolean enabling Lion (10.7)-specific theming code paths. Lion introduced a significant visual redesign: scrollbar changes (overlay scrollbars by default), full-screen mode, Launchpad, and revised window chrome. A dedicated metric here allows the Gecko theme backend to branch on whether it is running on 10.7-era UI conventions.
* `MacYosemiteTheme` — a Boolean enabling Yosemite (10.10)-specific theming. Yosemite was the most visually disruptive macOS redesign in the relevant era: it introduced the flat, translucent aesthetic that replaced the Aqua skeuomorphic look, vibrancy effects, and a revised title bar and toolbar appearance. This is the most consequential of the three for widget rendering fidelity.

All three follow the established contract for platform-specific metrics: they are explicitly documented as no-ops on non-Mac platforms, with `NS_ERROR_NOT_IMPLEMENTED` as the expected non-Mac return value. Their removal from upstream reflects the fact that once Firefox dropped support for macOS versions prior to 10.15, these version-discriminating metrics became dead code — the only supported runtime was post-Yosemite, making version branching unnecessary.

### 27.3. `widget/TextRecognition.cpp`

**Summaries:**

This patch makes 2 logically distinct changes:
1. Forward declaration of `__sincospif`/`__sincospi` for pre-10.9 targets
2. Runtime gating of `TextRecognition::IsSupported()` on Catalina (10.15+)

**Taxonomy classification:**
1. **Runtime library substitution/ABI substrate access**
2. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch makes two logically distinct changes to `TextRecognition.cpp`, which implements Gecko's on-device image-to-text recognition feature using Apple's Vision framework:

**1. Forward declaration of `__sincospif` / `__sincospi` for pre-10.9 targets**

On macOS 10.9 (Mavericks) and later, `__sincospif` and `__sincospi` — combined sine/cosine functions operating on a value scaled by π — are available as declared symbols in the system math library headers. On pre-10.9 targets, the header declarations are absent even though the underlying symbols may exist in `libm`. The patch adds a preprocessor-guarded block that, when `MAC_OS_VERSION_10_9` is either undefined or the minimum deployment target is below 10.9, manually includes `<math.h>` and provides `extern "C"` forward declarations for both the `float` and `double` variants.

The guard condition `!defined(MAC_OS_VERSION_10_9) || MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_VERSION_10_9` is carefully constructed: the first clause catches toolchains whose SDK predates 10.9 entirely (where the macro is not defined at all); the second catches toolchains that define the macro but are compiling for a deployment target below 10.9. Together they ensure the declarations are injected precisely when and only when the system headers will not provide them.

**2. Runtime gating of `TextRecognition::IsSupported()` on Catalina (10.15+)**

Upstream, `IsSupported()` unconditionally returns `true` on `XP_MACOSX`. This is correct for a browser that only targets macOS 10.15+, since Apple's `VNRecognizeTextRequest` — the Vision framework API underlying the entire text recognition feature — requires 10.15 as its minimum deployment target.

The patch replaces the unconditional `return true` with `return nsCocoaFeatures::OnCatalinaOrLater()`, a runtime OS version check. It also adds the corresponding `#include "nsCocoaFeatures.h"` under an `XP_MACOSX` guard. The comment explicitly documents the dependency: `VNRecognizeTextRequest - macOS 10.15+`.

The combined effect is that on macOS 10.7–10.14, `IsSupported()` returns `false`, gracefully disabling the feature rather than allowing it to be invoked against a missing framework API.

---

### 27.4-5. `widget/nsBaseWidget.cpp/.h`

**Summaries:**

This clustered `nsBaseWidget` makes 4 distinct changes:
1. `.h`: `ClientToWindowSize()` default implementation added to `nsBaseWidget`
2. `.cpp`: `AttachViewToTopLevel()` assertion extended to include `WindowType::Child`
3. `.cpp`: `NormalSizeModeClientToWindowSizeDifference()` removed from `nsIWidget`
4. `.cpp`: `UseAPZ()` extended to enable Async Pan/Zoom for `Child` windows, with `else/if` correction

**Taxonomy classification:**
1. **Deprecation reversal**
2. **Feature gating**
3. **Build graph surgery**
4. **Runtime API availability guard**
5. **Preprocessor branch collapse**

**Relations:** none

**Explanation:**

`nsBaseWidget` is the abstract base class for all platform widget implementations in Gecko — it is the C++ backbone from which `nsCocoaWindow`, `nsChildView`, and all other concrete widget types inherit. Changes here propagate across the entire widget hierarchy. This cluster makes four distinct changes:

**1. `.h`: `ClientToWindowSize()` default implementation added to `nsBaseWidget`**

A new override of `ClientToWindowSize(const LayoutDeviceIntSize&)` is added as an inline identity function — it returns the client size unchanged. In Gecko's window model, the difference between client size (the drawable content area) and window size (including decorations, title bar, borders) is platform-specific. The upstream base class does not provide a default; concrete subclasses are expected to implement it. Providing an identity-function default in `nsBaseWidget` means that child windows — which on legacy macOS have no decoration, matching the `WindowType::Child` semantics restored in patch 157 — correctly report zero chrome overhead without requiring each platform subclass to special-case the decoration-free case.

**2. `.cpp`: `AttachViewToTopLevel()` assertion extended to include `WindowType::Child`**

The `NS_ASSERTION` that guards `AttachViewToTopLevel()` previously only permitted `TopLevel`, `Dialog`, and `Invisible` window types. The patch extends it to also permit `Child`. The syntax used — adding `mWindowType == WindowType::Child` as a comma-operator expression inside the assertion — is notable. The comma operator in C evaluates both operands but discards the left-hand result, meaning the assertion condition is effectively just the last operand. This is likely an intentional or inadvertent use of the comma operator to append the check without restructuring the entire `||` chain; defensively it documents intent, though it does not technically tighten the assertion. Regardless of the comma operator subtlety, the semantic intent is clear: `Child`-type windows must be permissible targets for view attachment.

**3. `.cpp`: `NormalSizeModeClientToWindowSizeDifference()` removed from `nsIWidget`**

A method on `nsIWidget` that computed the size difference between window and client rect by summing the margin components from `NormalSizeModeClientToWindowMargin()` is entirely removed. Its four `MOZ_ASSERT` guards — asserting non-negative margins on all sides — go with it. This method embodies the assumption that windows are always *larger than or equal to* their client areas, i.e. that decoration always adds non-negative extent. This assumption is false for `Child` windows, which have no decoration and thus a zero-extent margin that may cause the assertion to fire or produce incorrect size arithmetic. The removal is the correct response: rather than patching the assertions to handle the zero-decoration case, the entire difference-computation method is excised, with the identity default in `ClientToWindowSize()` (change 1) providing the replacement semantics.

**4. `.cpp`: `UseAPZ()` extended to enable Async Pan/Zoom for `Child` windows, with `else if` correction**

The APZ (Async Pan/Zoom) compositor path is gated on window type. Previously only `TopLevel` unconditionally enabled APZ. The patch adds `|| mWindowType == WindowType::Child` so that child windows also participate in the APZ compositor path. Additionally, the following `if` testing `apz_popups_without_remote_enabled` is changed to `else if`, making the popup branch mutually exclusive with the `TopLevel || Child` branch — a necessary logical correction, since previously a `Child` or `TopLevel` window could fall through into the popup branch under certain condition orderings.

There is also a minor refactor in `AutoLayerManagerSetup`: the `auto* fallback` variable is inlined — `renderer->AsFallback()` is called twice instead of being cached in a named variable. This is a cosmetic change with no semantic effect in the absence of side effects in `AsFallback()`.

---

### 27.6. `widget/nsIWidget.h`

**Summaries:**

This patch makes 4 related changes, all of which are consequences of the `WindowType::Child` restoration cascading upward into the interface layer:
1. Documentation trimming: removal of `PersistClientBounds()` reference from `GetRestoredBounds()` docstring
2. Removal of `PersistClientBounds()` virtual method
3. API redesign: `NormalSizeModeClientToWindowMargin()` + `NormalSizeModeClientToWindowSizeDifference()` replaced by `ClientToWindowSize()`
4. `mWindowType` default chaqnged from `TopLevel` to `Child` in `nsIWidget`

**Taxonomy classification:**
1. **Build graph surgery**
2. **Deprecation reversal**

**Relations:** none

**Explanation:**

`nsIWidget.h` defines the abstract widget interface — the pure virtual contract that every platform widget implementation must satisfy. Changes here define the invariants and API surface that the entire widget hierarchy is bound to. This patch makes four related changes, all of which are consequences of the `WindowType::Child` restoration cascading upward into the interface layer:

**1. Documentation trimming: removal of `PersistClientBounds()` reference from `GetRestoredBounds()` docstring**

The comment for `GetRestoredBounds()` previously noted that on platforms where `PersistClientBounds()` returns `true`, the returned bounds are client-space rather than window-space. That caveat is removed. This is a documentation change that reflects the removal of the `PersistClientBounds()` method itself (change 2 below).

**2. Removal of `PersistClientBounds()` virtual method**

The `PersistClientBounds()` virtual method — defaulting to `false`, with its GTK-specific semantics documented — is entirely removed from the interface. Its rationale was that GTK cannot determine decoration extents before window realisation, so it persists client-space (inner) bounds instead of window-space bounds. This GTK-specific accommodation is incompatible with child window geometry on legacy macOS, where the distinction between client and window space does not apply in the same way. Removing it cleans the interface of a platform accommodation that is not meaningful in the legacy target context.

**3. API redesign: `NormalSizeModeClientToWindowMargin()` + `NormalSizeModeClientToWindowSizeDifference()` replaced by `ClientToWindowSize()`**

This is the most structurally significant change. Two methods are removed:

- `NormalSizeModeClientToWindowMargin()` — a virtual method returning a `LayoutDeviceIntMargin` representing the four-sided chrome margin around the client area in normal size mode, defaulting to an empty margin.
- `NormalSizeModeClientToWindowSizeDifference()` — a non-virtual method that computed a `LayoutDeviceIntSize` by summing the margin components (already removed from the `.cpp` in patch 161).

These are replaced by a single pure virtual method:

```cpp
virtual LayoutDeviceIntSize ClientToWindowSize(
    const LayoutDeviceIntSize& aClientSize) = 0;
```

The new API takes an explicit client size as input and returns the corresponding window size. This is a more direct and composable formulation: instead of querying a margin and doing arithmetic externally, callers pass the client size and receive the window size directly. Making it pure virtual (= 0) means every concrete subclass must implement it — there is no longer a default that could silently return incorrect geometry for child windows. The identity-function default provided in `nsBaseWidget` (patch 160) satisfies this contract for the child-window case.

The docstring change accompanying this is also notable: the old text said "returns the size difference from client area to window area"; the new text says "given the specified client size, return the corresponding window size." This shifts the framing from delta-computation to direct mapping — architecturally cleaner and free of the assumption that the difference is always non-negative.

**4. `mWindowType` default changed from `TopLevel` to `Child` in `nsIWidget`**

The field declaration `WindowType mWindowType = WindowType::TopLevel` is changed to `WindowType::Child`. This is the interface-level counterpart of the default change in `InitData` (patch 157). It ensures that any `nsIWidget` subclass instance that does not explicitly assign `mWindowType` defaults to child-window semantics. This is the root of the default propagation — since `nsBaseWidget` and all concrete platform classes inherit from `nsIWidget`, this default propagates to all of them.

---

### 27.7. `widget/nsPrinterListCUPS.cpp`

**Summaries:**

This patch inserts a version-gated fallback path exclusively for macOS, structured as follows:
1. Runtime gate on macOS 10.9
2. Pre-10.9 fallback: `cupsGetDests()` with manual filtering

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Runtime library substitution**

**Relations:** none

**Explanation:**

`nsPrinterListCUPS.cpp` implements Firefox's printer enumeration backend using the CUPS (Common Unix Printing System) API, shared across macOS and Linux. The specific function being modified is `nsPrinterListCUPS::Printers()`, which builds the list of available printers. The upstream code uses `cupsEnumDests()` as its primary enumeration API, falling back to a retry with the `CUPS_PRINTER_DISCOVERED` flag masked out when errors occur.

The patch inserts a version-gated fallback path exclusively for macOS, structured as follows:

**Runtime gate on macOS 10.9**

The existing `cupsEnumDests()` retry call is wrapped in `__builtin_available(macOS 10.9, *)` — Apple's compile-time/runtime availability check. If the runtime OS is 10.9 or later, the existing `cupsEnumDests()` path executes as before. If the runtime OS is pre-10.9 (i.e. macOS 10.7–10.8), the `else` branch executes instead.

**Pre-10.9 fallback: `cupsGetDests()` with manual filtering**

The fallback implements printer enumeration using the older `cupsGetDests()` API, which predates `cupsEnumDests()`. `cupsGetDests()` returns a flat array of `cups_dest_t` structs rather than using an asynchronous callback model. The fallback then manually filters the results:

- It retrieves the `printer-type` option from each destination's option list via `cupsGetOption()`.
- It parses the type as a 64-bit integer and tests against a bitmask of `CUPS_PRINTER_FAX | CUPS_PRINTER_SCANNER | CUPS_PRINTER_DISCOVERED` — excluding fax devices, scanners, and network-discovered (as opposed to locally configured) printers. This manual filtering reproduces what the masked `cupsEnumDests()` call would have excluded by flag.
- For each accepted printer, it calls `cupsCopyDest()` to produce an owned copy of the `cups_dest_t` struct (which the caller is responsible for freeing), retrieves the display name, and appends a `PrinterInfo` to the result list.

The comment preserved from an earlier upstream discussion acknowledges the performance trade-off: `cupsGetDests()` is slower than the flag-filtered `cupsEnumDests()` because it retrieves all destinations before filtering, but the comment also notes that `cupsEnumDests()` on some platforms (Ubuntu 20.04 is cited) fails to honour the `CUPS_PRINTER_DISCOVERED` exclusion flag anyway — making `cupsGetDests()` + manual filtering a more reliable cross-platform approach in any case.

---

### 27.8. `widget/nsXPLookAndFeel.cpp`

**Summaries:**

This patch makes 3 coordinated additions:
1. Registration of 3 macOS version-theme interger metrics in `sIntPrefs`
2. Registration of 11 macOS vibrancy and menu colour IDs in `sColorPrefs`
3. Standin color values for the 11 macOS colour IDs in `GetStandinForNativeColor()`

**Taxonomy classification:**
1. **Deprecation reversal**
2. **UI rendering restoration**

**Relations:** none

**Explanation:**

`nsXPLookAndFeel.cpp` is the cross-platform implementation of Gecko's Look-and-Feel system — the layer that mediates between the browser's rendering engine and the host platform's visual identity. It maintains two critical static arrays: `sIntPrefs`, mapping `IntID` enum variants to user-preference keys, and `sColorPrefs`, mapping `ColorID` enum variants to preference keys. It also contains `GetStandinForNativeColor()`, which provides hardcoded fallback colour values used when the native platform colour cannot be queried (e.g., in headless mode or during early initialisation).

The patch makes three coordinated additions:

**1. Registration of three macOS version-theme integer metrics in `sIntPrefs`**

Three entries are added to `sIntPrefs`:

```
"ui.macGraphiteTheme"
"ui.macLionTheme"
"ui.macYosemiteTheme"
```

These are the preference-key registrations for the `MacGraphiteTheme`, `MacLionTheme`, and `MacYosemiteTheme` `IntID` variants restored in patch 158. The `sIntPrefs` array is index-parallel to the `IntID` enum — each entry's position in the array must correspond exactly to the position of its associated enum variant. Adding these entries here, immediately before `"ui.macBigSurTheme"` (which already exists upstream), registers these metrics as queryable through the standard Look-and-Feel preference override mechanism and completes the wiring from enum variant to preference key that makes the metrics functional at runtime.

**2. Registration of eleven macOS vibrancy and menu colour IDs in `sColorPrefs`**

Eleven macOS-specific colour identifiers are added to `sColorPrefs`:

- `ui.-moz-mac-vibrancy-light` / `-dark` — vibrancy effect background colours in light and dark appearances
- `ui.-moz-mac-vibrant-titlebar-light` / `-dark` — vibrancy colours specifically for the title bar region
- `ui.-moz-mac-menupopup` — the background colour of menu popups
- `ui.-moz-mac-menuitem` — the background colour of non-selected menu items
- `ui.-moz-mac-active-menuitem` — the background colour of selected/active menu items
- `ui.-moz-mac-source-list` — the background of source-list sidebar panels (e.g. Finder-style sidebar)
- `ui.-moz-mac-source-list-selection` / `-active-source-list-selection` — source list item selection colours
- `ui.-moz-mac-tooltip` — the tooltip background colour

These correspond to `ColorID` enum variants introduced by the legacy macOS theme layer. Their absence from `sColorPrefs` would mean the colour IDs are never mapped to preference keys and are therefore unreachable through the preference override system — any renderer querying them would receive only the fallback standin value.

**3. Standin colour values for the eleven macOS colour IDs in `GetStandinForNativeColor()`**

Each of the eleven restored colour IDs is given a hardcoded standin value:

- Light vibrancy surfaces: `#f7f7f7` (near-white)
- Dark vibrancy surfaces: `#282828` (near-black)
- Menu popup and menuitem backgrounds: `#e6e6e6` (light grey)
- Active menuitem and active source list selection: `#0a64dc` (macOS blue highlight)
- Source list and tooltip backgrounds: `#f7f7f7` (near-white)
- Source list selection (inactive): `#c8c8c8` (medium grey)

These values are not live system colours — they are static approximations of the macOS Yosemite-era default palette, used when the native colour cannot be queried. They represent the expected visual appearance under standard macOS theming without customisation.

---

### `widget/cocoa` cluster

#### 27.9. `widget/cocoa/GfxInfo.mm`

**Summaries:**

Reverse the blockage of Canvas features on pre-10.8 macOS.

**Taxonomy classification:**
1. **Deprecation reversal**

**Relations:** none

**Explanation:**

This patch modifies the GPU/graphics feature status logic in `GfxInfo.mm`, which is the macOS-specific implementation of Firefox's graphics information and blocklist system.

The relevant code is a `switch` statement that maps an `OperatingSystem` enum value to a feature status result - specifically for a Canvas-related GPU feature. The pre-patch logic reads:
```cpp
case OSX10_5:
case OSX10_6:
case OSX10_7:
    *aStatus = FEATURE_BLOCKED_OS_VERSION;
    aFailureId = "FEATURE_FAILURE_CANVAS_OSX_VERSION";
    break;
default:
    *aStatus = FEATURE_STATUS_OK;
    break;
```

The patch **remnoves the block body** from the `OSX10_7` case (and implicitly from 10.5 and 10.6, whcih fall through into it), causing all 3 to fall through into `default` instead - resulting in `FEATURE_STATUS_OK` being returned for macOS 10.7 and below.

In practical terms: prior to this patch, Firefox's graphics feature negotiation would declare Canvas features **blocked** on macOS 10.7. After this patch, macOS 10.7. is treated identically to any other non-explicitly-blocked OS version - Canvas is **permitted**.

---

#### 27.10. `widget/cocoa/MacThemeGeometryType.h`

**Summaries:**

This patch extends the `MacThemeGeometryType` enum, which enumerates the distinct macOS UI geometry regions that Firefox's compositor needs to identify for nativer theme rendering purposes.

**Taxonomy classification:**
1. **UI rendering restoration**

**Relations:** none

**Explanation:**

This patch extends the `MacThemeGeometryType` enum, which enumerates the distinct macOS UI geometry regions that Firefox's compositor needs to identify for native theme rendering purposes. The enum is used to tag window sub-regions so the platform-specific theming layer can apply the correct native material, vibrancy effect, or system drawing primitive to each area.

The original enum contained three entries covering basic chrome regions: titlebar, sidebar, and window buttons. The patch adds ten new entries:

- **`eThemeGeometryTypeFullscreenButton`** — the green traffic-light button / fullscreen control
- **`eThemeGeometryTypeMenu`** — menu panel backgrounds
- **`eThemeGeometryTypeHighlightedMenuItem`** — selected/active menu item highlight
- **`eThemeGeometryTypeVibrancyLight` / `eThemeGeometryTypeVibrancyDark`** — generic vibrancy material regions (light and dark variants), used for translucent blur-backed surfaces
- **`eThemeGeometryTypeVibrantTitlebarLight` / `eThemeGeometryTypeVibrantTitlebarDark`** — vibrancy-specific titlebar variants (introduced by Apple in macOS 10.10 Yosemite's `NSVisualEffectView`)
- **`eThemeGeometryTypeTooltip`** — tooltip bubble rendering regions
- **`eThemeGeometryTypeSourceList`** — sidebar source list (e.g., Finder-style left-panel background)
- **`eThemeGeometryTypeSourceListSelection` / `eThemeGeometryTypeActiveSourceListSelection`** — inactive and active selection highlight within a source list

These additions are purely a **header-level enum extension** — no logic, no method bodies. The enum values are auto-incremented sequentially from the last existing entry (`eThemeGeometryTypeWindowButtons`).

---

#### 27.11. `widget/cocoa/MediaHardwareKeysEventSourceMacMediaCenter.mm`

**Summaries:**

This patch modifies the Now Playing / media center integration code responsible for populating macOS's `MPNowPlayingInfoCenter` with metadata - specifically the **album artwork** key `MPMediaItemPropertyArtwork`.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch modifies the Now Playing / media center integration code responsible for populating macOS's `MPNowPlayingInfoCenter` with metadata — specifically the **album artwork** key (`MPMediaItemPropertyArtwork`).

Two distinct sites are modified:

1. **Hunk 1 (line ~207) — artwork removal path:**
The call `[nowPlayingInfo removeObjectForKey:MPMediaItemPropertyArtwork]` is wrapped in an `@available(macos 10.13.2, *)` guard. Previously this removal was unconditional; now it only executes on 10.13.2+. The indentation of the subsequent `mNextImageIndex`/`LoadImageAtIndex` block is also adjusted (cosmetically, no logic change there).

2. **Hunk 2 (line ~319) — artwork insertion path:**
The call `[nowPlayingInfo setObject:artwork forKey:MPMediaItemPropertyArtwork]` is likewise wrapped in `@available(macOS 10.13.2, *)`. Additionally, the two `release` calls — `[artwork release]` and `[image release]` — are **removed entirely** from the patch, not merely guarded.

The version threshold `10.13.2` is specific and non-arbitrary: `MPMediaItemPropertyArtwork` with `MPMediaItemArtwork` initialized via the block-based initializer `initWithBoundsSize:requestHandler:` was introduced in macOS 10.13.2. On earlier systems, `MPMediaItemPropertyArtwork` either uses a different initializer signature or the entire `MPNowPlayingInfoCenter` artwork API behaves differently.

The removal of `[artwork release]` and `[image release]` is the more structurally significant change. Under MRC (Manual Retain Count), these would be required to avoid leaks. Their removal implies the surrounding code has transitioned to ARC (Automatic Reference Counting) management for these objects — or that under the `@available` guard the objects are never created on the affected paths and the releases become unreachable dead code that ARC/the compiler handles differently.

---

#### 27.12. `widget/cocoa/MediaKeysEventSourceFactory.cpp`

**Summaries:**

This patch modifies the factory function `CreateMediaControlKeySource()`. In detail, it enforces a runtime version check `nsCocoaFeatures::IsAtLeastVersion(10, 12, 2)`, with binary paths for macOS >= 10.12.2 and the opposite.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch modifies the factory function `CreateMediaControlKeySource()`, which is the single construction point for the macOS media control key event source — the object responsible for intercepting hardware media keys (play/pause, next, previous) and routing them to Firefox's media control subsystem.

**Pre-patch:** The factory unconditionally returns a `MediaHardwareKeysEventSourceMacMediaCenter` instance — the modern implementation that integrates with `MPNowPlayingInfoCenter`, the system-level media center introduced in macOS 10.12.2.

**Post-patch:** A runtime version check via `nsCocoaFeatures::IsAtLeastVersion(10, 12, 2)` gates the construction:
- On macOS ≥ 10.12.2 → `MediaHardwareKeysEventSourceMacMediaCenter` (the media center path)
- On macOS < 10.12.2 → `MediaHardwareKeysEventSourceMac` (the legacy path, which uses the older `CGEventTap`-based media key interception mechanism)

The version threshold `10.12.2` precisely matches the macOS release in which `MPNowPlayingInfoCenter` and the media center hardware key integration API became available. Below this version, the media center backend simply does not exist in the OS, so instantiating it would either silently fail or crash at the point of first API call.

The `nsCocoaFeatures.h` include is added to make the version query function available — it was not previously needed since the factory had no version-conditional logic.

---

#### 27.13. `widget/cocoa/NativeKeyBindings.mm`

**Summaries:**

This is a single-token change in the construction of an `NSEvent` object via `keyEventWithType:location:modifierFlags:timestamp:windowNumber:context:characters:charactersIgnoringModifiers:isARepeat:keyCode:`

**Taxonomy classification:**
1. **Deprecation reversal**

**Relations:** none

**Explanation:**

This is a single-token change in the construction of an `NSEvent` object via `keyEventWithType:location:modifierFlags:timestamp:windowNumber:context:characters:charactersIgnoringModifiers:isARepeat:keyCode:`.

The modified parameter is `context:`, which accepts an `NSGraphicsContext` argument. The change is:

- **Before:** `context:nil`
- **After:** `context:[originalEvent context]`

The `context:` parameter in `NSEvent`'s keyboard event constructor historically accepted an `NSGraphicsContext` associated with the event's originating window. Apple deprecated the `context:` parameter — and the `-[NSEvent context]` method itself — in macOS 10.12, with the parameter being formally ignored from that point onward. Modern Firefox code passes `nil` here because Apple's own documentation recommends it for 10.12+.

However, on macOS versions **prior to 10.12**, `context:` is not ignored — it participates in event routing. Passing `nil` where the original event had a valid graphics context can cause the synthesized key event to be misrouted or dropped, because the runtime event dispatch machinery on those older systems uses the graphics context to identify the target window surface.

This patch restores the original event's graphics context (`[originalEvent context]`) to the synthesized event, ensuring the reconstructed `NSEvent` faithfully mirrors the source event on all macOS versions including pre-10.12.

---

#### 27.14. `widget/cocoa/NativeMenuMac.mm`

**Summaries:**

This patch modifies 2 distinct sites in `NativeMenuMac.mm` which handles macOS native menu rendering for both status bar menus and context menus.

**Taxonomy classification:**
1. **Layered runtime API availability guard**

**Relations:** none

**Explanation:**

This patch modifies two distinct sites in `NativeMenuMac.mm`, which handles macOS native menu rendering for both status bar menus and context menus.

1. **Hunk 1 — Status bar button image assignment (~line 157):**

The property access `mContainerStatusBarItem.button.image = menuImage` is wrapped in `@available(macOS 10.10, *)`. The `NSStatusBarButton` class — and its `.button` property on `NSStatusItem` — was introduced in macOS 10.10 Yosemite. Prior to 10.10, `NSStatusItem` used a different, now-deprecated mechanism for displaying images (direct `setImage:` on the item itself, not via a button subview). On 10.7–10.9, accessing `.button` returns `nil`, and the subsequent `.image` assignment becomes a no-op message to `nil` — which in Objective-C is safe but silently does nothing, meaning the status bar item would display no image.

2. **Hunk 2 — Asynchronous menu opening with appearance (~line 255–280):**

The call to `MOZMenuOpeningCoordinator.sharedInstance asynchronouslyOpenMenu:atScreenPosition:forView:withAppearance:asContextMenu:` is restructured into a conditional:

- **On macOS 10.9+ (Mavericks or later):** `NSAppearance* appearance = NativeAppearanceForContent(...)` is called and passed to the coordinator.
- **On macOS < 10.9:** The same coordinator method is called but `withAppearance:nil` is passed instead.

`NSAppearance` was introduced in macOS 10.9. On pre-Mavericks systems, calling `NativeAppearanceForContent()` would either fail to link, crash, or return a meaningless value. The patch keeps the coordinator call path unified but substitutes `nil` for the appearance parameter on systems that do not support it, letting the menu coordinator handle a null appearance gracefully.

The `NSAppearance` declaration that was previously hoisted above the coordinate calculation is moved inside the conditional branch, scoping it correctly.

---

#### 27.15-16. `widget/cocoa/OSXNotificationCenter.h/.mm`

**Summaries:**

This patch consititutes a **full structural ABI bridge** for macOS User Notifications API.
1. Header - `NSUserNotificationActivationType` typedef
2. Implementation: multi-layer `NSUserNotification` bridge
    * Compile-time enum stubs (pre10.8/10.9/10.10):
    * `FakeNSUserNotification` and `FakeNSUserNotificationCenter` protocol declarations
    * Global type substitution across the implementation
    * `NSUserNotificationAction`/`additionalActions` guarded to >= 10.10
    * `_removeDisplayedNotification` private API call added
    * `OSXNotificationActionDisable/Settings` enum and `additionalActivationAction` guard

**Taxonomy classification:**
1. **Structural ABI bridge**
2. **Runtime API availability guard**
3. **ABI substrate access**
4. **Feature excision (partial)**

**Relations:** none

**Explanation:**

- Patch 171 — Header: `NSUserNotificationActivationType` typedef

A compile-time guard adds:
```c
#if !defined(MAC_OS_X_VERSION_10_8) || (MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_8)
typedef NSInteger NSUserNotificationActivationType;
#endif
```

`NSUserNotificationActivationType` is a typed integer enum introduced in macOS 10.8. On SDKs below 10.8, the type does not exist at all; this typedef provides a compatible stand-in so that the downstream code can reference the type uniformly regardless of SDK version.

---

- Patch 172 — Implementation: multi-layer NSUserNotification bridge

The `.mm` patch has five conceptually distinct components:

**1. Compile-time enum stubs (pre-10.8 / pre-10.9 / pre-10.10):**

Three SDK-version-gated blocks define the `NSUserNotification`-related enum constants that were introduced progressively:
- Pre-10.8: the `NSUserNotificationCenterDelegate` protocol stub, `NSUserNotificationDefaultSoundName` constant, and activation type enum values 0–2
- Pre-10.9: `NSUserNotificationActivationTypeReplied` (value 3)
- Pre-10.10: `NSUserNotificationActivationTypeAdditionalActionClicked` (value 4)

These mirror the actual Apple SDK definitions, providing compile-time availability of all enum values on any SDK.

**2. `FakeNSUserNotification` and `FakeNSUserNotificationCenter` protocol declarations:**

Two `@protocol` declarations synthesize the full public API surface of `NSUserNotification` and `NSUserNotificationCenter` as Objective-C protocols — the duck-typing interface. These are unconditional: they define the expected method/property signature set that the rest of the code depends on, without requiring the actual classes to exist at compile time.

**3. Global type substitution across the implementation:**

Every concrete reference to `NSUserNotification*` and `NSUserNotificationCenter*` throughout the file is replaced with `id<FakeNSUserNotification>` and `id<FakeNSUserNotificationCenter>` respectively — in delegate method signatures, loop variables, local variable declarations, return types, and member fields. This affects at least eight call sites.

**4. `NSUserNotificationAction` / `additionalActions` guarded to ≥ 10.10:**

The entire block that builds `NSMutableArray* additionalActions` using `NSUserNotificationAction` objects is wrapped in `@available(macOS 10.10, *)`. `NSUserNotificationAction` was introduced in 10.10. On pre-10.10 systems, action buttons are instead handled via a **private API path** using KVC `setValue:forKey:` on undocumented properties: `_showsButtons`, `_alwaysShowAlternateActionMenu`, and `_alternateActionButtonTitles`. These are accessed via `respondsToSelector:` checks before use, making this a defensive runtime probe of private API availability rather than a declared dependency.

**5. `_removeDisplayedNotification:` private API call added:**

In the notification removal path, `[GetNotificationCenter() _removeDisplayedNotification:notification]` is added alongside the existing `removeDeliveredNotification:`. This is a private `NSUserNotificationCenter` method (prefixed `_`) needed to dismiss notifications that are currently *displayed* (visible on screen) as opposed to merely delivered to the notification queue.

**6. `OSXNotificationActionDisable/Settings` enum and `additionalActivationAction` guard:**

A new `OSXNotificationAction` enum is added for internal action disambiguation, and the `NSUserNotificationActivationTypeAdditionalActionClicked` handler block is wrapped in `@available(macOS 10.10, *)` since additional actions do not exist below 10.10. The `kActionSuffix` trimming is removed from the action name handling path.

---

#### 27.17. `widget/cocoa/ScreenHelperCocoa.mm`

**Summaries:**

This patch modifies the HDR display detection logic in `ScreenHelperCocoa.mm` which queries screen capabilities to determine whether a display should be classified as HDR for CSS `dynamic-range` media query.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Deprecation reversal** (partial)

**Relations:** none

**Explanation:**

This patch modifies the HDR display detection logic in `ScreenHelperCocoa.mm`, which queries screen capabilities to determine whether a display should be classified as HDR for the CSS `dynamic-range` media query.

Two changes are made, both targeting the same logical block:

1. **Hunk 1 — `maximumPotentialExtendedDynamicRangeColorComponentValue` API guard:**

The property access `aScreen.maximumPotentialExtendedDynamicRangeColorComponentValue` — which queries an `NSScreen` for its maximum EDR (Extended Dynamic Range) component value — is wrapped in `@available(macOS 10.15, *)` with a fallback initialisation of `componentValueMax = 0.0f`. This property was introduced in macOS 10.15 Catalina. On earlier systems, accessing it would produce a compile-time or runtime error; with the guard, pre-10.15 systems receive a hardcoded `0.0f`, which causes `componentValueMax > 1.0` to evaluate `false` — correctly classifying all pre-10.15 displays as non-HDR.

2. **Hunk 2 — Platform HDR capability floor lowered from Big Sur to Catalina:**

The double-check condition is changed from:
```cpp
isHDR &= nsCocoaFeatures::OnBigSurOrLater();  // ≥ 10.16 / 11.0
```
to:
```cpp
isHDR &= nsCocoaFeatures::OnCatalinaOrLater();  // ≥ 10.15
```

This lowers the platform HDR capability floor by one OS generation. The original upstream code conservatively required Big Sur (macOS 11.0) before enabling HDR classification, despite `maximumPotentialExtendedDynamicRangeColorComponentValue` being available from 10.15. The patch aligns the capability floor with the actual API introduction point.

The two changes are logically coupled: the `@available(10.15)` guard makes the property access safe on 10.14 and below, while the `OnCatalinaOrLater()` change ensures HDR is actually enabled on 10.15+ where the property now safely returns a real value.

---

#### 27.18-19. `widget/cocoa/TextInputHandler.h/.mm`

**Summaries:**

This paired patch is a combination of a class hierachy refractor with several independent API availability guards and one behavioural fix:
1. `nsCocoaWindow` -> `nsChildView` global type substitution
2. `kVK_RightCommand` compile time guard
3. Two `context:` restoration sites
4. `mBlockDismissTextSubstitutionPanel` removal
5. `alternativeStrings` guarded to >= 10.8
6. Korean IME Catalina hack scoped to Catalina+

**Taxonomy classification:**
1. **Build graph surgery**
2. **Runtime API availability guard**
3. **Deprecation reversal**
4. **Feature excision**
5. **Syntax backport**

**Relations:** none

**Explanation:**

1. Component 1 — `nsCocoaWindow` → `nsChildView` global type substitution

The most pervasive change across both files: every reference to `nsCocoaWindow*` as the widget owner type in `TextInputHandlerBase`, `IMEInputHandler`, and `TextInputHandler` — constructor parameters, the `mWidget` member field, `OnDestroyWidget()` virtual method signatures, `RefPtr<>` local variables, and documentation comments — is replaced with `nsChildView*`.

This is a **widget ownership model correction**. `TextInputHandler` manages keyboard and IME input for a specific native view, which is an `nsChildView` (the concrete `NSView`-backed widget class). `nsCocoaWindow` is the top-level window class; text input handling is anchored to the child view, not the window. The upstream code used `nsCocoaWindow` here, which was either a historical inconsistency or reflects a prior refactor that was not fully propagated. The include change in `.mm` (replacing `nsCocoaWindow.h` with `nsChildView.h`) confirms the intent: the dependency on the window class is severed entirely.

This affects seven `RefPtr<>` variable declarations, three constructor definitions, two `OnDestroyWidget()` override implementations, one member field, and the forward declaration in the header.

1. Component 2 — `kVK_RightCommand` compile-time guard

In the key code enum:
```cpp
#if !defined(MAC_OS_X_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_12
  kVK_RightCommand = 0x36,
#endif
```
`kVK_RightCommand` was added to the Carbon `HIToolbox/Events.h` header in the macOS 10.12 SDK. On older SDKs the constant is absent and must be defined manually. The guard provides the value `0x36` — the documented virtual key code for the right Command key — on pre-10.12 SDK builds.

1. Component 3 — Two `context:` restoration sites

Two additional `NSEvent` construction sites restore the pre-deprecation `context:` parameter, directly parallel to patch 169:
- `context:[aNativeEvent context]` in the key event synthesis path (~line 2320)
- `context:[mKeyEvent context]` in the key event replay path (~line 5702)
- A third site uses `context:[NSGraphicsContext currentContext]` (~line 5425) — where no source event exists, the current graphics context is used as the best available approximation

The third variant is notable: it is not a straight propagation from a source event but an active query of the current rendering context, indicating ℋ-layer knowledge that `currentContext` is the appropriate fallback at that particular call site.

1. Component 4 — `mBlockDismissTextSubstitutionPanel` removal

The member variable `mBlockDismissTextSubstitutionPanel` and its associated `AutoRestore<bool>` guard blocks are removed from two keypress dispatch sites and from `DismissTextSubstitutionPanel()`. The guard was introduced upstream to prevent text substitution panel dismissal during synchronous `OnTextChange` dispatch in chrome-process content. Its removal unconditionally dismisses the substitution panel on text change, reverting to simpler pre-guard semantics. A `MOZ_LOG` statement inside `DismissTextSubstitutionPanel()` is also removed.

1. Component 5 — `alternativeStrings` guarded to ≥ 10.8

Two sites accessing `candidate.alternativeStrings` / `mCandidatedTextSubstitutionResult.alternativeStrings` are wrapped in `@available(macOS 10.8, *)` with `@[]` (empty array) as the fallback. `NSTextCheckingResult.alternativeStrings` was introduced in macOS 10.8; the guard prevents a crash or undefined access on 10.7 while preserving the overall text substitution flow with a degenerate (no-alternatives) result.

1. Component 6 — Korean IME Catalina hack scoped to Catalina+

The existing comment-documented hack for Korean IME composition state on macOS 10.15 is wrapped in `nsCocoaFeatures::OnCatalinaOrLater()`:
```cpp
if (nsCocoaFeatures::OnCatalinaOrLater() && !IsIMEComposing()) {
```
This prevents the workaround from activating on pre-10.15 systems where the Korean IME bug does not exist, avoiding any potential side effects of the hack on legacy targets.

---

#### 27.20. `widget/cocoa/TextRecognition.mm`

**Summaries:**

This patch wraps the entirety of `TextRecognition::DoFindText()` - inside an `@available(macOS 10.15, *)` guard, with a clean rejection path on the `else` branch.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

This patch wraps the entirety of `TextRecognition::DoFindText()` — the function that performs on-device OCR via Apple's Vision framework — inside an `@available(macOS 10.15, *)` guard, with a clean rejection path on the `else` branch.

**Pre-patch:** The function body executes unconditionally, creating a `CGImage` from the provided surface, dispatching a background task that constructs a `VNRecognizeTextRequest`, submits it to a `VNImageRequestHandler`, and resolves or rejects the returned `NativePromise` based on the Vision framework's response.

**Post-patch:** The identical logic is preserved verbatim inside `if (@available(macOS 10.15, *)) { ... }`. The `else` branch returns:
```cpp
NativePromise::CreateAndReject("Text recognition is not available"_ns, __func__);
```

The functional change is exclusively the addition of the availability guard and rejection fallback. The internal logic — `VNRecognizeTextRequest`, `VNImageRequestHandler`, observation enumeration, quad extraction, promise resolution — is unchanged. Even minor formatting differences (comment line-wrapping, block indentation) are simply reformatting artifacts of reindenting the entire body one level deeper.

The Vision framework classes used here — `VNRecognizeTextRequest`, `VNRecognizedTextObservation`, `VNRecognizedText`, `VNImageRequestHandler` — were all introduced in macOS 10.15 Catalina. On any earlier system, these class names do not exist; `NSClassFromString` would return `nil` and direct static references would fail to link or crash at runtime.

---

#### 27.21-22. `widget/cocoa/VibrancyManager.h/.mm`

**Summaries:**

This pair constitutes multiple component modifications:
1. `nsCocoaWindow` -> `nsChildView` substitution
2. Preference observation system removed
3. `MOZVibrantLeafView` split from `MOZVibrantView`
4. `CreateEffectView` static factory method added
5. `SystemSupportsVibrancy` static capability gate
6. `NSVisualEffectView` SDK category stub
7. `SDKDeclarations.h` added
8. `GetUnionOfVibrantRegions` added

**Taxonomy classification:**
1. **Structural ABI bridge**
2. **Feature excision**
3. **UI rendering restoration**
4. **Runtime API availability guard**
5. **Syntax backport**

**Relations:** none

**Explanation:**

1. Component 1 — `nsCocoaWindow` → `nsChildView` substitution

Identical in character to patch 174–175: the coordinate converter parameter and `mCoordinateConverter` member are retyped from `const nsCocoaWindow&` to `const nsChildView&`, with the corresponding include and forward declaration updated. `VibrancyManager` uses the converter for coordinate system translation between device pixels and Cocoa `NSRect` space; this operation is correctly performed against the child view, not the window.

1. Component 2 — Preference observation system removed

The entire `PrefChanged` infrastructure is excised:
- `PrefChanged()` static C callback and its `kObservedPrefs` constant array (observing `widget.macos.sidebar-blend-mode.behind-window` and `widget.macos.titlebar-blend-mode.behind-window`)
- `Preferences::RegisterCallback()` calls in the constructor
- `Preferences::UnregisterCallback()` calls in the destructor
- The `PrefChanged()` method on both `VibrancyManager` and `MOZVibrantView`
- The `- (void)prefChanged` Objective-C method on `MOZVibrantView`

The destructor is simplified to `= default`. The `PrefChanged()` public method declaration in the header is replaced by the new `GetUnionOfVibrantRegions()` method.

This removes the ability to dynamically update vibrancy blending mode in response to user preference changes at runtime. The blending mode is now fixed at view creation time.

1. Component 3 — `MOZVibrantLeafView` split from `MOZVibrantView`

`MOZVibrantView` previously contained both the initialization logic and two behavioural methods: `hitTest:` (returning `nil` to be mouse-transparent) and `prefChanged`. The patch **splits the class into two**:

- `MOZVibrantView` — retains initialization (`initWithFrame:vibrancyType:`) only; gains proper `@end` termination
- `MOZVibrantLeafView : MOZVibrantView` — a new subclass inheriting the initializer, containing `hitTest:` (returning `nil`) and a new `- (BOOL)allowsVibrancy` method returning `NO`

The `allowsVibrancy` override is significant: when `NSVisualEffectView` is used as a container for other views, `allowsVibrancy = YES` causes child views to adopt the vibrancy material as well. By returning `NO` on leaf views — views with no subviews — the patch prevents unintended vibrancy bleed-through to content. The comment explicitly states this is safe specifically because leaf views have no subviews.

1. Component 4 — `CreateEffectView` static factory method added

A new public static method `CreateEffectView(VibrancyType, BOOL aIsContainer)` dispatches between the two view classes:
```cpp
return aIsContainer
    ? [[MOZVibrantView alloc] initWithFrame:NSZeroRect vibrancyType:aType]
    : [[MOZVibrantLeafView alloc] initWithFrame:NSZeroRect vibrancyType:aType];
```
This is the public API for view creation, replacing the internal `UpdateVibrantRegion` path as the entry point for external callers. The docstring in the header explicitly notes: *"We return an object of type NSView* because we compile with an SDK that does not contain a definition for NSVisualEffectView"* — a direct acknowledgement of the SDK availability constraint.

1. Component 5 — `SystemSupportsVibrancy()` static capability gate

A new static method with lazy singleton initialisation:
```cpp
static bool ComputeSystemSupportsVibrancy() {
#ifdef __x86_64__
  return NSClassFromString(@"NSAppearance") && NSClassFromString(@"NSVisualEffectView");
#else
  return false;
#endif
}
```

Two checks are combined:
- **Architecture check (`__x86_64__`):** Vibrancy is disabled entirely on 32-bit builds. The comment cites `objc_allocateClassPair` not working in 32-bit mode — this is a runtime Objective-C class registration mechanism used internally by the vibrancy implementation.
- **Runtime class existence check:** Both `NSAppearance` (10.9+) and `NSVisualEffectView` (10.10+) are probed via `NSClassFromString`. Since `NSVisualEffectView` requires 10.10, the effective floor is 10.10 — but the double check guards against intermediate states where one class exists without the other.

The result is cached as a `static bool`, computed once on first call.

1. Component 6 — `NSVisualEffectView` SDK category stub (pre-10.12)

```objc
#if !defined(MAC_OS_X_VERSION_10_12) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_12
@interface NSVisualEffectView (NSVisualEffectViewMethods)
- (void)setEmphasized:(BOOL)emphasized;
@end
#endif
```

The `setEmphasized:` method (and the `emphasized` property) was added to `NSVisualEffectView` in macOS 10.12. On pre-10.12 SDKs, the selector is unknown at compile time. The category declaration exposes the selector to the compiler, enabling `self.emphasized = NO` in the initializer to compile cleanly. At runtime on 10.10–10.11, the method call simply does nothing (Objective-C nil/unknown message semantics on the view object).

1. Component 7 — `SDKDeclarations.h` include added

The `SDKDeclarations.h` header is added to the includes. This is Momiji's (or the codebase's) centralised header for forward declarations and stubs of API types not present in older SDKs — consistent with the pattern seen in patch 166's `MacThemeGeometryType` enum additions.

1. Component 8 — `GetUnionOfVibrantRegions()` added

A new public method replaces `PrefChanged()` in the header's public interface. Its implementation is not visible in this patch (likely in a companion patch or already present), but its declaration establishes a new API for querying the geometric union of all active vibrant regions — useful for compositor hit-testing and region invalidation.

---

#### 27.23-24. `widget/cocoa/ViewRegion.h/.mm`

**Summaries:**

Both files contain exactly 1 semantic change each, identical in kind: every reference to `nsCocoaWindow` in `ViewRegion.h` and `ViewRegion.mm` is replaced with `nsChildView`.

**Taxonomy classification:**
1. **Build graph surgery**

**Relations:** none

**Explanation:**

This is the most structurally minimal patch pair in the entire `widget/cocoa` cluster. Both files contain exactly one semantic change each, identical in kind:

Every reference to `nsCocoaWindow` in `ViewRegion.h` and `ViewRegion.mm` is replaced with `nsChildView`:
- Forward declaration in the header (`class nsCocoaWindow` → `class nsChildView`)
- `aCoordinateConverter` parameter type in the `UpdateRegion()` declaration (header)
- `aCoordinateConverter` parameter type in the `UpdateRegion()` definition (`.mm`)
- `nsCocoaWindow.h` include replaced with `nsChildView.h` (`.mm`)
- Documentation comment updated to match

`ViewRegion` is the utility class that manages the set of `NSView` subviews covering a geometric region — it is used by `VibrancyManager` (patches 177–178) to maintain the pool of `NSVisualEffectView` instances that cover vibrant areas. `UpdateRegion()` needs a coordinate converter to translate `LayoutDeviceIntRect` device pixel coordinates into Cocoa `NSRect` coordinates; this operation belongs to the child view that owns the pixel coordinate space, not the window.

The implementation logic of `UpdateRegion()` itself is unchanged — no API guards, no new methods, no preference system changes.

---

#### 27.25. `widget/cocoa/nsAppShell.mm`

**Summaries:**

This patch makes five distinct interventions in the application shell initialization and event loop infrastructure, each addressing a different legacy compatibility boundary. Together they span compile-time type guarding, NIB loading strategy differentiation, OS API availability gating, and a class-level API migration.

**Taxonomy classification:**
1. **Build graph surgery**
2. **Structural ABI bridge**
3. **Runtime API availability guard** with process-type differentiation

**Relations:** none

**Explanation:**

1. Change 1 — Include substitution: `nsCocoaWindow.h` → `nsChildView.h`

**Technical explanation:** The `#include "nsCocoaWindow.h"` header is replaced with `#include "nsChildView.h"`. This is preparatory for Change 5 below — `nsAppShell.mm` was pulling in `nsCocoaWindow` solely to call `UpdateCurrentInputEventCount()`, which has been moved (or accessed) via `nsChildView` instead. The include is updated to match.

---

1. Change 2 — `nextEventMatchingMask:` signature type guard (compile-time)

**Technical explanation:**

```objc
#if defined(MAC_OS_X_VERSION_10_12) && MAC_OS_X_VERSION_MAX_ALLOWED >= MAC_OS_X_VERSION_10_12 && \
    __LP64__
- (NSEvent*)nextEventMatchingMask:(NSEventMask)mask
#else
- (NSEvent*)nextEventMatchingMask:(NSUInteger)mask
#endif
```

In macOS 10.12, Apple redefined the `mask` parameter type for `nextEventMatchingMask:` from `NSUInteger` to `NSEventMask` (a typed `unsigned long long`) — but **only for 64-bit builds** (`__LP64__`). On 32-bit or pre-10.12 SDKs, the parameter is still `NSUInteger`. Without this guard, building against an older SDK (10.7–10.11) with a compiler that sees the new signature would produce a type mismatch warning or error in the method override.

This is a three-way condition: SDK version check + `MAC_OS_X_VERSION_MAX_ALLOWED` cap + architecture width.

---

1. Change 3 — NIB loading: three-path strategy for `loadNibNamed:` (runtime)

**Technical explanation:** The original code calls `[[NSBundle mainBundle] loadNibNamed:owner:topLevelObjects:]` unconditionally — an API that was introduced in **macOS 10.8**. On 10.7, this method does not exist.

The patch replaces the single call with a three-branch structure:

* **`@available(macOS 10.8, *)`** — original `loadNibNamed:owner:topLevelObjects:` path. Identical to upstream behavior on 10.8+.

* **10.7, non-Utility process** — uses `NS_GetSpecialDirectory(NS_GRE_DIR)` to construct an explicit filesystem path to `MainMenu.nib`, then calls the older `[NSBundle loadNibFile:externalNameTable:withZone:]` API. The comment notes that the audio decoding (Utility) process behaves abnormally with the `mainBundle` approach on 10.7, necessitating the split.

* **10.7, Utility process** — calls `[NSBundle loadNibFile:[[NSBundle mainBundle] pathForResource:@"res/MainMenu" ofType:@"nib"] externalNameTable:withZone:]`, using `mainBundle` path resolution but the older load API. The comment credits the uTox project for the pattern.

---

1. Change 4 — `InitMemoryPressureObserver()` gated behind `__builtin_available(macOS 10.9, *)`

**Technical explanation:** `InitMemoryPressureObserver()` relies on the `NSMemoryPressureHandler` API or the underlying `dispatch_source_t` memory pressure source — infrastructure introduced in **macOS 10.9** (Mavericks). On 10.7 and 10.8, calling it would reference a non-existent symbol or trigger undefined behavior. The guard wraps the call with `__builtin_available(macOS 10.9, *)`, which at runtime queries the OS version and skips the call on earlier systems.

---

1. Change 5 — Sandbox violation sink guarded behind `OnMavericksOrLater()`

**Technical explanation:** `nsSandboxViolationSink::Start()` and `::Stop()` are conditionally called in `#if !defined(RELEASE_OR_BETA) || defined(DEBUG)` blocks. The sandbox violation tracking mechanism depends on APIs (`sandbox_set_report_handler` or equivalent) that were introduced or meaningfully changed in macOS 10.9. The patch adds `nsCocoaFeatures::OnMavericksOrLater()` as a runtime version check before both `Start()` and `Stop()` calls, preventing them from being invoked on 10.7–10.8 where the sandbox reporting infrastructure doesn't exist.

---

1. Change 6 — `nsCocoaWindow::UpdateCurrentInputEventCount()` → `nsChildView::UpdateCurrentInputEventCount()`

**Technical explanation:** The call site at the event pump's `moreEvents` branch is updated to call the same method via `nsChildView` rather than `nsCocoaWindow`. This matches the include substitution in Change 1.

---

#### 27.26-27. `widget/cocoa/nsChildView.h (patched)/.mm (added)`

**Summaries:**

Core patch which restore the deprecated `nsChildView` module functionality:
1. Restore legacy rendering infrastructure which upstream Firefox removed 
2. Migraring `ChildView` Obj-C class's back-pointer type from `nsCocoaWindow*` to `nsChildView*`

**Taxonomy classification:**
1. **Build graph surgery**
2. **ABI subtrate access**
3. **Deprecation reversal**
4. **UI rendering restoration**
5. **Runtime API availability guard**
6. **Feature restoration** at build graph level

**Relations:** none

**Explanation:**

This patch is not primarily a compatibility fix — it is a **structural refactoring** of the header file, with two distinct purposes running in parallel: (1) restoring legacy rendering infrastructure that upstream Firefox removed when it dropped pre-Mavericks support, and (2) migrating the `ChildView` Objective-C class's back-pointer type from `nsCocoaWindow*` to `nsChildView*`. The entire `nsChildView` C++ class definition — hundreds of lines — is appended to the header, which in upstream Firefox lives elsewhere or was restructured. Reading the `.mm` file reveals that all of these declarations have live, active implementations.

---

1. Change 1 — New `#include "nsBaseWidget.h"` and `IAPZCTreeManager` forward declaration

**Technical explanation:** `nsChildView` inherits from `nsBaseWidget`. For the class definition added at the bottom of the header to compile, the base class must be complete (not merely forward-declared) at the point of the class definition. Adding `#include "nsBaseWidget.h"` satisfies this. Similarly, `IAPZCTreeManager` is forward-declared in the `mozilla::layers` namespace because `nsChildView` uses it as a `typedef` member alias and as a parameter/return type in its APZ dispatch methods. The `.mm` confirms the include: `#include "mozilla/layers/IAPZCTreeManager.h"` is present at line 74.

---

1. Change 2 — `_drawTitleBar:` declaration in the `NSView (Undocumented)` category

**Technical explanation:** This adds to the existing undocumented Cocoa API block:

```objc
- (void)_drawTitleBar:(NSRect)aRect;
```

The accompanying comment is explicit: this is an **undocumented private method** of `NSThemeFrame` (the private subclass of `NSFrameView` that draws the window chrome), present since at least OS X 10.6. Its purpose is to draw the window title string into a given rect. The comment acknowledges the method has evolved since 10.6 but has remained safe to call outside of `drawRect:` and safe to redirect into a `CGContextRef` — and explicitly states this should be verified in each new major OS X version (referencing bug 877767).

The `.mm` confirms active use at line 2574–2588: `drawTitleString` checks `respondsToSelector:@selector(_drawTitleBar:)` defensively before calling it, and only calls it when `!OnMavericksOrLater()`. The full context:

```objc
- (void)drawTitleString {
  MOZ_RELEASE_ASSERT(!nsCocoaFeatures::OnMavericksOrLater());
  ...
  if (![frameView respondsToSelector:@selector(_drawTitleBar:)]) { return; }
  [frameView _drawTitleBar:[frameView bounds]];
}
```

So the declaration is needed to suppress compiler warnings about calling an unknown selector on `NSView` instances — it formally declares a method the compiler would otherwise not know about.

---

1. Change 3 — `mGeckoChild` type change: `nsCocoaWindow*` → `nsChildView*`

**Technical explanation:** Inside the `@interface ChildView` (the Objective-C class), the back-pointer `mGeckoChild` is retyped:

```objc
// Before:
nsCocoaWindow* mGeckoChild;
// After:
nsChildView* mGeckoChild;
```

The comment is also updated from "the nsCocoaWindow that created the view" to "the nsChildView that created the view." The `.mm` confirms this is pervasive — `mGeckoChild` is referenced at dozens of call sites (lines 2154, 2215, 2274, 2277, 2287, 2335, 2339, 2358, 2369, etc.) and is initialized in `initWithFrame:geckoChild:` (line 2154) with type `nsChildView*` as the parameter.

This reflects the architectural relationship: in Firefox's widget layer, `ChildView` (the NSView subclass) is the native Cocoa view, and `nsChildView` is its C++ Gecko-side twin. The view's back-pointer to Gecko should be `nsChildView*`, not `nsCocoaWindow*`. Upstream Firefox at some point had this correct; this patch either restores correct typing or corrects a drift introduced elsewhere in the Momiji patch set.

---

1. Change 4 — `mTopLeftCornerMask` field added to `ChildView` ivar block

**Technical explanation:**

```objc
CGImageRef mTopLeftCornerMask;
// Always null if nsCocoaFeatures::OnMavericksOrLater() is true.
```

This is a cached `CGImageRef` used to mask the top corners of the window during pre-Mavericks CGContext-based (software) rendering. The `.mm` shows the full usage at lines 2527–2560: `maskTopCornersInContext:` creates and caches this image lazily (invalidated when corner radius changes), then uses `kCGBlendModeDestinationIn` to alpha-erase the top-left and top-right corners of the drawn content, simulating the rounded window corners that macOS hardware-composites on 10.9+.

The comment "Always null if `nsCocoaFeatures::OnMavericksOrLater()` is true" documents the two-path rendering architecture directly in the ivar declaration — pre-Mavericks uses CGContext software compositing with manual corner masking; Mavericks+ delegates corner rounding to the compositor. The `MOZ_RELEASE_ASSERT(!OnMavericksOrLater())` at the call site (line 2527) enforces this at runtime.

---

1. Change 5 — `- (BOOL)isCoveringTitlebar` method declaration

**Technical explanation:** The method is declared in the `ChildView` interface and implemented in `.mm` at line 2351:

```objc
- (BOOL)isCoveringTitlebar {
  return [[self window] isKindOfClass:[BaseWindow class]] &&
         [(BaseWindow*)[self window] mainChildView] == self &&
         [(BaseWindow*)[self window] drawsContentsIntoWindowFrame];
}
```

This returns `YES` when the view is the main child of a `BaseWindow` that has been configured to draw content extending into the titlebar area (Firefox's "content in titlebar" feature). The method is used at three places in `.mm` (lines 2432, 2472, 2507) to gate the pre-Mavericks software titlebar-drawing path — when the content covers the titlebar, additional steps like `drawTitleString` and `maskTopCornersInContext:` must be executed.

---

1. Change 6 — `- (void)setUsingOMTCompositor:(BOOL)aUseOMTC` declaration

**Technical explanation:** Declared on `ChildView`, implemented in `.mm` at line 3065. Called from `nsChildView::CreateCompositor()` (line 1671) with `aUseOMTC = true` after the compositor is created. Sets `mUsingOMTCompositor`, which controls whether the view uses off-main-thread compositing (OMTC). This method bridges the C++ compositor creation path into the Objective-C view state.

---

1. Change 7 — The full `nsChildView` C++ class definition appended to the header

**Technical explanation:** The largest change by line count: the entire `nsChildView` C++ class is added as a definition at the bottom of the header (previously the header apparently contained only the Obj-C `ChildView` interface, with `nsChildView` defined elsewhere or in a form that didn't compile with the current Momiji codebase). The class definition includes:

- Full `nsIWidget` interface implementation (`Create`, `Destroy`, `Show`, `Move`, `Resize`, `SetFocus`, coordinate conversion, event dispatch, input synthesis…)
- HiDPI/backing-scale infrastructure (`BackingScaleFactor`, `BackingScaleFactorChanged`, `GetDesktopToDeviceScale`)
- APZ dispatch methods (`DispatchAPZWheelInputEvent`, `DispatchAPZInputEvent`, `DispatchDoubleTapGesture`)
- CATransaction suspension protocol (`SuspendAsyncCATransactions`, `UnsuspendAsyncCATransactions`)
- The static `UpdateCurrentInputEventCount()` — which explains the include redirect from patch 181: `nsAppShell` calls this method, and now it needs `nsChildView.h` rather than `nsCocoaWindow.h`
- Protected members including `mBackingSurface` (the pre-Mavericks software compositing draw target, annotated "Always null if `OnMavericksOrLater()` is true"), `mTopLeftCornerMask` indirectly (declared on the Obj-C side), `mCompositingLock`

---

#### 27.28. `widget/cocoa/nsClipboard.mm`

**Summaries:**

Single branch split in the pasteboard name lookup for the Find clipboard:
```objc
// Before:
return [NSPasteboard pasteboardWithName:NSPasteboardNameFind];

// After:
if (@available(macOS 10.13, *)) {
    return [NSPasteboard pasteboardWithName:NSPasteboardNameFind];
}
return [NSPasteboard pasteboardWithName:NSFindPboard];
```

**Taxonomy classification:**
1. **Runtime API availability guard**

**Relations:** none

**Explanation:**

The change is a single branch split in the pasteboard name lookup for the Find clipboard:

```objc
// Before:
return [NSPasteboard pasteboardWithName:NSPasteboardNameFind];

// After:
if (@available(macOS 10.13, *)) {
    return [NSPasteboard pasteboardWithName:NSPasteboardNameFind];
}
return [NSPasteboard pasteboardWithName:NSFindPboard];
```

`NSPasteboardNameFind` is an `NSString *const` introduced as a typed constant in macOS **10.13 (High Sierra)**. It is the modern, SDK-typed symbolic name for the Find pasteboard. Prior to 10.13, the same pasteboard was accessed via `NSFindPboard`, a raw `NSString *` constant that has been present since the early days of Cocoa (macOS 10.0). Both names resolve to the same underlying pasteboard identifier string (`"Apple CFPasteboard find"`), but `NSPasteboardNameFind` as a *symbol* does not exist in the 10.12 and earlier SDKs — the linker or runtime will fail to resolve it on older systems if called unconditionally.

The `@available(macOS 10.13, *)` guard is a `__builtin_available` runtime check that falls through to the legacy `NSFindPboard` constant on 10.7–10.12.

---

#### 27.29-30. `widget/cocoa/nsCocoaFeatures.h/.mm`

**Summaries:**

This patch modifies Firefox's version detection infrastructure patch:
1. New `MACOS_VERSION_*_HEX` constants
2. Version floor lowered from 10.9 to 10.6
3. 10 new named version predicate methods
4. C-linkage bridge: `Gecko_OnSierraExactly()` and `Gecko_OnSierraOrLater()`

**Taxonomy classification:**
1. **Metadata override**
2. **Feature gating**
3. **Structural ABI bridge**

**Relations:** none

**Explanation:**

1. Change 1 — New `MACOS_VERSION_*_HEX` constants: 10.5 through 10.8

**Technical explanation:**

```c
#define MACOS_VERSION_10_5_HEX  0x000A0500
#define MACOS_VERSION_10_6_HEX  0x000A0600
#define MACOS_VERSION_10_7_HEX  0x000A0700
#define MACOS_VERSION_10_8_HEX  0x000A0800
```

Upstream Firefox already had `MACOS_VERSION_10_9_HEX` through `MACOS_VERSION_10_15_HEX` (and the 11.x+ constants). These four new constants extend the hex encoding scheme downward to cover Snow Leopard (10.6), Lion (10.7), and Mountain Lion (10.8) — the versions below Mavericks that Momiji targets. The encoding scheme is a packed hex representation: `0x000A` is major version 10 (`0x0A`), and the third byte is the minor version. So `0x000A0700` = 10.7.0, `0x000A0800` = 10.8.0, etc.

---

1. Change 2 — Version floor lowered from 10.9 to 10.6

**Technical explanation:**

```c
// Before:
NS_ERROR("Couldn't determine macOS version, assuming 10.9");
macOSVersion = MACOS_VERSION_10_9_HEX;
// ... else if (aMajor == 10 && aMinor < 9) ...
NS_ERROR("macOS version too old, assuming 10.9");
macOSVersion = MACOS_VERSION_10_9_HEX;

// After:
NS_ERROR("Couldn't determine macOS version, assuming 10.6");
macOSVersion = MACOS_VERSION_10_6_HEX;
// ... else if (aMajor == 10 && aMinor < 6) ...
NS_ERROR("macOS version too old, assuming 10.6");
macOSVersion = MACOS_VERSION_10_6_HEX;
```

Upstream Firefox's `nsCocoaFeatures` had a hard floor of 10.9: any system reporting a version below 10.9 would be clamped up to 10.9 and an error logged. This is the upstream version floor encoded as a runtime invariant — upstream simply refused to represent versions below their minimum support boundary.

Momiji lowers this floor to 10.6. The choice of 10.6 rather than 10.7 (Momiji's stated minimum) is deliberate: it provides a one-minor-version buffer below the operational floor, ensuring that version detection never clamps a legitimate 10.7 system to a false higher value due to parsing edge cases, while still rejecting anything genuinely prehistoric (pre-Snow Leopard).

This is the **most structurally significant change in the patch**. Without it, every `OnLionOrLater()`, `OnMavericksOrLater()` etc. call would return `true` on 10.7–10.8 — because those systems would be clamped to 10.9, making all `>= 10.9` checks pass. The entire pre-Mavericks rendering path in patches 181, 182, and all subsequent patches would silently malfunction: the OS version guards would return wrong results, and the wrong code paths would execute. This single change is the precondition for correctness of every runtime version branch in the cluster.

---

1. Change 3 — Ten new named version predicate methods

**Technical explanation:** Ten static methods are added to `nsCocoaFeatures`, covering Lion through Catalina:

```
OnLionOrLater()       ≥ 10.7
OnMountainLionOrLater() ≥ 10.8
OnMavericksOrLater()  ≥ 10.9
OnYosemiteOrLater()   ≥ 10.10
OnElCapitanOrLater()  ≥ 10.11
OnSierraExactly()     ≥ 10.12 && < 10.13
OnSierraOrLater()     ≥ 10.12
OnHighSierraOrLater() ≥ 10.13
OnMojaveOrLater()     ≥ 10.14
OnCatalinaOrLater()   ≥ 10.15
```

Upstream Firefox already had `OnBigSurOrLater()`, `OnMontereyOrLater()`, `OnVenturaOrLater()`. This patch backfills the entire version ladder from 10.7 to 10.15, completing the predicate vocabulary that the rest of the cluster references.

`OnSierraExactly()` is notable: it is a **range predicate** (`>= 10.12 && < 10.13`) rather than a floor predicate. This means there is a known behavior specific to Sierra that does not persist into High Sierra — a narrower 𝒮-layer boundary requiring point-version precision rather than a floor check. This is consistent with CoreText's known behavioral changes between Sierra and High Sierra (font handling, glyph pipeline).

---

1. Change 4 — C-linkage bridge: `Gecko_OnSierraExactly()` and `Gecko_OnSierraOrLater()`

**Technical explanation:**

```cpp
extern "C" {
    bool Gecko_OnSierraExactly();
    bool Gecko_OnSierraOrLater();
}

// Implementations:
bool Gecko_OnSierraExactly() { return nsCocoaFeatures::OnSierraExactly(); }
bool Gecko_OnSierraOrLater()  { return nsCocoaFeatures::OnSierraOrLater(); }
```

The comment is explicit: these are "C-callable helpers for `cairo-quartz-font.c` and `SkFontHost_mac.cpp`." Both of those files are C or C++ files that cannot use Objective-C or C++ class methods directly due to either language (pure C for cairo) or compilation unit constraints. The `extern "C"` linkage declaration with `Gecko_` prefix makes these functions callable across the C/C++/ObjC language boundary with a stable, unmangled symbol name.

This is a **cross-language ABI bridge** specifically for the font rendering subsystems. The Sierra-specific predicates are needed precisely because:
- Cairo's Quartz font backend (`cairo-quartz-font.c`) has Sierra-specific code paths for CoreText font handling
- Skia's Mac font host (`SkFontHost_mac.cpp`) similarly has Sierra-conditional behavior

Both of these subsystems were patched in earlier Momiji work (`gfx/skia` subtree). This patch provides the runtime detection infrastructure those patches depend on.

---

#### 27.31-32. `widget/cocoa/nsCocoaUtils.h/.mm`

**Summaries:**

This patch is technically dense, with 6 distinct changes accross 2 files, spanning:
* `NSEventPhaseMayBegin` enum backfill (header)
* `_removeWindowFromCache:` private API declaration (header)
* `CGContext` accessor: `.CGContext` -> `graphicsPort` cast (source)
* `backingScaleFactor` guarded by `respondsToSelector` (source)
* `ActionOnDoubleClickSystemPref` gated and pre-10.11 path added (source)
* AV permission and screen capture APIs gated to 10.14/10.15 [*SCREEN CAPTURE PERMISSON GATING*]

**Taxonomy classification:**
1. **Syntax backport**
2. **ABI substrate access**
3. **Deprecation reversal**
4. **Runtime API availability guard**
5. **Structural ABI bridge**

**Relations:** none

**Explanation:**

1. Change 1 — `NSEventPhaseMayBegin` enum backfill (header)

**Technical explanation:**

```objc
#if !defined(MAC_OS_X_VERSION_10_8) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_8
enum { NSEventPhaseMayBegin = 0x1 << 5 };
#endif
```

`NSEventPhaseMayBegin` is a member of the `NSEventPhase` bitmask enum introduced in macOS **10.8**. When compiling against a pre-10.8 SDK, the constant is absent from the system headers entirely. The patch injects it as a plain `enum` literal (value `0x20`, matching Apple's definition) under the SDK version guard. The `!defined(MAC_OS_X_VERSION_10_8)` arm handles SDKs so old they don't even define the version constant itself; the `MAX_ALLOWED < 10_8` arm handles SDKs that define the constant but target earlier deployments.

**Taxonomy:** *Syntax backport* — injecting a missing enum constant from a newer SDK into an older compilation environment using a value-preserving literal definition.

**Framework implication:** The value `0x1 << 5` is a claim about Apple's ABI — the numeric value of a bitmask field in an OS-defined enum. If Apple had ever changed this value between SDK versions, the backport would be silently wrong. This is an instance of the implicit dependency on ABI stability of enum values — normally stable, but unverifiable without access to the SDK binary.

---

1. Change 2 — `_removeWindowFromCache:` private API declaration (header)

**Technical explanation:**

```objc
// It's sometimes necessary to explicitly remove a window from the "window
// cache" in order to deactivate it.  The "window cache" is an undocumented
// subsystem, all of whose methods are included in the NSWindowCache category
// of the NSApplication class (in header files generated using class-dump).
// Present in all versions of OS X from (at least) 10.2.8 through 10.5.
- (void)_removeWindowFromCache:(NSWindow *)aWindow;
```

This declares an undocumented `NSApplication` method that manipulates Apple's internal "window cache" — a private subsystem managing window activation state. The comment documents the discovery method (class-dump of AppKit binary), the historical version range (10.2.8–10.5 confirmed), and the use case (explicit deactivation). It is added to the existing `NSApplication` undocumented-method category alongside `_isRunningModal` and `_modalSession:sendEvent:`.

**Taxonomy:** *ABI substrate access* — declaring and using a private AppKit method discovered through binary introspection. The category declaration suppresses compiler warnings while making the call site explicit about the private API dependency.

**Framework implication:** This joins `_drawTitleBar:` from patch 182 as the second private AppKit API declaration in the cluster, reinforcing the thesis point that some 𝒮-layer dependencies are not just undocumented but **discoverable only through binary inspection** — a dependency whose existence and signature are encoded only in the compiled AppKit binary, not in any header or documentation. The ℋ-layer knowledge here is the class-dump methodology itself.

---

1. Change 3 — `CGContext` accessor: `.CGContext` → `graphicsPort` cast (`.mm`)

**Technical explanation:**

```objc
// Before (10.10+ API):
CGContextRef imageContext = [[NSGraphicsContext currentContext] CGContext];

// After (pre-10.10 compatible):
CGContextRef imageContext = (CGContextRef)[[NSGraphicsContext currentContext] graphicsPort];
```

`-[NSGraphicsContext CGContext]` was introduced in macOS **10.10**. On 10.7–10.9, obtaining the underlying `CGContextRef` from an `NSGraphicsContext` requires the older `graphicsPort` property, which returns an `id` (untyped pointer) that must be explicitly cast to `CGContextRef`. The `graphicsPort` property itself was deprecated in 10.14 but remains available throughout the Momiji target range.

**Taxonomy:** *Deprecation reversal* — replacing a modern typed accessor with the legacy untyped property + explicit cast, to restore compatibility with pre-10.10 systems.

**Framework implication:** This is a clean example of the deprecation/introduction asymmetry: the *new* API (`CGContext`) does not exist on old systems; the *old* API (`graphicsPort`) is deprecated on new systems but still present. Momiji must use the old API throughout because the new one is absent on a significant fraction of its target range. The explicit cast `(CGContextRef)` is itself a trust claim: the caller asserts that `graphicsPort` returns a `CGContextRef` on all relevant versions, which is true but not statically verifiable.

---

1. Change 4 — `backingScaleFactor` guarded by `respondsToSelector:` (`.mm`)

**Technical explanation:**

```objc
// Before:
if ([screen backingScaleFactor] > 1.0) {

// After:
CGFloat scale = [screen respondsToSelector:@selector(backingScaleFactor)]
              ? [screen backingScaleFactor]
              : 1.0;
if (scale > 1.0) {
```

`-[NSScreen backingScaleFactor]` was introduced in macOS **10.7** alongside HiDPI/Retina support. On 10.6 and earlier it does not exist. Although Momiji's operational floor is 10.7, the version floor in `nsCocoaFeatures` was set to 10.6 (patch 185), and this code path may conceivably be reached on a system where the selector is absent. The `respondsToSelector:` probe returns `1.0` (non-HiDPI) as the safe fallback, which is correct for any pre-HiDPI system.

**Taxonomy:** *Runtime API availability guard* — using `respondsToSelector:` as an Objective-C runtime probe rather than `@available` or `__builtin_available`. This is a fourth detection mechanism alongside the three documented in earlier patches (compile-time `MAC_OS_X_VERSION_MIN_REQUIRED`, `__builtin_available`, and `nsCocoaFeatures` runtime helpers) — selector-presence probing is a distinctly Objective-C idiom that the framework taxonomy should capture.

**Framework implication:** `respondsToSelector:` is the most granular runtime probe available in Objective-C — it checks for the existence of a specific method on a specific object at the moment of the call, not at process start. It is more dynamic than `@available` (which checks OS version) and more precise than `nsCocoaFeatures` helpers (which check version ranges). This adds a fourth detection mechanism to the three already documented, strengthening the thesis point that **no single detection mechanism covers all cases** and that human judgment is required to select among them.

---

1. Change 5 — Titlebar double-click preference: `ActionOnDoubleClickSystemPref` gated and pre-10.11 path added (`.mm`)

**Technical explanation:**

```objc
// ShouldZoomOnTitlebarDoubleClick - before:
return [ActionOnDoubleClickSystemPref() isEqualToString:@"Maximize"];

// After:
if (nsCocoaFeatures::OnElCapitanOrLater()) {
    return [ActionOnDoubleClickSystemPref() isEqualToString:@"Maximize"];
}
return false;

// ShouldMinimizeOnTitlebarDoubleClick - before:
return [ActionOnDoubleClickSystemPref() isEqualToString:@"Minimize"];

// After:
if (nsCocoaFeatures::OnElCapitanOrLater()) {
    return [ActionOnDoubleClickSystemPref() isEqualToString:@"Minimize"];
}
// Pre-10.11:
NSUserDefaults* userDefaults = [NSUserDefaults standardUserDefaults];
NSString* kAppleMiniaturizeOnDoubleClickKey = @"AppleMiniaturizeOnDoubleClick";
id value1 = [userDefaults objectForKey:kAppleMiniaturizeOnDoubleClickKey];
return [value1 isKindOfClass:[NSValue class]] && [value1 boolValue];
```

Before macOS **10.11 (El Capitan)**, the system preference for titlebar double-click behaviour was stored differently. On 10.11+, both zoom and minimize actions are encoded in the `AppleActionOnDoubleClick` preference key (read by `ActionOnDoubleClickSystemPref()`). On pre-10.11 systems:
- **Zoom on double-click** was not a system preference at all — it always returned `false`.
- **Minimize on double-click** was stored under the separate key `AppleMiniaturizeOnDoubleClick` as a boolean `NSValue`.

The `nsCocoaFeatures::OnElCapitanOrLater()` gate splits to the appropriate reading strategy for each version regime.

**Taxonomy:** *Runtime API availability guard* with behavioural preference-schema divergence — not an API absence, but a **preference storage schema change** between OS versions. The underlying NSUserDefaults system is present on all versions; what changes is which key encodes which behaviour.

**Framework implication:** This is among the most subtle 𝒮-layer dependencies in the cluster so far. The dependency is not on an API's presence or absence, but on the **semantic schema of a system preference store** — the mapping between user intent (minimize on double-click) and the key/value encoding in NSUserDefaults. This schema change is invisible to any API availability check, any SDK comparison, and any dependency graph. It is purely ℋ-layer knowledge: i3roly knew (empirically or from documentation) that the key changed at 10.11, and the fix is a schema-aware split. This is a strong candidate for the thesis discussion of behavioral defects as the hardest dependency class.

---

1. Change 6 — AV permission and screen capture APIs gated to 10.14/10.15 (`.mm`)

**Technical explanation:** Three related interventions:

**6a. `GeckoAVAuthorizationStatus` enum + category declarations (pre-10.14 SDK):**

```objc
enum GeckoAVAuthorizationStatus : NSInteger {
    GeckoAVAuthorizationStatusNotDetermined = 0,
    GeckoAVAuthorizationStatusRestricted    = 1,
    GeckoAVAuthorizationStatusDenied        = 2,
    GeckoAVAuthorizationStatusAuthorized    = 3
};

#if !defined(MAC_OS_X_VERSION_10_14) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_14
@interface AVCaptureDevice (GeckoAVAuthorizationStatus)
+ (GeckoAVAuthorizationStatus)authorizationStatusForMediaType:(AVMediaType)mediaType;
@end
@interface AVCaptureDevice (WithCompletionHandler)
+ (void)requestAccessForMediaType:(AVMediaType)mediaType
            completionHandler:(void (^)(BOOL granted))handler;
@end
#endif
```

`AVAuthorizationStatus` and `AVCaptureDevice`'s authorization methods were introduced in macOS **10.14 (Mojave)** as part of the mandatory camera/microphone privacy permissions framework. On pre-10.14 SDKs these symbols do not exist. The patch defines a `Gecko`-prefixed copy of the enum with matching integer values (verified against the 10.14 SDK by asserts elsewhere) and re-declares the `AVCaptureDevice` methods as returning the Gecko enum type, allowing the code to compile against older SDKs while preserving correct runtime behaviour on 10.14+.

**6b. `GetPermissionState` wrapped in `@available(macOS 10.14, *)`:**
The entire AV authorization check body is gated; pre-10.14 returns `NS_ERROR_NOT_IMPLEMENTED` cleanly.

**6c. `GetScreenCapturePermissionState` wrapped in `@available(macOS 10.15, *)`:**
Screen recording permission checking via `CGWindowListCopyWindowInfo` window-name heuristics is a **Catalina (10.15)** feature — the permission model for screen recording didn't exist before 10.15. The entire body is wrapped; pre-10.15 returns `NS_ERROR_NOT_IMPLEMENTED` with an explicit log message.

**6d. `RequestCapturePermission` wrapped in `@available(macOS 10.14, *)`:**
The `AVCaptureDevice requestAccessForMediaType:completionHandler:` call is gated the same way.

**Taxonomy:** *Runtime API availability guard* (6b, 6c, 6d) combined with *Structural ABI bridge* (6a — the `GeckoAVAuthorizationStatus` enum re-declaration serving as a type-compatibility shim for pre-10.14 SDK compilation).

**Framework implication:** Change 6 is the largest single block and illustrates a pattern not yet seen explicitly in the cluster: **an entire subsystem with no meaningful fallback**. The pre-Mavericks rendering path (patches 181, 182) had a full software alternative. Here, AV permissions on pre-10.14 and screen capture permissions on pre-10.15 simply do not exist as concepts — the OS has no such permission model. `NS_ERROR_NOT_IMPLEMENTED` is not a degraded fallback; it is the correct answer. This is the **feature excision** pattern applied to an OS-level capability layer: the feature cannot be emulated or approximated; it is genuinely absent. The `GeckoAVAuthorizationStatus` enum shim (6a) is a compile-time fiction that allows the surrounding code to compile against old SDKs, while the `@available` guards at runtime ensure the fiction never executes.

---

#### 27.33-34. `widget/cocoa/nsCocoaWindow.h/.mm`   [**MASSIVE PATCH**]

**Summaries:**

This patch pair is the structural inverse of patch 182. Where patch 182 restored `nsChildView` by adding back its full class definition, this patch contracts `nsCocoaWindow` by surgically removing everything that was migrated to `nsChildView`. The `.mm` patch is by far the largest in the cluster: the diff removes approximately 4,200 lines from `nsCocoaWindow.mm` — nearly the entire implementation — retaining only the window-management and chrome-rendering responsibilities that genuinely belong to the top-level window class. What remains after excision is a coherent, correctly-scoped `nsCocoaWindow`, plus targeted restoration of pre-Mavericks titlebar infrastructure.

**Taxonomy classification:**
1. **Build graph surgery**
2. **Feature excision**
3. **UI rendering restoration**
4. **ABI substrate access**
5. **Runtime API availability guard**
6. **Syntax backport**
7. **Metadata override**
8. **Build graph surgery**

**Relations:** none

**Explanation:**

This patch pair is the structural inverse of patch 182. Where patch 182 *restored* `nsChildView` by adding back its full class definition, this patch *contracts* `nsCocoaWindow` by surgically removing everything that was migrated to `nsChildView`. The `.mm` patch is by far the largest in the cluster: the diff removes approximately 4,200 lines from `nsCocoaWindow.mm` — nearly the entire implementation — retaining only the window-management and chrome-rendering responsibilities that genuinely belong to the top-level window class. What remains after excision is a coherent, correctly-scoped `nsCocoaWindow`, plus targeted restoration of pre-Mavericks titlebar infrastructure.

---

1. Change 1 — Mass removal of includes, namespaces, and static state from `.mm`

**Technical explanation:** Twenty-two `#include` directives are removed from the top of `nsCocoaWindow.mm`, including `GLContextCGL.h`, `VibrancyManager.h`, `mozilla/layers/NativeLayerCA.h`, `mozilla/layers/IAPZCTreeManager.h`, `mozilla/SwipeTracker.h`, `mozilla/TextEventDispatcher.h`, `mozilla/layers/SurfacePool.h`, and others. The `using namespace mozilla::layers`, `using namespace mozilla::widget`, `using namespace mozilla::gl` declarations are also removed, along with large blocks of static state: `sLastInputEventCount`, `sIsTabletPointerActivated`, `sUniqueKeyEventId`, `ChildViewMouseTracker` static members, the `PixelHostingView` Obj-C interface, and the `ChildView (Private)` category listing `nsCocoaWindow*` as the `geckoChild` type.

All of these belonged to `nsChildView`'s responsibilities and were present in `nsCocoaWindow.mm` only because upstream had absorbed `nsChildView`'s implementation there. Their removal mirrors exactly what was restored to `nsChildView.mm` in patch 182.

---

1. Change 2 — `nsCocoaWindow.h`: removal of view-layer members and methods

**Technical explanation:** From the C++ `nsCocoaWindow` class definition, the following blocks are removed:

- All coordinate-conversion methods (`CocoaPointsToDevPixels`, `DevPixelsToCocoaPoints`) — these belong on `nsChildView`
- All event synthesis methods (`SynthesizeNativeKeyEvent`, `SynthesizeNativeMouseEvent`, `SynthesizeNativeMouseScrollEvent`, `SynthesizeNativeTouchPoint`, `SynthesizeNativeTouchpadDoubleTap`) — most migrated to `nsChildView`, a subset retained (see Change 3)
- `DoHasPendingInputEvent`, `GetCurrentInputEventCount`, `UpdateCurrentInputEventCount` — migrated to `nsChildView`
- `UpdateFullscreen`, `DispatchAPZWheelInputEvent`, `DispatchAPZInputEvent`, `DispatchDoubleTapGesture` — view-level APZ dispatch, belongs on `nsChildView`
- `SuspendAsyncCATransactions`, `MaybeScheduleUnsuspendAsyncCATransactions`, `UnsuspendAsyncCATransactions` — CATransaction management, belongs on `nsChildView`
- `TearDownView`, `UpdateVibrancy`, `EnsureVibrancyManager` — view lifecycle management
- `GetEditorView`, `SendEventToNativeMenuSystem`, `PostHandleKeyEvent`, `ActivateNativeMenuItemAt`, `ForceUpdateNativeMenuAt`, `GetSelectionAsPlaintext`, `AttachNativeKeyEvent`, `GetNativeTextEventDispatcherListener` — text input handling, belongs on `nsChildView`
- `PreRender`, `PostRender`, `GetNativeLayerRoot`, `UpdateWindowDraggingRegion`, `GetNonDraggableRegion`, `LookUpDictionary` — rendering pipeline, belongs on `nsChildView`
- `GetPaintListener()` — paint listener accessor

From the ivar block: `mChildView`, accessibility weak ref, `mCompositingLock`, `mNonDraggableRegion`, `mBackingScaleFactor` (large cached value), `mNativeLayerRoot`, `mContentLayer`, `mPoolHandle`, `mContentLayerInvalidRegion`, `mVibrancyManager`, `mUnsuspendAsyncCATransactionsRunnable`, `sLastInputEventCount`, `mSynthesizedTouchInput`, `mDeferredWorkspaceID`, `mTextInputHandler`.

Also removed from header includes: `ViewRegion.h`, `mozView.h`; forward declarations `VibrancyManager`, `TextInputHandler`.

---

1. Change 3 — `nsCocoaWindow.h`: retained and added members

**Technical explanation:** Not everything is removed. The patch makes targeted *additions* and *substitutions* to `nsCocoaWindow`:

- `ClientToWindowSize` replaces `NormalSizeModeClientToWindowMargin` and `ShowsResizeIndicator` — a cleaner API for the same geometry calculation
- `WindowRenderer* GetWindowRenderer()` added — rendering coordinator method retained at the window level
- `SynthesizeNativeMouseEvent` and `SynthesizeNativeMouseScrollEvent` retained — these operate at the window coordinate level and cannot be fully delegated to the child view
- `GetInputContext()` inlined as `{ return mInputContext; }` — simplification from a separate `.mm` implementation
- `PauseOrResumeCompositor`, `AsyncPanZoomEnabled`, `StartAsyncAutoscroll`, `StopAsyncAutoscroll` added — compositor and APZ control interfaces retained at window level
- `CreatePopupContentView` added — popup child view creation, properly owned by the window
- `mPopupContentView` (typed `nsChildView*`) replaces `mChildView` (typed `ChildView*`) — the popup content view reference is now typed as the C++ class, not the Obj-C view
- `mDelegate` default-initializer removed (was `= nullptr`) — minor consistency change
- `mBackingScaleFactor` retained as a plain field (not the large block) — the window still needs its own backing scale cache

---

1. Change 4 — `BaseWindow` Obj-C class: pre-Mavericks titlebar infrastructure restored

**Technical explanation:** Several additions to the `BaseWindow` Obj-C interface and implementation:

**4a. New ivars:** `mUnifiedToolbarHeight`, `mInitialTitlebarHeight`, `mFullScreenButtonRect`. These store the pre-Mavericks titlebar geometry state. The comment on `mInitialTitlebarHeight` is explicit: "The `titlebarHeight` getter returns 0 when in fullscreen, which is not useful in some cases."

**4b. New methods:** `setUnifiedToolbarHeight:`, `unifiedToolbarHeight`, `titlebarHeight`, `titlebarRect`, `placeFullScreenButton:`, `windowButtonsPositionWithDefaultPosition:`, `fullScreenButtonPositionWithDefaultPosition:`.

`titlebarHeight` computes the titlebar height by stripping `NSFullSizeContentViewWindowMask` from the style mask before calling `contentRectForFrameRect:` — necessary because Firefox's custom titlebar drawing overrides `contentRectForFrameRect:` to return the full frame, which would give a titlebar height of zero. The real height is recovered by using the *unmodified* `NSWindow` class method with the original style mask.

`windowButtonsPositionWithDefaultPosition:` and `fullScreenButtonPositionWithDefaultPosition:` implement custom positioning of the window control buttons (traffic lights) and fullscreen button when content extends into the titlebar — hiding them by moving above the frame when the rect is empty, or positioning from the stored rect otherwise. These are the pre-Mavericks counterparts of the `NSFullSizeContentViewMask`-based layout that macOS 10.10+ handles automatically.

**4c. `setContentView:` override restored:**

```objc
- (void)setContentView:(NSView*)aView {
  [super setContentView:aView];
  if (!([self styleMask] & NSFullSizeContentViewWindowMask)) {
    NSView* frameView = [aView superview];
    [aView removeFromSuperview];
    if ([frameView respondsToSelector:@selector(_addKnownSubview:positioned:relativeTo:)]) {
      // 10.10 prints a warning when we call addSubview on the frame view
      [frameView _addKnownSubview:aView positioned:NSWindowBelow relativeTo:nil];
    } else {
      [frameView addSubview:aView positioned:NSWindowBelow relativeTo:nil];
    }
  }
}
```

On pre-`NSFullSizeContentViewMask` systems (pre-10.10), or when the mask is not used, the content view must be manually repositioned to the *bottommost* layer of the frame view's subview stack, so it does not cover the window buttons. On 10.10+, `NSFullSizeContentViewMask` handles this automatically. The `_addKnownSubview:positioned:relativeTo:` private API is used on 10.10 to suppress a warning that AppKit emits when `addSubview:positioned:` is called directly on the frame view — another undocumented private API usage to silence an internal AppKit diagnostic.

**4d. `FullscreenTitlebarTracker` initialization gated to `@available(macOS 10.10, *)`:**

```objc
if (@available(macOS 10.10, *)) {
    mFullscreenTitlebarTracker = [[FullscreenTitlebarTracker alloc] init];
    [mFullscreenTitlebarTracker addObserver:self forKeyPath:@"revealAmount" ...];
    [(NSWindow*)self addTitlebarAccessoryViewController:mFullscreenTitlebarTracker];
}
```

`NSTitlebarAccessoryViewController` (used by `FullscreenTitlebarTracker`) was introduced in macOS **10.10**. On 10.7–10.9, this entire block is skipped. The `dealloc` method is correspondingly guarded with the same `@available(macOS 10.10, *)` check before removing the observer and releasing the tracker.

**4e. `titlebarAppearsTransparent` guarded by `respondsToSelector:`:**

```objc
if ([self respondsToSelector:@selector(setTitlebarAppearsTransparent:)]) {
    self.titlebarAppearsTransparent = self.drawsContentsIntoWindowFrame;
}
```

`titlebarAppearsTransparent` was also introduced in **10.10**. The `respondsToSelector:` probe guards calls in both `initWithContentRect:` and `setDrawsContentsIntoWindowFrame:`.

**4f. `NSKeyValueChangeNewKey` dictionary access syntax reverted:**

```objc
// Before (modern subscript syntax):
NSNumber* revealAmount = (change[NSKeyValueChangeNewKey]);

// After (pre-10.8 compatible method call):
NSNumber* revealAmount = ([change objectForKey:NSKeyValueChangeNewKey]);
```

NSDictionary subscript syntax (`dict[key]`) requires the **10.8 SDK**. On 10.7, it does not compile. The reversion to `objectForKey:` is the compatible form.

**4g. Tooltip shadow constant renamed and gated:**

```objc
// Before:
static const NSUInteger kWindowShadowOptionsTooltip = 4;
// ...
return kWindowShadowOptionsTooltip;

// After:
static const NSUInteger kWindowShadowOptionsTooltipMojaveOrLater = 4;
// ...
if (nsCocoaFeatures::OnMojaveOrLater()) {
    return kWindowShadowOptionsTooltipMojaveOrLater;
}
return kWindowShadowOptionsMenu;
```

The tooltip shadow option value `4` is valid only on macOS 10.14+. On pre-Mojave systems, returning `4` for tooltip shadow produces incorrect or broken shadow rendering; `kWindowShadowOptionsMenu` (`2`) is the correct fallback. The constant is renamed to make the version constraint explicit in the name.

---

1. Change 5 — `-(BOOL)bottomCornerRounded` declaration added to `NSWindow (Undocumented)`

**Technical explanation:**

```objc
- (BOOL)bottomCornerRounded;
```

Added to the existing undocumented `NSWindow` category. This is a private AppKit method that reports whether the window's bottom corners are rounded — used in the pre-Mavericks software corner-masking path (connecting to `mTopLeftCornerMask` from patch 182) to determine whether corner masking is needed on the bottom edge as well.

---

1. Change 6 — `childViewFrameRectForCurrentBounds` and `updateChildViewFrameRect` removed from `BaseWindow` interface

**Technical explanation:** These two methods managed the frame rect of the child view when content extends into the titlebar. Their removal from the `BaseWindow` interface reflects the shift: with `nsChildView` now properly owning view geometry, and with the `setDrawsContentsIntoWindowFrame:` override now firing a resize event (comment: "We do that by firing a resize event which will cause the ChildView to be resized to the rect returned by `nsCocoaWindow::GetClientBounds`") rather than directly manipulating the child view frame, these methods are no longer needed at the `BaseWindow` level.

---

#### 27.35. `widget/cocoa/nsDragService.mm`

**Summaries:**

This patch addresses a drag-image rendering path in `nsDragSession::ConstructDragImage`, which builds the visual ghost image shown under the cursor when the user drags an element.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Structural ABI bridge**
3. **UI rendering restoration**

**Relations:** none

**Explanation:**

This patch addresses a drag-image rendering path in `nsDragSession::ConstructDragImage`, which builds the visual ghost image shown under the cursor when the user drags an element.

**The API boundary: `+[NSImage imageWithSize:flipped:drawingHandler:]`**

This class method, which accepts a block-based drawing handler, was introduced in macOS 10.8. The modern Firefox code calls it unconditionally. On 10.7, this selector does not exist at all — calling it raises an `NSException` (as i3roly's comment explicitly records: *"i saw an exception and it has to be here"*), causing the drag operation to crash rather than degrade gracefully.

The patch applies a two-part fix:

**Part 1 — Category forward declaration (compile-time)**

```objc
#if !defined(MAC_OS_X_VERSION_10_8) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_8
@interface NSImage (ImageCreationWithDrawingHandler)
+ (NSImage*)imageWithSize:(NSSize)size
                  flipped:(BOOL)drawingHandlerShouldBeCalledWithFlippedContext
           drawingHandler:(BOOL (^)(NSRect dstRect))drawingHandler;
@end
#endif
```

This is an Objective-C category declaration that teaches the compiler about the method signature without requiring the macOS 10.8 SDK. The preprocessor guard (`MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_8`) ensures this only fires when the deployment target is below 10.8 — on higher SDKs the declaration is already present in `AppKit.framework` and would collide. This is structurally identical to the pattern used in `nsCocoaWindow.mm` for the same API family (as i3roly notes, that one predates his work; this one is a fresh addition).

**Part 2 — Runtime branch (execution-time)**

```objc
if (@available(macOS 10.8, *)) {
    image = [NSImage imageWithSize:size flipped:YES drawingHandler:^BOOL(NSRect dstRect) { … }];
} else {
    image = [[NSImage alloc] initWithSize:size];
    [image lockFocus];
    // manual path construction
    [image unlockFocus];
}
```

The `@available(macOS 10.8, *)` guard dispatches to the modern block-based API on 10.8+ and falls back to the classic `lockFocus`/`unlockFocus` drawing model on 10.7. The fallback manually constructs a rectangular `NSBezierPath` by walking four corner points — approximating the same gray-border rectangle that the block-based version renders — using the older immediate-mode drawing API that has been available since 10.0.

**Semantic equivalence:** The fallback produces visually equivalent output. The modern path uses `bezierPathWithRect:` (constructs the rectangle in one call); the legacy path manually traces the four sides with `moveToPoint:`/`lineToPoint:` sequences. Both set the same gray color and 2.0pt line width. There is a minor geometric difference: the modern path strokes a proper closed rect, while the fallback closes the path by returning to origin but does not call `[path closePath]` — this is functionally equivalent for a rectangular stroke but technically slightly different in how the path joins are computed. Not visually significant.

---

#### 27.36-37. `widget/cocoa/nsLookAndFeel.h/.mm`   [MASSIVE PATCH]

**Summaries:**

This paired patch is the most wide-ranging in the `widget/cocoa` cluster so far. In detail, the changes fall into 7 distinct concern areas:
1. Removal of post 10.7-framework imports
2. Removal of `[GeckoNSApplication sharedApplication]` call during initialization
3. `NSScroller.preferredScrollerStyle` - forward declaration + `respondsToSelector:` guard
4. `NSWorkspace` accessibility properties - `respondsoSelector:` and `@available` guards
5. `NativeGetColor` refractor: `aColor` -> local `color` variable
6. Per-color availability guards across `NativeGetColor`
7. `SystemWantsDarkTheme` - guarded by `@available(macOS 10.14, *)`
8. `IntID::MacGraphiteTheme`, `MacLionTheme`, `MacYosemiteTheme` - restored cases
9. `IntID::SwipeAnimationEnabled` - `respondsToSelector:` guard
10. `IntID::CursorScale` - `NSUserDefaults initWithSuiteName:` guard
11. `MOZLookAndFeelDynamicChangeObserber` notification center branching
12. `mRtl` initialization guarded by `@available(macOS 10.12, *)`

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Deprecation reversal**
3. **Feature excision**
4. **Structural ABI bridge**
5. **Preprocessor branch collapse**
6. **Runtime library substitution**
7. **Historical artifact recovery**
8. **Build graph surgery**

**Relations:** none

**Explanation:**

This paired patch is the most wide-ranging in the `widget/cocoa` cluster so far. It retrofits the entire **system appearance and UI metrics subsystem** — the layer that tells Gecko what colors, scrollbar styles, accessibility preferences, and theme tokens the OS reports — to operate correctly on macOS 10.7 through 10.13, where many of the modern APIs it invokes simply do not exist.

The changes fall into seven distinct concern areas:

---

1. Removal of post-10.7 framework imports

```objc
-#import <Accessibility/Accessibility.h>
-#include "nsAppShell.h"
```

`<Accessibility/Accessibility.h>` (the new unified Accessibility framework, distinct from `ApplicationServices/Accessibility`) is macOS 11+ only. `nsAppShell.h` was included only to access `GeckoNSApplication`, whose instantiation call is also removed (see below). Both removals eliminate hard compile-time or link-time failures on older SDKs.

---

2. Removal of `[GeckoNSApplication sharedApplication]` call during initialization

```objc
-  [GeckoNSApplication sharedApplication];
```

The original code forced instantiation of the application object inside `nsLookAndFeel::EnsureInit()`. i3roly removes this; it was apparently introduced to guard against a specific ordering issue, but its removal is necessary to avoid depending on `nsAppShell.h` and, implicitly, on newer application lifecycle infrastructure.

---

3. `NSScroller.preferredScrollerStyle` — forward declaration + `respondsToSelector:` guard

```objc
enum { mozNSScrollerStyleLegacy = 0, mozNSScrollerStyleOverlay = 1 };
typedef NSInteger mozNSScrollerStyle;

@interface NSScroller(AvailableSinceLion)
+ (mozNSScrollerStyle)preferredScrollerStyle;
@end
```

`+[NSScroller preferredScrollerStyle]` was introduced in 10.7 (Lion) but the enum constants `NSScrollerStyleLegacy`/`NSScrollerStyleOverlay` live in the 10.7 SDK. Rather than depending on the SDK enum, i3roly defines a local `mozNSScrollerStyle` with hardcoded integer values (0 = legacy, 1 = overlay) and forward-declares the selector via a named category `AvailableSinceLion`. The call site is then guarded:

```objc
bool nsLookAndFeel::SystemWantsOverlayScrollbars() {
  return ([NSScroller respondsToSelector:@selector(preferredScrollerStyle)] &&
          [NSScroller preferredScrollerStyle] == mozNSScrollerStyleOverlay);
}
```

This is a `respondsToSelector:` dynamic dispatch guard — the most conservative possible runtime check, appropriate here because even 10.7 availability of this method cannot be assumed across all OS minor versions being targeted.

The original code also conflated `UseOverlayScrollbars` and `AllowOverlayScrollbarsOverlap` into a single `case` fallthrough — both returning the same value. The patch separates them, with `AllowOverlayScrollbarsOverlap` requiring additionally that the system is Mountain Lion (10.8) or later, since overlay scrollbar overlap rendering was refined in 10.8.

---

4. `NSWorkspace` accessibility properties — `respondsToSelector:` and `@available` guards

```objc
@interface NSWorkspace(AvailableSinceSierra)
@property (readonly) BOOL accessibilityDisplayShouldReduceMotion;
@end
```

`accessibilityDisplayShouldReduceMotion` was added in 10.12 (Sierra). The comment says "test availability at runtime before using." Three separate `NSWorkspace` accessibility properties are each given guards:

- `accessibilityDisplayShouldReduceMotion` → `respondsToSelector:` check
- `accessibilityDisplayShouldReduceTransparency` → `@available(macOS 10.10, *)`
- `accessibilityDisplayShouldInvertColors` → `@available(macOS 10.12, *)`
- `accessibilityDisplayShouldIncreaseContrast` → `@available(macOS 10.10, *)`

Each corresponds to the exact macOS version where that NSWorkspace property was introduced.

---

5. `NativeGetColor` refactor: `aColor` → local `color` variable

The entire `switch` body in `NativeGetColor` is refactored so that assignments target a local `nscolor color = 0` rather than writing directly into `aColor`. At the bottom of the function:

```objc
aColor = color;
return NS_OK;
```

This is architecturally motivated: several new `@available` branches need to produce a result without `return NS_OK` (some cases early-return with `return NS_OK` still, notably the header/caption color block). The local variable pattern allows all code paths through the `switch` to converge at a single assignment point, avoiding double-assignment bugs when the guarded and fallback branches both need to write `aColor`. It also makes the control flow auditable.

---

6. Per-color availability guards across `NativeGetColor`

Several `NSColor` properties accessed unconditionally in the modern code require availability guards:

- **`NSColor.windowBackgroundColor` / `NSColor.underPageBackgroundColor`** for `ColorID::Window` and `ColorID::MozDialog`: on 10.13 and below, `NSColor.windowBackgroundColor` returns transparent black rather than a usable background color. The patch adds a `@available(macOS 10.14, *)` branch and falls back to hardcoded `NS_RGB(0xF6, 0xF6, 0xF6)` (a light grey taken from macOS 11.5, per comment).

- **`NSColor.unemphasizedSelectedContentBackgroundColor`** for `ColorID::MozColheaderactive`: introduced in 10.14. Pre-10.14 fallback uses `NSColor.controlColor` (with `controlBackgroundColor` as alpha-transparency safety net).

- **`NSColor.linkColor`** and **`NSColor.systemPurpleColor`**: both introduced in 10.10. Pre-10.10 fallbacks hardcode appropriate RGB values. The `Visitedtext` fallback additionally calls `SystemWantsDarkTheme()` to select between dark-mode and light-mode purple variants, sourced from an external iOS dark mode compatibility blog post (cited in comment).

- **`NSColor.controlAccentColor`**: the patch replaces the modern property accessor with a call to `ControlAccentColor()` — a local helper function (defined elsewhere in the file or a companion patch) that presumably performs its own availability check.

- **`NSColor.selectedContentBackgroundColor`**: replaced with `NSColor.alternateSelectedControlColor`, the pre-10.14 equivalent for selected content background in lists. This is a **deprecation reversal** — using the older API which has broader compatibility.

- **`NSColor.labelColor`** for caption/header text: replaced with `NSColor.textColor` and the early-return path is kept for that case group. `Windowtext` and `MozDialogtext` are split into a separate `case` group and mapped to `NSColor.windowFrameTextColor` instead — a more appropriate semantic match for window-level text.

- **Array subscript syntax on `NSColor.controlAlternatingRowBackgroundColors`**: replaced with `[... objectAtIndex:0/1]` — subscript syntax on NSArray requires 10.8+.

---

7. `SystemWantsDarkTheme` — guarded by `@available(macOS 10.14, *)`

```objc
static bool SystemWantsDarkTheme() {
    if (@available(macOS 10.14, *)) {
        // NSAppearanceNameDarkAqua check
    } else
        return false;
}
```

`NSAppearanceNameDarkAqua` is a 10.14 constant; `effectiveAppearance` query for dark mode has no meaning pre-10.14 (dark mode did not exist). The pre-10.14 path correctly returns `false` — the system always wants light theme.

`PrefersNonBlinkingTextInsertionIndicator()` and its macOS 15 `AXPrefersNonBlinkingTextInsertionIndicator()` call are **entirely removed**, and `IntID::CaretBlinkTime` is hardcoded to `567`. Similarly the macOS 15 notification `AXPrefersNonBlinkingTextInsertionIndicatorDidChangeNotification` observer is removed.

---

8. `IntID::MacGraphiteTheme`, `MacLionTheme`, `MacYosemiteTheme` — restored cases

```objc
case IntID::MacGraphiteTheme:
  aResult = [NSColor currentControlTint] == NSGraphiteControlTint;
case IntID::MacLionTheme:
  aResult = nsCocoaFeatures::OnLionOrLater();
case IntID::MacYosemiteTheme:
  aResult = nsCocoaFeatures::OnYosemiteOrLater();
```

These `IntID` cases were absent from the modern Firefox code (presumably removed when those OS versions became the floor). They are restored here because the Gecko CSS engine uses these IDs to apply OS-version-specific style rules. Without them the switch falls through to `default` (returning `NS_ERROR_FAILURE`), breaking CSS theme detection.

---

9. `IntID::SwipeAnimationEnabled` — `respondsToSelector:` guard

```objc
aResult = 0;
if ([NSEvent respondsToSelector:@selector(isSwipeTrackingFromScrollEventsEnabled)]) {
  aResult = [NSEvent isSwipeTrackingFromScrollEventsEnabled];
}
```

`+[NSEvent isSwipeTrackingFromScrollEventsEnabled]` is a class method introduced in 10.7, but guarding with `respondsToSelector:` is defensive coding for sub-10.7 compatibility or ABI variation.

---

10. `IntID::CursorScale` — `NSUserDefaults initWithSuiteName:` guard

```objc
if (@available(macOS 10.9, *)) {
  uaDefaults = [[NSUserDefaults alloc] initWithSuiteName:@"..."];
} else {
  uaDefaults = [(id) CFPreferencesCopyAppValue(...) autorelease];
}
```

`-[NSUserDefaults initWithSuiteName:]` was introduced in 10.9. The pre-10.9 fallback reads the same preference via `CFPreferencesCopyAppValue`, the CoreFoundation-level API that predates `NSUserDefaults` suite support.

---

11. `MOZLookAndFeelDynamicChangeObserver` — notification center branching

```objc
if (nsCocoaFeatures::OnMojaveOrLater() &&
    NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification) {
    [NSWorkspace.sharedWorkspace.notificationCenter addObserver:...];
} else if (nsCocoaFeatures::OnYosemiteOrLater() &&
           NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification) {
    [NSNotificationCenter.defaultCenter addObserver:...];
}
```

`NSWorkspaceAccessibilityDisplayOptionsDidChangeNotification` is guarded not just by version but also by a null check on the notification name constant itself — a particularly defensive pattern since on older SDKs the symbol may not be exported, resolving to nil. On 10.14+ the notification is posted to `NSWorkspace`'s notification center; on 10.10–10.13 it was posted to the default `NSNotificationCenter`. The null check covers both unrecognized constant and version floor cases simultaneously.

---

12. `mRtl` initialization guarded by `@available(macOS 10.12, *)`

```objc
if (@available(macOS 10.12, *))
  mRtl = window.windowTitlebarLayoutDirection == NSUserInterfaceLayoutDirectionRightToLeft;
```

`windowTitlebarLayoutDirection` was added in 10.12. On older systems `mRtl` remains its default-initialized value of `false` — a safe and reasonable assumption, since system-wide RTL layout direction was not meaningfully exposed pre-10.12.

---

#### 27.38. `widget/cocoa/nsNativeThemeCocoa.h/.mm`     [MASSIVE PATCH]

**Summaries:**

This paired patch is a **wholesale restoration of the native widget rendering subsystem,** including:
1. `NSRect` -> `HIRect`/`CGRect`: coordinate type migration
2. `NSGraphicsContext` API downgrade: `graphicsContextWithCGContext:flipped:` -> `graphicsContextWithGraphicsPort:flipped:`
3. Focus ring width - runtime vs. `constexpr`
4. `FocusIsDrawnByDrawWithFrame` - SDK-conditional focus ring dispatch
5. `NSProgressBarCell` - complete private class re-implementation
6. `MOZSearchFieldCell` - search field magnifier positioning workaround
7. `CellRenderSettings` margin array - 2D OS-version dimension added
8. Massive widget type restoration - 20+ widget types re-added to the rendering pipeline
9. `RenderWidget` restructure - DrawTarget-first dispatch
10. `NSAppearance.currentAppearance` guards

**Taxonomy classification:**
1. **UI rendering restoration**
2. **Historical artifact recovery**
3. **Deprecation reversal**
4. **Preprocessor branch collapse**
5. **Runtime API availability guard**
6. **Structural ABI bridge**
7. **Layered runtime library substitution**
8. **Build graph surgery**
9. **Syntax backport**

**Relations:** none

**Explanation:**

This paired patch is a **wholesale restoration of the native widget rendering subsystem**. Modern Firefox progressively migrated widget rendering out of `nsNativeThemeCocoa` and into a lighter `ThemeCocoa` base class, stripping many widget types in the process. On legacy targets, this stripped code must be **reintroduced** because the modern rendering path depends on macOS 10.14+ vibrancy, compositing, and appearance infrastructure that does not exist on earlier systems. The patch is consequently the single largest in the entire `widget/cocoa` cluster, touching every layer of the native theming pipeline simultaneously.

The changes fall into eight distinct concern areas:

---

1. `NSRect` → `HIRect` / `CGRect` — coordinate type migration (global)

Every drawing function signature and call site is migrated from `NSRect` to `HIRect` (which is typedef'd to `CGRect`). Modern Cocoa favors `NSRect`; the Carbon-era HITheme APIs all operate on `HIRect`/`CGRect`. The patch migrates to the CG/HITheme coordinate space throughout — this is required because the majority of restored drawing functions call `HIThemeDrawButton`, `HIThemeDrawTrack`, `HIThemeDrawMenuItem`, etc., all of which take `CGRect*` parameters. The systematic rename eliminates implicit conversions and ensures type-safe dispatch to the correct drawing API.

Correspondingly, `NSSize{...}` aggregate initialization (C++11 brace syntax) is replaced everywhere with `NSMakeSize(...)` — the older, universally-compatible Cocoa constructor. This is a portability fix: brace initialization of Objective-C struct types has subtly different semantics across SDK versions.

`constexpr static` on `CellRenderSettings` structs is replaced with `MOZ_RUNINIT static const` — because these structs contain `NSSize` members (Objective-C types), they cannot be `constexpr` on older compilers. `MOZ_RUNINIT` is a Mozilla macro for statics that require runtime initialization.

---

2. `NSGraphicsContext` API downgrade: `graphicsContextWithCGContext:flipped:` → `graphicsContextWithGraphicsPort:flipped:`

```objc
// Modern (10.10+):
[NSGraphicsContext graphicsContextWithCGContext:cgContext flipped:YES]
// Legacy:
[NSGraphicsContext graphicsContextWithGraphicsPort:cgContext flipped:YES]
```

`+[NSGraphicsContext graphicsContextWithCGContext:flipped:]` was introduced in 10.10. The pre-10.10 equivalent is `+[NSGraphicsContext graphicsContextWithGraphicsPort:flipped:]`, which takes a `void*` graphics port (accepting a `CGContextRef` via implicit cast). This substitution appears in multiple call sites: `DrawCellWithScaling`, `DrawMultilineTextField`, and the `NSProgressBarCell` drawing method. It is a **deprecation reversal** applied globally — the older method still works on all supported versions but was deprecated in 10.14.

Similarly, `[[NSGraphicsContext currentContext] CGContext]` is replaced with `(CGContextRef)[[NSGraphicsContext currentContext] graphicsPort]` — the pre-10.10 way to extract a `CGContextRef` from the current graphics context.

---

3. Focus ring width — runtime vs. `constexpr`

```objc
// Modern:
static constexpr CGFloat kMaxFocusRingWidth = 7;
// Legacy:
static CGFloat kMaxFocusRingWidth = 0; // initialized by constructor
// In constructor:
kMaxFocusRingWidth = nsCocoaFeatures::OnYosemiteOrLater() ? 7 : 4;
```

On pre-10.10 systems, the focus ring width was 4pt; it changed to 7pt on Yosemite. Making this a runtime-initialized variable rather than a compile-time constant is necessary because the value is version-dependent. This is a subtle but important rendering detail: an incorrect focus ring width would produce visually clipped or oversized focus indicators.

---

4. `FocusIsDrawnByDrawWithFrame` — SDK-conditional focus ring dispatch

A new helper function is introduced:

```objc
static bool FocusIsDrawnByDrawWithFrame(NSCell* aCell) {
#if defined(MAC_OS_X_VERSION_10_8) && MAC_OS_X_VERSION_MAX_ALLOWED >= MAC_OS_X_VERSION_10_8
  return false;  // 10.8+ SDK: focus rings drawn separately
#else
  if (!nsCocoaFeatures::OnYosemiteOrLater()) return true;
  return [aCell isKindOfClass:[RadioButtonCell class]] ||
         [aCell isKindOfClass:[CheckboxCell class]];
#endif
}
```

This function encodes a **behavioral change in `NSCell` drawing semantics across SDK versions**: prior to the 10.8 SDK, `drawWithFrame:inView:` draws focus rings inline; from 10.8 onwards, they must be drawn via a separate `drawFocusRingMaskWithFrame:inView:` call. On 10.10 exactly, the behavior is cell-type-dependent. This is a three-way branch across compile-time SDK version, runtime OS version, and runtime cell type — all three detection dimensions simultaneously in a single function. It is also an instance where the compile-time SDK version (`MAC_OS_X_VERSION_MAX_ALLOWED`) controls behavior at runtime, making the executable's behavior depend on which SDK it was built against.

---

5. `NSProgressBarCell` — complete private class re-implementation

The modern Firefox code does not expose `NSProgressBarCell` — it relies on higher-level progress rendering infrastructure. The patch **re-introduces a full Objective-C class implementation** of `NSProgressBarCell` as a private class within the file:

```objc
@interface NSProgressBarCell : NSCell { double mValue; double mMax; bool mIsIndeterminate; bool mIsHorizontal; }
```

The `drawWithFrame:inView:` method uses `HIThemeDrawTrack` with a `HIThemeTrackDrawInfo` struct — the Carbon-era API for drawing progress and slider tracks. The animation phase for indeterminate bars is computed from `PR_IntervalNow()` (NSPR's portable timer), giving frame-rate-appropriate animation at 60fps for indeterminate and 30fps for determinate bars. This is a **complete UI rendering restoration** implemented via a private class that mimics the behavior of the system-private `NSProgressBarCell` class that macOS uses internally.

---

6. `MOZSearchFieldCell` — search field magnifier positioning workaround

```objc
@implementation MOZSearchFieldCell
- (instancetype)init {
  self = [super initTextCell:@" "];  // single space to force icon to left
  // override cancel button with invisible cell
}
- (BOOL)_isToolbarMode { return self.shouldUseToolbarStyle; }
@end
```

This custom subclass of `NSSearchFieldCell` works around a behavioral quirk on 10.12–10.13: when the search field is empty, the magnifying glass icon centers itself in the field rather than anchoring to the start position. The fix seeds the field with a single space character (making it non-empty), then hides the cancel button by replacing it with an invisible `NSButtonCell`. The `_isToolbarMode` override calls a private `NSSearchFieldCell` method to control the toolbar-style rendering path. This is a **behavioral defect** workaround for a specific version range — the bug affects only 10.12–10.13, and the workaround exploits a private API override.

---

7. `CellRenderSettings` margin array — 2D OS-version dimension added

The `CellRenderSettings` margin structure is expanded from a single `[3][4]` array (3 control sizes × 4 margins) to a `[2][3][4]` array (2 OS epochs × 3 control sizes × 4 margins):

```c
// Modern: single dimension
IntMargin{0, 4, 1, 4}  // small button

// Legacy: [os_epoch][control_size][margin]
{{   // Leopard (10.6–10.9)
     {0, 0, 0, 0},  // mini
     {4, 0, 4, 1},  // small
     {5, 0, 5, 2}   // regular
 },
 {   // Yosemite (10.10+)
     {0, 0, 0, 0},
     {4, 0, 4, 1},
     {5, 0, 5, 2}
}}
```

The OS epoch index is selected at runtime in `InflateControlRect` via:
```objc
static int osIndex = nsCocoaFeatures::OnYosemiteOrLater() ? yosemiteOSorlater : leopardOSorlater;
```

Note `static int osIndex` — the value is computed once on first call (lazy initialization). This is applied to `pushButtonSettings`, `dropdownSettings`, `editableMenulistSettings`, `searchFieldSettings`, `spinnerSettings`, `progressSettings`, `meterSetting` — every rendered control type. The OS-version-indexed margin dimension is necessary because AppKit changed the visual padding and alignment of NSCell-based controls between the Aqua (10.6–10.9) and Yosemite (10.10+) design languages.

---

8. Massive widget type restoration — 20+ widget types re-added to the rendering pipeline

The core of the patch is restoring the rendering and dispatch logic for the following widget types, each with its own `Params` struct, `Compute*` function, `Draw*` function, `Widget` enum entry, and `WidgetInfo` factory:

**Menu system (HITheme-based):**
- `eMenuBackground` — `HIThemeDrawMenuBackground` with submenu/popup type detection
- `eMenuItem` — `HIThemeDrawMenuItem` with vibrancy bypass (if vibrancy supported, background is contributed by window compositing, not drawn here)
- `eMenuSeparator` — `HIThemeDrawMenuSeparator` with a Big Sur behavioral workaround (hardcoded CGContext fill replacing the buggy HITheme call)
- `eMenuIcon` — `RenderWithCoreUI` with image name lookup; pre-10.11 image names require a `"image."` prefix (discovered behavioral difference in CoreUI image naming)
- `eTooltip` — hardcoded fill with `kTooltipBackgroundColor = sRGBColor(0.996, 1.000, 0.792, 0.950)`

**Form controls (HITheme/NSCell-based):**
- `eSpinButtons` / `eSpinButtonUp` / `eSpinButtonDown` — `HIThemeDrawButton` with `kThemeIncDecButton`; individual button rendering uses CGContext clip to mask the unwanted half
- `eSearchField` — `MOZSearchFieldCell` with `DrawCellWithSnapping`
- `eProgressBar` — `NSProgressBarCell` with `HIThemeDrawTrack`
- `eMeter` — `NSLevelIndicatorCell` with `NSLevelIndicatorStyleContinuousCapacity`; vertical meter is rendered by rotating the CGContext by −π/2 (Cocoa has no native vertical meter)
- `eScale` — `HIThemeDrawTrack` with `kThemeMediumSlider`
- `eFocusOutline` — `DrawFocusOutline`

**Chrome / structural (CoreUI/HITheme-based):**
- `eSegment` / `eToolbarButton` — `RenderWithCoreUI` with `kCUIWidgetButtonSegmentedSCurve`; separator responsibility logic determines which adjacent segment draws the inter-segment border
- `eNativeTitlebar` — `DrawNativeTitlebarToolbarWithSquareCorners` using `kCUIWidgetWindowFrame`; corners clipped to avoid rounding artifacts from the CUI drawing
- `eStatusBar` — `kCUIWidgetWindowFrame` with `kCUIWindowFrameBottomBarHeightKey`; extends rect upward to capture the bottom bar portion of the full-window frame
- `eGroupBox` — `HIThemeDrawGroupBox`
- `eSeparator` — `HIThemeDrawSeparator`
- `eColorFill` — direct `DrawTarget::FillRect`, bypassing the CGContext path entirely (the only DrawTarget-only widget)

**Source list (custom CGGradient/CoreUI):**
- `eSourceList` — manual `CGGradientCreateWithColorComponents` with hardcoded active/inactive gradient colors
- `eActiveSourceListSelection` / `eInactiveSourceListSelection` — pre-10.10 uses CoreUI `kCUIVariantGradientSideBarSelection`; 10.10+ uses `ControlAccentColor()` or hardcoded white values

---

9. `RenderWidget` restructure — DrawTarget-first dispatch

The modern `RenderWidget` handled only 6 widget types all via CGContext. The patch restructures it as a two-level switch: `eColorFill` renders directly to `DrawTarget` without acquiring a CGContext; all other widgets fall into a `default:` branch that acquires the `CGContextRef` and dispatches into a nested switch. This is architecturally significant: it defers the expensive `BeginNativeDrawing` call until it is actually needed, and provides a clean extension point for future DrawTarget-only widgets.

---

10. `NSAppearance.currentAppearance` guards

```objc
if (nsCocoaFeatures::OnMavericksOrLater()) {
  NSAppearance.currentAppearance = NSAppearanceForColorScheme(aScheme);
}
if (mCellDrawWindow) {
  if (@available(macOS 10.9, *)) {
    mCellDrawWindow.appearance = NSAppearance.currentAppearance;
  }
}
```

`NSAppearance` was introduced in 10.9 (Mavericks). Both the global current appearance assignment and the window-level appearance assignment are guarded. Pre-10.9, there is no appearance API and the system uses whatever Aqua appearance is present — which is correct for 10.7–10.8 where only light Aqua exists.

---

#### 27.39. `widget/cocoa/nsMacDockSupport.mm`

**Summaries:**

A compact 3-change patch touching Dock integration - progress bar rendering, dictionary access syntax, application launching.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Deprecation reversal**
3. **Syntax backport**

**Explanation:**

1. `NSColor.controlAccentColor` → `ControlAccentColor()` helper

```objc
// Modern:
[[NSColor controlAccentColor] setFill];
// Legacy:
[ControlAccentColor() setFill];
```

`NSColor.controlAccentColor` was introduced in 10.14. The patch substitutes the local `ControlAccentColor()` helper (established earlier in the cluster, presumably in `nsCocoaUtils` or a companion file) which performs its own availability guard and returns an appropriate fallback color on pre-10.14 systems. This affects the Dock tile progress bar fill — the accent-colored portion of the progress indicator drawn in the application's Dock icon badge. Without this substitution, calling `controlAccentColor` on 10.7–10.13 would raise an `NSException`, crashing the Dock tile drawing path.

---

2. NSDictionary subscript syntax → `objectForKey:`

```objc
// Modern (requires 10.8+ SDK):
NSDictionary* tileData = aPersistantApp[kDockTileDataKey];
NSDictionary* fileData = tileData[kDockFileDataKey];
// Legacy:
NSDictionary* tileData = [aPersistantApp objectForKey:kDockTileDataKey];
NSDictionary* fileData = [tileData objectForKey:kDockFileDataKey];
```

Objective-C subscript syntax on `NSDictionary` (`dict[key]`) requires the 10.8 SDK or higher to compile, as it depends on `objectForKeyedSubscript:` being declared in the SDK headers. When building against older SDKs or targeting pre-10.8, this syntax either fails to compile or produces incorrect dispatch. The substitution of `objectForKey:` is the universally-compatible form available since `NSDictionary`'s introduction. This is a pure compile-time compatibility fix — semantically identical at runtime on all versions.

---

3. `NSWorkspaceOpenConfiguration` → `launchApplicationAtURL:options:configuration:error:` fallback

The largest change. The modern path uses `NSWorkspaceOpenConfiguration` (introduced in 10.15, Catalina) for launching a new browser instance from the Dock menu:

```objc
if (@available(macOS 10.15, *)) {
    NSWorkspaceOpenConfiguration* config = [NSWorkspaceOpenConfiguration configuration];
    [config setArguments:arguments];
    [config setCreatesNewApplicationInstance:YES];
    [config setEnvironment:...];
    [config setAddsToRecentItems:val];
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:... configuration:config
        completionHandler:^(NSRunningApplication*, NSError*){}];
} else {
    NSError *error = nil;
    unsigned options = NSWorkspaceLaunchAsync | NSWorkspaceLaunchNewInstance;
    if (!val) options |= NSWorkspaceLaunchWithoutAddingToRecents;
    [[NSWorkspace sharedWorkspace]
        launchApplicationAtURL:[NSBundle mainBundle].bundleURL
        options:options
        configuration:@{NSWorkspaceLaunchConfigurationArguments: arguments,
                        NSWorkspaceLaunchConfigurationEnvironment: ...}
        error:&error];
}
```

The pre-10.15 fallback uses `-[NSWorkspace launchApplicationAtURL:options:configuration:error:]`, which was available from 10.6 and deprecated (but not removed) in 10.15. The semantics map directly: `NSWorkspaceLaunchNewInstance` corresponds to `setCreatesNewApplicationInstance:YES`; `NSWorkspaceLaunchAsync` is the default mode; `NSWorkspaceLaunchWithoutAddingToRecents` replaces `setAddsToRecentItems:NO`. Note the inverted boolean logic: the modern API takes an affirmative value (`setAddsToRecentItems:val`), while the legacy API requires adding the `WithoutAddingToRecents` flag only when the value is `false` — i3roly's comment calls this out explicitly.

One additional difference: the modern path launches from `launchPath` (a computed path), while the legacy path uses `[NSBundle mainBundle].bundleURL`. This is functionally equivalent in the context of "launch a new instance of the current application," but the bundle URL form is more canonical for pre-10.15 NSWorkspace.

---

#### 27.40. `widget/cocoa/nsMacFinderProgress.mm`

**Summaries:**

A single-focus patch wrapping the entire `NSProgress`-based Finder progress reporting intialisation in a runtime availability guard.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Feature excision**

**Explanation:**

A single-focus patch wrapping the entire `NSProgress`-based Finder progress reporting initialization in a runtime availability guard.

**The API boundary: `NSProgress`**

`NSProgress` — the class that reports file operation progress to Finder (and to the system progress infrastructure generally, surfaced as the progress bar on a file's Dock tile or in Finder's copy dialog) — was formally introduced in 10.9 (Mavericks) per Apple's documentation. The entire initialization block, from URL construction through `[mProgress publish]`, is moved inside `@available(macOS 10.8, *)`. On 10.7, `mProgress` is set to `NULL` and the function returns `NS_OK` silently — progress reporting is gracefully disabled rather than crashing.

**The `@available(macOS 10.8, *)` floor — and the comment**

i3roly's comment is unusually candid and worth reading carefully:

> *"APPUL docs say 10.9, but mountain lion has it too, so i dunno / 10.7 def crashing on this tho."*

This captures an empirical discovery process in real time. Apple's documentation says `NSProgress` arrived in 10.9. i3roly observed it working on Mountain Lion (10.8) — meaning the class exists on 10.8 despite the official documentation not listing it there. He also confirmed by direct observation that 10.7 crashes on this code. The guard is therefore set at 10.8 (conservative relative to the crash, permissive relative to the docs), accepting a small risk that `NSProgress` on 10.8 may behave differently from its documented 10.9 form.

This represents a **documentation-reality gap**: the system-layer dependency is not fully described by Apple's API availability tables. The actual floor is empirically determined to be somewhere between 10.8 and 10.9, but cannot be pinned precisely without exhaustive testing on every minor OS release. Setting the guard at 10.8 is the most permissive safe choice given the available empirical evidence.

The `else` branch sets `mProgress = NULL`. The downstream callers of `mProgress` — `UpdateProgress`, `CancelProgress`, `EndProgress` — must already handle a null progress object gracefully (or are themselves guarded), otherwise this would introduce a null-dereference. This is a structurally necessary consequence of the guard: the entire `NSProgress` subsystem becomes a no-op on 10.7.

---

#### 27.41. `widget/cocoa/nsMacSharingService.mm`

**Summaries:**

This patch applies availability guards to the macOS Sharing Services integration - the system sheet wgich allows sharing URLs to Mail, Messafes, ... 3 distinct changes across compile-time and runtime dimensions.

1. `NSUserActivityTypeBrowsingWeb` - compile-time constant definition
2. `NSSharingService` - `OnMountainLionOrLater()` guard
3. `NSUserActivity` Reminders - `OnYosemiteOrLater()` guard

**Taxonomy classification:**
1. **Runtime API availability check**
2. **Feature excision**
3. **Structural ABI bridge**

**Explanation:**

This patch applies availability guards to the macOS Sharing Services integration — the system sheet that allows sharing URLs to Mail, Messages, Twitter, Reminders, and other services. Three distinct changes across compile-time and runtime dimensions.

---

1. `NSUserActivityTypeBrowsingWeb` — compile-time constant definition

```objc
#if !defined(MAC_OS_X_VERSION_10_10) || \
    MAC_OS_X_VERSION_MIN_REQUIRED < MAC_OS_X_VERSION_10_10
NSString* const NSUserActivityTypeBrowsingWeb = @"NSUserActivityTypeBrowsingWeb";
#endif
```

`NSUserActivityTypeBrowsingWeb` is an `NSString` constant (not a method or class) introduced in 10.10. On SDKs targeting below 10.10, the symbol is absent from the SDK headers entirely. The patch provides a local definition of the constant with its documented string value — the actual `com.apple.NSUserActivityTypes.BrowsingWeb` type identifier — guarded by the preprocessor condition that fires only when the deployment target is below 10.10. On 10.10+ SDKs the system-provided symbol is used as normal; on older SDKs the local definition supplies the identical value.

This is included via `SDKDeclarations.h`, the centralised header introduced earlier in the cluster for exactly this class of forward declaration. The fact that this constant is declared there rather than inline confirms the architectural pattern established by earlier patches: all SDK-gap declarations are consolidated into a single header for maintainability.

This is structurally different from the category forward declarations seen elsewhere (e.g. `NSScroller(AvailableSinceLion)`) — those declare method signatures. This declares a string constant value, which requires providing the actual string at definition time rather than merely announcing the symbol's existence.

---

2. `NSSharingService` — `OnMountainLionOrLater()` guard

```objc
// GetSharingProviders:
if (!url || !nsCocoaFeatures::OnMountainLionOrLater()) {
    return NS_ERROR_FAILURE;
}

// ShareUrl:
if (nsCocoaFeatures::OnMountainLionOrLater()) {
    // ... entire sharing logic
}
```

`NSSharingService` was introduced in 10.8 (Mountain Lion). Both the provider enumeration path (`GetSharingProviders`, via `sharingServicesForItems:`) and the sharing invocation path (`ShareUrl`, via `sharingServiceNamed:` and `performWithItems:`) are now gated behind `OnMountainLionOrLater()`. On 10.7, `GetSharingProviders` returns `NS_ERROR_FAILURE` immediately after the URL check, and `ShareUrl` silently does nothing. The Sharing Services UI simply does not exist on 10.7 — there is no degraded fallback possible, so the correct behaviour is graceful absence.

---

3. `NSUserActivity` Reminders path — `OnYosemiteOrLater()` inner guard

```objc
if (nsCocoaFeatures::OnMountainLionOrLater()) {
    NSSharingService* service = [NSSharingService sharingServiceNamed:serviceName];

    if (nsCocoaFeatures::OnYosemiteOrLater()) {
        if ([[service name] isEqual:remindersServiceName]) {
            NSUserActivity* shareActivity = [[NSUserActivity alloc]
                initWithActivityType:NSUserActivityTypeBrowsingWeb];
            // ...
        }
    }
    // ... Twitter and generic share paths
}
```

`NSUserActivity` was introduced in 10.10. The Reminders integration — which passes a `NSUserActivity` with `NSUserActivityTypeBrowsingWeb` to the sharing service rather than a raw URL — is guarded inside a nested `OnYosemiteOrLater()` check. On 10.8–10.9, `NSSharingService` is available (the outer guard passes) but `NSUserActivity` does not exist (the inner guard blocks). The Reminders path is therefore simply skipped on Mountain Lion and Mavericks — sharing to Reminders would fall through to the generic `performWithItems:` path, which may or may not work correctly without the activity context, but will not crash.

This nested guard structure — an outer Mountain Lion check and an inner Yosemite check — cleanly stratifies three capability tiers: no sharing at all (10.7), basic sharing without activity-based Reminders (10.8–10.9), and full sharing with Reminders activity (10.10+).

---

#### 27.42. `widget/cocoa/nsMacUserActivityUpdater.mm`

**Summaries:**

A minimal, single-concern patch: entire body of `UpdateUserActivity` - function which responsible for publishing current browser page as an `NSUserActivity` for Handoff - is wrapped in a single `@available(macOS 10.10, *)` guard.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Feature excision**
3. **Build graph surgery**

**Explanation:**

A minimal, single-concern patch. The entire body of `UpdateUserActivity` — the function responsible for publishing the current browser page as an `NSUserActivity` for Handoff — is wrapped in a single `@available(macOS 10.10, *)` guard. On pre-10.10 systems the function returns `NS_OK` silently; the Handoff subsystem simply does not activate.

**The API boundary: `NSUserActivity` and `NSWindow.userActivity`**

Both `NSUserActivity` and the `userActivity` property on `NSWindow` (which is how Handoff attaches activity state to a window for cross-device continuity) were introduced in 10.10 (Yosemite). `NSUserActivityTypeBrowsingWeb` is the same constant bridged in patch 197 via `SDKDeclarations.h` — hence the added `#include "SDKDeclarations.h"` at the top of the file. Without that include, `NSUserActivityTypeBrowsingWeb` would be an undefined symbol on pre-10.10 build targets. The include ensures the compile-time constant definition from the centralised SDK-gap header is available here as well.

There is no `else` branch. Unlike patches 196 and 197 which either set a null state or return an error, this function simply returns `NS_OK` on pre-10.10 — the Handoff feature never existed on those platforms, so there is no state to initialise, no null to set, and no error to surface. The caller does not need to know whether Handoff was published.

---

#### 27.43. `widget/cocoa/nsMenuX.mm`

**Summaries:**

A surgical single-site patch. The assignment of `NSMenu.userInterfaceLayoutDirection` - the property which controls whether a menu's layour flows left-to-right or right-to-left - is wrapped in an `@available(macOS 10.12, *)` guard.

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Feature excision**

**Explanation:**

A surgical single-site patch. The assignment of `NSMenu.userInterfaceLayoutDirection` — the property that controls whether a menu's layout flows left-to-right or right-to-left — is wrapped in an `@available(macOS 10.12, *)` guard.

**The API boundary: `NSMenu.userInterfaceLayoutDirection`**

The `userInterfaceLayoutDirection` property on `NSMenu` was introduced in 10.12 (Sierra). On pre-10.12 systems the property does not exist; assigning to it would either produce a compile-time error (if the SDK lacks the declaration) or an Objective-C unrecognised selector exception at runtime.

The guard is correctly set at 10.12, not at any earlier version. On 10.7–10.11, the menu's layout direction is simply not set programmatically — it falls back to the system's global layout direction, which is the correct default behaviour for those versions. RTL menu support in macOS only became reliable and programmable at Sierra; before that, menu directionality was controlled at the system level.

**The comment**

i3roly's comment — *"markus added these around milestone 90a1, so anything beneath sierra is not going to handle these"* — is notable for two reasons. First, it attributes the original code to a named upstream contributor ("markus"), contextualising it as a deliberate feature addition at a specific Firefox milestone rather than an incidental API call. Second, it encodes the version floor directly in prose rather than relying solely on the `@available` guard to communicate intent. This is a pattern of **patch authorship traceability** — the comment documents not just what was changed and why, but who introduced the original code and when, which would help a future maintainer locate the upstream commit for reference.

There is no `else` branch. Pre-10.12, menus render with the system default direction — a silent, correct degradation with no user-visible failure mode other than the absence of explicit programmatic RTL control.

---

#### 27.44. `widget/cocoa/nsNativeThemeColors.h`

**Summaries:**

This patch transforms `nsNativeThemeColors.h` from a thin header containing only `NSAppearanceForColorScheme` into a **comprehensive colour and appearance utility** header — the centralised home for all version-stratified native colour lookup, toolbar rendering geometry, and accent colour resolution used across the `widget/cocoa` subsystem. It is the colour-system counterpart to `SDKDeclarations.h`'s role in bridging missing symbols.

**Taxonomy classification:**

1. **UI rendering restoration**
2. **Structural ABI bridge**
3. **Runtime API availability guard**
4. **Deprecation reversal**
5. **Build graph surgery**

**Explanation:**

This patch transforms `nsNativeThemeColors.h` from a thin header containing only `NSAppearanceForColorScheme` into a **comprehensive colour and appearance utility header** — the centralised home for all version-stratified native colour lookup, toolbar rendering geometry, and accent colour resolution used across the `widget/cocoa` subsystem. It is the colour-system counterpart to `SDKDeclarations.h`'s role in bridging missing symbols.

The changes divide into four distinct additions plus a modification of the existing function.

---

1. OS-versioned toolbar grey colour tables

```c
enum ColorName { toolbarTopBorderGrey, toolbarFillGrey, toolbarBottomBorderGrey };

static const int sSnowLeopardThemeColors[][2] = { {0xD0,0xF1}, {0xA7,0xD8}, {0x51,0x99} };
static const int sLionThemeColors[][2]        = { {0xD0,0xF0}, {0xB2,0xE1}, {0x59,0x87} };
static const int sYosemiteThemeColors[][2]    = { {0xBD,0xDF}, {0xD3,0xF6}, {0xB3,0xD1} };
```

Three lookup tables, each with three rows (top border, fill, bottom border) and two columns (active window, inactive window). Every entry is a greyscale byte value sampled from the actual macOS toolbar appearance across three design epochs:

- **Snow Leopard / pre-Lion** (10.6–10.6): the brushed-metal-era toolbar with darker, higher-contrast separators
- **Lion / post-Lion / pre-Yosemite** (10.7–10.9): the unified toolbar era with softer gradients
- **Yosemite and later** (10.10+): the flat design era with lighter fills and less contrast

The active/inactive column distinction captures macOS's longstanding behaviour of rendering toolbars with reduced contrast when the window is not in the foreground.

`NativeGreyColorAsInt` dispatches across these tables at runtime:
```objc
inline int NativeGreyColorAsInt(ColorName name, BOOL isMain) {
    if (nsCocoaFeatures::OnYosemiteOrLater()) return sYosemiteThemeColors[name][isMain ? 0 : 1];
    if (nsCocoaFeatures::OnLionOrLater())    return sLionThemeColors[name][isMain ? 0 : 1];
    return sSnowLeopardThemeColors[name][isMain ? 0 : 1];
}
```

`NativeGreyColorAsFloat` normalises to `[0,1]` for CoreGraphics, and `DrawNativeGreyColorInRect` performs the actual `CGContextFillRect` with the resolved colour — a complete rendering primitive in three lines.

These tables encode knowledge that is not obtainable from any Apple API or SDK: the exact pixel-sampled greyscale values of the toolbar appearance for each macOS design era. They are hardcoded from empirical measurement of the actual OS rendering, making them a pure instance of ℋ-layer knowledge crystallised into data.

---

2. `NSColor (NSColorControlAccentColor)` category forward declaration

```objc
#if !defined(MAC_OS_X_VERSION_10_14) || MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_14
@interface NSColor (NSColorControlAccentColor)
@property(class, strong, readonly) NSColor* controlAccentColor NS_AVAILABLE_MAC(10_14);
@end
#endif
```

`NSColor.controlAccentColor` was introduced in 10.14. On pre-10.14 SDKs the property declaration is absent from `AppKit.framework` headers. The category forward declaration teaches the compiler the selector's signature, guarded to avoid redefinition against the 10.14+ SDK where the declaration is already present. This is structurally identical to the `NSScroller(AvailableSinceLion)` and `NSWorkspace(AvailableSinceSierra)` declarations in patch 192 — a structural ABI bridge for a post-floor class property.

---

3. `ControlAccentColor()` inline helper

```objc
inline NSColor* ControlAccentColor() {
  if (@available(macOS 10.14, *)) {
    return [NSColor controlAccentColor];
  }
  return [NSColor currentControlTint] == NSGraphiteControlTint
      ? [NSColor colorWithSRGBRed:0.635 green:0.635 blue:0.655 alpha:1.0]
      : [NSColor colorWithSRGBRed:0.247 green:0.584 blue:0.965 alpha:1.0];
}
```

The pre-10.14 fallback branches on `currentControlTint`: graphite users get `(0.635, 0.635, 0.655)` — a neutral grey-blue; blue (default Aqua) users get `(0.247, 0.584, 0.965)` — a vivid blue sampled from the macOS 10.13 Aqua highlight colour. Both values are empirically sampled from the actual OS rendering. The `NSGraphiteControlTint` tint preference has been available since 10.0 and correctly differentiates users who have chosen the graphite appearance in System Preferences.

This function has already been referenced in multiple preceding patches (191, 192, 195, 197) — those patches called `ControlAccentColor()` without it being defined at the point of analysis, because its definition was deferred to this header. The function is now seen to be the resolution point for all those prior call sites.

---

4. `NSAppearanceForColorScheme` — two-level availability guard

```objc
inline NSAppearance* NSAppearanceForColorScheme(mozilla::ColorScheme aScheme) {
  if (@available(macOS 10.9, *)) {
    if (@available(macOS 10.14, *)) {
      NSAppearanceName appearanceName =
          aScheme == mozilla::ColorScheme::Light ? NSAppearanceNameAqua : NSAppearanceNameDarkAqua;
      return [NSAppearance appearanceNamed:appearanceName];
    }
    return [NSAppearance appearanceNamed:NSAppearanceNameAqua];
  }
  return nil;
}
```

The original function was a single unconditional call. The patch introduces two nested `@available` guards:

- **Pre-10.9**: `NSAppearance` did not exist — return `nil`.
- **10.9–10.13**: `NSAppearance` exists but `NSAppearanceNameDarkAqua` does not (dark mode arrived in 10.14) — always return the Aqua appearance regardless of `aScheme`.
- **10.14+**: Both appearances exist — dispatch on `aScheme` as before.

The three-tier structure correctly handles the full version range: pre-appearance era, appearance-without-dark-mode era, and full appearance era.

---

#### 27.45. `widget/cocoa/nsTouchBar.mm`

**Summaries:**

This patch is dominated by a single mechanical **syntax backport** transformation applied globally across the file, plus 2 targeted runtime availability guards for Auto Layour APIs.

**Taxonomy classification:**
1. **Syntax backport**
2. **Runtime API availability guard**
3. **Deprecation reversal** (minor)

**Explanation:**

1. Global NSDictionary/NSArray subscript syntax → message syntax

Every instance of Objective-C subscript syntax for `NSDictionary` and `NSArray` access is replaced with the equivalent message syntax:

| Subscript (modern) | Message (legacy-compatible) |
|---|---|
| `dict[key]` | `[dict objectForKey:key]` |
| `dict[key] = val` | `[dict setObject:val forKey:key]` |
| `array[i]` | `[array objectAtIndex:i]` |
| `array[i] = val` | `[array insertObject:val atIndex:i]` |

This transformation is applied at **14 distinct call sites** across the file, covering `self.mappedLayoutItems` (an `NSMutableDictionary`) and `self.scrollViewButtons` (also an `NSMutableDictionary`) and one `NSArray` access on `[potentialScrollView children]`. As established in the analysis of patch 195, subscript syntax on collection types requires the 10.8 SDK; `objectForKey:` and `objectAtIndex:` are available since `NSDictionary` and `NSArray` were introduced in NeXTSTEP. The transformation is semantically inert — behaviour is identical on all supported versions.

One site has a structural change beyond mere syntax: `orderedIdentifiers[i] = [convertedInput nativeIdentifier]` (assignment into an `NSMutableArray` by index) is replaced with:
```objc
if ([convertedInput nativeIdentifier]) {
    [orderedIdentifiers insertObject:[convertedInput nativeIdentifier] atIndex:i];
}
```
The `insertObject:atIndex:` substitution is not semantically equivalent to index assignment — inserting at index `i` shifts subsequent elements, while assigning by subscript replaces in place. However, this site operates on an array being built sequentially from scratch during initialization, where the indices and count are always aligned, so `insertObject:atIndex:i` with incrementing `i` is functionally equivalent to subscript assignment for this specific usage pattern. The added nil guard (`if ([convertedInput nativeIdentifier])`) is a defensive addition that also happens to be necessary because `insertObject:atIndex:` raises an `NSInvalidArgumentException` if passed a nil object — subscript syntax would have had the same crash behaviour, but the nil guard makes it explicit.

---

2. `setContentHuggingPriority:forOrientation:` — `OnLionOrLater()` guard

```objc
if (nsCocoaFeatures::OnLionOrLater()) {
    [button setContentHuggingPriority:1.0
                       forOrientation:NSLayoutConstraintOrientationHorizontal];
}
```

`-[NSView setContentHuggingPriority:forOrientation:]` is an Auto Layout method introduced in 10.7 (Lion). The guard `OnLionOrLater()` is technically always true for Momiji's stated deployment floor of 10.7 — but its presence is defensive and documents the API boundary explicitly. If the deployment floor were ever extended to 10.6 (Snow Leopard), this guard would become load-bearing. In its current form it documents intent rather than preventing a crash.

---

3. `NSLayoutConstraint.activateConstraints:` and scroll view construction — `OnLionOrLater()` guard

```objc
if (nsCocoaFeatures::OnLionOrLater()) {
    NSArray* hConstraints = [NSLayoutConstraint
        constraintsWithVisualFormat:layoutFormat
                            options:NSLayoutFormatAlignAllCenterY
                            metrics:nil
                              views:constraintViews];
    NSScrollView* scrollView = [[NSScrollView alloc]
        initWithFrame:CGRectMake(0, 0, size.width, size.height)];
    [documentView setFrame:NSMakeRect(0, 0, size.width, size.height)];
    [NSLayoutConstraint activateConstraints:hConstraints];
    scrollView.documentView = documentView;
    aScrollViewItem.view = scrollView;
}
```

`+[NSLayoutConstraint activateConstraints:]` was introduced in 10.10, not 10.7 — making the `OnLionOrLater()` guard here **under-protective**: it passes on 10.7–10.9 but the API it guards is not available until 10.10. This appears to be an oversight by i3roly: the correct guard for `activateConstraints:` should be `OnYosemiteOrLater()` (10.10+). The `NSTouchBar` class itself requires macOS 10.12.2, which means this entire file is only reachable on 10.12+, making the `OnLionOrLater()` check vacuously true in practice — any machine running 10.12 or later satisfies it. The under-protective guard is therefore harmless in the Momiji context but would be a latent bug if the guard were relied upon independently of the Touch Bar class's own version requirements.

---

#### 27.46. `widget/cocoa/nsTouchBarInput.mm`

**Summaries:**

A single line change. One `NSMutableArray` subscript assignment is replaced with the equivalent message syntax.

**Taxonomy classification:**
1. **Syntax backport**

**Explanation:**

```objc
// Modern (subscript, 10.8+ SDK):
orderedChildren[i] = convertedChild;

// Legacy-compatible:
[orderedChildren insertObject:convertedChild atIndex:i];
```

This is the same transformation applied globally in patch 201, here appearing in the companion `nsTouchBarInput.mm` file. The array `orderedChildren` is built sequentially in a loop with incrementing `i`, so `insertObject:atIndex:i` is functionally equivalent to index assignment for this construction pattern — the same reasoning that applied to the parallel site in patch 201.

---

#### 27.47. `widget/cocoa/nsTouchBarUpdater.mm`

**Summaries:**

A 2-change patch: a header include addition, a category forward declaration

**Taxonomy classification:**
1. **Structural ABI bridge**
2. **Build graph surgery**

**Explanation:**

1. `#include "nsTouchBarNativeAPIDefines.h"`

A new include of what is presumably a Touch Bar-specific SDK declaration header, analogous in purpose to `SDKDeclarations.h` but scoped to the Touch Bar subsystem. Its presence here follows the established pattern of routing all SDK-gap declarations through centralised headers rather than defining them inline per file.

`nsTouchBarNativeAPIDefines.h` declares, under a single `MAC_OS_X_VERSION_10_12_2` preprocessor guard, the complete set of Objective-C interfaces required to compile the Touch Bar subsystem:

- `NSApplication (TouchBarMenu)` — the customisation palette action
- `NSTouchBarItem` — the base item class, with `view` and `customizationLabel`
- `NSSharingServicePickerTouchBarItem` and its delegate protocol
- `NSCustomTouchBarItem`
- `NSTouchBar` itself — the core class, with `defaultItemIdentifiers`, `delegate`, `customizationIdentifier`, `customizationAllowedItemIdentifiers`
- `NSPopoverTouchBarItem` — the popover variant with full property surface
- `NSButton (TouchBarButton)` — the `bezelColor` extension

Every one of these is decorated with `__attribute__((weak_import))`.

---

2. `BaseWindow (NSTouchBarProvider)` category forward declaration

```objc
#if !defined(MAC_OS_X_VERSION_10_12_2) || \
    MAC_OS_X_VERSION_MAX_ALLOWED < MAC_OS_X_VERSION_10_12_2
@interface BaseWindow (NSTouchBarProvider)
@property(strong) NSTouchBar* touchBar;
@end
#endif
```

`NSTouchBar` and the `touchBar` property on `NSWindow` were introduced in macOS 10.12.2 — a **point release**, not a major version. The preprocessor guard checks against `MAC_OS_X_VERSION_10_12_2` specifically. On SDKs predating 10.12.2, `BaseWindow` (Firefox's `NSWindow` subclass) does not inherit a `touchBar` property declaration from `NSWindow`, so the compiler would be unable to resolve the property access. The category declaration bridges this gap: it announces to the compiler that `BaseWindow` responds to `touchBar` as a strong property, allowing the existing code that accesses `cocoaWin.touchBar` to compile cleanly against older SDKs.

The `NSTouchBar` type used in the property declaration is itself presumably declared via `nsTouchBarNativeAPIDefines.h` (the include added above) — otherwise this declaration would reference an undefined type.

---

## 28. `xpcom` subtree

### Files affected:
* `xpcom/base/MacStringHelpers.mm`
* `xpcom/base/nsMacPreferencesReader.mm`
* `xpcom/base/nsMacUtilsImpl.cpp`
* xpcom/io/CocoaFileUtils.mm
* `xpcom/threads/RWLock.h`
* `xpcom/threads/nsThread.cpp`

### `xpcom/base` cluster

#### 28.1. `xpcom/base/MacStringHelpers.mm`

**Summaries:**

This patch modifies the `CopyNSStringToXPCOMString` function, which is responsible for converting an `NSString` (Obj-C/Cocoa string type) into a Mozilla (`nsAString`) (XPCOM's abstract string type).

**Taxonomy classification:**
1. **Layered Runtime Library substitution**
2. **Preprocessor branch collapse**

**Explanation:**

This patch modifies the `CopyNSStringToXPCOMString` function, which is responsible for converting an `NSString` (Objective-C/Cocoa string type) into a Mozilla `nsAString` (XPCOM's abstract string type). The specific change is in the bounds-checking guard before the string length is committed:

**Before:**
```cpp
if (len > std::numeric_limits<nsAString::size_type>::max()) {
    aTo.AllocFailed(std::numeric_limits<nsAString::size_type>::max());
}
```

**After:**
```cpp
if (len > NSUIntegerMax) {
    aTo.AllocFailed(NSUIntegerMax);
}
```

The original code computes the upper bound via `std::numeric_limits<nsAString::size_type>::max()`, a C++ standard library template expression that queries the maximum value of the XPCOM string's internal size type. The replacement swaps this for `NSUIntegerMax`, the Cocoa/Foundation macro that represents the maximum value of `NSUInteger` — which is the same underlying type as the `len` variable itself (returned by `[aFrom length]`).

Both expressions resolve to the same value on any given architecture: on 32-bit systems both are `UINT32_MAX`; on 64-bit both are `UINT64_MAX`. The change is therefore semantically neutral but has meaningful compatibility implications (see below).

The reason this change is necessary on legacy macOS targets is that `std::numeric_limits` belongs to the `<limits>` header, and its usage in an Objective-C++ (`.mm`) compilation unit may interact poorly with older Clang/libc++ versions bundled with legacy SDKs — specifically around the interplay between `<limits>` template instantiation and the Objective-C++ compilation mode at toolchain versions targeting 10.7–10.11. Replacing it with the platform-native `NSUIntegerMax` macro sidesteps this entirely, anchoring the bound check in Foundation's own type system rather than in a C++ template facility that the legacy toolchain may not handle cleanly.

There is also a secondary correctness argument: since `len` is of type `NSUInteger`, comparing it against `NSUIntegerMax` (the ceiling of its own type) is more type-coherent than comparing it against the ceiling of `nsAString::size_type`, which is a Mozilla-internal typedef that may differ in size under unusual build configurations.

---

#### 28.2. `xpcom/base/nsMacPreferencesReader.mm`

**Summaries:**

This patch modifies a single expression inside `EvaluateDict`, a static helper function walking an `NSDictionary` and serialises its contents to JSON via Mozilla's `JSONWriter`.

**Taxonomy classification:**
1. **Syntax backport**

**Explanation:**

This patch modifies a single expression inside `EvaluateDict`, a static helper function that walks an `NSDictionary` and serialises its contents to JSON via Mozilla's `JSONWriter`. The function is part of `nsMacPreferencesReader`, the XPCOM component responsible for reading macOS system preferences (from `NSUserDefaults` / preference plists) and exposing them to the Gecko platform layer.

**Before:**
```objc
id value = aDict[key];
```

**After:**
```objc
id value = [aDict objectForKey:key];
```

These two forms are exactly semantically equivalent in Objective-C: the subscript notation `aDict[key]` is syntactic sugar introduced in **Clang/LLVM with Xcode 4.4 (2012)**, which desugars to a call to `objectForKey:` (for `NSDictionary`) or `objectAtIndexedSubscript:` (for `NSArray`). The subscript syntax requires compiler support for *Objective-C literals and subscripting*, a feature that was added to Clang relatively late and is not guaranteed to be available or well-behaved in older toolchains.

On the legacy macOS toolchain configurations targeting 10.7–10.11 — particularly with Apple's system Clang or early LLVM Clang builds available in those SDK eras — the subscript operator for collection objects may not be fully supported or may produce compiler warnings/errors. Replacing it with the explicit message-send form `[aDict objectForKey:key]` is the pre-subscript idiom that works across all Objective-C compiler versions, including those predating the literals extension.

---

#### 28.3. `xpcom/base/nsMacUtilsImpl.cpp`

**Summaries:**

This patch modifies `GetSignatureTypeImpl`, a function that inspects the code-signing status of a given binary path using Apple's Security framework.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Explanation:**

This patch modifies `GetSignatureTypeImpl`, a function that inspects the code-signing status of a given binary path using Apple's Security framework. The specific change affects how the `kSecCodeInfoFlags` constant — a `CFStringRef` key used to query code-signing flags from a `CFDictionary` returned by `SecCodeCopySigningInformation` — is accessed.

**Before:**
```cpp
CFNumberRef flagsRef =
    (CFNumberRef)CFDictionaryGetValue(signingInfo, kSecCodeInfoFlags);
```

**After:**
```cpp
static CFStringRef const* kSecCodeInfoFlagsStr =
    reinterpret_cast<CFStringRef*>(dlsym(((void*)-2), "kSecCodeInfoFlags"));
CFNumberRef flagsRef;
if (kSecCodeInfoFlagsStr) {
    flagsRef =
        (CFNumberRef)CFDictionaryGetValue(signingInfo, *kSecCodeInfoFlagsStr);
} else {
    flagsRef = nullptr;
}
```

Several technical details are worth unpacking carefully:

**`kSecCodeInfoFlags` as a weak/unavailable symbol.** On legacy macOS versions (specifically pre-10.8 or thereabouts), `kSecCodeInfoFlags` is not exported as a directly linkable symbol from the Security framework. It exists at runtime in later OS versions but is absent from or not properly exported in older SDKs. Direct reference to it at link time therefore causes either a link error or an unresolved symbol at runtime, depending on how the symbol was declared. The patch avoids the direct reference entirely.

**`dlsym((void*)-2, ...)` — the `RTLD_DEFAULT` sentinel.** The value `(void*)-2` is the numeric encoding of `RTLD_DEFAULT` on Darwin, the pseudo-handle that instructs `dlsym` to search all currently loaded images in the default symbol resolution order. This is functionally equivalent to writing `dlsym(RTLD_DEFAULT, "kSecCodeInfoFlags")` but avoids the need for `<dlfcn.h>` to define the constant properly — which is why `#include <dlfcn.h>` is added at the top of the patch: it provides the `dlsym` function declaration. The use of the raw numeric value `-2` rather than the macro name is a defensive move: on some legacy SDK configurations, `RTLD_DEFAULT` may not be defined or its definition may be inconsistent.

**Why `CFStringRef*` (pointer to pointer).** `kSecCodeInfoFlags` is not itself a `CFStringRef`; it is a globally exported `CFStringRef` variable — a pointer to a `CFStringRef`. When you `dlsym` a symbol like this, you get a pointer to the storage location of that variable, not the value itself. The `reinterpret_cast<CFStringRef*>` captures this correctly: `kSecCodeInfoFlagsStr` is a pointer to the `CFStringRef`, and `*kSecCodeInfoFlagsStr` dereferences it to get the actual key. The `static` qualifier ensures this resolution is performed only once (at first call), which is both correct and efficient since the symbol address does not change after dylib loading.

**Graceful degradation path.** The `else { flagsRef = nullptr; }` branch handles the case where the symbol is absent entirely (i.e., running on an OS version where it was never exported). The existing downstream logic already handles `flagsRef == nullptr` as "unsigned code," so the function degrades gracefully on old macOS without crashing.

The patch explicitly cites blueboxd's Chromium-legacy fork as the source of this technique, which is a rare and notable instance of cross-project knowledge transfer documented inline.

---

### `xpcom/threads` cluster

#### 28.4. `xpcom/threads/RWLock.h`

**Summaries:**

This patch modifies the class declaration of `StaticRWLock`, removing the `MOZ_ONLY_USED_TO_AVOID_STATIC_CONSTRUCTORS` annotation from its attribute set. 

**Taxonomy classification:**
1. **Build graph surgery**

**Explanation:**

This patch modifies the class declaration of `StaticRWLock`, removing the `MOZ_ONLY_USED_TO_AVOID_STATIC_CONSTRUCTORS` annotation from its attribute list. The trailing `MOZ_CAPABILITY("rwlock")` annotation is retained.

**What `MOZ_ONLY_USED_TO_AVOID_STATIC_CONSTRUCTORS` is.** This is a Mozilla-defined macro that expands to a Clang-specific attribute, typically `__attribute__((annotate("moz_only_used_to_avoid_static_constructors")))` or a similar mechanism, used in conjunction with Mozilla's static analysis plugin (`clang-plugin`) to enforce that a type annotated this way is only instantiated as a static-duration object — the specific pattern used to avoid the "static initialisation order fiasco." It is enforced at compile time by a custom Clang plugin that ships with Mozilla's build system, not by the compiler itself.

**Why it must be removed on legacy targets.** The Mozilla Clang plugin is a build-time static analysis tool that is compiled against and linked to a specific version of Clang's internal plugin API. On legacy macOS toolchain configurations, the Clang version in use is old enough that either: (a) the plugin cannot be built against it because the internal Clang API has changed incompatibly, or (b) the plugin is simply not available in the legacy build environment. When the plugin is absent, any annotation that it is responsible for enforcing becomes either a no-op or — depending on how the macro is defined in its absence — a syntax error or unknown attribute warning that escalates to an error.

The removal of `MOZ_ONLY_USED_TO_AVOID_STATIC_CONSTRUCTORS` is therefore a **build graph surgery** move: it strips a compile-time enforcement annotation whose enforcer (the Clang plugin) is not present in the legacy ℬ-layer, allowing the class declaration to compile cleanly without sacrificing the runtime behaviour of `StaticRWLock` itself. The `MOZ_CAPABILITY("rwlock")` annotation, which belongs to Clang's built-in thread-safety analysis (not the Mozilla plugin), is retained because it is supported natively by all relevant Clang versions.

Note the double space left between `class` and `MOZ_CAPABILITY` — a minor artefact of the removal, inconsequential but visible.

---

#### 28.5. `xpcom/threads/nsThread.cpp`

**Summaries:**

This patch modifies `nsThread::SetThreadQoS`, the method responsible for setting the Quality of Service (QoS) class of a thread on macOS.

**Taxonomy classification:**
1. **Runtime API availability guard**

**Explanation:**

This patch modifies `nsThread::SetThreadQoS`, the method responsible for setting the Quality of Service (QoS) class of a thread on macOS. The entire body of QoS-setting logic is wrapped in a `__builtin_available(macOS 10.10, *)` guard.

**What `pthread_set_qos_class_self_np` and its dependencies require.** The QoS class system (`QOS_CLASS_BACKGROUND`, `QOS_CLASS_USER_INTERACTIVE`, `QOS_CLASS_DEFAULT`, and the `pthread_set_qos_class_self_np` function itself) was introduced in macOS 10.10 (Yosemite) as part of Apple's Grand Central Dispatch and POSIX thread quality-of-service APIs. On macOS 10.7–10.9, neither the function nor the QoS class constants exist. Calling `pthread_set_qos_class_self_np` on these systems would result in an unresolved symbol at link time (if weakly linked) or a crash at runtime.

**`__builtin_available` as the guard mechanism.** The patch uses Clang's `__builtin_available` (equivalently `@available` in Objective-C contexts) to perform a compile-time-declared, runtime-evaluated OS version check. When compiled with a deployment target below 10.10 but a sufficiently modern SDK, `__builtin_available(macOS 10.10, *)` evaluates to false at runtime on 10.7–10.9 and true on 10.10+. This allows the binary to be built with a single SDK while correctly degrading at runtime depending on the executing OS version.

**The silent no-op fallback.** On systems where the guard evaluates to false (10.7–10.9), `SetThreadQoS` becomes a complete no-op. This is acceptable because: (a) 10.7–10.9 systems are exclusively Intel with homogeneous cores, so the QoS hint has no meaningful effect on scheduling behaviour anyway; and (b) the existing comment in the code already notes that "the OS will ignore the QoS state of the thread" on Intel. The degradation is therefore architecturally justified, not merely tolerated.

---

### 28.6. `xpcom/io/CocoaFileUtils.mm`

**Summaries:**

This patch implements a 3-part fix on `CocoaFileUtils.mm`, part of XPCOM's file I/O subsystem on macOS. The file handles file system operations including quarantine metadata — the system by which macOS marks files downloaded from the internet for Gatekeeper inspection. The patch addresses a specific API transition in how quarantine properties are keyed across OS versions.
1. Compile-time fallback definition
2. Runtime dispatch function `GetQuarantinePropKey()`
3. Call site substitution


**Taxonomy classification:**
1. **Layered Runtime Library Substitution**

**Explanation:**

This patch modifies `CocoaFileUtils.mm`, part of XPCOM's file I/O subsystem on macOS. The file handles file system operations including quarantine metadata — the system by which macOS marks files downloaded from the internet for Gatekeeper inspection. The patch addresses a specific API transition in how quarantine properties are keyed across OS versions.

**The two quarantine keys.** There are two distinct `CFStringRef` keys for accessing file quarantine properties in the macOS security/file system API:

- `kLSItemQuarantineProperties` — the older Launch Services key, available since macOS 10.5, accessed via `LSCopyItemAttribute` / `LSSetItemAttribute`
- `kCFURLQuarantinePropertiesKey` — the newer CFURL key, introduced in macOS 10.10, accessed via `CFURLCopyResourcePropertyForKey` / `CFURLSetResourcePropertyForKey`

The existing code unconditionally uses `kCFURLQuarantinePropertiesKey` with `CFURLCopyResourcePropertyForKey`. On macOS 10.7–10.9, `kCFURLQuarantinePropertiesKey` does not exist as a defined constant — neither as a symbol in the framework nor as a macro in the SDK headers when building against an older SDK. This creates two distinct problems: a compile-time missing constant (if the SDK doesn't define it) and a runtime failure (if the constant resolves to an unknown key that `CFURLCopyResourcePropertyForKey` doesn't recognise).

**The three-part fix:**

1. **Compile-time fallback definition** (lines 18–20): A preprocessor guard checks whether `MAC_OS_X_VERSION_10_10` is defined in the SDK and whether the maximum allowed SDK version is at least 10.10. If either condition fails — i.e., the SDK is too old to know about this constant — the patch manually defines `kCFURLQuarantinePropertiesKey` as a `CFSTR` literal with the string value `"NSURLQuarantinePropertiesKey"`. This is the actual string that the constant encodes in the Apple SDK, derived from its documented identity. The comment confirms the intent: coping with old SDK versions that lack the symbol.

2. **Runtime dispatch function** `GetQuarantinePropKey()` (lines 29–34): A new static helper function is introduced that returns the appropriate key at runtime based on OS version. On macOS 10.10+ (`OnYosemiteOrLater()`), it returns `kCFURLQuarantinePropertiesKey`; on 10.7–10.9, it returns `kLSItemQuarantineProperties`. This requires the new `#include "nsCocoaFeatures.h"` at the top, which provides the `nsCocoaFeatures::OnYosemiteOrLater()` runtime check.

3. **Call site substitution** (line 44): The hardcoded `kCFURLQuarantinePropertiesKey` argument is replaced with a call to `GetQuarantinePropKey()`, routing through the new dispatch function.

The design is layered: the compile-time guard ensures the constant is always defined (preventing build failure), and the runtime guard ensures the correct key is used for the running OS (preventing behavioural failure).

---

## 29. `xpfe/appshell/AppWindow.cpp`

**Summaries:**

This patch implements 3 technical changes:
1. `GetOuterToInnerSizeDifference`: API substitution
2. `GetOuterToInnerHeightDifferenceInCSSPixels`/`GetOuterToInnerWidthDifferenceInCSSPixels` branch removal
3. `MaybeSavePersistentPositionAndSize`: corresponding branch removal
4. `SizeShell`: boolean expression normalization

**Taxonomy classification:**
1. **Runtime API availability guard**
2. **Feature excision**
3. **Syntax backport**

**Explanation:**

1. Hunk 1 — `GetOuterToInnerSizeDifference`: API substitution (lines 387–393)

**Before:**
```cpp
return aWindow->NormalSizeModeClientToWindowSizeDifference();
```
**After:**
```cpp
LayoutDeviceIntSize baseSize(200, 200);
LayoutDeviceIntSize windowSize = aWindow->ClientToWindowSize(baseSize);
return windowSize - baseSize;
```

`NormalSizeModeClientToWindowSizeDifference()` is a method introduced at some point in modern Firefox that did not exist on older macOS widget backends. i3roly replaces it with `ClientToWindowSize()` — an older, more widely available widget API — and manually extracts the difference by applying it to a fixed probe size (200×200) and computing the delta. This is a pure **API availability guard**: the newer method is removed, and the semantics are reconstructed by a subtraction trick using a method that exists across a wider range of the codebase/OS backends.

The choice of 200×200 as a probe is pragmatic: it is large enough to be unambiguous and safely non-degenerate, since `ClientToWindowSize` could in principle behave strangely at zero or very small values.

---

1. Hunk 2 — `GetOuterToInnerHeightDifferenceInCSSPixels` / `GetOuterToInnerWidthDifferenceInCSSPixels`: Branch removal (lines 398–445)

**Before:** Both methods contained a conditional:
```cpp
if (mWindow && mWindow->PersistClientBounds()) {
    *aResult = 0;
} else {
    *aResult = GetOuterToInnerSizeDifferenceInCSSPixels(...).height; // or .width
}
```
**After:** The conditional is gone; both methods unconditionally call `GetOuterToInnerSizeDifferenceInCSSPixels`.

`PersistClientBounds()` is another method that does not exist in the widget interface on legacy macOS builds. The branch it guarded effectively short-circuited the size difference calculation to zero when the platform persisted client-area bounds rather than outer window bounds — a distinction that has meaning on certain modern platform-native window managers. On legacy macOS, this distinction either doesn't apply or was never present. Removing the branch eliminates the compilation dependency on `PersistClientBounds()` and restores a uniform calculation path.

---

1. Hunk 3 — `MaybeSavePersistentPositionAndSize`: Corresponding branch removal (lines 1931–1966)

**Before:**
```cpp
const bool isClient = mWindow->PersistClientBounds();
// ...
const LayoutDeviceIntRect innerRect =
    isClient ? rect : rect - GetOuterToInnerSizeDifference(mWindow);
```
**After:**
```cpp
LayoutDeviceIntRect innerRect =
    rect - GetOuterToInnerSizeDifference(mWindow);
```

This is the persistence-path consequence of the same `PersistClientBounds()` removal. The ternary that previously selected between raw `rect` (client-bounds mode) and the adjusted rect (outer-bounds mode) is collapsed: the adjusted path is now always taken, which is the correct behaviour when `ClientToWindowSize`-based difference computation is always applied.

Note also the `const` is dropped from the `innerRect` declaration — a minor but necessary syntactic adjustment once the right-hand expression is no longer a conditional expression over two `const`-compatible branches.

---

1. Hunk 4 — `SizeShell`: Boolean expression normalization (lines 2549–2553)

**Before:**
```cpp
Center(parentWindow, !parentWindow, false);
```
**After:**
```cpp
Center(parentWindow, parentWindow ? false : true, false);
```

These are semantically equivalent: `parentWindow ? false : true` is exactly `!parentWindow`. This is almost certainly a **compiler compatibility fix**: on older Clang or GCC versions targeting legacy macOS SDKs, the `!` operator applied to a pointer could trigger a warning (implicit conversion of pointer to bool in a context the compiler treats as narrowing), or conceivably an outright diagnostic that becomes an error under `-Werror`. The explicit ternary makes the boolean coercion unambiguous to the older compiler front-end.

---





<!-- spr -->

<!-- 

**Summaries:**

**Taxonomy classification:**

**Explanation:**

 -->