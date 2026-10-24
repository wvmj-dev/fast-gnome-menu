#!/usr/bin/env bash
# Smoke test: runs the extension in a throwaway headless GNOME Shell, drives
# the menu through a few scenarios, saves screenshots and fails on any
# JavaScript error. Nothing touches the real session: the shell gets its own
# D-Bus session bus, dconf database and XDG_DATA_HOME, and no display.
#
#   tests/smoke.sh <output dir>     (normally run through ./build.sh test)
set -euo pipefail

if [ -z "${FGM_SMOKE_INNER:-}" ]; then
    root=$(cd "$(dirname "$0")/.." && pwd)
    out=$(mkdir -p "${1:-$root/tests/output}" && cd "${1:-$root/tests/output}" && pwd)
    uuid=$(sed -n 's/.*"uuid": *"\([^"]*\)".*/\1/p' "$root/metadata.json")
    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT

    ext="$work/share/gnome-shell/extensions"
    mkdir -p "$ext"
    cp -r "$HOME/.local/share/gnome-shell/extensions/$uuid" "$ext/"
    cp -r "$root/tests/devtools" "$ext/fast-gnome-menu-devtools@local"
    rm -f "$out"/*.png "$out"/*.log

    echo "user-db:fast_gnome_menu_test" >"$work/dconf-profile"
    export DCONF_PROFILE="$work/dconf-profile"
    # Wipes the whole test database, so refuse unless it really is the test one.
    reset_test_db() {
        [ "$DCONF_PROFILE" = "$work/dconf-profile" ] &&
            grep -qx "user-db:fast_gnome_menu_test" "$DCONF_PROFILE" || {
            echo "refusing to reset dconf: unexpected profile"
            exit 1
        }
        dconf reset -f /
    }
    reset_test_db
    dconf write /org/gnome/shell/enabled-extensions "['$uuid', 'fast-gnome-menu-devtools@local']"
    dconf write /org/gnome/shell/welcome-dialog-last-shown-version "'999'"

    export FGM_SMOKE_INNER=1 FGM_UUID=$uuid FGM_OUT=$out FGM_WORK=$work
    status=0
    # Services on the private bus are chatty; keep their output in a file.
    dbus-run-session -- "$0" 2>"$out/session.log" || status=$?
    reset_test_db
    exit $status
fi

# --- Inside the private session bus ---------------------------------------
P=/org/gnome/shell/extensions/fast-gnome-menu/
log="$FGM_OUT/shell.log"

XDG_DATA_HOME="$FGM_WORK/share" FAST_GNOME_MENU_DRY_RUN=1 \
    gnome-shell --headless --virtual-monitor 1280x800 >"$log" 2>&1 &
shell=$!
trap 'kill $shell 2>/dev/null; wait $shell 2>/dev/null' EXIT

js() {
    local reply
    reply=$(gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$1" 2>&1) || { echo "$reply"; return 1; }
    [[ $reply == "(true,"* ]] || { echo "Eval failed: $1 -> $reply"; return 1; }
    echo "$reply"
}
shot() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot \
        --method org.gnome.Shell.Screenshot.Screenshot false false "$FGM_OUT/$1.png" >/dev/null
    echo "  screenshot: $FGM_OUT/$1.png"
}
pause() { sleep "${1:-0.6}"; }

EXT="Main.extensionManager.lookup('$FGM_UUID')"
MENU="$EXT.stateObj._menu"
open_menu() { js "Main.overview.hide(); $EXT.stateObj.toggle(); 1" >/dev/null; pause; }
close_menu() { js "$MENU?.close(false); 1" >/dev/null; pause 0.3; }

for _ in $(seq 1 60); do
    js "$EXT?.state === 1 && global.context.unsafe_mode" 2>/dev/null | grep -q true && break
    sleep 0.5
done
js "$EXT.state === 1" | grep -q true || { echo "extension did not start"; exit 1; }
js "Main.overview.hide(); 1" >/dev/null
pause 1

echo "1. default menu (4 actions, dark)"
open_menu
shot 01-default
js "$MENU._move(1, 0); 1" >/dev/null; pause
shot 02-focus-moved
js "$MENU._buttons[1].emit('clicked', 0); 1" >/dev/null; pause
js "$EXT.stateObj._menu === null" | grep -q true || { echo "menu did not close after an action"; exit 1; }
grep -q "Dry run: would activate logout" "$log" || { echo "action was not activated"; exit 1; }

echo "2. confirmation"
dconf write ${P}confirm-mode "'all'"
open_menu
js "$MENU._buttons[0].emit('clicked', 0); 1" >/dev/null; pause 1
shot 03-confirmation
js "$MENU._hideConfirmation(); 1" >/dev/null; pause
shot 04-confirmation-cancelled
close_menu

echo "3. six actions, custom action, highlight color, no panel"
dconf write ${P}custom-actions "[('custom-test0001', 'Terminal', 'utilities-terminal-symbolic', 'gnome-terminal')]"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'custom-test0001', 'restart', 'power-off']"
dconf write ${P}confirm-mode "'none'"
dconf write ${P}highlight-color "'#e5a50a'"
dconf write ${P}show-panel false
open_menu
js "$MENU._move(1, 0); $MENU._move(1, 0); $MENU._move(0, 1); 1" >/dev/null; pause
shot 05-six-custom-color
js "$MENU._buttons[$MENU._ids.indexOf('custom-test0001')].emit('clicked', 0); 1" >/dev/null; pause
grep -q "Dry run: would activate custom-test0001" "$log" || { echo "custom action was not activated"; exit 1; }

echo "4. five actions (die face), light style, larger spacing"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'restart', 'power-off']"
dconf reset ${P}highlight-color
dconf reset ${P}show-panel
dconf write ${P}spacing 28
dconf write /org/gnome/desktop/interface/color-scheme "'prefer-light'"
pause 1
open_menu
shot 06-five-light
close_menu
dconf reset /org/gnome/desktop/interface/color-scheme

echo "5. preferences window"
n=7
for page in actions appearance behavior; do
    # The prefs app is D-Bus activated: pass the page through the activation
    # environment and restart only the instance on this private bus.
    dbus-update-activation-environment FAST_GNOME_MENU_PREFS_PAGE=$page
    pid=$(gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
        --method org.freedesktop.DBus.GetConnectionUnixProcessID org.gnome.Shell.Extensions 2>/dev/null |
        grep -o '[0-9]\+' | tail -1 || true)
    [ -n "$pid" ] && kill "$pid" && pause 1
    gnome-extensions prefs "$FGM_UUID" >/dev/null 2>&1 || true
    pause 4
    shot "0$n-preferences-$page"
    n=$((n + 1))
done

errors=$(grep -E "JS ERROR|JS WARNING|$FGM_UUID.*(rror|Exception)|Gjs-CRITICAL" "$log" | grep -v "copyous" || true)
if [ -n "$errors" ]; then
    echo "FAILED: errors in $log"
    echo "$errors"
    exit 1
fi
echo "OK: no JavaScript errors (log: $log)"
