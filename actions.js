// Catalog of the actions the menu can show. Shared by extension.js and prefs.js,
// so it must not import anything from GNOME Shell.

export const CUSTOM_PREFIX = 'custom-';
export const CUSTOM_ICON = 'system-run-symbolic';

/**
 * @param {Function} _ gettext function of the calling context
 * @param {string[][]} custom entries of the custom-actions key:
 *   [id, name, icon name, command line]
 * @returns {Map<string, {name: string, iconName: string, key: ?string, command: ?string}>}
 */
export function getActions(_, custom = []) {
    const actions = new Map([
        ['lock-screen', {name: _('Lock'), iconName: 'system-lock-screen-symbolic', key: 'l'}],
        ['logout', {name: _('Log Out'), iconName: 'system-log-out-symbolic', key: 'e'}],
        ['suspend', {name: _('Suspend'), iconName: 'weather-clear-night-symbolic', key: 's'}],
        ['hibernate', {name: _('Hibernate'), iconName: 'drive-harddisk-symbolic', key: 'h'}],
        ['switch-user', {name: _('Switch User'), iconName: 'system-switch-user-symbolic', key: 'u'}],
        ['restart', {name: _('Restart'), iconName: 'system-reboot-symbolic', key: 'r'}],
        ['power-off', {name: _('Power Off'), iconName: 'system-shutdown-symbolic', key: 'p'}],
    ]);
    for (const [id, name, iconName, command] of custom) {
        if (id.startsWith(CUSTOM_PREFIX) && name && command)
            actions.set(id, {name, iconName: iconName || CUSTOM_ICON, key: null, command});
    }
    return actions;
}

/**
 * Gives `accel` to action `id` in a copy of the action-shortcuts map. Any
 * other action holding the same accelerator loses it, so one key combination
 * never selects two actions. An empty `accel` removes the shortcut of `id`.
 *
 * @param {Object<string, string>} shortcuts action id -> accelerator
 * @param {string} id action to change
 * @param {string} accel accelerator such as "<Alt>p", or ''
 * @returns {Object<string, string>} the new map
 */
export function assignShortcut(shortcuts, id, accel) {
    const result = {};
    for (const [other, value] of Object.entries(shortcuts)) {
        if (other !== id && value && value !== accel)
            result[other] = value;
    }
    if (accel)
        result[id] = accel;
    return result;
}
