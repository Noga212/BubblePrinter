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
     * @param {number} overlapPercent - Overlap percentage (0-70)
     * @param {number} baseFlattenPercent - How much of the first layer spheres is flattened (0-100)
     * @returns {THREE.BufferGeometry|null}
     */
    generateGeometry(mesh, radius, overlapPercent = 0, baseFlattenPercent = 50) {
        console.log(`[BubbleGenerator] Generating geometry radius ${radius}, overlap ${overlapPercent}%, baseFlatten ${baseFlattenPercent}%...`);
        this.bubbleSize = radius;

        const geometries = [];

        // 1. Calculate Bounds
        const box = new THREE.Box3().setFromObject(mesh);
        const minZ = box.min.z;
        const maxZ = box.max.z;

        // Calculate layer step based on overlap
        const overlapFactor = 1 - (overlapPercent / 100);
        const layerStep = radius * overlapFactor;

        // thetaLength = PI  → full sphere (0% flatten)
        // thetaLength = PI/2 → top hemisphere only (50% flatten) — flat face at minZ+radius
        // thetaLength = 0   → nothing (100% flatten)
        //
        // How much to sink the entire bubble structure into the floor (minZ).
        // 0% -> 0 sink (full spheres resting on bed at single point).
        // 100% -> radius sink (hemispheres resting flat on bed).
        // We clamp it between 0 and 100 to avoid cutting above equator.
        const clampFlatten = Math.max(0, Math.min(100, baseFlattenPercent));
        const flattenOffset = radius * (clampFlatten / 100);

        // Calculate where to cut Layer 0 so it sits perfectly flat at exactly minZ.
        // -radius is the South Pole. + flattenOffset pushes the cut line up.
        const cosTheta = (-radius + flattenOffset) / radius;
        const thetaLength = Math.acos(cosTheta);

        console.log(`[BubbleGenerator] baseFlatten=${baseFlattenPercent}%, offset=${flattenOffset.toFixed(3)}, thetaLength=${thetaLength.toFixed(3)}`);

        let layerIndex = 0;
        // Start slightly above minZ so the slice edge-crossing test finds valid contours.
        // Slicing at *exactly* minZ returns nothing for flat-bottomed models because
        // no edge strictly crosses that plane — every bottom vertex sits exactly on it.
        let currentZ = minZ + radius * 0.01;

        // Loop...
        while (currentZ <= maxZ) {
            const contours = getSliceContours(mesh, currentZ);

            if (contours.length > 0) {
                const points = this.getGridPointsInContours(contours, box, radius * 2);

                points.forEach(p => {
                    const matrix = new THREE.Matrix4();

                    // Shift the ENTIRE bubble structure down uniformly by flattenOffset
                    const centerZ = (minZ + radius) + layerIndex * layerStep - flattenOffset;

                    matrix.makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        // Partial sphere: from north pole down by thetaLength.
                        // After rotateX(PI/2), pole = +Z, flat cut faces downward.
                        geo = new THREE.SphereGeometry(radius, 16, 12, 0, Math.PI * 2, 0, thetaLength);
                        geo.rotateX(Math.PI / 2);
                    } else {
                        geo = new THREE.SphereGeometry(radius, 16, 12);
                    }

                    geometries.push(geo.clone().applyMatrix4(matrix));
                });
            }
            currentZ += layerStep;
            layerIndex++;
        }

        if (geometries.length > 0) {
            console.log(`[BubbleGenerator] Merging ${geometries.length} bubbles across ${layerIndex} layers.`);
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
            return mergedGeo;
        } else {
            console.warn('[BubbleGenerator] No bubbles generated.');
            return null;
        }
    }


    /**
     * Returns grid points (x, y) that are inside the contours.
     */
    getGridPointsInContours(contours, box, spacing) {
        const points = [];
        // Grid bounds
        const startX = Math.floor(box.min.x / spacing) * spacing;
        const endX = Math.ceil(box.max.x / spacing) * spacing;
        const startY = Math.floor(box.min.y / spacing) * spacing;
        const endY = Math.ceil(box.max.y / spacing) * spacing;

        for (let x = startX; x <= endX; x += spacing) {
            for (let y = startY; y <= endY; y += spacing) {
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
