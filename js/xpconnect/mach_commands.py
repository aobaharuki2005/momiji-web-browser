# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

import argparse

from mach.decorators import Command, CommandArgument


@Command(
    "xpcshell",
    category="misc",
    description="Run the xpcshell binary",
)
@CommandArgument(
    "--app",
    help="The path to the Firefox binary (default: the binary in $TOPOBJDIR)",
    dest="firefox_bin",
)
@CommandArgument(
    "args",
    nargs=argparse.REMAINDER,
    help="Arguments to provide to xpcshell",
)
def xpcshell(command_context, *, firefox_bin, args):
    if not firefox_bin:
        firefox_bin = command_context.get_binary_path("app")

    command = [str(firefox_bin), "-xpcshell"]

    # Disable the socket process (see https://bugzilla.mozilla.org/show_bug.cgi?id=1903631).
    env = {
        "MOZ_DISABLE_SOCKET_PROCESS": "1",
    }

    if args:
        command.extend(args)

    return command_context.run_process(
        command,
        pass_thru=True,
        ensure_exit_code=False,
        append_env=env,
    )
