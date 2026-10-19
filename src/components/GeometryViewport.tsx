import { useRef, useState } from "react";
import type { GeometryFeature, GeometryView, KernelMesh, SketchEntity, SketchTool } from "../types/geometry";

interface Props {
  features: GeometryFeature[];
  selectedId: string | null;
  tool: SketchTool;
  view: GeometryView;
  zoom: number;
  pan: { x: number; y: number };
  onSelect: (id: string | null) => void;
  onEntity: (featureId: string, entity: SketchEntity) => void;
  onZoom: (value: number) => void;
  onPan: (value: { x: number; y: number }) => void;
  onView: (view: GeometryView) => void;
  kernelMesh: KernelMesh | null;
}

const uid = () => globalThis.crypto?.randomUUID?.() ?? `entity-${Date.now()}`;

export function GeometryViewport({ features, selectedId, tool, view, zoom, pan, onSelect, onEntity, onZoom, onPan, onView, kernelMesh }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draft, setDraft] = useState<SketchEntity | null>(null);
  const [panStart, setPanStart] = useState<{ clientX: number; clientY: number; x: number; y: number } | null>(null);
  const selectedSketch = features.find(feature => feature.id === selectedId && feature.type === "sketch");
  const point = (event: React.PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left - rect.width / 2 - pan.x) / zoom, y: (event.clientY - rect.top - rect.height / 2 - pan.y) / zoom };
  };
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || tool === "pan") { event.currentTarget.setPointerCapture(event.pointerId); setPanStart({ clientX: event.clientX, clientY: event.clientY, x: pan.x, y: pan.y }); return; }
    if (!selectedSketch || tool === "select") { onSelect(null); return; }
    const start = point(event); event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ id: uid(), type: tool, x1: start.x, y1: start.y, x2: start.x, y2: start.y } as SketchEntity);
  };
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panStart) { onPan({ x: panStart.x + event.clientX - panStart.clientX, y: panStart.y + event.clientY - panStart.clientY }); return; }
    if (draft) { const current = point(event); setDraft({ ...draft, x2: current.x, y2: current.y }); }
  };
  const pointerUp = () => {
    setPanStart(null);
    if (draft && selectedSketch && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 3) onEntity(selectedSketch.id, draft);
    setDraft(null);
  };
  const sketchEntities = features.filter(feature => feature.visible && feature.type === "sketch").flatMap(feature => feature.entities ?? []);
  const viewTransform: Record<GeometryView, string> = { isometric: "rotate(0)", front: "rotate(0) scale(1 1)", top: "rotate(-28) scale(1 .82)", right: "rotate(24) scale(.88 1)" };
  return <section className="geometry-viewport-wrap">
    <div className="viewport-label">Graphics</div>
    <svg ref={svgRef} className={`geometry-viewport tool-${tool}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onWheel={event => { event.preventDefault(); onZoom(Math.min(3, Math.max(.3, zoom * (event.deltaY < 0 ? 1.1 : .9)))); }}>
      <defs>
        <pattern id="minorGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e2e7ea" strokeWidth="1"/></pattern>
        <linearGradient id="boxTop" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#d9edf8"/><stop offset="1" stopColor="#98c4db"/></linearGradient>
        <linearGradient id="cylinderFill" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#6ca6c6"/><stop offset=".5" stopColor="#d3ecf6"/><stop offset="1" stopColor="#4b88aa"/></linearGradient>
        <radialGradient id="sphereFill" cx="35%" cy="28%"><stop stopColor="#eaf7fc"/><stop offset=".45" stopColor="#8ac2df"/><stop offset="1" stopColor="#39799c"/></radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="#fbfcfd"/>
      <rect width="100%" height="100%" fill="url(#minorGrid)" opacity={view === "isometric" ? .35 : .8}/>
      <g transform={`translate(50%, 50%) translate(${pan.x} ${pan.y}) scale(${zoom})`}>
        <g className="world-axes"><path d="M-1000 0H1000"/><path d="M0-1000V1000"/></g>
        {features.filter(feature => feature.visible && feature.type === "plane").map((feature, index) => <g key={feature.id} className={`datum-plane ${feature.id === selectedId ? "selected" : ""}`} transform={`rotate(${index * 58})`} onPointerDown={event => { event.stopPropagation(); onSelect(feature.id); }}><polygon points="-155,-82 155,-82 155,82 -155,82"/><text x="-148" y="-89">{feature.name}</text></g>)}
        {kernelMesh ? <KernelMeshShape mesh={kernelMesh} view={view}/> : <g transform={viewTransform[view]}>{features.filter(feature => feature.visible && feature.type !== "plane" && feature.type !== "sketch").map((feature, index) => <FeatureShape key={feature.id} feature={feature} index={index} selected={feature.id === selectedId} onSelect={onSelect}/>)}</g>}
        <g className="sketch-entities">{sketchEntities.map(entity => <SketchShape key={entity.id} entity={entity}/>) }{draft && <SketchShape entity={draft} draft/>}</g>
      </g>
    </svg>
    <div className="view-cube" title="Click a face to change view">
      <button className="cube-top" onClick={() => onView("top")}>TOP</button><button className="cube-front" onClick={() => onView("front")}>FRONT</button><button className="cube-side" onClick={() => onView("right")}>R</button>
    </div>
    <div className="axis-triad"><span className="axis-z">Z</span><span className="axis-y">Y</span><span className="axis-x">X</span><i/></div>
    <div className="viewport-hint">{selectedSketch && tool !== "select" ? `Sketching ${tool}: drag in the graphics area` : "Middle-drag or Pan to move • Mouse wheel to zoom"}</div>
  </section>;
}

function KernelMeshShape({ mesh, view }: { mesh: KernelMesh; view: GeometryView }) {
  if (!mesh.vertices.length) return null;
  const projected = mesh.vertices.map(([x, y, z]) => {
    if (view === "front") return { x, y: -z, depth: y };
    if (view === "top") return { x, y: -y, depth: z };
    if (view === "right") return { x: y, y: -z, depth: x };
    return { x: (x - y) * .76, y: -z + (x + y) * .36, depth: x + y + z };
  });
  const xs = projected.map(point => point.x), ys = projected.map(point => point.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const extent = Math.max(1, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const scale = 310 / extent;
  const triangles = mesh.triangles.map((triangle, index) => ({ triangle, index, depth: triangle.reduce((sum, vertex) => sum + projected[vertex].depth, 0) / 3 })).sort((a, b) => a.depth - b.depth);
  return <g className="kernel-mesh" transform={`scale(${scale}) translate(${-cx} ${-cy})`}>
    {triangles.map(({ triangle, index }) => <polygon key={`${index}-${triangle.join("-")}`} points={triangle.map(vertex => `${projected[vertex].x},${projected[vertex].y}`).join(" ")} style={{ fill: `hsl(201 48% ${58 + index % 5 * 2}%)` }}/>) }
  </g>;
}

function FeatureShape({ feature, index, selected, onSelect }: { feature: GeometryFeature; index: number; selected: boolean; onSelect: (id: string) => void }) {
  const x = -120 + index * 58, y = -45 + (index % 2) * 45;
  const select = (event: React.PointerEvent) => { event.stopPropagation(); onSelect(feature.id); };
  if (feature.type === "sphere") return <g className={`model-shape ${selected ? "selected" : ""}`} transform={`translate(${x} ${y})`} onPointerDown={select}><circle r={Math.min(48, feature.params.radius ?? 35)} fill="url(#sphereFill)"/><ellipse cy="5" rx={Math.min(48, feature.params.radius ?? 35)} ry="9" className="shape-detail"/></g>;
  if (feature.type === "cylinder") { const r = Math.min(45, feature.params.radius ?? 30), h = Math.min(90, feature.params.height ?? 65); return <g className={`model-shape ${selected ? "selected" : ""}`} transform={`translate(${x} ${y})`} onPointerDown={select}><path d={`M${-r} 0v${h}a${r} 12 0 0 0 ${r*2} 0V0z`} fill="url(#cylinderFill)"/><ellipse rx={r} ry="12" fill="#bfe0ee"/><ellipse cy={h} rx={r} ry="12" fill="#75aac5" className="shape-detail"/></g>; }
  const w = Math.min(90, feature.params.width ?? 70), h = Math.min(80, feature.params.height ?? 55), d = Math.min(28, feature.params.depth ?? 22);
  return <g className={`model-shape ${selected ? "selected" : ""}`} transform={`translate(${x} ${y})`} onPointerDown={select}><path d={`M0 0l${d} ${-d/2}h${w}l${-d} ${d/2}z`} fill="url(#boxTop)"/><path d={`M${w} 0l${d} ${-d/2}v${h}l${-d} ${d/2}z`} fill="#679bb8"/><rect width={w} height={h} fill={feature.type === "extrude" ? "#8fc3dccc" : "#a9d2e5"}/></g>;
}

function SketchShape({ entity, draft }: { entity: SketchEntity; draft?: boolean }) {
  const cls = draft ? "draft" : "";
  if (entity.type === "line") return <line className={cls} x1={entity.x1} y1={entity.y1} x2={entity.x2} y2={entity.y2}/>;
  if (entity.type === "circle") { const radius = Math.hypot(entity.x2 - entity.x1, entity.y2 - entity.y1); return <circle className={cls} cx={entity.x1} cy={entity.y1} r={radius}/>; }
  return <rect className={cls} x={Math.min(entity.x1, entity.x2)} y={Math.min(entity.y1, entity.y2)} width={Math.abs(entity.x2 - entity.x1)} height={Math.abs(entity.y2 - entity.y1)}/>;
}
