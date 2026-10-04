import type { ArchitectureGraph } from "../domain/architecture-graph";
import { calculateDiagramExportBounds, choosePngOutputSize, PNG_EDGE_ALLOWANCE, type DiagramExportExtent } from "./diagram-png-geometry";

const PREPARATION_TIMEOUT_MS = 5_000;
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
let nextStageId = 0;

export type PngCaptureResult = Readonly<{ blob: Blob; reduced: boolean; width: number; height: number }>;
export type PngCaptureFailure = "changed" | "not-ready" | "too-large" | "capture-failed" | "cancelled";

export class PngCaptureError extends Error {
  constructor(readonly reason: PngCaptureFailure) {
    super(reason);
  }
}

type CaptureInput = Readonly<{
  diagramRoot: HTMLElement;
  graph: ArchitectureGraph;
  isCurrent(): boolean;
  signal: AbortSignal;
}>;

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new PngCaptureError("cancelled")); return; }
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    function abort() { window.clearTimeout(timer); reject(new PngCaptureError("cancelled")); }
    signal.addEventListener("abort", abort, { once: true });
  });
}

function expectedElementsReady(root: HTMLElement, graph: ArchitectureGraph): boolean {
  const viewport = root.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) return false;
  const componentIds = new Set(graph.getComponents().map((component) => component.id as string));
  const connectionIds = new Set(graph.getConnections().map((connection) => connection.id as string));
  const expectedBoundaryCount = graph.getBoundaries().filter((boundary) => boundary.memberComponentIds.length > 0).length;
  const nodes = [...viewport.querySelectorAll<HTMLElement>(".react-flow__node-architekt[data-id]")];
  const edges = [...viewport.querySelectorAll<SVGGElement>(".react-flow__edge[data-id]")];
  const boundaries = viewport.querySelectorAll(".react-flow__node-boundary");
  if (nodes.length !== componentIds.size || edges.length !== connectionIds.size || boundaries.length !== expectedBoundaryCount) return false;
  if (!nodes.every((node) => componentIds.has(node.dataset.id ?? "") && getComputedStyle(node).visibility === "visible" && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0)) return false;
  if (!edges.every((edge) => connectionIds.has(edge.dataset.id ?? "") && edge.querySelector(".react-flow__edge-path[d]"))) return false;
  return [...boundaries].every((boundary) => getComputedStyle(boundary).visibility === "visible" && boundary.getBoundingClientRect().width > 0 && boundary.getBoundingClientRect().height > 0);
}

async function waitForScene(root: HTMLElement, graph: ArchitectureGraph, isCurrent: () => boolean, signal: AbortSignal): Promise<HTMLElement> {
  const deadline = performance.now() + PREPARATION_TIMEOUT_MS;
  while (performance.now() < deadline) {
    if (signal.aborted) throw new PngCaptureError("cancelled");
    if (!isCurrent()) throw new PngCaptureError("changed");
    if (document.fonts.status === "loaded" && expectedElementsReady(root, graph)) {
      const viewport = root.querySelector<HTMLElement>(".react-flow__viewport");
      if (viewport) return viewport;
    }
    await abortableDelay(50, signal);
  }
  throw new PngCaptureError("not-ready");
}

function renderedExtents(viewport: HTMLElement): DiagramExportExtent[] | null {
  try {
    const nodes = [...viewport.querySelectorAll<HTMLElement>(".react-flow__node-architekt, .react-flow__node-boundary")].map((node) => {
      const transform = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      if (Math.abs(transform.a - 1) > 1e-6 || Math.abs(transform.d - 1) > 1e-6 ||
        Math.abs(transform.b) > 1e-6 || Math.abs(transform.c) > 1e-6) throw new Error("Unexpected node transform");
      return { x: transform.e, y: transform.f, width: node.offsetWidth, height: node.offsetHeight };
    });
    const svgExtent = (element: SVGGraphicsElement): DiagramExportExtent => {
      const box = element.getBBox();
      return { x: box.x, y: box.y, width: box.width, height: box.height, allowance: PNG_EDGE_ALLOWANCE };
    };
    return [
      ...nodes,
      ...[...viewport.querySelectorAll<SVGGraphicsElement>(".react-flow__edge-path")].map(svgExtent),
      ...[...viewport.querySelectorAll<SVGGraphicsElement>(".react-flow__edge-textwrapper")].map(svgExtent),
    ];
  } catch {
    return null;
  }
}

function namespaceSvgMarkers(stage: HTMLElement): void {
  const replacements = new Map<string, string>();
  const prefix = `architekt-png-${++nextStageId}-`;
  for (const marker of stage.querySelectorAll<SVGMarkerElement>("marker[id]")) {
    const oldId = marker.id;
    const newId = `${prefix}${replacements.size}`;
    replacements.set(oldId, newId);
    marker.id = newId;
  }
  for (const element of stage.querySelectorAll<SVGElement>("[marker-start], [marker-mid], [marker-end]")) {
    for (const attribute of ["marker-start", "marker-mid", "marker-end"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      for (const [oldId, newId] of replacements) {
        if (value.includes(`#${oldId}`)) element.setAttribute(attribute, value.replace(`#${oldId}`, `#${newId}`));
      }
    }
  }
}

function stageScene(viewport: HTMLElement, bounds: Readonly<{ x: number; y: number; width: number; height: number }>): Readonly<{ captureRoot: HTMLElement; dispose(): void }> {
  const outer = document.createElement("div");
  outer.setAttribute("aria-hidden", "true");
  outer.inert = true;
  outer.style.cssText = "position:fixed;left:-100000px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;z-index:-1";
  const captureRoot = document.createElement("div");
  captureRoot.className = "architekt-diagram";
  captureRoot.style.cssText = `position:relative;width:${bounds.width}px;height:${bounds.height}px;background:#ffffff;overflow:hidden;`;
  const lightPalette: Record<string, string> = {
    "--canvas": "#ffffff", "--surface": "#ffffff", "--surface-subtle": "#f1f5f9",
    "--text-primary": "#0b1220", "--text-secondary": "#475569", "--text-muted": "#64748b",
    "--diagram-line": "#52647a", "--diagram-node-border": "#b8c5d2",
    "--diagram-boundary-border": "#a9b9c9", "--border": "#e2e8f0", "--accent-ink": "#4338ca",
    "--accent-soft": "#e0e7ff", "--focus-ring": "#6366f1",
  };
  for (const [name, value] of Object.entries(lightPalette)) captureRoot.style.setProperty(name, value);
  const flow = document.createElement("div");
  flow.className = "react-flow light";
  flow.style.cssText = "position:relative;width:100%;height:100%;overflow:hidden";
  const copy = document.createElement("div");
  copy.className = viewport.className;
  copy.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;transform:translate(${-bounds.x}px,${-bounds.y}px) scale(1);`;
  const liveEdges = viewport.querySelector<HTMLElement>(".react-flow__edges");
  const liveNodes = viewport.querySelector<HTMLElement>(".react-flow__nodes");
  if (!liveEdges || !liveNodes) throw new PngCaptureError("not-ready");
  const edges = liveEdges.cloneNode(true);
  const nodes = liveNodes.cloneNode(true) as HTMLElement;
  for (const node of nodes.querySelectorAll<HTMLElement>(".react-flow__node-architekt, .react-flow__node-boundary")) {
    // The copy has measured geometry; it must not inherit a transient visibility flag.
    node.style.visibility = "visible";
  }
  const boundaries = document.createElement("div");
  boundaries.className = liveNodes.className;
  boundaries.style.cssText = liveNodes.style.cssText;
  for (const boundary of nodes.querySelectorAll<HTMLElement>(".react-flow__node-boundary")) {
    // A negative z-index falls behind the isolated white background in foreignObject.
    boundary.style.zIndex = "0";
    boundaries.appendChild(boundary);
  }
  copy.append(boundaries, edges, nodes);
  copy.querySelectorAll(".react-flow__handle, .react-flow__edge-interaction, .react-flow__connection").forEach((element) => element.remove());
  copy.querySelectorAll(".architekt-node--selected, .architekt-boundary--selected, .architekt-node--connection-source, .selected").forEach((element) => {
    element.classList.remove("architekt-node--selected", "architekt-boundary--selected", "architekt-node--connection-source", "selected");
  });
  namespaceSvgMarkers(copy);
  flow.appendChild(copy);
  captureRoot.appendChild(flow);
  outer.appendChild(captureRoot);
  document.body.appendChild(outer);
  return { captureRoot, dispose: () => outer.remove() };
}

async function isValidPng(blob: Blob | null): Promise<boolean> {
  if (!blob || blob.type !== "image/png" || blob.size <= PNG_SIGNATURE.length) return false;
  const signature = new Uint8Array(await blob.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  return PNG_SIGNATURE.every((byte, index) => signature[index] === byte);
}

export async function captureDiagramPng({ diagramRoot, graph, isCurrent, signal }: CaptureInput): Promise<PngCaptureResult> {
  if (graph.getComponents().length === 0) throw new PngCaptureError("not-ready");
  const viewport = await waitForScene(diagramRoot, graph, isCurrent, signal);
  const extents = renderedExtents(viewport);
  if (!extents || !isCurrent()) throw new PngCaptureError(isCurrent() ? "not-ready" : "changed");
  const bounds = calculateDiagramExportBounds(extents);
  if (!bounds) throw new PngCaptureError("too-large");
  const output = choosePngOutputSize(bounds);
  if (!output) throw new PngCaptureError("too-large");
  if (signal.aborted) throw new PngCaptureError("cancelled");
  if (!isCurrent()) throw new PngCaptureError("changed");

  const stage = stageScene(viewport, bounds);
  const onAbort = () => stage.dispose();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal.aborted) throw new PngCaptureError("cancelled");
    const { toBlob } = await import("html-to-image");
    if (signal.aborted) throw new PngCaptureError("cancelled");
    const blob = await toBlob(stage.captureRoot, {
      width: bounds.width,
      height: bounds.height,
      canvasWidth: output.width,
      canvasHeight: output.height,
      pixelRatio: 1,
      skipAutoScale: true,
      backgroundColor: "#ffffff",
    });
    if (signal.aborted) throw new PngCaptureError("cancelled");
    if (!blob || !(await isValidPng(blob))) throw new PngCaptureError("capture-failed");
    return { blob, reduced: output.reduced, width: output.width, height: output.height };
  } catch (error) {
    if (error instanceof PngCaptureError) throw error;
    throw new PngCaptureError("capture-failed");
  } finally {
    signal.removeEventListener("abort", onAbort);
    stage.dispose();
  }
}
