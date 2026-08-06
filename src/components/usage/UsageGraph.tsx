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
    <g class="ug-leg ug-leg-fl" style="transform-origin:50% 0%"><rect x="15" y="20" width="3.2" height="11" rx="1.6" fill="var(--ug-cat-leg)"/></g>
    <g class="ug-leg ug-leg-fr" style="transform-origin:50% 0%"><rect x="34" y="20" width="3.2" height="11" rx="1.6" fill="var(--ug-cat-leg)"/></g>
    <g class="ug-leg ug-leg-bl" style="transform-origin:50% 0%"><rect x="16" y="30" width="3.2" height="12" rx="1.6" fill="var(--ug-cat-leg-dark)"/></g>
    <g class="ug-leg ug-leg-br" style="transform-origin:50% 0%"><rect x="33" y="30" width="3.2" height="12" rx="1.6" fill="var(--ug-cat-leg-dark)"/></g>
    <g class="ug-tail"><path d="M27 41 C27 47, 33 49, 36 45" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/></g>
    <g class="ug-cat-body">
      <ellipse cx="27" cy="30" rx="10.5" ry="13" fill="var(--ug-cat-fill)" stroke="${color}" stroke-width="1.4"/>
      <path d="M20 15 L18 8 L24.5 12 Z" fill="var(--ug-cat-fill-dark)" stroke="${color}" stroke-width="1.1"/>
      <path d="M34 15 L36 8 L29.5 12 Z" fill="var(--ug-cat-fill-dark)" stroke="${color}" stroke-width="1.1"/>
      <circle cx="27" cy="16" r="8.4" fill="var(--ug-cat-fill-darker)" stroke="${color}" stroke-width="1.4"/>
      <g class="ug-eyes">
        <circle cx="24" cy="15" r="1.5" fill="${color}"/>
        <circle cx="30" cy="15" r="1.5" fill="${color}"/>
      </g>
      <path d="M25.6 18.6 q1.4 1.4 2.8 0" stroke="${color}" stroke-width="1" fill="none" stroke-linecap="round"/>
    </g>
  </svg></div>`;
}

import "./UsageGraph.css";

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

    // hub
    const hubEl = document.createElement("div");
    hubEl.className = "ug-node ug-hub";
    hubEl.style.left = `${HUB.x}%`;
    hubEl.style.top = `${HUB.y}%`;
    hubEl.style.setProperty("--ug-nc", "#f5a623");
    hubEl.innerHTML = `<div class="ug-hub-text">
      <div class="ug-hub-emoji">🐾</div>
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
    const intervals = new Map<string, ReturnType<typeof setInterval>>();
    const cooldowns = new Map<string, ReturnType<typeof setTimeout>>();
    const CAT_INTERVAL_MS = 200;
    const CAT_COOLDOWN_MS = 2000;

    function spawnCat(nodeId: string) {
      const info = nodeMapRef.current.get(nodeId);
      if (!info) return;
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

    sendCatRef.current = (nodeId: string) => {
      const info = nodeMapRef.current.get(nodeId);
      if (!info) return;
      if (info.el.classList.contains("ug-muted")) return;

      activeCount.current.set(
        nodeId,
        (activeCount.current.get(nodeId) ?? 0) + 1,
      );
      info.el.classList.add("ug-streaming");

      // activate edge animation
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
