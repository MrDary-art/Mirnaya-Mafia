"""Render quick front/three-quarter rig QA stills with Blender Workbench."""

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / "assets/owl-rig.blend"))
scene = bpy.context.scene
arm = bpy.data.objects["OwlRig"]
for track in arm.animation_data.nla_tracks:
    track.mute = True
camera_data = bpy.data.cameras.new("Rig QA camera")
camera = bpy.data.objects.new("Rig QA camera", camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera_data.type = "ORTHO"
camera_data.ortho_scale = 4.7
scene.render.engine = "BLENDER_EEVEE"
scene.render.image_settings.file_format = "PNG"
scene.world.color = (.12, .12, .12)
for name, location, energy, size in (
    ("Warm key", (3, -4, 7), 180, 5),
    ("Cool fill", (-4, -2, 4), 110, 6),
    ("Rim", (0, 4, 5), 160, 4),
):
    light_data = bpy.data.lights.new(name, "AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0, 0, 2)) - light.location).to_track_quat("-Z", "Y").to_euler()
scene.render.resolution_x = 850
scene.render.resolution_y = 850
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.view_settings.view_transform = "Standard"
folder = ROOT.parent / "docs/design/qa"
folder.mkdir(parents=True, exist_ok=True)

for name, angle, action, frame in (
    ("owl-rig-rest", (0, -9, 2.8), "Idle", 1),
    ("owl-rig-takeoff", (0, -9, 2.8), "Takeoff", 15),
    ("owl-rig-quarter", (6, -7, 3.3), "Glide", 18),
):
    arm.animation_data.action = bpy.data.actions[action]
    scene.frame_set(frame)
    camera.location = angle
    direction = Vector((0, 0, 2.05)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = str(folder / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("OWL_QA", name, scene.render.filepath)

arm.animation_data_clear()
scene.frame_set(1)
for wing_angle, wing_sweep in ((-1.8, 0), (-2.2, 0), (-1.8, -.9), (-1.9, -1.25), (-1.9, -1.5)):
    for bone in arm.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0, 0, 0)
    for side, sign in (("L", 1), ("R", -1)):
        arm.pose.bones[f"Wing.{side}.Upper"].rotation_euler.z = sign * wing_angle
        arm.pose.bones[f"Wing.{side}.Upper"].rotation_euler.y = sign * wing_sweep
        arm.pose.bones[f"Wing.{side}.Tip"].rotation_euler.z = sign * -.18
    bpy.context.view_layer.update()
    camera.location = (0, -9, 2.8)
    camera.rotation_euler = (Vector((0, 0, 2.05)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    name = f"owl-rig-fold-{abs(wing_angle):.2f}-sweep-{wing_sweep:+.1f}"
    scene.render.filepath = str(folder / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("OWL_QA", name, scene.render.filepath)

for name, hidden in (("owl-rig-stump-only", "OwlBody"), ("owl-rig-body-only", "TreeStump")):
    bpy.data.objects["OwlBody"].hide_render = hidden == "OwlBody"
    bpy.data.objects["TreeStump"].hide_render = hidden == "TreeStump"
    for bone in arm.pose.bones:
        bone.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    scene.render.filepath = str(folder / f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("OWL_QA", name, scene.render.filepath)
    if hidden == "OwlBody":
        camera.location = (7, -6, 3.0)
        camera.rotation_euler = (Vector((0, 0, 1.3)) - camera.location).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = str(folder / "owl-rig-stump-quarter.png")
        bpy.ops.render.render(write_still=True)
        camera.location = (0, -9, 2.8)
        camera.rotation_euler = (Vector((0, 0, 2.05)) - camera.location).to_track_quat("-Z", "Y").to_euler()
