import type { AngleUnit, DimensionKind, LengthUnit, Point2, RectangleEntity, SketchDimension, SketchDocument, SketchEntity, UnitSettings, ViewState } from "../types/sketch";

const LENGTH_FACTORS: Record<LengthUnit, number> = { m: 1, mm: 0.001, cm: 0.01, in: 0.0254, ft: 0.3048 };
export const MODEL_TO_VIEW = 1000;
export const EPSILON = 1e-9;

export const uid = (prefix = "item") => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const add = (a: Point2, b: Point2): Point2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point2, b: Point2): Point2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Point2, factor: number): Point2 => ({ x: a.x * factor, y: a.y * factor });
export const dot = (a: Point2, b: Point2) => a.x * b.x + a.y * b.y;
export const length = (a: Point2) => Math.hypot(a.x, a.y);
export const distance = (a: Point2, b: Point2) => length(sub(a, b));
export const normalize = (a: Point2): Point2 => length(a) < EPSILON ? { x: 1, y: 0 } : mul(a, 1 / length(a));
export const rotatePoint = (point: Point2, angle: number, origin: Point2 = { x: 0, y: 0 }): Point2 => {
  const p = sub(point, origin), c = Math.cos(angle), s = Math.sin(angle);
  return add(origin, { x: p.x * c - p.y * s, y: p.x * s + p.y * c });
};
export const perpendicular = (a: Point2): Point2 => ({ x: -a.y, y: a.x });
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const fromDisplayLength = (value: number, unit: LengthUnit) => value * LENGTH_FACTORS[unit];
export const toDisplayLength = (metres: number, unit: LengthUnit) => metres / LENGTH_FACTORS[unit];
export const fromDisplayAngle = (value: number, unit: AngleUnit) => unit === "deg" ? value * Math.PI / 180 : value;
export const toDisplayAngle = (radians: number, unit: AngleUnit) => unit === "deg" ? radians * 180 / Math.PI : radians;
export const formatLength = (metres: number, units: UnitSettings) => `${toDisplayLength(metres, units.length).toFixed(units.precision)}${units.showUnitSuffix ? ` ${units.length}` : ""}`;
export const formatAngle = (radians: number, units: UnitSettings) => `${toDisplayAngle(radians, units.angle).toFixed(units.precision)}${units.showUnitSuffix ? (units.angle === "deg" ? "°" : " rad") : ""}`;

export const rectanglePoints = (entity: RectangleEntity): Point2[] => [
  entity.origin,
  add(entity.origin, entity.u),
  add(add(entity.origin, entity.u), entity.v),
  add(entity.origin, entity.v),
];

export const polygonPoints = (center: Point2, radius: number, sides: number, rotation: number) => Array.from({ length: sides }, (_, index) => ({
  x: center.x + Math.cos(rotation + index * Math.PI * 2 / sides) * radius,
  y: center.y + Math.sin(rotation + index * Math.PI * 2 / sides) * radius,
}));

export const entityPoints = (entity: SketchEntity): Point2[] => {
  switch (entity.type) {
    case "line": return [entity.start, entity.end];
    case "polyline": return entity.points;
    case "rectangle": return rectanglePoints(entity);
    case "circle": return [entity.center, { x: entity.center.x + entity.radius, y: entity.center.y }];
    case "arc": return [entity.center, arcPoint(entity, entity.startAngle), arcPoint(entity, entity.startAngle + entity.sweepAngle)];
    case "ellipse": return [entity.center, rotatePoint({ x: entity.center.x + entity.radiusX, y: entity.center.y }, entity.rotation, entity.center), rotatePoint({ x: entity.center.x, y: entity.center.y + entity.radiusY }, entity.rotation, entity.center)];
    case "polygon": return [entity.center, ...polygonPoints(entity.center, entity.radius, entity.sides, entity.rotation)];
  }
};

export const entityBounds = (entity: SketchEntity) => {
  let points: Point2[];
  if (entity.type === "circle" || entity.type === "arc") points = [
    { x: entity.center.x - entity.radius, y: entity.center.y - entity.radius },
    { x: entity.center.x + entity.radius, y: entity.center.y + entity.radius },
  ];
  else if (entity.type === "ellipse") {
    const c = Math.cos(entity.rotation), s = Math.sin(entity.rotation);
    const rx = Math.sqrt(entity.radiusX ** 2 * c ** 2 + entity.radiusY ** 2 * s ** 2);
    const ry = Math.sqrt(entity.radiusX ** 2 * s ** 2 + entity.radiusY ** 2 * c ** 2);
    points = [{ x: entity.center.x - rx, y: entity.center.y - ry }, { x: entity.center.x + rx, y: entity.center.y + ry }];
  } else points = entityPoints(entity);
  return { minX: Math.min(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxX: Math.max(...points.map(p => p.x)), maxY: Math.max(...points.map(p => p.y)) };
};

export const arcPoint = (entity: { center: Point2; radius: number }, angle: number): Point2 => ({ x: entity.center.x + Math.cos(angle) * entity.radius, y: entity.center.y + Math.sin(angle) * entity.radius });

export const circumcircle = (a: Point2, b: Point2, c: Point2) => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < EPSILON) return null;
  const aa = a.x * a.x + a.y * a.y, bb = b.x * b.x + b.y * b.y, cc = c.x * c.x + c.y * c.y;
  const center = { x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / d, y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / d };
  let startAngle = Math.atan2(a.y - center.y, a.x - center.x);
  const midAngle = Math.atan2(b.y - center.y, b.x - center.x);
  let endAngle = Math.atan2(c.y - center.y, c.x - center.x);
  const positive = (value: number) => (value % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  let sweepAngle = positive(endAngle - startAngle);
  if (positive(midAngle - startAngle) > sweepAngle) sweepAngle -= Math.PI * 2;
  if (Math.abs(sweepAngle) < EPSILON) { endAngle += Math.PI * 2; sweepAngle = endAngle - startAngle; }
  return { center, radius: distance(center, a), startAngle, sweepAngle };
};

export const lineIntersection = (a1: Point2, a2: Point2, b1: Point2, b2: Point2, segmentsOnly = false): Point2 | null => {
  const r = sub(a2, a1), s = sub(b2, b1), cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < EPSILON) return null;
  const q = sub(b1, a1), t = (q.x * s.y - q.y * s.x) / cross, u = (q.x * r.y - q.y * r.x) / cross;
  if (segmentsOnly && (t < 0 || t > 1 || u < 0 || u > 1)) return null;
  return add(a1, mul(r, t));
};

export const translateEntity = (entity: SketchEntity, delta: Point2): SketchEntity => {
  switch (entity.type) {
    case "line": return { ...entity, start: add(entity.start, delta), end: add(entity.end, delta) };
    case "polyline": return { ...entity, points: entity.points.map(point => add(point, delta)) };
    case "rectangle": return { ...entity, origin: add(entity.origin, delta) };
    case "circle": case "arc": case "ellipse": case "polygon": return { ...entity, center: add(entity.center, delta) };
  }
};

export const rotateEntity = (entity: SketchEntity, angle: number, origin: Point2): SketchEntity => {
  switch (entity.type) {
    case "line": return { ...entity, start: rotatePoint(entity.start, angle, origin), end: rotatePoint(entity.end, angle, origin) };
    case "polyline": return { ...entity, points: entity.points.map(p => rotatePoint(p, angle, origin)) };
    case "rectangle": return { ...entity, origin: rotatePoint(entity.origin, angle, origin), u: rotatePoint(entity.u, angle), v: rotatePoint(entity.v, angle) };
    case "circle": case "polygon": return { ...entity, center: rotatePoint(entity.center, angle, origin), rotation: entity.type === "polygon" ? entity.rotation + angle : undefined } as SketchEntity;
    case "arc": return { ...entity, center: rotatePoint(entity.center, angle, origin), startAngle: entity.startAngle + angle };
    case "ellipse": return { ...entity, center: rotatePoint(entity.center, angle, origin), rotation: entity.rotation + angle };
  }
};

export const scaleEntity = (entity: SketchEntity, factor: number, origin: Point2): SketchEntity => {
  const scalePoint = (point: Point2) => add(origin, mul(sub(point, origin), factor));
  switch (entity.type) {
    case "line": return { ...entity, start: scalePoint(entity.start), end: scalePoint(entity.end) };
    case "polyline": return { ...entity, points: entity.points.map(scalePoint) };
    case "rectangle": return { ...entity, origin: scalePoint(entity.origin), u: mul(entity.u, factor), v: mul(entity.v, factor) };
    case "circle": case "arc": case "polygon": return { ...entity, center: scalePoint(entity.center), radius: Math.abs(entity.radius * factor) };
    case "ellipse": return { ...entity, center: scalePoint(entity.center), radiusX: Math.abs(entity.radiusX * factor), radiusY: Math.abs(entity.radiusY * factor) };
  }
};

export const mirrorEntity = (entity: SketchEntity, axis: "x" | "y"): SketchEntity => {
  const reflect = (p: Point2): Point2 => axis === "x" ? { x: p.x, y: -p.y } : { x: -p.x, y: p.y };
  const reflected = (() => {
    switch (entity.type) {
      case "line": return { ...entity, start: reflect(entity.start), end: reflect(entity.end) };
      case "polyline": return { ...entity, points: entity.points.map(reflect) };
      case "rectangle": return { ...entity, origin: reflect(entity.origin), u: reflect(entity.u), v: reflect(entity.v) };
      case "circle": case "polygon": return { ...entity, center: reflect(entity.center), rotation: entity.type === "polygon" ? -entity.rotation : undefined } as SketchEntity;
      case "arc": return { ...entity, center: reflect(entity.center), startAngle: axis === "x" ? -entity.startAngle : Math.PI - entity.startAngle, sweepAngle: -entity.sweepAngle };
      case "ellipse": return { ...entity, center: reflect(entity.center), rotation: axis === "x" ? -entity.rotation : Math.PI - entity.rotation };
    }
  })();
  return reflected;
};

export const offsetEntity = (entity: SketchEntity, amount: number): SketchEntity | null => {
  if (entity.type === "line") {
    const normal = mul(perpendicular(normalize(sub(entity.end, entity.start))), amount);
    return translateEntity(entity, normal);
  }
  if (entity.type === "circle" || entity.type === "arc" || entity.type === "polygon") return { ...entity, radius: entity.radius + amount, valid: entity.radius + amount > EPSILON };
  if (entity.type === "ellipse") return { ...entity, radiusX: entity.radiusX + amount, radiusY: entity.radiusY + amount, valid: entity.radiusX + amount > EPSILON && entity.radiusY + amount > EPSILON };
  if (entity.type === "rectangle") {
    const ux = normalize(entity.u), vx = normalize(entity.v);
    return { ...entity, origin: sub(entity.origin, add(mul(ux, amount), mul(vx, amount))), u: add(entity.u, mul(ux, amount * 2)), v: add(entity.v, mul(vx, amount * 2)) };
  }
  return null;
};

export const entityCenter = (entity: SketchEntity): Point2 => {
  const bounds = entityBounds(entity);
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
};

export const dimensionValue = (dimension: SketchDimension, document: SketchDocument): number => {
  const first = document.entities.find(entity => entity.id === dimension.entityIds[0]);
  const second = document.entities.find(entity => entity.id === dimension.entityIds[1]);
  if (!first) return 0;
  if (dimension.kind === "radius" && (first.type === "circle" || first.type === "arc")) return first.radius;
  if (dimension.kind === "diameter" && (first.type === "circle" || first.type === "arc")) return first.radius * 2;
  if (dimension.kind === "angle" && first.type === "line" && second?.type === "line") {
    const a = Math.atan2(first.end.y - first.start.y, first.end.x - first.start.x), b = Math.atan2(second.end.y - second.start.y, second.end.x - second.start.x);
    const raw = Math.abs(a - b) % Math.PI;
    return Math.min(raw, Math.PI - raw);
  }
  if (first.type === "line") {
    if (dimension.kind === "horizontal") return Math.abs(first.end.x - first.start.x);
    if (dimension.kind === "vertical") return Math.abs(first.end.y - first.start.y);
    return distance(first.start, first.end);
  }
  if (first.type === "rectangle") return dimension.kind === "vertical" ? length(first.v) : length(first.u);
  if (first.type === "circle" || first.type === "arc") return dimension.kind === "diameter" ? first.radius * 2 : first.radius;
  return 0;
};

export const formatDimension = (dimension: SketchDimension, document: SketchDocument) => dimension.kind === "angle" ? formatAngle(dimensionValue(dimension, document), document.units) : formatLength(dimensionValue(dimension, document), document.units);

export const dimensionKindForEntity = (requested: DimensionKind, entity: SketchEntity): DimensionKind | null => {
  if (requested === "general") {
    if (entity.type === "circle" || entity.type === "arc") return "diameter";
    if (entity.type === "line") {
      const dx = Math.abs(entity.end.x - entity.start.x);
      const dy = Math.abs(entity.end.y - entity.start.y);
      if (dx < dy * 0.25) return "vertical";
      if (dy < dx * 0.25) return "horizontal";
      return "length";
    }
    if (entity.type === "rectangle") return "length";
    return null;
  }
  if ((requested === "radius" || requested === "diameter") && entity.type !== "circle" && entity.type !== "arc") return null;
  if ((requested === "horizontal" || requested === "vertical" || requested === "length") && entity.type !== "line" && entity.type !== "rectangle") return null;
  return requested;
};

export const createInitialDocument = (): SketchDocument => ({
  version: 2,
  planes: [
    { id: "xy-plane", name: "XYPlane", kind: "xy", visible: false },
    { id: "yz-plane", name: "YZPlane", kind: "yz", visible: false },
    { id: "zx-plane", name: "ZXPlane", kind: "zx", visible: false },
  ],
  sketches: [], entities: [], dimensions: [], activePlaneId: "xy-plane", activeSketchId: null,
  units: { length: "mm", angle: "deg", precision: 2, showUnitSuffix: true },
  display: { grid: false, snap: true, gridSize: 0.01, polygonSides: 6 },
});

export const project3DToScreen = (
  x: number, y: number, z: number,
  view: ViewState
): Point2 => {
  const azimuth = (view.azimuth ?? 45) * Math.PI / 180;
  const elevation = (view.elevation ?? 35.264) * Math.PI / 180;
  const x1 = x * Math.cos(azimuth) - z * Math.sin(azimuth);
  const z1 = x * Math.sin(azimuth) + z * Math.cos(azimuth);
  const y1 = y;
  const x2 = x1;
  const y2 = y1 * Math.cos(elevation) - z1 * Math.sin(elevation);
  const S = MODEL_TO_VIEW * view.zoom;
  return {
    x: x2 * S + view.pan.x,
    y: -y2 * S + view.pan.y,
  };
};

export const projectPlaneToScreen = (
  point: Point2,
  planeKind: "xy" | "yz" | "zx",
  view: ViewState
): Point2 => {
  const x = planeKind === "xy" ? point.x : planeKind === "zx" ? point.y : 0;
  const y = planeKind === "xy" ? point.y : planeKind === "yz" ? point.x : 0;
  const z = planeKind === "yz" ? point.y : planeKind === "zx" ? point.x : 0;
  return project3DToScreen(x, y, z, view);
};

export const unprojectScreenToPlane = (
  screenPoint: Point2,
  planeKind: "xy" | "yz" | "zx",
  view: ViewState
): Point2 => {
  const azimuth = (view.azimuth ?? 45) * Math.PI / 180;
  const elevation = (view.elevation ?? 35.264) * Math.PI / 180;
  const S = MODEL_TO_VIEW * view.zoom;
  const x2 = (screenPoint.x - view.pan.x) / S;
  const y2 = -(screenPoint.y - view.pan.y) / S;

  const y1 = y2 * Math.cos(elevation);
  const z1 = -y2 * Math.sin(elevation);
  const x0 = x2 * Math.cos(azimuth) + z1 * Math.sin(azimuth);
  const y0 = y1;
  const z0 = -x2 * Math.sin(azimuth) + z1 * Math.cos(azimuth);

  const dy1 = Math.sin(elevation);
  const dz1 = Math.cos(elevation);
  const dx = dz1 * Math.sin(azimuth);
  const dy = -dy1;
  const dz = dz1 * Math.cos(azimuth);

  if (planeKind === "xy") {
    if (Math.abs(dz) < 1e-6) return { x: x0, y: y0 };
    const t = -z0 / dz;
    return { x: x0 + t * dx, y: y0 + t * dy };
  }
  if (planeKind === "yz") {
    if (Math.abs(dx) < 1e-6) return { x: y0, y: z0 };
    const t = -x0 / dx;
    return { x: y0 + t * dy, y: z0 + t * dz };
  }
  if (Math.abs(dy) < 1e-6) return { x: z0, y: x0 };
  const t = -y0 / dy;
  return { x: z0 + t * dz, y: x0 + t * dx };
};

export const isSketchDocument = (value: unknown): value is SketchDocument => {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<SketchDocument>;
  return doc.version === 2 && Array.isArray(doc.planes) && Array.isArray(doc.sketches) && Array.isArray(doc.entities) && Array.isArray(doc.dimensions) && !!doc.units && !!doc.display;
};

export const setDimensionValue = (dimension: SketchDimension, document: SketchDocument, internalValue: number): SketchEntity[] | null => {
  const first = document.entities.find(entity => entity.id === dimension.entityIds[0]);
  if (!first || !Number.isFinite(internalValue) || internalValue <= EPSILON) return null;
  if ((dimension.kind === "radius" || dimension.kind === "diameter") && (first.type === "circle" || first.type === "arc")) {
    const radius = dimension.kind === "diameter" ? internalValue / 2 : internalValue;
    return document.entities.map(entity => entity.id === first.id ? { ...first, radius } : entity);
  }
  if (first.type === "line") {
    const vector = sub(first.end, first.start);
    if (dimension.kind === "horizontal") return document.entities.map(entity => entity.id === first.id ? { ...first, end: { ...first.end, x: first.start.x + Math.sign(vector.x || 1) * internalValue } } : entity);
    if (dimension.kind === "vertical") return document.entities.map(entity => entity.id === first.id ? { ...first, end: { ...first.end, y: first.start.y + Math.sign(vector.y || 1) * internalValue } } : entity);
    const direction = normalize(vector);
    return document.entities.map(entity => entity.id === first.id ? { ...first, end: add(first.start, mul(direction, internalValue)) } : entity);
  }
  if (first.type === "rectangle") {
    const key = dimension.kind === "vertical" ? "v" : "u";
    return document.entities.map(entity => entity.id === first.id ? { ...first, [key]: mul(normalize(first[key]), internalValue) } : entity);
  }
  return null;
};

export const exportSketchToStep = (document: SketchDocument, modelName = "Simwhere_CAD_Model"): string => {
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
  let id = 1;
  const nextId = () => id++;

  const lines: string[] = [];
  const addEntry = (content: string) => {
    const curId = nextId();
    lines.push(`#${curId} = ${content};`);
    return curId;
  };

  const header = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Simwhere CAD Model (2D/3D Wireframe STEP export)'), '2;1');
FILE_NAME('${modelName}.step', '${timestamp}', ('Simwhere User'), ('Simwhere'), 'Simwhere CAD Kernel 1.0', 'Simwhere', '');
FILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));
ENDSEC;
DATA;`;

  // Standard coordinate system entities
  const originId = addEntry("CARTESIAN_POINT('', (0., 0., 0.))");
  const dirZId = addEntry("DIRECTION('', (0., 0., 1.))");
  const dirXId = addEntry("DIRECTION('', (1., 0., 0.))");
  const axis2PlacementId = addEntry(`AXIS2_PLACEMENT_3D('', #${originId}, #${dirZId}, #${dirXId})`);

  // Transform 2D sketch plane entity to 3D world coordinates
  const toWorld3D = (pt: Point2, planeId: string): [number, number, number] => {
    const plane = document.planes.find(p => p.id === planeId);
    const kind = plane?.kind ?? "xy";
    if (kind === "xy") return [pt.x, pt.y, 0];
    if (kind === "yz") return [0, pt.x, pt.y];
    // zx plane
    return [pt.y, 0, pt.x];
  };

  const curveIds: number[] = [];

  for (const entity of document.entities) {
    if (!entity.visible) continue;
    const sketch = document.sketches.find(s => s.id === entity.sketchId);
    const planeId = sketch?.planeId ?? document.activePlaneId;

    if (entity.type === "line") {
      const [x1, y1, z1] = toWorld3D(entity.start, planeId);
      const [x2, y2, z2] = toWorld3D(entity.end, planeId);
      const pt1 = addEntry(`CARTESIAN_POINT('', (${x1}, ${y1}, ${z1}))`);
      const pt2 = addEntry(`CARTESIAN_POINT('', (${x2}, ${y2}, ${z2}))`);
      const vdx = x2 - x1, vdy = y2 - y1, vdz = z2 - z1;
      const vlen = Math.hypot(vdx, vdy, vdz) || 1;
      const dirId = addEntry(`DIRECTION('', (${vdx / vlen}, ${vdy / vlen}, ${vdz / vlen}))`);
      const vecId = addEntry(`VECTOR('', #${dirId}, ${vlen})`);
      const lineId = addEntry(`LINE('', #${pt1}, #${vecId})`);
      const vertex1 = addEntry(`VERTEX_POINT('', #${pt1})`);
      const vertex2 = addEntry(`VERTEX_POINT('', #${pt2})`);
      const edgeCurve = addEntry(`EDGE_CURVE('', #${vertex1}, #${vertex2}, #${lineId}, .T.)`);
      curveIds.push(edgeCurve);
    } else if (entity.type === "rectangle") {
      const pts = rectanglePoints(entity);
      for (let i = 0; i < 4; i++) {
        const [x1, y1, z1] = toWorld3D(pts[i], planeId);
        const [x2, y2, z2] = toWorld3D(pts[(i + 1) % 4], planeId);
        const pt1 = addEntry(`CARTESIAN_POINT('', (${x1}, ${y1}, ${z1}))`);
        const pt2 = addEntry(`CARTESIAN_POINT('', (${x2}, ${y2}, ${z2}))`);
        const vdx = x2 - x1, vdy = y2 - y1, vdz = z2 - z1;
        const vlen = Math.hypot(vdx, vdy, vdz) || 1;
        const dirId = addEntry(`DIRECTION('', (${vdx / vlen}, ${vdy / vlen}, ${vdz / vlen}))`);
        const vecId = addEntry(`VECTOR('', #${dirId}, ${vlen})`);
        const lineId = addEntry(`LINE('', #${pt1}, #${vecId})`);
        const vertex1 = addEntry(`VERTEX_POINT('', #${pt1})`);
        const vertex2 = addEntry(`VERTEX_POINT('', #${pt2})`);
        const edgeCurve = addEntry(`EDGE_CURVE('', #${vertex1}, #${vertex2}, #${lineId}, .T.)`);
        curveIds.push(edgeCurve);
      }
    } else if (entity.type === "circle") {
      const [cx, cy, cz] = toWorld3D(entity.center, planeId);
      const centerPt = addEntry(`CARTESIAN_POINT('', (${cx}, ${cy}, ${cz}))`);
      const plane = document.planes.find(p => p.id === planeId);
      const kind = plane?.kind ?? "xy";
      const normal = kind === "xy" ? "(0., 0., 1.)" : kind === "yz" ? "(1., 0., 0.)" : "(0., 1., 0.)";
      const refDir = kind === "xy" ? "(1., 0., 0.)" : kind === "yz" ? "(0., 1., 0.)" : "(0., 0., 1.)";
      const normDirId = addEntry(`DIRECTION('', ${normal})`);
      const refDirId = addEntry(`DIRECTION('', ${refDir})`);
      const circPlacement = addEntry(`AXIS2_PLACEMENT_3D('', #${centerPt}, #${normDirId}, #${refDirId})`);
      const circId = addEntry(`CIRCLE('', #${circPlacement}, ${entity.radius})`);
      curveIds.push(circId);
    } else if (entity.type === "polyline") {
      const pts = entity.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [x1, y1, z1] = toWorld3D(pts[i], planeId);
        const [x2, y2, z2] = toWorld3D(pts[i + 1], planeId);
        const pt1 = addEntry(`CARTESIAN_POINT('', (${x1}, ${y1}, ${z1}))`);
        const pt2 = addEntry(`CARTESIAN_POINT('', (${x2}, ${y2}, ${z2}))`);
        const vdx = x2 - x1, vdy = y2 - y1, vdz = z2 - z1;
        const vlen = Math.hypot(vdx, vdy, vdz) || 1;
        const dirId = addEntry(`DIRECTION('', (${vdx / vlen}, ${vdy / vlen}, ${vdz / vlen}))`);
        const vecId = addEntry(`VECTOR('', #${dirId}, ${vlen})`);
        const lineId = addEntry(`LINE('', #${pt1}, #${vecId})`);
        const vertex1 = addEntry(`VERTEX_POINT('', #${pt1})`);
        const vertex2 = addEntry(`VERTEX_POINT('', #${pt2})`);
        const edgeCurve = addEntry(`EDGE_CURVE('', #${vertex1}, #${vertex2}, #${lineId}, .T.)`);
        curveIds.push(edgeCurve);
      }
    }
  }

  // Model assembly entity
  const curveRefs = curveIds.map(c => `#${c}`).join(", ");
  const geometricSetId = addEntry(`GEOMETRIC_SET('${modelName}', (${curveRefs}))`);
  const contextId = addEntry("GEOMETRIC_REPRESENTATION_CONTEXT(3)");
  addEntry(`SHAPE_REPRESENTATION('${modelName}', (#${axis2PlacementId}, #${geometricSetId}), #${contextId})`);

  const footer = `ENDSEC;
END-ISO-10303-21;`;

  return `${header}\n${lines.join("\n")}\n${footer}`;
};
