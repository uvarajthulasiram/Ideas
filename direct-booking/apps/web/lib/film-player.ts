// The story film player (approved prototype 2; sites/nest-retreat/story-notes.md).
// Plays by itself when at least 55% of the stage is on screen, pauses when it
// leaves or the tab is hidden; the page always scrolls normally. Reduced motion:
// no autoplay. Everything runs on the film clock, so a pause freezes every frame.

import { bind, onChips, toScreen, clamp, type Story } from "@direct-booking/film";

export interface FilmElements {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  chips: HTMLElement;
  cap: HTMLElement;
  capK: HTMLElement;
  capH: HTMLElement;
  capL: HTMLElement;
  play: HTMLButtonElement;
  bar: HTMLElement;
  time: HTMLElement;
  hint: HTMLElement;
  mark: HTMLElement;
  rule: HTMLElement;
  start: HTMLElement;
  stills: HTMLOListElement;
}

const XF = 0.8; // cross-dissolve between shots, seconds
const ss = (t: number) => t * t * (3 - 2 * t);
const sm = (v: number, a: number, b: number) => ss(clamp((v - a) / (b - a)));
const ICON = {
  pause: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="4" height="14" rx="1" fill="currentColor"/><rect x="12" y="3" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  play: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 3l12 7-12 7z" fill="currentColor"/></svg>',
  again: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4a6 6 0 1 1-5.6 3.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M3 3v5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export class FilmPlayer {
  private shots;
  private starts: number[] = [];
  private total = 0;
  private T = 0;
  private playing = false;
  private userPaused = false;
  private ended = false;
  private cur = -1;
  private dirty = true;
  private hintShown = false;
  private raf = 0;
  private last = 0;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private off = document.createElement("canvas");
  private chipEls = new Map<string, HTMLElement>();
  private segs: { btn: HTMLButtonElement; fill: HTMLElement }[] = [];
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private readonly reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  private cleanups: (() => void)[] = [];

  constructor(private story: Story, private el: FilmElements) {
    this.shots = story.shots;
    for (const s of this.shots) { this.starts.push(this.total); this.total += s.dur; }

    this.shots.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.style.setProperty("--w", String(s.dur)); b.setAttribute("aria-label", `Chapter ${i + 1} of ${this.shots.length}: ${s.chapter}`);
      b.innerHTML = "<span><i></i></span>";
      b.addEventListener("click", () => { this.seek(this.starts[i]! + 0.01); if (!this.playing) this.play(true); });
      el.bar.appendChild(b); this.segs.push({ btn: b, fill: b.querySelector("i")! });
    });

    this.on(el.play, "click", () => (this.playing ? this.pause(true) : this.play(true)));
    this.on(el.stage, "click", (e) => { if ((e.target as HTMLElement).closest("a,button")) return; this.playing ? this.pause(true) : this.play(true); });
    onChips((list) => this.placeChips(list));

    this.io = new IntersectionObserver(([en]) => {
      const visible = (en?.intersectionRatio ?? 0) >= 0.55;
      if (visible && !this.playing && !this.userPaused && !this.ended && !this.reduce) this.play(false);
      else if (!visible && this.playing) this.pause(false);
    }, { threshold: [0, 0.55, 1] });
    this.io.observe(el.stage);
    this.on(document, "visibilitychange", () => { if (document.hidden && this.playing) this.pause(false); });
    this.ro = new ResizeObserver(() => this.size());
    this.ro.observe(el.canvas);
    if (this.reduce) el.start.hidden = false;

    this.size(); this.sync(); this.render();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  destroy() { cancelAnimationFrame(this.raf); this.io.disconnect(); this.ro.disconnect(); this.cleanups.forEach((f) => f()); onChips(() => {}); this.el.bar.replaceChildren(); this.el.chips.replaceChildren(); }

  play(user: boolean) {
    if (this.ended) { this.T = 0; this.ended = false; }
    this.playing = true; if (user) this.userPaused = false; this.el.start.hidden = true; this.sync();
    if (!this.hintShown) { this.hintShown = true; this.el.hint.classList.add("on"); setTimeout(() => this.el.hint.classList.remove("on"), 3500); }
  }
  pause(user: boolean) { this.playing = false; if (user) this.userPaused = true; this.sync(); this.dirty = true; }
  restart() { this.seek(0); this.play(true); }
  seek(T: number) { this.T = clamp(T, 0, this.total); this.ended = this.T >= this.total; this.dirty = true; this.sync(); }

  showStills() {
    this.pause(true);
    const list = this.el.stills;
    list.hidden = false;
    if (!list.childElementCount) {
      this.shots.forEach((s, i) => {
        const li = document.createElement("li");
        li.innerHTML = `<canvas aria-hidden="true"></canvas><div><p class="film-k">${i + 1} of ${this.shots.length} · ${s.chapter}</p><h3>${s.head}</h3>${s.line ? `<p>${s.line}</p>` : ""}</div>`;
        list.appendChild(li);
      });
      requestAnimationFrame(() => {
        onChips(() => {});
        list.querySelectorAll("canvas").forEach((c, i) => {
          const r = c.getBoundingClientRect(), s = this.shots[i]!;
          c.width = Math.round(r.width * this.dpr); c.height = Math.round(r.height * this.dpr);
          this.drawShot(i, s.id === "dawn" ? 0.6 : 0.75, this.starts[i]! + s.dur * 0.75, c.getContext("2d")!, r.width, r.height);
        });
        onChips((l) => this.placeChips(l));
        this.dirty = true;
      });
    }
    list.scrollIntoView({ behavior: this.reduce ? "auto" : "smooth", block: "start" });
  }

  private on<K extends string>(t: EventTarget, type: K, fn: (e: Event) => void) { t.addEventListener(type, fn); this.cleanups.push(() => t.removeEventListener(type, fn)); }

  private size() {
    const r = this.el.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, devicePixelRatio || 1); this.W = r.width; this.H = r.height;
    this.el.canvas.width = this.off.width = Math.round(this.W * this.dpr); this.el.canvas.height = this.off.height = Math.round(this.H * this.dpr);
    this.dirty = true;
  }

  private sync() {
    const { play, cap } = this.el;
    play.innerHTML = this.playing ? ICON.pause : this.ended ? ICON.again : ICON.play;
    play.setAttribute("aria-label", this.playing ? "Pause the story" : this.ended ? "Watch the story again" : "Play the story");
    cap.classList.toggle("ended", this.ended);
  }

  private placeChips(list: [string, string, number, number, number, string][]) {
    const seen = new Set<string>();
    for (const [name, sub, x, y, a, dot] of list) {
      seen.add(name);
      let el = this.chipEls.get(name);
      if (!el) {
        el = document.createElement("span"); el.className = "film-chip"; el.style.setProperty("--dot", dot);
        el.textContent = name; if (sub) { const small = document.createElement("small"); small.textContent = sub; el.append(" ", small); }
        this.el.chips.appendChild(el); this.chipEls.set(name, el);
      }
      const [sx, sy] = toScreen(x, y), hw = el.offsetWidth / 2 + 8;
      el.style.left = `${clamp(sx, hw, this.W - hw)}px`; el.style.top = `${clamp(sy - 6, 34, this.H - 120)}px`; el.style.opacity = a.toFixed(3);
    }
    for (const [k, el] of this.chipEls) if (!seen.has(k)) el.style.opacity = "0";
  }

  private drawShot(i: number, t: number, T: number, c: CanvasRenderingContext2D, w = this.W, h = this.H) {
    bind(c, w, h, this.dpr); c.save(); c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.shots[i]!.draw(t, T); c.restore();
  }

  private render() {
    let i = 0; while (i < this.shots.length - 1 && this.T >= this.starts[i + 1]!) i++;
    const s = this.shots[i]!, t = clamp((this.T - this.starts[i]!) / s.dur);
    if (s.id !== "aerial") for (const el of this.chipEls.values()) el.style.opacity = "0";
    const main = this.el.canvas.getContext("2d")!;
    this.drawShot(i, t, this.T, main);
    const next = this.shots[i + 1], left = this.starts[i]! + s.dur - this.T;
    if (next && s.xf !== false && left < XF) {
      this.drawShot(i + 1, 0, this.T, this.off.getContext("2d")!);
      main.save(); main.setTransform(1, 0, 0, 1, 0, 0); main.globalAlpha = ss(1 - left / XF); main.drawImage(this.off, 0, 0); main.restore();
    }
    // Finale: the name lands, the driftwood rule draws in.
    const fin = i === this.shots.length - 1 ? t : 0, na = sm(fin, 0.12, 0.3), ra = sm(fin, 0.22, 0.42);
    this.el.mark.style.opacity = na.toFixed(3); this.el.mark.style.transform = `translateY(${((1 - na) * 10).toFixed(1)}px)`; this.el.rule.style.transform = `scaleX(${ra.toFixed(3)})`;
    if (i !== this.cur) {
      this.cur = i; const { cap, capK, capH, capL } = this.el;
      cap.classList.add("swap");
      setTimeout(() => { capK.textContent = `${i + 1} of ${this.shots.length} · ${s.chapter}`; capH.textContent = s.head; capL.textContent = s.line; capL.hidden = !s.line; cap.classList.remove("swap"); }, 180);
      this.segs.forEach((g, j) => (j === i ? g.btn.setAttribute("aria-current", "step") : g.btn.removeAttribute("aria-current")));
    }
    this.segs.forEach((g, j) => (g.fill.style.width = `${(j < i ? 100 : j > i ? 0 : t * 100).toFixed(1)}%`));
    const sec = Math.floor(this.T); this.el.time.textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - (this.last || now)) / 1000); this.last = now;
    if (this.playing) { this.T += dt; if (this.T >= this.total) { this.T = this.total; this.playing = false; this.ended = true; this.sync(); } this.dirty = true; }
    if (this.dirty) { this.render(); this.dirty = false; }
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** For checks: draw time T without playing. */
  debugSeek(T: number) { this.pause(true); this.seek(T); this.render(); }
  get timeline() { return this.shots.map((s, i) => [s.id, this.starts[i]!, s.dur] as const); }
}
