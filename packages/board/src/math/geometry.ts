import { Box, boxContainsPoint } from './box'
import { Vec, cross, dist, dot, sub } from './vec'

export function nearestPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
	const ab = sub(b, a)
	const l2 = dot(ab, ab)
	if (l2 === 0) return { x: a.x, y: a.y }
	const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2))
	return { x: a.x + ab.x * t, y: a.y + ab.y * t }
}

export function distanceToSegment(p: Vec, a: Vec, b: Vec) {
	return dist(p, nearestPointOnSegment(p, a, b))
}

export function distanceToPolyline(p: Vec, points: readonly Vec[], closed = false) {
	if (points.length === 0) return Infinity
	if (points.length === 1) return dist(p, points[0])
	let min = Infinity
	const n = closed ? points.length : points.length - 1
	for (let i = 0; i < n; i++) {
		const d = distanceToSegment(p, points[i], points[(i + 1) % points.length])
		if (d < min) min = d
	}
	return min
}

/** Even-odd ray cast. */
export function polygonContainsPoint(points: readonly Vec[], p: Vec) {
	let inside = false
	for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
		const a = points[i]
		const b = points[j]
		if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
			inside = !inside
		}
	}
	return inside
}

export function segmentsIntersect(a1: Vec, a2: Vec, b1: Vec, b2: Vec) {
	const d1 = cross(sub(b2, b1), sub(a1, b1))
	const d2 = cross(sub(b2, b1), sub(a2, b1))
	const d3 = cross(sub(a2, a1), sub(b1, a1))
	const d4 = cross(sub(a2, a1), sub(b2, a1))
	if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
		return true
	}
	const onSeg = (p: Vec, q: Vec, r: Vec) =>
		Math.min(p.x, q.x) <= r.x &&
		r.x <= Math.max(p.x, q.x) &&
		Math.min(p.y, q.y) <= r.y &&
		r.y <= Math.max(p.y, q.y)
	if (d1 === 0 && onSeg(b1, b2, a1)) return true
	if (d2 === 0 && onSeg(b1, b2, a2)) return true
	if (d3 === 0 && onSeg(a1, a2, b1)) return true
	if (d4 === 0 && onSeg(a1, a2, b2)) return true
	return false
}

/** Whether any part of the polyline lies inside the box. */
export function polylineIntersectsBox(points: readonly Vec[], b: Box, closed = false) {
	if (points.some((p) => boxContainsPoint(b, p))) return true
	const edges: [Vec, Vec][] = [
		[
			{ x: b.x, y: b.y },
			{ x: b.x + b.w, y: b.y },
		],
		[
			{ x: b.x + b.w, y: b.y },
			{ x: b.x + b.w, y: b.y + b.h },
		],
		[
			{ x: b.x + b.w, y: b.y + b.h },
			{ x: b.x, y: b.y + b.h },
		],
		[
			{ x: b.x, y: b.y + b.h },
			{ x: b.x, y: b.y },
		],
	]
	const n = closed ? points.length : points.length - 1
	for (let i = 0; i < n; i++) {
		const p = points[i]
		const q = points[(i + 1) % points.length]
		for (const [e1, e2] of edges) if (segmentsIntersect(p, q, e1, e2)) return true
	}
	return false
}

/** Samples an axis-aligned ellipse inscribed in a w×h box at the origin. */
export function ellipsePoints(w: number, h: number, segments = 48): Vec[] {
	const rx = w / 2
	const ry = h / 2
	const out: Vec[] = []
	for (let i = 0; i < segments; i++) {
		const t = (i / segments) * Math.PI * 2
		out.push({ x: rx + Math.cos(t) * rx, y: ry + Math.sin(t) * ry })
	}
	return out
}

/**
 * Where the ray from `inside` towards `toward` leaves the polygon. Used to end a bound arrow at
 * the edge of its target rather than at its center.
 */
export function rayExitPoint(polygon: readonly Vec[], inside: Vec, toward: Vec): Vec | null {
	const d = sub(toward, inside)
	let best: Vec | null = null
	let bestT = Infinity
	for (let i = 0; i < polygon.length; i++) {
		const a = polygon[i]
		const b = polygon[(i + 1) % polygon.length]
		const e = sub(b, a)
		const denom = cross(d, e)
		if (denom === 0) continue
		const w = sub(a, inside)
		const t = cross(w, e) / denom
		const u = cross(w, d) / denom
		if (t >= 0 && u >= 0 && u <= 1 && t < bestT) {
			bestT = t
			best = { x: inside.x + d.x * t, y: inside.y + d.y * t }
		}
	}
	return best
}

/** Ramer–Douglas–Peucker simplification for freehand strokes. */
export function simplifyPolyline(points: readonly Vec[], tolerance: number): Vec[] {
	if (points.length < 3) return points.slice()
	const keep = new Uint8Array(points.length)
	keep[0] = keep[points.length - 1] = 1
	const stack: [number, number][] = [[0, points.length - 1]]
	while (stack.length) {
		const [start, end] = stack.pop()!
		let maxD = 0
		let idx = -1
		for (let i = start + 1; i < end; i++) {
			const d = distanceToSegment(points[i], points[start], points[end])
			if (d > maxD) {
				maxD = d
				idx = i
			}
		}
		if (idx !== -1 && maxD > tolerance) {
			keep[idx] = 1
			stack.push([start, idx], [idx, end])
		}
	}
	return points.filter((_, i) => keep[i])
}
