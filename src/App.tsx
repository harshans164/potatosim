import { useCallback, useEffect, useRef, useState } from "react";
import "./App.css";
import { ContextMenu, type ContextAction } from "./components/ContextMenu";
import { MenuBar, type AppAction } from "./components/MenuBar";
import { ProjectSchematic } from "./components/ProjectSchematic";
import { StatusBar } from "./components/StatusBar";
import { Toolbar, type ToolbarAction } from "./components/Toolbar";
import { Toolbox } from "./components/Toolbox";
import { Icon } from "./components/Icon";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { isTauri } from "@tauri-apps/api/core";
import type { CanvasBlock, ComponentMetadata, ContextMenuState, ProjectFile } from "./types/workbench";
import { toolboxGroups } from "./components/Toolbox";

const STORAGE_KEY = "simwhere.project.v1";
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `block-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function App() {
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Untitled Project");
  const [status, setStatus] = useState("Ready");
  const [zoom, setZoom] = useState(1);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [propertiesId, setPropertiesId] = useState<string | null>(null);
  const [pointerDrag, setPointerDrag] = useState<{ item: ComponentMetadata; x: number; y: number } | null>(null);
  const [notesEditorId, setNotesEditorId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [geometryImportId, setGeometryImportId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const geometryFileInputRef = useRef<HTMLInputElement>(null);
  const statusTimer = useRef<number | undefined>(undefined);

  const notify = useCallback((message: string) => {
    window.clearTimeout(statusTimer.current); setStatus(message);
    statusTimer.current = window.setTimeout(() => setStatus("Ready"), 3200);
  }, []);
  useEffect(() => () => window.clearTimeout(statusTimer.current), []);

  useEffect(() => {
    if (!pointerDrag) return;
    const move = (event: PointerEvent) => {
      event.preventDefault();
      setPointerDrag(current => current ? { ...current, x: event.clientX, y: event.clientY } : null);
    };
    const finish = (event: PointerEvent) => {
      const current = pointerDrag;
      setPointerDrag(null);
      document.body.classList.remove("toolbox-dragging");
      window.dispatchEvent(new CustomEvent("simwhere-pointer-drop", { detail: { item: current.item, x: event.clientX, y: event.clientY } }));
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setPointerDrag(null); document.body.classList.remove("toolbox-dragging"); }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("pointercancel", finish, { once: true });
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("keydown", cancel);
    };
  }, [pointerDrag?.item]);

  const startToolboxDrag = (item: ComponentMetadata, x: number, y: number) => {
    document.body.classList.add("toolbox-dragging");
    setPointerDrag({ item, x, y });
  };

  const newProject = useCallback(() => {
    setBlocks([]); setSelectedId(null); setProjectName("Untitled Project"); setZoom(1); setContextMenu(null); notify("New project created");
  }, [notify]);
  const saveProject = useCallback(() => {
    const data: ProjectFile = { version: 1, name: projectName, blocks };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${projectName.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase() || "project"}.simwhere.json`; anchor.click();
    URL.revokeObjectURL(url); notify("Project saved to JSON");
  }, [blocks, projectName, notify]);
  const openProject = useCallback(() => fileInputRef.current?.click(), []);
  const resetLayout = useCallback(() => { setZoom(1); setSelectedId(null); notify("Layout reset"); }, [notify]);

  const handleMenuAction = (action: AppAction, label?: string) => {
    if (action === "new") newProject(); else if (action === "open") openProject(); else if (action === "save") saveProject(); else if (action === "reset") resetLayout();
    else if (action === "about") notify("Simwhere Workbench 0.1.0"); else notify(`${label ?? "This feature"} will be available in a future release`);
  };
  const handleToolbar = (action: ToolbarAction) => {
    if (action === "new" || action === "open" || action === "save") handleMenuAction(action);
    else if (action === "refresh") notify("Project view refreshed");
    else notify(action === "update" ? "Solver updates are not available yet" : "Import tools will be available in a future release");
  };

  const addBlock = (item: ComponentMetadata, x: number, y: number) => {
    const id = makeId();
    setBlocks(current => {
      const sameType = current.filter(block => block.type === item.type);
      const instanceNumber = item.kind === "component" ? Math.max(0, ...sameType.map((block, index) => block.instanceNumber ?? index + 1)) + 1 : undefined;
      const systemIndex = Math.max(0, ...current.map((block, index) => block.systemIndex ?? index + 1)) + 1;
      const block: CanvasBlock = { ...item, id, x, y, instanceNumber, systemIndex };
      return [...current, block];
    });
    setSelectedId(id); notify(`${item.name} added to the schematic`);
  };
  const moveBlock = useCallback((id: string, x: number, y: number) => setBlocks(current => current.map(block => block.id === id ? { ...block, x, y } : block)), []);
  const deleteBlock = useCallback((id: string) => {
    setBlocks(current => current.filter(block => block.id !== id)); setSelectedId(current => current === id ? null : current); setPropertiesId(null); notify("Component removed");
  }, [notify]);

  const openGeometryWindow = async (id: string) => {
    if (!isTauri()) { window.open(`${window.location.pathname}#/geometry`, "_blank", "width=900,height=650"); return; }
    const label = `geometry-${id}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) { await existing.setFocus(); return; }
    const geometryWindow = new WebviewWindow(label, { title: "Geometry", url: "index.html#/geometry", width: 900, height: 650, minWidth: 520, minHeight: 360, center: true });
    geometryWindow.once("tauri://created", () => notify("Geometry window opened"));
    geometryWindow.once("tauri://error", () => notify("Could not open the Geometry window"));
  };

  const openMeshWindow = async (id: string) => {
    if (!isTauri()) { window.open(`${window.location.pathname}#/mesh`, "_blank", "width=900,height=650"); return; }
    const label = `mesh-${id}`;
    const existing = await WebviewWindow.getByLabel(label);
    if (existing) { await existing.setFocus(); return; }
    const meshWindow = new WebviewWindow(label, { title: "Mesh", url: "index.html#/mesh", width: 900, height: 650, minWidth: 520, minHeight: 360, center: true });
    meshWindow.once("tauri://created", () => notify("Mesh window opened"));
    meshWindow.once("tauri://error", () => notify("Could not open the Mesh window"));
  };

  const contextAction = async (action: ContextAction, id: string) => {
    setContextMenu(null); const block = blocks.find(candidate => candidate.id === id); if (!block) return;
    if (action === "newGeometry") await openGeometryWindow(id);
    else if (action === "editMesh") await openMeshWindow(id);
    else if (action === "importGeometry") { setGeometryImportId(id); geometryFileInputRef.current?.click(); }
    else if (action === "delete") deleteBlock(id);
    else if (action === "duplicate") {
      const sameType = blocks.filter(candidate => candidate.type === block.type);
      const nextInstance = block.kind === "component" ? Math.max(0, ...sameType.map((candidate, index) => candidate.instanceNumber ?? index + 1)) + 1 : undefined;
      const nextSystem = Math.max(0, ...blocks.map((candidate, index) => candidate.systemIndex ?? index + 1)) + 1;
      const duplicate = { ...block, id: makeId(), name: block.kind === "component" ? block.name : `${block.name} Copy`, instanceNumber: nextInstance, systemIndex: nextSystem, x: block.x + 28, y: block.y + 28 };
      setBlocks(current => [...current, duplicate]); setSelectedId(duplicate.id); notify(`${block.name} duplicated`);
    } else if (action === "rename") {
      if (block.type === "geometry") {
        const currentName = block.stages?.[0] ?? "Geometry";
        const name = window.prompt("Rename the Geometry row:", currentName)?.trim();
        if (name) { setBlocks(current => current.map(candidate => candidate.id === id ? { ...candidate, stages: [name, ...(candidate.stages?.slice(1) ?? [])] } : candidate)); notify(`Geometry row renamed to ${name}`); }
      } else if (block.type === "mesh") {
        const currentName = block.stages?.[1] ?? "Mesh";
        const name = window.prompt("Rename the Mesh row:", currentName)?.trim();
        if (name) { setBlocks(current => current.map(candidate => candidate.id === id ? { ...candidate, stages: [candidate.stages?.[0] ?? "Geometry", name, ...(candidate.stages?.slice(2) ?? [])] } : candidate)); notify(`Mesh row renamed to ${name}`); }
      } else {
        const name = window.prompt("Enter a new component name:", block.name)?.trim();
        if (name) { setBlocks(current => current.map(candidate => candidate.id === id ? { ...candidate, name } : candidate)); notify(`Renamed to ${name}`); }
      }
    } else if (action === "reset") {
      if (!window.confirm(`Reset this ${block.name} widget? Renamed rows and notes will be removed. This operation cannot be undone.`)) return;
      const original = toolboxGroups.flatMap(group => group.items).find(item => item.type === block.type);
      if (original) setBlocks(current => current.map(candidate => candidate.id === id ? { ...candidate, ...original, notes: undefined } : candidate));
      notify(`${block.name} widget reset to its original state`);
    } else if (action === "notes") {
      setNotesEditorId(id); setNotesDraft(block.notes ?? "");
    } else if (action === "update") {
      notify(`${block.name} update is not available yet`);
    } else if (action === "properties") setPropertiesId(id);
    else notify(`${block.name} editor will be implemented later`);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "Delete" && selectedId) deleteBlock(selectedId);
      if (event.ctrlKey && event.key.toLowerCase() === "s") { event.preventDefault(); saveProject(); }
      if (event.ctrlKey && event.key.toLowerCase() === "n") { event.preventDefault(); newProject(); }
      if (event.ctrlKey && event.key.toLowerCase() === "o") { event.preventDefault(); openProject(); }
    };
    window.addEventListener("keydown", keydown); return () => window.removeEventListener("keydown", keydown);
  }, [selectedId, deleteBlock, saveProject, newProject, openProject]);

  const importProject = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as ProjectFile;
      if (data.version !== 1 || !Array.isArray(data.blocks) || typeof data.name !== "string") throw new Error("Invalid format");
      setBlocks(data.blocks); setProjectName(data.name); setSelectedId(null); setZoom(1); notify(`Opened ${data.name}`);
    } catch { notify("Could not open project: invalid project file"); }
  };

  const geometryImportSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (file) notify(`${file.name} selected for Geometry import`);
    setGeometryImportId(null);
  };

  const saveNotes = () => {
    if (!notesEditorId) return;
    const notes = notesDraft.trim().slice(0, 250);
    const blockName = blocks.find(block => block.id === notesEditorId)?.name ?? "Component";
    setBlocks(current => current.map(block => block.id === notesEditorId ? { ...block, notes: notes || undefined } : block));
    setNotesEditorId(null); notify(notes ? `${blockName} note saved` : `${blockName} note removed`);
  };

  const selected = blocks.find(block => block.id === selectedId);
  const properties = blocks.find(block => block.id === propertiesId);
  const contextBlock = blocks.find(block => block.id === contextMenu?.blockId);
  const notesBlock = blocks.find(block => block.id === notesEditorId);
  const contextVariant = contextBlock?.type === "geometry" ? "geometry" : contextBlock?.type === "mesh" && contextMenu?.rowIndex === 2 ? "mesh" : "default";
  return <div className="app-shell">
    <MenuBar onAction={handleMenuAction}/><Toolbar onAction={handleToolbar}/>
    <div className="workbench"><Toolbox onPointerDragStart={startToolboxDrag}/><ProjectSchematic blocks={blocks} selectedId={selectedId} zoom={zoom} onZoom={setZoom} onAdd={addBlock} onMove={moveBlock} onSelect={setSelectedId} onContextMenu={setContextMenu} pointerDrag={pointerDrag}/></div>
    <StatusBar projectName={projectName} selectedName={selected?.name} status={status}/>
    {contextMenu && <ContextMenu menu={contextMenu} variant={contextVariant} onAction={contextAction} onClose={() => setContextMenu(null)}/>}
    {properties && <div className="dialog-backdrop" onPointerDown={() => setPropertiesId(null)}><section className="properties-dialog" onPointerDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Component properties">
      <header><span>Properties — {properties.name}</span><button onClick={() => setPropertiesId(null)} aria-label="Close"><Icon name="close" size={15}/></button></header>
      <div className="property-grid"><span>Name</span><strong>{properties.name}</strong><span>System type</span><strong>{properties.kind === "analysis" ? "Analysis System" : "Component System"}</strong><span>Identifier</span><code>{properties.id}</code><span>Position</span><strong>{Math.round(properties.x)}, {Math.round(properties.y)}</strong></div>
      <p>Additional editable simulation properties will be introduced with the relevant editor.</p><footer><button onClick={() => setPropertiesId(null)}>Close</button></footer>
    </section></div>}
    {notesEditorId && <div className="dialog-backdrop" onPointerDown={() => setNotesEditorId(null)}><section className="notes-dialog" onPointerDown={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${notesBlock?.name ?? "Component"} notes`}>
      <header><span>Add notes</span><button onClick={() => setNotesEditorId(null)} aria-label="Close"><Icon name="close" size={15}/></button></header>
      <label htmlFor="component-notes">{notesBlock?.name ?? "Component"} note</label>
      <textarea id="component-notes" autoFocus maxLength={250} value={notesDraft} onChange={event => setNotesDraft(event.target.value)} placeholder={`Enter a note for this ${notesBlock?.name ?? "component"} widget…`}/>
      <div className="notes-count">{notesDraft.length}/250</div>
      <footer><button onClick={() => setNotesEditorId(null)}>Cancel</button><button className="primary-action" onClick={saveNotes}>Save</button></footer>
    </section></div>}
    <input ref={fileInputRef} className="hidden-file-input" type="file" accept=".json,.simwhere" onChange={importProject}/>
    <input ref={geometryFileInputRef} className="hidden-file-input" type="file" accept=".step,.stp,.iges,.igs,.x_t,.x_b,.sat,.obj,.stl" onChange={geometryImportSelected} data-block-id={geometryImportId ?? undefined}/>
    {pointerDrag && <div className="pointer-drag-ghost" style={{ transform: `translate3d(${pointerDrag.x + 12}px, ${pointerDrag.y + 10}px, 0)` }}>
      <span style={{ background: pointerDrag.item.color }}><Icon name={pointerDrag.item.icon} size={15}/></span><strong>{pointerDrag.item.name}</strong>
    </div>}
  </div>;
}

export default App;
