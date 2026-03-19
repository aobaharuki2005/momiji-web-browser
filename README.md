<span style="display:block;text-align:center">![Eclipse r3dfox](./docs/readme/banner.jpg)</span>

# Momiji Web Browser - macOS Legacy (10.7-10.14) support

Firefox browser backported and maintained for macOS 10.7-10.14.

Successor of [firefox-dynasty](https://github.com/i3roly/firefox-dynasty) - which has been, unfortunately, taken down due to Github violation of Term of Use. Details are at this [MacRumors post](https://forums.macrumors.com/threads/firefox-dynasty-firefox-for-os-x-10-8-also-web-app-templates.2446475/post-34441749).

Momiji（紅葉、もみじ）means "red leaves of autumn" in Japanese. I came up with the idea because the Japanese "mo" sound resembles the "mo" sound in the original "Mozilla Foundation" trademark. Additionally, red leaves also make people remind of old memories, so using such a name for this backported Firefox distribution, to my thought, is a good idea (maybe).

## Modifications

Here is a summary of modifications I have made to produce macOS 10.7-10.14-compatible Firefox distributions:
- Rust compiler patches (deployment target)
- Standard library patches (API compatibility)
- Build system modifications (framework linking)

*The above modifications are planned to be documented in [CHANGES.md](CHANGES.md) file, which is still being in progress. I will commit and make an update notice as soon as the documenting process is completed.*

## Trademarks
Firefox® is a registered trademark of the Mozilla Foundation.
This project is NOT AFFILIATED WITH, ENDORSED BY, OR SPONSERED by Mozilla Foundation.

## Disclaimer
This is an independent community project. Use at your own risk.
No warranty provided.

## Source Code
Full source code is available in this repository, as required
by the Mozilla Public License 2.0.

Modified file will be fully enlisted in [CHANGES.md](CHANGES.md) as soon as the documenting process has been completed.

## Credits

If I've forgotten to put your name here, please let me know and I'll add it.

[Mozilla Developers](https://github.com/mozilla-firefox) - Firefox browser base

[i3roly](https://github.com/i3roly) - Original ideas, patches and owners of firefox-dynasty project

[Wowfunhappy](https://github.com/Wowfunhappy) - Maintainers of the firefox-dynasty fork of the original project. Without his invaluable forked source, I wouldn't have been able to rebuilt, reverse engineered and revive the project from the scratch like today.

# Original repository readme

![Firefox Browser](./docs/readme/readme-banner.svg)

[Firefox](https://firefox.com/) is a fast, reliable and private web browser from the non-profit [Mozilla organization](https://mozilla.org/).

## Contributing

To learn how to contribute to Firefox read the [Firefox Contributors' Quick Reference document](https://firefox-source-docs.mozilla.org/contributing/contribution_quickref.html).

We use [bugzilla.mozilla.org](https://bugzilla.mozilla.org/) as our issue tracker, please file bugs there.

## Resources

* [Firefox Source Docs](https://firefox-source-docs.mozilla.org/) is our primary documentation repository
* Nightly development builds can be downloaded from [Firefox Nightly page](https://www.mozilla.org/firefox/channel/desktop/#nightly)

If you have a question about developing Firefox, and can't find the solution
on [Firefox Source Docs](https://firefox-source-docs.mozilla.org/), you can try asking your question on Matrix at
chat.mozilla.org in the [Introduction channel](https://chat.mozilla.org/#/room/#introduction:mozilla.org).
