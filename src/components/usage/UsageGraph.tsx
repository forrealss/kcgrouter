/**
 * UsageGraph -- hub-and-spoke animated network graph
 *
 * - CSS scoped to .ug-* (no global theme pollution)
 * - Animations: CSS keyframes + requestAnimationFrame (zero new deps)
 * - Data real dari useUsageGraph()
 * - Kucing muncul HANYA saat request beneran lewat /v1 (SSE real-time)
 * - Garis wavy kelap-kelip dari hub ke tiap node
 * - Provider yang belum ada request tampil dimuted
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

function wavyPath(
  hx: number,
  hy: number,
  ex: number,
  ey: number,
  waves: number,
  amp: number,
): string {
  const dx = ex - hx,
    dy = ey - hy;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist,
    ny = dx / dist;
  const steps = waves * 10;
  let d = `M ${hx.toFixed(2)} ${hy.toFixed(2)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const bx = hx + dx * t,
      by = hy + dy * t;
    const off = Math.sin(t * Math.PI * 2 * waves) * amp;
    d += ` L ${(bx + nx * off).toFixed(2)} ${(by + ny * off).toFixed(2)}`;
  }
  return d;
}

function catSVG(color: string): string {
  return `<div class="ug-cat-rot">
  <div class="ug-laser-lead"><div class="ug-laser-tail"></div><div class="ug-laser-dot"></div></div>
  <svg viewBox="0 0 54 54" width="54" height="54">
    <g class="ug-leg ug-leg-fl" style="transform-origin:50% 0%"><rect x="15" y="20" width="3.2" height="11" rx="1.6" fill="#3b3b3b"/></g>
    <g class="ug-leg ug-leg-fr" style="transform-origin:50% 0%"><rect x="34" y="20" width="3.2" height="11" rx="1.6" fill="#3b3b3b"/></g>
    <g class="ug-leg ug-leg-bl" style="transform-origin:50% 0%"><rect x="16" y="30" width="3.2" height="12" rx="1.6" fill="#333"/></g>
    <g class="ug-leg ug-leg-br" style="transform-origin:50% 0%"><rect x="33" y="30" width="3.2" height="12" rx="1.6" fill="#333"/></g>
    <g class="ug-tail"><path d="M27 41 C27 47, 33 49, 36 45" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <g class="ug-cat-body">
      <ellipse cx="27" cy="30" rx="10.5" ry="13" fill="#1e1e1e" stroke="${color}" stroke-width="1.4"/>
      <path d="M20 15 L18 8 L24.5 12 Z" fill="#232323" stroke="${color}" stroke-width="1.1"/>
      <path d="M34 15 L36 8 L29.5 12 Z" fill="#232323" stroke="${color}" stroke-width="1.1"/>
      <circle cx="27" cy="16" r="8.4" fill="#242424" stroke="${color}" stroke-width="1.4"/>
      <g class="ug-eyes">
        <circle cx="24" cy="15" r="1.5" fill="${color}"/>
        <circle cx="30" cy="15" r="1.5" fill="${color}"/>
      </g>
      <path d="M25.6 18.6 q1.4 1.4 2.8 0" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round"/>
    </g>
  </svg></div>`;
}

// ─── scoped CSS ───────────────────────────────────────────────────────────────
const GRAPH_CSS = `
.ug-wrap{position:relative;width:100%;height:100%;overflow:hidden;
  background:#0a0a0a;border-radius:0;border-bottom-left-radius:0.75rem;border-bottom-right-radius:0.75rem;
  cursor:grab;user-select:none}
.ug-wrap:active{cursor:grabbing}
.ug-graph{position:relative;width:100%;height:100%;transform-origin:center center;user-select:none}

.ug-node{
  position:absolute;transform:translate(-50%,-50%);
  background:#141414;border:1px solid #262626;border-radius:12px;
  padding:8px 10px;min-width:130px;cursor:default;
  transition:border-color .25s,box-shadow .25s,transform .25s,opacity .3s;
  z-index:3;user-select:none;
}
.ug-node:hover{
  border-color:var(--ug-nc,#3f3f3f);
  box-shadow:0 0 0 1px var(--ug-nc,#3f3f3f),0 0 22px -4px var(--ug-nc,#3f3f3f);
  transform:translate(-50%,-50%) scale(1.04)
}
.ug-node .ug-row{display:flex;align-items:center;gap:8px}
.ug-node .ug-ico{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;
  font-size:12px;
  background:color-mix(in oklab,var(--ug-nc) 22%,#000);
  border:1px solid color-mix(in oklab,var(--ug-nc) 45%,#000)}
.ug-node .ug-lb{font-size:12px;font-weight:600;line-height:1.1;color:#e5e5e5}
.ug-node .ug-sb{font-size:10px;color:#8a8a8a;margin-top:1px}

.ug-hub{min-width:0!important;width:100px;height:100px;border-radius:50%!important;
  background:radial-gradient(circle at 50% 40%,#1b1b1b,#0d0d0d);
  display:grid!important;place-items:center;padding:0!important}

.ug-muted{opacity:.35;pointer-events:none}
.ug-muted .ug-ico{opacity:.5}

@keyframes ug-node-ping{
  0%{box-shadow:0 0 0 0 var(--ug-nc),0 0 26px -2px var(--ug-nc);border-color:var(--ug-nc)}
  100%{box-shadow:0 0 0 10px transparent,0 0 0 transparent;border-color:#262626}
}
.ug-ping{animation:ug-node-ping .7s ease-out}
.ug-streaming{
  border-color:var(--ug-nc,#3f3f3f)!important;
  box-shadow:0 0 0 1px var(--ug-nc,#3f3f3f),0 0 18px -4px var(--ug-nc,#3f3f3f)!important
}

.ug-edge-svg{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.ug-edge-line{fill:none;stroke-width:1.3;stroke-dasharray:4 5;stroke-linecap:round;
  vector-effect:non-scaling-stroke;opacity:.12}
.ug-edge-line.ug-active{animation:ug-edge-flow 2.4s linear infinite,ug-edge-flicker 2.8s ease-in-out infinite}
.ug-edge-line.ug-edge-muted{animation:none;opacity:.08}

@keyframes ug-edge-flow{to{stroke-dashoffset:-18}}
@keyframes ug-edge-flicker{
  0%,100%{opacity:.14} 18%{opacity:.34} 32%{opacity:.16}
  50%{opacity:.4} 64%{opacity:.15} 80%{opacity:.3} 90%{opacity:.18}
}

.ug-pcat{position:absolute;left:0;top:0;width:54px;height:54px;
  transform-origin:50% 50%;pointer-events:none;z-index:2;will-change:transform,opacity}
.ug-cat-rot{position:relative;width:100%;height:100%;transform-origin:50% 50%}
.ug-cat-body{transform-origin:50% 50%}
.ug-leg{transform-box:fill-box;animation-play-state:paused;animation:none}
.ug-laser-lead{position:absolute;left:50%;top:-13px;width:2px;height:18px;transform:translateX(-50%);pointer-events:none}
.ug-laser-tail{position:absolute;left:50%;top:0;width:2px;height:100%;transform:translateX(-50%);
  border-radius:2px;background:linear-gradient(to top,rgba(255,43,77,0),rgba(255,43,77,.85))}
.ug-laser-dot{position:absolute;left:50%;top:-3px;width:8px;height:8px;transform:translateX(-50%);
  border-radius:50%;background:#ff2b4d;
  box-shadow:0 0 6px 2px #ff2b4d,0 0 16px 5px rgba(255,43,77,.55)}

@keyframes ug-stepA{0%{transform:rotate(-18deg)}50%{transform:rotate(18deg)}100%{transform:rotate(-18deg)}}
@keyframes ug-stepB{0%{transform:rotate(18deg)}50%{transform:rotate(-18deg)}100%{transform:rotate(18deg)}}
@keyframes ug-bob{0%,100%{transform:translateY(0)}25%{transform:translateY(-1.5px)}75%{transform:translateY(1.5px)}}
.ug-walking .ug-leg{animation-duration:.45s;animation-timing-function:ease-in-out;
  animation-iteration-count:infinite;animation-play-state:running}
.ug-walking .ug-leg-fl,.ug-walking .ug-leg-br{animation-name:ug-stepA}
.ug-walking .ug-leg-fr,.ug-walking .ug-leg-bl{animation-name:ug-stepB}
.ug-walking .ug-cat-body{animation:ug-bob .45s ease-in-out infinite}
@keyframes ug-tail-wag{0%,100%{transform:rotate(-12deg)}50%{transform:rotate(14deg)}}
.ug-tail{transform-box:fill-box;transform-origin:0% 50%;animation:ug-tail-wag .9s ease-in-out infinite}
@keyframes ug-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
.ug-eyes{transform-box:fill-box;transform-origin:50% 50%;animation:ug-blink 3.4s ease-in-out infinite}

.ug-impact{position:absolute;width:26px;height:26px;border-radius:50%;
  background:radial-gradient(circle,rgba(255,43,77,.85),rgba(255,43,77,0) 70%);
  pointer-events:none;z-index:1}
@keyframes ug-impact-anim{
  0%{transform:translate(-50%,-50%) scale(.3);opacity:1}
  100%{transform:translate(-50%,-50%) scale(2.3);opacity:0}
}
.ug-impact.ug-impact-play{animation:ug-impact-anim .5s ease-out forwards}

.ug-node .ug-ico-text{font-size:11px;font-weight:700;color:var(--ug-nc,#e5e5e5)}

/* ── zoom controls ─────────────────────────────────────────────────────── */
.ug-zoom-controls{
  position:absolute;top:8px;right:8px;z-index:50;
  display:flex;align-items:center;gap:2px;
  background:rgba(20,20,20,.88);border:1px solid #262626;border-radius:8px;
  padding:3px;backdrop-filter:blur(8px)
}
.ug-zoom-btn{
  width:26px;height:26px;border:none;border-radius:6px;
  background:transparent;color:#a3a3a3;cursor:pointer;
  display:grid;place-items:center;transition:background .15s,color .15s;
  padding:0;line-height:0
}
.ug-zoom-btn:hover{background:#262626;color:#e5e5e5}
.ug-zoom-btn:active{background:#333}
.ug-zoom-btn svg{width:14px;height:14px}
.ug-zoom-pct{
  font-size:10px;font-weight:600;color:#737373;
  min-width:32px;text-align:center;user-select:none;font-variant-numeric:tabular-nums
}
`;

function transportIcon(transport: string): string {
  switch (transport) {
    case "openai":
      return "◎";
    case "anthropic":
      return "✳";
    case "gemini":
      return "✦";
    case "kiro":
      return "◆";
    case "command-code":
      return "⌘";
    default:
      return "●";
  }
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
  px: number;
  py: number;
  color: string;
}

export function UsageGraph({ height }: { height?: number } = {}) {
  const { nodes, loading, error, reload, onRequest } = useUsageGraph();
  const containerRef = useRef<HTMLDivElement>(null);
  const styleInjected = useRef(false);
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

  // cleanup edge timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of edgeTimersRef.current.values()) {
        clearTimeout(timer);
      }
      edgeTimersRef.current.clear();
    };
  }, []);

  // inject scoped CSS once
  useEffect(() => {
    if (styleInjected.current) return;
    const el = document.createElement("style");
    el.id = "ug-scoped-css";
    el.textContent = GRAPH_CSS;
    document.head.appendChild(el);
    styleInjected.current = true;
  }, []);

  // build graph DOM (once, when nodes first load)
  useEffect(() => {
    if (loading || error || nodes.length === 0 || builtRef.current) return;
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

    // hub
    const hubEl = document.createElement("div");
    hubEl.className = "ug-node ug-hub";
    hubEl.style.left = `${HUB.x}%`;
    hubEl.style.top = `${HUB.y}%`;
    hubEl.style.setProperty("--ug-nc", "#f5a623");
    hubEl.innerHTML = `<div style="text-align:center">
      <div style="font-size:18px">🐾</div>
      <div style="font-size:10px;font-weight:600;margin-top:2px;color:#e5e5e5">Router Hub</div>
      <div style="font-size:9px;color:#8a8a8a">KCG Router</div>
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
        <div class="ug-ico"><span class="ug-ico-text">${transportIcon(n.transport)}</span></div>
        <div><div class="ug-lb">${n.label}</div><div class="ug-sb">${n.sub}</div></div>
      </div>`;
      wrap.appendChild(el);

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute(
        "class",
        `ug-edge-line${muted ? " ug-edge-muted" : ""}`,
      );
      path.setAttribute("d", wavyPath(HUB.x, HUB.y, px, py, 6, 2.2));
      path.setAttribute("stroke", n.color);
      svg.appendChild(path);

      activeCount.current.set(n.id, 0);
      nodeMapRef.current.set(n.id, {
        el,
        pathEl: path,
        px,
        py,
        color: n.color,
      });
    }
  }, [nodes, loading, error]);

  // ── sendCat (imperative, called from SSE handler) ────────────────────────
  const sendCatRef = useRef<(nodeId: string) => void>(() => {});

  useEffect(() => {
    sendCatRef.current = (nodeId: string) => {
      const info = nodeMapRef.current.get(nodeId);
      if (!info) return;
      if (info.el.classList.contains("ug-muted")) return;
      const cur = activeCount.current.get(nodeId) ?? 0;
      activeCount.current.set(nodeId, cur + 1);

      info.el.classList.add("ug-streaming");

      // activate edge animation for this node
      if (info.pathEl && !info.pathEl.classList.contains("ug-edge-muted")) {
        info.pathEl.classList.add("ug-active");
        const existing = edgeTimersRef.current.get(nodeId);
        if (existing) clearTimeout(existing);
        edgeTimersRef.current.set(
          nodeId,
          setTimeout(() => {
            info.pathEl.classList.remove("ug-active");
            edgeTimersRef.current.delete(nodeId);
          }, EDGE_ACTIVE_MS),
        );
      }

      const wrap = graphWrapRef.current;
      if (!wrap) return;
      // Use offsetWidth/offsetHeight (unscaled layout size) for correct cat positioning
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

      const place = (x: number, y: number, sc: number, op: number) => {
        cat.style.transform = `translate(${x - 27}px,${y - 27}px) scale(${sc})`;
        cat.style.opacity = String(op);
      };

      function laserImpact(x: number, y: number) {
        const fx = document.createElement("div");
        fx.className = "ug-impact ug-impact-play";
        fx.style.left = `${x}px`;
        fx.style.top = `${y}px`;
        wrap.appendChild(fx);
        const cleanup = () => fx.remove();
        fx.addEventListener("animationend", cleanup, { once: true });
        setTimeout(cleanup, 600);
      }

      const T0 = performance.now();
      const POP = 180;
      const pop = (now: number) => {
        const t = Math.min(1, (now - T0) / POP);
        place(hx, hy, 0.4 + 0.6 * easeOut(t), t);
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
          if (rot)
            rot.style.transform = `rotate(${(p.ang * 180) / Math.PI + 90}deg)`;
          let scale = 1,
            op = 1;
          if (t > ENTER_AT) {
            const et = (t - ENTER_AT) / (1 - ENTER_AT);
            scale = 1 - 0.55 * et;
            op = 1 - 0.45 * et;
          }
          place(p.x, p.y, scale, op);
          if (t < 1) requestAnimationFrame(step);
          else vanish(p.x, p.y, scale, op);
        };
        requestAnimationFrame(step);
      }

      function vanish(x: number, y: number, fromScale: number, fromOp: number) {
        cat.classList.remove("ug-walking");
        laserImpact(x, y);
        info.el.classList.remove("ug-ping");
        void info.el.offsetWidth;
        info.el.classList.add("ug-ping");

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
            const remaining = activeCount.current.get(nodeId) ?? 0;
            if (remaining === 0) info.el.classList.remove("ug-streaming");
          }
        };
        requestAnimationFrame(fade);
      }
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
        >
          <ZoomOut />
        </button>
        <span className="ug-zoom-pct">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="ug-zoom-btn"
          onClick={() => applyZoom(zoom + ZOOM_STEP)}
          title="Zoom in"
        >
          <ZoomIn />
        </button>
        <button
          type="button"
          className="ug-zoom-btn"
          onClick={() => applyZoom(DEFAULT_ZOOM)}
          title="Reset zoom"
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
