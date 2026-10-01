import { Vec } from './vec'

export interface Box {
	x: number
	y: number
	w: number
	h: number
}

export function box(x: number, y: number, w: number, h: number): Box {
	return { x, y, w, h }
}

export function boxFromPoints(points: readonly Vec[]): Box {
	if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const p of points) {
		if (p.x < minX) minX = p.x
		if (p.y < minY) minY = p.y
		if (p.x > maxX) maxX = p.x
		if (p.y > maxY) maxY = p.y
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function unionBoxes(boxes: readonly Box[]): Box | null {
	if (boxes.length === 0) return null
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	for (const b of boxes) {
		minX = Math.min(minX, b.x)
		minY = Math.min(minY, b.y)
		maxX = Math.max(maxX, b.x + b.w)
		maxY = Math.max(maxY, b.y + b.h)
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function boxCenter(b: Box): Vec {
	return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export function boxCorners(b: Box): Vec[] {
	return [
		{ x: b.x, y: b.y },
		{ x: b.x + b.w, y: b.y },
		{ x: b.x + b.w, y: b.y + b.h },
		{ x: b.x, y: b.y + b.h },
	]
}

export function boxContainsPoint(b: Box, p: Vec, margin = 0) {
	return (
		p.x >= b.x - margin &&
		p.x <= b.x + b.w + margin &&
		p.y >= b.y - margin &&
		p.y <= b.y + b.h + margin
	)
}

export function boxesOverlap(a: Box, b: Box) {
	return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

export function boxContainsBox(outer: Box, inner: Box) {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.w <= outer.x + outer.w &&
		inner.y + inner.h <= outer.y + outer.h
	)
}

export function expandBox(b: Box, by: number): Box {
	return {
		x: b.x - by,
		y: b.y - by,
		w: b.w + by * 2,
		h: b.h + by * 2,
	}
}

/** Normalizes a box that may have been dragged out with negative width or height. */
export function boxFromCorners(a: Vec, b: Vec): Box {
	return {
		x: Math.min(a.x, b.x),
		y: Math.min(a.y, b.y),
		w: Math.abs(a.x - b.x),
		h: Math.abs(a.y - b.y),
	}
}
