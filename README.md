# Fast GNOME Menu

A GNOME Shell extension that opens an interactive power menu in the style of [wlogout](https://github.com/ArtsyMacaw/wlogout): rounded buttons to lock the screen, log out, suspend, hibernate, switch user, restart, power off or run your own commands.

Use it with the keyboard (arrow keys or shortcut keys) or the mouse. Place it at the center, an edge or a corner of the screen. It follows the system light/dark style, accent color and language.

| Default menu | Confirmation | Circle with blur |
|---|---|---|
| ![Menu with four buttons, Log Out selected](docs/screenshots/menu.png) | ![Confirmation with a countdown](docs/screenshots/confirmation.png) | ![Buttons on a ring over the blurred screen](docs/screenshots/circle-blur.png) |

| Light style, 5 actions | Custom layout | Preferences |
|---|---|---|
| ![Light menu in the die-face layout](docs/screenshots/light.png) | ![Buttons drawn as a T shape](docs/screenshots/custom-layout.png) | ![Appearance page of the preferences](docs/screenshots/preferences.png) |

The screenshots are taken by the [smoke test](#smoke-test-buildsh-test). The UI in them is in Brazilian Portuguese, one of the bundled translations.

## Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Settings](#settings)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Building and packaging](#building-and-packaging)
- [Tests](#tests)
- [Development and debugging](#development-and-debugging)
- [Translations](#translations)
- [Project status](#project-status)
- [Ideas for later](#ideas-for-later)

## Features

- **Built-in actions:**
  - Lock, Log Out, Suspend, Hibernate, Switch User, Restart and Power Off;
  - Lock, Log Out, Restart and Power Off are enabled by default.
- **Custom actions:** any command, with its own name and icon (open a terminal, turn the screen off, reboot into firmware…). The command runs **without a shell**, so there is no command injection.
- **Layouts:**
  - **Automatic:** 1 to 3 in a row, 4 as 2×2, 5 like a die face, 6 as 2×3;
  - **Grid** with a fixed number of columns, **Row** and **Column**;
  - **Circle** and **Circle with center**, with a round panel;
  - **Custom**, drawn by clicking cells on a 7×7 grid in the preferences.
- **Position:**
  - center, one of the four edges or one of the four corners;
  - adjustable distance from the edge;
  - a menu that does not fit the screen shrinks to fit.
- **Background:**
  - dimming and blur of the screen behind the menu;
  - a solid, translucent (frosted glass when combined with blur) or invisible panel.
- **Highlight:** the selected button uses the system accent color, or a color of your choice, and grows with a smooth animation.
- **Optional confirmation** for no action, every action or the chosen ones:
  - shows the action's button;
  - a countdown (60 s by default) with a progress bar;
  - Cancel and Confirm buttons, with Cancel focused by default.
- **Style and language:** stylesheets for the light and dark styles, switched automatically; translations for Brazilian Portuguese and Spanish.
- **HiDPI:** works with interface scale 2× and up.
- **Lightweight:** nothing runs in the background. The menu is built when it opens and destroyed when it closes.
- **Preferences in three pages:** Actions, Appearance and Behavior.

## Requirements

### To use and build

| Package (Fedora) | Version | Provides | Used for |
|---|---|---|---|
| `gnome-shell` | 48, 49 or 50 | GNOME Shell and the `gnome-extensions` command | Running, enabling and packing the extension |
| `gjs` | the one shipped with GNOME | GNOME's JavaScript interpreter | Running the extension, the preferences and the unit tests |
| `glib2` | any recent | `glib-compile-schemas` | Compiling the settings schema |
| `gettext` | any recent | `msgfmt`, `xgettext`, `msgmerge` | Compiling and updating translations |

`gnome-shell` and `gjs` come with any GNOME installation. The scripts need `bash`.

### To test and develop

| Package (Fedora) | Provides | Used by |
|---|---|---|
| `dbus-daemon` | `dbus-run-session` | `./build.sh test` and `./build.sh dev`, which give the test GNOME Shell its own D-Bus bus |
| `dbus-tools` | `dbus-update-activation-environment` | `./build.sh test`, to pick the preferences page in screenshots |
| `mutter-devkit` | the window that hosts the nested session | `./build.sh dev` (GNOME 49+). GNOME 48 uses `--nested` and does not need it |

Fedora does not install `dbus-daemon` by default because it uses `dbus-broker` as the system bus. Both can be installed side by side: `dbus-daemon` only runs when `dbus-run-session` starts it.

### Summary by command

| Command | Needs |
|---|---|
| `./build.sh`, `install`, `stage`, `pack`, `pot`, `prefs` | `gnome-shell`, `gjs`, `glib2`, `gettext` |
| `./build.sh unit` | `gjs` |
| `./build.sh test` | the first row, plus `dbus-daemon` and `dbus-tools` |
| `./build.sh dev` | the first row, plus `dbus-daemon` and `mutter-devkit` |

On Fedora, everything at once:

```sh
sudo dnf install gnome-shell gjs glib2 gettext dbus-daemon dbus-tools mutter-devkit
```

On Debian/Ubuntu, to use, build and run the unit tests (package names for the nested session vary between releases):

```sh
sudo apt install gnome-shell gjs libglib2.0-bin gettext
```

## Installation

### From source

```sh
git clone https://github.com/wvmj-dev/fast-gnome-menu.git
cd fast-gnome-menu
./build.sh install
```

This compiles the schema and translations and copies the extension to `~/.local/share/gnome-shell/extensions/fast-gnome-menu@wvmj-dev.github.io`.

Then:

1. **Log out and back in.** On Wayland, GNOME Shell only loads new extensions, or new code of an extension, on a new login.
2. Enable the extension, either from the **Extensions** app or with:

   ```sh
   gnome-extensions enable fast-gnome-menu@wvmj-dev.github.io
   ```

### From the `.zip`

```sh
./build.sh pack
gnome-extensions install --force fast-gnome-menu@wvmj-dev.github.io.shell-extension.zip
```

Then follow steps 1 and 2 above.

### Uninstalling

```sh
gnome-extensions uninstall fast-gnome-menu@wvmj-dev.github.io
```

## Usage

Open the menu with **`Super+X`** (default shortcut) or with the power icon in the top bar, using a click, a tap or `Enter` while navigating the bar with the keyboard.

| Key | Effect |
|---|---|
| `←` `→` `↑` `↓` | Moves to the neighbouring button in that direction. At the end of a row or column, wraps to the other end |
| `Tab` / `Shift+Tab` | Next / previous, in action order |
| `Enter` / `Space` | Runs the selected action (or opens its confirmation) |
| `1` … `9` | Runs the action at that position (or opens its confirmation) |
| Action letter | Runs that action directly (table below), or opens its confirmation |
| `Esc`, the opening shortcut or a click outside the panel | Closes the menu (closing on outside clicks can be turned off) |

| Action | Letter | Icon |
|---|---|---|
| Lock | `L` | `system-lock-screen-symbolic` |
| Log Out | `E` | `system-log-out-symbolic` |
| Suspend | `S` | `weather-clear-night-symbolic` |
| Hibernate | `H` | `drive-harddisk-symbolic` |
| Switch User | `U` | `system-switch-user-symbolic` |
| Restart | `R` | `system-reboot-symbolic` |
| Power Off | `P` | `system-shutdown-symbolic` |

- **Letters:** they are fixed, so they do not change with the system language, and they are not shown on the buttons.
- **Custom actions:** they have no letter, but can be triggered by their position number.
- **Mouse:** hovering a button also selects it.
- **Unavailable actions:** an action the system does not allow right now (for example, locking disabled by policy, or hibernate without swap) is dimmed, and the selection skips it.

### On the confirmation screen

| Key | Effect |
|---|---|
| `Enter` / `Space` | Activates the focused button. Cancel is focused when it opens (configurable), so a stray `Enter` does not run the action |
| `←` `→` / `Tab` | Switches between Cancel and Confirm |
| `Esc` or a click outside the panel | Cancels and returns to the menu, with the same action selected |

When the countdown reaches zero, the action runs on its own, like GNOME's power-off dialog.

## Settings

Open the preferences from the **Extensions** app or with:

```sh
gnome-extensions prefs fast-gnome-menu@wvmj-dev.github.io
```

Changes apply the next time the menu opens.

**Actions page**
- which actions appear, and in which order;
- custom actions: add, edit and delete.

**Appearance page**
- layout, grid columns and the custom layout drawing;
- position and distance from the edge;
- button size, corners, spacing, icon size and how much the selected button grows;
- labels and a custom highlight color;
- panel style, screen dimming and screen blur.

**Behavior page**
- shortcut and top bar icon;
- monitor to open on;
- action selected on opening;
- closing on outside clicks;
- confirmation: which actions, countdown length and focused button;
- resetting everything to defaults.

| GSettings key | Type | Default | Description |
|---|---|---|---|
| `actions` | `as` | `['lock-screen', 'logout', 'restart', 'power-off']` | Actions shown, in order |
| `custom-actions` | `a(ssss)` | `[]` | Custom actions: `(id, name, icon, command)`. The id starts with `custom-` |
| `layout` | `s` | `'auto'` | `'auto'`, `'grid'`, `'row'`, `'column'`, `'circle'`, `'circle-center'` or `'custom'` |
| `columns` | `i` (1–6) | `4` | Buttons per row in the grid layout |
| `custom-layout` | `as` | `['x.x', '.x.', 'x.x']` | Drawing of the custom layout: one string per row, each `x` is a position |
| `position` | `s` | `'center'` | `'center'`, `'top'`, `'bottom'`, `'left'`, `'right'`, `'top-left'`, `'top-right'`, `'bottom-left'` or `'bottom-right'` |
| `position-margin` | `i` (0–400) | `32` | Distance from the edge in pixels when not centered |
| `button-size` | `i` (64–256) | `128` | Button size in pixels |
| `corner-radius` | `i` (0–64) | `24` | Corner radius in pixels (half the size makes round buttons) |
| `spacing` | `i` (0–64) | `16` | Space between buttons in pixels |
| `icon-size` | `i` (20–70) | `34` | Icon size as a percentage of the button |
| `focus-scale` | `i` (100–130) | `110` | Size of the selected button in percent; `100` turns the growth off |
| `show-labels` | `b` | `true` | Shows the action name below the icon |
| `highlight-color` | `s` | `''` | Highlight color as `#rrggbb`; empty uses the system accent color |
| `panel-style` | `s` | `'solid'` | `'solid'`, `'translucent'` or `'none'` (buttons float; the confirmation keeps a background) |
| `backdrop-opacity` | `i` (0–100) | `50` | Screen dimming in percent |
| `backdrop-blur` | `i` (0–60) | `0` | Screen blur radius; `0` turns it off |
| `toggle-menu` | `as` | `['<Super>x']` | Shortcut that opens/closes the menu |
| `show-indicator` | `b` | `true` | Shows the icon in the top bar |
| `monitor` | `s` | `'pointer'` | `'pointer'` (monitor with the pointer) or `'primary'` |
| `initial-focus` | `s` | `'first'` | Action selected on opening: `'first'` or `'last'` (the last one used, stored in `last-action`) |
| `close-on-click-outside` | `b` | `true` | Closes the menu on clicks outside the panel |
| `confirm-mode` | `s` | `'none'` | Which actions ask for confirmation: `'none'`, `'all'` or `'custom'` (those in `confirm-list`) |
| `confirm-list` | `as` | `['logout', 'restart', 'power-off']` | Actions that ask for confirmation in `'custom'` mode |
| `confirm-timeout` | `i` (5–300) | `60` | Seconds before the confirmation runs the action on its own |
| `confirm-default` | `s` | `'cancel'` | Button focused when the confirmation opens: `'cancel'` or `'confirm'` |

Built-in action ids: `lock-screen`, `logout`, `suspend`, `hibernate`, `switch-user`, `restart` and `power-off`.

The keys can also be changed from a terminal:

```sh
SCHEMA=org.gnome.shell.extensions.fast-gnome-menu
DIR=~/.local/share/gnome-shell/extensions/fast-gnome-menu@wvmj-dev.github.io/schemas

gsettings --schemadir "$DIR" set $SCHEMA layout "'circle'"
gsettings --schemadir "$DIR" set $SCHEMA custom-actions "[('custom-term', 'Terminal', 'utilities-terminal-symbolic', 'gnome-terminal')]"
```

## How it works

### Opening the menu

The shortcut is registered with `Main.wm.addKeybinding` and works on the desktop and in the Overview. It also works while the menu is open, to close it, but never opens the menu on top of another system dialog.

When the menu opens, the extension:

1. creates a full-screen layer (`PowerMenu`) that dims, and optionally blurs, the background and receives clicks outside the panel;
2. computes the button positions for the layout and, if they do not fit the monitor's work area, scales down size, spacing and corners;
3. places the panel on the chosen monitor according to `position`;
4. calls `Main.pushModal`, which grabs keyboard and mouse until the menu closes;
5. selects the first available action (or the last one used) and animates in.

### Button layout

Positions are computed by `getCells()` in [layout.js](layout.js), in units of "one button plus the spacing", and then converted to pixels.

**Automatic** (`'auto'`, the default):

| Actions | Layout |
|---|---|
| 1 | Just the button |
| 2 or 3 | One row |
| 4 | 2×2 square |
| 5 | Like 4, with one in the middle (die face ⚄) |
| 6 | Two rows of three (2×3) |
| 7 or more | Rows of up to ⌈√(1.5·n)⌉ buttons, with the last row centered |

```
1        2 or 3        4          5              6

[■]      [■][■][■]     [■][■]     [■]    [■]     [■][■][■]
                       [■][■]        [■]         [■][■][■]
                                  [■]    [■]
```

In the 5-button layout, the middle of each side stays empty: the center button can only avoid overlapping the corners if they are a whole position away.

**Grid** (`'grid'`): rows of `columns` buttons; a shorter last row is centered. **Row** and **Column** are grids with every button in a single row or column.

**Circle** (`'circle'`): buttons sit on a ring, the first at the top, clockwise. Two neighbouring square buttons only stay clear of each other at least √2 positions apart, so the ring radius is `√2/2 ÷ sin(π/n)` positions for `n` buttons.

**Circle with center** (`'circle-center'`): the first action sits in the middle and the rest on the ring, whose radius is at least √2 to clear the corners of the center button. In both circular layouts, the panel is a circle that reaches the farthest corner of every button.

**Custom** (`'custom'`): each `x` in `custom-layout` is a position, filled in reading order. If there are more actions than positions, the rest continue in rows below the drawing, as wide as the drawing.

### Position, size and scale

- **Work area:** the menu stays inside the monitor's work area (`getWorkAreaForMonitor`), which leaves out the top bar.
- **Margin:** the distance from the edge is applied as a CSS margin. Margins set on the actor directly would be reset by St when it recomputes the style.
- **Confirmation:** opens at the same position as the menu.
- **Fitting:** if the panel does not fit the work area (large buttons, small or scaled monitor), size, spacing and corners are scaled down by the same factor **before** the buttons are built.
- **HiDPI:** St multiplies CSS `px` lengths by the interface scale (`St.ThemeContext.scale_factor`), but not sizes and positions set from code. So the geometry computed in JavaScript is multiplied by the scale, and the CSS stays in logical pixels.

### Arrow-key navigation

Navigation lives in `pickNeighbour()` in [layout.js](layout.js). It uses each button's actual position, so it works with any layout. Among the buttons ahead in the pressed direction, it picks the one with the smallest `distance / √cos(angle)`:

- **Grids:** a straight neighbour always beats a diagonal one.
- **5-button layout:** the middle button, diagonal but much closer, beats the corners. From a corner, `→` or `↓` goes to the middle; from the middle, the same arrow continues to the corner on the side you came from.
- **Disabled buttons:** skipped in the same direction, like an empty slot, so they do not change the route.
- **Nothing ahead:** the selection wraps to the far end of the same row or column.

### Highlight and style

- **Focus:** the highlight uses St's `:focus` state. Hovering a button also gives it the focus, so keyboard and mouse share one highlight.
- **Highlighted button:** gets the accent color and a stronger border. It grows to `focus-scale` with `ease()` (`EASE_OUT_BACK`, 200 ms) and is raised above its neighbours.
- **No shadow:** in St, a blurred `box-shadow` does not follow rounded corners and shows up as a blurry square.
- **Styles:** colors come from `stylesheet-dark.css` and `stylesheet-light.css`. GNOME Shell loads the variant for the current style and reloads it when the style changes. `stylesheet.css` is a copy of the dark one, used if the variant is missing.
- **Highlight color:** `-st-accent-color` by default. With `highlight-color` set, the color is applied as an inline style, and the text turns black or white depending on luminance. The value only reaches CSS if it is exactly `#rrggbb` ([color.js](color.js)), so the setting cannot inject CSS.
- **Animations:** they follow GNOME's global Animations setting. With it off, they are instant.

### Background

- **Blur:** uses `Shell.BlurEffect` in `BACKGROUND` mode on the full-screen layer. It blurs what is behind while the menu stays sharp, and the dimming is drawn on top.
- **Cost:** blur only exists while the menu is open, but its GPU cost grows with the radius, so it is off by default.
- **No panel-only blur:** GNOME's blur is rectangular and would show a blurry square outside the rounded corners. A translucent panel over a blurred screen gives the same frosted-glass look.

### Confirmation

If the action asks for confirmation (`confirm-mode` and `confirm-list`), the menu stays open:

1. the button panel fades out, and an extra black layer dims the background further;
2. a panel appears with:
   - the action's button, 25% larger;
   - the countdown text;
   - a progress bar that empties continuously;
   - Cancel and Confirm buttons;
3. when the countdown reaches zero, or on Confirm, the action runs;
4. Cancel, `Esc` or a click outside stop the countdown and bring the menu back.

Only one confirmation can exist at a time. While it is shown, the fading menu ignores clicks and does not take the focus.

### Running actions

The menu closes (without animation) before running the action, so it does not cover the lock screen or system dialogs.

| Action | Call |
|---|---|
| Lock | `SystemActions.activateLockScreen()` |
| Log Out | `org.gnome.SessionManager.Logout(1)` (without GNOME's dialog) |
| Suspend | `SystemActions.activateSuspend()` |
| Hibernate | `org.freedesktop.login1.Manager.Hibernate(true)` |
| Switch User | `SystemActions.activateSwitchUser()` |
| Restart | `org.freedesktop.login1.Manager.Reboot(true)` |
| Power Off | `org.freedesktop.login1.Manager.PowerOff(true)` |
| Custom | `GLib.shell_parse_argv()` + `Util.spawn()` |

GNOME 50's `gnome-session` no longer offers a way to restart or power off without its own dialog. Since the extension provides the confirmation itself, it calls logind directly. The `true` argument lets polkit ask for a password when needed.

Availability comes from `SystemActions` (`canLockScreen`, `canSuspend`, `canSwitchUser`, `canRestart`, `canPowerOff`). For hibernate, the extension asks logind (`CanHibernate`, asynchronously) when the menu opens, and cancels the query if the menu closes first.

### Custom actions

The command line is split into arguments by `GLib.shell_parse_argv()`, which handles quotes and backslashes like a shell. The program is then started with GNOME Shell's `Util.spawn()`, which looks it up in `PATH` and shows a notification if it cannot start.

**No shell runs.** `echo hi; rm -rf ~` becomes `echo` with the arguments `hi;`, `rm`, `-rf` and `~`, with no variable expansion, pipes or redirections. To use those features, ask for a shell explicitly: `sh -c "xset dpms force off"`.

The edit dialog in the preferences:

- requires a name and a command with balanced quotes;
- warns when the program is not in `PATH`;
- previews the icon and warns when it is not in the theme (the menu falls back to `system-run-symbolic`).

Names and commands are shown as plain text.

### Language

Strings are marked with `_()`, and the gettext domain `fast-gnome-menu` is declared in `metadata.json`. GNOME Shell looks up the `.mo` files in `locale/` inside the extension folder.

## Project layout

```
fast-gnome-menu/
├── metadata.json          # UUID, supported versions, schema and gettext domain
├── extension.js           # Menu, confirmation, top bar icon and running actions
├── prefs.js               # Preferences window (GTK 4 + libadwaita)
├── actions.js             # Catalog of built-in and custom actions
├── layout.js              # Layouts and arrow-key navigation (no GNOME Shell imports)
├── color.js               # Highlight color validation and contrast (no GNOME Shell imports)
├── stylesheet-dark.css    # Dark style
├── stylesheet-light.css   # Light style
├── stylesheet.css         # Copy of the dark style, used if the variant is missing
├── schemas/               # GSettings schema
├── po/                    # Template (.pot) and translations (pt_BR, es)
├── tests/
│   ├── unit.js            # Unit tests (gjs)
│   ├── smoke.sh           # Test in a headless session, with screenshots
│   └── devtools/          # Helper extension used only by the smoke test
├── docs/screenshots/      # Screenshots used in this README
├── .github/workflows/     # CI
└── build.sh               # Building, installing, testing, packing and translations
```

`schemas/gschemas.compiled`, `locale/` and `tests/output/` are generated and not versioned. The `.zip` from `./build.sh pack` contains only the extension files.

### Adding a built-in action

For simple commands, prefer a [custom action](#custom-actions). For a built-in one:

1. add the entry to `getActions()` in [actions.js](actions.js), with name, icon and letter;
2. handle the id in `_activate()` in [extension.js](extension.js) and, if `SystemActions` has an availability property for it, add it to `AVAILABILITY`;
3. add the id to the description of the `actions` key in the schema and to the list in `tests/unit.js`;
4. run `./build.sh pot` and translate the new text.

## Building and packaging

| Command | What it does |
|---|---|
| `./build.sh` | Compiles the schema (strict mode) and the translations in place |
| `./build.sh install` | Builds and installs to `~/.local/share/gnome-shell/extensions/<uuid>` |
| `./build.sh stage DIR` | Builds and copies the extension to `DIR/<uuid>` (used by the tests) |
| `./build.sh unit` | Runs the unit tests |
| `./build.sh test` | Runs the unit tests and the headless smoke test, without installing anything in your session |
| `./build.sh dev` | Installs and opens a nested GNOME Shell in a window |
| `./build.sh prefs` | Installs and reopens the preferences window with the new `prefs.js` |
| `./build.sh pack` | Creates `<uuid>.shell-extension.zip` for [extensions.gnome.org](https://extensions.gnome.org) |
| `./build.sh pot` | Updates the `.pot` and the `.po` files from the code |

The list of extension files lives in one variable (`SOURCES` in `build.sh`), used by `install`, `stage`, `pack` and `pot`. A new file only needs to be added there.

## Tests

| Level | Command | Time | Covers |
|---|---|---|---|
| Unit | `./build.sh unit` | ~1 s | Layouts, navigation, colors and the action catalog |
| Smoke (headless) | `./build.sh test` | ~1 min | The menu and the preferences running in a real GNOME Shell, with screenshots |
| CI | automatic on GitHub | ~1 min | Schema, translations, an up-to-date `.pot` and the unit tests |

### Unit tests: `./build.sh unit`

[tests/unit.js](tests/unit.js) loads `layout.js`, `color.js` and `actions.js` straight into `gjs`, with no GNOME Shell. It runs 225 checks:

- **Layouts:** for every layout and 1 to 9 buttons, the number of positions, normalization to 0 and no overlap; plus the expected shapes (2×2, die face, 2×3, row, column, circle center, custom drawing and overflow below).
- **Navigation:** expected routes in grids and in the 5-button layout, every button reachable, disabled buttons skipped in the same direction.
- **Colors:** only `#rrggbb` is accepted and attempts like `#123456; color: red` are rejected; contrast on light and dark colors.
- **Actions:** invalid custom actions dropped, default icon, no duplicate letters.

### Smoke test: `./build.sh test`

[tests/smoke.sh](tests/smoke.sh) runs the extension in a **headless** GNOME Shell (no window, no screen). It goes through several scenarios, saves screenshots in `tests/output/`, and fails on any JavaScript error or failed check.

| # | Scenario | Checks |
|---|---|---|
| 1 | Default menu, focus moved with the arrows, an action triggered | The menu closes and the action is logged |
| 2 | Confirmation opened with two quick clicks, then cancelled | Only one confirmation opens |
| 3 | 6 actions with a custom one, custom color, no panel | The custom action runs |
| 4 | 5 actions (die face), light style, larger spacing | Screenshot |
| 5 | Circle, translucent panel, blur, top-right corner | Screenshot |
| 6 | Circle with center, at the bottom | Screenshot |
| 7 | T-shaped drawing, on the left, with a confirmation | Screenshot |
| 8 | Interface scale 2 on a small screen | Buttons do not overlap and everything fits on screen |
| 9 | The three preferences pages | They open without errors |

**Isolation**
- **D-Bus:** its own bus (`dbus-run-session`).
- **Settings:** its own dconf database (`fast_gnome_menu_test`). The script refuses to wipe it unless the test profile is active.
- **Files:** a temporary `XDG_DATA_HOME`, where the extension is staged from the working tree (`build.sh stage`). The copy installed in `~/.local` is neither used nor changed.
- **Actions:** dry-run; nothing is actually executed.

**Helper extension:** to drive the shell over D-Bus (`org.gnome.Shell.Eval` and `Screenshot`), the test installs the `tests/devtools/` extension, which turns on GNOME Shell's "unsafe mode". It goes only into that throwaway session, never into your session or the `.zip`.

**Mutation testing:** the checks in scenarios 2 and 8 were verified by removing the matching fix from the code: the test fails without it and passes with it.

### CI

[.github/workflows/ci.yml](.github/workflows/ci.yml) runs on every push and pull request on GitHub. It checks:

- script syntax;
- strict compilation of the schema and the translations;
- that the translations are complete and have no `fuzzy` entries;
- that the `.pot` is up to date with the code;
- the unit tests.

The smoke test does not run in CI because GitHub's runners do not have GNOME Shell 48+. Run it locally before publishing.

### Manual checks

What the automated tests do not cover and is worth checking by hand after changes:

- clicking cells in the layout editor, saving a custom action and changing the color with the picker in the preferences;
- the real actions (lock, log out, suspend, restart, power off and a custom one) in a real session;
- the `Super+X` shortcut in the real session;
- multiple monitors, with both values of "Open on".

## Development and debugging

On Wayland, GNOME Shell loads an extension's code once per session; disabling and enabling it does not reload the JavaScript.

### Menu and styles: `./build.sh dev`

Opens a full GNOME Shell in a window, with the current version of the extension. The cycle:

1. edit the code;
2. run `./build.sh dev`;
3. test in the window, with the top bar icon or **`Super+Alt+X`**;
4. close the window and go back to step 1.

Details:

- **Dry-run:** actions are not executed, only logged (`Dry run: would activate power-off`). The nested session shares the machine's system bus, so a real power off would turn off your computer.
- **Separate settings:** the nested session has its own dconf database. It gets a copy of the extension settings, enables only this extension, and changes the shortcut to `Super+Alt+X`, because your real session grabs `Super+X`. Your real session is not changed.
- **Dimmed actions:** in the test window, Restart, Power Off and Suspend are dimmed because the system does not allow them in a nested session.
- **Window size:** `MUTTER_DEBUG_DUMMY_MODE_SPECS=1280x720 ./build.sh dev`.

### Preferences: `./build.sh prefs`

The preferences run in a process separate from the shell. This command installs, stops that process (which caches the old `prefs.js`) and reopens the window. Note: this closes any open extension preferences window.

### Logs

```sh
journalctl -f -o cat /usr/bin/gnome-shell   # extension (prefix [fast-gnome-menu@wvmj-dev.github.io])
journalctl -f -o cat --user                 # preferences window
```

## Translations

To add a language (French, for example):

```sh
./build.sh pot
msginit -i po/fast-gnome-menu.pot -o po/fr.po -l fr_FR.UTF-8 --no-translator
# translate the msgstr entries in po/fr.po
./build.sh install
```

After changing texts in the code, run `./build.sh pot` and fill in the new or `fuzzy` entries. CI fails if a translation is incomplete or the `.pot` is out of date.

## Project status

### Tested

- GNOME Shell 50 (Fedora 44), Wayland, light and dark styles, scale 1× and 2×, through the automated tests above.

### Not yet tested

- **GNOME Shell 48 and 49:** `metadata.json` declares support, but only 50 was tested.
- **Real multi-monitor setups** and right-to-left languages: the "left" and "right" positions are not mirrored.
- **Interactions in the preferences** (clicks, color picker, dialogs): only rendering is tested automatically.

### Missing before publishing

- **License:** extensions.gnome.org requires a GPL-compatible license (for example GPL-2.0-or-later). There is no `LICENSE` file yet.
- **Submission:** build the `.zip` with `./build.sh pack`, go through the [review guidelines](https://gjs.guide/extensions/review-guidelines/review-guidelines.html) (including the use of "GNOME" in the name) and submit to extensions.gnome.org.
- **Versioning:** bump `version` in `metadata.json` on every submission and keep a changelog.

### Known limitations

- **Restart, power off and hibernate do not notify applications.** The call goes straight to logind, so GNOME does not ask applications whether there is unsaved work. Save your work first, or use the confirmation as a reminder.
- **Hibernate is often dimmed.** logind only allows it with enough swap and, on many distributions, extra setup.
- **The `Super+X` shortcut may clash** with another shortcut; change it in the preferences.
- **"Log Out" is shown even on single-user systems**, where GNOME's own menu hides it, and the extension does not check the `org.gnome.desktop.lockdown disable-log-out` policy.
- **The layout editor has 7×7 cells.** A larger drawing set from a terminal works in the menu, but is cut when edited in the preferences.

## Ideas for later

**Session safety**
- **Warn about applications blocking shutdown:**
  - list `gnome-session` and logind inhibitors in the confirmation;
  - optionally go through `gnome-session`, so applications can ask to save.
- **Scheduled power off** ("power off in 30 minutes"), with a visible countdown that can be cancelled from the menu.
- **Hold to confirm** (press and hold the button), as an alternative to the countdown.

**Actions**
- **New built-in actions:**
  - reboot into firmware (UEFI, `SetRebootToFirmwareSetup`);
  - choose a boot entry (`SetRebootToBootLoaderEntry`);
  - turn the screen off;
  - do not disturb.
- **Custom label, icon and shortcut letter for built-in actions.**
- **Groups or submenus**, for example a "Restart…" button that opens boot options.

**Appearance**
- **Animation styles**, such as sliding in from the edge the menu is placed at, with adjustable speed.
- **Optional header** with the user's avatar and name, the time, uptime or battery.
- **Profiles:** save, switch, export and import sets of settings (JSON).
- **Menu on every monitor** at once.

**Interaction**
- **Other ways to open:** hot corner, touchpad gesture or Overview search ("power off").
- **Show the shortcut keys** while `Alt` is held.
- **Better support for touch** (larger buttons automatically) and gamepads.

**Project**
- **Smoke test in CI**, in a Fedora container with headless GNOME Shell (software rendering).
- **ESLint** with the configuration GNOME Shell uses.
- **Interaction tests for the preferences.**
- **More translations.**
