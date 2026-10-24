import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {getActions} from './actions.js';

const ActionsGroup = GObject.registerClass(
class ActionsGroup extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({
            title: _('Actions'),
            description: _('Choose which buttons appear and in which order.'),
        });
        this._settings = settings;
        this._catalog = getActions(_);
        this._rows = [];

        const enabled = settings.get_strv('actions').filter(id => this._catalog.has(id));
        this._order = [...enabled, ...[...this._catalog.keys()].filter(id => !enabled.includes(id))];
        this._enabled = new Set(enabled);
        this._rebuild();
    }

    _save() {
        this._settings.set_strv('actions', this._order.filter(id => this._enabled.has(id)));
    }

    _swap(i, j) {
        [this._order[i], this._order[j]] = [this._order[j], this._order[i]];
        this._save();
        this._rebuild();
    }

    _rebuild() {
        this._rows.forEach(row => this.remove(row));
        this._rows = this._order.map((id, i) => {
            const action = this._catalog.get(id);
            const row = new Adw.ActionRow({
                title: action.name,
                subtitle: _('Shortcut key: %s').format(action.key.toUpperCase()),
            });
            row.add_prefix(new Gtk.Image({icon_name: action.iconName}));

            const up = new Gtk.Button({
                icon_name: 'go-up-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: i > 0,
                tooltip_text: _('Move up'),
            });
            up.connect('clicked', () => this._swap(i, i - 1));

            const down = new Gtk.Button({
                icon_name: 'go-down-symbolic',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: i < this._order.length - 1,
                tooltip_text: _('Move down'),
            });
            down.connect('clicked', () => this._swap(i, i + 1));

            const toggle = new Gtk.Switch({
                active: this._enabled.has(id),
                valign: Gtk.Align.CENTER,
            });
            toggle.connect('notify::active', () => {
                if (toggle.active)
                    this._enabled.add(id);
                else
                    this._enabled.delete(id);
                this._save();
            });

            row.add_suffix(up);
            row.add_suffix(down);
            row.add_suffix(toggle);
            row.activatable_widget = toggle;
            this.add(row);
            return row;
        });
    }
});

const ShortcutRow = GObject.registerClass(
class ShortcutRow extends Adw.ActionRow {
    _init(settings, key) {
        super._init({
            title: _('Open menu'),
            subtitle: _('Keyboard shortcut that shows the menu'),
            activatable: true,
        });
        this._settings = settings;
        this._key = key;

        this._label = new Gtk.ShortcutLabel({
            disabled_text: _('Disabled'),
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(this._label);

        const reset = new Gtk.Button({
            icon_name: 'edit-undo-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Reset to default'),
        });
        reset.connect('clicked', () => settings.reset(key));
        this.add_suffix(reset);

        settings.connect(`changed::${key}`, () => this._sync());
        this._sync();
        this.connect('activated', () => this._capture());
    }

    _sync() {
        this._label.accelerator = this._settings.get_strv(this._key)[0] ?? '';
    }

    _capture() {
        const dialog = new Adw.AlertDialog({
            heading: _('Set Shortcut'),
            body: _('Press the new key combination, Esc to cancel or Backspace to disable.'),
        });
        dialog.add_response('cancel', _('Cancel'));

        const controller = new Gtk.EventControllerKey({
            propagation_phase: Gtk.PropagationPhase.CAPTURE,
        });
        controller.connect('key-pressed', (_c, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask();

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                this._settings.set_strv(this._key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (!Gtk.accelerator_valid(keyval, mask))
                return Gdk.EVENT_STOP;

            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            this._settings.set_strv(this._key, [accel]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);
        dialog.present(this.get_root());
    }
});

export default class FastGnomeMenuPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;

        const page = new Adw.PreferencesPage({
            title: _('General'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        page.add(new ActionsGroup(settings));

        const appearance = new Adw.PreferencesGroup({title: _('Appearance')});
        page.add(appearance);

        const spin = (group, key, title, min, max, step, subtitle = null) => {
            const row = Adw.SpinRow.new_with_range(min, max, step);
            row.title = title;
            row.subtitle = subtitle;
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
            return row;
        };
        const toggle = (group, key, title, subtitle = null) => {
            const row = new Adw.SwitchRow({title, subtitle});
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };
        // ComboRow for a string key with <choices>; options is [[value, label], ...].
        const choice = (group, key, title, options) => {
            const row = new Adw.ComboRow({
                title,
                model: Gtk.StringList.new(options.map(([, label]) => label)),
            });
            const values = options.map(([value]) => value);
            const sync = () => {
                row.selected = Math.max(values.indexOf(settings.get_string(key)), 0);
            };
            settings.connect(`changed::${key}`, sync);
            sync();
            row.connect('notify::selected', () => {
                if (settings.get_string(key) !== values[row.selected])
                    settings.set_string(key, values[row.selected]);
            });
            group.add(row);
            return row;
        };

        choice(appearance, 'layout', _('Layout'),
            [['auto', _('Automatic')], ['grid', _('Grid')]]);
        const columnsRow = spin(appearance, 'columns', _('Buttons per row'), 1, 6, 1);
        const syncLayout = () => {
            columnsRow.sensitive = settings.get_string('layout') === 'grid';
        };
        settings.connect('changed::layout', syncLayout);
        syncLayout();
        spin(appearance, 'button-size', _('Button size (px)'), 64, 256, 8);
        spin(appearance, 'corner-radius', _('Corner radius (px)'), 0, 64, 2);
        spin(appearance, 'backdrop-opacity', _('Background dimming (%)'), 0, 100, 5);
        toggle(appearance, 'show-labels', _('Show labels'));

        const confirmation = new Adw.PreferencesGroup({
            title: _('Confirmation'),
            description: _('Before running an action, show it with a countdown and the Cancel and Confirm buttons.'),
        });
        page.add(confirmation);

        choice(confirmation, 'confirm-mode', _('Ask for confirmation'), [
            ['none', _('Never')],
            ['all', _('For every action')],
            ['custom', _('Only for the selected actions')],
        ]);
        const timeoutRow = spin(confirmation, 'confirm-timeout', _('Countdown (seconds)'), 5, 300, 5,
            _('When it ends, the action runs on its own'));

        const listRow = new Adw.ExpanderRow({title: _('Actions that ask for confirmation')});
        confirmation.add(listRow);
        for (const [id, action] of getActions(_)) {
            const row = new Adw.SwitchRow({title: action.name});
            row.add_prefix(new Gtk.Image({icon_name: action.iconName}));
            row.active = settings.get_strv('confirm-list').includes(id);
            row.connect('notify::active', () => {
                const list = settings.get_strv('confirm-list').filter(other => other !== id);
                if (row.active)
                    list.push(id);
                settings.set_strv('confirm-list', list);
            });
            listRow.add_row(row);
        }

        const syncConfirm = () => {
            const mode = settings.get_string('confirm-mode');
            timeoutRow.sensitive = mode !== 'none';
            listRow.sensitive = mode === 'custom';
            listRow.expanded = mode === 'custom';
        };
        settings.connect('changed::confirm-mode', syncConfirm);
        syncConfirm();

        const behavior = new Adw.PreferencesGroup({title: _('Behavior')});
        page.add(behavior);

        behavior.add(new ShortcutRow(settings, 'toggle-menu'));
        toggle(behavior, 'show-indicator', _('Show button in the top bar'));
    }
}
