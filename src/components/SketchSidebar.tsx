import { useEffect, useState } from "react";
import { dimensionValue, distance, fromDisplayLength, rectanglePoints, toDisplayAngle, toDisplayLength } from "../geometry/sketchMath";
import type { CadSelection, DatumPlane, DimensionKind, EditorTool, SidebarMode, SketchDimension, SketchDocument, SketchEntity } from "../types/sketch";

interface SketchSidebarProps {
  document: SketchDocument;
  mode: SidebarMode;
  activeTool: EditorTool;
  selection: CadSelection;
  onModeChange: (mode: SidebarMode) => void;
  onToolChange: (tool: EditorTool) => void;
  onSelect: (selection: CadSelection) => void;
  onLookAtPlane: (id: string) => void;
  onRenamePlane: (id: string, name: string) => void;
  onNewSketch: () => void;
  onGenerate: () => void;
  onToggleVisibility: (kind: "plane" | "sketch" | "entity" | "dimension", id: string) => void;
  onRename: (kind: CadSelection["kind"], id: string, name: string) => void;
  onUpdateEntity: (id: string, updater: (entity: SketchEntity) => SketchEntity) => void;
  onUpdateDimensionValue: (id: string, value: number) => void;
  onModify: (action: "copy" | "delete" | "trim" | "extend" | "offset" | "mirror" | "rotate" | "scale") => void;
  onDisplayChange: (changes: Partial<SketchDocument["display"]>) => void;
  onUnitSettingsChange: (changes: Partial<SketchDocument["units"]>) => void;
}

const DRAW_TOOLS: { label: string; tool?: EditorTool; disabled?: boolean; hint?: string }[] = [
  { label: "Line", tool: "line" }, { label: "Tangent Line", disabled: true, hint: "Requires tangent solver" },
  { label: "Line by 2 Tangents", disabled: true, hint: "Requires tangent solver" }, { label: "Polyline", tool: "polyline" },
  { label: "Polygon", tool: "polygon" }, { label: "Rectangle", tool: "rectangle" }, { label: "Rectangle by 3 Points", tool: "rectangle3" },
  { label: "Oval", tool: "ellipse" }, { label: "Circle", tool: "circle" }, { label: "Circle by 3 Tangents", disabled: true, hint: "Requires tangent solver" },
  { label: "Arc by Tangent", disabled: true, hint: "Requires tangent solver" }, { label: "Arc by 3 Points", tool: "arc3" },
  { label: "Arc by Center", tool: "arcCenter" }, { label: "Ellipse", tool: "ellipse" },
];
const DIMENSIONS: { label: string; tool: EditorTool; kind: DimensionKind }[] = [
  { label: "General", tool: "dimGeneral", kind: "general" }, { label: "Horizontal", tool: "dimHorizontal", kind: "horizontal" },
  { label: "Vertical", tool: "dimVertical", kind: "vertical" }, { label: "Length/Distance", tool: "dimLength", kind: "length" },
  { label: "Radius", tool: "dimRadius", kind: "radius" }, { label: "Diameter", tool: "dimDiameter", kind: "diameter" },
  { label: "Angle", tool: "dimAngle", kind: "angle" }, { label: "Move", tool: "dimMove", kind: "general" },
];

export function SketchSidebar(props: SketchSidebarProps) {
  const selected = getSelected(props.document, props.selection);
  return <aside className="cad-sidebar">
    <div className="sidebar-main">
      <header>{props.mode === "modeling" ? "Tree Outline" : "Sketching Toolboxes"}<span>▾</span></header>
      {props.mode === "modeling" ? <ModelTree {...props}/> : <SketchToolbox {...props}/>} 
    </div>
    <div className="sidebar-tabs"><button className={props.mode === "sketching" ? "active" : ""} onClick={() => props.onModeChange("sketching")}>Sketching</button><button className={props.mode === "modeling" ? "active" : ""} onClick={() => props.onModeChange("modeling")}>Modeling</button></div>
    <DetailsPanel {...props} selected={selected}/>
  </aside>;
}

function ModelTree(props: SketchSidebarProps) {
  const [context, setContext] = useState<{ plane: DatumPlane; x: number; y: number } | null>(null);
  useEffect(() => { const close = () => setContext(null); window.addEventListener("pointerdown", close); return () => window.removeEventListener("pointerdown", close); }, []);
  const select = (kind: CadSelection["kind"], id: string) => props.onSelect({ kind, ids: [id] });
  return <div className="model-tree">
    <button className="tree-root" onClick={() => props.onSelect({ kind: "plane", ids: [props.document.activePlaneId] })}><span className="tree-twist">▾</span><span className="tree-geometry-icon">A</span><b>Geometry</b></button>
    {props.document.planes.map(plane => <button key={plane.id} className={`tree-row ${props.selection.kind === "plane" && props.selection.ids.includes(plane.id) ? "selected" : ""}`} onClick={() => select("plane", plane.id)} onDoubleClick={() => props.onLookAtPlane(plane.id)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setContext({ plane, x: event.clientX, y: event.clientY }); }}>
      <span className="tree-eye" onClick={event => { event.stopPropagation(); props.onToggleVisibility("plane", plane.id); }}>{plane.visible ? "◉" : "○"}</span><span className={`plane-icon ${plane.kind}`}>▱</span><span>{plane.name}</span><i>✓</i>
    </button>)}
    {props.document.sketches.map(sketch => <div key={sketch.id}>
      <button className={`tree-row sketch-row ${props.selection.kind === "sketch" && props.selection.ids.includes(sketch.id) ? "selected" : ""}`} onClick={() => select("sketch", sketch.id)}><span className="tree-eye" onClick={event => { event.stopPropagation(); props.onToggleVisibility("sketch", sketch.id); }}>{sketch.visible ? "◉" : "○"}</span><span className="sketch-tree-icon">⌁</span><span>{sketch.name}</span><i>{sketch.generated ? "✓" : "*"}</i></button>
      {props.document.entities.filter(entity => entity.sketchId === sketch.id).map(entity => <button key={entity.id} className={`tree-row entity-row ${props.selection.kind === "entity" && props.selection.ids.includes(entity.id) ? "selected" : ""}`} onClick={() => select("entity", entity.id)}><span className="tree-eye" onClick={event => { event.stopPropagation(); props.onToggleVisibility("entity", entity.id); }}>{entity.visible ? "◉" : "○"}</span><span className="entity-tree-icon">{entityGlyph(entity.type)}</span><span>{entity.name}</span><i>{entity.valid ? "✓" : "!"}</i></button>)}
      {props.document.dimensions.filter(dimension => dimension.sketchId === sketch.id).map(dimension => <button key={dimension.id} className={`tree-row entity-row ${props.selection.kind === "dimension" && props.selection.ids.includes(dimension.id) ? "selected" : ""}`} onClick={() => select("dimension", dimension.id)}><span className="tree-eye" onClick={event => { event.stopPropagation(); props.onToggleVisibility("dimension", dimension.id); }}>{dimension.visible ? "◉" : "○"}</span><span>↔</span><span>{dimension.name}</span><i>✓</i></button>)}
    </div>)}
    <button className="tree-summary">◆ {props.document.sketches.length} Sketch{props.document.sketches.length === 1 ? "" : "es"}, {props.document.entities.length} Entities</button>
    {context && <div className="plane-context-menu" style={{ left: context.x, top: context.y }} onPointerDown={event => event.stopPropagation()}><button onClick={() => { props.onLookAtPlane(context.plane.id); setContext(null); }}>Look At</button><button onClick={() => { const name = window.prompt("Plane name", context.plane.name)?.trim(); if (name) props.onRenamePlane(context.plane.id, name); setContext(null); }}>Rename</button></div>}
  </div>;
}

function SketchToolbox(props: SketchSidebarProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Draw: true, Modify: false, Dimensions: false, Constraints: false, Settings: false });
  const section = (name: string, children: React.ReactNode) => <section className="toolbox-section"><button className="toolbox-heading" onClick={() => setOpen(value => ({ ...value, [name]: !value[name] }))}><span>{open[name] ? "▾" : "▸"}</span>{name}</button>{open[name] && <div className="toolbox-body">{children}</div>}</section>;
  return <div className="sketch-toolbox">
    {section("Draw", <div className="tool-list">{DRAW_TOOLS.map(item => <button key={item.label} className={item.tool === props.activeTool ? "active" : ""} disabled={item.disabled} title={item.hint} onClick={() => item.tool && props.onToolChange(item.tool)}><span>{toolGlyph(item.label)}</span>{item.label}{item.disabled && <i>Unavailable</i>}</button>)}</div>)}
    {section("Modify", <div className="tool-grid"><button className={props.activeTool === "move" ? "active" : ""} onClick={() => props.onToolChange("move")}>Move</button>{(["copy", "delete", "trim", "extend", "offset", "mirror", "rotate", "scale"] as const).map(action => <button key={action} onClick={() => props.onModify(action)}>{action[0].toUpperCase() + action.slice(1)}</button>)}</div>)}
    {section("Dimensions", <div className="tool-list">{DIMENSIONS.map(item => <button key={item.label} className={item.tool === props.activeTool ? "active" : ""} onClick={() => props.onToolChange(item.tool)}><span>↔</span>{item.label}</button>)}</div>)}
    {section("Constraints", <p className="toolbox-placeholder">Constraint solving is intentionally deferred. Dimensions are stored as driving geometry edits where supported.</p>)}
    {section("Settings", <div className="settings-grid"><label><input type="checkbox" checked={props.document.display.grid} onChange={event => props.onDisplayChange({ grid: event.target.checked })}/> Show grid</label><label><input type="checkbox" checked={props.document.display.snap} onChange={event => props.onDisplayChange({ snap: event.target.checked })}/> Enable snaps</label><label><input type="checkbox" checked={props.document.units.showUnitSuffix} onChange={event => props.onUnitSettingsChange({ showUnitSuffix: event.target.checked })}/> Show unit suffix</label><label>Grid spacing<input type="number" min="0.000001" step="any" value={Number(toDisplayLength(props.document.display.gridSize, props.document.units.length).toFixed(6))} onChange={event => { const value = fromDisplayLength(Number(event.target.value), props.document.units.length); if (value > 0) props.onDisplayChange({ gridSize: value }); }}/></label><label>Precision<input type="number" min="0" max="8" value={props.document.units.precision} onChange={event => props.onUnitSettingsChange({ precision: Math.max(0, Math.min(8, Math.round(Number(event.target.value)))) })}/></label><label>Polygon sides<input type="number" min="3" max="64" value={props.document.display.polygonSides} onChange={event => props.onDisplayChange({ polygonSides: Math.max(3, Math.min(64, Number(event.target.value))) })}/></label></div>)}
  </div>;
}

function DetailsPanel(props: SketchSidebarProps & { selected: DatumPlane | SketchDocument["sketches"][number] | SketchEntity | SketchDimension | null }) {
  const selected = props.selected;
  return <section className="cad-details"><header>Details View <span>▣</span></header>{!selected ? <div className="details-empty">No Selection</div> : <div className="property-grid">
    <PropertySection title="Definition"/>
    <PropertyRow name="Name"><input value={selected.name} onChange={event => props.onRename(props.selection.kind, selected.id, event.target.value)}/></PropertyRow>
    {isPlane(selected) && <><PropertyRow name="Plane"><span>{selected.kind.toUpperCase()}</span></PropertyRow><PropertyRow name="Sketches"><span>{props.document.sketches.filter(sketch => sketch.planeId === selected.id).length}</span></PropertyRow><PropertyRow name="Action"><button onClick={() => props.onLookAtPlane(selected.id)}>Look At</button></PropertyRow></>}
    {isSketch(selected) && <><PropertyRow name="Plane"><span>{props.document.planes.find(plane => plane.id === selected.planeId)?.name}</span></PropertyRow><PropertyRow name="Entities"><span>{selected.entityIds.length}</span></PropertyRow><PropertyRow name="Generated"><span>{selected.generated ? "Yes" : "No"}</span></PropertyRow></>}
    {isEntity(selected) && <EntityProperties entity={selected} document={props.document} onUpdate={updater => props.onUpdateEntity(selected.id, updater)}/>} 
    {isDimension(selected) && <DimensionProperties dimension={selected} document={props.document} onValue={value => props.onUpdateDimensionValue(selected.id, value)}/>} 
    <PropertySection title="Information"/><PropertyRow name="Status"><span className={"valid" in selected && !selected.valid ? "property-invalid" : "property-valid"}>{"valid" in selected && !selected.valid ? "Invalid" : "Generated"}</span></PropertyRow>
  </div>}</section>;
}

function EntityProperties({ entity, document, onUpdate }: { entity: SketchEntity; document: SketchDocument; onUpdate: (updater: (entity: SketchEntity) => SketchEntity) => void }) {
  const unit = document.units.length, angleUnit = document.units.angle;
  const lengthField = (label: string, value: number, apply: (entity: SketchEntity, value: number) => SketchEntity) => <PropertyRow name={label}><NumberField value={toDisplayLength(value, unit)} suffix={unit} onCommit={value => onUpdate(entity => apply(entity, value * ({ mm: .001, cm: .01, m: 1, in: .0254, ft: .3048 }[unit])))}/></PropertyRow>;
  const angleField = (label: string, value: number, apply: (entity: SketchEntity, value: number) => SketchEntity) => <PropertyRow name={label}><NumberField value={toDisplayAngle(value, angleUnit)} suffix={angleUnit} onCommit={value => onUpdate(entity => apply(entity, angleUnit === "deg" ? value * Math.PI / 180 : value))}/></PropertyRow>;
  const pointFields = (label: string, point: { x: number; y: number }, apply: (entity: SketchEntity, axis: "x" | "y", value: number) => SketchEntity) => <><PropertySection title={label}/>{lengthField("X", point.x, (item, value) => apply(item, "x", value))}{lengthField("Y", point.y, (item, value) => apply(item, "y", value))}</>;
  if (entity.type === "line") return <>{pointFields("Start", entity.start, (item, axis, value) => item.type === "line" ? { ...item, start: { ...item.start, [axis]: value } } : item)}{pointFields("End", entity.end, (item, axis, value) => item.type === "line" ? { ...item, end: { ...item.end, [axis]: value } } : item)}{lengthField("Length", distance(entity.start, entity.end), (item, value) => item.type === "line" ? { ...item, end: { x: item.start.x + Math.cos(Math.atan2(item.end.y - item.start.y, item.end.x - item.start.x)) * value, y: item.start.y + Math.sin(Math.atan2(item.end.y - item.start.y, item.end.x - item.start.x)) * value } } : item)}</>;
  if (entity.type === "circle" || entity.type === "arc") return <>{pointFields("Center", entity.center, (item, axis, value) => item.type === "circle" || item.type === "arc" ? { ...item, center: { ...item.center, [axis]: value } } : item)}{lengthField("Radius", entity.radius, (item, value) => item.type === "circle" || item.type === "arc" ? { ...item, radius: Math.abs(value), valid: value > 0 } : item)}{entity.type === "arc" && <>{angleField("Start angle", entity.startAngle, (item, value) => item.type === "arc" ? { ...item, startAngle: value } : item)}{angleField("Sweep angle", entity.sweepAngle, (item, value) => item.type === "arc" ? { ...item, sweepAngle: value } : item)}</>}</>;
  if (entity.type === "rectangle") { const corners = rectanglePoints(entity); return <>{pointFields("Origin", entity.origin, (item, axis, value) => item.type === "rectangle" ? { ...item, origin: { ...item.origin, [axis]: value } } : item)}{lengthField("Width", distance(corners[0], corners[1]), (item, value) => item.type === "rectangle" ? { ...item, u: { x: item.u.x / Math.hypot(item.u.x, item.u.y) * value, y: item.u.y / Math.hypot(item.u.x, item.u.y) * value } } : item)}{lengthField("Height", distance(corners[1], corners[2]), (item, value) => item.type === "rectangle" ? { ...item, v: { x: item.v.x / Math.hypot(item.v.x, item.v.y) * value, y: item.v.y / Math.hypot(item.v.x, item.v.y) * value } } : item)}</>; }
  if (entity.type === "ellipse") return <>{pointFields("Center", entity.center, (item, axis, value) => item.type === "ellipse" ? { ...item, center: { ...item.center, [axis]: value } } : item)}{lengthField("Major radius", entity.radiusX, (item, value) => item.type === "ellipse" ? { ...item, radiusX: Math.abs(value) } : item)}{lengthField("Minor radius", entity.radiusY, (item, value) => item.type === "ellipse" ? { ...item, radiusY: Math.abs(value) } : item)}{angleField("Rotation", entity.rotation, (item, value) => item.type === "ellipse" ? { ...item, rotation: value } : item)}</>;
  if (entity.type === "polygon") return <>{pointFields("Center", entity.center, (item, axis, value) => item.type === "polygon" ? { ...item, center: { ...item.center, [axis]: value } } : item)}{lengthField("Radius", entity.radius, (item, value) => item.type === "polygon" ? { ...item, radius: Math.abs(value) } : item)}<PropertyRow name="Sides"><NumberField value={entity.sides} onCommit={value => onUpdate(item => item.type === "polygon" ? { ...item, sides: Math.max(3, Math.round(value)) } : item)}/></PropertyRow></>;
  return <><PropertyRow name="Vertices"><span>{entity.points.length}</span></PropertyRow><PropertyRow name="Closed"><span>{entity.closed ? "Yes" : "No"}</span></PropertyRow></>;
}

function DimensionProperties({ dimension, document, onValue }: { dimension: SketchDimension; document: SketchDocument; onValue: (value: number) => void }) {
  const internal = dimensionValue(dimension, document);
  const suffix: string = dimension.kind === "angle" ? document.units.angle : document.units.length;
  const factor = ({ mm: .001, cm: .01, m: 1, in: .0254, ft: .3048 } as const)[document.units.length];
  const display = dimension.kind === "angle" ? toDisplayAngle(internal, document.units.angle) : internal / factor;
  return <><PropertyRow name="Type"><span>{dimension.kind}</span></PropertyRow><PropertyRow name="Value"><NumberField value={display} suffix={suffix} disabled={dimension.kind === "angle"} onCommit={value => onValue(value * factor)}/></PropertyRow><PropertyRow name="Reference"><span>{dimension.entityIds.join(", ")}</span></PropertyRow></>;
}

function NumberField({ value, suffix, disabled, onCommit }: { value: number; suffix?: string; disabled?: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(Number.isFinite(value) ? Number(value.toFixed(8)) : 0));
  useEffect(() => setText(String(Number.isFinite(value) ? Number(value.toFixed(8)) : 0)), [value]);
  const commit = () => { const parsed = Number(text); if (Number.isFinite(parsed)) onCommit(parsed); else setText(String(value)); };
  return <span className="number-field"><input type="number" step="any" value={text} disabled={disabled} onChange={event => setText(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }}/>{suffix && <em>{suffix}</em>}</span>;
}

function PropertySection({ title }: { title: string }) { return <div className="property-section">▾ {title}</div>; }
function PropertyRow({ name, children }: { name: string; children: React.ReactNode }) { return <label className="property-row"><span>{name}</span><div>{children}</div></label>; }
function getSelected(document: SketchDocument, selection: CadSelection) { const id = selection.ids[selection.ids.length - 1]; if (!id) return null; if (selection.kind === "plane") return document.planes.find(item => item.id === id) ?? null; if (selection.kind === "sketch") return document.sketches.find(item => item.id === id) ?? null; if (selection.kind === "entity") return document.entities.find(item => item.id === id) ?? null; return document.dimensions.find(item => item.id === id) ?? null; }
function isPlane(item: object): item is DatumPlane { return "kind" in item && ["xy", "yz", "zx"].includes(String((item as DatumPlane).kind)); }
function isSketch(item: object): item is SketchDocument["sketches"][number] { return "entityIds" in item && "planeId" in item; }
function isEntity(item: object): item is SketchEntity { return "type" in item && "sketchId" in item; }
function isDimension(item: object): item is SketchDimension { return "kind" in item && "entityIds" in item && "offset" in item; }
function entityGlyph(type: SketchEntity["type"]) { return ({ line: "╱", polyline: "⌁", rectangle: "□", circle: "○", arc: "◜", ellipse: "⬭", polygon: "⬡" })[type]; }
function toolGlyph(label: string) { if (label.includes("Rectangle")) return "□"; if (label.includes("Circle")) return "○"; if (label.includes("Arc")) return "◜"; if (label === "Ellipse" || label === "Oval") return "⬭"; if (label === "Polygon") return "⬡"; return "╱"; }
