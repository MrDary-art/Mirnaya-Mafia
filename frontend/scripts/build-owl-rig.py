"""Build an editable, coloured Blender rig and browser GLBs from the prepared STL mesh.

Run with Blender 5.2+: blender -b --factory-startup --python scripts/build-owl-rig.py
The source STL and the two sculpture GLBs remain untouched.
"""

from pathlib import Path
import math
import sys

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public/assets/owl"
LOD = "low" if "--low" in sys.argv else "high"
SOURCE = ASSETS / f"owl-sculpture-{LOD}.glb"
OUTPUT = ASSETS / f"owl-rigged-{LOD}.glb"
BLEND = ROOT / "assets/owl-rig.blend"


def smooth(value, lo, hi):
    t = min(1.0, max(0.0, (value - lo) / (hi - lo)))
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, amount):
    return tuple(a[i] * (1 - amount) + b[i] * amount for i in range(3))


def colour_mesh(obj, stump=False):
    mesh = obj.data
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    old = mesh.color_attributes.get("Color")
    if old:
        mesh.color_attributes.remove(old)
    colors = mesh.color_attributes.new(name="Color", type="FLOAT_COLOR", domain="POINT")
    for vertex in mesh.vertices:
        x, y, z = vertex.co
        grain = math.sin(x * 51 + y * 21 + z * 9) * .5 + math.sin(x * 87 - y * 36 + z * 45) * .25
        if stump:
            stripe = math.sin(z * 18 + x * 31 + y * 12)
            base = mix((.043, .042, .038), (.15, .112, .074), smooth(stripe + grain * .3, -.85, .9))
            if z < .1:
                base = mix(base, (.09, .083, .067), .55)
        else:
            # Keep a graphite foundation while giving the feather planes a
            # readable jewel-toned emerald sheen under the dark UI lighting.
            base = (.105, .092, .078)
            wing = smooth(abs(x), .35, .72) * smooth(z, 2.19, 2.70)
            bars = math.sin(z * 22 + y * 25 + abs(x) * 11)
            base = mix(base, (.018, .082, .076), wing * .86)
            base = mix(base, (.17, .19, .13), wing * smooth(bars, .25, .85) * .45)
            iridescence = wing * smooth(-y, .07, .50) * (1 - smooth(abs(x), 1.1, 1.4))
            teal = smooth(math.sin(z * 7 + abs(x) * 10 + y * 3), .05, .8)
            violet = smooth(math.sin(z * 9 - abs(x) * 7 - y * 4), .15, .9)
            base = mix(base, (.006, .26, .145), iridescence * teal * .78)
            base = mix(base, (.13, .025, .23), iridescence * violet * .52)

            breast = (abs(x) < .49 and y < -.22 and 1.53 < z < 2.23)
            if breast:
                chevron = math.sin(z * 35 + x * 28) * math.sin(x * 48)
                base = mix(base, (.18, .13, .085), .66)
                base = mix(base, (.37, .27, .13), smooth(chevron, .30, .84) * .56)

            face = (abs(x) < .48 and y < -.28 and 1.95 < z < 2.68)
            if face:
                mask = (1 - smooth(abs(x), .30, .47)) * smooth(-y, .31, .62)
                mask *= smooth(z, 1.95, 2.08) * (1 - smooth(z, 2.54, 2.68))
                base = mix(base, (.25, .22, .18), mask * .85)

            if z < 1.53 and abs(x) < .43:
                base = mix(base, (.18, .12, .065), .75)
                if z < .96 and y < -.20:
                    base = mix(base, (.085, .075, .055), .45)

            fleck = max(-.043, min(.043, grain * .053))
            base = tuple(max(.014, min(.7, c + fleck)) for c in base)

            # Paint the original eye domes in place, with a shaded disk and iris.
            eye_distance = min(math.hypot(x - sign * .13, z - 2.19) for sign in (-1, 1))
            eye_front = smooth(-y, .84, .93)
            disk = (1 - smooth(eye_distance, .105, .165)) * eye_front
            iris = (1 - smooth(eye_distance, .044, .061)) * eye_front
            pupil = (1 - smooth(eye_distance, .022, .032)) * eye_front
            base = mix(base, (.026, .027, .025), disk * .75)
            base = mix(base, (.76, .39, .025), iris)
            base = mix(base, (.003, .005, .005), pupil)
            if abs(x) < .065 and y < -.82 and 1.96 < z < 2.13:
                base = mix(base, (.09, .10, .10), .65)
        colors.data[vertex.index].color = (*base, 1.0)

    material = bpy.data.materials.new("Weathered wood" if stump else "Natural owl plumage")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    material.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = .92 if stump else .67
    bsdf.inputs["Metallic"].default_value = 0 if stump else .015
    mesh.materials.clear()
    mesh.materials.append(material)


def build_armature():
    arm_data = bpy.data.armatures.new("Owl flight skeleton")
    arm = bpy.data.objects.new("OwlRig", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None):
        item = arm_data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = arm_data.edit_bones[parent]
        return item

    bone("Root", (0, 0, 1.15), (0, 0, 1.45))
    bone("Body", (0, 0, 1.45), (0, 0, 2.48), "Root")
    bone("Chest", (0, -.15, 1.70), (0, -.18, 2.05), "Body")
    bone("UpperChest", (0, -.10, 2.02), (0, -.09, 2.30), "Chest")
    bone("Neck01", (0, -.06, 2.10), (0, -.06, 2.25), "UpperChest")
    bone("Neck02", (0, -.06, 2.25), (0, -.07, 2.40), "Neck01")
    bone("Neck03", (0, -.07, 2.40), (0, -.08, 2.55), "Neck02")
    bone("Head", (0, -.08, 2.55), (0, -.08, 2.79), "Neck03")
    bone("TailBase", (0, .32, 1.53), (0, .62, 1.41), "Body")
    bone("TailCenter", (0, .62, 1.41), (0, .82, 1.29), "TailBase")
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"Eye.{side}", (sign * .13, -.90, 2.19), (sign * .13, -1.02, 2.19), "Head")
        bone(f"Clavicle.{side}", (sign * .23, .04, 2.26), (sign * .31, .06, 2.33), "UpperChest")
        bone(f"Wing.{side}.Upper", (sign * .30, .06, 2.32), (sign * .78, .09, 3.05), f"Clavicle.{side}")
        bone(f"Wing.{side}.Tip", (sign * .78, .09, 3.05), (sign * 1.34, .12, 3.64), f"Wing.{side}.Upper")
        for i, y in enumerate((-.49, -.17, .17, .49), 1):
            bone(f"Feather.{side}.{i:02d}", (sign * .90, y, 3.13), (sign * 1.29, y, 3.62), f"Wing.{side}.Tip")
        bone(f"Tail.{side}", (sign * .12, .62, 1.39), (sign * .28, .89, 1.25), "TailCenter")
        bone(f"Hip.{side}", (sign * .23, 0, 1.42), (sign * .23, -.03, 1.18), "Body")
        bone(f"Knee.{side}", (sign * .23, -.03, 1.18), (sign * .23, -.06, 1.02), f"Hip.{side}")
        bone(f"Ankle.{side}", (sign * .23, -.06, 1.02), (sign * .23, -.12, .91), f"Knee.{side}")
        bone(f"Toe.{side}", (sign * .23, -.12, .91), (sign * .23, -.32, .78), f"Ankle.{side}")
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.select_set(False)
    arm.show_in_front = True
    return arm


def add_weights(body, arm):
    names = ["Body", "Chest", "UpperChest", "Neck01", "Neck02", "Neck03", "Head", "TailBase", "TailCenter"]
    for side in ("L", "R"):
        names += [f"Wing.{side}.Upper", f"Wing.{side}.Tip"]
        names += [f"Feather.{side}.{i:02d}" for i in range(1, 5)]
        names += [f"Tail.{side}", f"Hip.{side}", f"Knee.{side}", f"Ankle.{side}", f"Toe.{side}"]
    groups = {name: body.vertex_groups.new(name=name) for name in names}
    for vertex in body.data.vertices:
        x, y, z = vertex.co
        distance = abs(x)
        side = "L" if x >= 0 else "R"
        wing = smooth(distance, .24, .58) * smooth(z, 2.16, 2.58)
        wing *= max(smooth(distance, .50, .72), smooth(y, -.67, -.25))
        head = (1 - smooth(distance, .26, .43)) * smooth(z, 2.00, 2.16)
        head *= (1 - smooth(z, 2.63, 2.82)) * (1 - smooth(y, -.45, -.05))
        head = min(head, 1 - wing)
        chest = (1 - smooth(distance, .28, .48)) * smooth(z, 1.55, 1.72)
        chest *= (1 - smooth(z, 2.16, 2.35)) * (1 - smooth(y, -.47, -.12)) * .23
        upper_chest = chest * smooth(z, 1.95, 2.18) * .35
        chest -= upper_chest
        neck = (1 - smooth(distance, .23, .43)) * smooth(z, 2.02, 2.19)
        neck *= (1 - smooth(z, 2.46, 2.66)) * smooth(y, -.20, .13) * .28
        neck_weights = [neck * (1 - smooth(z, 2.17, 2.31)),
                        neck * smooth(z, 2.17, 2.31) * (1 - smooth(z, 2.34, 2.49)),
                        neck * smooth(z, 2.34, 2.49)]
        tail = smooth(y, .32, .61) * (1 - smooth(z, 1.70, 2.03))
        tail *= (1 - smooth(distance, .38, .58)) * .70
        tail_tip = tail * smooth(y, .61, .84)
        tail_side = tail_tip * smooth(distance, .11, .28) * .42
        legs = smooth(distance, .08, .17) * (1 - smooth(distance, .39, .49))
        legs *= 1 - smooth(z, 1.44, 1.60)
        hip = legs * smooth(z, 1.11, 1.35) * .90
        knee = legs * smooth(z, 1.00, 1.17) * (1 - smooth(z, 1.22, 1.40)) * .90
        ankle = legs * smooth(z, .89, 1.00) * (1 - smooth(z, 1.09, 1.20)) * .92
        toe = legs * (1 - smooth(z, .87, 1.00)) * .94
        tip = smooth(distance, .67, 1.10) * smooth(z, 2.76, 3.19)
        feather = smooth(distance, .86, 1.17) * smooth(z, 2.91, 3.27) * .58
        weights = {"Body": 0, "Chest": chest, "UpperChest": upper_chest,
                   "Neck01": neck_weights[0], "Neck02": neck_weights[1],
                   "Neck03": neck_weights[2], "Head": head,
                   "TailBase": tail - tail_tip, "TailCenter": tail_tip - tail_side,
                   f"Tail.{side}": tail_side, f"Hip.{side}": hip,
                   f"Knee.{side}": knee, f"Ankle.{side}": ankle, f"Toe.{side}": toe,
                   f"Wing.{side}.Upper": wing * (1 - tip),
                   f"Wing.{side}.Tip": wing * tip * (1 - feather)}
        # Across the fan, four independent secondary controls add small lag.
        if feather > 0:
            lanes = [max(0, 1 - abs(y - center) / .32) for center in (-.49, -.17, .17, .49)]
            total = sum(lanes)
            for i, lane in enumerate(lanes, 1):
                weights[f"Feather.{side}.{i:02d}"] = wing * tip * feather * lane / total if total else 0
        deformation = sum(weights.values())
        weights["Body"] = max(0, 1 - deformation)
        # glTF skinning stores four influences per vertex. Prune explicitly so
        # Blender and the browser use the same normalized deformation.
        strongest = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _, weight in strongest)
        for name, weight in strongest:
            if weight > .0001:
                groups[name].add([vertex.index], weight / total, "REPLACE")
    modifier = body.modifiers.new("Owl skin", "ARMATURE")
    modifier.object = arm
    body.parent = arm


def add_pupil_markers(arm):
    # The STL has fixed painted irises. Small, near-flush dark pupils give the
    # eye bones a visible gaze without adding the bulging eyeballs rejected in QA.
    material = bpy.data.materials.new("Owl dark pupils")
    material.diffuse_color = (.006, .008, .009, 1)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.006, .008, .009, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .16
    for side, sign in (("L", 1), ("R", -1)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=1)
        pupil = bpy.context.object
        pupil.name = f"Pupil.{side}"
        for vertex in pupil.data.vertices:
            vertex.co = (sign * .13 + vertex.co.x * .019,
                         -.976 + vertex.co.y * .009,
                         2.19 + vertex.co.z * .019)
        pupil.data.materials.append(material)
        group = pupil.vertex_groups.new(name=f"Eye.{side}")
        group.add(list(range(len(pupil.data.vertices))), 1, "REPLACE")
        modifier = pupil.modifiers.new("Eye skin", "ARMATURE")
        modifier.object = arm
        pupil.parent = arm


def add_eyelids(arm):
    material = bpy.data.materials.new("Owl eyelids")
    material.diffuse_color = (.15, .15, .145, 1)
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (.15, .15, .145, 1)
    material.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = .9
    for side, sign in (("L", 1), ("R", -1)):
        for part, center_z, thickness in (("Upper", 2.256, .023), ("Lower", 2.126, .013)):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=10, radius=1)
            lid = bpy.context.object
            lid.name = f"Lid{part}.{side}"
            for vertex in lid.data.vertices:
                vertex.co = (sign * .13 + vertex.co.x * .068,
                             -.984 + vertex.co.y * .010,
                             center_z + vertex.co.z * thickness)
            lid.shape_key_add(name="Open")
            closed = lid.shape_key_add(name="Closed")
            for vertex in closed.data:
                offset = (vertex.co.z - center_z) / thickness
                vertex.co.y = -1.025 + (vertex.co.y + .984) * .35
                if part == "Upper":
                    vertex.co.z = 2.207 + offset * .049
                else:
                    vertex.co.z = 2.140 + offset * .021
            lid.data.materials.append(material)
            group = lid.vertex_groups.new(name=f"Eye.{side}")
            group.add(list(range(len(lid.data.vertices))), 1, "REPLACE")
            modifier = lid.modifiers.new("Eyelid skin", "ARMATURE")
            modifier.object = arm
            lid.parent = arm


def add_action(arm, name, keys, frames=72):
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    for frame, poses in keys:
        for bone_name, angles in poses.items():
            pose = arm.pose.bones[bone_name]
            pose.rotation_mode = "XYZ"
            pose.rotation_euler = angles
            pose.keyframe_insert(data_path="rotation_euler", frame=frame, group=bone_name)
    # Store as a named NLA clip so glTF exports all four actions deterministically.
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.action_frame_start = 1
    strip.action_frame_end = frames
    arm.animation_data.action = None


def pose(wing=.0, tip=.0, feather=.0, sweep=.0):
    values = {"Head": (0, 0, 0)}
    for side, sign in (("L", 1), ("R", -1)):
        values[f"Wing.{side}.Upper"] = (0, sign * sweep, sign * wing)
        values[f"Wing.{side}.Tip"] = (0, 0, sign * tip)
        for i in range(1, 5):
            values[f"Feather.{side}.{i:02d}"] = (
                0, sign * feather * .35, sign * feather * (1 + i * .09)
            )
    return values


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(SOURCE))
body = bpy.data.objects["OwlBody"]
stump = bpy.data.objects["TreeStump"]
colour_mesh(body)
colour_mesh(stump, stump=True)
arm = build_armature()
add_weights(body, arm)
add_pupil_markers(arm)
add_eyelids(arm)
add_action(arm, "Idle", [(1, pose(-1.90, -.18, .03, -1.25)),
                         (19, pose(-1.87, -.16, .055, -1.22)),
                         (37, pose(-1.90, -.18, .03, -1.25)),
                         (55, pose(-1.93, -.19, -.035, -1.28)),
                         (73, pose(-1.90, -.18, .03, -1.25))])
add_action(arm, "Takeoff", [(1, pose(-1.90, -.18, .03, -1.25)),
                            (7, pose(.04, .13, -.10, -.12)),
                            (15, pose(-1.64, -.20, .10, -.88)),
                            (22, pose(.08, .15, -.10, -.12)),
                            (30, pose(-1.39, -.16, .08, -.75)),
                            (37, pose(-.72, -.10, .04, -.35))], 37)
add_action(arm, "Glide", [(1, pose(-.72, -.10, .05, -.35)),
                          (18, pose(-.58, -.07, -.04, -.32)),
                          (36, pose(-.72, -.10, .05, -.35))], 36)
add_action(arm, "Land", [(1, pose(-.72, -.10, .06, -.35)),
                         (10, pose(.03, .12, -.08, -.12)),
                         (20, pose(-1.48, -.17, .07, -.90)),
                         (29, pose(-1.90, -.18, .03, -1.25))], 29)
bpy.context.scene.render.fps = 30

if LOD == "high":
    BLEND.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB",
                          export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_skins=True, export_apply=False)
print("OWL_RIG", OUTPUT, OUTPUT.stat().st_size, "bytes", BLEND)
