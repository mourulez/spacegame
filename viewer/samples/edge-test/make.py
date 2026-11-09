"""The edge-line test asset for the Blender path: a flat cube with one line_off edge (11 lines) and a cylinder
smoothed by angle with one line_on edge (33 lines). Builds edge-test.blend next to this file:

  blender --background --factory-startup --python viewer/samples/edge-test/make.py

then `npm run asset:blend -- viewer/samples/edge-test` exports it.
"""
import math
from pathlib import Path

import bpy

out = str(Path(__file__).with_name("edge-test.blend"))
bpy.ops.wm.read_factory_settings(use_empty=True)


def edge_attr(mesh, name, pick):
    attr = mesh.attributes.new(name, "BOOLEAN", "EDGE")
    chosen = [e.index for e in mesh.edges if pick(mesh, e)][:1]
    for i in chosen:
        attr.data[i].value = True
    print(f"{mesh.name}: {name} on edge {chosen}")


# Cube: flat shading, every edge hard (12). line_off on the top-back edge -> 11 lines.
bpy.ops.mesh.primitive_cube_add(size=2, location=(-2, 0, 0))
cube = bpy.context.active_object
cube.name = "cube"
cube.data.name = "cube"
bpy.ops.object.shade_flat()
edge_attr(cube.data, "line_off", lambda m, e: all(m.vertices[v].co.z > 0 and m.vertices[v].co.y > 0 for v in e.vertices))

# Cylinder: 16 sides, smoothed by angle (55°): only the two cap rims are hard (32). line_on on one side edge -> 33.
bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=1, depth=2, location=(2, 0, 0))
cyl = bpy.context.active_object
cyl.name = "cylinder"
cyl.data.name = "cylinder"
bpy.ops.object.shade_smooth_by_angle(angle=math.radians(55))
edge_attr(cyl.data, "line_on", lambda m, e: abs(m.vertices[e.vertices[0]].co.z - m.vertices[e.vertices[1]].co.z) > 1.5)

bpy.ops.wm.save_as_mainfile(filepath=out)
print("saved", out)
