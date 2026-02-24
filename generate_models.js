import * as THREE from 'three';
import fs from 'fs';
import path from 'path';

// Ensure output directories exist
const rootModelsDir = path.resolve('./models');
const publicModelsDir = path.resolve('./public/models');

[rootModelsDir, publicModelsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

function writeModel(filename, content) {
    fs.writeFileSync(path.join(rootModelsDir, filename), content);
    fs.writeFileSync(path.join(publicModelsDir, filename), content);
    console.log(`Generated ${filename} in both root and public directories`);
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
writeModel('cube_simple.obj', geometryToOBJ(cubeGeo, 'Cube'));

// 2. High Poly Sphere (Smoothness Test)
const sphereGeo = new THREE.SphereGeometry(7, 64, 64);
writeModel('sphere_smooth.obj', geometryToOBJ(sphereGeo, 'Sphere'));

// 3. Torus Knot (Complex Topology / Overhangs)
const torusGeo = new THREE.TorusKnotGeometry(5, 1.5, 128, 32);
writeModel('torus_complex.obj', geometryToOBJ(torusGeo, 'TorusKnot'));

// 4. Pyramid (Cone with 4 segments)
const pyramidGeo = new THREE.ConeGeometry(10, 15, 4);
writeModel('pyramid.obj', geometryToOBJ(pyramidGeo, 'Pyramid'));

// 5. Smooth Cone
const coneGeo = new THREE.ConeGeometry(10, 15, 32);
writeModel('cone_smooth.obj', geometryToOBJ(coneGeo, 'Cone'));

// 6. Cylinder
const cylinderGeo = new THREE.CylinderGeometry(7, 7, 15, 32);
writeModel('cylinder.obj', geometryToOBJ(cylinderGeo, 'Cylinder'));

// 7. Octahedron
const octahedronGeo = new THREE.OctahedronGeometry(10);
writeModel('octahedron.obj', geometryToOBJ(octahedronGeo, 'Octahedron'));

// 8. Tetrahedron
const tetrahedronGeo = new THREE.TetrahedronGeometry(10);
writeModel('tetrahedron.obj', geometryToOBJ(tetrahedronGeo, 'Tetrahedron'));
