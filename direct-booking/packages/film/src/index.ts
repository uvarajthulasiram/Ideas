// Canvas 2D helpers for illustrated story films. The player binds a canvas
// (bind), then calls each shot's draw(t, T); scenes use the camera (view,
// screen, ext) and these shapes. Colors come from the site's palette (setPalette).
//
// The drawing state is module-level on purpose: scenes read ctx, W, H and S as
// live bindings, which keeps scene code as short as a sketch.

export interface Shot {
  id: string;
  /** Seconds. */
  dur: number;
  chapter: string;
  head: string;
  line: string;
  /** false: the next shot continues the same camera, so no cross-dissolve. */
  xf?: boolean;
  /** t: 0..1 through this shot; T: the film clock in seconds (for ambient motion). */
  draw(t: number, T: number): void;
}

export interface Story {
  /** One sentence describing the whole film, for screen readers. */
  label: string;
  shots: Shot[];
}

/** A label anchored to a world point, shown as HTML over the canvas. */
export type Chip = [name: string, detail: string, x: number, y: number, opacity: number, dot: string];

export let ctx: CanvasRenderingContext2D;
export let W = 0, H = 0, dpr = 1, S = 1, CX = 0, CY = 0;
/** Where the camera's focus sits vertically (0 top, 1 bottom); captions dock below. */
export let OY = 0.42;
export function bind(c: CanvasRenderingContext2D, w: number, h: number, d: number) {
  ctx = c; W = w; H = h; dpr = d; OY = 0.42;
}

export const P: Record<string, string> = {};
export const SKIES: Record<string, [string, string]> = {};
export function setPalette(palette: Record<string, string>, skies: Record<string, [string, string]>) {
  Object.assign(P, palette);
  Object.assign(SKIES, skies);
}

let chipSink: (chips: Chip[]) => void = () => {};
export function onChips(fn: (chips: Chip[]) => void) { chipSink = fn; }
export function setChips(chips: Chip[]) { chipSink(chips); }

/* ---- Numbers and colors ---- */
export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const ss = (t: number) => t * t * (3 - 2 * t);
export const sm = (v: number, a: number, b: number) => ss(seg(v, a, b));
export const eOut = (t: number) => 1 - Math.pow(1 - t, 3);
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(lerp(v, B[i]!, t)).toString(16).padStart(2, "0")).join("");
}
export function rng(seed: number): () => number {
  let s = Math.max(1, Math.floor(seed) % 2147483647);
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/* ---- Camera ---- */
/** World point (cx, cy) at the focus, z = zoom. A 380 × 700 world box fits the stage at z = 1. */
export function view(cx: number, cy: number, z: number) {
  S = Math.min(H / 700, W / 380) * z; CX = cx; CY = cy;
  ctx.setTransform(dpr * S, 0, 0, dpr * S, dpr * (W / 2 - cx * S), dpr * (H * OY - cy * S));
}
export function screen() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
export const toScreen = (x: number, y: number): [number, number] => [W / 2 + (x - CX) * S, H * OY + (y - CY) * S];
/** The visible world rectangle, with a margin. */
export const ext = () => ({ l: CX - W / 2 / S - 20, r: CX + W / 2 / S + 20, t: CY - (H * OY) / S - 20, b: CY + (H * (1 - OY)) / S + 20 });

/* ---- Shapes ---- */
type Pt = [number, number];
export function path(pts: Pt[]) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
export function fill(c: string) { ctx.fillStyle = c; ctx.fill(); }
export function stroke(w = 2, c = P.ink!) { ctx.lineWidth = w; ctx.strokeStyle = c; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.stroke(); }
export function rect(x: number, y: number, w: number, h: number, c: string, sw?: number) { ctx.beginPath(); ctx.rect(x, y, w, h); fill(c); if (sw) stroke(sw); }
export function rr(x: number, y: number, w: number, h: number, r: number, c: string, sw?: number) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); fill(c); if (sw) stroke(sw); }
export function circle(x: number, y: number, r: number, c: string, sw?: number) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); fill(c); if (sw) stroke(sw); }
export function ell(x: number, y: number, rx: number, ry: number, c: string, sw?: number) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); fill(c); if (sw) stroke(sw); }
export function poly(pts: Pt[], c: string, sw?: number) { path(pts); fill(c); if (sw) stroke(sw); }
export function line(x1: number, y1: number, x2: number, y2: number, w = 2, c = P.ink!) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); stroke(w, c); }
export function alpha(a: number, fn: () => void) { if (a <= 0.001) return; ctx.save(); ctx.globalAlpha *= a; fn(); ctx.restore(); }
/** A polyline drawn up to fraction k of its length (routes on a map). */
export function partialLine(pts: Pt[], k: number, w: number, c: string) {
  if (k <= 0) return;
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
  ctx.beginPath(); ctx.moveTo(pts[0]![0], pts[0]![1]);
  let left = L * k;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!, d = Math.hypot(bx - ax, by - ay), f = Math.min(1, left / d);
    ctx.lineTo(lerp(ax, bx, f), lerp(ay, by, f)); left -= d;
  }
  stroke(w, c);
}

/* ---- Sky and weather ---- */
export function sky(a: string, b?: string, t = 0) {
  screen();
  const A = SKIES[a]!, B = SKIES[b ?? a]!, g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  g.addColorStop(0, mix(A[0], B[0], t)); g.addColorStop(1, mix(A[1], B[1], t));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
export function cloud(x: number, y: number, s: number, c = "#ffffff", a = 0.9) {
  alpha(a, () => { circle(x, y, 22 * s, c); circle(x + 26 * s, y - 10 * s, 28 * s, c); circle(x + 56 * s, y, 22 * s, c); rr(x - 18 * s, y, 92 * s, 20 * s, 10 * s, c); });
}

/* ---- People ---- */
export interface PersonOptions {
  col?: string; hair?: string; skin?: string; pose?: "walk" | "stand" | "sit"; ph?: number; dir?: 1 | -1; bag?: boolean; mug?: boolean; s?: number;
}
/** A stylized person standing (or sitting) on (x, y): dot eyes, simple shapes. */
export function person(x: number, y: number, o: PersonOptions = {}) {
  const { col = P.p1!, hair = P.hair!, skin = P.skin!, pose = "stand", ph = 0, dir = 1, bag = false, mug = false, s = 1 } = o;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s);
  const sw = pose === "walk" ? Math.sin(ph) * 0.55 : 0, bob = pose === "walk" ? Math.abs(Math.cos(ph)) * 1.5 : 0;
  if (pose === "sit") {
    rr(-6, -24, 9, 6, 3, P.ink2!); rr(1, -24, 12, 6, 3, P.ink2!); rr(10, -24, 5, 22, 2, P.ink2!); rr(12, -4, 7, 4, 2, P.ink!);
    rr(-8, -46, 14, 24, 5, col, 1.5); circle(0, -53, 7, skin, 1.5); ctx.beginPath(); ctx.arc(0, -55, 7.2, Math.PI * 1.05, Math.PI * 2.05); fill(hair);
    if (mug) rr(5, -36, 6, 7, 1.5, P.trim!, 1);
  } else {
    for (const [a, c] of [[sw, P.ink2!], [-sw, P.ink!]] as const) { ctx.save(); ctx.translate(0, -22 - bob); ctx.rotate(a); rr(-2.5, 0, 5, 22, 2, c); rr(-2.5, 19, 8, 4, 2, P.ink!); ctx.restore(); }
    rr(-7, -46 - bob, 14, 26, 5, col, 1.5);
    ctx.save(); ctx.translate(0, -42 - bob); ctx.rotate(-sw * 0.8); rr(-2, 0, 4, 18, 2, mix(col, P.ink!, 0.25)); ctx.restore();
    circle(0, -53 - bob, 7, skin, 1.5); ctx.beginPath(); ctx.arc(0, -55 - bob, 7.2, Math.PI * 1.05, Math.PI * 2.05); fill(hair);
    circle(3, -53 - bob, 0.9, P.ink!);
    if (mug) rr(5, -34 - bob, 6, 7, 1.5, P.trim!, 1);
    if (bag) {
      ctx.save(); ctx.translate(-14, 0); rr(-8, -26, 16, 24, 3, P.slate2!, 1.5);
      line(-3, -26, -3, -34, 1.5); line(3, -26, 3, -34, 1.5); line(-3, -34, 3, -34, 1.5); circle(-5, -1, 2, P.ink!); circle(5, -1, 2, P.ink!); ctx.restore();
    }
  }
  ctx.restore();
}
/** Two guests side by side (palette: p1/hair/skin and p2/hair2/skin2). */
export function couple(x: number, y: number, o: PersonOptions & { gap?: number } = {}) {
  const g = o.gap ?? 18;
  person(x - g / 2, y, { ...o, col: P.p1, hair: P.hair, skin: P.skin });
  person(x + g / 2, y, { ...o, col: P.p2, hair: P.hair2, skin: P.skin2, ph: (o.ph ?? 0) + 1.6, bag: false });
}

/* ---- Things ---- */
export function car(x: number, y: number, c: string, s = 1, doorOpen = 0) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  rr(-78, -40, 156, 30, 10, c, 2); path([[-50, -40], [-34, -64], [36, -64], [56, -40]]); fill(c); stroke(2);
  poly([[-42, -42], [-30, -60], [-2, -60], [-2, -42]], P.glass2!, 1.5); poly([[3, -42], [3, -60], [32, -60], [46, -42]], P.glass2!, 1.5);
  if (doorOpen) { ctx.save(); ctx.translate(-2, -40); ctx.scale(1 - doorOpen * 0.6, 1); rect(0, 0, 44, 28, mix(c, "#ffffff", 0.1), 1.5); ctx.restore(); }
  rect(70, -32, 8, 6, "#f5e6b8"); rect(-78, -32, 6, 6, "#d9a07f");
  for (const wx of [-48, 48]) { circle(wx, -10, 13, P.ink!); circle(wx, -10, 5.5, "#c9ced0"); }
  ctx.restore();
}
export function pine(x: number, y: number, h: number, c = P.pine!, c2 = P.pine2!) {
  rect(x - 3, y - h * 0.18, 6, h * 0.18, P.cedarDeep!);
  for (let k = 0; k < 4; k++) { const w = h * (0.34 - k * 0.065), yy = y - h * 0.14 - k * h * 0.2; poly([[x - w, yy], [x, yy - h * 0.34], [x + w, yy]], k % 2 ? c2 : c); }
}
export function roundTree(x: number, y: number, h: number, c = P.leaf!, dots = false, dotC = "#ffffff") {
  rect(x - 4, y - h * 0.45, 8, h * 0.45, P.cedarDeep!);
  circle(x, y - h * 0.62, h * 0.3, mix(c, P.ink!, 0.12)); circle(x - h * 0.16, y - h * 0.72, h * 0.22, c); circle(x + h * 0.18, y - h * 0.7, h * 0.2, mix(c, "#ffffff", 0.12));
  if (dots) { const r = rng(Math.round(Math.abs(x) * 7 + 3)); for (let k = 0; k < 18; k++) circle(x + (r() - 0.5) * h * 0.6, y - h * 0.65 + (r() - 0.5) * h * 0.45, 2.2, dotC); }
}
export function bush(x: number, y: number, w: number, c = P.lawn2!, flowers?: string[]) {
  circle(x - w * 0.3, y - w * 0.18, w * 0.3, c); circle(x + w * 0.2, y - w * 0.22, w * 0.34, mix(c, "#ffffff", 0.1)); rect(x - w * 0.6, y - w * 0.18, w * 1.15, w * 0.18, c);
  if (flowers) { const r = rng(Math.round(Math.abs(x) * 13 + 7)); for (let k = 0; k < 7; k++) circle(x + (r() - 0.5) * w, y - w * 0.3 + (r() - 0.5) * w * 0.3, 2.4, flowers[k % flowers.length]!); }
}
export function picket(x1: number, x2: number, y: number, c = P.trim!) {
  rect(x1, y - 16, x2 - x1, 3, c); rect(x1, y - 8, x2 - x1, 3, c);
  for (let x = x1; x <= x2; x += 9) poly([[x, y], [x, y - 20], [x + 2.5, y - 23], [x + 5, y - 20], [x + 5, y]], c);
}
export function neighbor(x: number, y: number, w: number, h: number, body: string, roof: string, lit: boolean) {
  rect(x - w / 2, y - h, w, h, body, 1.5); for (let k = y - h + 10; k < y; k += 10) line(x - w / 2 + 1, k, x + w / 2 - 1, k, 0.7, mix(body, P.ink!, 0.15));
  poly([[x - w / 2 - 12, y - h], [x, y - h - h * 0.55], [x + w / 2 + 12, y - h]], roof, 1.5);
  rect(x - w * 0.3, y - h * 0.7, w * 0.22, h * 0.3, lit ? P.glow! : P.glass!, 1.5); rect(x + w * 0.08, y - h * 0.62, w * 0.2, h * 0.62, P.cedarDeep!, 1.5);
}
export function pole(x: number, y: number) { rect(x - 4, y - 230, 8, 230, P.cedarDeep!, 1.5); rect(x - 22, y - 218, 44, 6, P.cedarDeep!, 1.5); }
export function wire(x1: number, y1: number, x2: number, y2: number) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + 18, x2, y2); stroke(1.4, P.ink!); }
