import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODEL_TO_VIEW, add, arcPoint, distance, entityCenter, entityPoints, formatDimension,
  lineIntersection, mul, normalize, polygonPoints, rectanglePoints, sub, translateEntity, uid,
  project3DToScreen, projectPlaneToScreen, unprojectScreenToPlane,
} from "../geometry/sketchMath";
import type {
  DatumPlane, DimensionKind, EditorTool, LineEntity, Point2, SketchDimension, SketchDocument, SketchEntity, ViewState,
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
  onAddEntities?: (entities: SketchEntity[]) => void;
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
  const [isDraggingDraw, setIsDraggingDraw] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [panDrag, setPanDrag] = useState<{ client: Point2; pan: Point2 } | null>(null);
  const [orbitDrag, setOrbitDrag] = useState<{ client: Point2; azimuth: number; elevation: number } | null>(null);
  const [snapMarker, setSnapMarker] = useState<{ point: Point2; label: string } | null>(null);

  const modelToView = (point: Point2): Point2 => projectPlaneToScreen(point, activePlane.kind, view);
  const eventToView = (event: React.PointerEvent | React.WheelEvent): Point2 => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: VIEW_BOX.x + (event.clientX - rect.left) / rect.width * VIEW_BOX.width, y: VIEW_BOX.y + (event.clientY - rect.top) / rect.height * VIEW_BOX.height };
  };
  const eventToModel = (event: React.PointerEvent | React.WheelEvent): Point2 => {
    const viewPt = eventToView(event);
    return unprojectScreenToPlane(viewPt, activePlane.kind, view);
  };

  useEffect(() => { setDraw({ points: [], current: null }); setIsDraggingDraw(false); setSnapMarker(null); }, [activeTool]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDraw({ points: [], current: null }); setIsDraggingDraw(false); setSnapMarker(null); props.onToolCancel(); }
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
    if (draw.points.length > 1) {
      const lines: LineEntity[] = [];
      for (let i = 0; i < draw.points.length - 1; i++) {
        lines.push({ ...makeBase("line"), type: "line", start: draw.points[i], end: draw.points[i + 1] });
      }
      if (props.onAddEntities) props.onAddEntities(lines);
      else lines.forEach(props.onAddEntity);
    }
    setDraw({ points: [], current: null });
    setIsDraggingDraw(false);
  };

  const preview = useMemo(() => {
    if (!isDrawTool(activeTool) || !draw.current || !draw.points.length || activeTool === "polyline") return null;
    const p1 = draw.points[0];
    const p2 = draw.current;
    if (activeTool === "line") return { ...makeBase("line"), type: "line", start: p1, end: p2 } as SketchEntity;
    if (activeTool === "rectangle") return { ...makeBase("rectangle"), type: "rectangle", origin: p1, u: { x: p2.x - p1.x, y: 0 }, v: { x: 0, y: p2.y - p1.y } } as SketchEntity;
    if (activeTool === "circle") return { ...makeBase("circle"), type: "circle", center: p1, radius: distance(p1, p2) } as SketchEntity;
    if (activeTool === "polygon") return { ...makeBase("polygon"), type: "polygon", center: p1, radius: distance(p1, p2), sides: document.display.polygonSides, rotation: Math.atan2(p2.y - p1.y, p2.x - p1.x) } as SketchEntity;
    if (activeTool === "ellipse") return { ...makeBase("ellipse"), type: "ellipse", center: p1, radiusX: Math.abs(p2.x - p1.x), radiusY: Math.abs(p2.y - p1.y), rotation: 0 } as SketchEntity;
    return null;
  }, [activeTool, draw, document.display.polygonSides]);

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    // 3. Middle + Left click simultaneous drag -> Orbit / change angle view
    if ((event.buttons & 4) !== 0 && (event.buttons & 1) !== 0) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      setOrbitDrag({ client: { x: event.clientX, y: event.clientY }, azimuth: view.azimuth ?? 45, elevation: view.elevation ?? 35.264 });
      setPanDrag(null);
      setIsDraggingDraw(false);
      setDraw({ points: [], current: null });
      return;
    }

    // 2. Center middle button press or scroll wheel press alone -> Pan
    if (event.button === 1 || activeTool === "pan" || ((event.buttons & 4) !== 0 && (event.buttons & 1) === 0)) {
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
      setPanDrag({ client: { x: event.clientX, y: event.clientY }, pan: view.pan });
      return;
    }

    // Left click handling
    if (event.button !== 0) return;
    if (!isDrawTool(activeTool)) { props.onClearSelection(); return; }

    const point = applySnap(eventToModel(event));
    if (activeTool === "polyline") {
      setDraw(current => ({ points: [...current.points, point], current: point }));
      props.onStatus("Polyline: click next point, Enter or right-click to finish");
      return;
    }

    // 1. Click and drag for line, rectangle, circle, etc.
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch {}
    setDraw({ points: [point], current: point });
    setIsDraggingDraw(true);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    // Check if middle + left are held down simultaneously
    if ((event.buttons & 4) !== 0 && (event.buttons & 1) !== 0) {
      if (!orbitDrag) {
        setOrbitDrag({ client: { x: event.clientX, y: event.clientY }, azimuth: view.azimuth ?? 45, elevation: view.elevation ?? 35.264 });
        setPanDrag(null);
        setIsDraggingDraw(false);
        setDraw({ points: [], current: null });
        return;
      }
      const dx = event.clientX - orbitDrag.client.x;
      const dy = event.clientY - orbitDrag.client.y;
      const newAzimuth = orbitDrag.azimuth - dx * 0.5;
      const newElevation = Math.max(-89.9, Math.min(89.9, orbitDrag.elevation + dy * 0.5));
      props.onViewChange({ ...view, azimuth: newAzimuth, elevation: newElevation });
      return;
    }

    if (orbitDrag) {
      setOrbitDrag(null);
    }

    if (panDrag) {
      const rect = svgRef.current!.getBoundingClientRect();
      const dx = (event.clientX - panDrag.client.x) / rect.width * VIEW_BOX.width;
      const dy = (event.clientY - panDrag.client.y) / rect.height * VIEW_BOX.height;
      props.onViewChange({ ...view, pan: { x: panDrag.pan.x + dx, y: panDrag.pan.y + dy } });
      return;
    }

    const raw = eventToModel(event);
    if (drag) { setDrag({ ...drag, last: raw }); return; }

    if (isDraggingDraw) {
      setDraw(current => ({ ...current, current: applySnap(raw) }));
      return;
    }

    if (isDrawTool(activeTool)) {
      setDraw(current => ({ ...current, current: applySnap(raw) }));
    }
  };

  const endPointer = (event: React.PointerEvent<SVGSVGElement>) => {
    if (orbitDrag) {
      setOrbitDrag(null);
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    if (panDrag) {
      setPanDrag(null);
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
    }
    if (drag) {
      const delta = sub(drag.last, drag.start);
      if (drag.kind === "entity" && distance(drag.start, drag.last) > 1e-10) props.onMoveEntities(selectedIds.includes(drag.id) ? selectedIds : [drag.id], delta);
      if (drag.kind === "dimension" && drag.originalOffset) props.onMoveDimension(drag.id, add(drag.originalOffset, delta));
      setDrag(null);
    }

    // 1. Commit click-and-drag shape on release
    if (isDraggingDraw && draw.points.length > 0) {
      setIsDraggingDraw(false);
      try { event.currentTarget.releasePointerCapture(event.pointerId); } catch {}
      const p1 = draw.points[0];
      const p2 = applySnap(eventToModel(event));
      const v1 = modelToView(p1);
      const v2 = modelToView(p2);
      const distPx = Math.hypot(v2.x - v1.x, v2.y - v1.y);

      if (distPx > 4) {
        if (activeTool === "line") {
          props.onAddEntity({ ...makeBase("line"), type: "line", start: p1, end: p2 });
        } else if (activeTool === "rectangle") {
          // Break rectangle into 4 independent line entities so any side can be selected/deleted
          const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
          const y1 = Math.min(p1.y, p2.y), y2 = Math.max(p1.y, p2.y);
          const lBottom: LineEntity = { ...makeBase("line"), type: "line", start: { x: x1, y: y1 }, end: { x: x2, y: y1 } };
          const lRight: LineEntity = { ...makeBase("line"), type: "line", start: { x: x2, y: y1 }, end: { x: x2, y: y2 } };
          const lTop: LineEntity = { ...makeBase("line"), type: "line", start: { x: x2, y: y2 }, end: { x: x1, y: y2 } };
          const lLeft: LineEntity = { ...makeBase("line"), type: "line", start: { x: x1, y: y2 }, end: { x: x1, y: y1 } };
          if (props.onAddEntities) props.onAddEntities([lBottom, lRight, lTop, lLeft]);
          else { props.onAddEntity(lBottom); props.onAddEntity(lRight); props.onAddEntity(lTop); props.onAddEntity(lLeft); }
        } else if (activeTool === "circle") {
          props.onAddEntity({ ...makeBase("circle"), type: "circle", center: p1, radius: distance(p1, p2) });
        } else if (activeTool === "ellipse") {
          props.onAddEntity({ ...makeBase("ellipse"), type: "ellipse", center: p1, radiusX: Math.abs(p2.x - p1.x), radiusY: Math.abs(p2.y - p1.y), rotation: 0 });
        } else if (activeTool === "polygon") {
          props.onAddEntity({ ...makeBase("polygon"), type: "polygon", center: p1, radius: distance(p1, p2), sides: document.display.polygonSides, rotation: Math.atan2(p2.y - p1.y, p2.x - p1.x) });
        }
      }
      setDraw({ points: [], current: null });
    }
  };

  const handleEntityPointerDown = (event: React.PointerEvent, entity: SketchEntity, subIndex?: number) => {
    if ((event.buttons & 4) !== 0 || event.button === 1) return;
    event.stopPropagation();
    if (event.button !== 0) return;
    const kind = dimensionToolKind(activeTool);
    if (kind) { props.onAddDimension(kind, entity.id); return; }
    if (activeTool !== "select" && activeTool !== "move") return;
    props.onSelectEntity(entity.id, event.ctrlKey || event.metaKey || event.shiftKey, subIndex);
    const start = eventToModel(event as React.PointerEvent<SVGSVGElement>);
    setDrag({ kind: "entity", id: entity.id, start, last: start });
  };

  const handleDimensionPointerDown = (event: React.PointerEvent, dimension: SketchDimension) => {
    if ((event.buttons & 4) !== 0 || event.button === 1) return;
    event.stopPropagation();
    props.onSelectDimension(dimension.id);
    if (activeTool === "dimMove" || activeTool === "select") {
      const start = eventToModel(event as React.PointerEvent<SVGSVGElement>);
      setDrag({ kind: "dimension", id: dimension.id, start, last: start, originalOffset: dimension.offset });
    }
  };

  const handleWheel = (event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const cursor = eventToView(event);
    const model = eventToModel(event);
    const zoom = Math.min(20, Math.max(0.1, view.zoom * Math.exp(-event.deltaY * 0.0015)));
    props.onViewChange({ zoom, pan: { x: cursor.x - model.x * MODEL_TO_VIEW * zoom, y: cursor.y + model.y * MODEL_TO_VIEW * zoom } });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (activeTool === "polyline" && draw.points.length > 1) finishPolyline();
    else if (isDrawTool(activeTool)) {
      setDraw({ points: [], current: null });
      setIsDraggingDraw(false);
    }
  };

  const dragDelta = drag?.kind === "entity" ? sub(drag.last, drag.start) : null;
  const displayedEntities = entities.map(entity => dragDelta && drag && (selectedIds.includes(entity.id) || drag.id === entity.id) ? translateEntity(entity, dragDelta) : entity);
  const previewPolyline = activeTool === "polyline" && draw.points.length ? [...draw.points, ...(draw.current ? [draw.current] : [])] : [];
  const gridStep = document.display.gridSize * MODEL_TO_VIEW * view.zoom;

  // 3D axes calculation for Screenshot 1
  const originPt: Point2 = project3DToScreen(0, 0, 0, view);
  const xPt: Point2 = project3DToScreen(0.08, 0, 0, view);
  const yPt: Point2 = project3DToScreen(0, 0.08, 0, view);
  const zPt: Point2 = project3DToScreen(0, 0, 0.08, view);

  // Projected axis vectors
  const lenX = Math.hypot(xPt.x - originPt.x, xPt.y - originPt.y);
  const lenY = Math.hypot(yPt.x - originPt.x, yPt.y - originPt.y);
  const lenZ = Math.hypot(zPt.x - originPt.x, zPt.y - originPt.y);

  // An axis is visible in plane/3d if it is not pointing straight into the screen
  const showX = lenX > 0.8;
  const showY = lenY > 0.8;
  const showZ = lenZ > 0.8;

  const dirX = showX ? normalize(sub(xPt, originPt)) : { x: 0, y: 0 };
  const dirY = showY ? normalize(sub(yPt, originPt)) : { x: 0, y: 0 };
  const dirZ = showZ ? normalize(sub(zPt, originPt)) : { x: 0, y: 0 };

  const coneDist = 76;
  const tipX = add(originPt, mul(dirX, coneDist));
  const tipY = add(originPt, mul(dirY, coneDist));
  const tipZ = add(originPt, mul(dirZ, coneDist));

  return (
    <section className="sketch-graphics">
      <header>Graphics <span>{activePlane.name}</span></header>
      <svg
        ref={svgRef}
        className={`sketch-svg tool-${activeTool}`}
        viewBox={`${VIEW_BOX.x} ${VIEW_BOX.y} ${VIEW_BOX.width} ${VIEW_BOX.height}`}
        preserveAspectRatio="none"
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        <defs>
          <pattern id="sketch-grid" width={Math.max(gridStep, 2)} height={Math.max(gridStep, 2)} patternUnits="userSpaceOnUse" x={view.pan.x % Math.max(gridStep, 2)} y={view.pan.y % Math.max(gridStep, 2)}>
            <circle cx="0" cy="0" r="0.7" fill="#5375a5" opacity=".5" />
          </pattern>
          {/* Specular gradients for 3D triad cones matching Screenshot 1 */}
          <linearGradient id="coneGreen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4ade80" />
            <stop offset="40%" stopColor="#16a34a" />
            <stop offset="100%" stopColor="#14532d" />
          </linearGradient>
          <linearGradient id="coneRed" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="40%" stopColor="#dc2626" />
            <stop offset="100%" stopColor="#7f1d1d" />
          </linearGradient>
          <linearGradient id="coneBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="40%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#1e3a8a" />
          </linearGradient>
        </defs>

        {document.display.grid && <rect x={VIEW_BOX.x} y={VIEW_BOX.y} width={VIEW_BOX.width} height={VIEW_BOX.height} fill="url(#sketch-grid)" />}

        {/* Coordinate Axes Triad */}
        <g className="origin-triad-3d" pointerEvents="none">
          {/* Dotted axis lines extending across the viewport */}
          {showY && <line x1={originPt.x - dirY.x * 650} y1={originPt.y - dirY.y * 650} x2={originPt.x + dirY.x * 650} y2={originPt.y + dirY.y * 650} stroke="#1f252d" strokeWidth="1" strokeDasharray="2 3" opacity="0.9" />}
          {showX && <line x1={originPt.x - dirX.x * 650} y1={originPt.y - dirX.y * 650} x2={originPt.x + dirX.x * 650} y2={originPt.y + dirX.y * 650} stroke="#1f252d" strokeWidth="1" strokeDasharray="2 3" opacity="0.9" />}
          {showZ && <line x1={originPt.x - dirZ.x * 650} y1={originPt.y - dirZ.y * 650} x2={originPt.x + dirZ.x * 650} y2={originPt.y + dirZ.y * 650} stroke="#1f252d" strokeWidth="1" strokeDasharray="2 3" opacity="0.9" />}

          {/* 3D Cones for visible axes */}
          {showY && <AxisCone tip={tipY} dir={dirY} gradientId="coneGreen" />}
          {showX && <AxisCone tip={tipX} dir={dirX} gradientId="coneRed" />}
          {showZ && <AxisCone tip={tipZ} dir={dirZ} gradientId="coneBlue" />}

          {/* Center black origin circle */}
          <circle cx={originPt.x} cy={originPt.y} r="3.5" fill="#151b22" />
        </g>

        {/* Drawn entities */}
        {displayedEntities.filter(entity => entity.visible).map(entity => (
          <EntitySvg
            key={entity.id}
            entity={entity}
            toView={modelToView}
            selected={selectionKind === "entity" && selectedIds.includes(entity.id)}
            preview={false}
            onPointerDown={handleEntityPointerDown}
          />
        ))}

        {/* Drawing preview */}
        {preview && <EntitySvg entity={preview} toView={modelToView} selected={false} preview onPointerDown={() => undefined} />}
        {previewPolyline.length > 1 && <polyline className="sketch-preview" points={previewPolyline.map(modelToView).map(p => `${p.x},${p.y}`).join(" ")} />}
        {draw.points.map((point, index) => {
          const p = modelToView(point);
          return <circle className="construction-point" key={index} cx={p.x} cy={p.y} r="3" />;
        })}

        {/* Dimensions matching Screenshot 2 & 3 */}
        {dimensions.filter(dimension => dimension.visible).map(dimension => (
          <DimensionSvg
            key={dimension.id}
            dimension={dimension}
            document={document}
            entities={displayedEntities}
            toView={modelToView}
            selected={selectionKind === "dimension" && selectedIds.includes(dimension.id)}
            dragOffset={drag?.kind === "dimension" && drag.id === dimension.id && drag.originalOffset ? add(drag.originalOffset, sub(drag.last, drag.start)) : undefined}
            onPointerDown={handleDimensionPointerDown}
          />
        ))}

        {snapMarker && (() => {
          const p = modelToView(snapMarker.point);
          return <g className="snap-marker"><rect x={p.x - 4} y={p.y - 4} width="8" height="8" /><text x={p.x + 8} y={p.y - 8}>{snapMarker.label}</text></g>;
        })()}
      </svg>
      <div className="viewport-brand">Simwhere<small>Geometry</small></div>
      <div className="viewport-scale"><span>0</span><span>{document.units.length}</span><div><i /><i /><i /><i /></div></div>
      <footer><button className="active">Model View</button><button>Print Preview</button></footer>
    </section>
  );
}

function AxisCone({ tip, dir, gradientId }: { tip: Point2; dir: Point2; gradientId: string }) {
  const len = 22;
  const radius = 5;
  const norm = { x: -dir.y, y: dir.x };
  const base = { x: tip.x - dir.x * len, y: tip.y - dir.y * len };
  const pLeft = { x: base.x - norm.x * radius, y: base.y - norm.y * radius };
  const pRight = { x: base.x + norm.x * radius, y: base.y + norm.y * radius };
  const angleDeg = Math.atan2(dir.y, dir.x) * 180 / Math.PI;

  return (
    <g>
      <path d={`M ${tip.x} ${tip.y} L ${pRight.x} ${pRight.y} L ${pLeft.x} ${pLeft.y} Z`} fill={`url(#${gradientId})`} stroke={`url(#${gradientId})`} strokeWidth="0.5" />
      <ellipse cx={base.x} cy={base.y} rx={radius} ry={radius * 0.35} transform={`rotate(${angleDeg + 90} ${base.x} ${base.y})`} fill={`url(#${gradientId})`} />
    </g>
  );
}

function EntitySvg({
  entity,
  toView,
  selected,
  preview,
  onPointerDown,
}: {
  entity: SketchEntity;
  toView: (p: Point2) => Point2;
  selected: boolean;
  preview: boolean;
  onPointerDown: (event: React.PointerEvent, entity: SketchEntity, subIndex?: number) => void;
}) {
  const cls = `sketch-entity ${selected ? "selected" : ""} ${preview ? "sketch-preview" : ""} ${!entity.valid ? "invalid" : ""}`;

  // Cyan vertex square handle matching Screenshot 2 & 3
  const vertexHandle = (pt: Point2, key: string) => {
    const p = toView(pt);
    return <rect key={key} x={p.x - 3} y={p.y - 3} width="6" height="6" fill="#00e5ff" stroke="#004488" strokeWidth="1" pointerEvents="none" />;
  };

  const line = (a: Point2, b: Point2, key?: number) => {
    const p1 = toView(a), p2 = toView(b);
    return (
      <g key={key} onPointerDown={event => onPointerDown(event, entity, key)}>
        <line className={cls} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
        <line className="entity-hit" x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />
        {selected && !preview && (
          <>
            {vertexHandle(a, `v1-${key ?? 0}`)}
            {vertexHandle(b, `v2-${key ?? 0}`)}
          </>
        )}
      </g>
    );
  };

  if (entity.type === "line") return line(entity.start, entity.end);
  if (entity.type === "polyline") {
    return (
      <>
        {entity.points.slice(1).map((point, index) => line(entity.points[index], point, index))}
        {entity.closed && line(entity.points[entity.points.length - 1], entity.points[0], entity.points.length - 1)}
      </>
    );
  }
  if (entity.type === "rectangle") {
    const points = rectanglePoints(entity);
    return <>{points.map((point, index) => line(point, points[(index + 1) % 4], index))}</>;
  }
  if (entity.type === "polygon") {
    const points = polygonPoints(entity.center, entity.radius, entity.sides, entity.rotation);
    return <>{points.map((point, index) => line(point, points[(index + 1) % points.length], index))}</>;
  }
  if (entity.type === "circle") {
    const center = toView(entity.center);
    const radius = entity.radius * MODEL_TO_VIEW * toViewScale(toView);
    return (
      <g onPointerDown={event => onPointerDown(event, entity)}>
        <circle className={cls} cx={center.x} cy={center.y} r={radius} />
        <circle className="entity-hit" cx={center.x} cy={center.y} r={radius} />
        {selected && !preview && vertexHandle(entity.center, "c")}
      </g>
    );
  }
  if (entity.type === "ellipse") {
    const center = toView(entity.center);
    const scale = toViewScale(toView);
    return (
      <g transform={`rotate(${-entity.rotation * 180 / Math.PI} ${center.x} ${center.y})`} onPointerDown={event => onPointerDown(event, entity)}>
        <ellipse className={cls} cx={center.x} cy={center.y} rx={entity.radiusX * MODEL_TO_VIEW * scale} ry={entity.radiusY * MODEL_TO_VIEW * scale} />
        <ellipse className="entity-hit" cx={center.x} cy={center.y} rx={entity.radiusX * MODEL_TO_VIEW * scale} ry={entity.radiusY * MODEL_TO_VIEW * scale} />
        {selected && !preview && vertexHandle(entity.center, "el")}
      </g>
    );
  }
  const start = toView(arcPoint(entity, entity.startAngle));
  const end = toView(arcPoint(entity, entity.startAngle + entity.sweepAngle));
  const radius = entity.radius * MODEL_TO_VIEW * toViewScale(toView);
  const large = Math.abs(entity.sweepAngle) > Math.PI ? 1 : 0;
  const sweep = entity.sweepAngle > 0 ? 0 : 1;
  const d = `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${large} ${sweep} ${end.x} ${end.y}`;
  return (
    <g onPointerDown={event => onPointerDown(event, entity)}>
      <path className={cls} d={d} />
      <path className="entity-hit" d={d} />
      {selected && !preview && (
        <>
          {vertexHandle(arcPoint(entity, entity.startAngle), "as")}
          {vertexHandle(arcPoint(entity, entity.startAngle + entity.sweepAngle), "ae")}
        </>
      )}
    </g>
  );
}

function toViewScale(toView: (p: Point2) => Point2) {
  return Math.abs(toView({ x: 1 / MODEL_TO_VIEW, y: 0 }).x - toView({ x: 0, y: 0 }).x) || 1;
}

function DimensionSvg({
  dimension,
  document,
  entities,
  toView,
  selected,
  dragOffset,
  onPointerDown,
}: {
  dimension: SketchDimension;
  document: SketchDocument;
  entities: SketchEntity[];
  toView: (p: Point2) => Point2;
  selected: boolean;
  dragOffset?: Point2;
  onPointerDown: (event: React.PointerEvent, dimension: SketchDimension) => void;
}) {
  const entity = entities.find(item => item.id === dimension.entityIds[0]);
  if (!entity) return null;

  // Actual dimension of the line in place of V and H
  const valueStr = formatDimension(dimension, document);
  const color = selected ? "#df7712" : "#688e26";

  if (entity.type === "line") {
    const p1 = entity.start;
    const p2 = entity.end;
    const v1 = toView(p1);
    const v2 = toView(p2);

    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const isVertical = dimension.kind === "vertical" || (dimension.kind === "general" && dx < dy * 0.25);
    const isHorizontal = dimension.kind === "horizontal" || (dimension.kind === "general" && dy < dx * 0.25);

    if (isVertical) {
      // Screenshot 2 style vertical dimension
      const yTop = Math.min(v1.y, v2.y);
      const yBot = Math.max(v1.y, v2.y);
      const baseX = (v1.x + v2.x) / 2;
      const scale = toViewScale(toView);
      const offsetPx = (dragOffset?.x ?? dimension.offset.x) * MODEL_TO_VIEW * scale;
      const xDim = baseX + (offsetPx !== 0 ? offsetPx : -40);
      const extDir = xDim < baseX ? -1 : 1;
      const yMid = (yTop + yBot) / 2;

      return (
        <g className={`sketch-dimension ${selected ? "selected" : ""}`} onPointerDown={event => onPointerDown(event, dimension)}>
          {/* Extension lines */}
          <line x1={baseX} y1={yTop} x2={xDim + extDir * 8} y2={yTop} stroke={color} strokeWidth="1.2" />
          <line x1={baseX} y1={yBot} x2={xDim + extDir * 8} y2={yBot} stroke={color} strokeWidth="1.2" />
          {/* Dimension line */}
          <line x1={xDim} y1={yTop} x2={xDim} y2={yBot} stroke={color} strokeWidth="1.2" />
          {/* Top arrow pointing UP */}
          <path d={`M ${xDim - 3.5} ${yTop + 7} L ${xDim} ${yTop} L ${xDim + 3.5} ${yTop + 7}`} fill="none" stroke={color} strokeWidth="1.3" />
          {/* Bottom arrow pointing DOWN */}
          <path d={`M ${xDim - 3.5} ${yBot - 7} L ${xDim} ${yBot} L ${xDim + 3.5} ${yBot - 7}`} fill="none" stroke={color} strokeWidth="1.3" />
          {/* Dimension value text in place of V1 */}
          <text
            x={xDim - 7}
            y={yMid}
            textAnchor="end"
            dominantBaseline="middle"
            fill={color}
            fontSize="10"
            fontWeight="bold"
            fontFamily="Segoe UI, sans-serif"
          >
            {valueStr}
          </text>
        </g>
      );
    }

    if (isHorizontal) {
      // Screenshot 3 style horizontal dimension
      const xLeft = Math.min(v1.x, v2.x);
      const xRight = Math.max(v1.x, v2.x);
      const baseY = (v1.y + v2.y) / 2;
      const scale = toViewScale(toView);
      const offsetPx = (dragOffset?.y ?? dimension.offset.y) * MODEL_TO_VIEW * scale;
      const yDim = baseY - Math.abs(offsetPx !== 0 ? offsetPx : 35);
      const xMid = (xLeft + xRight) / 2;

      return (
        <g className={`sketch-dimension ${selected ? "selected" : ""}`} onPointerDown={event => onPointerDown(event, dimension)}>
          {/* Extension lines */}
          <line x1={xLeft} y1={baseY} x2={xLeft} y2={yDim - 8} stroke={color} strokeWidth="1.2" />
          <line x1={xRight} y1={baseY} x2={xRight} y2={yDim - 8} stroke={color} strokeWidth="1.2" />
          {/* Dimension line */}
          <line x1={xLeft} y1={yDim} x2={xRight} y2={yDim} stroke={color} strokeWidth="1.2" />
          {/* Left arrow pointing LEFT */}
          <path d={`M ${xLeft + 7} ${yDim - 3.5} L ${xLeft} ${yDim} L ${xLeft + 7} ${yDim + 3.5}`} fill="none" stroke={color} strokeWidth="1.3" />
          {/* Right arrow pointing RIGHT */}
          <path d={`M ${xRight - 7} ${yDim - 3.5} L ${xRight} ${yDim} L ${xRight - 7} ${yDim + 3.5}`} fill="none" stroke={color} strokeWidth="1.3" />
          {/* Background cutout and dimension value text in place of H2 */}
          <rect x={xMid - 28} y={yDim - 8} width="56" height="16" fill="#dde6f5" opacity="0.9" rx="2" />
          <text
            x={xMid}
            y={yDim}
            textAnchor="middle"
            dominantBaseline="central"
            fill={color}
            fontSize="10"
            fontWeight="bold"
            fontFamily="Segoe UI, sans-serif"
          >
            {valueStr}
          </text>
        </g>
      );
    }

    // Diagonal length dimension
    const lineVec = sub(v2, v1);
    const lineLen = Math.hypot(lineVec.x, lineVec.y);
    if (lineLen < 1) return null;
    const u = { x: lineVec.x / lineLen, y: lineVec.y / lineLen };
    const n = { x: -u.y, y: u.x };
    const offsetDist = 35;
    const dimV1 = { x: v1.x + n.x * offsetDist, y: v1.y + n.y * offsetDist };
    const dimV2 = { x: v2.x + n.x * offsetDist, y: v2.y + n.y * offsetDist };
    const midX = (dimV1.x + dimV2.x) / 2;
    const midY = (dimV1.y + dimV2.y) / 2;

    return (
      <g className={`sketch-dimension ${selected ? "selected" : ""}`} onPointerDown={event => onPointerDown(event, dimension)}>
        <line x1={v1.x} y1={v1.y} x2={dimV1.x + n.x * 6} y2={dimV1.y + n.y * 6} stroke={color} strokeWidth="1.2" />
        <line x1={v2.x} y1={v2.y} x2={dimV2.x + n.x * 6} y2={dimV2.y + n.y * 6} stroke={color} strokeWidth="1.2" />
        <line x1={dimV1.x} y1={dimV1.y} x2={dimV2.x} y2={dimV2.y} stroke={color} strokeWidth="1.2" />
        <rect x={midX - 28} y={midY - 8} width="56" height="16" fill="#dde6f5" opacity="0.9" rx="2" />
        <text x={midX} y={midY} textAnchor="middle" dominantBaseline="central" fill={color} fontSize="10" fontWeight="bold" fontFamily="Segoe UI, sans-serif">
          {valueStr}
        </text>
      </g>
    );
  }

  // Fallback for circle, arc, etc.
  const origin = entityCenter(entity);
  const offset = dragOffset ?? dimension.offset;
  const label = add(origin, offset);
  const a = toView(origin);
  const b = toView(label);
  return (
    <g className={`sketch-dimension ${selected ? "selected" : ""}`} onPointerDown={event => onPointerDown(event, dimension)}>
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth="1.2" />
      <circle cx={b.x} cy={b.y} r="2.5" fill={color} />
      <rect x={b.x - 30} y={b.y - 14} width="60" height="15" rx="2" fill="#dde6f5" stroke={color} strokeWidth="0.8" />
      <text x={b.x} y={b.y - 4} textAnchor="middle" fill={color} fontSize="9" fontWeight="bold">
        {valueStr}
      </text>
    </g>
  );
}
