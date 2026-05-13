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
    generateGeometry(mesh, radius, overlapV = 0, overlapH = 0, baseFlattenPercent = 50, arrangement = 'grid', sizeMode = 'uniform', explicitMinRadius = null, explicitMaxRadius = null) {
        console.log(`[BubbleGenerator] Generating Mode: ${sizeMode}, radius ${radius}, minRadius ${explicitMinRadius}, maxRadius ${explicitMaxRadius}, overlapV ${overlapV}%, overlapH ${overlapH}%, baseFlatten ${baseFlattenPercent}%, arr ${arrangement}`);
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
        const minRadius = explicitMinRadius !== null ? explicitMinRadius : meanRadius * 0.5;
        const maxRadius = explicitMaxRadius !== null ? explicitMaxRadius : meanRadius * 1.5;

        let firstLayerRadius = meanRadius;
        if (sizeMode === 'z_gradient_down') firstLayerRadius = maxRadius;
        if (sizeMode === 'z_gradient_up') firstLayerRadius = minRadius;

        // Base Flattening Logic:
        const thetaLength = Math.PI * (1 - (Math.max(0, Math.min(100, baseFlattenPercent)) / 100));

        if (sizeMode === 'shell_gradient_in' || sizeMode === 'adaptive') {
            return this.generate3DPacking(mesh, box, meanRadius, minRadius, maxRadius, overlapFactorH, overlapFactorV, baseFlattenPercent, sizeMode, thetaLength);
        }

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
                    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        geo = new THREE.SphereGeometry(currentLayerRadius, 16, 12, 0, Math.PI * 2, 0, thetaLength);
                    } else {
                        geo = new THREE.SphereGeometry(currentLayerRadius, 16, 12);
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

    generate3DPacking(mesh, box, meanRadius, minRadius, maxRadius, overlapFactorH, overlapFactorV, baseFlattenPercent, sizeMode, thetaLength) {
        console.log(`[BubbleGenerator] Using 3D Advancing Front for ${sizeMode}`);
        const geometries = [];
        const bubbles = [];
        const active = [];
        
        const minZ = box.min.z;
        const maxZ = box.max.z;
        const startZ = minZ - (minRadius * Math.cos(thetaLength));
        
        const sliceCache = new Map();
        const getContours = (z) => {
            const zKey = Math.round(z / 0.1);
            if (sliceCache.has(zKey)) return sliceCache.get(zKey);
            const sampleZ = Math.min(maxZ - 0.01, Math.max(minZ + 0.01, zKey * 0.1));
            const contours = getSliceContours(mesh, sampleZ);
            sliceCache.set(zKey, contours);
            return contours;
        };

        const evaluateRadius = (x, y, z, contours) => {
            const dist = this.distanceToContours(x, y, contours);
            const maxShellDepth = maxRadius * 3;
            if (sizeMode === 'adaptive') {
                if (dist < maxShellDepth * 0.33) return minRadius;
                if (dist < maxShellDepth * 0.66) return minRadius + (maxRadius - minRadius) / 2;
                return maxRadius;
            } else {
                const t = Math.min(dist / maxShellDepth, 1.0);
                return minRadius + t * (maxRadius - minRadius);
            }
        };

        const firstLayerContours = getContours(startZ);
        if (firstLayerContours.length === 0) return null;

        const cellSize = maxRadius * 2.1;
        const grid = new Map();
        const addGrid = (b) => {
            const k = `${Math.floor(b.x/cellSize)},${Math.floor(b.y/cellSize)},${Math.floor(b.z/cellSize)}`;
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(b);
        };

        const minSpacing = minRadius * 2 * overlapFactorH;
        const initialPoints = this.getGridPointsInContours(firstLayerContours, box, minSpacing);
        
        initialPoints.forEach(p => {
            const r = evaluateRadius(p.x, p.y, startZ, firstLayerContours);
            let overlap = false;
            for(let b of bubbles) {
                const ex = (p.x - b.x) / overlapFactorH;
                const ey = (p.y - b.y) / overlapFactorH;
                const req = r + b.radius;
                if (ex*ex + ey*ey < req*req - 0.001) { overlap = true; break; }
            }
            if (!overlap) {
                const nb = { x: p.x, y: p.y, z: startZ, radius: r };
                bubbles.push(nb);
                active.push(nb);
                addGrid(nb);
            }
        });

        let seed = 12345;
        const sRand = () => { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); };

        let iter = 0;
        const MAX_ITER = 300000;
        
        while (active.length > 0 && iter++ < MAX_ITER) {
            const idx = Math.floor(sRand() * active.length);
            const b = active[idx];
            let added = false;
            
            for (let i = 0; i < 30; i++) {
                const theta = sRand() * Math.PI * 2;
                const phi = Math.acos(2 * sRand() - 1);
                
                const dirX = Math.sin(phi) * Math.cos(theta) * overlapFactorH;
                const dirY = Math.sin(phi) * Math.sin(theta) * overlapFactorH;
                const dirZ = Math.cos(phi) * overlapFactorV;
                
                const guessR = (minRadius + maxRadius) / 2;
                const tempX = b.x + dirX * (b.radius + guessR);
                const tempY = b.y + dirY * (b.radius + guessR);
                const tempZ = b.z + dirZ * (b.radius + guessR);
                
                if (tempZ < minZ || tempZ > maxZ) continue;
                const contours = getContours(tempZ);
                if (!this.isPointInContours(tempX, tempY, contours)) continue;
                
                const r = evaluateRadius(tempX, tempY, tempZ, contours);
                
                const cx = b.x + dirX * (b.radius + r);
                const cy = b.y + dirY * (b.radius + r);
                const cz = b.z + dirZ * (b.radius + r);
                
                if (cz < minZ || cz > maxZ) continue;
                const finalContours = getContours(cz);
                if (!this.isPointInContours(cx, cy, finalContours)) continue;
                
                let overlap = false;
                const hx = Math.floor(cx/cellSize);
                const hy = Math.floor(cy/cellSize);
                const hz = Math.floor(cz/cellSize);
                
                for(let dx=-1; dx<=1; dx++){
                    for(let dy=-1; dy<=1; dy++){
                        for(let dz=-1; dz<=1; dz++){
                            const k = `${hx+dx},${hy+dy},${hz+dz}`;
                            const cell = grid.get(k);
                            if(cell) {
                                for(let cb of cell) {
                                    const ex = (cx - cb.x) / overlapFactorH;
                                    const ey = (cy - cb.y) / overlapFactorH;
                                    const ez = (cz - cb.z) / overlapFactorV;
                                    const d2 = ex*ex + ey*ey + ez*ez;
                                    const req = r + cb.radius;
                                    if (d2 < req * req - 0.001) {
                                        overlap = true; break;
                                    }
                                }
                            }
                            if(overlap) break;
                        }
                        if(overlap) break;
                    }
                    if(overlap) break;
                }
                
                if (!overlap) {
                    const nb = { x: cx, y: cy, z: cz, radius: r };
                    bubbles.push(nb);
                    active.push(nb);
                    addGrid(nb);
                    added = true;
                    break;
                }
            }
            
            if (!added) active.splice(idx, 1);
            if (bubbles.length > 6000) break;
        }

        bubbles.forEach(b => {
            const matrix = new THREE.Matrix4().makeTranslation(b.x, b.y, b.z);
            let geo;
            if (Math.abs(b.z - startZ) < 0.1) {
                geo = new THREE.SphereGeometry(b.radius, 16, 12, 0, Math.PI * 2, 0, thetaLength);
            } else {
                geo = new THREE.SphereGeometry(b.radius, 16, 12);
            }
            geo.rotateX(Math.PI / 2);
            geometries.push(geo.clone().applyMatrix4(matrix));
        });

        console.log(`[BubbleGenerator] 3D Packing produced ${bubbles.length} bubbles.`);
        if (geometries.length > 0) return BufferGeometryUtils.mergeGeometries(geometries);
        return null;
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
