import { Box } from '../math/box'
import { Vec } from '../math/vec'

export interface SnapGuide {
	axis: 'x' | 'y'
	/** Page coordinate of the guide line on its axis. */
	at: number
	from: number
	to: number
}

export interface SnapResult {
	offset: Vec
	guides: SnapGuide[]
}

const xs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w]
const ys = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h]

/**
 * Nudges a moving box so one of its edges or its center lines up with an edge or center of a
 * candidate box, independently per axis. `threshold` is in page units.
 */
export function snapBox(moving: Box, candidates: readonly Box[], threshold: number): SnapResult {
	let bestX: { d: number; at: number } | null = null
	let bestY: { d: number; at: number } | null = null
	for (const c of candidates) {
		for (const mx of xs(moving)) {
			for (const cx of xs(c)) {
				const d = cx - mx
				if (Math.abs(d) <= threshold && (!bestX || Math.abs(d) < Math.abs(bestX.d))) {
					bestX = { d, at: cx }
				}
			}
		}
		for (const my of ys(moving)) {
			for (const cy of ys(c)) {
				const d = cy - my
				if (Math.abs(d) <= threshold && (!bestY || Math.abs(d) < Math.abs(bestY.d))) {
					bestY = { d, at: cy }
				}
			}
		}
	}
	const offset = { x: bestX?.d ?? 0, y: bestY?.d ?? 0 }
	const snapped = { ...moving, x: moving.x + offset.x, y: moving.y + offset.y }
	const guides: SnapGuide[] = []
	if (bestX) guides.push(guideFor('x', bestX.at, snapped, candidates))
	if (bestY) guides.push(guideFor('y', bestY.at, snapped, candidates))
	return { offset, guides }
}

function guideFor(axis: 'x' | 'y', at: number, moving: Box, candidates: readonly Box[]): SnapGuide {
	const eps = 0.01
	const aligned = candidates.filter((c) =>
		(axis === 'x' ? xs(c) : ys(c)).some((v) => Math.abs(v - at) < eps)
	)
	let from = axis === 'x' ? moving.y : moving.x
	let to = axis === 'x' ? moving.y + moving.h : moving.x + moving.w
	for (const c of aligned) {
		from = Math.min(from, axis === 'x' ? c.y : c.x)
		to = Math.max(to, axis === 'x' ? c.y + c.h : c.x + c.w)
	}
	return { axis, at, from, to }
}

export function snapToGrid(v: number, size: number) {
	return Math.round(v / size) * size
}
