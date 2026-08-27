/**
 * UsageGraph -- hub-and-spoke animated network graph
 *
 * - CSS scoped to .ug-* (no global theme pollution)
 * - Animations: CSS keyframes + requestAnimationFrame (zero new deps)
 * - Data real of useUsageGraph()
 * - Kucing muncul HANYA format for requests beneran lewat /v1 (SSE real-time)
 * - Garis wavy kelap-kelip of hub ke tiap node
 * - Providers without requests appear muted
 * - Zoom in/out controls (persisted to localStorage)
 */

import { Maximize2, NetworkIcon, ZoomIn, ZoomOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { type RealtimeRequest, useUsageGraph } from "@/hooks/useUsageGraph";

// ─── layout ──────────────────────────────────────────────────────────────────
const RADIUS_X = 34;
const RADIUS_Y = 33;
const HUB = { x: 50, y: 50 };
const ENTER_AT = 0.72;
const EDGE_ACTIVE_MS = 3000;

// ─── zoom ────────────────────────────────────────────────────────────────────
// Change DEFAULT_ZOOM to adjust the initial zoom level
const DEFAULT_ZOOM = 1.0;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const ZOOM_KEY = "ug-zoom-level";

// ─── helpers ──────────────────────────────────────────────────────────────────
const easeOut = (t: number) => 1 - (1 - t) ** 3;
// Small overshoot so the cat "pops" in with a little bounce instead of
// just scaling up linearly.
const easeOutBack = (t: number) => {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};

function randomPath(
  hx: number,
  hy: number,
  ex: number,
  ey: number,
): { cx: number; cy: number } {
  const mx = (hx + ex) / 2,
    my = (hy + ey) / 2;
  const dx = ex - hx,
    dy = ey - hy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist,
    ny = dx / dist;
  const bow = (Math.random() - 0.5) * Math.max(60, dist * 0.5);
  return { cx: mx + nx * bow, cy: my + ny * bow };
}

function bezierPoint(
  t: number,
  hx: number,
  hy: number,
  cx: number,
  cy: number,
  ex: number,
  ey: number,
) {
  const u = 1 - t;
  const x = u * u * hx + 2 * u * t * cx + t * t * ex;
  const y = u * u * hy + 2 * u * t * cy + t * t * ey;
  const dx = 2 * u * (cx - hx) + 2 * t * (ex - cx);
  const dy = 2 * u * (cy - hy) + 2 * t * (ey - cy);
  return { x, y, ang: Math.atan2(dy, dx) };
}

/**
 * A single gentle S-curve from the hub to a node — like a loose cable
 * swaying once, not a taut straight line and not a tight zigzag. Built as
 * one smooth cubic bezier with two control points offset to opposite sides
 * of the midline, so the line eases out one way then back the other.
 */
function wavyPath(
  hx: number,
  hy: number,
  ex: number,
  ey: number,
  swayAmp: number,
): string {
  const dx = ex - hx,
    dy = ey - hy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist,
    ny = dx / dist;
  // control points at 1/3 and 2/3 along the line, bowed to opposite sides
  const c1x = hx + dx * 0.33 + nx * swayAmp;
  const c1y = hy + dy * 0.33 + ny * swayAmp;
  const c2x = hx + dx * 0.67 - nx * swayAmp;
  const c2y = hy + dy * 0.67 - ny * swayAmp;
  return `M ${hx.toFixed(2)} ${hy.toFixed(2)} C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}

/**
 * Chibi-style delivery cat: oversized round head, big eyes with pupils and a
 * highlight dot, whiskers, small paws, and a longer expressive tail. Drawn
 * on a 64x64 canvas (bigger head-to-body ratio than the old design).
 */
function catSVG(color: string): string {
  return `<div class="ug-cat-rot">
  <div class="ug-laser-lead"><div class="ug-laser-tail"></div><div class="ug-laser-dot"></div></div>
  <svg viewBox="0 0 64 64" width="64" height="64">
    <ellipse class="ug-cat-shadow" cx="32" cy="53" rx="12" ry="3"/>
    <g class="ug-leg ug-leg-fl" style="transform-origin:50% 0%"><rect x="20" y="38" width="4" height="10" rx="2" fill="var(--ug-cat-leg)"/></g>
    <g class="ug-leg ug-leg-fr" style="transform-origin:50% 0%"><rect x="40" y="38" width="4" height="10" rx="2" fill="var(--ug-cat-leg)"/></g>
    <g class="ug-leg ug-leg-bl" style="transform-origin:50% 0%"><rect x="17" y="41" width="4.2" height="10" rx="2.1" fill="var(--ug-cat-leg-dark)"/></g>
    <g class="ug-leg ug-leg-br" style="transform-origin:50% 0%"><rect x="43" y="41" width="4.2" height="10" rx="2.1" fill="var(--ug-cat-leg-dark)"/></g>
    <g class="ug-tail"><path d="M40 43 C48 43, 53 38, 51 30 C50 25, 45 25, 45 30" stroke="${color}" stroke-width="4" fill="none" stroke-linecap="round"/></g>
    <g class="ug-cat-body">
      <!-- body: small round belly, mostly hidden behind the oversized head -->
      <ellipse cx="32" cy="42" rx="13" ry="10" fill="var(--ug-cat-fill)" stroke="${color}" stroke-width="1.4"/>
      <!-- ears -->
      <path d="M18 20 L14 8 L26 16 Z" fill="var(--ug-cat-fill-dark)" stroke="${color}" stroke-width="1.2"/>
      <path d="M18.5 17.5 L16.5 11 L23 15.5 Z" fill="var(--ug-cat-fill-darker)"/>
      <path d="M46 20 L50 8 L38 16 Z" fill="var(--ug-cat-fill-dark)" stroke="${color}" stroke-width="1.2"/>
      <path d="M45.5 17.5 L47.5 11 L41 15.5 Z" fill="var(--ug-cat-fill-darker)"/>
      <!-- oversized round head -->
      <circle cx="32" cy="26" r="16" fill="var(--ug-cat-fill-darker)" stroke="${color}" stroke-width="1.5"/>
      <!-- whiskers -->
      <g class="ug-whiskers" stroke="${color}" stroke-width="0.8" stroke-linecap="round" opacity="0.7">
        <path d="M15 27 L6 25" />
        <path d="M15 30 L6 30" />
        <path d="M15 33 L6 35" />
        <path d="M49 27 L58 25" />
        <path d="M49 30 L58 30" />
        <path d="M49 33 L58 35" />
      </g>
      <!-- big eyes with pupils + highlight -->
      <g class="ug-eyes">
        <circle cx="25.5" cy="25" r="4.2" fill="white" fill-opacity="0.92"/>
        <circle cx="38.5" cy="25" r="4.2" fill="white" fill-opacity="0.92"/>
        <circle cx="26.3" cy="26" r="2.5" fill="${color}"/>
        <circle cx="39.3" cy="26" r="2.5" fill="${color}"/>
        <circle cx="25.2" cy="24.3" r="0.9" fill="white"/>
        <circle cx="38.2" cy="24.3" r="0.9" fill="white"/>
      </g>
      <!-- tiny nose + mouth -->
      <path d="M31 30.5 L33 30.5 L32 32 Z" fill="${color}" opacity="0.85"/>
      <path d="M29 33.5 q3 2.4 6 0" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round"/>
      <!-- blush -->
      <circle cx="21" cy="30" r="2.1" fill="${color}" opacity="0.18"/>
      <circle cx="43" cy="30" r="2.1" fill="${color}" opacity="0.18"/>
    </g>
    <!-- front paws peeking below the body -->
    <ellipse cx="26" cy="49" rx="3.4" ry="2.6" fill="var(--ug-cat-fill)" stroke="${color}" stroke-width="1"/>
    <ellipse cx="38" cy="49" rx="3.4" ry="2.6" fill="var(--ug-cat-fill)" stroke="${color}" stroke-width="1"/>
  </svg></div>`;
}

import "./UsageGraph.css";

const TRANSPORT_LOGO: Record<string, string> = {
  openai: "/images/providers/openai.svg",
  anthropic: "/images/providers/anthropic.svg",
  kiro: "/images/providers/kiro.svg",
  "command-code": "/images/providers/command-code.svg",
  mimo: "/images/providers/xiaomimimo.svg",
  qoder: "/images/providers/qoder.svg",
};

const TRANSPORT_LOGO_DARK: Record<string, string> = {
  anthropic: "/images/providers/anthropic-dark.svg",
  mimo: "/images/providers/xiaomimimo-dark.svg",
};

/**
 * Real provider logo where an asset exists, otherwise a small glyph
 * fallback (gemini has no bundled icon). Wrapped in an `.ug-logo-bg` chip
 * so single-color/black logos (Anthropic, Command Code) stay legible
 * against the dark node background.
 */
function transportIconHtml(transport: string): string {
  const isDark = document.documentElement.classList.contains("dark");
  const logo =
    isDark && TRANSPORT_LOGO_DARK[transport]
      ? TRANSPORT_LOGO_DARK[transport]
      : TRANSPORT_LOGO[transport];
  if (logo) {
    return `<span class="ug-logo-bg"><img src="${logo}" alt="" class="ug-logo-img" /></span>`;
  }
  const glyph = transport === "gemini" ? "✦" : "●";
  return `<span class="ug-ico-text">${glyph}</span>`;
}

function readZoom(): number {
  try {
    const v = localStorage.getItem(ZOOM_KEY);
    if (v !== null) {
      const n = Number.parseFloat(v);
      if (!Number.isNaN(n)) return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, n));
    }
  } catch {}
  return DEFAULT_ZOOM;
}

// ─── component ────────────────────────────────────────────────────────────────
interface NodeMapEntry {
  el: HTMLDivElement;
  pathEl: SVGPathElement;
  pathD: string;
  px: number;
  py: number;
  color: string;
  particles: HTMLDivElement[];
}

const PARTICLE_COUNT = 3;
const PARTICLE_DURATIONS_MS = [2000, 2500, 3000];
const PARTICLE_DELAYS_MS = [0, 800, 1600];

export function UsageGraph({ height }: { height?: number } = {}) {
  const { nodes, loading, error, reload, onRequest } = useUsageGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCount = useRef<Map<string, number>>(new Map());
  const nodeMapRef = useRef<Map<string, NodeMapEntry>>(new Map());
  const graphWrapRef = useRef<HTMLDivElement | null>(null);
  const builtRef = useRef(false);
  const dragState = useRef<{
    dragging: boolean;
    startX: number;
    startY: number;
    panStartX: number;
    panStartY: number;
  } | null>(null);
  const edgeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const [zoom, setZoom] = useState(readZoom);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const applyZoom = (z: number, resetPan = true) => {
    const clamped =
      Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z)) * 100) / 100;
    setZoom(clamped);
    if (resetPan) setPan({ x: 0, y: 0 });
    try {
      localStorage.setItem(ZOOM_KEY, String(clamped));
    } catch {}
  };

  // Ctrl+wheel zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((prev) => {
        const next =
          Math.round((prev + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)) * 100) /
          100;
        const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
        try {
          localStorage.setItem(ZOOM_KEY, String(clamped));
        } catch {}
        return clamped;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // drag/pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest(".ug-zoom-controls")) return;
      dragState.current = {
        dragging: true,
        startX: e.clientX,
        startY: e.clientY,
        panStartX: pan.x,
        panStartY: pan.y,
      };
      e.preventDefault();
    };

    const onMouseMove = (e: MouseEvent) => {
      const ds = dragState.current;
      if (!ds?.dragging) return;
      const dx = e.clientX - ds.startX;
      const dy = e.clientY - ds.startY;
      setPan({ x: ds.panStartX + dx, y: ds.panStartY + dy });
    };

    const onMouseUp = () => {
      dragState.current = null;
    };

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pan.x, pan.y]);

  // cleanup edge timers + any live particle dots on unmount
  useEffect(() => {
    return () => {
      for (const timer of edgeTimersRef.current.values()) {
        clearTimeout(timer);
      }
      edgeTimersRef.current.clear();
      for (const entry of nodeMapRef.current.values()) {
        for (const dot of entry.particles) dot.remove();
        entry.particles = [];
      }
    };
  }, []);

  // build graph DOM (once, when container ready)
  useEffect(() => {
    if (loading || error || builtRef.current) return;
    const container = containerRef.current;
    if (!container) return;
    builtRef.current = true;

    const wrap = document.createElement("div");
    wrap.className = "ug-graph";
    wrap.style.transform = `translate(0px, 0px) scale(${readZoom()})`;
    graphWrapRef.current = wrap;
    container.appendChild(wrap);

    // edge SVG
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "ug-edge-svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    wrap.appendChild(svg);

    // a handful of faint drifting dots for ambient atmosphere — purely
    // decorative, positioned randomly and never touched again after this
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement("div");
      dot.className = "ug-bg-particle";
      const size = 2 + Math.random() * 2;
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      dot.style.left = `${10 + Math.random() * 80}%`;
      dot.style.top = `${10 + Math.random() * 80}%`;
      dot.style.setProperty("--ug-drift-x", `${(Math.random() - 0.5) * 16}px`);
      dot.style.setProperty("--ug-drift-y", `${(Math.random() - 0.5) * 24}px`);
      dot.style.animationDuration = `${8 + Math.random() * 4}s`;
      dot.style.animationDelay = `${Math.random() * 4}s`;
      wrap.appendChild(dot);
    }

    // hub — heartbeat rings pulse outward continuously; paw print replaces
    // the emoji for consistent rendering across platforms.
    const hubEl = document.createElement("div");
    hubEl.className = "ug-node ug-hub";
    hubEl.style.left = `${HUB.x}%`;
    hubEl.style.top = `${HUB.y}%`;
    hubEl.style.setProperty("--ug-nc", "#f5a623");
    hubEl.innerHTML = `
      <span class="ug-hub-ring ug-ring-1"></span>
      <span class="ug-hub-ring ug-ring-2"></span>
      <span class="ug-hub-ring ug-ring-3"></span>
      <div class="ug-hub-text">
        <svg class="ug-hub-paw" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <ellipse cx="12" cy="16.5" rx="5.2" ry="4.4"/>
          <ellipse cx="5.4" cy="10.2" rx="2.4" ry="3"/>
          <ellipse cx="18.6" cy="10.2" rx="2.4" ry="3"/>
          <ellipse cx="8.6" cy="5.6" rx="2.1" ry="2.7"/>
          <ellipse cx="15.4" cy="5.6" rx="2.1" ry="2.7"/>
        </svg>
        <div class="ug-hub-sub">KCG Router</div>
      </div>`;
    wrap.appendChild(hubEl);

    // nodes + edges
    for (const n of nodes) {
      const rad = (n.angle * Math.PI) / 180;
      const px = HUB.x + Math.cos(rad) * RADIUS_X;
      const py = HUB.y + Math.sin(rad) * RADIUS_Y;
      const muted = n.requestCount === 0;

      const el = document.createElement("div");
      el.className = `ug-node${muted ? " ug-muted" : ""}`;
      el.style.left = `${px}%`;
      el.style.top = `${py}%`;
      el.style.setProperty("--ug-nc", n.color);
      el.innerHTML = `<div class="ug-row">
        <div class="ug-ico">${transportIconHtml(n.transport)}</div>
        <div><div class="ug-lb">${n.label}</div><div class="ug-sb">${n.sub}</div></div>
      </div>`;
      wrap.appendChild(el);

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      // slight per-edge variance so cables don't all sway identically
      const sway = 6 + Math.random() * 4;
      const pathD = wavyPath(HUB.x, HUB.y, px, py, sway);
      path.setAttribute(
        "class",
        `ug-edge-line${muted ? " ug-edge-muted" : ""}`,
      );
      path.setAttribute("d", pathD);
      path.setAttribute("stroke", n.color);
      svg.appendChild(path);

      activeCount.current.set(n.id, 0);
      nodeMapRef.current.set(n.id, {
        el,
        pathEl: path,
        pathD,
        px,
        py,
        color: n.color,
        particles: [],
      });
    }
  }, [nodes, loading, error]);

  // ── sendCat (imperative, called from SSE handler) ────────────────────────
  const sendCatRef = useRef<(nodeId: string) => void>(() => {});

  useEffect(() => {
    const intervals = new Map<string, ReturnType<typeof setInterval>>();
    const cooldowns = new Map<string, ReturnType<typeof setTimeout>>();
    const CAT_INTERVAL_MS = 200;
    const CAT_COOLDOWN_MS = 2000;

    function spawnCat(nodeId: string) {
      const info = nodeMapRef.current.get(nodeId);
      if (!info) return;
      // captured as a plain string so nested closures don't need to
      // re-narrow `info` (TS doesn't carry narrowing across function
      // declaration boundaries).
      const catColor = info.color;
      const wrap = graphWrapRef.current;
      if (!wrap) return;
      const rW = wrap.offsetWidth;
      const rH = wrap.offsetHeight;
      const hx = (rW * HUB.x) / 100;
      const hy = (rH * HUB.y) / 100;
      const tx = (rW * info.px) / 100;
      const ty = (rH * info.py) / 100;
      const full = Math.hypot(tx - hx, ty - hy);
      const dist = Math.max(60, full);
      const jx = (Math.random() - 0.5) * 80;
      const jy = (Math.random() - 0.5) * 32;
      const ex = tx + jx;
      const ey = ty + jy;
      const { cx, cy } = randomPath(hx, hy, ex, ey);
      const dur = Math.min(4200, Math.max(1200, (dist / 150) * 1000));

      const cat = document.createElement("div");
      cat.className = "ug-pcat";
      cat.innerHTML = catSVG(info.color);
      wrap.appendChild(cat);
      const rot = cat.querySelector<HTMLElement>(".ug-cat-rot");
      if (rot) rot.style.transform = "rotate(90deg)";

      const CAT_HALF = 32;
      const place = (x: number, y: number, sc: number, op: number) => {
        cat.style.transform = `translate(${x - CAT_HALF}px,${y - CAT_HALF}px) scale(${sc})`;
        cat.style.opacity = String(op);
      };

      // faint afterimage dropped periodically while walking
      let lastTrailAt = 0;
      function dropTrail(x: number, y: number, angleDeg: number) {
        const now = performance.now();
        if (now - lastTrailAt < 90) return;
        lastTrailAt = now;
        const trail = document.createElement("div");
        trail.className = "ug-trail";
        trail.style.transform = `translate(${x - CAT_HALF}px,${y - CAT_HALF}px) rotate(${angleDeg}deg)`;
        // strip the laser-pointer overlay so afterimages don't stack red dots
        trail.innerHTML = catSVG(catColor).replace(
          /<div class="ug-laser-lead">.*?<\/div><\/div>/s,
          "",
        );
        wrap?.appendChild(trail);
        trail.addEventListener("animationend", () => trail.remove(), {
          once: true,
        });
        setTimeout(() => trail.remove(), 600);
      }

      function laserImpact(x: number, y: number) {
        const fx = document.createElement("div");
        fx.className = "ug-impact ug-impact-play";
        fx.style.left = `${x}px`;
        fx.style.top = `${y}px`;
        fx.style.setProperty("--ug-impact-color", catColor);
        fx.innerHTML = `
          <div class="ug-impact-core"></div>
          <div class="ug-impact-ring ug-ir-1"></div>
          <div class="ug-impact-ring ug-ir-2"></div>
          <div class="ug-impact-ring ug-ir-3"></div>
          <div class="ug-sparkle" style="--ug-sx:16px;--ug-sy:-12px"></div>
          <div class="ug-sparkle" style="--ug-sx:-16px;--ug-sy:-10px"></div>
          <div class="ug-sparkle" style="--ug-sx:14px;--ug-sy:13px"></div>
          <div class="ug-sparkle" style="--ug-sx:-13px;--ug-sy:14px"></div>`;
        wrap?.appendChild(fx);
        const cleanup = () => fx.remove();
        setTimeout(cleanup, 700);
      }

      const T0 = performance.now();
      const POP = 220;
      const pop = (now: number) => {
        const t = Math.min(1, (now - T0) / POP);
        place(hx, hy, 0.3 + 0.75 * easeOutBack(t), Math.min(1, t * 1.4));
        if (t < 1) requestAnimationFrame(pop);
        else walk();
      };
      requestAnimationFrame(pop);

      function walk() {
        cat.classList.add("ug-walking");
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / dur);
          const e = easeOut(t);
          const p = bezierPoint(e, hx, hy, cx, cy, ex, ey);
          const angleDeg = (p.ang * 180) / Math.PI + 90;
          if (rot) rot.style.transform = `rotate(${angleDeg}deg)`;
          let scale = 1,
            op = 1;
          if (t > ENTER_AT) {
            const et = (t - ENTER_AT) / (1 - ENTER_AT);
            scale = 1 - 0.55 * et;
            op = 1 - 0.45 * et;
          }
          place(p.x, p.y, scale, op);
          if (t < 0.85) dropTrail(p.x, p.y, angleDeg);
          if (t < 1) requestAnimationFrame(step);
          else vanish(p.x, p.y, scale, op);
        };
        requestAnimationFrame(step);
      }

      function vanish(x: number, y: number, fromScale: number, fromOp: number) {
        cat.classList.remove("ug-walking");
        laserImpact(x, y);
        info?.el.classList.remove("ug-ping");
        void info?.el.offsetWidth;
        info?.el.classList.add("ug-ping");

        const vdur = 280;
        const v0 = performance.now();
        const fade = (now: number) => {
          const t = Math.min(1, (now - v0) / vdur);
          place(x, y, fromScale * (1 - t * 0.35), fromOp * (1 - t));
          if (t < 1) requestAnimationFrame(fade);
          else {
            cat.remove();
            const prev = activeCount.current.get(nodeId) ?? 1;
            activeCount.current.set(nodeId, Math.max(0, prev - 1));
          }
        };
        requestAnimationFrame(fade);
      }
    }

    function startSpawning(nodeId: string) {
      if (intervals.has(nodeId)) return;
      intervals.set(
        nodeId,
        setInterval(() => {
          const node = nodeMapRef.current.get(nodeId);
          if (!node || node.el.classList.contains("ug-muted")) {
            stopSpawning(nodeId);
            return;
          }
          spawnCat(nodeId);
        }, CAT_INTERVAL_MS),
      );
    }

    function stopSpawning(nodeId: string) {
      const iv = intervals.get(nodeId);
      if (iv) {
        clearInterval(iv);
        intervals.delete(nodeId);
      }
      const info = nodeMapRef.current.get(nodeId);
      if (info) info.el.classList.remove("ug-streaming");
    }

    // Small glowing dots that ride the same wavy path as the edge line,
    // giving the "data flowing" feel real motion instead of just a dash
    // offset animation.
    function spawnEdgeParticles(info: NodeMapEntry) {
      if (info.particles.length > 0) return;
      const wrap = graphWrapRef.current;
      if (!wrap) return;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const dot = document.createElement("div");
        dot.className = "ug-edge-particle";
        dot.style.setProperty("--ug-nc", info.color);
        dot.style.offsetPath = `path("${info.pathD}")`;
        dot.style.animationDuration = `${PARTICLE_DURATIONS_MS[i] ?? 2500}ms`;
        dot.style.animationDelay = `${PARTICLE_DELAYS_MS[i] ?? 0}ms`;
        wrap.appendChild(dot);
        info.particles.push(dot);
      }
    }

    function clearEdgeParticles(info: NodeMapEntry) {
      for (const dot of info.particles) dot.remove();
      info.particles = [];
    }

    sendCatRef.current = (nodeId: string) => {
      const info = nodeMapRef.current.get(nodeId);
      if (!info) return;
      if (info.el.classList.contains("ug-muted")) return;

      activeCount.current.set(
        nodeId,
        (activeCount.current.get(nodeId) ?? 0) + 1,
      );
      info.el.classList.add("ug-streaming");

      // activate edge animation + particle flow
      if (info.pathEl && !info.pathEl.classList.contains("ug-edge-muted")) {
        info.pathEl.classList.add("ug-active");
        spawnEdgeParticles(info);
        const existing = edgeTimersRef.current.get(nodeId);
        if (existing) clearTimeout(existing);
        edgeTimersRef.current.set(
          nodeId,
          setTimeout(() => {
            info.pathEl.classList.remove("ug-active");
            clearEdgeParticles(info);
            edgeTimersRef.current.delete(nodeId);
          }, EDGE_ACTIVE_MS),
        );
      }

      // spawn cat immediately
      spawnCat(nodeId);

      // start interval if not running
      startSpawning(nodeId);

      // reset cooldown — keep spawning for 2s after last request
      const prev = cooldowns.get(nodeId);
      if (prev) clearTimeout(prev);
      cooldowns.set(
        nodeId,
        setTimeout(() => {
          stopSpawning(nodeId);
          cooldowns.delete(nodeId);
        }, CAT_COOLDOWN_MS),
      );
    };

    return () => {
      for (const iv of intervals.values()) clearInterval(iv);
      intervals.clear();
      for (const cd of cooldowns.values()) clearTimeout(cd);
      cooldowns.clear();
    };
  }, []);

  // ── sync zoom + pan to graph wrapper ─────────────────────────────────────
  useEffect(() => {
    if (graphWrapRef.current) {
      graphWrapRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
    }
  }, [zoom, pan.x, pan.y]);

  // ── SSE real-time: trigger cat on each request ───────────────────────────
  useEffect(() => {
    return onRequest((req: RealtimeRequest) => {
      sendCatRef.current(req.transport);
    });
  }, [onRequest]);

  // ── update node sub-text when nodes change (from SSE optimistic update) ──
  useEffect(() => {
    if (!builtRef.current) return;
    for (const n of nodes) {
      const entry = nodeMapRef.current.get(n.id);
      if (!entry) continue;
      const sb = entry.el.querySelector(".ug-sb");
      if (sb) sb.textContent = n.sub;
      // un-mute if it now has requests
      if (n.requestCount > 0) {
        entry.el.classList.remove("ug-muted");
        entry.pathEl.classList.remove("ug-edge-muted");
      }
    }
  }, [nodes]);

  // ── render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading usage graph…
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <NetworkIcon />
        <AlertTitle>Usage graph could not be loaded</AlertTitle>
        <AlertDescription className="gap-3">
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="ug-wrap">
      <div className="ug-zoom-controls">
        <button
          type="button"
          className="ug-zoom-btn"
          onClick={() => applyZoom(zoom - ZOOM_STEP)}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut />
        </button>
        <span className="ug-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="ug-zoom-btn"
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn />
        </button>
        <button
          type="button"
          className="ug-zoom-btn"
          onClick={() => applyZoom(DEFAULT_ZOOM)}
          title="Reset zoom"
          aria-label="Reset graph zoom"
        >
          <Maximize2 />
        </button>
      </div>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: height ? `${height}px` : `${Math.max(200, 480 * zoom)}px`,
          position: "relative",
        }}
      />
    </div>
  );
}
