import { useEffect, useMemo, useRef, useState } from "react";
import "./geometry.css";
import { CadIcon, type CadIconName } from "./components/CadIcon";
import { SketchSidebar } from "./components/SketchSidebar";
import { SketchViewport } from "./components/SketchViewport";
import {
  EPSILON, dimensionKindForEntity, entityBounds, entityCenter, exportSketchToStep, fromDisplayAngle, fromDisplayLength,
  isSketchDocument, lineIntersection, mirrorEntity, offsetEntity, rotateEntity, scaleEntity,
  setDimensionValue, translateEntity, uid,
} from "./geometry/sketchMath";
import { useSketchDocument } from "./hooks/useSketchDocument";
import type {
  CadSelection, DimensionKind, EditorTool, LengthUnit, Point2, SidebarMode, SketchDimension,
  SketchDocument, SketchEntity, SketchProjectFile, ViewState,
} from "./types/sketch";

const DRAW_TOOLS: EditorTool[] = ["line", "polyline", "rectangle", "rectangle3", "polygon", "circle", "arc3", "arcCenter", "ellipse"];
const DIMENSION_TOOLS: EditorTool[] = ["dimGeneral", "dimHorizontal", "dimVertical", "dimLength", "dimRadius", "dimDiameter", "dimAngle", "dimMove"];

export default function GeometryWindow() {
  const store = useSketchDocument();
  const { document, selection, commit, replace, undo, redo } = store;
  const [mode, setMode] = useState<SidebarMode>("modeling");
  const [tool, setTool] = useState<EditorTool>("select");
  const [view, setView] = useState<ViewState>({ zoom: 1, pan: { x: 0, y: 0 }, azimuth: 45, elevation: 35.264 });
  const [status, setStatus] = useState("Ready");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState("model");
  const [saveFileType, setSaveFileType] = useState<"step" | "json">("step");
  const projectInput = useRef<HTMLInputElement>(null);

  const activePlane = document.planes.find(plane => plane.id === document.activePlaneId) ?? document.planes[0];
  const activeSketch = document.sketches.find(sketch => sketch.id === document.activeSketchId) ?? null;
  const visibleSketchIds = useMemo(() => new Set(document.sketches.filter(sketch => sketch.planeId === activePlane.id && sketch.visible).map(sketch => sketch.id)), [document.sketches, activePlane.id]);
  const visibleEntities = useMemo(() => document.entities.filter(entity => visibleSketchIds.has(entity.sketchId)), [document.entities, visibleSketchIds]);
  const visibleDimensions = useMemo(() => document.dimensions.filter(dimension => visibleSketchIds.has(dimension.sketchId)), [document.dimensions, visibleSketchIds]);

  const notify = (message: string) => { setStatus(message); window.setTimeout(() => setStatus(current => current === message ? "Ready" : current), 3500); };
  const makeSketch = (source: SketchDocument) => {
    const count = source.sketches.length + 1, id = uid("sketch");
    return { sketch: { id, name: `Sketch${count}`, planeId: source.activePlaneId, entityIds: [], generated: false, visible: true }, id };
  };
  const newSketch = () => {
    const created = makeSketch(document);
    commit(current => ({ ...current, sketches: [...current.sketches, created.sketch], activeSketchId: created.id }));
    setMode("sketching"); setTool("line");
    store.setSelection({ kind: "sketch", ids: [created.id] });
    notify(`New sketch created on ${activePlane.name}`);
  };
  const ensureSketchAndSetTool = (nextTool: EditorTool) => {
    if ((DRAW_TOOLS.includes(nextTool) || DIMENSION_TOOLS.includes(nextTool) || nextTool === "move") && (!activeSketch || activeSketch.planeId !== document.activePlaneId)) {
      const created = makeSketch(document);
      commit(current => ({ ...current, sketches: [...current.sketches, created.sketch], activeSketchId: created.id }));
      store.setSelection({ kind: "sketch", ids: [created.id] });
    }
    setMode("sketching"); setTool(nextTool); setActiveMenu(null);
    notify(toolInstruction(nextTool));
  };
  const resetModel = () => {
    if ((document.entities.length || document.sketches.length) && !window.confirm("Create a new geometry model? Unsaved sketch data will be cleared.")) return;
    replace({ ...document, sketches: [], entities: [], dimensions: [], activePlaneId: "xy-plane", activeSketchId: null });
    setView({ zoom: 1, pan: { x: 0, y: 0 }, azimuth: 45, elevation: 35.264 }); setMode("modeling"); setTool("select"); setActiveMenu(null); notify("New geometry model");
  };

  const addEntity = (source: SketchEntity) => {
    let targetSketchId = document.activeSketchId;
    let extraCommit: ((curr: SketchDocument) => SketchDocument) | null = null;
    if (!targetSketchId) {
      const created = makeSketch(document);
      targetSketchId = created.id;
      extraCommit = curr => ({ ...curr, sketches: [...curr.sketches, created.sketch], activeSketchId: created.id });
    }
    const sid = targetSketchId;
    const nextId = source.id;
    const nextName = `${entityLabel(source.type)}${document.entities.filter(entity => entity.type === source.type).length + 1}`;
    commit(current => {
      const baseDoc = extraCommit ? extraCommit(current) : current;
      const entity = { ...source, id: nextId, name: nextName, sketchId: sid, valid: entityIsValid(source) };
      return { ...baseDoc, entities: [...baseDoc.entities, entity], sketches: baseDoc.sketches.map(sketch => sketch.id === sid ? { ...sketch, entityIds: [...sketch.entityIds, entity.id], generated: false } : sketch) };
    });
    store.setSelection({ kind: "entity", ids: [nextId] }); notify(`${nextName} created`);
  };

  const addEntities = (sources: SketchEntity[]) => {
    if (!sources.length) return;
    let targetSketchId = document.activeSketchId;
    let extraCommit: ((curr: SketchDocument) => SketchDocument) | null = null;
    if (!targetSketchId) {
      const created = makeSketch(document);
      targetSketchId = created.id;
      extraCommit = curr => ({ ...curr, sketches: [...curr.sketches, created.sketch], activeSketchId: created.id });
    }
    const sid = targetSketchId;
    commit(current => {
      const baseDoc = extraCommit ? extraCommit(current) : current;
      const count = baseDoc.entities.filter(entity => entity.type === sources[0].type).length;
      const newEntities = sources.map((s, idx) => ({
        ...s,
        id: s.id,
        name: `${entityLabel(s.type)}${count + idx + 1}`,
        sketchId: sid,
        valid: entityIsValid(s),
      }));
      const newIds = newEntities.map(e => e.id);
      return {
        ...baseDoc,
        entities: [...baseDoc.entities, ...newEntities],
        sketches: baseDoc.sketches.map(sk => sk.id === sid ? { ...sk, entityIds: [...sk.entityIds, ...newIds], generated: false } : sk),
      };
    });
    store.setSelection({ kind: "entity", ids: [sources[0].id] });
    notify(`${sources.length} components created`);
  };

  const updateEntity = (id: string, updater: (entity: SketchEntity) => SketchEntity) => commit(current => ({
    ...current,
    entities: current.entities.map(entity => entity.id === id ? (() => { const next = updater(entity); return { ...next, valid: entityIsValid(next) }; })() : entity),
    sketches: current.sketches.map(sketch => sketch.entityIds.includes(id) ? { ...sketch, generated: false } : sketch),
  }));
  const moveEntities = (ids: string[], delta: Point2) => commit(current => ({ ...current, entities: current.entities.map(entity => ids.includes(entity.id) ? translateEntity(entity, delta) : entity), sketches: current.sketches.map(sketch => ids.some(id => sketch.entityIds.includes(id)) ? { ...sketch, generated: false } : sketch) }));

  const selectEntity = (id: string, additive: boolean, subIndex?: number) => {
    if (!additive || selection.kind !== "entity") store.setSelection({ kind: "entity", ids: [id], subIndex });
    else {
      const ids = selection.ids.includes(id) ? selection.ids.filter(item => item !== id) : [...selection.ids, id];
      store.setSelection({ kind: "entity", ids, subIndex });
    }
  };

  const lookAtPlane = (id: string) => {
    const plane = document.planes.find(item => item.id === id); if (!plane) return;
    const sketch = [...document.sketches].reverse().find(item => item.planeId === id);
    commit(current => ({ ...current, activePlaneId: id, activeSketchId: sketch?.id ?? null }));
    store.setSelection({ kind: "plane", ids: [id] }); setMode("modeling"); setTool("select");
    const angles = id === "xy-plane" ? { azimuth: 0, elevation: 0 }
                 : id === "yz-plane" ? { azimuth: -90, elevation: 0 }
                 : { azimuth: 0, elevation: 90 };
    setView({ zoom: 1, pan: { x: 0, y: 0 }, ...angles });
    notify(`Looking normal to ${plane.name}`);
  };

  const addDimension = (requested: DimensionKind, entityId: string) => {
    const entity = document.entities.find(item => item.id === entityId); if (!entity) return;
    const targetSketchId = document.activeSketchId ?? entity.sketchId;
    if (!targetSketchId) return;
    let entityIds = [entityId];
    if (requested === "angle") {
      const firstId = selection.kind === "entity" ? selection.ids.find(id => id !== entityId && document.entities.find(item => item.id === id)?.type === "line") : undefined;
      if (!firstId || entity.type !== "line") { store.setSelection({ kind: "entity", ids: [entityId] }); notify("Angle: Ctrl-select a second line, then click either line with Angle active"); return; }
      entityIds = [firstId, entityId];
    }
    const kind = dimensionKindForEntity(requested, entity); if (!kind) { notify(`${requested} dimension is not supported for ${entity.type}`); return; }
    const id = uid("dimension"), count = document.dimensions.length + 1;
    const offset = kind === "vertical" ? { x: -0.025, y: 0 } : kind === "horizontal" ? { x: 0, y: 0.02 } : { x: 0.02, y: 0.02 };
    const dimension: SketchDimension = { id, name: `Dimension${count}`, sketchId: targetSketchId, kind, entityIds, offset, visible: true };
    commit(current => ({ ...current, dimensions: [...current.dimensions, dimension], sketches: current.sketches.map(sketch => sketch.id === dimension.sketchId ? { ...sketch, generated: false } : sketch) }));
    store.setSelection({ kind: "dimension", ids: [id] }); notify(`${kind} dimension created`);
  };

  const updateDimensionValue = (id: string, value: number) => commit(current => {
    const dimension = current.dimensions.find(item => item.id === id); if (!dimension) return current;
    const entities = setDimensionValue(dimension, current, value); if (!entities) return current;
    return { ...current, entities, sketches: current.sketches.map(sketch => sketch.id === dimension.sketchId ? { ...sketch, generated: false } : sketch) };
  });

  const deleteSelection = () => {
    if (selection.kind === "entity") {
      const ids = selection.ids; if (!ids.length) return;
      commit(current => ({ ...current, entities: current.entities.filter(entity => !ids.includes(entity.id)), dimensions: current.dimensions.filter(dimension => !dimension.entityIds.some(id => ids.includes(id))), sketches: current.sketches.map(sketch => ({ ...sketch, entityIds: sketch.entityIds.filter(id => !ids.includes(id)), generated: ids.some(id => sketch.entityIds.includes(id)) ? false : sketch.generated })) }));
      store.setSelection({ kind: "sketch", ids: document.activeSketchId ? [document.activeSketchId] : [] }); notify(`${ids.length} entity${ids.length === 1 ? "" : "ies"} deleted`); return;
    }
    if (selection.kind === "dimension") { const ids = selection.ids; commit(current => ({ ...current, dimensions: current.dimensions.filter(item => !ids.includes(item.id)) })); store.setSelection({ kind: "sketch", ids: document.activeSketchId ? [document.activeSketchId] : [] }); notify("Dimension deleted"); return; }
    notify("Select sketch geometry to delete");
  };

  const modify = (action: "copy" | "delete" | "trim" | "extend" | "offset" | "mirror" | "rotate" | "scale") => {
    if (action === "delete") { deleteSelection(); return; }
    const selected = selection.kind === "entity" ? document.entities.filter(entity => selection.ids.includes(entity.id)) : [];
    if (!selected.length) { notify(`Select one or more entities before ${action}`); return; }
    if (action === "copy") {
      const copies = selected.map(entity => ({ ...translateEntity(entity, { x: .01, y: -.01 }), id: uid(entity.type), name: `${entity.name}_Copy`, valid: entity.valid }));
      const ids = copies.map(entity => entity.id);
      commit(current => ({ ...current, entities: [...current.entities, ...copies], sketches: current.sketches.map(sketch => sketch.id === current.activeSketchId ? { ...sketch, entityIds: [...sketch.entityIds, ...ids], generated: false } : sketch) }));
      store.setSelection({ kind: "entity", ids }); notify("Selection copied by 10 mm"); return;
    }
    if (action === "trim" || action === "extend") {
      if (selected.length !== 2 || selected.some(entity => entity.type !== "line")) { notify(`${action} requires exactly two Ctrl-selected lines`); return; }
      const [first, second] = selected as Extract<SketchEntity, { type: "line" }>[];
      const intersection = lineIntersection(first.start, first.end, second.start, second.end, action === "trim");
      if (!intersection) { notify(action === "trim" ? "The selected line segments do not cross" : "Parallel lines cannot be extended to an intersection"); return; }
      const replaceStart = Math.hypot(first.start.x - intersection.x, first.start.y - intersection.y) < Math.hypot(first.end.x - intersection.x, first.end.y - intersection.y);
      updateEntity(first.id, entity => entity.type === "line" ? { ...entity, [replaceStart ? "start" : "end"]: intersection } : entity); notify(`${first.name} ${action === "trim" ? "trimmed" : "extended"} to intersection`); return;
    }
    if (action === "offset") {
      const text = window.prompt(`Offset distance (${document.units.length})`, "10"); if (text === null) return;
      const amount = fromDisplayLength(Number(text), document.units.length); if (!Number.isFinite(amount)) { notify("Enter a valid offset distance"); return; }
      transformSelected(entity => offsetEntity(entity, amount) ?? entity, true); notify("Offset copies created"); return;
    }
    if (action === "mirror") {
      const axis = window.prompt("Mirror about axis: X or Y", "X")?.trim().toLowerCase(); if (axis !== "x" && axis !== "y") return;
      transformSelected(entity => mirrorEntity(entity, axis), true); notify(`Mirrored copy about ${axis.toUpperCase()} axis`); return;
    }
    if (action === "rotate") {
      const text = window.prompt(`Rotation angle (${document.units.angle})`, document.units.angle === "deg" ? "45" : "0.7854"); if (text === null) return;
      const angle = fromDisplayAngle(Number(text), document.units.angle); if (!Number.isFinite(angle)) return;
      const origin = selectionCenter(selected); transformSelected(entity => rotateEntity(entity, angle, origin), false); notify("Selection rotated"); return;
    }
    const text = window.prompt("Scale factor", "2"); if (text === null) return; const factor = Number(text); if (!Number.isFinite(factor) || Math.abs(factor) < EPSILON) { notify("Scale factor must be non-zero"); return; }
    const origin = selectionCenter(selected); transformSelected(entity => scaleEntity(entity, factor, origin), false); notify("Selection scaled");
  };

  const transformSelected = (transformer: (entity: SketchEntity) => SketchEntity, copy: boolean) => {
    const ids = selection.ids;
    const added = copy ? document.entities.filter(entity => ids.includes(entity.id)).map(entity => { const next = transformer(entity); return { ...next, id: uid(entity.type), name: `${entity.name}_Copy`, valid: entityIsValid(next) }; }) : [];
    const newIds = added.map(entity => entity.id);
    commit(current => {
      if (copy) {
        return { ...current, entities: [...current.entities, ...added], sketches: current.sketches.map(sketch => sketch.id === current.activeSketchId ? { ...sketch, entityIds: [...sketch.entityIds, ...newIds], generated: false } : sketch) };
      }
      return { ...current, entities: current.entities.map(entity => ids.includes(entity.id) ? (() => { const next = transformer(entity); return { ...next, valid: entityIsValid(next) }; })() : entity), sketches: current.sketches.map(sketch => ids.some(id => sketch.entityIds.includes(id)) ? { ...sketch, generated: false } : sketch) };
    });
    if (copy) store.setSelection({ kind: "entity", ids: newIds });
  };

  const generate = () => {
    if (!activeSketch) { notify("Create or select a sketch first"); return; }
    const sketchEntities = document.entities.filter(entity => entity.sketchId === activeSketch.id);
    if (!sketchEntities.length) { notify("The active sketch contains no geometry"); return; }
    const invalid = sketchEntities.filter(entity => !entityIsValid(entity));
    if (invalid.length) { notify(`Cannot generate: ${invalid.length} invalid ${invalid.length === 1 ? "entity" : "entities"}`); return; }
    commit(current => ({ ...current, sketches: current.sketches.map(sketch => sketch.id === activeSketch.id ? { ...sketch, generated: true } : sketch) }));
    setMode("modeling"); setTool("select"); store.setSelection({ kind: "sketch", ids: [activeSketch.id] }); notify(`${activeSketch.name} generated and remains editable`);
  };

  const fitView = () => {
    if (!visibleEntities.length) { setView({ zoom: 1, pan: { x: 0, y: 0 } }); return; }
    const bounds = visibleEntities.map(entityBounds), minX = Math.min(...bounds.map(item => item.minX)), maxX = Math.max(...bounds.map(item => item.maxX)), minY = Math.min(...bounds.map(item => item.minY)), maxY = Math.max(...bounds.map(item => item.maxY));
    const width = Math.max(maxX - minX, .02), height = Math.max(maxY - minY, .02), zoom = Math.min(16, Math.max(.1, Math.min(780 / (width * 1000), 430 / (height * 1000))));
    setView({ zoom, pan: { x: -(minX + maxX) / 2 * 1000 * zoom, y: (minY + maxY) / 2 * 1000 * zoom } }); notify("View fitted to sketch geometry");
  };

  const save = () => {
    setActiveMenu(null);
    setSaveModalOpen(true);
  };

  const handleConfirmSave = () => {
    const rawName = saveFileName.trim() || "model";
    const cleanName = rawName.replace(/\.(step|stp|json|clgeo)$/i, "");

    if (saveFileType === "step") {
      const stepContent = exportSketchToStep(document, cleanName);
      const blob = new Blob([stepContent], { type: "application/step" });
      const url = URL.createObjectURL(blob);
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = `${cleanName}.step`;
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveModalOpen(false);
      notify(`Exported ${cleanName}.step (${document.entities.length} CAD entities)`);
    } else {
      const file: SketchProjectFile = { format: "simwhere-geometry", version: 2, document, view };
      const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: "application/json" }));
      const anchor = globalThis.document.createElement("a");
      anchor.href = url;
      anchor.download = `${cleanName}.clgeo.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveModalOpen(false);
      notify(`Saved project ${cleanName}.clgeo.json`);
    }
  };
  const open = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as Partial<SketchProjectFile>;
      if (data.format !== "simwhere-geometry" || data.version !== 2 || !isSketchDocument(data.document)) throw new Error("Invalid document schema");
      replace(data.document); setView(validView(data.view) ? { azimuth: 45, elevation: 35.264, ...data.view } : { zoom: 1, pan: { x: 0, y: 0 }, azimuth: 45, elevation: 35.264 }); setMode("modeling"); setTool("select"); notify(`${file.name} opened`);
    } catch { notify("The selected file is not a valid Simwhere geometry project"); }
  };

  const toggleVisibility = (kind: CadSelection["kind"], id: string) => commit(current => ({ ...current,
    planes: kind === "plane" ? current.planes.map(item => item.id === id ? { ...item, visible: !item.visible } : item) : current.planes,
    sketches: kind === "sketch" ? current.sketches.map(item => item.id === id ? { ...item, visible: !item.visible } : item) : current.sketches,
    entities: kind === "entity" ? current.entities.map(item => item.id === id ? { ...item, visible: !item.visible } : item) : current.entities,
    dimensions: kind === "dimension" ? current.dimensions.map(item => item.id === id ? { ...item, visible: !item.visible } : item) : current.dimensions,
  }));
  const rename = (kind: CadSelection["kind"], id: string, name: string) => commit(current => ({ ...current,
    planes: kind === "plane" ? current.planes.map(item => item.id === id ? { ...item, name } : item) : current.planes,
    sketches: kind === "sketch" ? current.sketches.map(item => item.id === id ? { ...item, name } : item) : current.sketches,
    entities: kind === "entity" ? current.entities.map(item => item.id === id ? { ...item, name } : item) : current.entities,
    dimensions: kind === "dimension" ? current.dimensions.map(item => item.id === id ? { ...item, name } : item) : current.dimensions,
  }));

  useEffect(() => {
    globalThis.document.title = "Geometry";
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement; if (target.matches("input, textarea, select")) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); save(); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); store.setSelection({ kind: "entity", ids: visibleEntities.map(entity => entity.id) }); }
      else if (event.key === "Delete" || event.key === "Backspace") deleteSelection();
      else if (event.key === "Escape") { setTool("select"); setActiveMenu(null); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  return <div className="geometry-app" onPointerDown={() => activeMenu && setActiveMenu(null)}>
    <header className="geometry-menubar"><div className="geometry-appmark">SW</div>{["File", "Edit", "View", "Create", "Concept", "Tools", "Units", "Help"].map(label => <div className="geometry-menu-root" key={label} onPointerDown={event => event.stopPropagation()}>
      <button className={activeMenu === label ? "active" : ""} onClick={() => setActiveMenu(activeMenu === label ? null : label)}>{label}</button>
      {activeMenu === label && <GeometryMenu label={label} document={document} onNew={resetModel} onOpen={() => projectInput.current?.click()} onSave={save} onUndo={undo} onRedo={redo} onSelectAll={() => store.setSelection({ kind: "entity", ids: visibleEntities.map(entity => entity.id) })} onDeselect={() => store.setSelection({ kind: "sketch", ids: document.activeSketchId ? [document.activeSketchId] : [] })} onSketch={newSketch} onTool={ensureSketchAndSetTool} onFit={fitView} onIsometric={() => setView(current => ({ ...current, azimuth: 45, elevation: 35.264, zoom: 1, pan: { x: 0, y: 0 } }))} onUnits={(length, angle) => commit(current => ({ ...current, units: { ...current.units, ...(length ? { length } : {}), ...(angle ? { angle } : {}) } }))} onNotify={notify}/>}
    </div>)}<span className="geometry-title">Geometry - 2D Sketcher</span></header>
    <div className="geometry-main-toolbar">
      <ToolbarButton icon="new" label="New" onClick={resetModel}/><ToolbarButton icon="open" label="Open" onClick={() => projectInput.current?.click()}/><ToolbarButton icon="save" label="Save" onClick={save}/><span className="toolbar-rule"/>
      <ToolbarButton icon="undo" label="Undo" disabled={!store.canUndo} onClick={undo}/><ToolbarButton icon="redo" label="Redo" disabled={!store.canRedo} onClick={redo}/><span className="toolbar-rule"/>
      <ToolbarButton icon="select" label="Select" active={tool === "select"} onClick={() => setTool("select")}/><ToolbarButton icon="pan" label="Pan" active={tool === "pan"} onClick={() => setTool("pan")}/><ToolbarButton icon="fit" label="Fit" onClick={fitView}/><ToolbarButton icon="isometric" label="Isometric View" onClick={() => setView(current => ({ ...current, azimuth: 45, elevation: 35.264, zoom: 1, pan: { x: 0, y: 0 } }))}/><span className="toolbar-rule"/>
      <button className="geometry-tool text-tool" title="Zoom out" onClick={() => setView(current => ({ ...current, zoom: Math.max(.1, current.zoom / 1.25) }))}>−</button><button className="geometry-tool text-tool" title="Zoom in" onClick={() => setView(current => ({ ...current, zoom: Math.min(20, current.zoom * 1.25) }))}>+</button>
      <span className="toolbar-fill"/><span className="toolbar-readout">{activePlane.name}</span>
    </div>
    <div className="geometry-context-toolbar">
      <select className="plane-selector" value={document.activePlaneId} onChange={event => lookAtPlane(event.target.value)}>{document.planes.map(plane => <option key={plane.id} value={plane.id}>{plane.name}</option>)}</select><span className="toolbar-rule"/>
      <ToolbarButton icon="sketch" label="New Sketch" onClick={newSketch}/><ToolbarButton icon="line" label="Line" active={tool === "line"} onClick={() => ensureSketchAndSetTool("line")}/><ToolbarButton icon="rectangle" label="Rectangle" active={tool === "rectangle"} onClick={() => ensureSketchAndSetTool("rectangle")}/><ToolbarButton icon="circle" label="Circle" active={tool === "circle"} onClick={() => ensureSketchAndSetTool("circle")}/><span className="toolbar-rule"/>
      <ToolbarButton icon="horizontal" label="Horizontal Dimension" active={tool === "dimHorizontal"} onClick={() => ensureSketchAndSetTool("dimHorizontal")}/><ToolbarButton icon="vertical" label="Vertical Dimension" active={tool === "dimVertical"} onClick={() => ensureSketchAndSetTool("dimVertical")}/><ToolbarButton icon="dimension" label="General Dimension" active={tool === "dimGeneral"} onClick={() => ensureSketchAndSetTool("dimGeneral")}/>
    </div>
    <div className="geometry-feature-toolbar">
      <button className="feature-tool primary" onClick={generate}><CadIcon name="generate"/> Generate</button><button className="feature-tool" onClick={() => notify("Select geometry to edit exact values in Details View")}><CadIcon name="parameters"/> Parameters</button><span className="toolbar-rule"/>
      <button className="feature-tool feature-placeholder" disabled title="3D modeling starts from a generated sketch"><CadIcon name="extrude"/> Extrude</button><button className="feature-tool feature-placeholder" disabled title="3D modeling is outside this sketching stage">↻ Revolve</button><button className="feature-tool feature-placeholder" disabled title="3D modeling is outside this sketching stage">⌁ Sweep</button><button className="feature-tool feature-placeholder" disabled title="3D modeling is outside this sketching stage">◆ Skin/Loft</button>
    </div>
    <div className="geometry-workspace">
      <SketchSidebar document={document} mode={mode} activeTool={tool} selection={selection} onModeChange={setMode} onToolChange={ensureSketchAndSetTool} onSelect={next => { store.setSelection(next); if (next.kind === "sketch") { const sketch = document.sketches.find(item => item.id === next.ids[0]); if (sketch) commit(current => ({ ...current, activePlaneId: sketch.planeId, activeSketchId: sketch.id })); } }} onLookAtPlane={lookAtPlane} onRenamePlane={(id, name) => rename("plane", id, name)} onNewSketch={newSketch} onGenerate={generate} onToggleVisibility={toggleVisibility} onRename={rename} onUpdateEntity={updateEntity} onUpdateDimensionValue={updateDimensionValue} onModify={modify} onDisplayChange={changes => commit(current => ({ ...current, display: { ...current.display, ...changes } }))} onUnitSettingsChange={changes => commit(current => ({ ...current, units: { ...current.units, ...changes } }))}/>
      <SketchViewport document={document} entities={visibleEntities} dimensions={visibleDimensions} activePlane={activePlane} activeTool={tool} selectedIds={selection.ids} selectionKind={selection.kind} view={view} onViewChange={setView} onSelectEntity={selectEntity} onSelectDimension={id => store.setSelection({ kind: "dimension", ids: [id] })} onClearSelection={() => store.setSelection({ kind: activeSketch ? "sketch" : "plane", ids: [activeSketch?.id ?? activePlane.id] })} onAddEntity={addEntity} onAddEntities={addEntities} onMoveEntities={moveEntities} onAddDimension={addDimension} onMoveDimension={(id, offset) => commit(current => ({ ...current, dimensions: current.dimensions.map(item => item.id === id ? { ...item, offset } : item) }))} onStatus={setStatus} onToolCancel={() => setTool("select")}/>
    </div>
    <footer className="geometry-status"><span>Geometry</span><span className="geometry-status-main"><i className={status === "Ready" ? "ready" : "working"}/>{status}</span><span>{activePlane.name} Plane</span><span>{Math.round(view.zoom * 100)}%</span><span>{document.units.length} · {document.units.angle === "deg" ? "Degree" : "Radian"}</span><span>{visibleEntities.length} entities</span></footer>
    <input ref={projectInput} type="file" accept=".json,.clgeo" hidden onChange={open}/>

    {saveModalOpen && (
      <div className="geometry-modal-backdrop" onClick={() => setSaveModalOpen(false)}>
        <div className="cad-save-dialog" onClick={e => e.stopPropagation()}>
          <div className="cad-save-header">
            <span>Save CAD Geometry As</span>
            <button className="cad-save-close" title="Close" onClick={() => setSaveModalOpen(false)}>✕</button>
          </div>
          <div className="cad-save-body">
            <div className="cad-save-nav">
              <span className="cad-save-nav-label">Save in:</span>
              <div className="cad-save-nav-path">📁 Desktop &gt; Projects &gt; Simwhere CAD</div>
            </div>
            <div className="cad-save-list">
              <div className="cad-save-file-item active">
                <span className="cad-save-file-icon">📄</span>
                <span className="cad-save-file-name">{saveFileName || "model"}.{saveFileType === "step" ? "step" : "clgeo.json"}</span>
                <span className="cad-save-file-size">New File</span>
              </div>
              <div className="cad-save-file-item">
                <span className="cad-save-file-icon">📐</span>
                <span className="cad-save-file-name">bracket_assembly.step</span>
                <span className="cad-save-file-size">24 KB</span>
              </div>
              <div className="cad-save-file-item">
                <span className="cad-save-file-icon">📐</span>
                <span className="cad-save-file-name">chassis_profile.step</span>
                <span className="cad-save-file-size">18 KB</span>
              </div>
            </div>
            <div className="cad-save-field">
              <span>File name:</span>
              <div className="cad-save-input-wrap">
                <input
                  type="text"
                  value={saveFileName}
                  autoFocus
                  onChange={e => setSaveFileName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleConfirmSave(); }}
                />
                <span className="cad-save-ext">.{saveFileType === "step" ? "step" : "clgeo.json"}</span>
              </div>
            </div>
            <div className="cad-save-field">
              <span>Save as type:</span>
              <select
                className="cad-save-select"
                value={saveFileType}
                onChange={e => setSaveFileType(e.target.value as "step" | "json")}
              >
                <option value="step">STEP CAD File (*.step, *.stp)</option>
                <option value="json">Simwhere Geometry Project (*.clgeo.json)</option>
              </select>
            </div>
            <div className="cad-save-summary">
              ℹ Ready to export {document.entities.length} sketch/CAD entities across {document.sketches.length} sketch(es) into standard ISO-10303-21 STEP format.
            </div>
          </div>
          <div className="cad-save-footer">
            <button className="cad-save-btn" onClick={() => setSaveModalOpen(false)}>Cancel</button>
            <button className="cad-save-btn primary" onClick={handleConfirmSave}>Save</button>
          </div>
        </div>
      </div>
    )}
  </div>;
}

function ToolbarButton({ icon, label, active, disabled, onClick }: { icon: CadIconName; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) { return <button className={`geometry-tool ${active ? "active" : ""}`} title={label} aria-label={label} disabled={disabled} onClick={onClick}><CadIcon name={icon}/></button>; }

function GeometryMenu({ label, document, onNew, onOpen, onSave, onUndo, onRedo, onSelectAll, onDeselect, onSketch, onTool, onFit, onIsometric, onUnits, onNotify }: { label: string; document: SketchDocument; onNew: () => void; onOpen: () => void; onSave: () => void; onUndo: () => void; onRedo: () => void; onSelectAll: () => void; onDeselect: () => void; onSketch: () => void; onTool: (tool: EditorTool) => void; onFit: () => void; onIsometric: () => void; onUnits: (length?: LengthUnit, angle?: "deg" | "rad") => void; onNotify: (message: string) => void }) {
  const item = (text: string, action: () => void, shortcut = "", active = false, disabled = false) => <button disabled={disabled} className={active ? "checked" : ""} onClick={action}><span>{active ? "✓ " : ""}{text}</span><kbd>{shortcut}</kbd></button>;
  return <div className="geometry-dropdown">
    {label === "File" && <>{item("New Model", onNew, "Ctrl+N")}{item("Open Geometry...", onOpen, "Ctrl+O")}{item("Save Geometry", onSave, "Ctrl+S")}</>}
    {label === "Edit" && <>{item("Undo", onUndo, "Ctrl+Z")}{item("Redo", onRedo, "Ctrl+Y")}<hr/>{item("Select All", onSelectAll, "Ctrl+A")}{item("Deselect", onDeselect, "Esc")}</>}
    {label === "View" && <>{item("Fit", onFit, "F")}{item("Isometric View", onIsometric, "Home")}{item("Show Grid", () => onNotify("Use Sketching > Settings to configure the grid"), "", document.display.grid)}</>}
    {label === "Create" && <>{item("New Sketch", onSketch)}{item("Line", () => onTool("line"))}{item("Polyline", () => onTool("polyline"))}{item("Rectangle", () => onTool("rectangle"))}{item("Circle", () => onTool("circle"))}</>}
    {label === "Concept" && <>{item("3D Concepts", () => onNotify("3D feature creation is intentionally disabled in this 2D sketching stage"), "", false, true)}</>}
    {label === "Tools" && <>{item("Move", () => onTool("move"))}{item("General Dimension", () => onTool("dimGeneral"))}{item("Move Dimension", () => onTool("dimMove"))}</>}
    {label === "Units" && <><div className="menu-caption">Length</div>{(["mm", "cm", "m", "in", "ft"] as LengthUnit[]).map(unit => item(unit, () => onUnits(unit), "", document.units.length === unit))}<hr/><div className="menu-caption">Angle</div>{item("Degrees", () => onUnits(undefined, "deg"), "", document.units.angle === "deg")}{item("Radians", () => onUnits(undefined, "rad"), "", document.units.angle === "rad")}</>}
    {label === "Help" && <>{item("Sketcher controls", () => onNotify("Left-click to draw/select · middle-drag to pan · wheel to zoom · Esc to cancel"))}</>}
  </div>;
}

function entityIsValid(entity: SketchEntity) {
  if (entity.type === "line") return Math.hypot(entity.end.x - entity.start.x, entity.end.y - entity.start.y) > EPSILON;
  if (entity.type === "polyline") return entity.points.length > 1 && entity.points.some((point, index) => index && Math.hypot(point.x - entity.points[index - 1].x, point.y - entity.points[index - 1].y) > EPSILON);
  if (entity.type === "rectangle") return Math.hypot(entity.u.x, entity.u.y) > EPSILON && Math.hypot(entity.v.x, entity.v.y) > EPSILON;
  if (entity.type === "ellipse") return entity.radiusX > EPSILON && entity.radiusY > EPSILON;
  return entity.radius > EPSILON;
}
function entityLabel(type: SketchEntity["type"]) { return ({ line: "Line", polyline: "Polyline", rectangle: "Rectangle", circle: "Circle", arc: "Arc", ellipse: "Ellipse", polygon: "Polygon" })[type]; }
function selectionCenter(entities: SketchEntity[]) { const points = entities.map(entityCenter); return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }; }
function validView(value: unknown): value is ViewState { if (!value || typeof value !== "object") return false; const view = value as Partial<ViewState>; return typeof view.zoom === "number" && view.zoom > 0 && !!view.pan && typeof view.pan.x === "number" && typeof view.pan.y === "number"; }
function toolInstruction(tool: EditorTool) { return ({ line: "Line: click the start point, then the end point", polyline: "Polyline: click points, then Enter or right-click to finish", rectangle: "Rectangle: click two opposite corners", rectangle3: "3-point rectangle: click edge endpoints, then the height", polygon: "Polygon: click center, then a vertex", circle: "Circle: click center, then a radius point", arc3: "3-point arc: click start, through-point, then end", arcCenter: "Center arc: click center, start, then end", ellipse: "Ellipse: click center, major radius, then minor radius", move: "Move: drag selected geometry", dimGeneral: "General dimension: click a supported entity", dimHorizontal: "Horizontal dimension: click a line or rectangle", dimVertical: "Vertical dimension: click a line or rectangle", dimLength: "Length dimension: click a line or rectangle", dimRadius: "Radius dimension: click a circle or arc", dimDiameter: "Diameter dimension: click a circle or arc", dimAngle: "Angle: Ctrl-select two lines, then click either line", dimMove: "Move dimension: drag a dimension label", select: "Select geometry", pan: "Pan view" } as Record<EditorTool, string>)[tool]; }
