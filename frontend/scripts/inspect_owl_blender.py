"""Inspect the prepared owl GLB inside Blender: blender -b --python this-file."""

from pathlib import Path

import bpy
from mathutils import Vector


source = Path(__file__).resolve().parents[1] / "public/assets/owl/owl-sculpture-high.glb"
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(source))
for obj in bpy.context.scene.objects:
    if obj.type != "MESH":
        continue
    world_bounds = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    lows = [min(point[i] for point in world_bounds) for i in range(3)]
    highs = [max(point[i] for point in world_bounds) for i in range(3)]
    print("OWL_INSPECT", obj.name, "verts", len(obj.data.vertices), "faces", len(obj.data.polygons))
    print("OWL_BOUNDS", obj.name, "local", list(obj.dimensions), "world", lows, highs)
    print("OWL_MATRIX", obj.name, [list(row) for row in obj.matrix_world])
    print("OWL_COLORS", obj.name, [(attribute.name, attribute.domain, attribute.data_type) for attribute in obj.data.color_attributes])
