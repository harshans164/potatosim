import { useEffect, useRef, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import "./geometry.css";
import { GeometryTree } from "./components/GeometryTree";
import { GeometryViewport } from "./components/GeometryViewport";
import type { ConstraintType, GeometryFeature, GeometryProject, GeometryView, KernelMesh, KernelResult, KernelTopology, SketchEntity, SketchTool } from "./types/geometry";

const uid = () => globalThis.crypto?.randomUUID?.() ?? `feature-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const initialFeatures = (): GeometryFeature[] => [
  { id: "xy-plane", name: "XYPlane", type: "plane", visible: true, generated: true, params: {} },
  { id: "yz-plane", name: "YZPlane", type: "plane", visible: false, generated: true, params: {} },
  { id: "zx-plane", name: "ZXPlane", type: "plane", visible: false, generated: true, params: {} },
];
const solidTypes = new Set<GeometryFeature["type"]>(["box", "cylinder", "sphere", "extrude", "boolean", "step"]);

export default function GeometryWindow() {
  const [features, setFeatures] = useState<GeometryFeature[]>(initialFeatures);
  const [selectedId, setSelectedId] = useState<string | null>("xy-plane");
  const [tool, setTool] = useState<SketchTool>("select");
  const [view, setView] = useState<GeometryView>("isometric");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [status, setStatus] = useState("Ready");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [kernelMesh, setKernelMesh] = useState<KernelMesh | null>(null);
  const [topology, setTopology] = useState<KernelTopology | null>(null);
  const [busy, setBusy] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [booleanDialog, setBooleanDialog] = useState(false);
  const [booleanForm, setBooleanForm] = useState({ left: "", right: "", operation: "union" as "union" | "subtract" | "intersect" });
  const projectInput = useRef<HTMLInputElement>(null);
  const stepInput = useRef<HTMLInputElement>(null);

  const selected = features.find(feature => feature.id === selectedId);
  const solids = features.filter(feature => solidTypes.has(feature.type));
  const notify = (message: string) => { setStatus(message); window.setTimeout(() => setStatus("Ready"), 3200); };
  const invalidate = () => { setKernelMesh(null); setTopology(null); };
  const resetModel = () => { setFeatures(initialFeatures()); setSelectedId("xy-plane"); setKernelMesh(null); setTopology(null); setActiveMenu(null); };

  const addFeature = (type: "box" | "cylinder" | "sphere" | "sketch") => {
    const count = features.filter(feature => feature.type === type).length + 1;
    const offset = (count - 1) * 45;
    const defaults: Record<string, Record<string, number>> = {
      box: { width: 70, height: 55, depth: 35, x: offset, y: 0, z: 0 },
      cylinder: { radius: 30, height: 65, x: offset, y: 0, z: 0 },
      sphere: { radius: 38, x: offset, y: 0, z: 0 }, sketch: {},
    };
    const names = { box: "Box", cylinder: "Cylinder", sphere: "Sphere", sketch: "Sketch" };
    const id = uid();
    const feature: GeometryFeature = { id, name: `${names[type]}${count}`, type, visible: true, generated: false, params: defaults[type], parentId: selected?.type === "plane" ? selected.id : undefined, entities: type === "sketch" ? [] : undefined, constraints: type === "sketch" ? [] : undefined };
    setFeatures(current => [...current, feature]); setSelectedId(id); setActiveMenu(null); invalidate(); notify(`${feature.name} inserted - click Generate to evaluate the B-rep`);
  };
  const newSketch = () => { addFeature("sketch"); setTool("line"); };
  const extrude = () => {
    if (selected?.type !== "sketch" || !selected.entities?.some(entity => entity.type !== "line")) { notify("Select a sketch with a closed rectangle or circle"); return; }
    const feature: GeometryFeature = { id: uid(), name: `Extrude${features.filter(item => item.type === "extrude").length + 1}`, type: "extrude", parentId: selected.id, visible: true, generated: false, params: { depth: 30 } };
    setFeatures(current => [...current, feature]); setSelectedId(feature.id); setTool("select"); invalidate(); notify("Extrude inserted - click Generate");
  };

  const evaluate = async (action: "evaluate" | "export_step" = "evaluate") => {
    if (!isTauri()) { notify("The OpenCascade kernel is available in the Tauri application"); return null; }
    setBusy(true); setStatus(action === "export_step" ? "Writing STEP model..." : "Evaluating exact geometry...");
    try {
      const result = await invoke<KernelResult>("geometry_kernel", { request: { action, features, tolerance: 0.15 } });
      if (!result.ok) throw new Error(result.error || "Geometry evaluation failed");
      if (result.mesh) setKernelMesh(result.mesh);
      if (result.topology) setTopology(result.topology);
      setFeatures(current => current.map(feature => ({ ...feature, generated: true })));
      notify(result.topology?.valid ? "OpenCascade model generated and validated" : "Model generated with topology errors");
      return result;
    } catch (error) { notify(error instanceof Error ? error.message : String(error)); return null; }
    finally { setBusy(false); }
  };
  const validateTopology = async () => { const result = await evaluate(); if (result?.topology) setShowValidation(true); };
  const exportStep = async () => {
    const result = await evaluate("export_step"); if (!result?.step) return;
    const url = URL.createObjectURL(new Blob([result.step], { type: "model/step" })); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "simwhere-geometry.step"; anchor.click(); URL.revokeObjectURL(url); notify("STEP model exported");
  };
  const importStep = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    const feature: GeometryFeature = { id: uid(), name: file.name.replace(/\.(step|stp)$/i, ""), type: "step", visible: true, generated: false, params: {}, stepData: await file.text() };
    setFeatures(current => [...current, feature]); setSelectedId(feature.id); invalidate(); notify(`${file.name} loaded - click Generate to process STEP topology`);
  };

  const updateFeature = (id: string, changes: Partial<GeometryFeature>) => { setFeatures(current => current.map(feature => feature.id === id ? { ...feature, ...changes, generated: changes.name !== undefined ? feature.generated : false } : feature)); invalidate(); };
  const addEntity = (featureId: string, entity: SketchEntity) => { setFeatures(current => current.map(feature => feature.id === featureId ? { ...feature, entities: [...(feature.entities ?? []), entity], generated: false } : feature)); invalidate(); };
  const applyConstraint = (type: ConstraintType) => {
    if (selected?.type !== "sketch" || !selected.entities?.length) { notify("Select a sketch containing at least one entity"); return; }
    const entities = selected.entities.map(entity => ({ ...entity })); const last = entities[entities.length - 1]; const previous = entities.length > 1 ? entities[entities.length - 2] : undefined;
    let value: number | undefined;
    if (type === "horizontal" && last.type === "line") last.y2 = last.y1;
    else if (type === "vertical" && last.type === "line") last.x2 = last.x1;
    else if (type === "coincident" && previous) { last.x1 = previous.x2; last.y1 = previous.y2; }
    else if (type === "equal" && previous && last.type === "line" && previous.type === "line") {
      const length = Math.hypot(previous.x2 - previous.x1, previous.y2 - previous.y1), angle = Math.atan2(last.y2 - last.y1, last.x2 - last.x1); last.x2 = last.x1 + Math.cos(angle) * length; last.y2 = last.y1 + Math.sin(angle) * length;
    } else if (type === "dimension") {
      const current = last.type === "circle" ? Math.hypot(last.x2 - last.x1, last.y2 - last.y1) : Math.hypot(last.x2 - last.x1, last.y2 - last.y1);
      const entered = window.prompt("Enter the exact dimension in millimetres:", current.toFixed(3)); if (!entered) return; value = Number(entered); if (!Number.isFinite(value) || value <= 0) { notify("Dimension must be a positive number"); return; }
      const angle = Math.atan2(last.y2 - last.y1, last.x2 - last.x1); last.x2 = last.x1 + Math.cos(angle) * value; last.y2 = last.y1 + Math.sin(angle) * value;
    } else { notify(`${type} is not applicable to the last sketch entity`); return; }
    const entityIds = previous && (type === "coincident" || type === "equal") ? [previous.id, last.id] : [last.id];
    const constraint = { id: uid(), type, entityIds, value };
    setFeatures(current => current.map(feature => feature.id === selected.id ? { ...feature, entities, constraints: [...(feature.constraints ?? []), constraint], generated: false } : feature)); invalidate(); notify(`${type} constraint applied exactly`);
  };
  const createBoolean = () => {
    if (!booleanForm.left || !booleanForm.right || booleanForm.left === booleanForm.right) { notify("Choose two different solids"); return; }
    const feature: GeometryFeature = { id: uid(), name: `Boolean${features.filter(item => item.type === "boolean").length + 1}`, type: "boolean", visible: true, generated: false, params: {}, sourceIds: [booleanForm.left, booleanForm.right], operation: booleanForm.operation };
    setFeatures(current => [...current.map(item => booleanForm.left === item.id || booleanForm.right === item.id ? { ...item, visible: false } : item), feature]);
    setSelectedId(feature.id); setBooleanDialog(false); invalidate(); notify(`${booleanForm.operation} operation inserted - click Generate`);
  };
  const openBooleanDialog = () => { setBooleanForm({ left: solids[0]?.id ?? "", right: solids[1]?.id ?? "", operation: "union" }); setBooleanDialog(true); };
  const deleteSelected = () => {
    if (!selected || selected.type === "plane") { notify("Datum planes cannot be deleted"); return; }
    setFeatures(current => current.filter(feature => feature.id !== selected.id && feature.parentId !== selected.id && !feature.sourceIds?.includes(selected.id))); setSelectedId("xy-plane"); invalidate(); notify(`${selected.name} deleted`);
  };
  const save = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, features } satisfies GeometryProject, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "geometry-model.clgeo.json"; anchor.click(); URL.revokeObjectURL(url); notify("Geometry model saved");
  };
  const open = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try { const data = JSON.parse(await file.text()) as GeometryProject; if (data.version !== 1 || !Array.isArray(data.features)) throw new Error(); setFeatures(data.features); setSelectedId(null); invalidate(); notify("Geometry model opened"); }
    catch { notify("The selected file is not a valid Geometry model"); }
  };
  useEffect(() => {
    document.title = "Geometry";
    const keydown = (event: KeyboardEvent) => { if (event.key === "Delete" && !(event.target as HTMLElement).matches("input, textarea")) deleteSelected(); if (event.key === "Escape") { setTool("select"); setActiveMenu(null); setBooleanDialog(false); } };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  });

  return <div className="geometry-app">
    <header className="geometry-menubar"><div className="geometry-appmark">CL</div>{["File", "Edit", "View", "Create", "Concept", "Tools", "Help"].map(label => <div className="geometry-menu-root" key={label}>
      <button className={activeMenu === label ? "active" : ""} onClick={() => setActiveMenu(activeMenu === label ? null : label)}>{label}</button>
      {activeMenu === label && <GeometryMenu label={label} onNew={resetModel} onOpen={() => projectInput.current?.click()} onSave={save} onCreate={addFeature} onSketch={newSketch} onView={setView} onNotify={notify}/>} 
    </div>)}<span className="geometry-title">Geometry - OpenCascade</span></header>
    <div className="geometry-main-toolbar">
      <ToolbarButton icon="N" label="New" onClick={resetModel}/><ToolbarButton icon="O" label="Open" onClick={() => projectInput.current?.click()}/><ToolbarButton icon="S" label="Save" onClick={save}/><ToolbarButton icon="IN" label="STEP In" onClick={() => stepInput.current?.click()}/><ToolbarButton icon="OUT" label="STEP Out" onClick={exportStep}/><span className="toolbar-rule"/>
      <ToolbarButton icon="+" label="Select" active={tool === "select"} onClick={() => setTool("select")}/><ToolbarButton icon="P" label="Pan" active={tool === "pan"} onClick={() => setTool("pan")}/><ToolbarButton icon="F" label="Fit" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}/><span className="toolbar-rule"/>
      <ToolbarButton icon="SK" label="New Sketch" onClick={newSketch}/><ToolbarButton icon="EX" label="Extrude" onClick={extrude}/><ToolbarButton icon="A-B" label="Boolean" onClick={openBooleanDialog}/><ToolbarButton icon="OK" label="Validate" onClick={validateTopology}/><span className="toolbar-fill"/><button className="generate-button" disabled={busy} onClick={() => void evaluate()}><span>{busy ? "..." : "*"}</span> {busy ? "Evaluating" : "Generate"}</button>
    </div>
    <div className="geometry-context-toolbar">
      <span className="toolbar-section-label">Sketching</span>
      <ToolbarButton icon="/" label="Line" active={tool === "line"} onClick={() => setTool("line")}/><ToolbarButton icon="[]" label="Rectangle" active={tool === "rectangle"} onClick={() => setTool("rectangle")}/><ToolbarButton icon="O" label="Circle" active={tool === "circle"} onClick={() => setTool("circle")}/><span className="toolbar-rule"/>
      <span className="toolbar-section-label">Constraints</span><ToolbarButton icon="H" label="Horizontal" onClick={() => applyConstraint("horizontal")}/><ToolbarButton icon="V" label="Vertical" onClick={() => applyConstraint("vertical")}/><ToolbarButton icon="C" label="Coincident" onClick={() => applyConstraint("coincident")}/><ToolbarButton icon="=" label="Equal" onClick={() => applyConstraint("equal")}/><ToolbarButton icon="D" label="Dimension" onClick={() => applyConstraint("dimension")}/><span className="toolbar-rule"/>
      <span className="toolbar-section-label">Create</span><ToolbarButton icon="B" label="Box" onClick={() => addFeature("box")}/><ToolbarButton icon="CY" label="Cylinder" onClick={() => addFeature("cylinder")}/><ToolbarButton icon="SP" label="Sphere" onClick={() => addFeature("sphere")}/><span className="toolbar-rule"/>
      <span className="toolbar-section-label">View</span>{(["isometric", "front", "top", "right"] as GeometryView[]).map(item => <button className={`compact-tool ${view === item ? "active" : ""}`} key={item} onClick={() => setView(item)}>{item === "isometric" ? "ISO" : item.slice(0, 1).toUpperCase()}</button>)}
    </div>
    <div className="geometry-workspace">
      <GeometryTree features={features} selectedId={selectedId} onSelect={setSelectedId} onVisibility={id => { setFeatures(current => current.map(feature => feature.id === id ? { ...feature, visible: !feature.visible } : feature)); invalidate(); }} onChange={updateFeature}/>
      <GeometryViewport features={features} selectedId={selectedId} tool={tool} view={view} zoom={zoom} pan={pan} kernelMesh={kernelMesh} onSelect={setSelectedId} onEntity={addEntity} onZoom={setZoom} onPan={setPan} onView={setView}/>
    </div>
    <footer className="geometry-status"><span>Geometry</span><span className="geometry-status-main"><i className={status === "Ready" ? "ready" : "working"}/>{status}</span>{topology && <span className={topology.valid ? "topology-valid" : "topology-invalid"}>{topology.valid ? "Valid B-rep" : "Invalid B-rep"}</span>}<span>{view.charAt(0).toUpperCase() + view.slice(1)} View</span><span>{Math.round(zoom * 100)}%</span><span>SI Units (mm, kg, N, s)</span></footer>
    <input ref={projectInput} type="file" accept=".json,.clgeo" hidden onChange={open}/><input ref={stepInput} type="file" accept=".step,.stp" hidden onChange={importStep}/>
    {booleanDialog && <div className="geometry-modal-backdrop"><section className="geometry-modal"><header>Boolean Operation</header><label>Target body<select value={booleanForm.left} onChange={event => setBooleanForm(current => ({ ...current, left: event.target.value }))}>{solids.map(feature => <option value={feature.id} key={feature.id}>{feature.name}</option>)}</select></label><label>Tool body<select value={booleanForm.right} onChange={event => setBooleanForm(current => ({ ...current, right: event.target.value }))}>{solids.map(feature => <option value={feature.id} key={feature.id}>{feature.name}</option>)}</select></label><label>Operation<select value={booleanForm.operation} onChange={event => setBooleanForm(current => ({ ...current, operation: event.target.value as typeof current.operation }))}><option value="union">Union</option><option value="subtract">Subtract</option><option value="intersect">Intersect</option></select></label><footer><button onClick={() => setBooleanDialog(false)}>Cancel</button><button className="primary" onClick={createBoolean}>Insert</button></footer></section></div>}
    {showValidation && topology && <div className="geometry-modal-backdrop"><section className="geometry-modal validation"><header>Topology Validation</header><div className={`validation-banner ${topology.valid ? "valid" : "invalid"}`}>{topology.valid ? "Valid manifold B-rep" : "Topology errors detected"}</div><div className="topology-grid"><span>Solids</span><b>{topology.solids}</b><span>Shells</span><b>{topology.shells}</b><span>Faces</span><b>{topology.faces}</b><span>Edges</span><b>{topology.edges}</b><span>Vertices</span><b>{topology.vertices}</b><span>Volume</span><b>{topology.volume.toFixed(3)} mm3</b><span>Surface area</span><b>{topology.area.toFixed(3)} mm2</b></div><footer><button className="primary" onClick={() => setShowValidation(false)}>Close</button></footer></section></div>}
  </div>;
}

function ToolbarButton({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) { return <button className={`geometry-tool ${active ? "active" : ""}`} title={label} onClick={onClick}><span>{icon}</span><small>{label}</small></button>; }
function GeometryMenu({ label, onNew, onOpen, onSave, onCreate, onSketch, onView, onNotify }: { label: string; onNew: () => void; onOpen: () => void; onSave: () => void; onCreate: (type: "box" | "cylinder" | "sphere" | "sketch") => void; onSketch: () => void; onView: (view: GeometryView) => void; onNotify: (message: string) => void }) {
  const item = (text: string, action: () => void, shortcut = "") => <button onClick={action}><span>{text}</span><kbd>{shortcut}</kbd></button>;
  return <div className="geometry-dropdown">{label === "File" ? <>{item("New Model", onNew, "Ctrl+N")}{item("Open Geometry...", onOpen, "Ctrl+O")}{item("Save Geometry", onSave, "Ctrl+S")}</> : label === "Create" ? <>{item("New Sketch", onSketch)}{item("Box", () => onCreate("box"))}{item("Cylinder", () => onCreate("cylinder"))}{item("Sphere", () => onCreate("sphere"))}</> : label === "View" ? <>{item("Isometric", () => onView("isometric"))}{item("Front", () => onView("front"))}{item("Top", () => onView("top"))}{item("Right", () => onView("right"))}</> : <>{item(label === "Help" ? "Geometry Help" : `${label} Options...`, () => onNotify(`${label} tools will be expanded in a later version`))}</>}</div>;
}
