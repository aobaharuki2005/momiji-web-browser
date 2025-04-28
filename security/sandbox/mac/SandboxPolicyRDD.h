/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_SandboxPolicyRDD_h
#define mozilla_SandboxPolicyRDD_h

namespace mozilla {

static const char SandboxPolicyRDD[] = R"SANDBOX_LITERAL(
  (version 1)
   ; see https://opensource.apple.com/source/WebKit2/WebKit2-7601.3.9/Resources/PlugInSandboxProfiles/com.apple.WebKit.plugin-common.sb.auto.html

  (define should-log (param "SHOULD_LOG"))
  (define app-path (param "APP_PATH"))
  (define macosVersion (string->number (param "MAC_OS_VERSION")))
  (define home-path (param "HOME_PATH"))
  (define crashPort (param "CRASH_PORT"))
  (define isRosettaTranslated (param "IS_ROSETTA_TRANSLATED"))
  (define resolving-regex regex)

  "    (define var-folders-re \"^/private/var/folders/[^/][^/]\")\n"
  "    (define var-folders2-re (string-append var-folders-re \"/[^/]+/[^/]\"))\n"
  "    (define (var-folders-regex var-folders-relative-regex)\n"
  "      (resolving-regex (string-append var-folders-re var-folders-relative-regex)))\n"
  "    (define (var-folders2-regex var-folders2-relative-regex)\n"
  "      (resolving-regex (string-append var-folders2-re var-folders2-relative-regex)))\n"
  
  (define (var-folders-regex var-folders-relative-regex)
    (resolving-regex (string-append var-folders-re var-folders-relative-regex)))
  (define (var-folders2-regex var-folders2-relative-regex)
    (resolving-regex (string-append var-folders2-re var-folders2-relative-regex)))

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
  ; The next two properties both require macOS 10.10+
  (if (defined? 'iokit-get-properties)
    (moz-deny iokit-get-properties))
  (if (defined? 'file-map-executable)
    (moz-deny file-map-executable))

  ;; OS X 10.7 (Lion) compatibility
  (if (<= macosVersion 1007)
    (begin
    (define ipc-posix-shm* ipc-posix-shm)
    (define ipc-posix-shm-read-data ipc-posix-shm)
    (define ipc-posix-shm-read* ipc-posix-shm)
    (define ipc-posix-shm-write-data ipc-posix-shm)))

  ; Needed for things like getpriority()/setpriority()/pthread_setname()
  (if (>= macosVersion 1009)
  (allow process-info-pidinfo process-info-setcontrol (target self)))

  (if (defined? 'file-map-executable)
    (begin
      (if (string=? isRosettaTranslated "TRUE")
        (allow file-map-executable (subpath "/private/var/db/oah")))
      (allow file-map-executable file-read*
        (subpath "/System")
        (subpath "/usr/lib")
        (subpath "/Library/GPUBundles")
        (subpath app-path)))
      (allow file-read*
        (subpath "/System")
        (subpath "/usr/lib")
        (subpath "/Library/GPUBundles")
        (subpath app-path)))


  (if (string? crashPort)
    (allow mach-lookup (global-name crashPort)))

  (allow signal (target self))
  (allow sysctl-read)
  (allow file-read*
    (literal "/dev/random")
    (literal "/dev/urandom")
    (subpath "/usr/share/icu"))

  ;; required for media decoding passing through rdd sandbox
  (allow file-read* 
    (subpath "/var")
    (subpath "/private/var/db/mds"))
  ;; the following line ensures all audio/video decoding can write to /private/var/folders/*/*/*/*/mds.lock
  ;; which is better than allowing the defaults through the sandbox to allow media playback
    "    (allow file-write* (var-folders2-regex \"/mds\\.lock\"))\n"
  
  ; Timezone
  (allow file-read*
    (subpath "/private/var/db/timezone")
    (subpath "/usr/share/zoneinfo")
    (subpath "/usr/share/zoneinfo.default")
    (literal "/private/etc/localtime"))

  (if (<= macosVersion 1009)
  (allow sysctl-read)
  (allow sysctl-read
    (sysctl-name-regex #"^sysctl\.")
    (sysctl-name "kern.ostype")
    (sysctl-name "kern.osversion")
    (sysctl-name "kern.osrelease")
    (sysctl-name "kern.osproductversion")
    (sysctl-name "kern.version")
    ; TODO: remove "kern.hostname". Without it the tests hang, but the hostname
    ; is arguably sensitive information, so we should see what can be done about
    ; removing it.
    (sysctl-name "kern.hostname")
    (sysctl-name "hw.machine")
    (sysctl-name "hw.memsize")
    (sysctl-name "hw.model")
    (sysctl-name "hw.ncpu")
    (sysctl-name "hw.activecpu")
    (sysctl-name "hw.byteorder")
    (sysctl-name "hw.pagesize_compat")
    (sysctl-name "hw.logicalcpu_max")
    (sysctl-name "hw.physicalcpu_max")
    (sysctl-name "hw.busfrequency_compat")
    (sysctl-name "hw.busfrequency_max")
    (sysctl-name "hw.cpufrequency")
    (sysctl-name "hw.cpufrequency_compat")
    (sysctl-name "hw.cpufrequency_max")
    (sysctl-name "hw.l2cachesize")
    (sysctl-name "hw.l3cachesize")
    (sysctl-name "hw.cachelinesize")
    (sysctl-name "hw.cachelinesize_compat")
    (sysctl-name "hw.tbfrequency_compat")
    (sysctl-name "hw.vectorunit")
    (sysctl-name "hw.optional.sse2")
    (sysctl-name "hw.optional.sse3")
    (sysctl-name "hw.optional.sse4_1")
    (sysctl-name "hw.optional.sse4_2")
    (sysctl-name "hw.optional.avx1_0")
    (sysctl-name "hw.optional.avx2_0")
    (sysctl-name "hw.optional.avx512f")
    (sysctl-name "machdep.cpu.vendor")
    (sysctl-name "machdep.cpu.family")
    (sysctl-name "machdep.cpu.model")
    (sysctl-name "machdep.cpu.stepping")
    (sysctl-name "debug.intel.gstLevelGST")
    (sysctl-name "debug.intel.gstLoaderControl")))

  (define (home-regex home-relative-regex)
    (regex (string-append "^" (regex-quote home-path) home-relative-regex)))
  (define (home-subpath home-relative-subpath)
    (subpath (string-append home-path home-relative-subpath)))
  (define (home-literal home-relative-literal)
    (literal (string-append home-path home-relative-literal)))
  (define (allow-shared-list domain)
    (allow file-read*
           (home-regex (string-append "/Library/Preferences/" (regex-quote domain)))))

  (if (<= macosVersion 1007)
   (allow ipc-posix-shm-read-data ipc-posix-shm-write-data
     (ipc-posix-name-regex "^/tmp/com.apple.csseed:")
      (ipc-posix-name-regex "^CFPBS:")
      (ipc-posix-name-regex "^AudioIO")))

  (allow mach-lookup
    (global-name "com.apple.CoreServices.coreservicesd")
    (global-name "com.apple.coreservices.launchservicesd")
    (global-name "com.apple.lsd.mapdb"))

  (allow file-read*
      (subpath "/Library/ColorSync/Profiles")
      (literal "/")
      (literal "/private/tmp")
      (literal "/private/var")
      (home-subpath "/Library/Colors")
      (home-subpath "/Library/ColorSync/Profiles"))

  (if (>= macosVersion 1013)
    (allow mach-lookup
      ; bug 1392988
      (xpc-service-name "com.apple.ViewBridgeAuxiliary")
      (xpc-service-name "com.apple.accessibility.mediaaccessibilityd")
      (xpc-service-name "com.apple.appkit.xpc.openAndSavePanelService")
      (xpc-service-name "com.apple.appstore.PluginXPCService") ; <rdar://problem/35940948>
      (xpc-service-name "com.apple.audio.SandboxHelper")
      (xpc-service-name "com.apple.coremedia.videodecoder")
      (xpc-service-name "com.apple.coremedia.videoencoder")
      (xpc-service-name-regex #"\.apple-extension-service$")
      (xpc-service-name "com.apple.hiservices-xpcservice")
      (xpc-service-name "com.apple.print.normalizerd")))

  (allow mach-lookup
       (global-name "com.apple.appsleep")
       (global-name "com.apple.bsd.dirhelper")
       (global-name "com.apple.cfprefsd.agent")
       (global-name "com.apple.cfprefsd.daemon")
       (global-name "com.apple.diagnosticd")
       (global-name "com.apple.espd")
       (global-name "com.apple.secinitd")
       (global-name "com.apple.system.DirectoryService.libinfo_v1")
       (global-name "com.apple.system.logger")
       (global-name "com.apple.system.notification_center")
       (global-name "com.apple.system.opendirectoryd.libinfo")
       (global-name "com.apple.system.opendirectoryd.membership")
       (global-name "com.apple.trustd")
       (global-name "com.apple.trustd.agent")
       (global-name "com.apple.xpc.activity.unmanaged")
       (global-name "com.apple.xpcd")
       (local-name "com.apple.cfprefsd.agent"))

  (if (>= macosVersion 1100)
    (allow mach-lookup
      ; bug 1655655
      (global-name "com.apple.trustd.agent")))

  ; Only supported on macOS 10.10+
  (if (defined? 'iokit-get-properties)
    (allow iokit-get-properties
      (iokit-property "board-id")
      (iokit-property "class-code")
      (iokit-property "vendor-id")
      (iokit-property "device-id")
      (iokit-property "IODVDBundleName")
      (iokit-property "IOGLBundleName")
      (iokit-property "IOGVACodec")
      (iokit-property "IOGVAHEVCDecode")
      (iokit-property "IOAVDHEVCDecodeCapabilities")
      (iokit-property "IOGVAHEVCEncode")
      (iokit-property "IOGVAXDecode")
      (iokit-property "IOAVDAV1DecodeCapabilities")
      (iokit-property "IOPCITunnelled")
      (iokit-property "IOVARendererID")
      (iokit-property "MetalPluginName")
      (iokit-property "MetalPluginClassName")))

  ; accelerated graphics
  (if (>= macosVersion 1008)
       (allow user-preference-read 
        (preference-domain "com.apple.opengl")
        (preference-domain "com.nvidia.OpenGL")))
  
  (allow mach-lookup
      (global-name "com.apple.cvmsServ"))
  (if (>= macosVersion 1014)
    (allow mach-lookup
      (global-name "com.apple.MTLCompilerService")))
  (allow iokit-open
      (iokit-connection "IOAccelerator")
      (iokit-user-client-class "IOAccelerationUserClient")
      (iokit-user-client-class "IOSurfaceRootUserClient")
      (iokit-user-client-class "IOSurfaceSendRight")
      (iokit-user-client-class "IOFramebufferSharedUserClient")
      (iokit-user-client-class "AGPMClient")
      (iokit-user-client-class "AppleGraphicsControlClient"))

  (if (>= macosVersion 1013)
   (allow mach-lookup
     (global-name "com.apple.audio.AudioComponentRegistrar"))
     (global-name "com.apple.assertiond.processassertionconnection"))

  ;; Various services required by AppKit and other frameworks
  (allow mach-lookup
      (global-name "com.apple.audio.AudioComponentRegistrar")
      (global-name "com.apple.assertiond.processassertionconnection")
      (global-name "com.apple.CoreServices.coreservicesd")
      (global-name "com.apple.DiskArbitration.diskarbitrationd")
      (global-name "com.apple.FileCoordination")
      (global-name "com.apple.FontObjectsServer")
      (global-name "com.apple.ImageCaptureExtension2.presence")
      (global-name "com.apple.PowerManagement.control")
      (global-name "com.apple.SecurityServer")
      (global-name "com.apple.SystemConfiguration.PPPController")
      (global-name "com.apple.SystemConfiguration.configd")
      (global-name "com.apple.UNCUserNotification")
      (global-name "com.apple.analyticsd")
      (global-name "com.apple.audio.audiohald")
      (global-name "com.apple.audio.coreaudiod")
      (global-name "com.apple.cfnetwork.AuthBrokerAgent")
      (global-name "com.apple.cmio.VDCAssistant")
      (global-name "com.apple.cookied") ;; FIXME: <rdar://problem/10790768> Limit access to cookies.
      (global-name "com.apple.coreservices.launchservicesd")
      (global-name "com.apple.fonts")
      (global-name "com.apple.lsd.mapdb")
      (global-name "com.apple.ocspd")
      (global-name "com.apple.pasteboard.1")
      (global-name "com.apple.pbs.fetch_services")
      (global-name "com.apple.tccd")
      (global-name "com.apple.tccd.system")
      (global-name "com.apple.tsm.uiserver")
      (global-name "com.apple.window_proxies")
      (global-name "com.apple.windowserver.active")
      (local-name "com.apple.tsm.portname")
      (global-name-regex #"_OpenStep$"))

)SANDBOX_LITERAL";

}  // namespace mozilla

#endif  // mozilla_SandboxPolicyRDD_h
