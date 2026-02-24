BubblePrinter: 3D Slicing for Plastic-Bubble Fabrication
The Technology
This project supports a breakthrough 3D printing method developed at the Technion that utilizes plastic-bubble inflation instead of traditional filament extrusion.
It is designed to create lightweight, high-volume structures through a completely novel approach to additive manufacturing.

Academic Context
I am developing this software as a final project for my Computer Science degree. 
Working under academic supervision, I’ve been responsible for translating these unique mechanical requirements into a functional, user-friendly digital environment.

Step 1: The Custom Slicer
The first phase of development involved building a web-based slicer that can process OBJ models and adapt them for this specific technology. 
Unlike standard slicers, this tool handles the unique geometry and trajectories required to "print" with inflated plastic.

## Sample Models for Testing
You can download these sample OBJ models to test the slicer. 
**Note:** To download, **Right-click** on a link and select **"Save Link As..."**.

*   [**Cube**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/cube_simple.obj) - Simple 6-sided primitive.
*   [**Pyramid**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/pyramid.obj) - Sharp vertices and sloped flat faces.
*   [**Cone**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/cone_smooth.obj) - Smooth circular base and conical surface.
*   [**Cylinder**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/cylinder.obj) - Vertical walls and flat caps.
*   [**Octahedron**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/octahedron.obj) - Multiple diagonal intersections.
*   [**Tetrahedron**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/tetrahedron.obj) - Basic volumetric test.
*   [**Smooth Sphere**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/sphere_smooth.obj) - High-poly curvature test.
*   [**Torus Knot**](https://raw.githubusercontent.com/Noga212/BubblePrinter/main/models/torus_complex.obj) - Complex topology and overhangs.

Future Roadmap
Looking ahead, I plan to integrate a more advanced simulation engine to visualize how bubbles interact during the inflation process. 
I am also working on optimizing the slicing algorithms to support increasingly complex geometries while improving material efficiency.
