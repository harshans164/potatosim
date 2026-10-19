"""JSON-lines bridge between Simwhere and CadQuery/OpenCascade."""
from __future__ import annotations

import json
import math
import sys
import tempfile
from pathlib import Path

import cadquery as cq


def primitive(feature: dict):
    p = feature.get("params", {})
    x, y, z = num(p, "x", 0), num(p, "y", 0), num(p, "z", 0)
    kind = feature["type"]
    if kind == "box":
        shape = cq.Workplane("XY").box(pos(p, "width"), pos(p, "depth"), pos(p, "height")).val()
    elif kind == "cylinder":
        shape = cq.Workplane("XY").cylinder(pos(p, "height"), pos(p, "radius")).val()
    elif kind == "sphere":
        shape = cq.Workplane("XY").sphere(pos(p, "radius")).val()
    else:
        return None
    return shape.translate(cq.Vector(x, y, z))


def sketch_profile(sketch: dict):
    entities = sketch.get("entities") or []
    closed = [e for e in entities if e["type"] in ("rectangle", "circle")]
    if not closed:
        raise ValueError("Extrusion requires at least one closed rectangle or circle")
    work = cq.Workplane("XY")
    for entity in closed:
        x1, y1, x2, y2 = (float(entity[k]) for k in ("x1", "y1", "x2", "y2"))
        if entity["type"] == "rectangle":
            width, height = abs(x2 - x1), abs(y2 - y1)
            if width <= 1e-7 or height <= 1e-7:
                continue
            work = work.center((x1 + x2) / 2, (y1 + y2) / 2).rect(width, height).center(-(x1 + x2) / 2, -(y1 + y2) / 2)
        else:
            radius = math.hypot(x2 - x1, y2 - y1)
            if radius <= 1e-7:
                continue
            work = work.center(x1, y1).circle(radius).center(-x1, -y1)
    return work


def build(request: dict):
    features = request.get("features") or []
    by_id = {item["id"]: item for item in features}
    shapes = {}
    for feature in features:
        kind = feature.get("type")
        shape = primitive(feature)
        if shape is not None:
            shapes[feature["id"]] = shape
        elif kind == "extrude":
            sketch = by_id.get(feature.get("parentId"))
            if not sketch:
                raise ValueError(f"{feature.get('name', 'Extrude')} has no source sketch")
            depth = pos(feature.get("params", {}), "depth")
            shapes[feature["id"]] = sketch_profile(sketch).extrude(depth).val()
        elif kind == "step":
            content = feature.get("stepData")
            if not content:
                raise ValueError(f"{feature.get('name', 'STEP')} contains no STEP data")
            with tempfile.NamedTemporaryFile("w", suffix=".step", delete=False, encoding="utf-8") as handle:
                handle.write(content)
                path = handle.name
            try:
                imported = cq.importers.importStep(path)
                shapes[feature["id"]] = imported.val() if hasattr(imported, "val") else imported
            finally:
                Path(path).unlink(missing_ok=True)
        elif kind == "boolean":
            sources = feature.get("sourceIds") or []
            if len(sources) != 2 or sources[0] not in shapes or sources[1] not in shapes:
                raise ValueError(f"{feature.get('name', 'Boolean')} has invalid source solids")
            left, right = shapes[sources[0]], shapes[sources[1]]
            operation = feature.get("operation")
            if operation == "union":
                shapes[feature["id"]] = left.fuse(right)
            elif operation == "subtract":
                shapes[feature["id"]] = left.cut(right)
            elif operation == "intersect":
                shapes[feature["id"]] = left.intersect(right)
            else:
                raise ValueError(f"Unsupported boolean operation: {operation}")

    visible = [shapes[f["id"]] for f in features if f.get("visible", True) and f["id"] in shapes]
    if not visible:
        raise ValueError("The model contains no visible solids")
    return visible[0] if len(visible) == 1 else cq.Compound.makeCompound(visible)


def topology(shape):
    box = shape.BoundingBox()
    return {
        "valid": bool(shape.isValid()),
        "solids": len(shape.Solids()),
        "shells": len(shape.Shells()),
        "faces": len(shape.Faces()),
        "edges": len(shape.Edges()),
        "vertices": len(shape.Vertices()),
        "volume": float(shape.Volume()),
        "area": float(shape.Area()),
        "bounds": {"xmin": box.xmin, "ymin": box.ymin, "zmin": box.zmin, "xmax": box.xmax, "ymax": box.ymax, "zmax": box.zmax},
    }


def tessellate(shape, tolerance=0.2):
    vertices, triangles = shape.tessellate(float(tolerance), 0.2)
    return {
        "vertices": [list(vertex.toTuple()) for vertex in vertices],
        "triangles": [list(triangle) for triangle in triangles],
    }


def execute(request: dict):
    shape = build(request)
    result = {"ok": True, "topology": topology(shape)}
    if request.get("action") == "export_step":
        with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as handle:
            path = handle.name
        try:
            cq.exporters.export(shape, path, exportType="STEP")
            result["step"] = Path(path).read_text(encoding="utf-8", errors="replace")
        finally:
            Path(path).unlink(missing_ok=True)
    else:
        result["mesh"] = tessellate(shape, request.get("tolerance", 0.2))
    return result


def num(params: dict, key: str, default: float):
    return float(params.get(key, default))


def pos(params: dict, key: str):
    value = num(params, key, 1)
    if value <= 1e-7:
        raise ValueError(f"{key} must be greater than zero")
    return value


def main():
    try:
        request = json.load(sys.stdin)
        print(json.dumps(execute(request), separators=(",", ":")))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, separators=(",", ":")))


if __name__ == "__main__":
    main()
