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
