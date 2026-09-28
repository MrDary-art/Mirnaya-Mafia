"""Make a transparent front-view fallback image of the web owl."""
from pathlib import Path
import bpy
from mathutils import Vector

root = Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(root / "work/owl_rebuild_v10.blend"))
scene = bpy.context.scene
rig = bpy.data.objects["OwlFlightRig"]
rig.animation_data.action = bpy.data.actions["TEST_Perch"]
scene.frame_set(24)

camera = bpy.data.objects["Review_ThreeQuarter"]
scene.camera = camera
camera.data.type = "ORTHO"
camera.location = (0, -7, 1.35)
camera.rotation_euler = (Vector((0, 0, 1.13)) - camera.location).to_track_quat("-Z", "Y").to_euler()
camera.data.ortho_scale = 2.6

scene.render.resolution_x = 900
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.filepath = str(root / "output/owl_v10_perched_poster.png")
bpy.ops.render.render(write_still=True)
print("OWL_WEB_POSTER", scene.render.filepath)
