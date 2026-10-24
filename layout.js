// Button layouts and arrow-key navigation; no GNOME Shell imports, so
// tests/unit.js can load this.

// Layouts whose panel is drawn as a circle.
export const ROUND_LAYOUTS = ['circle', 'circle-center'];

// Rows of `columns` buttons; a shorter last row is centred.
function gridCells(n, columns) {
    columns = Math.max(1, Math.min(columns, n));
    const cells = [];
    for (let i = 0; i < n; i++) {
        const row = Math.floor(i / columns);
        const inRow = Math.min(columns, n - row * columns);
        cells.push([i % columns + (columns - inRow) / 2, row]);
    }
    return cells;
}

// Buttons on a ring, the first at the top, clockwise. Square buttons do not
// overlap when neighbouring centres are at least sqrt(2) cells apart; with a
// button in the middle, the ring also has to clear its corners.
function ringCells(n, withCenter) {
    const count = withCenter ? n - 1 : n;
    if (count <= 0)
        return [[0, 0]];

    let radius = count > 1 ? Math.SQRT1_2 / Math.sin(Math.PI / count) : 0;
    if (withCenter)
        radius = Math.max(radius, Math.SQRT2);
    const ring = Array.from({length: count}, (_, i) => {
        const angle = 2 * Math.PI * i / count;
        return [radius * Math.sin(angle), -radius * Math.cos(angle)];
    });
    return withCenter ? [[0, 0], ...ring] : ring;
}

// Each "x" in the drawing is a position, filled in reading order. Actions
// that do not fit continue in rows below, as wide as the drawing.
function patternCells(n, rows) {
    const cells = [];
    rows.forEach((row, y) => [...row].forEach((char, x) => {
        if (char === 'x' || char === 'X')
            cells.push([x, y]);
    }));
    const width = Math.max(1, ...rows.map(row => row.length));
    for (let extra = 0; cells.length < n; extra++)
        cells.push([extra % width, rows.length + Math.floor(extra / width)]);
    return cells.slice(0, n);
}

/**
 * Position [column, row] of each button, in units of one button plus the
 * spacing, shifted so the smallest column and row are 0. Values may be
 * fractional.
 *
 * @param {number} n number of buttons
 * @param {string} layout value of the layout key
 * @param {number} columns columns of the grid layout
 * @param {string[]} pattern drawing of the custom layout
 * @returns {number[][]}
 */
export function getCells(n, layout, columns, pattern) {
    let cells;
    switch (layout) {
    case 'grid':
        cells = gridCells(n, columns);
        break;
    case 'row':
        cells = gridCells(n, n);
        break;
    case 'column':
        cells = gridCells(n, 1);
        break;
    case 'circle':
    case 'circle-center':
        cells = ringCells(n, layout === 'circle-center');
        break;
    case 'custom':
        cells = patternCells(n, pattern);
        break;
    default:
        // 1-3 in a row, 4 as 2x2, 5 like a die face, 6 as 2x3, more in a
        // near-square grid.
        if (n === 5)
            cells = [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]];
        else
            cells = gridCells(n, n <= 3 ? n : n === 4 ? 2 : Math.ceil(Math.sqrt(n * 1.5)));
    }

    const minX = Math.min(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    return cells.map(([x, y]) => [x - minX, y - minY]);
}

// Closest button ahead in the pressed direction, by layout geometry only.
// The square root of the cosine keeps straight neighbours first in a grid
// but lets a diagonal one that is much closer win (the middle of the
// 5-button layout). Ties go to the button on the side we came from, so in
// that layout top-left -> middle -> right lands on top-right. With nothing
// ahead, wraps to the far end of the same row or column.
function nearestAhead(centers, from, dx, dy, previous) {
    const [x, y] = centers[from];
    const across = ([cx, cy]) => (dx !== 0 ? cy : cx);
    const geometry = ([cx, cy]) => {
        const dist = Math.hypot(cx - x, cy - y);
        return [dist, ((cx - x) * dx + (cy - y) * dy) / dist];
    };
    let best = -1;
    let bestScore = Infinity;

    centers.forEach((center, j) => {
        if (j === from)
            return;
        const [dist, cos] = geometry(center);
        if (cos < 0.3)
            return;
        const score = dist / Math.sqrt(cos);
        const tie = best >= 0 && Math.abs(score - bestScore) < 1;
        if (tie && previous) {
            const target = across(previous);
            if (Math.abs(across(center) - target) >= Math.abs(across(centers[best]) - target))
                return;
        } else if (score >= bestScore) {
            return;
        }
        bestScore = score;
        best = j;
    });

    if (best < 0) {
        let farthest = 0;
        centers.forEach((center, j) => {
            if (j === from)
                return;
            const [dist, cos] = geometry(center);
            if (cos < -0.9 && dist > farthest) {
                farthest = dist;
                best = j;
            }
        });
    }
    return best;
}

/**
 * Index of the button to focus when an arrow key is pressed, or -1 when there
 * is none (the caller then steps through the display order).
 *
 * Moves by layout geometry and hops over unavailable buttons in the same
 * direction, so a disabled button behaves like a gap that is skipped rather
 * than one that changes the route.
 *
 * @param {number[][]} centers button centres in pixels
 * @param {boolean[]} available whether each button can be focused
 * @param {number} from index of the focused button
 * @param {number} dx -1, 0 or 1
 * @param {number} dy -1, 0 or 1
 * @param {?number[]} previous centre of the button focused before `from`
 * @returns {number}
 */
export function pickNeighbour(centers, available, from, dx, dy, previous) {
    const visited = new Set([from]);
    let at = from;
    let before = previous;
    for (;;) {
        const next = nearestAhead(centers, at, dx, dy, before);
        if (next < 0 || visited.has(next))
            return -1;
        if (available[next])
            return next;
        visited.add(next);
        before = centers[at];
        at = next;
    }
}
