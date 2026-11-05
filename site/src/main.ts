import "./base.css";
import "./race-design.css";
import "./atelier.css";
import type { ShowroomPaint } from "./showroom/bike-model";
import type { ShowroomScene, ShowroomFocus, ShowroomMood } from "./showroom/showroom-scene";

/*
 * Vanilla-TS port of production `bike-showroom.tsx`.
 * Same state machine and the same calls into the production scene API;
 * only the React state/JSX is replaced with direct DOM updates.
 */
const paints = [
  { id: "emerald", label: "翠綠", color: "#126449" },
  { id: "pearl", label: "珍珠白", color: "#eeeae1" },
  { id: "graphite", label: "石墨", color: "#34414a" },
] as const;
const focusViews: { id: ShowroomFocus; label: string; title: string; detail: string }[] = [
  { id: "hero", label: "全車", title: "小輪，完整的姿態。", detail: "單樑輪廓與五刀碳輪，換個角度細看。" },
  { id: "wheels", label: "五刀碳輪", title: "五片刀臂，一體線條。", detail: "靠近看輪框深度、刀臂曲面與碳纖維光澤。" },
  { id: "drivetrain", label: "傳動細節", title: "讓機械，動起來。", detail: "開啟騎乘演示，觀察曲柄、鏈條與輪組。" },
  { id: "frame", label: "車架線條", title: "BIRDY 的獨特輪廓。", detail: "弧形單樑、鏤空與前後避震的結構語彙。" },
];
const moods: { id: ShowroomMood; label: string }[] = [{ id: "atelier", label: "棚拍" }, { id: "noir", label: "夜幕" }, { id: "glacier", label: "冷光" }];

type Status = "loading" | "ready" | "unavailable";
const root = document.getElementById("bike-showroom") as HTMLElement;
const host = document.getElementById("showroom-canvas") as HTMLDivElement;
const statusLine = root.querySelector<HTMLElement>(".showroom-status")!;
const $ = <T extends Element = HTMLButtonElement>(selector: string) => root.querySelector<T>(selector)!;
const $$ = <T extends Element = HTMLButtonElement>(selector: string) => Array.from(root.querySelectorAll<T>(selector));

const state = {
  status: "loading" as Status, paint: "pearl" as ShowroomPaint, riding: false, exploded: false, paused: false,
  focus: "hero" as ShowroomFocus, mood: "atelier" as ShowroomMood, tour: false, message: "正在準備你的立體展示。",
};
let scene: ShowroomScene | null = null;
let attempt = 0;

function render() {
  const ready = state.status === "ready";
  root.dataset.sceneStatus = state.status; root.dataset.renderState = state.status;
  root.dataset.focus = state.focus; root.dataset.mood = state.mood;
  $$("button[data-mood], button[data-focus], button[data-paint], .showroom-toolbar button").forEach(button => { button.disabled = !ready; });
  $$("button[data-mood]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mood === state.mood)));
  $$("button[data-focus]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.focus === state.focus && !state.tour)));
  $$("button[data-paint]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.paint === state.paint)));

  const tourButton = $("[data-action=tour]");
  tourButton.setAttribute("aria-pressed", String(state.tour));
  tourButton.querySelector("span")!.textContent = state.tour ? "Ⅱ" : "▷";
  tourButton.querySelector("b")!.textContent = state.tour ? "結束巡禮" : "光影巡禮";
  $("[data-action=ride]").setAttribute("aria-pressed", String(state.riding));
  const explode = $("[data-action=explode]");
  explode.setAttribute("aria-pressed", String(state.exploded));
  explode.querySelector("b")!.textContent = state.exploded ? "重新組合" : "分解展示";
  const play = $("[data-action=pause]");
  play.setAttribute("aria-pressed", String(state.paused));
  play.setAttribute("aria-label", state.paused ? "播放展示動畫" : "暫停展示動畫");
  play.querySelector("span")!.textContent = state.paused ? "▶" : "Ⅱ";
  play.querySelector("b")!.textContent = state.paused ? "播放" : "暫停";

  const current = focusViews.find(item => item.id === state.focus) ?? focusViews[0];
  $<HTMLElement>("[data-detail-eyebrow]").textContent = state.tour ? "光影巡禮 / 自動運鏡" : "SELECTED VIEW / " + String(focusViews.indexOf(current) + 1).padStart(2, "0");
  $<HTMLElement>("[data-detail-title]").textContent = current.title;
  $<HTMLElement>("[data-detail-text]").textContent = current.detail;
  statusLine.textContent = state.message;
}
function set(patch: Partial<typeof state>) { Object.assign(state, patch); render(); }

function showLoading() {
  host.querySelectorAll(".showroom-loading, .showroom-fallback").forEach(node => node.remove());
  const loading = document.createElement("div");
  loading.className = "showroom-loading"; loading.setAttribute("role", "status");
  loading.innerHTML = '<span class="showroom-loading-dot"></span>正在打開立體車庫';
  host.appendChild(loading);
}
function showFallback() {
  host.querySelectorAll(".showroom-loading, .showroom-fallback").forEach(node => node.remove());
  const fallback = document.createElement("div");
  fallback.className = "showroom-fallback";
  const image = document.createElement("img");
  image.className = "showroom-fallback-bike"; image.alt = "珍珠白 BIRDY 3 實車外型參考";
  image.src = `${import.meta.env.BASE_URL}images/birdy3-reference.png`;
  const text = document.createElement("p"); text.textContent = state.message;
  const retry = document.createElement("button");
  retry.type = "button"; retry.className = "showroom-retry"; retry.textContent = "重新載入展示";
  retry.addEventListener("click", () => {
    Object.assign(state, { riding: false, exploded: false, paint: "pearl", focus: "hero", mood: "atelier", tour: false });
    attempt += 1; boot();
  });
  fallback.append(image, text, retry); host.appendChild(fallback);
}

let cancelCurrent: (() => void) | null = null;
function boot() {
  cancelCurrent?.();
  let cancelled = false;
  let active: ShowroomScene | null = null;
  const thisAttempt = attempt;
  set({ status: "loading" }); showLoading();
  import("./showroom/showroom-scene").then(({ createShowroomScene }) => {
    if (cancelled || thisAttempt !== attempt) return;
    active = createShowroomScene(host, {
      onReady(reducedMotion) {
        if (cancelled) return;
        host.querySelectorAll(".showroom-loading").forEach(node => node.remove());
        set({ status: "ready", paused: reducedMotion, message: reducedMotion ? "已依裝置設定減少動畫，仍可拖曳旋轉與切換展示。" : "拖曳單車旋轉視角，也可以試試騎乘與分解展示。" });
      },
      onError(reason) {
        if (cancelled) return;
        set({ status: "unavailable", message: reason }); showFallback();
      },
      onPauseChange(value) {
        if (cancelled) return;
        set(value ? { paused: true, message: "展示動畫已暫停，仍可手動旋轉或按播放繼續觀看。" } : { paused: false });
      },
      onTourChange(value) { if (!cancelled) set({ tour: value }); },
      onFocusChange(value) { if (!cancelled) set({ focus: value }); },
    });
    scene = active;
    (window as unknown as { __showroom?: ShowroomScene }).__showroom = active;
  }).catch(() => {
    if (cancelled) return;
    set({ status: "unavailable", message: "這個瀏覽器暫時無法載入立體展示，車庫工具仍可正常使用。" }); showFallback();
  });
  cancelCurrent = () => { cancelled = true; active?.dispose(); scene = null; };
}

// A control below the canvas should bring its visual result back into view.
function revealCanvas() {
  const bounds = host.getBoundingClientRect();
  if (bounds.top >= 12 && bounds.bottom <= window.innerHeight - 12) return;
  host.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}

function changePaint(next: ShowroomPaint) {
  scene?.setPaint(next);
  set({ paint: next, message: `已換上${paints.find(item => item.id === next)?.label}概念塗裝。` });
}
function toggleRide() {
  scene?.setTour(false);
  const next = !state.riding;
  Object.assign(state, { tour: false, riding: next, exploded: false });
  scene?.setExploded(false); scene?.setRiding(next);
  if (next) revealCanvas();
  set({ message: next ? state.paused ? "已選取騎乘演示，按播放即可觀看輪組與傳動。" : "騎乘演示已開啟，輪組、曲柄與鏈條會一同轉動。" : "已回到靜態展示。" });
}
function toggleExplosion() {
  Object.assign(state, { tour: false, focus: "hero" });
  scene?.setTour(false); scene?.setFocus("hero");
  const next = !state.exploded;
  Object.assign(state, { exploded: next, riding: false });
  scene?.setRiding(false); scene?.setExploded(next);
  revealCanvas();
  set({ message: next ? "分解展示已開啟，可旋轉查看各部件。" : state.paused ? "所有部件已回到原位。" : "部件正在回到原位。" });
}
function changeFocus(next: ShowroomFocus) {
  Object.assign(state, { tour: false, focus: next, exploded: false });
  scene?.setTour(false); scene?.setExploded(false); scene?.setFocus(next);
  revealCanvas();
  set({ message: `已切換${focusViews.find(item => item.id === next)?.label}視角。` });
}
function toggleTour() {
  const next = !state.tour;
  Object.assign(state, { tour: next, exploded: false, riding: false });
  scene?.setExploded(false); scene?.setRiding(false);
  if (next) { state.paused = false; scene?.setPaused(false); revealCanvas(); }
  scene?.setTour(next);
  set({ tour: next, message: next ? "光影巡禮已開啟，鏡頭將依序帶你看全車與部件；拖曳即可接手。" : "光影巡禮已結束，可自由旋轉。" });
}
function resetView(side = false) {
  Object.assign(state, { tour: false, focus: "hero", exploded: false, riding: false });
  scene?.setTour(false); scene?.setRiding(false); scene?.setExploded(false);
  if (side) { scene?.showSide(); state.paused = true; }
  else scene?.resetCamera();
  revealCanvas();
  set({ message: side ? "已切換正側面，方便對照實車輪廓；按播放可恢復動畫。" : "已回到完整展示視角。" });
}
function togglePause() {
  const next = !state.paused;
  scene?.setPaused(next);
  set({ paused: next, message: next ? "展示動畫已暫停，仍可手動旋轉。" : "展示動畫已播放。" });
}

root.addEventListener("click", event => {
  const button = (event.target as Element).closest<HTMLButtonElement>("button");
  if (!button || button.disabled || !root.contains(button)) return;
  if (button.dataset.mood) {
    const mood = button.dataset.mood as ShowroomMood;
    scene?.setMood(mood);
    set({ mood, message: `已切換${moods.find(item => item.id === mood)?.label}光線。` });
  } else if (button.dataset.focus) changeFocus(button.dataset.focus as ShowroomFocus);
  else if (button.dataset.paint) changePaint(button.dataset.paint as ShowroomPaint);
  else switch (button.dataset.action) {
    case "tour": toggleTour(); break;
    case "ride": toggleRide(); break;
    case "explode": toggleExplosion(); break;
    case "reset": resetView(); break;
    case "side": resetView(true); break;
    case "pause": togglePause(); break;
  }
});

render();
boot();
