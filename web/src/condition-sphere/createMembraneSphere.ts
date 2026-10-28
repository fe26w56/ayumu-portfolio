import * as THREE from "three";
import { fragmentShader, vertexShader } from "./shaders";
import type { MembraneControllerOptions, MembraneLifecycleOptions, MembraneOptions, MembraneSphereController, MetricAccentVector, MetricVector, Rgb } from "./types";

const DEFAULTS = {
  speed: 1,
  intensity: 1.5,
  deformation: 1,
  scale: 0.48,
  paused: false,
  accent: [0.82, 0.82, 0.82] as Rgb,
  accentStrength: 0.86,
  metricScores: [0.5, 0.5, 0.5, 0.5] as MetricVector,
  metricCompleteness: [1, 1, 1, 1] as MetricVector,
  metricAccents: [
    [0.47, 0.39, 0.90],
    [0.18, 0.78, 0.75],
    [0.91, 0.50, 0.31],
    [0.82, 0.32, 0.63],
  ] as MetricAccentVector,
};

function clamp(value: unknown, fallback: number, minimum: number, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeRgb(value: unknown, fallback: Rgb): Rgb {
  if (!Array.isArray(value) || value.length !== 3) return fallback;
  return [
    clamp(value[0], fallback[0], 0, 1),
    clamp(value[1], fallback[1], 0, 1),
    clamp(value[2], fallback[2], 0, 1),
  ];
}

function normalizeMetricVector(value: unknown, fallback: MetricVector): MetricVector {
  if (!Array.isArray(value) || value.length !== 4) return fallback;
  return [
    clamp(value[0], fallback[0], 0, 1),
    clamp(value[1], fallback[1], 0, 1),
    clamp(value[2], fallback[2], 0, 1),
    clamp(value[3], fallback[3], 0, 1),
  ];
}

function normalizeMetricAccents(value: unknown, fallback: MetricAccentVector): MetricAccentVector {
  if (!Array.isArray(value) || value.length !== 4) return fallback;
  return [
    normalizeRgb(value[0], fallback[0]),
    normalizeRgb(value[1], fallback[1]),
    normalizeRgb(value[2], fallback[2]),
    normalizeRgb(value[3], fallback[3]),
  ];
}

function normalizeOptions(options: MembraneOptions = {}) {
  const accent = normalizeRgb(options.accent, DEFAULTS.accent);
  return {
    speed: clamp(options.speed, DEFAULTS.speed, 0, 3),
    intensity: clamp(options.intensity, DEFAULTS.intensity, 0.1, 4),
    deformation: clamp(options.deformation, DEFAULTS.deformation, 0, 2),
    scale: clamp(options.scale, DEFAULTS.scale, 0.2, 0.9),
    paused: options.paused ?? DEFAULTS.paused,
    accent,
    accentStrength: clamp(options.accentStrength, DEFAULTS.accentStrength, 0, 1),
    metricScores: normalizeMetricVector(options.metricScores, DEFAULTS.metricScores),
    metricCompleteness: normalizeMetricVector(options.metricCompleteness, DEFAULTS.metricCompleteness),
    metricAccents: options.metricAccents
      ? normalizeMetricAccents(options.metricAccents, DEFAULTS.metricAccents)
      : options.accent
        ? [accent, accent, accent, accent] as MetricAccentVector
        : DEFAULTS.metricAccents,
  };
}

function addMediaQueryListener(query: MediaQueryList, listener: () => void) {
  if (typeof query.addEventListener === "function") query.addEventListener("change", listener);
  else query.addListener(listener);
  return () => {
    if (typeof query.removeEventListener === "function") query.removeEventListener("change", listener);
    else query.removeListener(listener);
  };
}

function cancelFrame(frame: number) {
  if (frame) window.cancelAnimationFrame(frame);
}

/** Create the single WebGL canvas used by the membrane visual. */
export function createMembraneSphere(host: HTMLElement, initial: MembraneControllerOptions = {}): MembraneSphereController {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Membrane sphere requires a browser environment");
  }

  let options = normalizeOptions(initial);
  let disposed = false;
  let contextLost = false;
  let visible = true;
  let frame = 0;
  let lastTimestamp = 0;
  let time = 0;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  const lightAppearance = () => document.documentElement.dataset.ayumuTheme !== "dark";
  renderer.setClearColor(lightAppearance() ? 0xffffff : 0x000000, 1);
  // A 2x render target smooths the membrane contour on Retina phones while
  // avoiding the full fragment cost of rendering at the common native 3x.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  renderer.domElement.setAttribute("role", "presentation");
  host.appendChild(renderer.domElement);

  const uniforms = {
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uIntensity: { value: options.intensity },
    uDeformation: { value: options.deformation },
    uScale: { value: options.scale },
    uAccentStrength: { value: options.accentStrength },
    uLightMode: { value: lightAppearance() ? 1 : 0 },
    uMetricScores: { value: new THREE.Vector4(...options.metricScores) },
    uMetricCompleteness: { value: new THREE.Vector4(...options.metricCompleteness) },
    uAccentSleep: { value: new THREE.Vector3(...options.metricAccents[0]) },
    uAccentRecovery: { value: new THREE.Vector3(...options.metricAccents[1]) },
    uAccentActivity: { value: new THREE.Vector3(...options.metricAccents[2]) },
    uAccentCirculation: { value: new THREE.Vector3(...options.metricAccents[3]) },
  };
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
  const geometry = new THREE.PlaneGeometry(2, 2);
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  scene.add(new THREE.Mesh(geometry, material));

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const lifecycle: MembraneLifecycleOptions = initial;

  const isActive = () => !disposed && !contextLost && visible && document.visibilityState === "visible" && !motionQuery.matches && !options.paused && options.speed > 0;
  const draw = () => {
    if (!disposed && !contextLost) renderer.render(scene, camera);
  };
  const tick = (timestamp: number) => {
    frame = 0;
    if (!isActive()) return;
    const elapsed = timestamp - lastTimestamp;
    if (elapsed >= 1000 / 30) {
      time += Math.min(elapsed / 1000, 0.08) * options.speed;
      lastTimestamp = timestamp;
      uniforms.uTime.value = time;
      draw();
    }
    frame = window.requestAnimationFrame(tick);
  };
  const schedule = () => {
    cancelFrame(frame);
    frame = 0;
    lastTimestamp = performance.now();
    if (isActive()) frame = window.requestAnimationFrame(tick);
  };
  const sync = () => {
    cancelFrame(frame);
    frame = 0;
    lastTimestamp = performance.now();
    draw();
    if (isActive()) frame = window.requestAnimationFrame(tick);
  };
  const resize = () => {
    const bounds = host.getBoundingClientRect();
    renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
    renderer.getDrawingBufferSize(uniforms.uResolution.value);
    sync();
  };
  const handleVisibility = () => sync();
  const handleMotionChange = () => sync();
  const handleThemeChange = () => {
    const light = lightAppearance();
    uniforms.uLightMode.value = light ? 1 : 0;
    renderer.setClearColor(light ? 0xffffff : 0x000000, 1);
    sync();
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextLost = true;
    cancelFrame(frame);
    frame = 0;
    lifecycle.onUnavailable?.();
  };
  const handleContextRestored = () => {
    contextLost = false;
    lifecycle.onAvailable?.();
    sync();
  };

  const resizeObserver = typeof ResizeObserver === "function" ? new ResizeObserver(resize) : undefined;
  resizeObserver?.observe(host);
  const intersectionObserver = typeof IntersectionObserver === "function"
    ? new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false;
      schedule();
    }, { rootMargin: "40px" })
    : undefined;
  intersectionObserver?.observe(host);

  const removeMotionListener = addMediaQueryListener(motionQuery, handleMotionChange);
  const themeObserver = new MutationObserver(handleThemeChange);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ayumu-theme"] });
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", handleVisibility);
  renderer.domElement.addEventListener("webglcontextlost", handleContextLost);
  renderer.domElement.addEventListener("webglcontextrestored", handleContextRestored);

  const update = (next: MembraneOptions) => {
    if (disposed) return;
    options = normalizeOptions({ ...options, ...next });
    uniforms.uIntensity.value = options.intensity;
    uniforms.uDeformation.value = options.deformation;
    uniforms.uScale.value = options.scale;
    uniforms.uAccentStrength.value = options.accentStrength;
    uniforms.uMetricScores.value.set(...options.metricScores);
    uniforms.uMetricCompleteness.value.set(...options.metricCompleteness);
    uniforms.uAccentSleep.value.set(...options.metricAccents[0]);
    uniforms.uAccentRecovery.value.set(...options.metricAccents[1]);
    uniforms.uAccentActivity.value.set(...options.metricAccents[2]);
    uniforms.uAccentCirculation.value.set(...options.metricAccents[3]);
    sync();
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelFrame(frame);
    frame = 0;
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    removeMotionListener();
    themeObserver.disconnect();
    window.removeEventListener("resize", resize);
    document.removeEventListener("visibilitychange", handleVisibility);
    renderer.domElement.removeEventListener("webglcontextlost", handleContextLost);
    renderer.domElement.removeEventListener("webglcontextrestored", handleContextRestored);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };

  resize();
  return { update, dispose };
}
