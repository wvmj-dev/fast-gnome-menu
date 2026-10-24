// Unit tests for the pure modules. Run with: gjs -m tests/unit.js
// (or ./build.sh unit). No GNOME Shell needed.
import {getActions, CUSTOM_ICON} from '../actions.js';
import {contrastColor, parseColor} from '../color.js';
import {getCells, pickNeighbour} from '../layout.js';

let failures = 0;
let count = 0;
function check(name, condition, detail = '') {
    count++;
    if (!condition) {
        failures++;
        print(`FAIL ${name} ${detail}`);
    }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Square buttons of one cell overlap when both offsets are under one cell.
function overlaps(cells) {
    for (let i = 0; i < cells.length; i++) {
        for (let j = i + 1; j < cells.length; j++) {
            const [dx, dy] = [Math.abs(cells[i][0] - cells[j][0]), Math.abs(cells[i][1] - cells[j][1])];
            if (dx < 1 - 1e-9 && dy < 1 - 1e-9)
                return [i, j];
        }
    }
    return null;
}

// --- getCells ---------------------------------------------------------------
const layouts = ['auto', 'grid', 'row', 'column', 'circle', 'circle-center', 'custom'];
for (const layout of layouts) {
    for (let n = 1; n <= 9; n++) {
        const cells = getCells(n, layout, 3, ['x.x', '.x.']);
        check(`${layout} n=${n} count`, cells.length === n, `got ${cells.length}`);
        check(`${layout} n=${n} normalized`,
            Math.min(...cells.map(([x]) => x)) > -1e-9 && Math.min(...cells.map(([, y]) => y)) > -1e-9);
        const clash = overlaps(cells);
        check(`${layout} n=${n} no overlap`, clash === null, JSON.stringify(clash));
    }
}
check('auto 4 is 2x2', same(getCells(4, 'auto', 0, []), [[0, 0], [1, 0], [0, 1], [1, 1]]));
check('auto 5 is a die face', same(getCells(5, 'auto', 0, []), [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]));
check('auto 6 is 2x3', same(getCells(6, 'auto', 0, []).map(([, y]) => y), [0, 0, 0, 1, 1, 1]));
check('row', getCells(4, 'row', 0, []).every(([, y]) => y === 0));
check('column', getCells(4, 'column', 0, []).every(([x]) => x === 0));
check('grid centres a short last row', same(getCells(4, 'grid', 3, []).at(-1), [1, 1]));
check('circle-center puts the first in the middle', (() => {
    const cells = getCells(5, 'circle-center', 0, []);
    const [cx, cy] = [Math.max(...cells.map(([x]) => x)) / 2, Math.max(...cells.map(([, y]) => y)) / 2];
    return Math.hypot(cells[0][0] - cx, cells[0][1] - cy) < 1e-9;
})());
check('custom follows the drawing', same(getCells(3, 'custom', 0, ['x.x', '.x.']), [[0, 0], [2, 0], [1, 1]]));
check('custom overflows below', same(getCells(4, 'custom', 0, ['x.x']), [[0, 0], [2, 0], [0, 1], [1, 1]]));
check('custom with an empty drawing', getCells(2, 'custom', 0, []).length === 2);
check('custom ignores other characters', same(getCells(1, 'custom', 0, ['.o#X']), [[0, 0]]));

// --- pickNeighbour ----------------------------------------------------------
const KEYS = {'←': [-1, 0], '→': [1, 0], '↑': [0, -1], '↓': [0, 1]};
function walk(cells, start, keys, available = cells.map(() => true)) {
    const centers = cells.map(([x, y]) => [x * 100, y * 100]);
    let at = start;
    let previous = null;
    const path = [at];
    for (const key of keys) {
        const [dx, dy] = KEYS[key];
        const next = pickNeighbour(centers, available, at, dx, dy, previous);
        previous = centers[at];
        if (next >= 0)
            at = next;
        path.push(at);
    }
    return path;
}
const grid4 = getCells(4, 'auto', 0, []);
check('2x2 right', same(walk(grid4, 0, ['→']), [0, 1]));
check('2x2 down', same(walk(grid4, 0, ['↓']), [0, 2]));
check('2x2 wraps', same(walk(grid4, 1, ['→']), [1, 0]));
const die = getCells(5, 'auto', 0, []);
check('die: corner to middle to same side', same(walk(die, 0, ['→', '→']), [0, 2, 1]));
check('die: down through the middle', same(walk(die, 0, ['↓', '↓']), [0, 2, 3]));
check('die: every button reachable', (() => {
    const seen = new Set();
    for (let s = 0; s < 5; s++) {
        for (const key of Object.keys(KEYS))
            walk(die, s, [key]).forEach(i => seen.add(i));
    }
    return seen.size === 5;
})());
const grid6 = getCells(6, 'auto', 0, []);
check('2x3 row', same(walk(grid6, 0, ['→', '→', '→']), [0, 1, 2, 0]));
check('2x3 column', same(walk(grid6, 1, ['↓', '↓']), [1, 4, 1]));
check('skips unavailable', same(walk(grid6, 0, ['→'], [true, false, true, true, true, true]), [0, 2]));
check('nothing available', walk(grid4, 0, ['→'], [true, false, false, false]).at(-1) === 0);

// --- color ------------------------------------------------------------------
check('color accepts #rrggbb', parseColor('#E5A50A') === '#e5a50a');
for (const bad of ['', 'red', '#fff', '#12345g', '#123456; color: red', ' #123456', 'url(x)'])
    check(`color rejects ${JSON.stringify(bad)}`, parseColor(bad) === null);
check('contrast on yellow is black', contrastColor('#e5a50a') === '#000000');
check('contrast on blue is white', contrastColor('#3584e4') === '#ffffff');

// --- actions ----------------------------------------------------------------
const id = s => s;
const catalog = getActions(id, [
    ['custom-ok', 'Terminal', '', 'gnome-terminal'],
    ['custom-noname', '', 'x', 'ls'],
    ['custom-nocmd', 'Empty', 'x', ''],
    ['not-custom', 'Bad id', 'x', 'ls'],
]);
check('built-ins present', ['lock-screen', 'logout', 'suspend', 'hibernate', 'switch-user', 'restart', 'power-off']
    .every(k => catalog.has(k)));
check('custom action kept with default icon', catalog.get('custom-ok')?.iconName === CUSTOM_ICON);
check('custom action has no letter', catalog.get('custom-ok')?.key === null);
check('invalid custom actions dropped', !catalog.has('custom-noname') && !catalog.has('custom-nocmd') && !catalog.has('not-custom'));
check('letters are unique', (() => {
    const keys = [...catalog.values()].map(a => a.key).filter(Boolean);
    return new Set(keys).size === keys.length;
})());

print(failures ? `${failures} of ${count} checks failed` : `OK: ${count} checks passed`);
if (failures)
    imports.system.exit(1);
