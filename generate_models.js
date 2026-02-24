import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

// Ensure output directory exists
const outputDir = path.resolve('./models');
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function geometryToOBJ(geometry, name) {
    let output = `# BubblePrint Test Model: ${name}\n`;
    const vertices = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    const uvs = geometry.attributes.uv;
    const indices = geometry.index;

    // Vertices
    for (let i = 0; i < vertices.count; i++) {
        output += `v ${vertices.getX(i)} ${vertices.getY(i)} ${vertices.getZ(i)}\n`;
    }

    // Normals (optional for simple viewer but good practice)
    if (normals) {
        for (let i = 0; i < normals.count; i++) {
            output += `vn ${normals.getX(i)} ${normals.getY(i)} ${normals.getZ(i)}\n`;
        }
    }

    // Faces
    if (indices) {
        for (let i = 0; i < indices.count; i += 3) {
            // OBJ is 1-indexed
            const a = indices.getX(i) + 1;
            const b = indices.getX(i + 1) + 1;
            const c = indices.getX(i + 2) + 1;
            // f v//vn or f v if no normals. Let's do simple v
            // For correct shading we usually want f v/vt/vn. 
            // Simplified for this task: f v//vn
            output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
        }
    } else {
        // Non-indexed geometry
        for (let i = 0; i < vertices.count; i += 3) {
            const a = i + 1;
            const b = i + 2;
            const c = i + 3;
            output += `f ${a}//${a} ${b}//${b} ${c}//${c}\n`;
        }
    }

    return output;
}

// 1. Simple Cube
const cubeGeo = new THREE.BoxGeometry(10, 10, 10);
fs.writeFileSync(path.join(outputDir, 'cube_simple.obj'), geometryToOBJ(cubeGeo, 'Cube'));
console.log('Generated cube_simple.obj');

// 2. High Poly Sphere (Smoothness Test)
const sphereGeo = new THREE.SphereGeometry(7, 64, 64);
fs.writeFileSync(path.join(outputDir, 'sphere_smooth.obj'), geometryToOBJ(sphereGeo, 'Sphere'));
console.log('Generated sphere_smooth.obj');

// 3. Torus Knot (Complex Topology / Overhangs)
const torusGeo = new THREE.TorusKnotGeometry(5, 1.5, 128, 32);
fs.writeFileSync(path.join(outputDir, 'torus_complex.obj'), geometryToOBJ(torusGeo, 'TorusKnot'));
console.log('Generated torus_complex.obj');
// 4. Pyramid (Cone with 4 segments)
const pyramidGeo = new THREE.ConeGeometry(10, 15, 4);
fs.writeFileSync(path.join(outputDir, 'pyramid.obj'), geometryToOBJ(pyramidGeo, 'Pyramid'));
console.log('Generated pyramid.obj');

// 5. Smooth Cone
const coneGeo = new THREE.ConeGeometry(10, 15, 32);
fs.writeFileSync(path.join(outputDir, 'cone_smooth.obj'), geometryToOBJ(coneGeo, 'Cone'));
console.log('Generated cone_smooth.obj');

// 6. Cylinder
const cylinderGeo = new THREE.CylinderGeometry(7, 7, 15, 32);
fs.writeFileSync(path.join(outputDir, 'cylinder.obj'), geometryToOBJ(cylinderGeo, 'Cylinder'));
console.log('Generated cylinder.obj');

// 7. Octahedron
const octahedronGeo = new THREE.OctahedronGeometry(10);
fs.writeFileSync(path.join(outputDir, 'octahedron.obj'), geometryToOBJ(octahedronGeo, 'Octahedron'));
console.log('Generated octahedron.obj');

// 8. Tetrahedron
const tetrahedronGeo = new THREE.TetrahedronGeometry(10);
fs.writeFileSync(path.join(outputDir, 'tetrahedron.obj'), geometryToOBJ(tetrahedronGeo, 'Tetrahedron'));
console.log('Generated tetrahedron.obj');
