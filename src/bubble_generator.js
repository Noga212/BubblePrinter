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
    generateGeometry(mesh, radius, overlapV = 0, overlapH = 0, baseFlattenPercent = 50, arrangement = 'grid', sizeMode = 'uniform') {
        console.log(`[BubbleGenerator] Generating Mode: ${sizeMode}, radius ${radius}, overlapV ${overlapV}%, overlapH ${overlapH}%, baseFlatten ${baseFlattenPercent}%, arr ${arrangement}`);
        this.bubbleSize = radius;

        const geometries = [];

        // 1. Calculate Bounds
        mesh.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(mesh);
        const minZ = box.min.z;
        const maxZ = box.max.z;

        // Calculate steps based on overlap
        const overlapFactorV = 1 - (overlapV / 100);
        const overlapFactorH = 1 - (overlapH / 100);

        const meanRadius = radius;
        const minRadius = meanRadius * 0.5;
        const maxRadius = meanRadius * 1.5;
        const maxShellDepth = meanRadius * 4;

        let firstLayerRadius = meanRadius;
        if (sizeMode === 'z_gradient_down') firstLayerRadius = maxRadius;
        if (sizeMode === 'z_gradient_up') firstLayerRadius = minRadius;

        // Base Flattening Logic:
        const thetaLength = Math.PI * (1 - (Math.max(0, Math.min(100, baseFlattenPercent)) / 100));
        const baseZOffset = - (firstLayerRadius * Math.cos(thetaLength));
        let centerZ = minZ + baseZOffset;

        console.log(`[BubbleGenerator] baseFlatten=${baseFlattenPercent}%, centerZ0=${centerZ.toFixed(3)}`);

        let layerIndex = 0;

        // Loop until we reach the top of the model
        while (true) {
            let currentLayerRadius = meanRadius;
            let currentZProgress = (maxZ > minZ) ? Math.max(0, Math.min(1, (centerZ - minZ) / (maxZ - minZ))) : 0;
            
            if (sizeMode === 'z_gradient_down') {
                currentLayerRadius = maxRadius - currentZProgress * (maxRadius - minRadius);
            } else if (sizeMode === 'z_gradient_up') {
                currentLayerRadius = minRadius + currentZProgress * (maxRadius - minRadius);
            }

            // If the bottom of the current bubble is above maxZ, we stop.
            if (centerZ - currentLayerRadius > maxZ) break;

            // Define a sampling height for the mesh contours.
            let sampleZ = Math.min(maxZ - 0.01, Math.max(minZ + 0.01, centerZ));

            const contours = getSliceContours(mesh, sampleZ);

            if (contours.length > 0) {
                let points = [];
                let horizontalStep = (currentLayerRadius * 2) * overlapFactorH;

                if (arrangement === 'oranges') {
                    points = this.getOrangesPointsInContours(contours, box, horizontalStep, layerIndex);
                } else if (arrangement === 'rejection') {
                    points = this.getRejectionSamplingPointsInContours(contours, box, horizontalStep, layerIndex);
                } else {
                    points = this.getGridPointsInContours(contours, box, horizontalStep);
                }

                points.forEach(p => {
                    let bubbleRadius = currentLayerRadius;

                    if (sizeMode === 'shell_gradient_in' || sizeMode === 'adaptive') {
                        const dist = this.distanceToContours(p.x, p.y, contours);
                        if (sizeMode === 'adaptive') {
                            bubbleRadius = dist < maxShellDepth ? minRadius : maxRadius;
                        } else {
                            const t = Math.min(dist / maxShellDepth, 1.0);
                            bubbleRadius = minRadius + t * (maxRadius - minRadius);
                        }
                    }

                    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        geo = new THREE.SphereGeometry(bubbleRadius, 16, 12, 0, Math.PI * 2, 0, thetaLength);
                    } else {
                        geo = new THREE.SphereGeometry(bubbleRadius, 16, 12);
                    }

                    // Rotate ALL spheres so poles are on the Z axis (Vertical).
                    geo.rotateX(Math.PI / 2);

                    geometries.push(geo.clone().applyMatrix4(matrix));
                });
            }

            let layerStep = (currentLayerRadius * 2) * overlapFactorV;
            if (arrangement === 'oranges') {
                layerStep = (currentLayerRadius * 2) * Math.sqrt(2/3) * overlapFactorV;
            }
            
            centerZ += layerStep;
            layerIndex++;

            // Safety break
            if (layerIndex > 2000) break;
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
     * Calculates shortest distance from point to any contour edge
     */
    distanceToContours(x, y, contours) {
        let minDist = Infinity;
        for (const polygon of contours) {
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const xi = polygon[i][0], yi = polygon[i][1];
                const xj = polygon[j][0], yj = polygon[j][1];
                
                // Point to line segment distance
                const l2 = (xi - xj) ** 2 + (yi - yj) ** 2;
                if (l2 === 0) {
                    minDist = Math.min(minDist, Math.hypot(x - xi, y - yi));
                    continue;
                }
                
                let t = ((x - xi) * (xj - xi) + (y - yi) * (yj - yi)) / l2;
                t = Math.max(0, Math.min(1, t));
                
                const projX = xi + t * (xj - xi);
                const projY = yi + t * (yj - yi);
                
                minDist = Math.min(minDist, Math.hypot(x - projX, y - projY));
            }
        }
        return minDist;
    }


    /**
     * Returns true hexagonal close packing points.
     */
    getOrangesPointsInContours(contours, box, spacing, layerIndex) {
        const points = [];
        // True hex packing row spacing
        const rowSpacing = spacing * Math.sqrt(3) / 2;

        const startN = Math.floor((box.min.x - spacing) / spacing);
        const endN = Math.ceil((box.max.x + spacing) / spacing);

        const startM = Math.floor((box.min.y - rowSpacing) / rowSpacing);
        const endM = Math.ceil((box.max.y + rowSpacing) / rowSpacing);

        const layerOffsetX = (layerIndex % 2 !== 0) ? spacing / 2 : 0;
        const layerOffsetY = (layerIndex % 2 !== 0) ? rowSpacing / 3 : 0;

        for (let m = startM; m <= endM; m++) {
            const y = m * rowSpacing + (rowSpacing / 2) + layerOffsetY;
            // Alternating rows shift by half spacing
            const rowOffsetX = (m % 2 !== 0) ? spacing / 2 : 0;
            
            for (let n = startN; n <= endN; n++) {
                const x = n * spacing + (spacing / 2) + rowOffsetX + layerOffsetX;

                if (this.isPointInContours(x, y, contours)) {
                    points.push({ x, y });
                }
            }
        }
        return points;
    }

    // Simple seeded random function
    seededRandom(seed) {
        let x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    getRejectionSamplingPointsInContours(contours, box, spacing, layerIndex) {
        const points = [];
        const cellSize = spacing / Math.sqrt(2); 
        const grid = new Map();

        let seed = layerIndex * 1337 + 1; // Basic seed per layer
        const maxAttempts = 200;
        let rejections = 0;
        
        const width = box.max.x - box.min.x;
        const height = box.max.y - box.min.y;

        // Ensure width and height are positive and large enough
        if (width <= 0 || height <= 0) return points;

        const maxIter = Math.floor((width * height) / (spacing * spacing)) * 10;

        for (let i = 0; i < maxIter && rejections < maxAttempts; i++) {
            const rx = box.min.x + this.seededRandom(seed++) * width;
            const ry = box.min.y + this.seededRandom(seed++) * height;

            if (!this.isPointInContours(rx, ry, contours)) {
                continue; // Not a rejection, just not in mesh
            }

            // Spatial Hash Check
            const gx = Math.floor(rx / cellSize);
            const gy = Math.floor(ry / cellSize);
            let tooClose = false;

            for (let dx = -2; dx <= 2; dx++) {
                for (let dy = -2; dy <= 2; dy++) {
                    const key = `${gx + dx},${gy + dy}`;
                    if (grid.has(key)) {
                        const cellPoints = grid.get(key);
                        for (const p of cellPoints) {
                            const distSq = (p.x - rx) ** 2 + (p.y - ry) ** 2;
                            if (distSq < spacing * spacing) {
                                tooClose = true;
                                break;
                            }
                        }
                    }
                }
                if (tooClose) break;
            }

            if (!tooClose) {
                points.push({ x: rx, y: ry });
                const key = `${gx},${gy}`;
                if (!grid.has(key)) grid.set(key, []);
                grid.get(key).push({ x: rx, y: ry });
                rejections = 0;
            } else {
                rejections++;
            }
        }
        return points;
    }

    /**
     * Returns grid points (x, y) that are inside the contours.
     * Truly absolute world-grid anchored at (0,0).
     */
    getGridPointsInContours(contours, box, spacing) {
        const points = [];
        
        const centerX = (box.min.x + box.max.x) / 2;
        const centerY = (box.min.y + box.max.y) / 2;

        // Find the range of indices 'n' that cover the bounding box relative to center
        const startN = Math.floor((box.min.x - centerX - spacing) / spacing);
        const endN = Math.ceil((box.max.x - centerX + spacing) / spacing);

        const startM = Math.floor((box.min.y - centerY - spacing) / spacing);
        const endM = Math.ceil((box.max.y - centerY + spacing) / spacing);

        for (let n = startN; n <= endN; n++) {
            const x = centerX + n * spacing;
            for (let m = startM; m <= endM; m++) {
                const y = centerY + m * spacing;

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
