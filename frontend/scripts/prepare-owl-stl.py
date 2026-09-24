"""Convert the user-provided Z-up STL sculpture to browser-ready Y-up GLBs.

Usage: py -3 scripts/prepare-owl-stl.py <input.stl> <output-prefix>
Requires: trimesh, numpy, fast-simplification. The source STL is never modified.
"""

import math
import sys

import numpy as np
import trimesh


def colorize(part, name):
    points = part.vertices
    if name == "TreeStump":
        wave = np.sin(points[:, 0] * 27 + points[:, 1] * 11 + points[:, 2] * 19) * 3
        base = np.array([65, 65, 61], dtype=float)
    else:
        wave = np.sin(points[:, 0] * 19 + points[:, 1] * 13) * 4
        high_feathers = np.clip((points[:, 1] - 2.2) * 13, 0, 9)
        wave += high_feathers
        base = np.array([76, 83, 79], dtype=float)
    rgb = np.clip(base + wave[:, None] * np.array([1, 0.94, 0.78]), 0, 255).astype(np.uint8)
    part.visual.vertex_colors = np.column_stack([rgb, np.full(len(points), 255, dtype=np.uint8)])
    return part


def export_lod(parts, face_targets, destination):
    scene = trimesh.Scene()
    for name, part in parts.items():
        # Spatial cuts can leave tiny, detached STL chips; keep the connected bird/stump.
        part = max(part.split(only_watertight=False, repair=False), key=lambda component: len(component.faces))
        target = face_targets[name]
        if len(part.faces) > target:
            part = part.simplify_quadric_decimation(face_count=target)
        scene.add_geometry(colorize(part, name), geom_name=name, node_name=name)
    scene.export(destination)
    print(f"Exported {destination}: " + ", ".join(f"{n}={len(scene.geometry[n].faces)}" for n in parts))


def main(source, destination_prefix):
    mesh = trimesh.load(source, force="mesh")
    mesh = max(mesh.split(only_watertight=False), key=lambda part: len(part.faces))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [1, 0, 0]))
    mesh.apply_transform(trimesh.transformations.rotation_matrix(-math.pi / 2, [0, 1, 0]))
    mesh.apply_scale(3.8 / mesh.extents[1])
    bounds = mesh.bounds
    mesh.apply_translation([
        -(bounds[0, 0] + bounds[1, 0]) / 2,
        -bounds[0, 1],
        -(bounds[0, 2] + bounds[1, 2]) / 2,
    ])
    centers = mesh.triangles_center
    face_height = centers[:, 1]
    foot_x = np.abs(centers[:, 0])
    # The STL fuses the talons into the stump. Keep both legs/feet with the bird:
    # upper shanks include their back surfaces; lower hooked toes sit toward +Z.
    foot_region = (
        (face_height >= 0.92) & (foot_x >= 0.08) & (foot_x <= 0.43) & (centers[:, 2] > -0.25)
    ) | (
        (face_height >= 0.79) & (foot_x >= 0.12) & (foot_x <= 0.41) & (centers[:, 2] > 0.10)
    )
    owl_faces = (face_height >= 1.12) | foot_region
    parts = {
        "TreeStump": mesh.submesh([np.flatnonzero(~owl_faces)], append=True),
        "OwlBody": mesh.submesh([np.flatnonzero(owl_faces)], append=True),
    }
    export_lod(parts, {"TreeStump": 35000, "OwlBody": 120000}, destination_prefix + "-high.glb")
    export_lod(parts, {"TreeStump": 12000, "OwlBody": 50000}, destination_prefix + "-low.glb")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: prepare-owl-stl.py <input.stl> <output-prefix>")
    main(sys.argv[1], sys.argv[2])
