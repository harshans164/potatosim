import unittest

import geometry_kernel as kernel


def feature(identifier, kind, params, visible=True, **extra):
    return {"id": identifier, "name": identifier, "type": kind, "params": params, "visible": visible, **extra}


class GeometryKernelTests(unittest.TestCase):
    def test_boolean_cut_is_valid_and_reduces_volume(self):
        box = feature("box", "box", {"width": 20, "depth": 20, "height": 20}, False)
        cylinder = feature("tool", "cylinder", {"radius": 4, "height": 30}, False)
        cut = feature("cut", "boolean", {}, True, sourceIds=["box", "tool"], operation="subtract")
        result = kernel.execute({"action": "evaluate", "features": [box, cylinder, cut], "tolerance": 0.5})
        self.assertTrue(result["topology"]["valid"])
        self.assertEqual(result["topology"]["solids"], 1)
        self.assertLess(result["topology"]["volume"], 8000)
        self.assertGreater(len(result["mesh"]["triangles"]), 12)

    def test_step_round_trip_preserves_valid_solid(self):
        box = feature("box", "box", {"width": 12, "depth": 10, "height": 8})
        exported = kernel.execute({"action": "export_step", "features": [box]})
        imported = feature("step", "step", {}, True, stepData=exported["step"])
        result = kernel.execute({"action": "evaluate", "features": [imported], "tolerance": 0.5})
        self.assertTrue(result["topology"]["valid"])
        self.assertEqual(result["topology"]["solids"], 1)
        self.assertAlmostEqual(result["topology"]["volume"], 960.0, places=3)


if __name__ == "__main__":
    unittest.main()
