import type { IconName } from "../types/workbench";

type AppIconName = IconName | "new" | "open" | "save" | "import" | "refresh" | "update" | "plus" | "minus" | "fit" | "chevron" | "close";

export function Icon({ name, size = 16 }: { name: AppIconName; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<AppIconName, React.ReactNode> = {
    new: <><path d="M4 3h11l5 5v13H4z"/><path d="M15 3v5h5M8 13h8M12 9v8"/></>,
    open: <><path d="M3 19l3-10h15l-3 10z"/><path d="M4 9V5h6l2 2h6v2"/></>,
    save: <><path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    import: <><path d="M4 14v6h16v-6M12 3v12M7 10l5 5 5-5"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0111.7-2L20 8M4 16l2.2 2a7 7 0 0011.7-2"/></>,
    update: <><path d="M12 20V5M7 10l5-5 5 5"/><path d="M4 15v6h16v-6"/></>,
    fluid: <><path d="M12 3S6 10 6 15a6 6 0 0012 0c0-5-6-12-6-12z"/><path d="M9 16c.5 1.3 1.5 2 3 2"/></>,
    engine: <><path d="M4 9h3l2-3h7l2 3h2v9h-3l-2 2H8l-2-2H4z"/><path d="M10 10v5h4v-5M2 11v5M22 11v5"/></>,
    combustion: <path d="M13 2c1 5-4 6-2 10 1-2 3-3 4-5 3 3 4 6 3 9a6 6 0 01-12 0c0-4 3-7 7-14z"/>,
    custom: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></>,
    geometry: <><path d="M12 3l8 5v9l-8 4-8-4V8z"/><path d="M4 8l8 5 8-5M12 13v8"/></>,
    mesh: <><path d="M3 4h18v16H3zM3 9h18M3 15h18M9 4v16M15 4v16"/></>,
    results: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    python: <><path d="M12 3c-5 0-5 2-5 5v2h9v2H8c-3 0-5 2-5 5 0 2 1 4 4 4h3v-3"/><path d="M12 21c5 0 5-2 5-5v-2H8v-2h8c3 0 5-2 5-5 0-2-1-4-4-4h-3v3"/><circle cx="10" cy="6" r=".6" fill="currentColor"/><circle cx="14" cy="18" r=".6" fill="currentColor"/></>,
    code: <><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><path d="M9 9h6v6H9z"/></>,
    chevron: <path d="M7 9l5 5 5-5"/>,
    close: <path d="M6 6l12 12M18 6L6 18"/>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}
