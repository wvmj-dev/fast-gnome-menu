import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import {Extension, gettext as _, ngettext} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';

import {CUSTOM_ICON, CUSTOM_PREFIX, getActions} from './actions.js';

const ANIMATION_TIME = 150;
const FOCUS_TIME = 200;

// SystemActions property that tells whether each action is currently allowed.
const AVAILABILITY = {
    'lock-screen': 'canLockScreen',
    'suspend': 'canSuspend',
    'switch-user': 'canSwitchUser',
    'restart': 'canRestart',
    'power-off': 'canPowerOff',
};

/**
 * @param {string} value color from the settings
 * @returns {?string} the color as #rrggbb, or null if it is not one. Only
 *   this exact form ever reaches an inline style.
 */
function parseColor(value) {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

/**
 * @param {string} hex color as #rrggbb
 * @returns {string} black or white, whichever reads better on the color
 */
function contrastColor(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000000' : '#ffffff';
}

/**
 * Grid cell [column, row] of each button. Columns may be fractional, so a
 * shorter last row is centred.
 *
 * @param {number} n number of buttons
 * @param {number|null} columns fixed number of columns, or null for automatic:
 *   1-3 in a row, 4 as 2x2, 5 like a die face, 6 as 2x3, more in a near-square
 * @returns {number[][]}
 */
function getCells(n, columns) {
    if (columns === null && n === 5)
        return [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]];

    if (columns === null) {
        if (n <= 3)
            columns = n;
        else if (n === 4)
            columns = 2;
        else
            columns = Math.ceil(Math.sqrt(n * 1.5));
    }
    columns = Math.min(columns, n);

    const cells = [];
    for (let i = 0; i < n; i++) {
        const row = Math.floor(i / columns);
        const inRow = Math.min(columns, n - row * columns);
        cells.push([i % columns + (columns - inRow) / 2, row]);
    }
    return cells;
}

const PowerMenu = GObject.registerClass({
    Signals: {'action-activated': {param_types: [GObject.TYPE_STRING]}},
}, class PowerMenu extends St.Widget {
    _init(settings) {
        super._init({
            style_class: 'fgm-backdrop',
            reactive: true,
            opacity: 0,
        });
        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        this.set_style(`background-color: rgba(0, 0, 0, ${settings.get_int('backdrop-opacity') / 100});`);
        this._cancellable = new Gio.Cancellable();
        this.connect('destroy', () => {
            this._stopCountdown();
            this._cancellable.cancel();
        });

        const size = settings.get_int('button-size');
        const radius = Math.min(settings.get_int('corner-radius'), size / 2);
        const spacing = settings.get_int('spacing');
        this._metrics = {
            size,
            radius,
            spacing,
            iconScale: settings.get_int('icon-size') / 100,
            focusScale: settings.get_int('focus-scale') / 100,
        };

        const highlight = parseColor(settings.get_string('highlight-color'));
        this._highlight = highlight;
        this._highlightStyle = highlight
            ? `background-color: ${highlight}; color: ${contrastColor(highlight)};` : '';
        this._showPanel = settings.get_boolean('show-panel');
        this._closeOnClickOutside = settings.get_boolean('close-on-click-outside');
        this._confirmDefault = settings.get_string('confirm-default');
        this._initialId = settings.get_string('initial-focus') === 'last'
            ? settings.get_string('last-action') : null;

        const mode = settings.get_string('confirm-mode');
        const confirmList = settings.get_strv('confirm-list');
        this._needsConfirmation = id => mode === 'all' || (mode === 'custom' && confirmList.includes(id));
        this._confirmTimeout = settings.get_int('confirm-timeout');

        // Extra darkening behind the confirmation.
        this._dim = new St.Widget({style_class: 'fgm-dim', opacity: 0});
        this._dim.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));
        this.add_child(this._dim);

        const monitor = settings.get_string('monitor') === 'primary'
            ? Main.layoutManager.primaryMonitor : Main.layoutManager.currentMonitor;
        this._monitorBox = new St.Widget({layout_manager: new Clutter.BinLayout()});
        this._monitorBox.set_position(monitor.x, monitor.y);
        this._monitorBox.set_size(monitor.width, monitor.height);
        this.add_child(this._monitorBox);

        this._menu = new St.Widget({
            style_class: 'fgm-menu',
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        this._monitorBox.add_child(this._menu);

        const catalog = getActions(_, settings.get_value('custom-actions').deepUnpack());
        const systemActions = SystemActions.getDefault();
        const ids = settings.get_strv('actions').filter(id => catalog.has(id));

        this._ids = ids;
        this._buttons = [];
        this._shortcuts = new Map();

        ids.forEach((id, i) => {
            const action = catalog.get(id);
            const prop = AVAILABILITY[id];
            const button = this._createButton(action, settings.get_boolean('show-labels'));
            button.reactive = prop ? systemActions[prop] : true;
            if (id === 'hibernate')
                this._checkHibernate(button);
            button.connect('clicked', () => {
                if (this._needsConfirmation(id))
                    this._showConfirmation(id, action, button);
                else
                    this.emit('action-activated', id);
            });
            this._buttons.push(button);

            this._shortcuts.set(String(i + 1), button);
            if (action.key && !this._shortcuts.has(action.key))
                this._shortcuts.set(action.key, button);
        });

        if (this._buttons.length === 0) {
            this._menu.set_style(`padding: ${spacing}px; border-radius: ${radius + spacing}px;`);
            this._menu.layout_manager = new Clutter.BinLayout();
            this._menu.add_child(new St.Label({
                style_class: 'fgm-empty',
                text: _('No actions enabled. Choose some in the extension preferences.'),
            }));
        } else {
            const columns = settings.get_string('layout') === 'grid'
                ? settings.get_int('columns') : null;
            this._placeButtons(getCells(this._buttons.length, columns), size, spacing, radius);
        }
    }

    _placeButtons(cells, size, spacing, radius) {
        const step = size + spacing;
        const width = Math.max(...cells.map(([col]) => col)) * step + size + 2 * spacing;
        const height = Math.max(...cells.map(([, row]) => row)) * step + size + 2 * spacing;

        this._menu.set_size(Math.round(width), Math.round(height));
        const panel = this._showPanel ? '' : 'background-color: transparent; border-width: 0; box-shadow: none;';
        this._menu.set_style(`border-radius: ${radius + spacing}px; ${panel}`);

        this._centers = this._buttons.map((button, i) => {
            const [col, row] = cells[i];
            const x = spacing + col * step;
            const y = spacing + row * step;
            button.set_position(Math.round(x), Math.round(y));
            this._menu.add_child(button);
            return [x + size / 2, y + size / 2];
        });
    }

    // SystemActions has no hibernate, so ask logind; the button stays
    // disabled until it answers "yes" (or "challenge", i.e. polkit asks).
    _checkHibernate(button) {
        button.reactive = false;
        Gio.DBus.system.call('org.freedesktop.login1', '/org/freedesktop/login1',
            'org.freedesktop.login1.Manager', 'CanHibernate', null,
            new GLib.VariantType('(s)'), Gio.DBusCallFlags.NONE, -1, this._cancellable,
            (conn, res) => {
                try {
                    const [answer] = conn.call_finish(res).deepUnpack();
                    button.reactive = answer === 'yes' || answer === 'challenge';
                } catch (e) {
                    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                        logError(e, 'CanHibernate failed');
                }
            });
    }

    _createContent(action, size, showLabel) {
        const content = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
        });
        content.add_child(new St.Icon({
            style_class: 'fgm-icon',
            icon_name: action.iconName,
            fallback_icon_name: CUSTOM_ICON,
            icon_size: Math.round(size * this._metrics.iconScale),
            x_align: Clutter.ActorAlign.CENTER,
        }));
        if (showLabel) {
            content.add_child(new St.Label({
                style_class: 'fgm-label',
                text: action.name,
                x_align: Clutter.ActorAlign.CENTER,
            }));
        }
        return content;
    }

    _createButton(action, showLabel) {
        const {size, radius} = this._metrics;
        const button = new St.Button({
            style_class: 'fgm-button',
            can_focus: true,
            track_hover: true,
            child: this._createContent(action, size, showLabel),
            accessible_name: action.name,
        });
        const baseStyle = `width: ${size}px; height: ${size}px; border-radius: ${radius}px;`;
        button.set_style(baseStyle);
        button.set_pivot_point(0.5, 0.5);

        button.connect('notify::hover', () => {
            if (button.hover)
                button.grab_key_focus();
        });
        // The selected button grows above its neighbours.
        button.connect('key-focus-in', () => {
            button.set_style(baseStyle + this._highlightStyle);
            button.get_parent()?.set_child_above_sibling(button, null);
            button.ease({
                scale_x: this._metrics.focusScale,
                scale_y: this._metrics.focusScale,
                duration: FOCUS_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_BACK,
            });
        });
        button.connect('key-focus-out', () => {
            button.set_style(baseStyle);
            button.ease({
                scale_x: 1,
                scale_y: 1,
                duration: FOCUS_TIME,
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            });
        });
        return button;
    }

    _showConfirmation(id, action, button) {
        const {size, radius, spacing} = this._metrics;
        const tileSize = Math.round(size * 1.25);
        this._confirmFor = button;

        this._menu.ease({
            opacity: 0,
            scale_x: 0.9,
            scale_y: 0.9,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => this._menu.hide(),
        });
        this._dim.ease({
            opacity: 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        const box = new St.BoxLayout({
            style_class: 'fgm-menu fgm-confirm',
            orientation: Clutter.Orientation.VERTICAL,
            reactive: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
            y_expand: true,
            opacity: 0,
        });
        // Spacing can be 0 in the menu; the confirmation always needs room.
        const pad = Math.max(2 * spacing, 16);
        box.set_style(`padding: ${pad}px; spacing: ${pad / 2}px; border-radius: ${radius + pad}px;`);

        // The selected action, same shape as in the menu, a bit larger.
        // Not an fgm-button: a non-reactive St widget is :insensitive and
        // would get the disabled look.
        const tile = new St.Bin({
            style_class: 'fgm-tile',
            child: this._createContent(action, tileSize, true),
            x_align: Clutter.ActorAlign.CENTER,
        });
        tile.set_style(`width: ${tileSize}px; height: ${tileSize}px; border-radius: ${Math.round(radius * 1.25)}px; ${this._highlightStyle}`);
        box.add_child(tile);

        this._countdownLabel = new St.Label({
            style_class: 'fgm-countdown',
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(this._countdownLabel);

        const track = new St.Widget({
            style_class: 'fgm-progress-track',
            x_expand: true,
        });
        const bar = new St.Widget({style_class: 'fgm-progress'});
        if (this._highlight)
            bar.set_style(`background-color: ${this._highlight};`);
        track.add_child(bar);
        // Once the track has its width, the bar empties over the countdown.
        const widthId = track.connect('notify::width', () => {
            if (track.width === 0)
                return;
            track.disconnect(widthId);
            bar.width = track.width;
            bar.ease({
                width: 0,
                duration: this._confirmTimeout * 1000,
                mode: Clutter.AnimationMode.LINEAR,
            });
        });
        box.add_child(track);

        const buttons = new St.BoxLayout({
            style_class: 'fgm-dialog-buttons',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const cancel = new St.Button({
            style_class: 'fgm-dialog-button',
            label: _('Cancel'),
            can_focus: true,
            x_expand: true,
        });
        cancel.connect('clicked', () => this._hideConfirmation());
        const confirm = new St.Button({
            style_class: 'fgm-dialog-button default',
            label: action.name,
            can_focus: true,
            x_expand: true,
        });
        confirm.set_style(this._highlightStyle);
        confirm.connect('clicked', () => this.emit('action-activated', id));
        buttons.add_child(cancel);
        buttons.add_child(confirm);
        box.add_child(buttons);
        this._dialogButtons = [cancel, confirm];

        this._confirmBox = box;
        this._monitorBox.add_child(box);
        box.set_pivot_point(0.5, 0.5);
        box.set_scale(0.9, 0.9);
        box.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        (this._confirmDefault === 'confirm' ? confirm : cancel).grab_key_focus();

        this._remaining = this._confirmTimeout;
        this._updateCountdown();
        this._countdownId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            this._remaining--;
            if (this._remaining > 0) {
                this._updateCountdown();
                return GLib.SOURCE_CONTINUE;
            }
            this._countdownId = 0;
            this.emit('action-activated', id);
            return GLib.SOURCE_REMOVE;
        });
    }

    _updateCountdown() {
        this._countdownLabel.text = ngettext(
            'Runs automatically in %d second',
            'Runs automatically in %d seconds',
            this._remaining).format(this._remaining);
    }

    _stopCountdown() {
        if (this._countdownId) {
            GLib.source_remove(this._countdownId);
            this._countdownId = 0;
        }
    }

    // Cancel goes back to the menu, with the same action still selected.
    _hideConfirmation() {
        this._stopCountdown();
        const box = this._confirmBox;
        this._confirmBox = null;
        this._dialogButtons = null;

        box.ease({
            opacity: 0,
            scale_x: 0.9,
            scale_y: 0.9,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => box.destroy(),
        });
        this._dim.ease({
            opacity: 0,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._menu.show();
        this._menu.ease({
            opacity: 255,
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this._confirmFor.grab_key_focus();
    }

    open() {
        Main.uiGroup.add_child(this);
        this._grab = Main.pushModal(this, {actionMode: Shell.ActionMode.SYSTEM_MODAL});

        const last = this._buttons[this._ids.indexOf(this._initialId)];
        const first = last?.reactive ? last : this._buttons.find(b => b.reactive);
        (first ?? this).grab_key_focus();

        this._menu.set_pivot_point(0.5, 0.5);
        this._menu.set_scale(0.9, 0.9);
        this._menu.ease({
            scale_x: 1,
            scale_y: 1,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
        this.ease({
            opacity: 255,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });
    }

    close(animate = true) {
        if (this._closing)
            return;
        this._closing = true;

        if (this._grab) {
            Main.popModal(this._grab);
            this._grab = null;
        }

        if (!animate) {
            this.destroy();
            return;
        }
        this.ease({
            opacity: 0,
            duration: ANIMATION_TIME,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onStopped: () => this.destroy(),
        });
    }

    _focusedIndex() {
        const focus = global.stage.get_key_focus();
        return this._buttons.findIndex(b => b === focus || b.contains(focus));
    }

    // Next/previous button in display order, skipping unavailable ones.
    _step(delta) {
        const n = this._buttons.length;
        let i = Math.max(this._focusedIndex(), 0);
        for (let step = 0; step < n; step++) {
            i = (i + delta + n) % n;
            if (this._buttons[i].reactive)
                break;
        }
        this._buttons[i].grab_key_focus();
    }

    // Picks the closest button in the pressed direction. The square root of
    // the cosine keeps straight neighbours first in a grid but lets a
    // diagonal one that is much closer win (the middle of the 5-button
    // layout). Ties go to the button on the side we came from, so in that
    // layout top-left -> middle -> right lands on top-right.
    _moveSpatial(dx, dy) {
        const i = Math.max(this._focusedIndex(), 0);
        const [x, y] = this._centers[i];
        const previous = this._previousCenter;
        const across = ([cx, cy]) => (dx !== 0 ? cy : cx);
        let best = -1;
        let bestScore = Infinity;

        this._centers.forEach((center, j) => {
            if (j === i || !this._buttons[j].reactive)
                return;
            const [cx, cy] = center;
            const dist = Math.hypot(cx - x, cy - y);
            const cos = ((cx - x) * dx + (cy - y) * dy) / dist;
            if (cos < 0.3)
                return;
            const score = dist / Math.sqrt(cos);
            const tie = best >= 0 && Math.abs(score - bestScore) < 1;
            if (tie && previous) {
                const target = across(previous);
                if (Math.abs(across(center) - target) >= Math.abs(across(this._centers[best]) - target))
                    return;
            } else if (score >= bestScore) {
                return;
            }
            bestScore = score;
            best = j;
        });

        // Nothing ahead: wrap to the far end of the same row or column.
        if (best < 0) {
            let farthest = 0;
            this._centers.forEach(([cx, cy], j) => {
                if (j === i || !this._buttons[j].reactive)
                    return;
                const dist = Math.hypot(cx - x, cy - y);
                const cos = ((cx - x) * dx + (cy - y) * dy) / dist;
                if (cos < -0.9 && dist > farthest) {
                    farthest = dist;
                    best = j;
                }
            });
        }

        this._previousCenter = this._centers[i];
        if (best >= 0)
            this._buttons[best].grab_key_focus();
        else
            this._step(dx + dy > 0 ? 1 : -1);
    }

    _move(dx, dy) {
        if (this._buttons.length === 0)
            return;

        this._moveSpatial(dx, dy);
    }

    _confirmKeyPress(symbol) {
        switch (symbol) {
        case Clutter.KEY_Escape:
            this._hideConfirmation();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Left:
        case Clutter.KEY_Right:
        case Clutter.KEY_Tab:
        case Clutter.KEY_ISO_Left_Tab: {
            const [cancel, confirm] = this._dialogButtons;
            (confirm.has_key_focus() ? cancel : confirm).grab_key_focus();
            return Clutter.EVENT_STOP;
        }
        }
        // Enter and Space are handled by the focused St.Button before reaching
        // here; swallow the rest so action shortcuts do not fire behind.
        return Clutter.EVENT_STOP;
    }

    vfunc_key_press_event(event) {
        if (this._confirmBox)
            return this._confirmKeyPress(event.get_key_symbol());

        switch (event.get_key_symbol()) {
        case Clutter.KEY_Escape:
            this.close();
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Tab:
            if (this._buttons.length > 0)
                this._step(1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_ISO_Left_Tab:
            if (this._buttons.length > 0)
                this._step(-1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Left:
            this._move(-1, 0);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Right:
            this._move(1, 0);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Up:
            this._move(0, -1);
            return Clutter.EVENT_STOP;
        case Clutter.KEY_Down:
            this._move(0, 1);
            return Clutter.EVENT_STOP;
        }

        const unicode = event.get_key_unicode();
        const button = unicode ? this._shortcuts.get(unicode.toLowerCase()) : null;
        if (button?.reactive) {
            button.grab_key_focus();
            button.emit('clicked', 0);
            return Clutter.EVENT_STOP;
        }
        return super.vfunc_key_press_event(event);
    }

    vfunc_button_press_event(event) {
        const actor = global.stage.get_event_actor(event);
        if (this._confirmBox) {
            if (!this._confirmBox.contains(actor))
                this._hideConfirmation();
        } else if (this._closeOnClickOutside && !this._menu.contains(actor)) {
            this.close();
        }
        return Clutter.EVENT_STOP;
    }
});

const Indicator = GObject.registerClass(
class Indicator extends PanelMenu.Button {
    _init(onActivate) {
        super._init(0.0, _('Power Menu'), true);
        this.add_child(new St.Icon({
            icon_name: 'system-shutdown-symbolic',
            style_class: 'system-status-icon',
        }));
        this._onActivate = onActivate;
    }

    vfunc_event(event) {
        const type = event.type();
        if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
            this._onActivate();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }
});

export default class FastGnomeMenuExtension extends Extension {
    enable() {
        this._settings = this.getSettings();

        Main.wm.addKeybinding('toggle-menu', this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.SYSTEM_MODAL,
            () => {
                // SYSTEM_MODAL is only there so the shortcut can close our own
                // menu; never open on top of another modal dialog.
                const canOpen = Main.actionMode & (Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW);
                if (this._menu || canOpen)
                    this.toggle();
            });

        this._settings.connectObject('changed::show-indicator',
            () => this._syncIndicator(), this);
        this._syncIndicator();
    }

    disable() {
        Main.wm.removeKeybinding('toggle-menu');
        this._settings.disconnectObject(this);
        this._menu?.close(false);
        this._menu = null;
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    toggle() {
        if (this._menu) {
            this._menu.close();
            return;
        }

        const menu = new PowerMenu(this._settings);
        menu.connect('action-activated', (_menu, id) => {
            menu.close(false);
            this._settings.set_string('last-action', id);
            this._activate(id);
        });
        menu.connect('destroy', () => {
            if (this._menu === menu)
                this._menu = null;
        });
        menu.open();
        this._menu = menu;
    }

    _syncIndicator() {
        const show = this._settings.get_boolean('show-indicator');
        if (show && !this._indicator) {
            this._indicator = new Indicator(() => this.toggle());
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } else if (!show && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _activate(id) {
        // Set by `./build.sh dev`: the nested shell shares the system bus, so a
        // real PowerOff/Reboot would hit the host machine.
        if (GLib.getenv('FAST_GNOME_MENU_DRY_RUN')) {
            console.log(`[${this.uuid}] Dry run: would activate ${id}`);
            return;
        }

        if (id.startsWith(CUSTOM_PREFIX)) {
            this._runCustom(id);
            return;
        }

        const systemActions = SystemActions.getDefault();

        try {
            switch (id) {
            case 'lock-screen':
                systemActions.activateLockScreen();
                break;
            case 'logout':
                // Mode 1: no GNOME dialog, the menu already asked if needed.
                Main.overview.hide();
                this._callDBus(Gio.DBus.session, 'org.gnome.SessionManager',
                    '/org/gnome/SessionManager', 'org.gnome.SessionManager',
                    'Logout', new GLib.Variant('(u)', [1]));
                break;
            case 'suspend':
                systemActions.activateSuspend();
                break;
            case 'hibernate':
                this._callLogind('Hibernate');
                break;
            case 'switch-user':
                systemActions.activateSwitchUser();
                break;
            case 'restart':
                this._callLogind('Reboot');
                break;
            case 'power-off':
                this._callLogind('PowerOff');
                break;
            }
        } catch (e) {
            logError(e, `[${this.uuid}] Failed to run action ${id}`);
        }
    }

    // The command line is split into argv like a shell would, but no shell
    // runs it: no expansion, pipes or redirections. Spawn errors are shown
    // as a notification by Util.spawn.
    _runCustom(id) {
        const entry = this._settings.get_value('custom-actions').deepUnpack()
            .find(([customId]) => customId === id);
        if (!entry)
            return;

        try {
            const [, argv] = GLib.shell_parse_argv(entry[3]);
            Util.spawn(argv);
        } catch (e) {
            logError(e, `[${this.uuid}] Invalid command for ${entry[1]}`);
            Main.notifyError(_('Could not run “%s”').format(entry[1]), e.message);
        }
    }

    // gnome-session no longer offers a prompt-less shutdown/reboot, so go
    // straight to logind. interactive=true lets polkit ask when needed.
    _callLogind(method) {
        this._callDBus(Gio.DBus.system, 'org.freedesktop.login1',
            '/org/freedesktop/login1', 'org.freedesktop.login1.Manager',
            method, new GLib.Variant('(b)', [true]));
    }

    _callDBus(bus, name, path, iface, method, params) {
        bus.call(name, path, iface, method, params, null,
            Gio.DBusCallFlags.ALLOW_INTERACTIVE_AUTHORIZATION, -1, null,
            (conn, res) => {
                try {
                    conn.call_finish(res);
                } catch (e) {
                    logError(e, `[${this.uuid}] ${iface}.${method} failed`);
                }
            });
    }
}
