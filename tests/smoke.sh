#!/usr/bin/env bash
# Smoke test: runs the extension in a throwaway headless GNOME Shell, drives
# the menu through a few scenarios, saves screenshots and fails on any
# JavaScript error. Nothing touches the real session: the shell gets its own
# D-Bus session bus, dconf database and XDG_DATA_HOME, and no display.
#
#   tests/smoke.sh <output dir>     (normally run through ./build.sh test)
#
# The extension is staged from the working tree into a temporary directory,
# so the copy installed in ~/.local is neither used nor changed.
set -euo pipefail

if [ -z "${FGM_SMOKE_INNER:-}" ]; then
    root=$(cd "$(dirname "$0")/.." && pwd)
    out=$(mkdir -p "${1:-$root/tests/output}" && cd "${1:-$root/tests/output}" && pwd)
    uuid=$(sed -n 's/.*"uuid": *"\([^"]*\)".*/\1/p' "$root/metadata.json")
    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT

    ext="$work/share/gnome-shell/extensions"
    mkdir -p "$ext"
    "$root/build.sh" stage "$ext"
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
# Runs an expression for its side effects; any failure stops the test.
run() {
    local reply
    reply=$(js "$1") || { echo "$reply"; exit 1; }
}
# True only when the expression evaluates to true. Eval replies
# "(true, '<result>')", where the first true just means the call worked.
is_true() { [[ $(js "$1" 2>/dev/null) == "(true, 'true')" ]]; }
shot() {
    gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot \
        --method org.gnome.Shell.Screenshot.Screenshot false false "$FGM_OUT/$1.png" >/dev/null
    echo "  screenshot: $FGM_OUT/$1.png"
}
pause() { sleep "${1:-0.6}"; }
# Real pointer click on an actor's center through a virtual mouse, unlike
# emit('clicked'), which skips the event path the buttons' gestures rely on.
POINTER="(globalThis.fgmPointer ??= global.stage.context.get_backend().get_default_seat()
    .create_virtual_device(imports.gi.Clutter.InputDeviceType.POINTER_DEVICE))"
click() {
    # The headless shell drops one axis of the first motion; send it twice.
    for _ in 1 2; do
        run "(() => { const [x, y] = $1.get_transformed_position(); const [w, h] = $1.get_transformed_size();
            $POINTER.notify_absolute_motion(imports.gi.GLib.get_monotonic_time(), x + w / 2, y + h / 2); })(); 1"
        pause 0.2
    done
    run "$POINTER.notify_button(imports.gi.GLib.get_monotonic_time(), imports.gi.Clutter.BUTTON_PRIMARY,
        imports.gi.Clutter.ButtonState.PRESSED); 1"
    pause 0.1
    run "$POINTER.notify_button(imports.gi.GLib.get_monotonic_time(), imports.gi.Clutter.BUTTON_PRIMARY,
        imports.gi.Clutter.ButtonState.RELEASED); 1"
}

EXT="Main.extensionManager.lookup('$FGM_UUID')"
MENU="$EXT.stateObj._menu"
open_menu() { run "Main.overview.hide(); $EXT.stateObj.toggle(); 1"; pause; }
close_menu() { run "$MENU?.close(false); 1"; pause 0.3; }

for _ in $(seq 1 60); do
    is_true "$EXT?.state === 1 && global.context.unsafe_mode" && break
    sleep 0.5
done
is_true "$EXT.state === 1" || { echo "extension did not start"; exit 1; }
run "Main.overview.hide(); 1"
pause 1

echo "1. default menu (4 actions, dark)"
open_menu
shot 01-default
run "$MENU._move(1, 0); 1"; pause
shot 02-focus-moved
run "$MENU._buttons[1].emit('clicked', 0); 1"; pause
is_true "$EXT.stateObj._menu === null" || { echo "menu did not close after an action"; exit 1; }
grep -q "Dry run: would activate logout" "$log" || { echo "action was not activated"; exit 1; }

echo "1b. mouse click on a button, then on the confirmation"
# Custom actions are always available; logind may refuse the built-in ones here.
dconf write ${P}custom-actions "[('custom-click001', 'Click', 'utilities-terminal-symbolic', 'true')]"
dconf write ${P}actions "['lock-screen', 'custom-click001']"
open_menu
click "$MENU._buttons[1]"; pause
grep -q "Dry run: would activate custom-click001" "$log" ||
    { echo "mouse click did not activate the action"; exit 1; }
dconf write ${P}confirm-mode "'all'"
open_menu
click "$MENU._buttons[1]"; pause 1
is_true "!!$MENU._confirmBox" || { echo "mouse click did not open the confirmation"; exit 1; }
click "$MENU._dialogButtons[0]"; pause 1
is_true "!$MENU._confirmBox" || { echo "mouse click on Cancel did not close the confirmation"; exit 1; }
click "$MENU._buttons[1]"; pause 1
click "$MENU._dialogButtons[1]"; pause
[ "$(grep -c "Dry run: would activate custom-click001" "$log")" = 2 ] ||
    { echo "mouse click on Confirm did not run the action"; exit 1; }
dconf reset ${P}confirm-mode
dconf reset ${P}actions
dconf reset ${P}custom-actions

echo "2. confirmation"
dconf write ${P}confirm-mode "'all'"
open_menu
# Two quick clicks must not stack two confirmations (each with a countdown).
run "$MENU._buttons[0].emit('clicked', 0); $MENU._buttons[1].emit('clicked', 0); 1"; pause 1
is_true "$MENU._monitorBox.get_children().filter(c => c.has_style_class_name('fgm-confirm')).length === 1" ||
    { echo "more than one confirmation opened"; exit 1; }
shot 03-confirmation
run "$MENU._hideConfirmation(); 1"; pause
shot 04-confirmation-cancelled
close_menu

echo "3. six actions, custom action, highlight color, no panel"
dconf write ${P}custom-actions "[('custom-test0001', 'Terminal', 'utilities-terminal-symbolic', 'gnome-terminal')]"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'custom-test0001', 'restart', 'power-off']"
dconf write ${P}confirm-mode "'none'"
dconf write ${P}highlight-color "'#e5a50a'"
dconf write ${P}panel-style "'none'"
open_menu
run "$MENU._move(1, 0); $MENU._move(1, 0); $MENU._move(0, 1); 1"; pause
shot 05-six-custom-color
run "$MENU._buttons[$MENU._ids.indexOf('custom-test0001')].emit('clicked', 0); 1"; pause
grep -q "Dry run: would activate custom-test0001" "$log" || { echo "custom action was not activated"; exit 1; }

echo "4. five actions (die face), light style, larger spacing"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'restart', 'power-off']"
dconf reset ${P}highlight-color
dconf reset ${P}panel-style
dconf write ${P}spacing 28
dconf write /org/gnome/desktop/interface/color-scheme "'prefer-light'"
pause 1
open_menu
shot 06-five-light
close_menu
dconf reset /org/gnome/desktop/interface/color-scheme
dconf reset ${P}spacing

echo "5. circle, translucent panel, blur, top-right corner"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'custom-test0001', 'restart', 'power-off']"
dconf write ${P}layout "'circle'"
dconf write ${P}panel-style "'translucent'"
dconf write ${P}backdrop-blur 24
dconf write ${P}position "'top-right'"
open_menu
run "$MENU._move(1, 0); 1"; pause
shot 07-circle-blur-top-right
close_menu

echo "6. circle with center, bottom"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'restart', 'power-off']"
dconf write ${P}layout "'circle-center'"
dconf reset ${P}panel-style
dconf reset ${P}backdrop-blur
dconf write ${P}position "'bottom'"
open_menu
shot 08-circle-center-bottom
close_menu

echo "7. custom drawing (T shape), left, confirmation keeps the position"
dconf write ${P}layout "'custom'"
dconf write ${P}custom-layout "['xxx', '.x.', '.x.']"
dconf write ${P}position "'left'"
dconf write ${P}confirm-mode "'all'"
open_menu
shot 09-custom-left
run "$MENU._buttons[0].emit('clicked', 0); 1"; pause 1
shot 10-custom-left-confirmation
close_menu
dconf write ${P}confirm-mode "'none'"

echo "8. HiDPI: scale factor 2"
dconf reset ${P}custom-layout
dconf reset ${P}position
dconf write ${P}layout "'auto'"
dconf write ${P}actions "['lock-screen', 'logout', 'suspend', 'restart', 'power-off']"
# Headless Wayland ignores the scaling-factor key; set the UI scale directly.
run "imports.gi.St.ThemeContext.get_for_stage(global.stage).scale_factor = 2; 1"
pause 2
open_menu
shot 11-hidpi
# The menu is larger than this small scaled screen, so it must shrink to fit.
# Checks the panel and every button, which could stick out of a clipped panel.
is_true "[$MENU._menu, ...$MENU._buttons].every(a => { const r = a.get_transformed_extents();
    const s = global.stage; return r.get_x() >= 0 && r.get_y() >= 0 &&
    r.get_x() + r.get_width() <= s.width + 1 && r.get_y() + r.get_height() <= s.height + 1; })" ||
    { echo "menu does not fit the screen"; exit 1; }
# Buttons must not overlap once their CSS size is scaled.
is_true "(() => { const b = $MENU._buttons.map(x => x.get_transformed_extents());
    return b.every((r, i) => b.every((o, j) => i >= j || !r.intersection(o)[0])); })()" ||
    { echo "buttons overlap at scale 2"; exit 1; }
close_menu
run "imports.gi.St.ThemeContext.get_for_stage(global.stage).scale_factor = 1; 1"
pause 2

echo "9. preferences window"
n=12
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
    shot "$n-preferences-$page"
    n=$((n + 1))
done

errors=$(grep -E "JS ERROR|JS WARNING|$FGM_UUID.*(rror|Exception)|Gjs-CRITICAL" "$log" | grep -v "copyous" || true)
if [ -n "$errors" ]; then
    echo "FAILED: errors in $log"
    echo "$errors"
    exit 1
fi
echo "OK: no JavaScript errors (log: $log)"
