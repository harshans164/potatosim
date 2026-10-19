export type CadIconName = "new" | "open" | "save" | "import" | "export" | "select" | "pan" | "fit" | "sketch" | "extrude" | "boolean" | "validate" | "line" | "rectangle" | "circle" | "horizontal" | "vertical" | "coincident" | "equal" | "dimension" | "box" | "cylinder" | "sphere" | "generate" | "undo" | "redo" | "parameters";

export function CadIcon({ name, size = 16 }: { name: CadIconName; size?: number }) {
  const paths: Record<CadIconName, React.ReactNode> = {
    new: <><path d="M4 3h11l5 5v13H4z"/><path d="M15 3v5h5M8 14h8M12 10v8"/></>,
    open: <><path d="M3 19l3-10h15l-3 10z"/><path d="M4 9V5h6l2 2h6v2"/></>,
    save: <><path d="M4 3h14l2 2v16H4z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/></>,
    import: <><path d="M4 20h16v-6M12 3v12M7 10l5 5 5-5"/></>, export: <><path d="M4 20h16v-6M12 16V4M7 9l5-5 5 5"/></>,
    select: <path d="M5 3l12 9-6 1 3 6-3 2-3-6-4 4z"/>, pan: <><path d="M8 11V6a2 2 0 014 0v5M12 10V5a2 2 0 014 0v7M16 10V7a2 2 0 014 0v8c0 4-3 7-7 7h-2c-3 0-5-2-6-5l-1-4a2 2 0 014-1l1 2V8a2 2 0 014 0v4"/></>,
    fit: <><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><circle cx="12" cy="12" r="3"/></>,
    sketch: <><path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3"/><path d="M3 3h7M3 3v7"/></>,
    extrude: <><path d="M4 10l7-4 7 4-7 4zM4 10v7l7 4 7-4v-7M11 14v7"/><path d="M20 4v8M17 7l3-3 3 3"/></>,
    boolean: <><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/><path d="M12 7a6 6 0 010 10"/></>,
    validate: <><path d="M12 3l8 3v6c0 5-3 8-8 10-5-2-8-5-8-10V6z"/><path d="M8 12l3 3 5-6"/></>,
    line: <path d="M4 19L20 5M3 17v4h4M17 3h4v4"/>, rectangle: <path d="M4 6h16v12H4z"/>, circle: <circle cx="12" cy="12" r="8"/>,
    horizontal: <><path d="M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4"/></>, vertical: <><path d="M12 3v18M8 6l4-3 4 3M8 18l4 3 4-3"/></>,
    coincident: <><path d="M4 19L19 4M5 5l14 14"/><circle cx="12" cy="12" r="3" fill="currentColor"/></>, equal: <><path d="M4 8h16M4 16h16"/></>,
    dimension: <><path d="M4 18V6M20 18V6M4 12h16M8 9l-4 3 4 3M16 9l4 3-4 3"/></>,
    box: <><path d="M12 3l8 4v10l-8 4-8-4V7zM4 7l8 5 8-5M12 12v9"/></>,
    cylinder: <><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 2 3 3 7 3s7-1 7-3V6"/><path d="M5 18c0-2 3-3 7-3s7 1 7 3"/></>, sphere: <><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></>,
    generate: <path d="M13 2L5 13h6l-1 9 9-13h-6z"/>, undo: <><path d="M9 7L4 12l5 5"/><path d="M5 12h8a6 6 0 016 6"/></>, redo: <><path d="M15 7l5 5-5 5"/><path d="M19 12h-8a6 6 0 00-6 6"/></>,
    parameters: <><path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="11" cy="19" r="2" fill="white"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
