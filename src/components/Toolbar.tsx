import { Icon } from "./Icon";

export type ToolbarAction = "new" | "open" | "save" | "import" | "refresh" | "update";
const buttons: { action: ToolbarAction; label: string; icon: Parameters<typeof Icon>[0]["name"] }[] = [
  { action: "new", label: "New Project", icon: "new" }, { action: "open", label: "Open Project", icon: "open" }, { action: "save", label: "Save Project", icon: "save" },
  { action: "import", label: "Import", icon: "import" }, { action: "refresh", label: "Refresh Project", icon: "refresh" }, { action: "update", label: "Update Project", icon: "update" },
];

export function Toolbar({ onAction }: { onAction: (action: ToolbarAction) => void }) {
  return <div className="toolbar" aria-label="Project toolbar">
    {buttons.map((button, index) => <button key={button.action} className={index === 3 ? "tool-button separated" : "tool-button"} title={button.label} aria-label={button.label} onClick={() => onAction(button.action)}>
      <Icon name={button.icon} size={17}/><span>{button.label.replace(" Project", "")}</span>
    </button>)}
    <span className="toolbar-spacer"/><span className="mode-label">Workbench</span>
  </div>;
}
