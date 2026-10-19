import { useState } from "react";
import { Icon } from "./Icon";
import type { ComponentMetadata, ToolboxGroupData } from "../types/workbench";

export const toolboxGroups: ToolboxGroupData[] = [
  { id: "analysis", label: "Analysis Systems", items: [
    { type: "fluid-flow", name: "Fluid Flow (CFD)", kind: "analysis", icon: "fluid", color: "#2c72a8", stages: ["Geometry", "Mesh", "Setup", "Solution", "Results"] },
    { type: "engine-flow", name: "Engine Flow Analysis", kind: "analysis", icon: "engine", color: "#467a9c", stages: ["Geometry", "Mesh", "Setup", "Solution", "Results"] },
    { type: "engine-combustion", name: "Engine Combustion", kind: "analysis", icon: "combustion", color: "#b35b2d", stages: ["Geometry", "Mesh", "Models", "Solution", "Results"] },
    { type: "custom-simulation", name: "Custom Simulation", kind: "analysis", icon: "custom", color: "#66569a", stages: ["Inputs", "Setup", "Run", "Results"] },
  ]},
  { id: "components", label: "Component Systems", items: [
    { type: "geometry", name: "Geometry", kind: "component", icon: "geometry", color: "#d6a91d", stages: ["Geometry"] },
    { type: "mesh", name: "Mesh", kind: "component", icon: "mesh", color: "#5b88b0", stages: ["Geometry", "Mesh"] },
    { type: "results", name: "Results", kind: "component", icon: "results", color: "#488151", stages: ["Results"] },
    { type: "python-solver", name: "Python Solver", kind: "component", icon: "python", color: "#b4862e", stages: ["Python Solver"] },
    { type: "cpp-solver", name: "C++ Solver", kind: "component", icon: "code", color: "#596d9b", stages: ["C++ Solver"] },
  ]},
];

export function Toolbox({ onPointerDragStart }: { onPointerDragStart: (item: ComponentMetadata, x: number, y: number) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  return <aside className="toolbox">
    <div className="panel-title"><span>Toolbox</span><span className="panel-grip">⋮</span></div>
    <div className="toolbox-filter"><input aria-label="Filter toolbox" placeholder="Filter components"/></div>
    <div className="toolbox-groups">
      {toolboxGroups.map(group => <section className="toolbox-group" key={group.id}>
        <button className="group-heading" onClick={() => setCollapsed(value => ({ ...value, [group.id]: !value[group.id] }))} aria-expanded={!collapsed[group.id]}>
          <span className={collapsed[group.id] ? "chevron collapsed" : "chevron"}>▾</span>{group.label}
        </button>
        {!collapsed[group.id] && <div className="group-items">
          {group.items.map(item => <div className="toolbox-item" onPointerDown={event => {
            if (event.button !== 0) return;
            event.preventDefault();
            onPointerDragStart(item, event.clientX, event.clientY);
          }} key={item.type} title={`Drag ${item.name} to the Project Schematic`}>
            <span className="item-icon" style={{ color: item.color }}><Icon name={item.icon}/></span><span>{item.name}</span>
          </div>)}
        </div>}
      </section>)}
    </div>
    <div className="toolbox-footer">Drag components to the schematic</div>
  </aside>;
}
