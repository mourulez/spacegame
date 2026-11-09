"""Export the open .blend (or an imported .fbx/.obj) to .glb with the cel asset format's options, and report
what it carries.

Run by tools/blend-export.mjs:
  blender --background <file.blend> --python tools/blend-export.py -- <out.glb>
  blender --background --python tools/blend-export.py -- <out.glb> <file.fbx|file.obj>
The options are the ones verified for the format (docs/reference/SPEC-cel-shader-movil.md, section 11).
"""
import sys
from pathlib import Path

import bmesh
import bpy

args = sys.argv[sys.argv.index("--") + 1:]
out = args[0]
if len(args) > 1:
    # Another format: import it into an empty scene first.
    source = Path(args[1])
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.suffix.lower() == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(source))
    elif source.suffix.lower() == ".obj":
        bpy.ops.wm.obj_import(filepath=str(source))
    else:
        raise SystemExit(f"Can't import {source}")
    print(f"REPORT imported {source.name}")
scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()

# ---- Report: what the file carries of the format ----
print("REPORT objects")
total_tris = 0
for ob in sorted(scene.objects, key=lambda o: o.name):
    if ob.type == "MESH":
        mesh = ob.evaluated_get(depsgraph).to_mesh()
        mesh.calc_loop_triangles()
        tris = len(mesh.loop_triangles)
        total_tris += tris
        custom = sorted(a.name for a in mesh.attributes if a.name.startswith("_"))
        colors = [c.name for c in mesh.color_attributes]
        uvs = [u.name for u in mesh.uv_layers]
        mats = [s.material.name for s in ob.material_slots if s.material]
        print(f"  mesh  {ob.name}: {tris} tris, materials={mats}, uv={uvs}, colors={colors}, attributes={custom}, modifiers={[m.type for m in ob.modifiers]}")
        ob.evaluated_get(depsgraph).to_mesh_clear()
    elif ob.type == "EMPTY":
        props = {k: (list(v) if hasattr(v, "__len__") and not isinstance(v, str) else v) for k, v in ob.items()}
        print(f"  empty {ob.name}: props={props}")
    else:
        print(f"  {ob.type.lower()} {ob.name} ({'hidden' if ob.hide_get() or ob.hide_render else 'visible'})")
print(f"REPORT triangles {total_tris}")

for m in bpy.data.materials:
    if m.users == 0:
        continue
    zones = {k: list(v) for k, v in m.items() if k.startswith("cel_sw_")}
    images = []
    if m.node_tree:
        images = [f"{n.image.name} {tuple(n.image.size)}" for n in m.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    print(f"REPORT material {m.name}: images={images}, zones={zones}")

meshes = [o for o in scene.objects if o.type == "MESH"]
if meshes:
    xs, ys, zs = [], [], []
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ __import__("mathutils").Vector(corner)
            xs.append(w.x); ys.append(w.y); zs.append(w.z)
    print(f"REPORT size x={max(xs) - min(xs):.3f} y={max(ys) - min(ys):.3f} z={max(zs) - min(zs):.3f} (Blender axes: the nose should point to +Y, up +Z)")

# ---- Edge lines ----
# An edge is a line where the shading normals split (a hard edge) or where the mesh is open, plus the edges
# marked line_on, minus those marked line_off (boolean edge attributes, set in Edit Mode with Mesh > Set
# Attribute). glTF has no per-edge data, so each mesh is triangulated and every triangle corner gets _EDGE:
# its one-hot + 2 × the flags of the triangle's three edges (edge k is opposite corner k). Only in memory: the
# .blend is never saved.
for ob in [o for o in scene.objects if o.type == "MESH"]:
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(depsgraph), preserve_all_data_layers=True, depsgraph=depsgraph)
    normals = [c.vector.copy() for c in me.corner_normals]
    ends = {}  # edge index -> per adjacent face, the corner normal at each end vertex
    for poly in me.polygons:
        loops = list(poly.loop_indices)
        for i, li in enumerate(loops):
            lj = loops[(i + 1) % len(loops)]
            ends.setdefault(me.loops[li].edge_index, []).append({me.loops[li].vertex_index: normals[li], me.loops[lj].vertex_index: normals[lj]})
    line_on = me.attributes.get("line_on")
    line_off = me.attributes.get("line_off")
    lines = {}
    for edge in me.edges:
        faces = ends.get(edge.index, [])
        hard = len(faces) != 2 or any(faces[0][v].dot(faces[1][v]) < 0.9999 for v in edge.vertices)
        if line_on and line_on.data[edge.index].value:
            hard = True
        if line_off and line_off.data[edge.index].value:
            hard = False
        lines[tuple(sorted(edge.vertices))] = hard

    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])  # vertex indices stay the same
    bm.to_mesh(me)
    bm.free()
    attr = me.attributes.new("_EDGE", "FLOAT_VECTOR", "CORNER")
    for poly in me.polygons:
        corners = list(poly.loop_indices)
        v = [me.loops[l].vertex_index for l in corners]
        flags = [lines.get(tuple(sorted((v[(k + 1) % 3], v[(k + 2) % 3]))), False) for k in range(3)]  # diagonals: never
        for k, li in enumerate(corners):
            attr.data[li].vector = [(1.0 if j == k else 0.0) + 2.0 * flags[j] for j in range(3)]
    print(f"REPORT edges {ob.name}: {sum(lines.values())} line edges of {len(lines)}")

    name = ob.data.name
    ob.data.name = f"{name}.source"
    me.name = name
    ob.modifiers.clear()  # already applied in the evaluated copy
    ob.data = me

# ---- Export ----
options = {
    "filepath": out,
    "export_format": "GLB",
    "export_extras": True,  # custom properties -> extras
    "export_attributes": True,  # attributes starting with _ (_EDGE, _LINE, _LINE2, _SHADOW_BIAS, _OUTLINE_NORMAL)
    "export_vertex_color": "ACTIVE",  # COLOR_0: red = outline thickness
    "export_all_vertex_colors": True,
    "export_apply": True,  # modifiers applied
    "export_yup": True,
    "export_texcoords": True,
    "export_normals": True,
    "export_draco_mesh_compression_enable": False,  # the interchange .glb is uncompressed
    "export_cameras": False,
    "export_lights": False,
}
available = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
missing = [k for k in options if k not in available]
if missing:
    print(f"REPORT warning: this Blender's exporter has no {missing}; exporting without them")
bpy.ops.export_scene.gltf(**{k: v for k, v in options.items() if k in available})
print(f"REPORT exported {out}")
