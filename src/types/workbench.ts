export type BlockKind = "analysis" | "component";

export type IconName =
  | "fluid"
  | "engine"
  | "combustion"
  | "custom"
  | "geometry"
  | "mesh"
  | "results"
  | "python"
  | "code";

export interface ComponentMetadata {
  type: string;
  name: string;
  kind: BlockKind;
  icon: IconName;
  color: string;
  stages?: string[];
}

export interface CanvasBlock extends ComponentMetadata {
  id: string;
  x: number;
  y: number;
  /** Stable per-component sequence used for captions such as "Geometry 2". */
  instanceNumber?: number;
  /** Stable creation order used for Workbench-style A, B, C labels. */
  systemIndex?: number;
  notes?: string;
}

export interface ToolboxGroupData {
  id: string;
  label: string;
  items: ComponentMetadata[];
}

export interface ProjectFile {
  version: 1;
  name: string;
  blocks: CanvasBlock[];
}

export interface ContextMenuState {
  blockId: string;
  x: number;
  y: number;
}
