import { useEffect, useRef, useState } from "react";

export type AppAction = "new" | "open" | "save" | "reset" | "about" | "placeholder";

const menus: { label: string; items: { label: string; action: AppAction; shortcut?: string; divider?: boolean }[] }[] = [
  { label: "File", items: [
    { label: "New Project", action: "new", shortcut: "Ctrl+N" },
    { label: "Open Project…", action: "open", shortcut: "Ctrl+O" },
    { label: "Save Project", action: "save", shortcut: "Ctrl+S" },
    { label: "Import Component…", action: "placeholder", divider: true },
  ]},
  { label: "Edit", items: [{ label: "Undo", action: "placeholder", shortcut: "Ctrl+Z" }, { label: "Preferences…", action: "placeholder", divider: true }] },
  { label: "View", items: [{ label: "Reset Layout", action: "reset" }, { label: "Fit Project", action: "reset" }] },
  { label: "Tools", items: [{ label: "Options…", action: "placeholder" }] },
  { label: "Units", items: [{ label: "Metric (SI)", action: "placeholder" }, { label: "US Customary", action: "placeholder" }] },
  { label: "Extensions", items: [{ label: "Manage Extensions…", action: "placeholder" }] },
  { label: "Help", items: [{ label: "Workbench Help", action: "placeholder" }, { label: "About Simwhere", action: "about", divider: true }] },
];

export function MenuBar({ onAction }: { onAction: (action: AppAction, label?: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mousedown", close); window.removeEventListener("keydown", escape); };
  }, []);

  return <div className="menu-bar" ref={rootRef} role="menubar">
    <div className="app-mark">SW</div>
    {menus.map(menu => <div className="menu-root" key={menu.label}>
      <button className={open === menu.label ? "menu-button active" : "menu-button"} onClick={() => setOpen(open === menu.label ? null : menu.label)} onMouseEnter={() => open && setOpen(menu.label)}>{menu.label}</button>
      {open === menu.label && <div className="menu-dropdown" role="menu">
        {menu.items.map(item => <button key={item.label} className={item.divider ? "menu-item divider" : "menu-item"} onClick={() => { setOpen(null); onAction(item.action, item.label); }}>
          <span>{item.label}</span><span className="shortcut">{item.shortcut}</span>
        </button>)}
      </div>}
    </div>)}
  </div>;
}
