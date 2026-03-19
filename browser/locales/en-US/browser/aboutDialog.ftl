# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

aboutDialog-title =
    .title = About { -brand-full-name }

releaseNotes-link = What’s new

update-checkForUpdatesButton =
    .label = Check for updates
    .accesskey = C

update-updateButton =
    .label = Restart to Update { -brand-shorter-name }
    .accesskey = R

update-checkingForUpdates = Checking for updates…

## Variables:
##   $transfer (string) - Transfer progress.

settings-update-downloading = <img data-l10n-name="icon"/>Downloading update — <label data-l10n-name="download-status">{ $transfer }</label>
aboutdialog-update-downloading = Downloading update — <label data-l10n-name="download-status">{ $transfer }</label>

##

update-applying = Applying update…

update-failed = Update failed. <label data-l10n-name="failed-link">Download the latest version</label>
update-failed-main =
    Update failed. <a data-l10n-name="failed-link-main">Download the latest version</a>

update-policy-disabled = Updates disabled by your organization
update-noUpdatesFound = { -brand-short-name } is up to date
aboutdialog-update-checking-failed = Failed to check for updates.
update-otherInstanceHandlingUpdates = { -brand-short-name } is being updated by another instance

## Variables:
##   $displayUrl (String): URL to page with download instructions. Example: www.mozilla.org/firefox/nightly/

aboutdialog-update-manual-with-link = Updates available at <label data-l10n-name="manual-link">{ $displayUrl }</label>
settings-update-manual-with-link = Updates available at <a data-l10n-name="manual-link">{ $displayUrl }</a>

update-unsupported = You can not perform further updates on this system. <label data-l10n-name="unsupported-link">Learn more</label>

update-restarting = Restarting…

update-internal-error2 = Unable to check for updates due to internal error. Updates available at <label data-l10n-name="manual-link">{ $displayUrl }</label>

##

# Variables:
#   $channel (String): description of the update channel (e.g. "release", "beta", "nightly" etc.)
aboutdialog-channel-description = You are currently on the <label data-l10n-name="current-channel">{ $channel }</label> update channel.

warningDesc-version = { -brand-short-name } is experimental and may be unstable.

aboutdialog-help-user = { -brand-product-name } Help
aboutdialog-submit-feedback = Submit Feedback

# Phần nội dung thay đổi theo yêu cầu của bạn
community-exp = { -brand-full-name } (community build) version { aboutDialog-version }
community-2 = Based on Mozilla Firefox 140 ESR. Licensed under <label data-l10n-name="community-mozillaLink">MPL 2.0</label>. 
helpus = Source: <label data-l10n-name="helpus-getInvolvedLink">https://github.com/aobaharuki2005/momiji-web-browser</label>. This is an independent community project, not affiliated with Mozilla Foundation. 

aboutDialog-version = { $version } ({ $bits }-bit) 
aboutDialog-version-nightly = { $version } ({ $isodate }) ({ $bits }-bit)
aboutdialog-version-arch = { $version } ({ $arch })
aboutdialog-version-arch-nightly = { $version } ({ $isodate }) ({ $arch })