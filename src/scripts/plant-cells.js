// Drawing logic for /creations/plant-cells, ported from grid_lines.py in the
// separate drawing project. Everything is in the units of a SIZE x SIZE
// canvas; the page scales the context to whatever size the box really is.

export const SIZE = 2000;
export const MAX_LINES = 20;
export const SHAPE_INSET = 15; // gutter between neighbouring shapes
export const MIN_CLEARANCE = 4 * SHAPE_INSET; // closest two neighbouring lines may come
export const FPS = 15;
export const LOOP_SECONDS = 3;
export const FRAMES = FPS * LOOP_SECONDS;

// hue, saturation, lightness of the original greens
const BACKGROUND = [148, 0.714, 0.105];
const OUTER = [143, 0.565, 0.23];
const INNER = [103, 0.677, 0.845];
export const BASE_HUE = BACKGROUND[0];

export const defaults = {
  numVert: 8,
  numHoriz: 8,
  minGap: 150,
  filletRadius: 30,
  nCopies: 10,
  spacingPower: 0.25,
  hue: BASE_HUE,
  oscDistance: 10,
};

// the largest min gap that still fits the busier pair of edges
export function maxMinGap(numVert, numHoriz) {
  return Math.floor(SIZE / (Math.max(numVert, numHoriz) + 1));
}

// neighbours swinging toward each other close the gap by twice the swing,
// so the swing is kept small enough to leave MIN_CLEARANCE between them:
// a cell narrower than twice SHAPE_INSET disappears into its gutter
export function maxOscDistance(minGap) {
  return Math.max(0, Math.floor((minGap - MIN_CLEARANCE) / 2));
}

// the random part of a drawing: where each point sits in the room left over
// on its edge, and where it starts in the swing cycle. Every edge gets
// MAX_LINES of each so the line counts can change without a new layout.
export function newLayout(random = Math.random) {
  const layout = {};
  for (const name of ["top", "bottom", "left", "right"]) {
    layout[name] = {
      spots: Array.from({ length: MAX_LINES }, () => random()),
      phases: Array.from({ length: MAX_LINES }, () => 2 * Math.PI * random()),
    };
  }
  return layout;
}

function edgePoints(spots, n, minGap) {
  // n positions along an edge, in increasing order, at least the gap from
  // each other and from the two corners
  const gap = Math.min(minGap, SIZE / (n + 1));
  const slack = SIZE - (n + 1) * gap;
  return spots
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((spot, i) => spot * slack + (i + 1) * gap);
}

function intersect([[x1, y1], [x2, y2]], [[x3, y3], [x4, y4]]) {
  const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
}

function centroid(poly) {
  // area centroid of the polygon (not the average of its corners)
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k];
    const [x2, y2] = poly[(k + 1) % poly.length];
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a) < 1e-9) return null;
  return [cx / (3 * a), cy / (3 * a)];
}

function edgePlanes(poly) {
  // each edge as [nx, ny, c]: n is the unit normal pointing into the shape,
  // and n . p - c is the distance of point p from that edge
  const planes = [];
  for (let k = 0; k < poly.length; k++) {
    const [x1, y1] = poly[k];
    const [x2, y2] = poly[(k + 1) % poly.length];
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 1e-9) continue;
    const nx = -(y2 - y1) / length;
    const ny = (x2 - x1) / length;
    planes.push([nx, ny, nx * x1 + ny * y1]);
  }
  return planes;
}

function inradius(planes) {
  // radius of the largest circle that fits inside: it touches three edges,
  // so try every triple and keep the largest circle that stays inside the rest
  let best = 0;
  const n = planes.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        const [a1, b1, c1] = planes[a];
        const [a2, b2, c2] = planes[b];
        const [a3, b3, c3] = planes[c];
        // solve n . p - r = c for (px, py, r) by Cramer's rule
        const det = a1 * (b3 - b2) - b1 * (a3 - a2) - (a2 * b3 - a3 * b2);
        if (Math.abs(det) < 1e-12) continue;
        const px = (c1 * (b3 - b2) - b1 * (c3 - c2) - (c2 * b3 - c3 * b2)) / det;
        const py = (a1 * (c3 - c2) - c1 * (a3 - a2) - (a2 * c3 - a3 * c2)) / det;
        const r = a1 * px + b1 * py - c1;
        if (r > best && planes.every(([nx, ny, cc]) => nx * px + ny * py - cc >= r - 1e-9)) {
          best = r;
        }
      }
    }
  }
  return best;
}

function narrowest(poly, planes) {
  // the smallest distance from any edge across to a corner that is not on it
  let best = Infinity;
  for (const [nx, ny, c] of planes) {
    for (const [x, y] of poly) {
      const d = nx * x + ny * y - c;
      if (d > 1e-6 && d < best) best = d;
    }
  }
  return best;
}

function inset(poly, planes, dist) {
  // move every edge inward by dist and keep what is left of the shape
  for (const [nx, ny, c] of planes) {
    const out = [];
    for (let k = 0; k < poly.length; k++) {
      const p = poly[k];
      const q = poly[(k + 1) % poly.length];
      const dp = nx * p[0] + ny * p[1] - c - dist;
      const dq = nx * q[0] + ny * q[1] - c - dist;
      if (dp >= 0) out.push(p);
      if (dp >= 0 !== dq >= 0) {
        const t = dp / (dp - dq);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
    // drop repeated points so no edge has zero length
    poly = out.filter((p, k) => {
      const prev = out[(k + out.length - 1) % out.length];
      return Math.abs(p[0] - prev[0]) + Math.abs(p[1] - prev[1]) > 1e-9;
    });
    if (poly.length < 3) return [];
  }
  return poly;
}

function rounded(poly, r) {
  // the shape grown outward by r with round corners, as a many-pointed polygon
  if (r <= 0 || poly.length === 0) return poly;
  const out = [];
  const n = poly.length;
  for (let k = 0; k < n; k++) {
    const [x0, y0] = poly[(k + n - 1) % n];
    const [x1, y1] = poly[k];
    const [x2, y2] = poly[(k + 1) % n];
    // sweep around this corner from the outward direction of the edge before it to the one after
    const a0 = Math.atan2(-(x1 - x0), y1 - y0);
    const a1 = Math.atan2(-(x2 - x1), y2 - y1);
    const turn = 2 * Math.PI;
    const sweep = (((a1 - a0) % turn) + turn) % turn;
    const steps = Math.max(1, Math.ceil((sweep * r) / 2));
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps;
      out.push([x1 + r * Math.cos(a), y1 + r * Math.sin(a)]);
    }
  }
  return out;
}

function hslToRgb([h, s, l]) {
  const a = s * Math.min(l, 1 - l);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

function css(rgb) {
  const [r, g, b] = rgb.map((v) => Math.round(255 * Math.max(0, Math.min(1, v))));
  return `rgb(${r}, ${g}, ${b})`;
}

function drawPoly(ctx, poly, center, s, color) {
  // the polygon scaled by s about center
  const [cx, cy] = center;
  ctx.beginPath();
  poly.forEach(([x, y], k) => {
    const px = cx + s * (x - cx);
    const py = cy + s * (y - cy);
    if (k === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// one frame of the loop onto a context already scaled to SIZE x SIZE units;
// frame runs from 0 to FRAMES - 1
export function drawFrame(ctx, params, layout, frame) {
  const { numVert, numHoriz, minGap, filletRadius, nCopies, spacingPower, hue, oscDistance } = params;

  // every colour turns by the same amount, so the default hue gives the original greens
  const turned = ([h, s, l]) => hslToRgb([(((h + hue - BASE_HUE) % 360) + 360) % 360, s, l]);
  const outerColor = turned(OUTER);
  const innerColor = turned(INNER);
  // level runs from 0 for the outermost shape to 1 for the innermost copy
  const shade = (level) => css(outerColor.map((o, k) => o + level * (innerColor[k] - o)));

  ctx.fillStyle = css(turned(BACKGROUND));
  ctx.fillRect(0, 0, SIZE, SIZE);

  // every point swings at the same rate but starts at its own place in the cycle
  const counts = { top: numVert, bottom: numVert, left: numHoriz, right: numHoriz };
  const swing = Math.min(oscDistance, 0.45 * Math.min(minGap, SIZE / (Math.max(numVert, numHoriz) + 1)));
  const t = (2 * Math.PI * frame) / FRAMES;
  const edges = {};
  for (const name of Object.keys(counts)) {
    const { spots, phases } = layout[name];
    edges[name] = edgePoints(spots, counts[name], minGap).map((p, i) => p + swing * Math.sin(t + phases[i]));
  }

  // vertical lines: top and bottom points paired left to right, plus the left/right canvas edges
  const vert = [[[0, 0], [0, SIZE]]];
  edges.top.forEach((x, i) => vert.push([[x, 0], [edges.bottom[i], SIZE]]));
  vert.push([[SIZE, 0], [SIZE, SIZE]]);

  // horizontal lines: left and right points paired top to bottom, plus the top/bottom canvas edges
  const horiz = [[[0, 0], [SIZE, 0]]];
  edges.left.forEach((y, i) => horiz.push([[0, y], [SIZE, edges.right[i]]]));
  horiz.push([[0, SIZE], [SIZE, SIZE]]);

  // crossing points, then one four-cornered shape per grid cell
  const pts = vert.map((v) => horiz.map((h) => intersect(v, h)));

  // how far inward each copy sits, as a fraction of the way to the center
  // (copy nCopies would sit at the center itself with no area, so it is left out)
  const depths = [];
  for (let k = 1; k < nCopies; k++) depths.push(1 - (1 - k / nCopies) ** spacingPower);

  for (let j = 0; j <= numHoriz; j++) {
    for (let i = 0; i <= numVert; i++) {
      const cell = [pts[i][j], pts[i + 1][j], pts[i + 1][j + 1], pts[i][j + 1]];
      const shape = inset(cell, edgePlanes(cell), SHAPE_INSET);
      if (shape.length === 0) continue; // too small to survive the inset
      const planes = edgePlanes(shape);
      // a fillet cannot be larger than the biggest circle that fits in the shape,
      // and past half the narrowest part it would eat the thin end of a tapered shape
      const fillet = Math.min(filletRadius, 0.98 * inradius(planes), 0.49 * narrowest(shape, planes));
      let outer = fillet > 0 ? rounded(inset(shape, planes, fillet), fillet) : shape;
      if (outer.length < 3) outer = shape;
      const center = centroid(outer);
      if (!center) continue;

      // the shape, then its copies shrunk toward the centroid
      drawPoly(ctx, outer, center, 1, shade(0));
      depths.forEach((depth, k) => drawPoly(ctx, outer, center, 1 - depth, shade((k + 1) / depths.length)));
    }
  }
}
