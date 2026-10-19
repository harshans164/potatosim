export type GeometryFeatureType = "plane" | "sketch" | "box" | "cylinder" | "sphere" | "extrude" | "boolean" | "step";
export type SketchTool = "select" | "line" | "rectangle" | "circle" | "pan";
export type GeometryView = "isometric" | "front" | "top" | "right";

export interface SketchEntity {
  id: string;
  type: "line" | "rectangle" | "circle";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type ConstraintType = "horizontal" | "vertical" | "coincident" | "equal" | "dimension";
export interface SketchConstraint { id: string; type: ConstraintType; entityIds: string[]; value?: number; }

export interface GeometryFeature {
  id: string;
  name: string;
  type: GeometryFeatureType;
  parentId?: string;
  visible: boolean;
  generated: boolean;
  params: Record<string, number>;
  entities?: SketchEntity[];
  constraints?: SketchConstraint[];
  sourceIds?: string[];
  operation?: "union" | "subtract" | "intersect";
  stepData?: string;
}

export interface GeometryProject {
  version: 1;
  features: GeometryFeature[];
}

export interface KernelTopology {
  valid: boolean; solids: number; shells: number; faces: number; edges: number; vertices: number; volume: number; area: number;
  bounds: { xmin: number; ymin: number; zmin: number; xmax: number; ymax: number; zmax: number };
}
export interface KernelMesh { vertices: [number, number, number][]; triangles: [number, number, number][]; }
export interface KernelResult { ok: boolean; error?: string; topology?: KernelTopology; mesh?: KernelMesh; step?: string; }
