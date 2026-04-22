# Version 140.10.0esr-mj

## Bugfixes and Changes
- Disable build flag `ac_add_options --with-distribution-id=net.momiji` to bring back compatibility with profiles created from Momiji/Firefox-Dynasty 140.2.x and earlier. BE ATTENTION THAT Momiji 140.3.x profile will be rendered unusable due to this change.
- Disable sandbox (`ac_add_options --disable-sandbox`) to fix video player issues on macOS 10.7
- Disable Rust SIMD optimizations, replace `core2` with `nocona` arch optimizations, decrease optimization level from `-O3` to `-O2` to ensure compatibility with vintage models such as MacPro1,1 and Macpro2,1 which runing Intel Xeon 5000-series
- Instead of showing project repository site as the welcome page, `about:blank` will be shown instead. This gives users more comfort in the first startup.
- Disable telemetry services including Firefox Health Report `imply_option("MOZ_SERVICES_HEALTHREPORT", False)`, Normandy remote experiments and studies `imply_option("MOZ_NORMANDY", False)`, Installation Telemetries `def is_telemetry_enabled(settings): return False`
- Enable opening profiles used or created by newer Firefox versions (useful if you want to import data from Firefox-Dynasty v147, for example)
! ATTENTION: This changes does not guarantee success becuase database schema might have changed in newer Firefox versions. If crash occurs, it's recommend that you clean up your Firefox/Momiji profile directory and make a fresh start.
- Apply miscellaneous privacy patches from Librewolf and IceCat - but not including disabling Firefox account functions

    - `remove-pingsender.patch`
    - `remove-openai.patch`
    - `rs-blocker.patch`
    - `privacy-preferences.patch`
    - `stop-undesired-requests.patch`
    - `firefox-view.patch`
    - `handlers.patch`
    - `remove-cfrprefs.patch`
    - `hide-default-browser.patch`
    - `hide-finish-setup-bookmark.patch`
    - `remove-organization-policy-banner.patch`
    - `hide-protection-dashboard.patch` (IceCat)

## Security patches

Applied [MFSA 2025-83: CVEs fixed in Firefox ESR 140.4](https://www.mozilla.org/en-US/security/advisories/mfsa2025-83/)
- 0af041b4294af Bug 1986142 - Fix lint warnings. a=me DONTBUILD
- c8e6b3801c214 Bug 1986142 - [devtools] Properly escape all new lines characters (make sure no carraige returns) a=RyanVM
- e2d46879fa9ca Bug 1990970. r=gfx-reviewers,ahale a=RyanVM
- b6af1bdf042e5 Bug 1991040. r=gfx-reviewers,aosmond,ahale a=RyanVM
- fa777865b588a Bug 1989978: Don't support unwritable iterator indices  a=RyanVM
- 1e0317aa80b4d Bug 1989899. r=ahale a=RyanVM
- 312d909cd8f49 Bug 1973699, modernize nsDocShell accesses a bit,  a=RyanVM DONTBUILD
- ce0b8a6e422cb Bug 1989945. r=ahale a=dmeehan
- 11829818fa939 Bug 1988931 use GetInstanceIfExists() from MediaTrackGraphImpl::GetInstance()  a=dmeehan DONTBUILD
- 27b976ad7f1bf Bug 1979536 - Align <object> type attribute behavior closer with other browsers.  a=dmeehan
- bfac3b3d31abe Bug 1989127. r=ahale a=dmeehan
- 9121587c58010 Bug 1991899 - Use RecordedEventArray for variable-sized recording data. r=aosmond a=RyanVM
- dcb678f8654e3 Bug 1991899 - Only use dash pattern storage when necessary. r=aosmond a=RyanVM
- 7d396ff5b4c8d Bug 1988244 - Guard the space-features bit vectors with the feature-info mutex.  a=RyanVM DONTBUILD
- c6927dad6de45 Bug 1990085 - Improve enum serialization in gfx. r=lsalzman a=RyanVM
- 27566fec3083d Bug 1983838: Provide a default convertType implementation. r=ahale a=RyanVM
- 5467b82c15b7c Bug 1989734 - use the index to find the first SPS. r=media-playback-reviewers,karlt a=RyanVM
- ac301ae584fdb Bug 1988912. r=ahale a=dmeehan  [NEEDS REVIEW]
- fdb7d96e3c2c5 Bug 1987624 - wasm: Refactor GetBufferSource.  a=dmeehan DONTBUILD

Applied [MFSA 2025-88: CVEs fixed in Firefox ESR 140.5](https://www.mozilla.org/en-US/security/advisories/mfsa2025-88/)
- 39315e05a8431 Bug 1991458.  a=pascalc
- d4a199cc60c78 Bug 1992130 - Fix arguments types for std::copy.  a=pascalc
- 19a6662a64ec8 Bug 1980904 - Deny notification requests for all cross origins  a=RyanVM
- c4b28fcae36c6 Bug 1984940: Make sec-fetch user-triggered check default to secure  a=RyanVM
- 6fd1decc16ca0 Bug 1988412 - Update the RemoteWorkerData on main thread.  a=RyanVM
- 16d805c5e86b7 Bug 1991945. r=farre a=pascalc
- 3f6ceff21f7bd Bug 1995686 - Pass copies to SendCaptureEnded. r=jib,grulja a=RyanVM
- dc1fd8e886e6d Bug 1994241.  a=pascalc

Applied [MFSA 2025-94: CVEs fixed in Firefox ESR 140.6](https://www.mozilla.org/en-US/security/advisories/mfsa2025-94/)
- 22dbfbfd9e593 Bug 1992760: Clean this up, and mark a test as long.  a=RyanVM
- ae6420afdc155 Bug 1996473. r=ahale a=RyanVM
- 9fc332059eeff Bug 1996555 - Use the TriggeringPrincipal if we have one, not the SystemPrincipal,  a=diannaS
- e265a5999bc75 Bug 1996840 - Part 1: (Drive-by) Append InstSize factor for secondaryVeneers. r=nbp a=dmeehan
- 77f74108208f2 Bug 1998050 - Check for typed array index in canAttachAddSlotStub.  a=diannaS
- a6f3bf0d1ba9b Bug 1996761 - [devtools] Replace any other whitespace like characters with space  a=dmeehan
- 14e726f69c86c Bug 1997018 - [devtools] Stop escaping Unicode control (non-printable) characters with caret(^)  a=dmeehan
- f299259c327ba Bug 1997503 - [riscv64] Supply good tag shift to ExtractBits when unboxing for GC barrier. r=jandem, a=dsmith
- f47b1cd29b0a9 Bug 2000218  a=dmeehan DONTBUILD
- 32eecc12a6998 Bug 1966501 - Check fd is open before use (esr),  a=dmeehan DONTBUILD
- a7d25db0d19e3 Bug 1997639 - Set error on early returns,  a=dmeehan

Applied [MFSA 2026-03: CVEs fixed in Firefox ESR 140.7 and 140.7.1](https://www.mozilla.org/en-US/security/advisories/mfsa2026-03/)
- 8aacae20cdf59 Bug 1999257: Add PermissionsPolicy to LoadInfoArgs  a=diannaS
- 1ed7a8a23b2b3 Bug 2003989. r=ahale a=RyanVM
- 6999e63158272 Bug 2004602. r=aosmond a=RyanVM
- 2c4cdb7809f4d Bug 2005014. r=aosmond a=RyanVM
- 50271eda148d5 Bug 1924125 - Avoid memmove for STL types through nsTHashtable,  a=RyanVM
- e12fe1d63ecad Bug 1970743 - consolidate DownloadUtils.getURIHost into BrowserUtils.formatURIForDisplay,  a=RyanVM
- 42feb69fa32d0 Bug 2003588 - Continue to allow creation of CCWs to debugger instances after CCWs have been nuked  a=RyanVM
- fd88be60b04c6 Bug 2003607 - Set majorFinishedWhileMinorSweeping when aborting major sweeping (ESR140)  a=RyanVM
- 29aa5a848fb37 Bug 2005658. r=aosmond a=RyanVM DONTBUILD
- 31a35f3269c8f Bug 2006500 - Don't load external css resources when loading a pdf  a=RyanVM
- ecffefcb1c6d3 Bug 2000981 - Deal with clamping to end of block. r=jfkthame,layout-reviewers a=dmeehan
- 0552e94c929f5 Bug 2003100 - Suppress GC during wrapper remapping  a=RyanVM
- 73ec99872ea34 Bug 2003278 - Have a SortBoundsCheck option for nsTArray Sort and StableSort.  a=RyanVM
- 45e0cda30d01f Bug 2014390 r=media-playback-reviewers,padenot a=dmeehan

Applied [MFSA 2026-15: CVEs fixed in Firefox ESR 140.8](https://www.mozilla.org/en-US/security/advisories/mfsa2026-15/)
- 59208f5bac160 Bug 2001637 - Ensure valid image size.;  a=dmeehan DONTBUILD
- c0b9bad2e0c40 Bug 2009608 - Don't assign non-live hash table entry r=glandium a=dmeehan
- 8b48aacb195e1 Bug 2010933. Do better error checking for AVIFDecoderStream.  a=dmeehan DONTBUILD
- 92e365ac9f7a9 Bug 2011062: Reject negative origin or stride in YUV-to-RGB conversion.  a=dmeehan DONTBUILD
- 2767fd163a878 Bug 2011063: Reject snapshots for unsupported formats. r=gfx-reviewers,jnicol a=dmeehan
- 243bc15c00042 Bug 2011649: Handle too large strings early. r=jandem a=dmeehan DONTBUILD
- 7777b729fc5bb Bug 2012018 - Simplify property lookup in SuppressDeletedProperty.  a=dmeehan DONTBUILD
- 12c49cacb48ca Bug 2012608: Create this after pushing arguments (esr140) r=jandem a=dmeehan DONTBUILD
- eac910521b1b1 Bug 2013562: Enter correct realm before resolving same-thread waitAsync promise  a=dmeehan
- 3f78a4ff83b9c Bug 2013583 - Mark ICScripts as active when cloning stubs.  a=dmeehan DONTBUILD
- 4d910cdf25caf Bug 2013741: Clean up misleading comments in array.fill.  a=dmeehan
- 000cad29dffc8 Bug 2014101: Separate validation step for better readability.  a=dmeehan DONTBUILD
- 80b1263869753 Bug 2014550: Reset FileInfoEntry::mSavepointDelta after the rollback.  a=dmeehan DONTBUILD
- 2f10fab058252 Bug 2014585 - Keep construction depth for custom elements in sync.  a=dmeehan DONTBUILD
- 0ff2e3ccf2300 Bug 2014593, do an explicit null check before AsElement(),  a=dmeehan
- 0ff33e7cd0b62 Bug 2014827 - Update mp4parse-rust to 25ebfa59a21dc0d223052d73a2fafdd55307c2d7.   a=dmeehan DONTBUILD
- 2186e660e2690 Bug 2014832 -  a=dmeehan DONTBUILD
- 13d4f1ca423b1 Bug 2014883.  a=dmeehan DONTBUILD
- 5961120efc1cc Bug 2015199.  a=dmeehan DONTBUILD
- 946b8b5d56841 Bug 2015266  a=dmeehan DONTBUILD
- 939c833ffb2bd Bug 2015305  a=RyanVM
- b66208edc8a4f Bug 2016358 - Use Span in ReadStructuredCloneInternal.  a=dmeehan DONTBUILD
- 53618d3e93d78 Bug 1164141 - Handle SIGBUS when fd->mMap is null  a=dmeehan DONTBUILD [NEED REVIEW]
- 0446fb2a66db3 Bug 1164141: ZipArchive cleanup r=necko-reviewers,valentin [NEED REVIEW]
- e945a47b24906 Bug 2007829 - Fix linter warning. a=me DONTBUILD
- ea0710f604545 Bug 2007829 - [devtools] Escape the slashes properly  a=dmeehan DONTBUILD
- 60e0fcccbaffb Bug 2010743 - [devtools] Avoid prototype pollution when parsing form data  a=dmeehan
- d8ed7cb0b2bc7 Bug 2010943: Support reading int64 from int32 stack slot  a=dmeehan DONTBUILD
- d6da621532225 Bug 2012984 - Use the ClientInfo for fetch with keepalive.  a=dmeehan DONTBUILD
- 88809d9c9b3a6 Bug 2013549 - Give synthetic module environments a *namespace* property the same as for cyclic modules  a=dmeehan DONTBUILD
- 3cdb31e13023c Bug 2013612 - Fix lint failure a=me DONTBUILD
- f45b0dbc08e81 Bug 2013612 - Fix global object tracing for Rooted<Realm*>.  a=dmeehan DONTBUILD
- e23ce93f7c6a0 Bug 2014560, modernize some old WindowWatcher code,  a=dmeehan DONTBUILD
- fe37df3169958 Bug 2014824 - Add crashtest.  a=dmeehan DONTBUILD
- b274f6c2bb74a Bug 2014824 - Runtime check args.  a=dmeehan DONTBUILD
- 2fcaef772ff20 Bug 2015179. In image SourceBuffer, don't set the capacity of a chunk to zero, just remove the chunk.  a=dmeehan DONTBUILD
- ce51bdd0712c5 Bug 2008912 - (ESR140) New checks for synced contexts  a=dmeehan DONTBUILD
- 4bfb2e515d99c Bug 2010050.  a=dmeehan. DONTBUILD
- 416c8b687d9f5 Bug 2010275 - Pass XML_Status and XML_Error across the RLBox barrier as int.  a=dmeehan DONTBUILD
- 8fad84ec8b28b Bug 2012331 - ensure consistent MediaKeys lifetime  a=dmeehan DONTBUILD
- f256c28527099 Bug 2015196. r=bradwerth a=dmeehan DONTBUILD
- 4ae24b905d79e Bug 2016423. r=ahale a=dmeehan DONTBUILD
- 44ed1ce4f9365 Bug 2016498 - Fix Span::Subspan assertion.  a=dmeehan DONTBUILD

Applied [MFSA 2026-22: CVEs fixed in Firefox ESR 140.9](https://www.mozilla.org/en-US/security/advisories/mfsa2026-22/)
- 84a2e822b3814 Bug 2011129: Make WebRenderBridgeParent::RecvSetDisplayList and ::RecvEmptyTransaction skip duplicate operations.  a=RyanVM
- 11a9a63a770ac Bug 2016349. r=ahale a=RyanVM
- 2a20ec3a63488 Bug 2016351. r=ahale a=RyanVM
- 8b77ca580ab35 Bug 2016368  a=pascalc DONTBUILD
- 7a166b4d277c8 Bug 2016373 ESR140: Ensure the correct doc and id when setting the embedder.  a=RyanVM
- ccf5bc86f4f5c Bug 2016374 - Add more checks to InputStream IPC,  a=pascalc
- 2441dbbb858a1 Bug 2016375 - Part 1: Add more validation to SnappyUncompressInputStream,  a=pascalc
- 493a0f074783c Bug 2017512 - Sanity check adopted stylesheet setters / deleters.   a=pascalc DONTBUILD
- 6eae7527b7619 Bug 2017643 - Prevent toggling RDM BrowsingContext flag from content processes. a=pascalc
- 0e05145e3fc76 Bug 2018102 validate alpha plane for VideoData::CreateAndCopyData()  a=pascalc DONTBUILD
- 2b451552de0d6 Bug 2018102 validate chroma plane strides for VideoData::CreateAndCopyData()  a=pascalc DONTBUILD
- 2a1dccb9d8118 Bug 2018430: Make WebRenderBridgeParent::RecvGetSnapshot reject invalid buffer sizes.  a=RyanVM DONTBUILD
- 1c76ee596c5c6 Bug 2020030. a=RyanVM
- 484a564460feb Bug 2020190. r=layout-reviewers,firefox-style-system-reviewers,dshin a=RyanVM DONTBUILD
- 7b5c30b335c78 Bug 2020906 - Improve FoldTests pattern matching.  a=pascalc DONTBUILD
- e4b54782e025d Bug 2021863 - Cherry-pick 'stch' fixes #5808 and #5823 from harfbuzz upstream.  a=RyanVM
- 9d9a687562147 Bug 2009303 - Check the corresponding script before trying to get DebugScript.  a=pascalc
- 4bdc84018a4b1 Bug 2013560: Handle force return at yield opcodes  a=RyanVM DONTBUILD
- 16525eda5d587 Bug 2014868 - Reject SDP when media type changes at m-line index.;  a=pascalc
- a98a850aecdbb Bug 2015091: Define constant for Filter channel count, and validate against it.  a=RyanVM DONTBUILD
- feb7457aaa450 Bug 2015267.  a=RyanVM
- a7430c72ac5b7 Bug 2016329 - Rework CheckFrameData  a=pascalc DONTBUILD
- 7597d6a40a837 Bug 2018113. a=pascalc
- 6f7122e0b10d4 Bug 2018113. a=pascalc
- 1245506dc4248 Bug 2018405. (esr140) r=pascalc a=pascalc
- 059996e56f790 Bug 2018592: Combine code paths in ResizableArrayBufferObject::copy.  a=pascalc
- 575caf464c0af Bug 2021695 - [devtools] Escape URL when doing a copy as fetch  a=RyanVM
- 78c14c97bb6a3 Bug 2004652  a=RyanVM DONTBUILD [NEEDS REVIEW]
- 6fc714ca4c9f0 Bug 2019372 - Clear native key bindings of the reply event  a=pascalc DONTBUILD
- ffbf058a42492 Bug 2021922 - Check isValid before accessing Host()  a=RyanVM DONTBUILD
- 04a56c28ec59e Bug 2022567 - Check URL bounds before old_param in nsStandardURL::ReadPrivate  a=RyanVM DONTBUILD
- 02c3a5ff4e4ec Bug 2022733 - WebTransportSessionProxy::mServerCertHashes cleanup,  a=pascalc DONTBUILD
- 2526dc9b15e23 Bug 2013762: Make table loads immovable.  a=pascalc DONTBUILD
- 49145d2df8b1f Bug 2015291 - Make nsImageToPixbuf::SourceSurfaceToPixbuf() support more SurfaceFormat;  a=pascalc
- 353f411e600fc Bug 2016591: Ensure the correct acc type when creating a RemoteAccessible.  a=RyanVM
- 97efd7fe51a9b Bug 2016661 - Don't allow attaching already parented remote accessibles.  a=RyanVM
- 2f30573e0a395 Bug 2016664 - Cycle check children so they don't get added to themselves.  a=RyanVM
- baee8c30b8a1a Bug 2017303. r=ahale a=pascalc
- 62b13bec677f9 Bug 2017894: Make ImageBridgeParent::RecvUpdate skip duplicate operations.  a=RyanVM
- e251ee1adbfef Bug 2018090. Validate surface better in BrowserParent::RecvInvokeDragSession.  a=pascalc
- 18e8ead4494a3 Bug 2018196 - Ensure RemoteWorkerController::SetServiceWorkerWaitingFlag() is only called for ServiceWorker.  a=pascalc DONTBUILD
- 3ab2fa2ca7b1d Bug 2018379 - Refactor the mozilla::ErrorResult IPC serializer.  a=RyanVM DONTBUILD
- 25998877a4fa8 Bug 2019112 - Fold the prompt message into ContentPermissionRequest construction.  a=pascalc
- 82c8b1568a1f7 Bug 2022090 - Do not continue when it is not expected.  a=pascalc DONTBUILD
- 188678c730aa2 Bug 2022243 - Avoid deserializing invalid surface descriptors when sent cross process.  a=RyanVM
- 313f574c3be3e Bug 2022351 - Check upload totalRows.  a=RyanVM
- 0e460e0cd31a9 Bug 2022478 - Improve localstorage state machine.  a=RyanVM
- 0e3e954634ac0 Bug 2022676.  a=RyanVM DONTBUILD

Applied [MFSA 2026-27: CVEs fixed in Firefox ESR 140.9.1](https://www.mozilla.org/en-US/security/advisories/mfsa2026-27/)
- 43baef0129fec Bug 2017867 - [OTS] Use CheckOffset() to validate private dict range.  a=diannaS DONTBUILD
- 6f8a5bf53f3db Bug 2026426. Update libpng to v1.6.56.  a=RyanVM

Applied [MSFA 2026-32: CVEs fixed in Firefox ESR 140.10](https://www.mozilla.org/en-US/security/advisories/mfsa2026-32/)
- c797207d82d8a Bug 2025883 - Fix AudioData.copyTo() planar-to-interleaved not applying frame offset.  a=diannaS       [NEEDS ATTENTION]   [dom/media/webcodecs]
- fca5960955b85 Bug 2025883 - Fix AudioData.copyTo() interleaved-to-interleaved incorrect frame offset calculation.  a=diannaS  [NEEDS ATTENTION]   [dom/media/webcodecs]
- 1e60fdadcdbef Bug 2025883 - Pass source frames-per-channel to AudioData CopySamples.  a=diannaS   [NEEDS ATTENTION]   [dom/media/webcodecs]
- 15333a50169c4 Bug 2025883 - Fix VideoFrame.copyTo() using incorrect stride for YUV surfaces.  a=diannaS   [NEEDS ATTENTION]   [dom/media/webcodecs]
- cf2e7fa217d89 Bug 2022604 - Fix VideoFrame.copyTo() using incorrect stride for RGB surfaces.  a=diannaS   [NEEDS ATTENTION]   [dom/media/webcodecs]
- cdabf369c59b0 Bug 2024220 - IDB database must return a sorted list.  a=diannaS DONTBUILD  [NEEDS ATTENTION]   [dom/indexedDB/]
- 6c1058b7651aa Bug 2027541 - mochitest-plain test for ESR140.  a=RyanVM
- e6c60dfb683cf Bug 2027541 - Patch for ESR140.  a=RyanVM
- 67c6967c67953 Bug 2013588 - Add an onPopWasm function for wasm debug frames.  a=RyanVM DONTBUILD [NEEDS ATTENTION]    [js/loader]
- 93111bf77c3bd Bug 2027499 - Use rtc::ArrayView instead of std::span for C++17 compat. r=mjf, a=bustage   [NEEDS ATTENTION] [third_party/libwebrtc/modules/rtp_rtcp/source]
- d1a8622a3425e Bug 2027499 - adhere to spec on number of CSRCs in rtp packets.  a=RyanVM DONTBUILD [NEEDS ATTENTION] [third_party/libwebrtc/modules/rtp_rtcp/source]
- 6baa90b79aea8 Bug 2023753 - [devtools] Remove the use of dangerouslySetInnerHTML in the Quickopen panel  a=RyanVM DONTBUILD
- 2399749c32341 Bug 2021666.  a=RyanVM DONTBUILD    [NEEDS ATTENTION]   [toolkit/components/reputationservice, xpcom/io]
- 147d5f6d51528 Bug 2023407: Force WR pixel capture to use specific known directory.  a=dmeehan DONTBUILD   [NEEDS REVIEW]   [gfx/layers/wr, dom/base, dom/interfaces/base]  
- c32f42bfbd7a6 Bug 2027501 - fix fast recovery retransmission logic.  a=diannaS DONTBUILD  [NEEDS ATTENTION] [third_party/libwebrtc/net/dcsctp/tx/outstanding_data.cc]
- 3088fd8257ee8 Bug 2022162 - Validate HID report length in GamepadRemapper::ProcessTouchData.  a=diannaS   [NEEDS ATTENTION]   [dom/gamepad]
- 50bad1148cf5a Bug 2021769: Simplify the CC setup for these classes.  a=diannaS DONTBUILD      [NEEDS ATTENTION]   [dom/media/webrtc/jsapi]
- 44de7a509ff32 Bug 2022610.  a=diannaS DONTBUILD
- 42c7c597817a4 Bug 2014596 - Fix manual slot reassignment across different shadow roots.  a=diannaS    [NEEDS REVIEW]   [dom/html]
- 3c404b7a562bf Bug 2021080 - Display top level site in information box  a=dmeehan
- 159c744c76eda Bug 2017857 - Enforce prefs for dom TCP and UDP sockets  a=dmeehan DONTBUILD
- a869c16cc7977 Bug 2025067 - CSP: With 'strict-dynamic' disallow XSLT by default.  a=dmeehan
- 7e8b41120d680 Bug 2022419 - improve FormAutofill handlers  a=dmeehan DONTBUILD
