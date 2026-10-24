// Catalog of the actions the menu can show. Shared by extension.js and prefs.js,
// so it must not import anything from GNOME Shell.

/**
 * @param {Function} _ gettext function of the calling context
 * @returns {Map<string, {name: string, iconName: string, key: string}>}
 */
export function getActions(_) {
    return new Map([
        ['lock-screen', {name: _('Lock'), iconName: 'system-lock-screen-symbolic', key: 'l'}],
        ['logout', {name: _('Log Out'), iconName: 'system-log-out-symbolic', key: 'e'}],
        ['suspend', {name: _('Suspend'), iconName: 'weather-clear-night-symbolic', key: 's'}],
        ['switch-user', {name: _('Switch User'), iconName: 'system-switch-user-symbolic', key: 'u'}],
        ['restart', {name: _('Restart'), iconName: 'system-reboot-symbolic', key: 'r'}],
        ['power-off', {name: _('Power Off'), iconName: 'system-shutdown-symbolic', key: 'p'}],
    ]);
}
