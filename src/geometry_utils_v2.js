import * as THREE from 'three';

/**
 * Slices a mesh at a specific Z height and returns an array of closed polygons.
 * @param {THREE.Object3D} object - The 3D object to slice.
 * @param {number} z - The Z-height to slice at.
 * @returns {Array<Array<[number, number]>>} - Array of polygons (array of points).
 */
export function getSliceContours(object, z) {
    console.log(`[GeoUtils] Starting slice at Z=${z.toFixed(2)}`);
    const segments = [];
    const v1 = new THREE.Vector3();
    const v2 = new THREE.Vector3();
    const v3 = new THREE.Vector3();

    let triangleCount = 0;
    let minZ = Infinity;
    let maxZ = -Infinity;

    object.traverse((child) => {
        if (child.isMesh) {
            const geometry = child.geometry;
            const matrixWorld = child.matrixWorld;
            const position = geometry.attributes.position;

            if (!position) return;

            const index = geometry.index;
            const count = index ? index.count : position.count;

            for (let i = 0; i < count; i += 3) {
                triangleCount++;
                // Get local triangle vertices
                if (index) {
                    v1.fromBufferAttribute(position, index.getX(i));
                    v2.fromBufferAttribute(position, index.getX(i + 1));
                    v3.fromBufferAttribute(position, index.getX(i + 2));
                } else {
                    v1.fromBufferAttribute(position, i);
                    v2.fromBufferAttribute(position, i + 1);
                    v3.fromBufferAttribute(position, i + 2);
                }

                // Transform to world coordinates
                v1.applyMatrix4(matrixWorld);
                v2.applyMatrix4(matrixWorld);
                v3.applyMatrix4(matrixWorld);

                minZ = Math.min(minZ, v1.z, v2.z, v3.z);
                maxZ = Math.max(maxZ, v1.z, v2.z, v3.z);

                const triangleSegments = getTriangleIntersectionSegments(v1, v2, v3, z);
                if (triangleSegments) {
                    segments.push(...triangleSegments);
                }
            }
        }
    });

    console.log(`[GeoUtils] Checked ${triangleCount} triangles.`);
    console.log(`[GeoUtils] World Z Range: [${minZ.toFixed(2)}, ${maxZ.toFixed(2)}]`);
    console.log(`[GeoUtils] Slice Plane Z: ${z.toFixed(2)}`);
    console.log(`[GeoUtils] Found ${segments.length} segments.`);

    if (z < minZ || z > maxZ) {
        console.warn('[GeoUtils] WARNING: Slice plane is OUTSIDE object Z range!');
    }

    return stitchSegments(segments);
}

/**
 * Calculates the intersection segment of a triangle with a Z-plane.
 * @param {THREE.Vector3} v1 
 * @param {THREE.Vector3} v2 
 * @param {THREE.Vector3} v3 
 * @param {number} z 
 * @returns {Array<[THREE.Vector3, THREE.Vector3]> | null}
 */
function getTriangleIntersectionSegments(v1, v2, v3, z) {
    const points = [];
    const edges = [[v1, v2], [v2, v3], [v3, v1]];

    for (const [pa, pb] of edges) {
        if ((pa.z >= z && pb.z < z) || (pa.z < z && pb.z >= z)) {
            // Edge crosses the plane
            const t = (z - pa.z) / (pb.z - pa.z);
            const x = pa.x + t * (pb.x - pa.x);
            const y = pa.y + t * (pb.y - pa.y);
            points.push(new THREE.Vector3(x, y, z));
        } else if (pa.z === z && pb.z === z) {
            // Edge lies exactly on the plane - we can skip or handle as special case.
            // For simple stitching, we'll ignore purely horizontal edges as the other 
            // intersecting edges will provide the points.
        } else if (pa.z === z) {
            // Vertex lies on the plane.
            // Check if we already have this point to avoid duplicates.
            if (!points.some(p => p.equals(pa))) {
                points.push(pa.clone());
            }
        }
    }

    if (points.length >= 2) {
        return [[points[0], points[1]]];
    }
    return null;
}

/**
 * Stitches a list of segments into closed loops.
 * @param {Array<[THREE.Vector3, THREE.Vector3]>} segments 
 * @returns {Array<Array<[number, number]>>}
 */
function stitchSegments(segments) {
    if (segments.length === 0) return [];

    const loops = [];
    const precision = 5; // Reduced precision to help matching
    const getPointKey = (v) => `${v.x.toFixed(precision)},${v.y.toFixed(precision)}`;

    // Build Graph
    // map key -> array of { targetPoint, segmentId }
    const adj = new Map();
    const visitedSegments = new Set();

    segments.forEach((seg, i) => {
        const [p1, p2] = seg;

        // Debug check for NaN
        if (isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) {
            console.error('[GeoUtils] NaN point found in segment', i);
            return;
        }

        const k1 = getPointKey(p1);
        const k2 = getPointKey(p2);

        if (!adj.has(k1)) adj.set(k1, []);
        if (!adj.has(k2)) adj.set(k2, []);

        adj.get(k1).push({ point: p2, key: k2, id: i });
        adj.get(k2).push({ point: p1, key: k1, id: i });
    });

    console.log(`[GeoUtils] Graph built. Unique vertices: ${adj.size}`);

    // Traverse
    segments.forEach((_, startSegId) => {
        if (visitedSegments.has(startSegId)) return;

        // Start a new loop from this segment
        const startSeg = segments[startSegId];
        visitedSegments.add(startSegId);

        let pStart = startSeg[0];
        let pNext = startSeg[1];

        const currentLoop = [[pStart.x, pStart.y], [pNext.x, pNext.y]];

        let currPoint = pNext;
        let currKey = getPointKey(currPoint);
        let prevKey = getPointKey(pStart);

        let expanding = true;
        while (expanding) {
            expanding = false;

            const neighbors = adj.get(currKey);
            if (!neighbors) break;

            for (const neighbor of neighbors) {
                if (visitedSegments.has(neighbor.id)) continue;

                // Found a valid continuation
                visitedSegments.add(neighbor.id);
                currentLoop.push([neighbor.point.x, neighbor.point.y]);

                prevKey = currKey;
                currPoint = neighbor.point;
                currKey = neighbor.key;

                expanding = true;
                break; // Move to next point in chain
            }
        }

        if (currentLoop.length >= 3) {
            loops.push(currentLoop);
        }
    });

    console.log(`[GeoUtils] Stitched ${loops.length} loops.`);
    return loops;
}

/**
 * Calculates shortest distance from point to any contour edge
 */
export function distanceToContours(x, y, contours) {
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
export function getOrangesPointsInContours(contours, box, spacing, layerIndex) {
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

            if (isPointInContours(x, y, contours)) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

// Simple seeded random function
export function seededRandom(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
}

export function getRejectionSamplingPointsInContours(contours, box, spacing, layerIndex) {
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
        const rx = box.min.x + seededRandom(seed++) * width;
        const ry = box.min.y + seededRandom(seed++) * height;

        if (!isPointInContours(rx, ry, contours)) {
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
export function getGridPointsInContours(contours, box, spacing) {
    const points = [];
    
    const centerX = (box.min.x + box.max.x) / 2;
    const centerY = (box.min.y + box.max.y) / 2;

    // Find the range of indices 'n' that cover the bounding box relative to center
    const startN = Math.floor((box.min.x - centerX - spacing) / spacing);
    const endN = Math.ceil((box.max.x - centerX + spacing) / spacing);

    const startM = Math.floor((box.min.y - centerY - spacing) / spacing);
    const endM = Math.ceil((box.max.y - centerY + spacing) / spacing);

    for (let n = startN; n <= endN; n++) {
        const x = centerX + (n + 0.5) * spacing;
        for (let m = startM; m <= endM; m++) {
            const y = centerY + (m + 0.5) * spacing;

            // Check if (x,y) is inside any contour
            if (isPointInContours(x, y, contours)) {
                points.push({ x, y });
            }
        }
    }
    return points;
}

/**
 * Ray casting algorithm to check if point is inside contours.
 */
export function isPointInContours(x, y, contours) {
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
