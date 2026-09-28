"""Export the approved working owl for the web without changing its .blend."""
from pathlib import Path
import sys
import bpy

root = Path(__file__).resolve().parents[1]
source = root / "work/owl_rebuild_v10.blend"
home = "--home" in sys.argv
compressed = "--draco" in sys.argv or home
material_fix = "--material-fix" in sys.argv
destination = root / ("output/owl_flight_web_v10_draco_materialfix.glb" if material_fix else
                      "output/owl_flight_home_v10.glb" if home else
                      "output/owl_flight_web_v10_draco.glb" if compressed else
                      "output/owl_flight_web_v10.glb")

bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
rig = bpy.data.objects["OwlFlightRig"]

# The glTF exporter cannot translate several Blender Noise/Ramp node chains.
# Make the web copy use the artists' flat material colors for those parts.
# Materials driven by COLOR_0 (iris and torso) remain untouched.
if material_fix:
    for name in (
        "Owl_Facial_Eyelid_Lower", "Owl_Facial_Eyelid_Plume",
        "Rebuild_Talons_Horn", "Rebuild_Leg_Feathers", "Rebuild_Foot_Ochre",
        "Rebuild_Foot_Scutes",
    ):
        material = bpy.data.materials.get(name)
        if material is None:
            continue
        nodes = material.node_tree.nodes
        bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
        color = bsdf.inputs["Base Color"]
        for link in list(color.links):
            material.node_tree.links.remove(link)
        color.default_value = material.diffuse_color

    # The original mixed Transparent/Principled shader was exported as an
    # opaque pale shell, hiding both pupils. A low-alpha Principled surface
    # is directly supported by glTF's BLEND material mode.
    cornea = bpy.data.materials["Owl_Cornea_Transparent"]
    nodes = cornea.node_tree.nodes
    bsdf = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    output = next(node for node in nodes if node.type == "OUTPUT_MATERIAL")
    for link in list(output.inputs["Surface"].links):
        cornea.node_tree.links.remove(link)
    cornea.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    bsdf.inputs["Alpha"].default_value = 0.08
    bsdf.inputs["Base Color"].default_value = (0.7, 0.78, 0.8, 1)

if home:
    rig.animation_data.action = bpy.data.actions["FlightLoop"]
backup = bpy.data.collections["_BACKUP_ORIGINAL"]
backup_objects = set(backup.all_objects)

bpy.ops.object.select_all(action="DESELECT")
chosen = [rig]
for obj in bpy.data.objects:
    if obj.type == "MESH" and obj not in backup_objects:
        chosen.append(obj)
for obj in chosen:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
scene.frame_set(1)

result = bpy.ops.export_scene.gltf(
    filepath=str(destination),
    export_format="GLB",
    use_selection=True,
    export_animations=True,
    export_animation_mode="ACTIVE_ACTIONS" if home else "ACTIONS",
    export_anim_single_armature=True,
    export_skins=True,
    export_morph=True,
    export_yup=True,
    export_draco_mesh_compression_enable=compressed,
    export_draco_mesh_compression_level=6,
)
print("OWL_WEB_EXPORT", result, str(destination), destination.stat().st_size)
print("SELECTED_OBJECTS", len(chosen), "MESHES", len(chosen) - 1)
