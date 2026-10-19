import { useEffect, useRef } from "react";
import type { ContextMenuState } from "../types/workbench";

export type ContextAction = "open" | "rename" | "duplicate" | "delete" | "properties" | "newGeometry" | "importGeometry" | "editMesh" | "update" | "reset" | "notes";
export type ContextMenuVariant = "default" | "geometry" | "mesh";

const defaultItems: { action: ContextAction; label: string; divider?: boolean }[] = [
  { action: "open", label: "Open" }, { action: "rename", label: "Rename" }, { action: "duplicate", label: "Duplicate" },
  { action: "delete", label: "Delete", divider: true }, { action: "properties", label: "Properties" },
];
const geometryItems: { action: ContextAction; label: string; divider?: boolean }[] = [
  { action: "newGeometry", label: "New Design Geometry" }, { action: "importGeometry", label: "Import Geometry" },
  { action: "duplicate", label: "Duplicate", divider: true }, { action: "update", label: "Update" },
  { action: "rename", label: "Rename" }, { action: "reset", label: "Reset", divider: true }, { action: "notes", label: "Add notes" },
];
const meshItems: { action: ContextAction; label: string; divider?: boolean }[] = [
  { action: "editMesh", label: "Edit" }, { action: "duplicate", label: "Duplicate" },
  { action: "update", label: "Update", divider: true }, { action: "rename", label: "Rename" },
  { action: "reset", label: "Reset", divider: true }, { action: "notes", label: "Add notes" },
];

export function ContextMenu({ menu, variant, onAction, onClose }: { menu: ContextMenuState; variant: ContextMenuVariant; onAction: (action: ContextAction, id: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) onClose(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [onClose]);
  const items = variant === "geometry" ? geometryItems : variant === "mesh" ? meshItems : defaultItems;
  return <div className="context-menu" ref={ref} style={{ left: menu.x, top: menu.y }} role="menu">
    {items.map(item => <button key={item.action} className={`context-item ${item.divider ? "divider" : ""} ${item.action === "delete" ? "danger" : ""}`} onClick={() => onAction(item.action, menu.blockId)}>
      {item.label}{item.action === "delete" && <span className="shortcut">Del</span>}
    </button>)}
  </div>;
}
