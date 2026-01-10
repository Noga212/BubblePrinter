import * as THREE from 'three';
import { getSliceContours } from './geometry_utils.js';

export function runVerificationTests() {
    console.log("🚀 Starting Slicer Verification Tests...");

    const models = [
        { name: "Cube", mesh: new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10)) },
        { name: "Cylinder", mesh: new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 32)) },
        { name: "Sphere", mesh: new THREE.Mesh(new THREE.SphereGeometry(6, 32, 32)) }
    ];

    models.forEach(model => {
        console.group(`Testing Model: ${model.name}`);

        // Ensure matrix is updated
        model.mesh.updateMatrixWorld(true);

        const bbox = new THREE.Box3().setFromObject(model.mesh);
        const minZ = bbox.min.z;
        const maxZ = bbox.max.z;
        const step = (maxZ - minZ) / 6;

        for (let i = 1; i <= 5; i++) {
            const z0 = minZ + i * step;
            const contours = getSliceContours(model.mesh, z0);

            const status = contours.length > 0 ? "✅ PASS" : "❌ FAIL";
            const pointsCount = contours.reduce((sum, c) => sum + c.length, 0);
            console.log(`Height Z=${z0.toFixed(2)}: ${status} (${contours.length} loops, ${pointsCount} total points)`);

            if (contours.length > 0) {
                // Verify first and last points match (closed loop)
                contours.forEach((loop, idx) => {
                    const first = loop[0];
                    const last = loop[loop.length - 1];
                    const distance = Math.sqrt(Math.pow(first[0] - last[0], 2) + Math.pow(first[1] - last[1], 2));
                    if (distance > 0.01) {
                        console.warn(`      Loop ${idx} might not be closed! Dist: ${distance.toFixed(4)}`);
                    }
                });
            }
        }
        console.groupEnd();
    });

    console.log("✅ Verification Tests Complete.");
}
