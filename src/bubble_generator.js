import * as THREE from 'three';
import { getSliceContours } from './geometry_utils_v2.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export class BubbleGenerator {
    constructor() {
        // No scene or mesh management anymore. Pure logic.
        this.bubbleSize = 0.5;
    }

    /**
     * Generates a merged BufferGeometry of bubbles based on the input mesh.
     * @param {THREE.Object3D} mesh - The reference mesh to voxelize
     * @param {number} radius - Radius of bubbles
     * @param {number} overlapV - Vertical overlap percentage (0-70)
     * @param {number} overlapH - Horizontal overlap percentage (0-70)
     * @param {number} baseFlattenPercent - How much of the first layer spheres is flattened (0-100)
     * @returns {THREE.BufferGeometry|null}
     */
    generateGeometry(mesh, radius, overlapV = 0, overlapH = 0, baseFlattenPercent = 50) {
        console.log(`[BubbleGenerator] Generating Version 24 (Absolute Stability): radius ${radius}, overlapV ${overlapV}%, overlapH ${overlapH}%, baseFlatten ${baseFlattenPercent}%`);
        this.bubbleSize = radius;

        const geometries = [];

        // 1. Calculate Bounds
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const minZ = box.min.z;
        const maxZ = box.max.z;

        // Calculate steps based on overlap
        const overlapFactorV = 1 - (overlapV / 100);
        const layerStep = (radius * 2) * overlapFactorV;

        const overlapFactorH = 1 - (overlapH / 100);
        const horizontalStep = (radius * 2) * overlapFactorH;

        // Base Flattening Logic:
        const thetaLength = Math.PI * (1 - (Math.max(0, Math.min(100, baseFlattenPercent)) / 100));

        // Calculate the base translation so the cut face sits exactly at minZ.
        const baseZOffset = - (radius * Math.cos(thetaLength));
        const centerZ0 = minZ + baseZOffset;

        console.log(`[BubbleGenerator] baseFlatten=${baseFlattenPercent}%, centerZ0=${centerZ0.toFixed(3)}`);

        let layerIndex = 0;

        // Loop until we reach the top of the model
        while (true) {
            const centerZ = centerZ0 + layerIndex * layerStep;

            // If the bottom of the current bubble is above maxZ, we stop.
            if (centerZ - radius > maxZ) break;

            // Define a sampling height for the mesh contours.
            // We sample at centerZ, but clamp it to be slightly inside the mesh bounds.
            let sampleZ = Math.min(maxZ - 0.01, Math.max(minZ + 0.01, centerZ));

            const contours = getSliceContours(mesh, sampleZ);

            if (contours.length > 0) {
                const points = this.getGridPointsInContours(contours, box, horizontalStep);

                points.forEach(p => {
                    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        geo = new THREE.SphereGeometry(radius, 16, 12, 0, Math.PI * 2, 0, thetaLength);
                    } else {
                        geo = new THREE.SphereGeometry(radius, 16, 12);
                    }

                    // Rotate ALL spheres so poles are on the Z axis (Vertical).
                    geo.rotateX(Math.PI / 2);

                    geometries.push(geo.clone().applyMatrix4(matrix));
                });
            }

            layerIndex++;
            // Safety break
            if (layerIndex > 700) break;
        }

        if (geometries.length > 0) {
            console.log(`[BubbleGenerator] Merged ${geometries.length} bubbles.`);
            return BufferGeometryUtils.mergeGeometries(geometries);
        } else {
            console.warn('[BubbleGenerator] No bubbles generated.');
            return null;
        }
    }


    /**
     * Returns grid points (x, y) that are inside the contours.
     * Truly absolute world-grid anchored at (0,0).
     */
    getGridPointsInContours(contours, box, spacing) {
        const points = [];

        // Find the range of indices 'n' that cover the bounding box relative to (0,0).
        const startN = Math.floor((box.min.x - (spacing / 2)) / spacing);
        const endN = Math.ceil((box.max.x - (spacing / 2)) / spacing);

        const startM = Math.floor((box.min.y - (spacing / 2)) / spacing);
        const endM = Math.ceil((box.max.y - (spacing / 2)) / spacing);

        for (let n = startN; n <= endN; n++) {
            const x = n * spacing + (spacing / 2);
            for (let m = startM; m <= endM; m++) {
                const y = m * spacing + (spacing / 2);

                // Check if (x,y) is inside any contour
                if (this.isPointInContours(x, y, contours)) {
                    points.push({ x, y });
                }
            }
        }
        return points;
    }

    /**
     * Ray casting algorithm to check if point is inside contours.
     */
    isPointInContours(x, y, contours) {
        let inside = false;
        for (const polygon of contours) {
            // polygon is array of [x, y]
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];

                const intersect = ((yi > y) !== (yj > y)) &&
                    (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) inside = !inside;
            }
        }
        return inside;
    }
}
