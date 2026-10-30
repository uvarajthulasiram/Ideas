// The Nest Retreat's story film: nine shots, about 64 seconds, approved as
// prototype 2 (see ../story-notes.md). Drawn with @direct-booking/film.
// Captions follow the copy rules: no em dashes, US spelling, facts from config.

import {
  H, P, SKIES, W, alpha, car, circle, clamp, cloud, couple, ctx, ell, eOut, ext, fill, lerp, line, mix, neighbor, partialLine, path, person, picket, pine,
  pole, poly, rect, rng, roundTree, rr, screen, setChips, setPalette, sky, sm, stroke, view, bush, wire, type Story,
} from "@direct-booking/film";

// Tints and shades of the Driftwood & Fog brand colors.
setPalette(
  {
    ink: "#22313a", ink2: "#3b4b55", slate: "#2f4652", slate2: "#43606f", cedar: "#a8774f", cedar2: "#c39a73", cedarDeep: "#6f5038", cedarLine: "#8f6440",
    old: "#a39684", old2: "#8a7c6b", trim: "#fbfaf7", glass: "#cfe3e8", glass2: "#a9cad2", glow: "#f6cf86", glow2: "#eaa95c",
    lawn: "#7aa286", lawn2: "#5f8b6e", lawn3: "#9cbfa4", pine: "#2f5a4c", pine2: "#3f6f5c", leaf: "#7fa892", walk: "#dcd4c6", road: "#6d7b81", line: "#ece6da",
    sand: "#ecdcbc", sand2: "#dcc59c", wet: "#c8ae86", sea: "#4b7d88", sea3: "#7fb1b4", foam: "#f7f5f0", mtn: "#8ba3ae", mtn2: "#6a8592", snow: "#f6f4ef",
    skin: "#e9c9ab", skin2: "#bf8f6a", hair: "#3b2f2a", hair2: "#7a5236", p1: "#3f6657", p2: "#a07c5b", wall: "#efe1c9", pineWood: "#d8b081", sofa: "#6f9479", bed: "#fbfaf7",
  },
  {
    day: ["#8fc0d3", "#d9ebee"], spring: ["#9cc8d6", "#e3f0ee"], autumn: ["#a9bfc6", "#e8e6dc"], winter: ["#b8c7cc", "#e9eeee"],
    gold: ["#e3a866", "#f6e0bb"], dawn: ["#e9c3a3", "#f7ece0"], night: ["#0f1d27", "#2a4250"],
  },
);

/* The chickadee, the running thread: black cap and bib, white cheek, buff sides, grey wing. */
function bird(x: number, y: number, o: { s?: number; dir?: 1 | -1; fly?: number; sleep?: boolean; T?: number } = {}) {
  const { s = 1, dir = 1, fly = 0, sleep = false, T = 0 } = o;
  ctx.save(); ctx.translate(x, y); ctx.scale(s * dir, s);
  if (fly) { const f = Math.sin(T * 22) * 0.9; ctx.save(); ctx.rotate(-0.15); poly([[-2, -6], [-14, -6 - 12 * f], [-6, -2]], "#8d969b"); ctx.restore(); }
  poly([[-10, -4], [-18, -2], [-10, 0]], "#6e787d");
  ell(0, -4, 10, 7.5, "#f1e3cc", 1.2); ell(-2, -2, 7, 4, "#e2c7a0");
  if (!fly) poly([[-7, -8], [3, -7], [-2, -1]], "#8d969b");
  circle(6, -10, 6, P.ink!); ell(6.5, -8.5, 4, 3, "#ffffff"); poly([[4, -5], [10, -5], [7, -2]], P.ink!);
  poly([[11.5, -10], [15, -9.4], [11.5, -8.4]], P.ink!);
  if (!sleep) circle(8.4, -11, 1.1, "#ffffff"); else line(7.2, -11, 9.8, -11, 0.9, "#ffffff");
  if (!fly) { line(-1, 3, -2, 7, 1, P.ink!); line(3, 3, 3, 7, 1, P.ink!); }
  ctx.restore();
}

interface HouseOptions { rise?: number; age?: number; open?: number; door?: number; light?: number; scaff?: number; T?: number; snow?: number; faces?: number }

/* The cottage, ground at y = 0, centered on x = 0.
   rise: 0 the old garage .. 1 finished; age: 0 old paint .. 1 new; open: front wall lifted away (cutaway). */
function house(o: HouseOptions) {
  const { rise = 1, age = 1, open = 0, door = 0, light = 0, scaff = 0, snow = 0, faces = 0 } = o;
  const body = mix(P.old!, P.cedar!, age), bodyLine = mix(P.old2!, P.cedarLine!, age), facade = 1 - open;
  if (open > 0) interior(o);
  alpha(facade, () => {
    rect(-100, -120, 200, 120, body, 2); for (let k = -110; k < 0; k += 10) line(-99, k, 99, k, 0.8, bodyLine);
    rect(-88, -96, 104, 96, mix("#cfc6b8", P.trim!, age), 2); for (let k = -84; k < 0; k += 16) line(-88, k, 16, k, 1, mix("#b3a896", "#d8d2c6", age));
    if (rise > 0.35) alpha(sm(rise, 0.35, 0.6), () => {
      rect(36, -86, 38, 86, P.slate!, 2);
      alpha(door, () => { rect(36, -86, 38, 86, P.glow!); rect(36, -86, 38 * (1 - door * 0.85), 86, P.slate!, 2); });
      circle(68 - door * 30, -42, 2.2, P.glow2!); rect(80, -82, 10, 12, light > 0.1 ? P.glow! : "#e4dccd", 1.2);
    });
  });
  // The old roof lifts off as the build starts.
  const lift = sm(rise, 0.08, 0.2);
  if (lift < 1) alpha((1 - lift) * facade, () => {
    ctx.save(); ctx.translate(0, -lift * 40); poly([[-114, -120], [0, -172], [114, -120]], "#7f8a8e", 2);
    if (snow) alpha(snow, () => poly([[-112, -122], [0, -172], [112, -122], [0, -160]], P.snow!)); ctx.restore();
  });
  // The upper story rises out of the old footprint.
  const wallH = 150 * sm(rise, 0.2, 0.6), top = -120 - wallH;
  if (wallH > 0) alpha(facade, () => {
    rect(-104, top, 208, wallH, P.cedar2!, 2); for (let k = top + 10; k < -120; k += 10) line(-103, k, 103, k, 0.8, P.cedarLine!);
    const wA = sm(rise, 0.45, 0.7);
    if (wA > 0 && wallH > 110) alpha(wA, () => {
      rect(-84, -252, 168, 96, P.trim!, 2); const lit = clamp(light);
      for (const [x0, w0] of [[-78, 50], [-24, 48], [28, 50]] as const) { rect(x0, -246, w0, 84, mix(P.glass!, P.glow!, lit), 1.5); alpha(1 - lit, () => line(x0 + 6, -238, x0 + 20, -224, 2, "#ffffff")); }
      if (faces > 0) alpha(faces, () => { circle(-8, -186, 9, P.skin!); circle(10, -186, 9, P.skin2!); rr(-18, -178, 18, 20, 5, P.p1!); rr(1, -178, 18, 20, 5, P.p2!); });
      rect(-90, -156, 180, 6, P.trim!, 1.5);
    });
  });
  if (scaff > 0) alpha(scaff, () => {
    const hh = 300 * Math.min(1, scaff * 1.4);
    for (const x of [-124, 124]) rect(x - 3, -hh, 6, hh, "#c9a227");
    for (let y = -40; y > -hh; y -= 60) { line(-124, y, 124, y, 3, "#c9a227"); line(-124, y, -94, y - 60, 2, "#c9a227"); line(124, y, 94, y - 60, 2, "#c9a227"); }
  });
  // The new roof drops into place.
  const rd = sm(rise, 0.6, 0.82);
  if (rd > 0) alpha(Math.min(1, rd * 3), () => {
    ctx.save(); ctx.translate(0, -(1 - eOut(rd)) * 120);
    poly([[-128, -268], [0, -356], [128, -268], [128, -262], [0, -348], [-128, -262]], P.slate!, 2);
    alpha(facade, () => { poly([[-112, -270], [0, -346], [112, -270]], P.cedar2!); line(-112, -270, 112, -270, 2); poly([[-16, -282], [0, -306], [16, -282]], mix(P.glass!, P.glow!, clamp(light)), 1.5); });
    if (snow) alpha(snow, () => poly([[-128, -268], [0, -356], [128, -268], [0, -342]], P.snow!));
    ctx.restore();
  });
}

/* The cutaway: garage with the EV charger, the queen room and bath, the stairs, and the nest upstairs. */
function interior(o: HouseOptions) {
  const { open = 0, T = 0, light = 0 } = o;
  alpha(open, () => {
    rect(-100, -120, 200, 120, "#e9dfcf", 2); rect(-100, -120, 92, 120, "#d9d3c8"); line(-8, -120, -8, 0, 2);
    rect(-92, -78, 14, 22, P.slate2!, 1.2); circle(-85, -70, 2.4, "#8ee3b0"); line(-85, -56, -70, -10, 1.5, P.ink2!);
    ctx.save(); ctx.translate(-50, -6);
    for (const wx of [-14, 14]) { ctx.beginPath(); ctx.arc(wx, -8, 9, 0, 7); stroke(2, P.ink2!); }
    line(-14, -8, 0, -22, 2, P.ink2!); line(0, -22, 14, -8, 2, P.ink2!); line(0, -22, 4, -28, 2, P.ink2!); ctx.restore();
    rect(4, -70, 30, 54, P.glass2!, 1.5); line(19, -70, 19, -16, 1.5);
    rr(40, -34, 46, 20, 4, P.bed!, 1.5); rr(40, -44, 10, 30, 3, P.cedar2!, 1.5); rr(52, -38, 16, 6, 3, "#e9eef0"); rect(44, -20, 42, 8, P.sofa!);
    rect(88, -64, 10, 64, "#dfe9ea", 1.2);
    for (let k = 0; k < 8; k++) rect(-8 + k * 5.5, -14 - k * 13.5, 14, 4, P.cedarDeep!);
    rect(-104, -124, 208, 6, P.cedarDeep!, 1.5);
    rect(-104, -270, 208, 146, P.wall!, 2);
    for (let k = -96; k <= 96; k += 24) line(k, -270, k, -258, 3, P.pineWood!);
    rect(-104, -262, 208, 5, P.pineWood!);
    rect(-70, -240, 70, 58, mix(P.glass!, P.glow!, clamp(light)), 1.5); line(-35, -240, -35, -182, 1.5);
    alpha(1 - clamp(light), () => { circle(-56, -192, 12, P.lawn2!); circle(-20, -194, 14, P.pine2!); });
    rr(-84, -160, 72, 30, 8, P.sofa!, 1.5); rr(-84, -170, 72, 14, 6, mix(P.sofa!, P.ink!, 0.15), 1.5); rr(-6, -142, 26, 10, 2, P.cedar2!, 1.2);
    rect(36, -150, 58, 26, P.trim!, 1.5); rect(36, -154, 58, 6, "#e3ddd2", 1.2);
    for (const sx of [42, 58, 74]) { line(sx, -150, sx, -126, 2, P.cedarDeep!); rr(sx - 5, -152, 10, 5, 2, P.cedar!); }
    for (const px of [50, 78]) { line(px, -262, px, -214, 1, P.ink2!); poly([[px - 10, -204], [px, -218], [px + 10, -204]], "#d9b47d", 1); }
    rect(92, -232, 10, 34, P.trim!, 1);
    alpha(0.5 + 0.5 * Math.sin(T * 3), () => { ctx.beginPath(); ctx.moveTo(54, -158); ctx.quadraticCurveTo(60, -168, 54, -176); stroke(1.5, "#9aa6aa"); });
    rr(48, -160, 12, 9, 3, P.slate2!);
    poly([[-118, -270], [0, -352], [118, -270]], P.pineWood!, 2); for (let k = -104; k <= 104; k += 13) line(k, -270, k * 0.1, -346, 1, "#c08f5d");
  });
}

/* The street: neighbors, gardens, the pole and wire, the road, a foreground of flowers. */
function street(o: { night?: number } = {}) {
  const { night = 0 } = o, e = ext();
  for (let x = Math.floor(e.l / 120) * 120; x < e.r; x += 120) { const h = 60 + ((((x * 7919) % 50) + 50) % 50); poly([[x - 70, -60], [x, -60 - h], [x + 70, -60]], mix("#a9bfbf", "#5f7a7a", 0.2)); }
  rect(e.l, -64, e.r - e.l, 64, "#b7cbc4");
  rect(e.l, 0, e.r - e.l, 34, P.lawn!); rect(e.l, 0, e.r - e.l, 5, P.lawn2!);
  rect(e.l, 34, e.r - e.l, 16, P.walk!); for (let x = Math.floor(e.l / 40) * 40; x < e.r; x += 40) line(x, 34, x, 50, 1, "#c9c0b1");
  rect(e.l, 50, e.r - e.l, 6, "#b7ad9e"); rect(e.l, 56, e.r - e.l, 96, P.road!); for (let x = Math.floor(e.l / 60) * 60; x < e.r; x += 60) rect(x, 100, 30, 4, P.line!);
  rect(e.l, 152, e.r - e.l, 8, "#b7ad9e"); rect(e.l, 160, e.r - e.l, e.b - 160, P.lawn3!); rect(e.l, 160, e.r - e.l, 4, P.lawn!);
  const lit = night > 0.4;
  neighbor(-330, 0, 150, 110, "#dfe8e3", P.slate2!, lit); neighbor(330, 0, 150, 120, "#f0e3cc", P.cedarDeep!, lit);
  neighbor(-560, 0, 140, 100, "#efe8dc", P.slate!, lit); neighbor(560, 0, 150, 104, "#dde6ea", P.cedarDeep!, lit);
  pine(-196, 0, 230); pine(205, 0, 250, P.pine2, P.pine);
  picket(-180, -112, 30); picket(112, 180, 30);
  bush(-140, 30, 30, P.lawn2, ["#f3d7a3", "#fbfaf7", "#e7b7a0"]); bush(150, 30, 34, P.lawn2, ["#fbfaf7", "#f3d7a3"]);
  pole(-430, 34); wire(-430, -214, -120, -170);
  rect(160, 162, 4, 34, P.cedarDeep!); rr(150, 150, 26, 14, 5, P.slate2!, 1.5);
  for (let x = Math.floor(e.l / 26) * 26; x < e.r; x += 26) { const r = rng(Math.abs(x) + 11); circle(x + r() * 14, 176 + r() * 30, 2.2, ["#fbfaf7", "#f3d7a3", "#e7b7a0"][Math.floor(r() * 3)]!); line(x, 186, x + 2, 200, 1, P.lawn2!); }
}

const blossomTree = () => roundTree(-150, 0, 150, "#a9c9b3", true, "#fbfaf7");

/* The neighborhood from above: schematic, not to scale. North is up; the Sound is west, the bay and downtown north-east. */
function aerialMap(t: number, T: number) {
  const e = ext();
  const coast = (y: number) => -330 + 14 * Math.sin(y / 60) - Math.max(0, y - 220) * 0.25;
  const bayY = (x: number) => -470 - Math.max(0, x + 100) * 0.12;
  const far = (x: number) => bayY(x) - 130 - Math.max(0, x - 60) * 0.1;
  rect(e.l, e.t, e.r - e.l, e.b - e.t, "#e6e1d3");
  ctx.beginPath(); ctx.moveTo(e.l, e.t); for (let y = e.t; y <= e.b; y += 20) ctx.lineTo(coast(y), y); ctx.lineTo(e.l, e.b); ctx.closePath(); fill(P.sea3!);
  ctx.beginPath(); ctx.moveTo(-340, e.t); for (let x = -340; x <= e.r; x += 20) ctx.lineTo(x, bayY(x)); ctx.lineTo(e.r, e.t); ctx.closePath(); fill(P.sea3!);
  ctx.beginPath(); ctx.moveTo(-60, e.t); for (let x = -60; x <= e.r; x += 20) ctx.lineTo(x, far(x)); ctx.lineTo(e.r, e.t); ctx.closePath(); fill("#e6e1d3");
  for (const [x, h, w] of [[96, 70, 22], [124, 120, 20], [150, 95, 24], [180, 150, 18], [204, 110, 22], [232, 85, 20], [258, 130, 18]] as const) {
    const b = far(x) - 8; rect(x, b - h, w, h, "#9fb1b8", 1.2); rect(x, b - h, w, 7, "#c8d4d8"); for (let y = b - h + 14; y < b - 4; y += 12) line(x + 4, y, x + w - 4, y, 1, "#b8c7cc");
  }
  ctx.beginPath(); for (let y = -200; y <= 120; y += 10) { if (y === -200) ctx.moveTo(coast(y) + 6, y); else ctx.lineTo(coast(y) + 6, y); } stroke(12, P.sand2!);
  for (let k = 0; k < 40; k++) { const r = rng(k + 31), y = 190 + r() * 260, x = coast(y) + 14 + r() * 200; circle(x, y, 13 + r() * 9, k % 2 ? P.pine2! : P.lawn2!); }
  for (let x = -280; x <= e.r; x += 90) { const top = bayY(x) + 8; rect(x, top, 7, e.b - top, "#fbfaf7"); }
  for (let y = -440; y <= e.b; y += 80) { const x0 = coast(y) + 10; rect(x0, y, e.r - x0, 7, "#fbfaf7"); }
  for (let x = -273; x < e.r; x += 90) for (let y = -433; y < e.b; y += 80) {
    const r = rng(Math.round(Math.abs(x * 31 + y * 17) + 5000));
    if (x < coast(y) + 20 || y < bayY(x) + 10 || (y > 180 && x < -60) || (x > 190 && x < 330 && y > -360 && y < -240)) continue;
    for (let k = 0; k < 2; k++) rect(x + 10 + r() * 52, y + 10 + r() * 44, 16, 13, [P.cedar2!, P.slate2!, "#c9d6d2", P.cedarDeep!][Math.floor(r() * 4)]!);
    if (r() > 0.45) circle(x + 30 + r() * 30, y + 52, 10, P.lawn2!);
  }
  rr(196, -352, 130, 102, 8, "#efe5d4"); for (let k = 0; k < 14; k++) { const r = rng(k + 501); circle(206 + r() * 110, -342 + r() * 82, 6.5, ["#a07c5b", "#3f6657", "#c39a73", "#9fbcae"][k % 4]!, 1); }
  rect(coast(380) - 50, 380, 54, 8, P.cedarDeep!); const fx = lerp(coast(380) - 60, coast(380) - 300, (T % 14) / 14); rr(fx - 20, 368, 40, 14, 6, "#fbfaf7", 1.5);
  const r1 = sm(t, 0.36, 0.56), r2 = sm(t, 0.54, 0.72), r3 = sm(t, 0.7, 0.86), beachX = coast(-40) + 8;
  ctx.save(); ctx.setLineDash([10, 9]);
  partialLine([[0, 0], [-100, 0], [-100, -40], [beachX, -40]], r1, 5, P.cedarDeep!);
  partialLine([[0, 0], [90, 0], [90, -300], [196, -300]], r2, 5, P.cedarDeep!);
  partialLine([[260, -352], [240, -470], [180, -600]], r3, 5, P.slate2!);
  ctx.restore();
  alpha(0.4 * (0.6 + 0.4 * Math.sin(T * 3)), () => circle(0, 0, 34, "#fbfaf7"));
  rect(-14, -12, 28, 24, P.slate!, 2); poly([[-14, -12], [0, -2], [14, -12]], P.cedar2!);
  if (r1 > 0 && r1 < 1) { const bx = r1 < 0.3 ? lerp(0, -100, r1 / 0.3) : r1 < 0.45 ? -100 : lerp(-100, beachX, (r1 - 0.45) / 0.55); bird(bx, -60 + 6 * Math.sin(T * 6), { fly: 1, T, s: 1.2, dir: -1 }); }
  else if (r1 >= 1) bird(beachX + 6, -54, { T, s: 1.2, dir: -1 });
  setChips([
    ["The Nest", "", 0, -36, sm(t, 0.3, 0.36), "#2f4652"],
    ["Lowman Beach", "a short walk", beachX, -76, sm(t, 0.5, 0.56), "#a07c5b"],
    ["Lincoln Park", "", -170, 300, sm(t, 0.6, 0.66), "#5f8b6e"],
    ["The Junction", "cafés and restaurants", 260, -356, sm(t, 0.68, 0.74), "#3f6657"],
    ["Downtown Seattle", "minutes away", 180, -640, sm(t, 0.84, 0.9), "#2f4652"],
  ]);
}

/* Lowman Beach: mountains and an island across the water, waves on the sand, driftwood. */
function beach(t: number, T: number) {
  sky("day");
  view(lerp(40, -20, t), -40, lerp(1, 1.08, t));
  const e = ext();
  cloud(-180 + ((T * 6) % 600), -420, 1.1); cloud(120 + ((T * 4) % 500), -360, 0.8);
  for (const x of [-320, -120, 120, 330, 540]) { const h = [150, 190, 160, 200, 150][[-320, -120, 120, 330, 540].indexOf(x)]!;
    poly([[x - 180, -60], [x, -60 - h], [x + 180, -60]], P.mtn!); poly([[x - 40, -20 - h], [x, -60 - h], [x + 40, -20 - h], [x + 14, -28 - h], [x, -16 - h], [x - 16, -28 - h]], P.snow!); }
  path([[e.l, -60], [-260, -84], [-60, -96], [160, -90], [360, -74], [e.r, -64], [e.r, -60]]); fill(P.mtn2!);
  const wg = ctx.createLinearGradient(0, -62, 0, 140); wg.addColorStop(0, P.sea3!); wg.addColorStop(1, P.sea!); ctx.fillStyle = wg; ctx.fillRect(e.l, -62, e.r - e.l, 220);
  for (let k = 0; k < 40; k++) { const r = rng(k + 77), x = e.l + r() * (e.r - e.l), y = -50 + r() * 120, tw = 0.5 + 0.5 * Math.sin(T * 3 + k); alpha(tw * 0.8, () => rect(x, y, 10 + r() * 14, 2, "#e8f3f2")); }
  const fx = lerp(-420, 420, (T % 30) / 30); rr(fx, -72, 46, 10, 3, "#fbfaf7", 1.2); rect(fx + 12, -80, 22, 8, "#fbfaf7", 1.2);
  const shore = (x: number) => 138 + 6 * Math.sin(x / 50);
  ctx.fillStyle = P.wet!; ctx.beginPath(); ctx.moveTo(e.l, shore(e.l)); for (let x = e.l; x <= e.r; x += 10) ctx.lineTo(x, shore(x)); ctx.lineTo(e.r, e.b); ctx.lineTo(e.l, e.b); ctx.fill();
  ctx.fillStyle = P.sand!; ctx.beginPath(); ctx.moveTo(e.l, shore(e.l) + 26); for (let x = e.l; x <= e.r; x += 10) ctx.lineTo(x, shore(x) + 26 + 4 * Math.sin(x / 33)); ctx.lineTo(e.r, e.b); ctx.lineTo(e.l, e.b); ctx.fill();
  for (let k = 0; k < 3; k++) {
    const ph = (T / 3.2 + k / 3) % 1;
    alpha(Math.sin(Math.PI * ph), () => { ctx.beginPath(); for (let x = e.l; x <= e.r; x += 8) { const yy = Math.min(shore(x) + 4, 40 + ph * 104) + 4 * Math.sin(x / 26 + T); if (x === e.l) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } stroke(3 + ph * 3, P.foam!); });
  }
  const wash = 0.5 + 0.5 * Math.sin(T * 1.9);
  ctx.beginPath(); for (let x = e.l; x <= e.r; x += 8) { const yy = shore(x) + 2 + wash * 10 + 3 * Math.sin(x / 18 + T * 2); if (x === e.l) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } stroke(4, P.foam!);
  for (const [x, y, w, a] of [[-120, 238, 190, -0.04], [150, 262, 150, 0.06], [-330, 280, 140, 0.03]] as const) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); rr(-w / 2, -14, w, 26, 13, "#b79a7a", 2); line(-w / 2 + 16, -4, w / 2 - 20, -6, 1.2, "#8f7558"); circle(-w / 2 + 10, -1, 9, "#9c8264", 1.5); ctx.restore();
  }
  for (const [x, y, r] of [[260, 200, 16], [292, 208, 10], [-250, 196, 12]] as const) ell(x, y, r * 1.4, r, "#8f9a9c", 1.5);
  for (let k = 0; k < 14; k++) { const r = rng(k + 140), x = e.l + r() * (e.r - e.l), y = 330 + r() * 70; for (let j = -2; j <= 2; j++) line(x, y, x + j * 5, y - 22 - r() * 10, 1.5, P.lawn2!); }
  for (let k = 0; k < 30; k++) { const r = rng(k + 200); circle(e.l + r() * (e.r - e.l), 300 + r() * 120, 1.6, "#c3ab88"); }
  for (let k = 0; k < 3; k++) {
    const gx = ((T * (14 + k * 5) + k * 200) % 900) - 450, gy = -300 + k * 40 + 10 * Math.sin(T + k), f = Math.sin(T * 6 + k) * 6;
    ctx.beginPath(); ctx.moveTo(gx - 12, gy + f * 0.3); ctx.quadraticCurveTo(gx - 6, gy - 6 - f, gx, gy); ctx.quadraticCurveTo(gx + 6, gy - 6 - f, gx + 12, gy + f * 0.3); stroke(2, P.ink2!);
  }
  const w = sm(t, 0.05, 0.55);
  if (t < 0.58) couple(lerp(360, -110, w), 240, { pose: "walk", ph: w * 26, dir: -1, mug: true });
  else { person(-128, 228, { pose: "sit", mug: true }); person(-100, 228, { pose: "sit", col: P.p2, hair: P.hair2, skin: P.skin2, mug: true }); }
  const bh = sm(t, 0.6, 0.7); bird(lerp(300, -60, bh), lerp(-180, 222, bh) - 40 * Math.sin(Math.PI * bh), { T, fly: bh > 0 && bh < 1 ? 1 : 0, dir: -1 });
}

/* The backyard at night: the round fire pit and four chairs from Allie's photo, string lights, stars. */
function backyard(t: number, T: number) {
  sky("night");
  screen();
  for (let k = 0; k < 90; k++) { const r = rng(k + 900), x = r() * W, y = r() * H * 0.5, tw = 0.55 + 0.45 * Math.sin(T * (1 + r() * 2) + k); alpha(tw * sm(t, 0, 0.3 + r() * 0.5), () => rect(x, y, 1.8, 1.8, "#f4f2ee")); }
  alpha(0.9, () => { circle(W * 0.8, H * 0.12, 16, "#f4ecd8"); circle(W * 0.8 + 6, H * 0.12 - 4, 14, SKIES.night![0]); });
  view(lerp(-20, 20, t), -40, lerp(0.92, 1.02, t));
  const e = ext();
  for (let x = Math.floor(e.l / 110) * 110; x < e.r; x += 110) pine(x, -10, 200 + ((((x * 31) % 60) + 60) % 60), "#1d3a33", "#24453c");
  ctx.save(); ctx.translate(-30, -20); ctx.scale(0.75, 0.75);
  rect(-100, -120, 200, 120, "#5e4a39", 2); rect(-104, -270, 208, 150, "#6d5541", 2); poly([[-128, -268], [0, -356], [128, -268]], "#1f3039", 2);
  for (const [x, y, w, h] of [[-80, -250, 160, 90], [10, -96, 60, 96]] as const) { rect(x, y, w, h, P.glow!, 2); line(x + w / 2, y, x + w / 2, y + h, 2); }
  const gl = ctx.createRadialGradient(0, -200, 10, 0, -200, 190); gl.addColorStop(0, "rgba(246,207,134,0.45)"); gl.addColorStop(1, "rgba(246,207,134,0)"); ctx.fillStyle = gl; ctx.fillRect(-220, -420, 440, 440);
  ctx.restore();
  for (let x = Math.floor(e.l / 18) * 18; x < e.r; x += 18) rect(x, -60, 14, 60, "#3b4e57");
  rect(e.l, 0, e.r - e.l, e.b, "#2c3a3f"); ell(0, 150, 300, 90, "#4a5559");
  for (let k = 0; k < 60; k++) { const r = rng(k + 1200); circle(lerp(-280, 280, r()), lerp(80, 220, r()), 1.6, "#6b777b"); }
  ctx.beginPath(); ctx.moveTo(-200, -150); ctx.quadraticCurveTo(-20, -60, 220, -170); stroke(1.4, "#141f25");
  for (let k = 0; k <= 12; k++) {
    const u = k / 12, x = (1 - u) * (1 - u) * -200 + 2 * (1 - u) * u * -20 + u * u * 220, y = (1 - u) * (1 - u) * -150 + 2 * (1 - u) * u * -60 + u * u * -170;
    alpha(0.5, () => circle(x, y + 6, 9, P.glow!)); circle(x, y + 6, 3.4, "#ffe7b3");
  }
  const fg = ctx.createRadialGradient(0, 140, 10, 0, 140, 170); fg.addColorStop(0, `rgba(233,169,91,${0.5 + 0.08 * Math.sin(T * 9)})`); fg.addColorStop(1, "rgba(233,169,91,0)"); ctx.fillStyle = fg; ctx.fillRect(-200, 0, 400, 300);
  const chair = (x: number, y: number, dir: 1 | -1, who: 0 | 1 | 2) => {
    ctx.save(); ctx.translate(x, y); ctx.scale(dir, 1);
    for (let k = 0; k < 4; k++) rr(-26 + k * 8, -60, 7, 50, 3, "#1b2328");
    rr(-30, -14, 44, 8, 3, "#1b2328"); rr(-32, -26, 8, 34, 3, "#1b2328"); rr(10, -26, 8, 34, 3, "#1b2328");
    if (who) person(-4, -8, { pose: "sit", col: who === 1 ? P.p1 : P.p2, hair: who === 1 ? P.hair : P.hair2, skin: who === 1 ? P.skin : P.skin2, mug: true });
    ctx.restore();
  };
  chair(-130, 120, 1, 0); chair(130, 120, -1, 0);
  rr(-46, 136, 92, 30, 14, "#e9e6e0", 2); ell(0, 136, 46, 10, "#3a3a3a");
  for (let k = 0; k < 7; k++) { const fx = -32 + k * 10.5, fh = 26 + 12 * Math.sin(T * 7 + k * 1.7) + (k % 3) * 6; poly([[fx - 6, 136], [fx + Math.sin(T * 5 + k) * 3, 136 - fh], [fx + 6, 136]], k % 2 ? "#f6b45a" : "#fbe08f"); }
  for (let k = 0; k < 6; k++) { const ph = (T * 0.6 + k / 6) % 1; alpha(1 - ph, () => circle(Math.sin(k * 3 + T) * 14, 120 - ph * 120, 1.8, "#ffd889")); }
  chair(-100, 206, 1, 1); chair(100, 206, -1, 2);
  bird(-92, -248, { T, sleep: true, s: 0.9 });
}

const story: Story = {
  label: "An illustrated short film: an old West Seattle garage grows a cottage on top; guests arrive, settle in, walk to the beach, sit by the fire pit at night and wake to the morning light.",
  shots: [
    { id: "years", dur: 6.5, chapter: "Where it began", head: "For years, it was just a garage", line: "Tools, bikes, and whatever didn't fit.", xf: false,
      draw(t, T) {
        const sA = sm(t, 0.3, 0.4), sB = sm(t, 0.62, 0.72);
        if (t < 0.36) sky("autumn", "winter", sA); else if (t < 0.68) sky("winter"); else sky("winter", "spring", sB);
        view(0, -110 - 10 * t, 1.12 + 0.1 * t);
        street();
        const snow = sm(t, 0.36, 0.44) * (1 - sm(t, 0.64, 0.72));
        roundTree(-150, 0, 150, t < 0.36 ? "#c98f52" : t < 0.68 ? "#8b8f88" : "#a9c9b3", t >= 0.68, "#fbfaf7");
        house({ rise: 0, age: 0, snow });
        ctx.save(); ctx.translate(-118, 0); for (const wx of [-12, 12]) { ctx.beginPath(); ctx.arc(wx, -10, 9, 0, 7); stroke(2, P.ink2!); }
        line(-12, -10, 0, -24, 2, P.ink2!); line(0, -24, 12, -10, 2, P.ink2!); ctx.restore();
        rr(104, -26, 26, 26, 2, P.cedar2!, 1.5); rr(108, -44, 20, 18, 2, mix(P.cedar2!, "#ffffff", 0.2), 1.5);
        const r = rng(5), e = ext();
        for (let k = 0; k < 40; k++) {
          const x0 = e.l + r() * (e.r - e.l), sp = 20 + r() * 30, y0 = -320 + ((T * sp + r() * 600) % 560);
          if (t < 0.36) alpha(1 - sm(t, 0.3, 0.36), () => ell(x0 + Math.sin(T + k) * 12, y0, 3.5, 2, k % 2 ? "#c98f52" : "#d9a868"));
          else if (t < 0.7) alpha(snow, () => circle(x0 + Math.sin(T * 0.8 + k) * 8, y0, 2.4, "#ffffff"));
        }
        bird(-200 + 60 * t, -184, { T });
      } },
    { id: "rise", dur: 6.5, chapter: "The rise", head: "Then it reached upward", line: "Same footprint, a home built on top.", xf: false,
      draw(t, T) {
        sky("spring", "day", sm(t, 0, 0.6));
        view(0, lerp(-120, -195, sm(t, 0.05, 0.85)), lerp(1.22, 0.92, sm(t, 0.05, 0.85)));
        street(); blossomTree();
        house({ rise: sm(t, 0.02, 0.92), age: sm(t, 0.2, 0.6), scaff: Math.min(sm(t, 0.04, 0.18), 1 - sm(t, 0.78, 0.9)), light: sm(t, 0.88, 1) * 0.35 });
        alpha(sm(t, 0.62, 0.7) * (1 - sm(t, 0.74, 0.82)), () => { for (const [x, y] of [[-40, -230], [40, -210]] as const) { line(x - 8, y, x + 8, y, 2, "#ffffff"); line(x, y - 8, x, y + 8, 2, "#ffffff"); } });
        const peakY = lerp(-172, -356, sm(t, 0.6, 0.82)), bx = lerp(-140, 0, sm(t, 0, 0.12));
        bird(bx, t < 0.12 ? lerp(-184, -178, t / 0.12) - 30 * Math.sin((Math.PI * t) / 0.12) : peakY - 8, { T });
      } },
    { id: "arrive", dur: 7, chapter: "Your stay", head: "Your stay starts at the door", line: "Self check-in with your own code.", xf: false,
      draw(t, T) {
        sky("day");
        view(lerp(0, 40, sm(t, 0, 0.5)), lerp(-195, -70, sm(t, 0, 0.75)), lerp(0.92, 1.25, sm(t, 0.1, 0.8)));
        street(); blossomTree();
        const cx = lerp(-760, -230, eOut(sm(t, 0, 0.36))), doorO = sm(t, 0.36, 0.42) * (1 - sm(t, 0.5, 0.56)), fd = sm(t, 0.8, 0.86) * (1 - sm(t, 0.93, 0.99));
        house({ rise: 1, age: 1, door: fd, light: 0.3 });
        bird(0, -364, { T });
        car(cx, 128, P.slate2!, 1, doorO);
        const out = sm(t, 0.38, 0.46), walk = sm(t, 0.46, 0.8), inA = 1 - sm(t, 0.86, 0.95);
        alpha(out * inA, () => couple(lerp(-230, 55, walk) + (1 - out) * -10, walk > 0.5 ? lerp(110, 2, sm(walk, 0.5, 0.78)) : 110, { pose: walk > 0 && walk < 1 ? "walk" : "stand", ph: walk * 22, dir: 1, bag: true }));
        // Close-up: the keypad accepts the guest's code.
        const kp = sm(t, 0.64, 0.7) * (1 - sm(t, 0.9, 0.96));
        if (kp > 0) { screen(); alpha(kp, () => {
          const r = Math.min(W, H) * 0.16, x = W - r - 16, y = r + 16, n = Math.floor(sm(t, 0.68, 0.8) * 4.99);
          circle(x, y, r + 4, "#ffffff"); ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.clip(); rect(x - r, y - r, 2 * r, 2 * r, P.slate!);
          rr(x - r * 0.45, y - r * 0.75, r * 0.9, r * 1.5, 8, "#2a3940", 2);
          for (let i = 0; i < 4; i++) circle(x - r * 0.27 + i * r * 0.18, y - r * 0.48, r * 0.05, i < n ? "#f4f2ee" : "#55666f");
          for (let k = 0; k < 9; k++) rr(x - r * 0.33 + (k % 3) * r * 0.24, y - r * 0.25 + Math.floor(k / 3) * r * 0.24, r * 0.18, r * 0.16, 3, "#46565e");
          circle(x, y + r * 0.55, r * 0.07, n >= 4 ? "#8ee3b0" : "#6b5050"); ctx.restore();
        }); }
      } },
    { id: "inside", dur: 7.5, chapter: "The nest", head: "Tucked in, lifted up", line: "Two floors, two bedrooms, two baths.",
      draw(t, T) {
        sky("day");
        view(lerp(40, 0, sm(t, 0, 0.4)), lerp(-70, -185, sm(t, 0, 0.4)), lerp(1.25, 0.95, sm(t, 0, 0.4)));
        street(); blossomTree(); car(-230, 128, P.slate2!);
        const open = sm(t, 0.08, 0.32);
        house({ rise: 1, age: 1, open, light: 0.25, T });
        alpha(sm(t, 0.3, 0.36) * open, () => {
          const w1 = sm(t, 0.34, 0.48), up = sm(t, 0.48, 0.68), w2 = sm(t, 0.68, 0.82);
          if (t > 0.84) { person(-56, -132, { pose: "sit", mug: true }); person(-30, -132, { pose: "sit", col: P.p2, hair: P.hair2, skin: P.skin2, mug: true }); return; }
          const [x, y] = up <= 0 ? [lerp(55, -2, w1), 0] : w2 <= 0 ? [lerp(-2, 40, up), lerp(0, -122, up)] : [lerp(40, -40, w2), -122];
          couple(x, y, { pose: "walk", ph: T * 9, dir: up > 0 && w2 <= 0 ? 1 : -1, gap: 14, s: 0.8 });
        });
        bird(70, -258, { T });
      } },
    { id: "aerial", dur: 8, chapter: "Close by", head: "Minutes from it all", line: "Beaches, cafés, restaurants, downtown.",
      draw(t, T) {
        screen(); rect(0, 0, W, H, "#e4dfd1");
        const z = Math.exp(lerp(Math.log(3.2), Math.log(0.5), eOut(sm(t, 0, 0.36))));
        view(lerp(0, -20, sm(t, 0, 0.36)) + 60 * sm(t, 0.7, 0.92), lerp(0, -150, sm(t, 0, 0.36)) - 170 * sm(t, 0.7, 0.92), z);
        aerialMap(t, T);
      } },
    { id: "beach", dur: 8.5, chapter: "The Sound", head: "Down to the Sound", line: "Lowman Beach, just under a mile away.", draw: beach },
    { id: "golden", dur: 7, chapter: "Evening", head: "Home as the sky turns gold", line: "Watch the weather roll in.",
      draw(t, T) {
        sky("day", "gold", sm(t, 0, 0.5));
        view(0, -150, lerp(0.86, 0.98, t));
        alpha(sm(t, 0.2, 0.6), () => { circle(260, -330, 34, "#fbe3ad"); alpha(0.35, () => circle(260, -330, 60, "#fbe3ad")); });
        street(); roundTree(-150, 0, 150, "#a9c9b3"); car(-230, 128, P.slate2!);
        house({ rise: 1, age: 1, light: 0.55 + 0.4 * sm(t, 0.3, 0.9), faces: sm(t, 0.15, 0.3) });
        const cx = lerp(380, -520, sm(t, 0.15, 0.85)), ca = sm(t, 0.15, 0.25) * (1 - sm(t, 0.78, 0.86));
        alpha(ca, () => { cloud(cx - 40, -420, 1.25, "#c4cbcf", 1); if (Math.abs(cx) < 200) for (let k = 0; k < 12; k++) { const dx = cx - 40 + k * 10, dy = -390 + ((T * 160 + k * 23) % 90); line(dx, dy, dx - 3, dy + 10, 1.6, "#7f9aa3"); } });
        const duck = sm(t, 0.3, 0.38) * (1 - sm(t, 0.82, 0.9));
        bird(lerp(0, -112, duck), lerp(-364, -262, duck), { T });
        screen(); alpha(0.16 * sm(t, 0.3, 1), () => rect(0, 0, W, H, "#f2a95a"));
      } },
    { id: "night", dur: 7, chapter: "Night", head: "Fire pit, then stars", line: "The backyard, after dark.", draw: backyard },
    { id: "dawn", dur: 7, chapter: "Morning", head: "Settle in and stay a while.", line: "",
      draw(t, T) {
        sky("dawn");
        view(0, -170, 0.9);
        alpha(0.8, () => circle(-240, -300, 40, "#fbe9cf"));
        street(); blossomTree(); car(-230, 128, P.slate2!);
        house({ rise: 1, age: 1, light: 0.5 - 0.3 * t, faces: 0.9 });
        bird(62, -150, { T });
        screen(); for (let k = 0; k < 3; k++) alpha(0.18, () => rect(0, H * (0.62 + k * 0.05), W, H * 0.03, "#ffffff"));
      } },
  ],
};

export default story;
