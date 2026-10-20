export type LengthUnit = "mm" | "cm" | "m" | "ft" | "in";
export type AngleUnit = "deg" | "rad";
export type PlaneKind = "xy" | "yz" | "zx";

export interface Point2 {
  x: number;
  y: number;
}

export interface DatumPlane {
  id: string;
  name: string;
  kind: PlaneKind;
  visible: boolean;
}

export interface SketchDefinition {
  id: string;
  name: string;
  planeId: string;
  entityIds: string[];
  generated: boolean;
  visible: boolean;
}

interface EntityBase {
  id: string;
  name: string;
  sketchId: string;
  visible: boolean;
  valid: boolean;
}

export interface LineEntity extends EntityBase {
  type: "line";
  start: Point2;
  end: Point2;
}

export interface PolylineEntity extends EntityBase {
  type: "polyline";
  points: Point2[];
  closed: boolean;
}

export interface RectangleEntity extends EntityBase {
  type: "rectangle";
  origin: Point2;
  u: Point2;
  v: Point2;
}

export interface CircleEntity extends EntityBase {
  type: "circle";
  center: Point2;
  radius: number;
}

export interface ArcEntity extends EntityBase {
  type: "arc";
  center: Point2;
  radius: number;
  startAngle: number;
  sweepAngle: number;
}

export interface EllipseEntity extends EntityBase {
  type: "ellipse";
  center: Point2;
  radiusX: number;
  radiusY: number;
  rotation: number;
}

export interface PolygonEntity extends EntityBase {
  type: "polygon";
  center: Point2;
  radius: number;
  sides: number;
  rotation: number;
}

export type SketchEntity = LineEntity | PolylineEntity | RectangleEntity | CircleEntity | ArcEntity | EllipseEntity | PolygonEntity;
export type SketchEntityType = SketchEntity["type"];

export type DimensionKind = "general" | "horizontal" | "vertical" | "length" | "radius" | "diameter" | "angle";

export interface SketchDimension {
  id: string;
  name: string;
  sketchId: string;
  kind: DimensionKind;
  entityIds: string[];
  offset: Point2;
  visible: boolean;
}

export interface UnitSettings {
  length: LengthUnit;
  angle: AngleUnit;
  precision: number;
  showUnitSuffix: boolean;
}

export interface DisplaySettings {
  grid: boolean;
  snap: boolean;
  gridSize: number;
  polygonSides: number;
}

export interface SketchDocument {
  version: 2;
  planes: DatumPlane[];
  sketches: SketchDefinition[];
  entities: SketchEntity[];
  dimensions: SketchDimension[];
  activePlaneId: string;
  activeSketchId: string | null;
  units: UnitSettings;
  display: DisplaySettings;
}

export interface SketchProjectFile {
  format: "simwhere-geometry";
  version: 2;
  document: SketchDocument;
  view: ViewState;
}

export interface ViewState {
  zoom: number;
  pan: Point2;
  azimuth?: number;
  elevation?: number;
}

export type DrawTool = "line" | "polyline" | "rectangle" | "rectangle3" | "polygon" | "circle" | "arc3" | "arcCenter" | "ellipse";
export type DimensionTool = "dimGeneral" | "dimHorizontal" | "dimVertical" | "dimLength" | "dimRadius" | "dimDiameter" | "dimAngle" | "dimMove";
export type EditorTool = "select" | "pan" | "move" | DrawTool | DimensionTool;

export type SelectionKind = "plane" | "sketch" | "entity" | "dimension";
export interface CadSelection {
  kind: SelectionKind;
  ids: string[];
  subIndex?: number;
}

export type SidebarMode = "sketching" | "modeling";
