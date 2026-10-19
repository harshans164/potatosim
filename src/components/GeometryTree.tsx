import type { GeometryFeature } from "../types/geometry";

interface Props {
  features: GeometryFeature[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onVisibility: (id: string) => void;
  onChange: (id: string, changes: Partial<GeometryFeature>) => void;
}

const featureGlyph: Record<GeometryFeature["type"], string> = { plane: "▱", sketch: "✎", box: "⬡", cylinder: "◉", sphere: "●", extrude: "▰", boolean: "◒", step: "S" };

export function GeometryTree({ features, selectedId, onSelect, onVisibility, onChange }: Props) {
  const selected = features.find(feature => feature.id === selectedId);
  const planes = features.filter(feature => feature.type === "plane");
  const children = features.filter(feature => feature.type !== "plane");
  return <aside className="geometry-sidebar">
    <section className="geometry-tree-panel">
      <div className="geometry-panel-title"><span>Tree Outline</span><span>▾</span></div>
      <div className="tree-toolbar"><button title="Expand all">＋</button><button title="Collapse all">−</button><button title="Tree options">⚙</button></div>
      <div className="model-tree">
        <div className="tree-node root"><span className="tree-arrow">▾</span><span className="tree-model-icon">M</span><strong>Model</strong></div>
        <div className="tree-node branch"><span className="tree-arrow">▾</span><span className="tree-folder">▰</span><span>Planes</span></div>
        {planes.map(feature => <TreeItem key={feature.id} feature={feature} selected={selectedId === feature.id} depth={2} onSelect={onSelect} onVisibility={onVisibility}/>)}
        <div className="tree-node branch"><span className="tree-arrow">▾</span><span className="tree-folder bodies">▰</span><span>Geometry</span></div>
        {children.length === 0 && <div className="tree-empty">No features</div>}
        {children.map(feature => <TreeItem key={feature.id} feature={feature} selected={selectedId === feature.id} depth={2} onSelect={onSelect} onVisibility={onVisibility}/>)}
      </div>
    </section>
    <section className="geometry-details-panel">
      <div className="geometry-panel-title"><span>Details View</span><span>{selected ? featureGlyph[selected.type] : ""}</span></div>
      {selected ? <div className="details-content">
        <div className="details-section">Definition</div>
        <label><span>Name</span><input value={selected.name} onChange={event => onChange(selected.id, { name: event.target.value })}/></label>
        <label><span>Type</span><output>{selected.type.charAt(0).toUpperCase() + selected.type.slice(1)}</output></label>
        <label><span>Suppressed</span><output>{selected.visible ? "No" : "Yes"}</output></label>
        {Object.entries(selected.params).map(([name, value]) => <label key={name}><span>{formatLabel(name)}</span><input type="number" min="0.1" step="1" value={value} onChange={event => onChange(selected.id, { params: { ...selected.params, [name]: Math.max(.1, Number(event.target.value)) } })}/></label>)}
        {selected.type === "sketch" && <label><span>Entities</span><output>{selected.entities?.length ?? 0}</output></label>}
        {selected.type === "sketch" && <label><span>Constraints</span><output>{selected.constraints?.length ?? 0}</output></label>}
        {selected.type === "boolean" && <label><span>Operation</span><output>{selected.operation}</output></label>}
        <div className="details-section">Information</div>
        <label><span>Status</span><output className={selected.generated ? "generated" : "pending"}>{selected.generated ? "Generated" : "Requires Generate"}</output></label>
      </div> : <div className="details-empty">Select an item to inspect its properties.</div>}
    </section>
  </aside>;
}

function TreeItem({ feature, selected, depth, onSelect, onVisibility }: { feature: GeometryFeature; selected: boolean; depth: number; onSelect: (id: string) => void; onVisibility: (id: string) => void }) {
  return <div className={`tree-node item ${selected ? "selected" : ""}`} style={{ paddingLeft: depth * 14 + 4 }} onClick={() => onSelect(feature.id)}>
    <button className={`visibility ${feature.visible ? "visible" : ""}`} title={feature.visible ? "Hide" : "Show"} onClick={event => { event.stopPropagation(); onVisibility(feature.id); }}>{feature.visible ? "◉" : "○"}</button>
    <span className={`feature-glyph ${feature.type}`}>{featureGlyph[feature.type]}</span><span className="tree-label">{feature.name}</span>
    <span className={feature.generated ? "tree-state ok" : "tree-state pending"}>{feature.generated ? "✓" : "⚡"}</span>
  </div>;
}

function formatLabel(value: string) { return value.charAt(0).toUpperCase() + value.slice(1).replace(/[A-Z]/g, letter => ` ${letter}`); }
