import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {CUSTOM_ICON, CUSTOM_PREFIX, getActions} from './actions.js';

const DEFAULT_HIGHLIGHT = '#3584e4';

function getCustomEntries(settings) {
    return settings.get_value('custom-actions').deepUnpack();
}

function setCustomEntries(settings, entries) {
    settings.set_value('custom-actions', new GLib.Variant('a(ssss)', entries));
}

function rgbaToHex(rgba) {
    return `#${[rgba.red, rgba.green, rgba.blue]
        .map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Connects `callback` to changes of `keys`, except while `guard.busy` is
 * set, so a widget does not rebuild itself in reaction to its own write.
 *
 * @param {Gio.Settings} settings settings to watch
 * @param {string[]} keys keys to watch
 * @param {{busy: boolean}} guard shared flag
 * @param {Function} callback called on external changes
 */
function watch(settings, keys, guard, callback) {
    for (const key of keys) {
        settings.connect(`changed::${key}`, () => {
            if (!guard.busy)
                callback();
        });
    }
}

function guarded(guard, write) {
    guard.busy = true;
    try {
        write();
    } finally {
        guard.busy = false;
    }
}

const ActionsGroup = GObject.registerClass(
class ActionsGroup extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({
            title: _('Order and visibility'),
            description: _('Choose which buttons appear and in which order.'),
        });
        this._settings = settings;
        this._guard = {busy: false};
        this._rows = [];
        this._order = [];

        watch(settings, ['actions', 'custom-actions'], this._guard, () => this._load());
        this._load();
    }

    // Enabled actions first, in their saved order; the disabled ones keep
    // their previous place, and new ones go last.
    _load() {
        this._catalog = getActions(_, getCustomEntries(this._settings));
        const enabled = this._settings.get_strv('actions').filter(id => this._catalog.has(id));
        const rest = [...this._order, ...this._catalog.keys()]
            .filter((id, i, all) => this._catalog.has(id) && !enabled.includes(id) && all.indexOf(id) === i);
        this._order = [...enabled, ...rest];
        this._enabled = new Set(enabled);
        this._rebuild();
    }

    _save() {
        guarded(this._guard, () =>
            this._settings.set_strv('actions', this._order.filter(id => this._enabled.has(id))));
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
                subtitle: action.command ?? _('Shortcut key: %s').format(action.key.toUpperCase()),
                subtitle_lines: 1,
                use_markup: false,
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

const CustomActionsGroup = GObject.registerClass(
class CustomActionsGroup extends Adw.PreferencesGroup {
    _init(settings) {
        super._init({
            title: _('Custom actions'),
            description: _('Run your own commands from the menu. Commands run directly, without a shell: use sh -c "…" for pipes or variables.'),
        });
        this._settings = settings;
        this._rows = [];

        const add = new Gtk.Button({
            icon_name: 'list-add-symbolic',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
            tooltip_text: _('Add custom action'),
        });
        add.connect('clicked', () => this._edit(null));
        this.header_suffix = add;

        settings.connect('changed::custom-actions', () => this._rebuild());
        this._rebuild();
    }

    _rebuild() {
        this._rows.forEach(row => this.remove(row));
        const entries = getCustomEntries(this._settings);

        if (entries.length === 0) {
            this._rows = [new Adw.ActionRow({
                title: _('No custom actions yet'),
                css_classes: ['dim-label'],
            })];
        } else {
            this._rows = entries.map(entry => {
                const [, name, iconName, command] = entry;
                const row = new Adw.ActionRow({
                    title: name,
                    subtitle: command,
                    subtitle_lines: 1,
                    use_markup: false,
                });
                row.add_prefix(new Gtk.Image({icon_name: iconName || CUSTOM_ICON}));

                const edit = new Gtk.Button({
                    icon_name: 'document-edit-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Edit'),
                });
                edit.connect('clicked', () => this._edit(entry));
                const remove = new Gtk.Button({
                    icon_name: 'user-trash-symbolic',
                    valign: Gtk.Align.CENTER,
                    css_classes: ['flat'],
                    tooltip_text: _('Delete'),
                });
                remove.connect('clicked', () => this._delete(entry));
                row.add_suffix(edit);
                row.add_suffix(remove);
                return row;
            });
        }
        this._rows.forEach(row => this.add(row));
    }

    _edit(entry) {
        const dialog = new Adw.AlertDialog({
            heading: entry ? _('Edit Custom Action') : _('New Custom Action'),
            default_response: 'save',
            close_response: 'cancel',
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('save', _('Save'));
        dialog.set_response_appearance('save', Adw.ResponseAppearance.SUGGESTED);

        const nameRow = new Adw.EntryRow({title: _('Name'), text: entry?.[1] ?? ''});
        const iconRow = new Adw.EntryRow({title: _('Icon name (optional)'), text: entry?.[2] ?? ''});
        const preview = new Gtk.Image({valign: Gtk.Align.CENTER});
        iconRow.add_suffix(preview);
        const commandRow = new Adw.EntryRow({title: _('Command'), text: entry?.[3] ?? ''});

        const list = new Gtk.ListBox({
            css_classes: ['boxed-list'],
            selection_mode: Gtk.SelectionMode.NONE,
        });
        [nameRow, iconRow, commandRow].forEach(row => list.append(row));

        const hint = new Gtk.Label({
            wrap: true,
            xalign: 0,
            css_classes: ['dim-label', 'caption'],
        });
        const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, spacing: 12});
        box.append(list);
        box.append(hint);
        dialog.extra_child = box;

        const iconTheme = Gtk.IconTheme.get_for_display(Gdk.Display.get_default());
        const validate = () => {
            const messages = [];
            const name = nameRow.text.trim();
            nameRow.remove_css_class('error');
            if (!name) {
                nameRow.add_css_class('error');
                messages.push(_('Give the action a name.'));
            }

            const iconName = iconRow.text.trim() || CUSTOM_ICON;
            const hasIcon = iconTheme.has_icon(iconName);
            preview.icon_name = hasIcon ? iconName : 'dialog-warning-symbolic';
            if (!hasIcon)
                messages.push(_('Icon not found; the default icon will be used.'));

            let commandOk = false;
            commandRow.remove_css_class('error');
            commandRow.remove_css_class('warning');
            try {
                const [, argv] = GLib.shell_parse_argv(commandRow.text.trim());
                commandOk = true;
                if (!GLib.find_program_in_path(argv[0])) {
                    commandRow.add_css_class('warning');
                    messages.push(_('“%s” was not found in PATH.').format(argv[0]));
                }
            } catch {
                commandRow.add_css_class('error');
                messages.push(_('Enter a command, with quotes balanced.'));
            }

            hint.label = messages.join('\n');
            hint.visible = messages.length > 0;
            dialog.set_response_enabled('save', Boolean(name) && commandOk);
        };
        [nameRow, iconRow, commandRow].forEach(row => row.connect('changed', validate));
        validate();

        dialog.connect('response', (_d, response) => {
            if (response !== 'save')
                return;
            const entries = getCustomEntries(this._settings);
            const id = entry?.[0] ?? `${CUSTOM_PREFIX}${GLib.uuid_string_random().slice(0, 8)}`;
            const value = [id, nameRow.text.trim(), iconRow.text.trim(), commandRow.text.trim()];
            const index = entries.findIndex(([other]) => other === id);
            if (index >= 0) {
                entries[index] = value;
            } else {
                entries.push(value);
                // New actions show up in the menu right away.
                this._settings.set_strv('actions', [...this._settings.get_strv('actions'), id]);
            }
            setCustomEntries(this._settings, entries);
        });
        dialog.present(this.get_root());
    }

    _delete([id, name]) {
        const dialog = new Adw.AlertDialog({
            heading: _('Delete “%s”?').format(name),
            default_response: 'cancel',
            close_response: 'cancel',
        });
        dialog.add_response('cancel', _('Cancel'));
        dialog.add_response('delete', _('Delete'));
        dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
        dialog.connect('response', (_d, response) => {
            if (response !== 'delete')
                return;
            const settings = this._settings;
            for (const key of ['actions', 'confirm-list'])
                settings.set_strv(key, settings.get_strv(key).filter(other => other !== id));
            if (settings.get_string('last-action') === id)
                settings.reset('last-action');
            setCustomEntries(settings, getCustomEntries(settings).filter(([other]) => other !== id));
        });
        dialog.present(this.get_root());
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
        window.set_default_size(640, 760);

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
            return row;
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

        // Actions
        const actionsPage = new Adw.PreferencesPage({
            name: 'actions',
            title: _('Actions'),
            icon_name: 'view-app-grid-symbolic',
        });
        window.add(actionsPage);
        actionsPage.add(new ActionsGroup(settings));
        actionsPage.add(new CustomActionsGroup(settings));

        // Appearance
        const appearancePage = new Adw.PreferencesPage({
            name: 'appearance',
            title: _('Appearance'),
            icon_name: 'preferences-desktop-appearance-symbolic',
        });
        window.add(appearancePage);

        const buttonsGroup = new Adw.PreferencesGroup({title: _('Buttons')});
        appearancePage.add(buttonsGroup);
        choice(buttonsGroup, 'layout', _('Layout'),
            [['auto', _('Automatic')], ['grid', _('Grid')]]);
        const columnsRow = spin(buttonsGroup, 'columns', _('Buttons per row'), 1, 6, 1);
        const syncLayout = () => {
            columnsRow.sensitive = settings.get_string('layout') === 'grid';
        };
        settings.connect('changed::layout', syncLayout);
        syncLayout();
        spin(buttonsGroup, 'button-size', _('Button size (px)'), 64, 256, 8);
        spin(buttonsGroup, 'corner-radius', _('Corner radius (px)'), 0, 64, 2);
        spin(buttonsGroup, 'spacing', _('Space between buttons (px)'), 0, 64, 2);
        spin(buttonsGroup, 'icon-size', _('Icon size (%)'), 20, 70, 2,
            _('Relative to the button size'));
        spin(buttonsGroup, 'focus-scale', _('Selected button size (%)'), 100, 130, 1,
            _('100 turns the growth animation off'));
        toggle(buttonsGroup, 'show-labels', _('Show labels'));

        const colorsGroup = new Adw.PreferencesGroup({title: _('Colors and background')});
        appearancePage.add(colorsGroup);

        const colorRow = new Adw.ActionRow({
            title: _('Custom highlight color'),
            subtitle: _('Use this color instead of the system accent color'),
        });
        const colorButton = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: false}),
            valign: Gtk.Align.CENTER,
        });
        const colorSwitch = new Gtk.Switch({valign: Gtk.Align.CENTER});
        colorRow.add_suffix(colorButton);
        colorRow.add_suffix(colorSwitch);
        colorRow.activatable_widget = colorSwitch;
        colorsGroup.add(colorRow);

        const colorGuard = {busy: false};
        const syncColor = () => guarded(colorGuard, () => {
            const value = settings.get_string('highlight-color');
            const valid = /^#[0-9a-fA-F]{6}$/.test(value);
            const rgba = new Gdk.RGBA();
            rgba.parse(valid ? value : DEFAULT_HIGHLIGHT);
            colorButton.rgba = rgba;
            colorButton.sensitive = valid;
            colorSwitch.active = valid;
        });
        watch(settings, ['highlight-color'], colorGuard, syncColor);
        syncColor();
        const saveColor = () => {
            if (colorGuard.busy)
                return;
            guarded(colorGuard, () => {
                settings.set_string('highlight-color',
                    colorSwitch.active ? rgbaToHex(colorButton.rgba) : '');
                colorButton.sensitive = colorSwitch.active;
            });
        };
        colorSwitch.connect('notify::active', saveColor);
        colorButton.connect('notify::rgba', saveColor);

        toggle(colorsGroup, 'show-panel', _('Show panel background'),
            _('When off, the buttons float over the dimmed screen'));
        spin(colorsGroup, 'backdrop-opacity', _('Background dimming (%)'), 0, 100, 5);

        // Behavior
        const behaviorPage = new Adw.PreferencesPage({
            name: 'behavior',
            title: _('Behavior'),
            icon_name: 'preferences-system-symbolic',
        });
        window.add(behaviorPage);

        const generalGroup = new Adw.PreferencesGroup({title: _('General')});
        behaviorPage.add(generalGroup);
        generalGroup.add(new ShortcutRow(settings, 'toggle-menu'));
        toggle(generalGroup, 'show-indicator', _('Show button in the top bar'));
        choice(generalGroup, 'monitor', _('Open on'), [
            ['pointer', _('Monitor with the pointer')],
            ['primary', _('Primary monitor')],
        ]);
        choice(generalGroup, 'initial-focus', _('Selected when opening'), [
            ['first', _('First action')],
            ['last', _('Last action used')],
        ]);
        toggle(generalGroup, 'close-on-click-outside', _('Close when clicking outside'));

        const confirmGroup = new Adw.PreferencesGroup({
            title: _('Confirmation'),
            description: _('Before running an action, show it with a countdown and the Cancel and Confirm buttons.'),
        });
        behaviorPage.add(confirmGroup);

        choice(confirmGroup, 'confirm-mode', _('Ask for confirmation'), [
            ['none', _('Never')],
            ['all', _('For every action')],
            ['custom', _('Only for the selected actions')],
        ]);
        const timeoutRow = spin(confirmGroup, 'confirm-timeout', _('Countdown (seconds)'), 5, 300, 5,
            _('When it ends, the action runs on its own'));
        const defaultRow = choice(confirmGroup, 'confirm-default', _('Button selected first'), [
            ['cancel', _('Cancel')],
            ['confirm', _('Confirm')],
        ]);

        const listRow = new Adw.ExpanderRow({title: _('Actions that ask for confirmation')});
        confirmGroup.add(listRow);
        const listGuard = {busy: false};
        let listRows = [];
        const fillList = () => {
            listRows.forEach(row => listRow.remove(row));
            const confirmList = settings.get_strv('confirm-list');
            listRows = [...getActions(_, getCustomEntries(settings))].map(([id, action]) => {
                const row = new Adw.SwitchRow({title: action.name, use_markup: false});
                row.add_prefix(new Gtk.Image({icon_name: action.iconName}));
                row.active = confirmList.includes(id);
                row.connect('notify::active', () => guarded(listGuard, () => {
                    const list = settings.get_strv('confirm-list').filter(other => other !== id);
                    if (row.active)
                        list.push(id);
                    settings.set_strv('confirm-list', list);
                }));
                listRow.add_row(row);
                return row;
            });
        };
        watch(settings, ['confirm-list', 'custom-actions'], listGuard, fillList);
        fillList();

        const syncConfirm = () => {
            const mode = settings.get_string('confirm-mode');
            timeoutRow.sensitive = mode !== 'none';
            defaultRow.sensitive = mode !== 'none';
            listRow.sensitive = mode === 'custom';
            listRow.expanded = mode === 'custom';
        };
        settings.connect('changed::confirm-mode', syncConfirm);
        syncConfirm();

        const resetGroup = new Adw.PreferencesGroup();
        behaviorPage.add(resetGroup);
        const resetRow = new Adw.ButtonRow({title: _('Reset All Settings')});
        resetRow.add_css_class('destructive-action');
        resetRow.connect('activated', () => {
            const dialog = new Adw.AlertDialog({
                heading: _('Reset all settings?'),
                body: _('Every option goes back to its default and the custom actions are deleted.'),
                default_response: 'cancel',
                close_response: 'cancel',
            });
            dialog.add_response('cancel', _('Cancel'));
            dialog.add_response('reset', _('Reset'));
            dialog.set_response_appearance('reset', Adw.ResponseAppearance.DESTRUCTIVE);
            dialog.connect('response', (_d, response) => {
                if (response === 'reset')
                    settings.settings_schema.list_keys().forEach(key => settings.reset(key));
            });
            dialog.present(window);
        });
        resetGroup.add(resetRow);

        // Lets tests/smoke.sh screenshot every page.
        const page = GLib.getenv('FAST_GNOME_MENU_PREFS_PAGE');
        if (page)
            window.visible_page_name = page;
    }
}
