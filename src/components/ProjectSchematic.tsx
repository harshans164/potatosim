import { useEffect, useRef, useState } from "react";
import type { CanvasBlock, ComponentMetadata, ContextMenuState } from "../types/workbench";
import { Icon } from "./Icon";
import { SystemBlock } from "./SystemBlock";

interface Props {
  blocks: CanvasBlock[];
  selectedId: string | null;
  zoom: number;
  onZoom: (zoom: number) => void;
  onAdd: (item: ComponentMetadata, x: number, y: number) => void;
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  onContextMenu: (menu: ContextMenuState) => void;
  pointerDrag: { item: ComponentMetadata; x: number; y: number } | null;
}

export function ProjectSchematic({ blocks, selectedId, zoom, onZoom, onAdd, onMove, onSelect, onContextMenu, pointerDrag }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dropPoint, setDropPoint] = useState<{ x: number; y: number } | null>(null);

  const canvasPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return { x: (clientX - rect.left + viewport.scrollLeft) / zoom, y: (clientY - rect.top + viewport.scrollTop) / zoom };
  };

  const viewportRect = viewportRef.current?.getBoundingClientRect();
  const pointerInside = Boolean(pointerDrag && viewportRect && pointerDrag.x >= viewportRect.left && pointerDrag.x <= viewportRect.right && pointerDrag.y >= viewportRect.top && pointerDrag.y <= viewportRect.bottom);
  const pointerDropPoint = pointerDrag && pointerInside ? canvasPoint(pointerDrag.x, pointerDrag.y) : null;

  useEffect(() => {
    const pointerDrop = (event: Event) => {
      const detail = (event as CustomEvent<{ item: ComponentMetadata; x: number; y: number }>).detail;
      const viewport = viewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      if (detail.x < rect.left || detail.x > rect.right || detail.y < rect.top || detail.y > rect.bottom) return;
      const point = canvasPoint(detail.x, detail.y);
      onAdd(detail.item, Math.max(16, point.x - 80), Math.max(16, point.y - 20));
    };
    window.addEventListener("simwhere-pointer-drop", pointerDrop);
    return () => window.removeEventListener("simwhere-pointer-drop", pointerDrop);
  });

  const dragOverCanvas = (event: React.DragEvent) => {
    if (!event.dataTransfer.types.includes("application/x-simwhere-component")) return;
    event.preventDefault(); event.dataTransfer.dropEffect = "copy";
    setDragOver(true); setDropPoint(canvasPoint(event.clientX, event.clientY));
  };
  const drop = (event: React.DragEvent) => {
    event.preventDefault(); setDragOver(false); setDropPoint(null);
    try {
      const item = JSON.parse(event.dataTransfer.getData("application/x-simwhere-component")) as ComponentMetadata;
      const point = canvasPoint(event.clientX, event.clientY);
      onAdd(item, Math.max(16, point.x - 85), Math.max(16, point.y - 20));
    } catch { /* Ignore foreign drag data. */ }
  };

  const moveStart = (event: React.PointerEvent, block: CanvasBlock) => {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); onSelect(block.id);
    const origin = canvasPoint(event.clientX, event.clientY);
    const offset = { x: origin.x - block.x, y: origin.y - block.y };
    const move = (pointerEvent: PointerEvent) => {
      const point = canvasPoint(pointerEvent.clientX, pointerEvent.clientY);
      onMove(block.id, Math.max(0, point.x - offset.x), Math.max(0, point.y - offset.y));
    };
    const finish = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", finish);
  };

  return <main className="schematic-pane">
    <div className="schematic-titlebar"><span>Project Schematic</span><span className="schematic-caption">Simulation workflow</span></div>
    <div className="canvas-toolbar">
      <span className="canvas-instruction">Drop systems and components onto the workspace</span>
      <div className="zoom-controls">
        <button title="Zoom out" onClick={() => onZoom(Math.max(.5, zoom - .1))}><Icon name="minus" size={14}/></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button title="Zoom in" onClick={() => onZoom(Math.min(1.5, zoom + .1))}><Icon name="plus" size={14}/></button>
        <button title="Fit to view" onClick={() => onZoom(1)}><Icon name="fit" size={14}/></button>
      </div>
    </div>
    <div ref={viewportRef} className={`canvas-viewport ${dragOver || pointerInside ? "drag-over" : ""}`} onDragOver={dragOverCanvas} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) { setDragOver(false); setDropPoint(null); } }} onDrop={drop} onPointerDown={event => { if (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains("canvas-surface")) onSelect(null); }}>
      <div className="canvas-surface" style={{ transform: `scale(${zoom})` }}>
        {blocks.length === 0 && <div className="empty-state"><Icon name="custom" size={30}/><strong>Build your simulation workflow</strong><span>Drag systems and components here from the Toolbox.</span></div>}
        {(pointerDropPoint ?? dropPoint) && <div className="drop-indicator" style={{ left: (pointerDropPoint ?? dropPoint)!.x - 80, top: (pointerDropPoint ?? dropPoint)!.y - 20 }}><span>Place component here</span></div>}
        {blocks.map(block => <SystemBlock key={block.id} block={block} selected={selectedId === block.id} onSelect={id => onSelect(id)} onMoveStart={moveStart} onContextMenu={(event, id, rowIndex) => { event.preventDefault(); event.stopPropagation(); onSelect(id); onContextMenu({ blockId: id, x: event.clientX, y: event.clientY, rowIndex }); }}/>) }
      </div>
    </div>
  </main>;
}
