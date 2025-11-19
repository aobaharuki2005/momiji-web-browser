# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

profile-migrate-window =
    .title = Move profile
    .style = min-width: 480px

# Variables:
#   $profileName (String) - Name of the profile being migrated
profile-migrate-title = Move “{ $profileName }” to the profile menu?

profile-migrate-start = Moving this profile:

## Bulleted list outlining what will happen if a user moves this profile.
## Appears beneath string: "Moving this profile:" (profile-migrate-start)

profile-migrate-point1 = Will make it available in the <b>profiles</b> section of the { -brand-short-name } menu
profile-migrate-point2 = Will remove it from <b>about:profiles</b>
profile-migrate-point3 = May overwrite some settings. <a data-l10n-name="profile-migrate-link">Learn more</a>

##

profile-migrate-end = This move can’t be undone.
profile-migrate-accept = Move profile
