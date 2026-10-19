import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODEL_TO_VIEW, add, arcPoint, circumcircle, distance, entityCenter, entityPoints, formatDimension,
  lineIntersection, mul, normalize, perpendicular, polygonPoints, rectanglePoints, sub, translateEntity, uid,
} from "../geometry/sketchMath";
import type {
  DatumPlane, DimensionKind, EditorTool, Point2, SketchDimension, SketchDocument, SketchEntity, ViewState,
} from "../types/sketch";

interface SketchViewportProps {
  document: SketchDocument;
  entities: SketchEntity[];
  dimensions: SketchDimension[];
  activePlane: DatumPlane;
  activeTool: EditorTool;
  selectedIds: string[];
  selectionKind: "plane" | "sketch" | "entity" | "dimension";
  view: ViewState;
  onViewChange: (view: ViewState) => void;
  onSelectEntity: (id: string, additive: boolean, subIndex?: number) => void;
  onSelectDimension: (id: string) => void;
  onClearSelection: () => void;
  onAddEntity: (entity: SketchEntity) => void;
  onMoveEntities: (ids: string[], delta: Point2) => void;
  onAddDimension: (kind: DimensionKind, entityId: string) => void;
  onMoveDimension: (id: string, offset: Point2) => void;
  onStatus: (status: string) => void;
  onToolCancel: () => void;
}

interface DrawState { points: Point2[]; current: Point2 | null }
interface DragState { kind: "entity" | "dimension"; id: string; start: Point2; last: Point2; originalOffset?: Point2 }

const VIEW_BOX = { x: -500, y: -300, width: 1000, height: 600 };
const isDrawTool = (tool: EditorTool) => ["line", "polyline", "rectangle", "rectangle3", "polygon", "circle", "arc3", "arcCenter", "ellipse"].includes(tool);
const dimensionToolKind = (tool: EditorTool): DimensionKind | null => ({
  dimGeneral: "general", dimHorizontal: "horizontal", dimVertical: "vertical", dimLength: "length",
  dimRadius: "radius", dimDiameter: "diameter", dimAngle: "angle",
} as Partial<Record<EditorTool, DimensionKind>>)[tool] ?? null;

export function SketchViewport(props: SketchViewportProps) {
  const { document, entities, dimensions, activePlane, activeTool, selectedIds, selectionKind, view } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [draw, setDraw] = useState<DrawState>({ points: [], current: null });
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panDrag, setPanDrag] = useState<{ client: Point2; pan: Point2 } | null>(null);
  const [snapMarker, setSnapMarker] = useState<{ point: Point2; label: string } | null>(null);

  const modelToView = (point: Point2): Point2 => ({ x: point.x * MODEL_TO_VIEW * view.zoom + view.pan.x, y: -point.y * MODEL_TO_VIEW * view.zoom + view.pan.y });
  const eventToView = (event: React.PointerEvent | React.WheelEvent): Point2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: VIEW_BOX.x + (event.clientX - rect.left) / rect.width * VIEW_BOX.width, y: VIEW_BOX.y + (event.clientY - rect.top) / rect.height * VIEW_BOX.height };
  };
  const eventToModel = (event: React.PointerEvent | React.WheelEvent): Point2 => {
    const point = eventToView(event);
    return { x: (point.x - view.pan.x) / (MODEL_TO_VIEW * view.zoom), y: -(point.y - view.pan.y) / (MODEL_TO_VIEW * view.zoom) };
  };

  useEffect(() => { setDraw({ points: [], current: null }); setSnapMarker(null); }, [activeTool]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDraw({ points: [], current: null }); setSnapMarker(null); props.onToolCancel(); }
      if (event.key === "Enter" && activeTool === "polyline" && draw.points.length > 1) finishPolyline();
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const snapCandidates = useMemo(() => {
    const points: { point: Point2; label: string }[] = [{ point: { x: 0, y: 0 }, label: "Origin" }];
    for (const entity of entities) {
      const values = entityPoints(entity);
      values.forEach((point, index) => points.push({ point, label: index === 0 ? "Endpoint" : "Point" }));
      points.push({ point: entityCenter(entity), label: entity.type === "circle" || entity.type === "arc" || entity.type === "ellipse" || entity.type === "polygon" ? "Center" : "Midpoint" });
    }
    const lines = entities.filter((entity): entity is Extract<SketchEntity, { type: "line" }> => entity.type === "line");
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
      const point = lineIntersection(lines[a].start, lines[a].end, lines[b].start, lines[b].end, true);
      if (point) points.push({ point, label: "Intersection" });
    }
    return points;
  }, [entities]);

  const applySnap = (raw: Point2): Point2 => {
    if (!document.display.snap) { setSnapMarker(null); return raw; }
    const tolerance = 10 / (MODEL_TO_VIEW * view.zoom);
    let best: { point: Point2; label: string; distance: number } | null = null;
    for (const candidate of snapCandidates) {
      const d = distance(raw, candidate.point);
      if (d <= tolerance && (!best || d < best.distance)) best = { ...candidate, distance: d };
    }
    if (!best && draw.points.length) {
      const first = draw.points[draw.points.length - 1];
      if (Math.abs(raw.x - first.x) <= tolerance) best = { point: { x: first.x, y: raw.y }, label: "Vertical", distance: Math.abs(raw.x - first.x) };
      if (Math.abs(raw.y - first.y) <= tolerance && (!best || Math.abs(raw.y - first.y) < best.distance)) best = { point: { x: raw.x, y: first.y }, label: "Horizontal", distance: Math.abs(raw.y - first.y) };
    }
    if (!best && document.display.grid) {
      const size = document.display.gridSize;
      const point = { x: Math.round(raw.x / size) * size, y: Math.round(raw.y / size) * size };
      if (distance(raw, point) <= tolerance) best = { point, label: "Grid", distance: distance(raw, point) };
    }
    setSnapMarker(best ? { point: best.point, label: best.label } : null);
    return best?.point ?? raw;
  };

  const makeBase = (type: SketchEntity["type"]) => ({ id: uid(type), name: type, sketchId: document.activeSketchId ?? "", visible: true, valid: true });
  const finishPolyline = () => {
    if (draw.points.length > 1) props.onAddEntity({ ...makeBase("polyline"), type: "polyline", points: draw.points, closed: false });
    setDraw({ points: [], current: null });
  };

  const createEntity = (points: Point2[]): SketchEntity | null => {
    const p = points;
    if (activeTool === "line" && p.length >= 2) return { ...makeBase("line"), type: "line", start: p[0], end: p[1] };
    if (activeTool === "rectangle" && p.length >= 2) return { ...makeBase("rectangle"), type: "rectangle", origin: p[0], u: { x: p[1].x - p[0].x, y: 0 }, v: { x: 0, y: p[1].y - p[0].y } };
    if (activeTool === "rectangle3" && p.length >= 3) {
      const u = sub(p[1], p[0]), unitV = perpendicular(normalize(u)), height = (p[2].x - p[0].x) * unitV.x + (p[2].y - p[0].y) * unitV.y;
      return { ...makeBase("rectangle"), type: "rectangle", origin: p[0], u, v: mul(unitV, height) };
    }
    if (activeTool === "circle" && p.length >= 2) return { ...makeBase("circle"), type: "circle", center: p[0], radius: distance(p[0], p[1]) };
    if (activeTool === "polygon" && p.length >= 2) return { ...makeBase("polygon"), type: "polygon", center: p[0], radius: distance(p[0], p[1]), sides: document.display.polygonSides, rotation: Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x) };
    if (activeTool === "arc3" && p.length >= 3) { const arc = circumcircle(p[0], p[1], p[2]); return arc ? { ...makeBase("arc"), type: "arc", ...arc } : null; }
    if (activeTool === "arcCenter" && p.length >= 3) {
      const startAngle = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x), endAngle = Math.atan2(p[2].y - p[0].y, p[2].x - p[0].x);
      let sweepAngle = endAngle - startAngle; if (sweepAngle <= 0) sweepAngle += Math.PI * 2;
      return { ...makeBase("arc"), type: "arc", center: p[0], radius: distance(p[0], p[1]), startAngle, sweepAngle };
    }
    if (activeTool === "ellipse" && p.length >= 3) {
      const axis = sub(p[1], p[0]), unitMinor = perpendicular(normalize(axis));
      return { ...makeBase("ellipse"), type: "ellipse", center: p[0], radiusX: distance(p[0], p[1]), radiusY: Math.abs((p[2].x - p[0].x) * unitMinor.x + (p[2].y - p[0].y) * unitMinor.y), rotation: Math.atan2(axis.y, axis.x) };
    }
    return null;
  };

  const requiredPoints = activeTool === "rectangle3" || activeTool === "arc3" || activeTool === "arcCenter" || activeTool === "ellipse" ? 3 : 2;
  const preview = useMemo(() => {
    if (!isDrawTool(activeTool) || !draw.current || !draw.points.length || activeTool === "polyline") return null;
    const points = [...draw.points, draw.current];
    if (points.length < requiredPoints) {
      if (activeTool === "rectangle3" && points.length === 2) return { ...makeBase("line"), type: "line", start: points[0], end: points[1] } as SketchEntity;
      if ((activeTool === "arc3" || activeTool === "arcCenter" || activeTool === "ellipse") && points.length === 2) return { ...makeBase("line"), type: "line", start: points[0], end: points[1] } as SketchEntity;
      return null;
    }
    return createEntity(points);
  }, [activeTool, draw, requiredPoints]);

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button === 1 || activeTool === "pan") {
      event.currentTarget.setPointerCapture(event.pointerId); setPanDrag({ client: { x: event.clientX, y: event.clientY }, pan: view.pan }); return;
    }
    if (event.button !== 0) return;
    if (!isDrawTool(activeTool)) { props.onClearSelection(); return; }
    const point = applySnap(eventToModel(event));
    if (activeTool === "polyline") { setDraw(current => ({ points: [...current.points, point], current: point })); props.onStatus("Polyline: click next point, Enter or right-click to finish"); return; }
    const points = [...draw.points, point];
    if (points.length >= requiredPoints) {
      const entity = createEntity(points);
      if (entity && entity.valid && entityPoints(entity).every(p => Number.isFinite(p.x) && Number.isFinite(p.y))) props.onAddEntity(entity);
      setDraw({ points: [], current: null });
    } else setDraw({ points, current: point });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (panDrag) {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = (event.clientX - panDrag.client.x) / rect.width * VIEW_BOX.width, dy = (event.clientY - panDrag.client.y) / rect.height * VIEW_BOX.height;
      props.onViewChange({ ...view, pan: { x: panDrag.pan.x + dx, y: panDrag.pan.y + dy } }); return;
    }
    const raw = eventToModel(event);
    if (drag) { setDrag({ ...drag, last: raw }); return; }
    if (isDrawTool(activeTool)) setDraw(current => ({ ...current, current: applySnap(raw) }));
  };

  const endPointer = () => {
    if (drag) {
      const delta = sub(drag.last, drag.start);
      if (drag.kind === "entity" && distance(drag.start, drag.last) > 1e-10) props.onMoveEntities(selectedIds.includes(drag.id) ? selectedIds : [drag.id], delta);
      if (drag.kind === "dimension" && drag.originalOffset) props.onMoveDimension(drag.id, add(drag.originalOffset, delta));
    }
    setDrag(null); setPanDrag(null);
  };

  const handleEntityPointerDown = (event: React.PointerEvent, entity: SketchEntity, subIndex?: number) => {
    event.stopPropagation(); if (event.button !== 0) return;
    const kind = dimensionToolKind(activeTool);
    if (kind) { props.onAddDimension(kind, entity.id); return; }
    if (activeTool !== "select" && activeTool !== "move") return;
    props.onSelectEntity(entity.id, event.ctrlKey || event.metaKey || event.shiftKey, subIndex);
    const start = eventToModel(event as React.PointerEvent<SVGSVGElement>);
    setDrag({ kind: "entity", id: entity.id, start, last: start });
  };

  const handleDimensionPointerDown = (event: React.PointerEvent, dimension: SketchDimension) => {
    event.stopPropagation(); props.onSelectDimension(dimension.id);
    if (activeTool === "dimMove" || activeTool === "select") {
      const start = eventToModel(event as React.PointerEvent<SVGSVGElement>);
      setDrag({ kind: "dimension", id: dimension.id, start, last: start, originalOffset: dimension.offset });
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault(); const cursor = eventToView(event); const model = eventToModel(event);
    const zoom = Math.min(20, Math.max(0.1, view.zoom * Math.exp(-event.deltaY * 0.0015)));
    props.onViewChange({ zoom, pan: { x: cursor.x - model.x * MODEL_TO_VIEW * zoom, y: cursor.y + model.y * MODEL_TO_VIEW * zoom } });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (activeTool === "polyline" && draw.points.length > 1) finishPolyline();
    else if (isDrawTool(activeTool)) setDraw({ points: [], current: null });
  };

  const dragDelta = drag?.kind === "entity" ? sub(drag.last, drag.start) : null;
  const displayedEntities = entities.map(entity => dragDelta && drag && (selectedIds.includes(entity.id) || drag.id === entity.id) ? translateEntity(entity, dragDelta) : entity);
  const previewPolyline = activeTool === "polyline" && draw.points.length ? [...draw.points, ...(draw.current ? [draw.current] : [])] : [];
  const axisLabels = activePlane.kind === "xy" ? ["X", "Y"] : activePlane.kind === "yz" ? ["Y", "Z"] : ["Z", "X"];
  const gridStep = document.display.gridSize * MODEL_TO_VIEW * view.zoom;

  return <section className="sketch-graphics">
    <header>Graphics <span>{activePlane.name} sketch plane</span></header>
    <svg ref={svgRef} className={`sketch-svg tool-${activeTool}`} viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`} preserveAspectRatio="none"
      onPointerDown={handleCanvasPointerDown} onPointerMove={handlePointerMove} onPointerUp={endPointer} onPointerCancel={endPointer} onWheel={handleWheel} onContextMenu={handleContextMenu}>
      <defs>
        <pattern id="sketch-grid" width={Math.max(gridStep, 2)} height={Math.max(gridStep, 2)} patternUnits="userSpaceOnUse" x={view.pan.x % Math.max(gridStep, 2)} y={view.pan.y % Math.max(gridStep, 2)}><circle cx="0" cy="0" r="0.7" fill="#5375a5" opacity=".5"/></pattern>
        <marker id="dim-arrow" markerWidth="7" markerHeight="7" refX="4" refY="3.5" orient="auto-start-reverse"><path d="M 7 0 L 0 3.5 L 7 7" fill="none" stroke="#4d6230" strokeWidth="1"/></marker>
      </defs>
      {document.display.grid && <rect x={VIEW_BOX.x} y={VIEW_BOX.y} width={VIEW_BOX.width} height={VIEW_BOX.height} fill="url(#sketch-grid)"/>}
      <g className="sketch-main-axes"><line x1={VIEW_BOX.x} y1={view.pan.y} x2={VIEW_BOX.x + VIEW_BOX.width} y2={view.pan.y}/><line x1={view.pan.x} y1={VIEW_BOX.y} x2={view.pan.x} y2={VIEW_BOX.y + VIEW_BOX.height}/><circle cx={view.pan.x} cy={view.pan.y} r="3"/><path className="axis-positive-x" d={`M ${view.pan.x} ${view.pan.y} h 58 l -10 -5 m 10 5 l -10 5`}/><path className="axis-positive-y" d={`M ${view.pan.x} ${view.pan.y} v -58 l -5 10 m 5 -10 l 5 10`}/></g>
      {displayedEntities.filter(entity => entity.visible).map(entity => <EntitySvg key={entity.id} entity={entity} toView={modelToView} selected={selectionKind === "entity" && selectedIds.includes(entity.id)} preview={false} onPointerDown={handleEntityPointerDown}/>)}
      {preview && <EntitySvg entity={preview} toView={modelToView} selected={false} preview onPointerDown={() => undefined}/>} 
      {previewPolyline.length > 1 && <polyline className="sketch-preview" points={previewPolyline.map(modelToView).map(p => `${p.x},${p.y}`).join(" ")}/>} 
      {draw.points.map((point, index) => { const p = modelToView(point); return <circle className="construction-point" key={index} cx={p.x} cy={p.y} r="3"/>; })}
      {dimensions.filter(dimension => dimension.visible).map(dimension => <DimensionSvg key={dimension.id} dimension={dimension} document={document} entities={displayedEntities} toView={modelToView} selected={selectionKind === "dimension" && selectedIds.includes(dimension.id)} dragOffset={drag?.kind === "dimension" && drag.id === dimension.id && drag.originalOffset ? add(drag.originalOffset, sub(drag.last, drag.start)) : undefined} onPointerDown={handleDimensionPointerDown}/>)}
      {snapMarker && (() => { const p = modelToView(snapMarker.point); return <g className="snap-marker"><rect x={p.x - 4} y={p.y - 4} width="8" height="8"/><text x={p.x + 8} y={p.y - 8}>{snapMarker.label}</text></g>; })()}
    </svg>
    <div className="viewport-brand">Simwhere<small>Geometry</small></div>
    <div className="viewport-scale"><span>0</span><span>{document.units.length}</span><div><i/><i/><i/><i/></div></div>
    <div className="viewport-triad"><i className="triad-y"/><i className="triad-x"/><b>{axisLabels[1]}</b><em>{axisLabels[0]}</em><span>●</span></div>
    <footer><button className="active">Model View</button><button>Print Preview</button></footer>
  </section>;
}

function EntitySvg({ entity, toView, selected, preview, onPointerDown }: { entity: SketchEntity; toView: (p: Point2) => Point2; selected: boolean; preview: boolean; onPointerDown: (event: React.PointerEvent, entity: SketchEntity, subIndex?: number) => void }) {
  const cls = `sketch-entity ${selected ? "selected" : ""} ${preview ? "sketch-preview" : ""} ${!entity.valid ? "invalid" : ""}`;
  const line = (a: Point2, b: Point2, key?: number) => { const p1 = toView(a), p2 = toView(b); return <g key={key} onPointerDown={event => onPointerDown(event, entity, key)}><line className={cls} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}/><line className="entity-hit" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}/></g>; };
  if (entity.type === "line") return line(entity.start, entity.end);
  if (entity.type === "polyline") return <>{entity.points.slice(1).map((point, index) => line(entity.points[index], point, index))}{entity.closed && line(entity.points[entity.points.length - 1], entity.points[0], entity.points.length - 1)}</>;
  if (entity.type === "rectangle") { const points = rectanglePoints(entity); return <>{points.map((point, index) => line(point, points[(index + 1) % 4], index))}</>; }
  if (entity.type === "polygon") { const points = polygonPoints(entity.center, entity.radius, entity.sides, entity.rotation); return <>{points.map((point, index) => line(point, points[(index + 1) % points.length], index))}</>; }
  if (entity.type === "circle") { const center = toView(entity.center), radius = entity.radius * MODEL_TO_VIEW * toViewScale(toView); return <g onPointerDown={event => onPointerDown(event, entity)}><circle className={cls} cx={center.x} cy={center.y} r={radius}/><circle className="entity-hit" cx={center.x} cy={center.y} r={radius}/></g>; }
  if (entity.type === "ellipse") { const center = toView(entity.center), scale = toViewScale(toView); return <g transform={`rotate(${-entity.rotation * 180 / Math.PI} ${center.x} ${center.y})`} onPointerDown={event => onPointerDown(event, entity)}><ellipse className={cls} cx={center.x} cy={center.y} rx={entity.radiusX * MODEL_TO_VIEW * scale} ry={entity.radiusY * MODEL_TO_VIEW * scale}/><ellipse className="entity-hit" cx={center.x} cy={center.y} rx={entity.radiusX * MODEL_TO_VIEW * scale} ry={entity.radiusY * MODEL_TO_VIEW * scale}/></g>; }
  const start = toView(arcPoint(entity, entity.startAngle)), end = toView(arcPoint(entity, entity.startAngle + entity.sweepAngle)), radius = entity.radius * MODEL_TO_VIEW * toViewScale(toView), large = Math.abs(entity.sweepAngle) > Math.PI ? 1 : 0, sweep = entity.sweepAngle > 0 ? 0 : 1;
  const d = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x} ${end.y}`;
  return <g onPointerDown={event => onPointerDown(event, entity)}><path className={cls} d={d}/><path className="entity-hit" d={d}/></g>;
}

function toViewScale(toView: (p: Point2) => Point2) { return Math.abs(toView({ x: 1 / MODEL_TO_VIEW, y: 0 }).x - toView({ x: 0, y: 0 }).x); }

function DimensionSvg({ dimension, document, entities, toView, selected, dragOffset, onPointerDown }: { dimension: SketchDimension; document: SketchDocument; entities: SketchEntity[]; toView: (p: Point2) => Point2; selected: boolean; dragOffset?: Point2; onPointerDown: (event: React.PointerEvent, dimension: SketchDimension) => void }) {
  const entity = entities.find(item => item.id === dimension.entityIds[0]); if (!entity) return null;
  const origin = entityCenter(entity), offset = dragOffset ?? dimension.offset, label = add(origin, offset), a = toView(origin), b = toView(label);
  return <g className={`sketch-dimension ${selected ? "selected" : ""}`} onPointerDown={event => onPointerDown(event, dimension)}>
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} markerEnd="url(#dim-arrow)"/><circle cx={b.x} cy={b.y} r="3"/><rect x={b.x - 38} y={b.y - 19} width="76" height="16" rx="2"/><text x={b.x} y={b.y - 7}>{formatDimension(dimension, document)}</text>
  </g>;
}
