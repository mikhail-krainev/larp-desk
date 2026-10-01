import { Box, boxCorners, boxFromPoints, unionBoxes } from '../math/box'
import { Vec, add, rotate, sub } from '../math/vec'
import { localBounds, pageBounds, pageCenter, toLocal, toPage } from './shapes'
import { Shape } from './types'

export type Handle = 'tl' | 't' | 'tr' | 'r' | 'br' | 'b' | 'bl' | 'l'

export const HANDLES: Handle[] = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l']

/** Handle position as a fraction of the frame box. */
export const HANDLE_POS: Record<Handle, Vec> = {
	tl: { x: 0, y: 0 },
	t: { x: 0.5, y: 0 },
	tr: { x: 1, y: 0 },
	r: { x: 1, y: 0.5 },
	br: { x: 1, y: 1 },
	b: { x: 0.5, y: 1 },
	bl: { x: 0, y: 1 },
	l: { x: 0, y: 0.5 },
}

export function isCornerHandle(h: Handle) {
	return h.length === 2
}

/**
 * The box a selection is transformed through. A lone shape keeps its own rotation so its
 * handles sit on its edges; several shapes share one axis-aligned frame.
 */
export interface SelectionFrame {
	origin: Vec
	rotation: number
	/** In frame space: page = origin + rotate(p, rotation). */
	box: Box
}

export function selectionFrame(shapes: readonly Shape[]): SelectionFrame | null {
	if (shapes.length === 0) return null
	if (shapes.length === 1) {
		const s = shapes[0]
		return { origin: { x: s.x, y: s.y }, rotation: s.rotation, box: localBounds(s) }
	}
	const b = unionBoxes(shapes.map(pageBounds))!
	return { origin: { x: 0, y: 0 }, rotation: 0, box: b }
}

export function frameToPage(f: SelectionFrame, p: Vec) {
	return add(f.origin, rotate(p, f.rotation))
}
export function pageToFrame(f: SelectionFrame, p: Vec) {
	return rotate(sub(p, f.origin), -f.rotation)
}

export function frameCorners(f: SelectionFrame): Vec[] {
	return boxCorners(f.box).map((p) => frameToPage(f, p))
}

export function handlePagePoint(f: SelectionFrame, h: Handle): Vec {
	const r = HANDLE_POS[h]
	return frameToPage(f, { x: f.box.x + f.box.w * r.x, y: f.box.y + f.box.h * r.y })
}

export interface ResizeOptions {
	keepAspect?: boolean
	fromCenter?: boolean
}

export interface Scale {
	sx: number
	sy: number
	/** Fixed point of the scale, in frame space. */
	anchor: Vec
}

export function computeScale(
	f: SelectionFrame,
	handle: Handle,
	pointer: Vec,
	opts: ResizeOptions = {}
): Scale {
	const q = pageToFrame(f, pointer)
	const hp = HANDLE_POS[handle]
	const { box } = f
	const anchor = opts.fromCenter
		? { x: box.x + box.w / 2, y: box.y + box.h / 2 }
		: { x: box.x + box.w * (1 - hp.x), y: box.y + box.h * (1 - hp.y) }
	const handlePt = { x: box.x + box.w * hp.x, y: box.y + box.h * hp.y }
	const dx = handlePt.x - anchor.x
	const dy = handlePt.y - anchor.y
	let sx = hp.x === 0.5 || dx === 0 ? 1 : (q.x - anchor.x) / dx
	let sy = hp.y === 0.5 || dy === 0 ? 1 : (q.y - anchor.y) / dy
	if (opts.keepAspect) {
		if (hp.x === 0.5) sx = Math.abs(sy) * Math.sign(sx || 1)
		else if (hp.y === 0.5) sy = Math.abs(sx) * Math.sign(sy || 1)
		else {
			const s = Math.max(Math.abs(sx), Math.abs(sy))
			sx = s * Math.sign(sx || 1)
			sy = s * Math.sign(sy || 1)
		}
	}
	return { sx, sy, anchor }
}

const MIN_SIZE = 1

/**
 * Applies a frame-space scale to `initial` (the shape as it was when the gesture began).
 * Point-based shapes are transformed exactly. Box-based shapes can only stay boxes, so a shape
 * rotated off the frame's axes scales uniformly instead of shearing.
 */
export function resizeShape(
	initial: Shape,
	f: SelectionFrame,
	{ sx, sy, anchor }: Scale,
	handle: Handle
): Shape {
	const map = (page: Vec) => {
		const q = pageToFrame(f, page)
		return frameToPage(f, {
			x: anchor.x + (q.x - anchor.x) * sx,
			y: anchor.y + (q.y - anchor.y) * sy,
		})
	}

	if (initial.type === 'line' || initial.type === 'draw') {
		const origin = map({ x: initial.x, y: initial.y })
		const remap = (p: Vec) =>
			toLocal({ ...initial, x: origin.x, y: origin.y }, map(toPage(initial, p)))
		if (initial.type === 'line') {
			const sign = Math.sign(sx * sy) || 1
			return {
				...initial,
				x: origin.x,
				y: origin.y,
				start: { ...initial.start, ...remap(initial.start) },
				end: { ...initial.end, ...remap(initial.end) },
				bend: initial.bend * sign * Math.sqrt(Math.abs(sx * sy)),
			}
		}
		return {
			...initial,
			x: origin.x,
			y: origin.y,
			points: initial.points.map((p) => ({ ...p, ...remap(p) })),
		}
	}

	const rel = normalizeQuarter(initial.rotation - f.rotation)
	let kx: number
	let ky: number
	if (rel === 0 || rel === 2) {
		kx = Math.abs(sx)
		ky = Math.abs(sy)
	} else if (rel === 1 || rel === 3) {
		kx = Math.abs(sy)
		ky = Math.abs(sx)
	} else {
		kx = ky = Math.sqrt(Math.abs(sx * sy))
	}

	const center = map(pageCenter(initial))
	const w = Math.max(MIN_SIZE, initial.w * kx)
	let h = Math.max(MIN_SIZE, initial.h * ky)
	let next: Shape = { ...initial, w, h }

	if (initial.type === 'text') {
		if (isCornerHandle(handle)) {
			const k = Math.sqrt(kx * ky)
			next = { ...initial, fontSize: Math.max(4, initial.fontSize * k), w, h }
		} else {
			// Dragging a side rewraps text instead of stretching it.
			h = initial.h
			next = { ...initial, w, h, autoWidth: false }
		}
	}

	const half = rotate({ x: w / 2, y: h / 2 }, initial.rotation)
	return { ...next, x: center.x - half.x, y: center.y - half.y }
}

/** 0..3 when the angle is a multiple of 90°, otherwise -1. */
function normalizeQuarter(angle: number) {
	const q = angle / (Math.PI / 2)
	const r = Math.round(q)
	if (Math.abs(q - r) > 1e-6) return -1
	return ((r % 4) + 4) % 4
}

export function rotateShape(initial: Shape, center: Vec, delta: number): Shape {
	const origin = rotate({ x: initial.x, y: initial.y }, delta, center)
	return { ...initial, x: origin.x, y: origin.y, rotation: initial.rotation + delta }
}

export function translateShape<S extends Shape>(initial: S, delta: Vec): S {
	return { ...initial, x: initial.x + delta.x, y: initial.y + delta.y }
}

export function selectionPageBounds(shapes: readonly Shape[]): Box | null {
	const f = selectionFrame(shapes)
	return f ? boxFromPoints(frameCorners(f)) : null
}
