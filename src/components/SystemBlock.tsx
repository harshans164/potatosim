import { Icon } from "./Icon";
import type { CanvasBlock, IconName } from "../types/workbench";

interface Props {
  block: CanvasBlock;
  selected: boolean;
  onSelect: (id: string) => void;
  onMoveStart: (event: React.PointerEvent, block: CanvasBlock) => void;
  onContextMenu: (event: React.MouseEvent, id: string) => void;
}

export function SystemBlock({ block, selected, onSelect, onMoveStart, onContextMenu }: Props) {
  const letter = block.name.trim().charAt(0).toUpperCase();
  const systemLabel = toSystemLabel(block.systemIndex ?? 1);
  const instanceNumber = block.instanceNumber ?? 1;
  const caption = `${block.name}${instanceNumber > 1 ? ` ${instanceNumber}` : ""}`;
  const componentRows = [block.name, ...(block.stages ?? [block.name])];

  return <div
    className={`schematic-block ${block.kind} ${selected ? "selected" : ""}`}
    style={{ left: block.x, top: block.y }}
    onPointerDown={() => onSelect(block.id)}
    onContextMenu={event => onContextMenu(event, block.id)}
    data-block-id={block.id}
  >
    {block.kind === "analysis" ? <>
      <div className="block-header" style={{ backgroundColor: block.color }} onPointerDown={event => onMoveStart(event, block)}>
        <span className="block-letter">{letter}</span>
        <span className="block-title">{block.name}</span>
        <span className="block-drag-handle">⠿</span>
      </div>
      <div className="stage-list">
        {block.stages?.map((stage, index) => <div className="stage-cell" key={`${block.id}-${stage}`}>
          <span className="stage-number">{index + 1}</span><span className="stage-status">○</span><span>{stage}</span>
        </div>)}
      </div>
    </> : <>
      {block.notes && <div className="component-note" title={block.notes}>{block.notes}</div>}
      <div className="component-widget" onPointerDown={event => onMoveStart(event, block)}>
        <div className="component-letterbar"><span>▾</span><strong>{systemLabel}</strong></div>
        {componentRows.map((row, index) => <div className={`component-row ${index === 0 ? "primary" : ""}`} key={`${block.id}-${index}-${row}`}>
          <span className="component-row-number">{index + 1}</span>
          <span className="component-row-icon" style={{ color: index === 0 ? "#fff" : block.color }}><Icon name={rowIcon(row, block.icon)} size={13}/></span>
          <span className="component-row-name">{row}</span>
          {index > 0 && <span className="component-help">?</span>}
        </div>)}
      </div>
      <div className="component-caption">{caption}</div>
    </>}
  </div>;
}

function rowIcon(row: string, fallback: IconName): IconName {
  if (row === "Geometry") return "geometry";
  if (row === "Mesh") return "mesh";
  return fallback;
}

function toSystemLabel(index: number) {
  let value = Math.max(1, index);
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + value % 26) + label;
    value = Math.floor(value / 26);
  }
  return label;
}
