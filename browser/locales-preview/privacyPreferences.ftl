# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

security-privacy-status-ok-header = { -brand-short-name } is on guard

# This is the header above a section telling the user about problems in their settings
# Variables:
#   $problemCount (Number) - Number of problems we have discovered in the user`s settings
security-privacy-status-problem-header = { $problemCount ->
      [one] { $problemCount } issue affecting your security and privacy
      *[other] { $problemCount } issues affecting your security and privacy
  }
security-privacy-status-ok-label = Your security and privacy are protected
security-privacy-status-problem-label = Some of your settings are affecting your security and privacy
security-privacy-status-problem-helper-label = See warnings below
security-privacy-status-pending-trackers-label = Looking up how many trackers we blocked over the last month

# This label tells the user how many trackers we have blocked for them.
# Variables:
#   $trackerCount (Number) - Number of trackers we have blocked in the last month
security-privacy-status-trackers-label = { $trackerCount ->
      [one] { $trackerCount } tracker blocked over the last month
      *[other] { $trackerCount } trackers blocked over the last month
  }
security-privacy-status-strict-enabled-label = You have <a data-l10n-name="strict-tracking-protection">strict tracking protection</a> enabled
security-privacy-status-up-to-date-label = { -brand-short-name } is up to date
security-privacy-status-update-needed-label = A new version of { -brand-short-name } is available.
security-privacy-status-update-error-label = { -brand-short-name } is having trouble updating itself
security-privacy-status-update-checking-label = { -brand-short-name } is checking for updates
security-privacy-status-update-needed-description = Update { -brand-short-name } to get the latest security updates
security-privacy-status-update-button-label =
  .label = Update { -brand-short-name }

security-privacy-issue-card =
  .heading = Security warnings
issue-card-reset-button =
  .label = Fix
issue-card-dismiss-button =
  .tooltiptext = Dismiss
  .aria-label = Dismiss

security-privacy-issue-warning-test =
  .label = A testing setting is enabled
  .description = This causes { -brand-short-name } to show this spurious warning, and nothing else
