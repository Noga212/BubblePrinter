import * as THREE from 'three';
import { getSliceContours, distanceToContours, getOrangesPointsInContours, getRejectionSamplingPointsInContours, getGridPointsInContours, isPointInContours } from './geometry_utils_v2.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export const GENERATOR_CONFIG = {
    maxLayers: 2000,
    maxBubbles3D: 6000,
    maxIterations3D: 300000,
    sphereWidthSegments: 16,
    sphereHeightSegments: 12,
    adaptiveShellDepthMultiplier: 3.0,
    adaptiveThresholdInner: 0.33,
    adaptiveThresholdOuter: 0.66,
    gradientExponent: 1.0,
    zGradientStart: 0,
    zGradientEnd: 100
};

export class BubbleGenerator {

    /**
     * Merged BufferGeometry of bubbles based on the input mesh.
     * @param {THREE.Object3D} mesh - Reference mesh to slice
     * @param {number} radius - Mean radius of bubbles
     * @param {number} overlapV - Vertical overlap percentage
     * @param {number} overlapH - Horizontal overlap percentage
     * @param {number} baseFlattenPercent - Flattening of the first layer
     * @returns {THREE.BufferGeometry|null}
     */
    generateGeometry(mesh, radius, overlapV = 0, overlapH = 0, baseFlattenPercent = 50, arrangement = 'grid', sizeMode = 'uniform', explicitMinRadius = null, explicitMaxRadius = null) {
        console.log(`[BubbleGenerator] Generating Mode: ${sizeMode}, radius ${radius}, minRadius ${explicitMinRadius}, maxRadius ${explicitMaxRadius}, overlapV ${overlapV}%, overlapH ${overlapH}%, baseFlatten ${baseFlattenPercent}%, arr ${arrangement}`);

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
            
            // Map transition range
            let t = 0;
            const startT = (GENERATOR_CONFIG.zGradientStart !== undefined ? GENERATOR_CONFIG.zGradientStart : 0) / 100;
            const endT = (GENERATOR_CONFIG.zGradientEnd !== undefined ? GENERATOR_CONFIG.zGradientEnd : 100) / 100;
            if (currentZProgress <= startT) {
                t = 0;
            } else if (currentZProgress >= endT) {
                t = 1;
            } else {
                t = (currentZProgress - startT) / (endT - startT);
            }

            // Apply curve exponent
            const exponent = GENERATOR_CONFIG.gradientExponent !== undefined ? GENERATOR_CONFIG.gradientExponent : 1.0;
            if (exponent !== 1.0) {
                t = Math.pow(t, exponent);
            }

            if (sizeMode === 'z_gradient_down') {
                currentLayerRadius = maxRadius - t * (maxRadius - minRadius);
            } else if (sizeMode === 'z_gradient_up') {
                currentLayerRadius = minRadius + t * (maxRadius - minRadius);
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
                    points = getOrangesPointsInContours(contours, box, horizontalStep, layerIndex);
                } else if (arrangement === 'rejection') {
                    points = getRejectionSamplingPointsInContours(contours, box, horizontalStep, layerIndex);
                } else {
                    points = getGridPointsInContours(contours, box, horizontalStep);
                }

                points.forEach(p => {
                    const matrix = new THREE.Matrix4().makeTranslation(p.x, p.y, centerZ);

                    let geo;
                    if (layerIndex === 0) {
                        geo = new THREE.SphereGeometry(currentLayerRadius, GENERATOR_CONFIG.sphereWidthSegments, GENERATOR_CONFIG.sphereHeightSegments, 0, Math.PI * 2, 0, thetaLength);
                    } else {
                        geo = new THREE.SphereGeometry(currentLayerRadius, GENERATOR_CONFIG.sphereWidthSegments, GENERATOR_CONFIG.sphereHeightSegments);
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
            if (layerIndex > GENERATOR_CONFIG.maxLayers) break;
        }

        if (geometries.length > 0) {
            console.log(`[BubbleGenerator] Merged ${geometries.length} bubbles.`);
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
            mergedGeo.computeBoundingBox();
            const minZ = mergedGeo.boundingBox.min.z;
            if (minZ !== 0) {
                mergedGeo.translate(0, 0, -minZ);
            }
            return mergedGeo;
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
            const dist = distanceToContours(x, y, contours);
            const maxShellDepth = maxRadius * GENERATOR_CONFIG.adaptiveShellDepthMultiplier;
            if (sizeMode === 'adaptive') {
                if (dist < maxShellDepth * GENERATOR_CONFIG.adaptiveThresholdInner) return minRadius;
                if (dist < maxShellDepth * GENERATOR_CONFIG.adaptiveThresholdOuter) return minRadius + (maxRadius - minRadius) / 2;
                return maxRadius;
            } else {
                let t = Math.min(dist / maxShellDepth, 1.0);
                const exponent = GENERATOR_CONFIG.gradientExponent !== undefined ? GENERATOR_CONFIG.gradientExponent : 1.0;
                if (exponent !== 1.0) {
                    t = Math.pow(t, exponent);
                }
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
        const initialPoints = getGridPointsInContours(firstLayerContours, box, minSpacing);
        
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
        
        while (active.length > 0 && iter++ < GENERATOR_CONFIG.maxIterations3D) {
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
                if (!isPointInContours(tempX, tempY, contours)) continue;
                
                const r = evaluateRadius(tempX, tempY, tempZ, contours);
                
                const cx = b.x + dirX * (b.radius + r);
                const cy = b.y + dirY * (b.radius + r);
                const cz = b.z + dirZ * (b.radius + r);
                
                if (cz < minZ || cz > maxZ) continue;
                const finalContours = getContours(cz);
                if (!isPointInContours(cx, cy, finalContours)) continue;
                
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
            if (bubbles.length > GENERATOR_CONFIG.maxBubbles3D) break;
        }

        bubbles.forEach(b => {
            const matrix = new THREE.Matrix4().makeTranslation(b.x, b.y, b.z);
            let geo;
            if (Math.abs(b.z - startZ) < 0.1) {
                geo = new THREE.SphereGeometry(b.radius, GENERATOR_CONFIG.sphereWidthSegments, GENERATOR_CONFIG.sphereHeightSegments, 0, Math.PI * 2, 0, thetaLength);
            } else {
                geo = new THREE.SphereGeometry(b.radius, GENERATOR_CONFIG.sphereWidthSegments, GENERATOR_CONFIG.sphereHeightSegments);
            }
            geo.rotateX(Math.PI / 2);
            geometries.push(geo.clone().applyMatrix4(matrix));
        });

        console.log(`[BubbleGenerator] 3D Packing produced ${bubbles.length} bubbles.`);
        if (geometries.length > 0) {
            const mergedGeo = BufferGeometryUtils.mergeGeometries(geometries);
            mergedGeo.computeBoundingBox();
            const minZ = mergedGeo.boundingBox.min.z;
            if (minZ !== 0) {
                mergedGeo.translate(0, 0, -minZ);
            }
            return mergedGeo;
        }
        return null;
    }
}
