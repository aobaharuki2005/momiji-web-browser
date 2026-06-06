/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_SandboxPolicyGMP_h
#define mozilla_SandboxPolicyGMP_h

#define MAX_GMP_TESTING_READ_PATHS 2

namespace mozilla {

static const char SandboxPolicyGMP[] = R"SANDBOX_LITERAL(
  (version 1)

  (define should-log (param "SHOULD_LOG"))
  (define app-path (param "APP_PATH"))
  (define plugin-path (param "PLUGIN_PATH"))
  (define macosVersion (string->number (param "MAC_OS_VERSION")))
  (define plugin-binary-path (param "PLUGIN_BINARY_PATH"))
  (define crashPort (param "CRASH_PORT"))
  (define hasWindowServer (param "HAS_WINDOW_SERVER"))
  (define testingReadPath1 (param "TESTING_READ_PATH1"))
  (define testingReadPath2 (param "TESTING_READ_PATH2"))
  (define isRosettaTranslated (param "IS_ROSETTA_TRANSLATED"))

  (define (moz-deny feature)
    (if (string=? should-log "TRUE")
      (deny feature)
      (deny feature (with no-log))))

  (moz-deny default)
  ; These are not included in (deny default)
  (if (>= macosVersion 1009)  
  (moz-deny process-info*))
  ; This isn't available in some older macOS releases.
  (if (defined? 'nvram*)
    (moz-deny nvram*))
  ; This property requires macOS 10.10+
  (if (defined? 'file-map-executable)
    (moz-deny file-map-executable))


  ; Needed for things like getpriority()/setpriority()/pthread_setname()
  (if (>= macosVersion 1009)  
  (begin 
        (allow process-info-pidinfo (target self))
        (allow process-info-pidinfo process-info-setcontrol (target self))))
  
  (if (defined? 'file-map-executable)
    (begin
      (if (string=? isRosettaTranslated "TRUE")
        (allow file-map-executable (subpath "/private/var/db/oah")))
      (allow file-map-executable file-read*
        (subpath "/System/Library")
        (subpath "/usr/lib")
        (subpath plugin-path)
        (subpath app-path)))
    (allow file-read*
      (subpath "/System/Library")
      (subpath "/usr/lib")
      (subpath plugin-path)
      (subpath app-path)))
  
  (if (defined? 'file-map-executable)
    (begin
      (when plugin-binary-path
        (allow file-read* file-map-executable (subpath plugin-binary-path)))
      (when testingReadPath1
        (allow file-read* file-map-executable (subpath testingReadPath1)))
      (when testingReadPath2
        (allow file-read* file-map-executable (subpath testingReadPath2))))
    (begin
      (when plugin-binary-path
        (allow file-read* (subpath plugin-binary-path)))
      (when testingReadPath1
        (allow file-read* (subpath testingReadPath1)))
      (when testingReadPath2
        (allow file-read* (subpath testingReadPath2)))))


  (if (string? crashPort)
    (allow mach-lookup (global-name crashPort)))

  (allow signal (target self))
  (allow job-creation (literal "/Library/CoreMediaIO/Plug-Ins/DAL"))
  (allow iokit-set-properties (iokit-property "IOAudioControlValue"))

    (allow mach-lookup
      ; bug 1655655
      (global-name "com.apple.trustd.agent"))

  (if (>= macosVersion 1008)
  (allow user-preference-read
    (preference-domain
        "kCFPreferencesAnyApplication"
        "com.apple.ATS"
        "com.apple.CoreGraphics"
        "com.apple.DownloadAssessment"
        "com.apple.HIToolbox"
        "com.apple.LaunchServices"
        "com.apple.MultitouchSupport" ;; FIXME: Remove when <rdar://problem/13011633> is fixed.
        "com.apple.QTKit"
        "com.apple.ServicesMenu.Services" ;; Needed for NSAttributedString <rdar://problem/10844321>
        "com.apple.WebFoundation"
        "com.apple.avfoundation"
        "com.apple.coremedia"
        "com.apple.crypto"
        "com.apple.driver.AppleBluetoothMultitouch.mouse"
        "com.apple.driver.AppleBluetoothMultitouch.trackpad"
        "com.apple.driver.AppleHIDMouse"
        "com.apple.lookup.shared"
        "com.apple.mediaaccessibility"
        "com.apple.networkConnect"
        "com.apple.security"
        "com.apple.security.common"
        "com.apple.security.revocation"
        "com.apple.speech.voice.prefs"
        "com.apple.systemsound"
        "com.apple.universalaccess"
        "edu.mit.Kerberos"
        "pbs" ;; Needed for NSAttributedString <rdar://problem/10844321>
    )))  

  (allow sysctl-read)
  (allow iokit-open (iokit-user-client-class "IOHIDParamUserClient"))
  (allow file-read*
      (literal "/etc")
      (literal "/dev/random")
      (literal "/dev/urandom")
      (literal "/usr/share/icu/icudt51l.dat"))

  ; Timezone
  (allow file-read*
    (subpath "/private/var/db/timezone")
    (subpath "/usr/share/zoneinfo")
    (subpath "/usr/share/zoneinfo.default")
    (literal "/private/etc/localtime"))

  (if (string=? hasWindowServer "TRUE")
    (allow mach-lookup (global-name "com.apple.windowserver.active")))
)SANDBOX_LITERAL";

}  // namespace mozilla

#endif  // mozilla_SandboxPolicyGMP_h
