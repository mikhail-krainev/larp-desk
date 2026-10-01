import { Box, boxContainsPoint, boxCorners, boxFromPoints, boxesOverlap } from '../math/box'
import {
	distanceToPolyline,
	ellipsePoints,
	polygonContainsPoint,
	polylineIntersectsBox,
} from '../math/geometry'
import { Vec, add, lerp, len, rotate, sub } from '../math/vec'
import { deepClone, uid } from './ids'
import { LineShape, Shape, ShapeOfType, ShapeType, Style } from './types'

export const DEFAULT_STYLE: Style = {
	color: 'ink',
	fill: 'none',
	strokeWidth: 2,
	dash: 'solid',
	opacity: 1,
}

export const STICKY_SIZE = 200
export const LINE_HEIGHT = 1.35

type Defaults = { [T in ShapeType]: Omit<ShapeOfType<T>, keyof BaseFields> }
type BaseFields = Pick<Shape, 'id' | 'type' | 'x' | 'y' | 'rotation' | 'z' | 'locked' | 'style'>

const DEFAULTS: Defaults = {
	rect: { w: 1, h: 1, radius: 8, text: '' },
	ellipse: { w: 1, h: 1, text: '' },
	text: { w: 20, h: 24, text: '', fontSize: 20, align: 'start', autoWidth: true },
	sticky: { w: STICKY_SIZE, h: STICKY_SIZE, text: '', fontSize: 20 },
	line: {
		start: { x: 0, y: 0 },
		end: { x: 1, y: 1 },
		startHead: 'none',
		endHead: 'arrow',
		bend: 0,
		label: '',
	},
	draw: { points: [], closed: false, highlighter: false },
	image: { w: 1, h: 1, src: '', alt: '' },
	frame: { w: 1, h: 1, name: 'Frame' },
}

export function createShape<T extends ShapeType>(
	type: T,
	props: Partial<Omit<ShapeOfType<T>, 'type' | 'style'>> & { style?: Partial<Style> } = {}
): ShapeOfType<T> {
	const { style, ...rest } = props
	return {
		id: uid(),
		type,
		x: 0,
		y: 0,
		rotation: 0,
		z: 0,
		locked: false,
		...deepClone(DEFAULTS[type]),
		...rest,
		style: { ...DEFAULT_STYLE, ...(type === 'sticky' ? { color: 'yellow' } : null), ...style },
	} as unknown as ShapeOfType<T>
}

/** Sampled points along a line shape, in local space. Straight lines are just two points. */
export function linePoints(shape: LineShape, segments = 24): Vec[] {
	const { start, end, bend } = shape
	if (bend === 0) return [start, end]
	const control = lineControlPoint(shape)
	const out: Vec[] = []
	for (let i = 0; i <= segments; i++) {
		const t = i / segments
		out.push(lerp(lerp(start, control, t), lerp(control, end, t), t))
	}
	return out
}

/** Midpoint of the curve, offset `bend` along the left normal of start→end. */
export function lineMidpoint(shape: LineShape): Vec {
	const { start, end, bend } = shape
	const d = sub(end, start)
	const l = len(d) || 1
	const mid = lerp(start, end, 0.5)
	return { x: mid.x + (-d.y / l) * bend, y: mid.y + (d.x / l) * bend }
}

/** Quadratic control point that makes the curve pass through `lineMidpoint`. */
export function lineControlPoint(shape: LineShape): Vec {
	const m = lineMidpoint(shape)
	const chordMid = lerp(shape.start, shape.end, 0.5)
	return { x: 2 * m.x - chordMid.x, y: 2 * m.y - chordMid.y }
}

export function isClosedShape(shape: Shape) {
	switch (shape.type) {
		case 'line':
			return false
		case 'draw':
			return shape.closed
		default:
			return true
	}
}

/** The shape's outline in local space: a polygon for closed shapes, a polyline otherwise. */
export function localOutline(shape: Shape): Vec[] {
	switch (shape.type) {
		case 'ellipse':
			return ellipsePoints(shape.w, shape.h)
		case 'line':
			return linePoints(shape)
		case 'draw':
			return shape.points
		default:
			return boxCorners({ x: 0, y: 0, w: shape.w, h: shape.h })
	}
}

export function localBounds(shape: Shape): Box {
	switch (shape.type) {
		case 'line':
		case 'draw':
			return boxFromPoints(localOutline(shape))
		default:
			return { x: 0, y: 0, w: shape.w, h: shape.h }
	}
}

export function toPage(shape: Shape, local: Vec): Vec {
	return add(rotate(local, shape.rotation), { x: shape.x, y: shape.y })
}

export function toLocal(shape: Shape, page: Vec): Vec {
	return rotate(sub(page, { x: shape.x, y: shape.y }), -shape.rotation)
}

export function pageOutline(shape: Shape): Vec[] {
	return localOutline(shape).map((p) => toPage(shape, p))
}

/** Axis-aligned page bounds, accounting for rotation. */
export function pageBounds(shape: Shape): Box {
	const lb = localBounds(shape)
	if (shape.rotation === 0) return { x: lb.x + shape.x, y: lb.y + shape.y, w: lb.w, h: lb.h }
	return boxFromPoints(boxCorners(lb).map((p) => toPage(shape, p)))
}

export function pageCenter(shape: Shape): Vec {
	const lb = localBounds(shape)
	return toPage(shape, { x: lb.x + lb.w / 2, y: lb.y + lb.h / 2 })
}

/**
 * Whether a page point hits the shape. Filled shapes and shapes that carry text hit anywhere
 * inside; hollow ones only near their outline, so you can click through an empty rectangle to
 * what is behind it.
 */
export function hitTest(shape: Shape, page: Vec, tolerance: number): boolean {
	const p = toLocal(shape, page)
	const margin = tolerance + shapeStrokeWidth(shape) / 2
	if (!boxContainsPoint(localBounds(shape), p, margin)) return false
	const outline = localOutline(shape)
	const closed = isClosedShape(shape)
	if (closed && hitsInterior(shape) && polygonContainsPoint(outline, p)) return true
	return distanceToPolyline(p, outline, closed) <= margin
}

function hitsInterior(shape: Shape) {
	switch (shape.type) {
		case 'sticky':
		case 'text':
		case 'image':
			return true
		case 'frame':
			// A frame is grabbed by its edge or label, so shapes inside it stay clickable.
			return false
		case 'rect':
		case 'ellipse':
			return shape.style.fill !== 'none' || shape.text.length > 0
		case 'draw':
			return shape.closed && shape.style.fill !== 'none'
		default:
			return false
	}
}

function shapeStrokeWidth(shape: Shape) {
	if (shape.type === 'draw' && shape.highlighter) return shape.style.strokeWidth * 4
	return shape.style.strokeWidth
}

/** Whether the shape touches a page-space box; used by marquee and the eraser. */
export function intersectsBox(shape: Shape, b: Box): boolean {
	if (!boxesOverlap(pageBounds(shape), b)) return false
	const outline = pageOutline(shape)
	if (polylineIntersectsBox(outline, b, isClosedShape(shape))) return true
	// The box may sit entirely inside a closed shape.
	return isClosedShape(shape) && polygonContainsPoint(outline, { x: b.x, y: b.y })
}

/** Rough text metrics used when no DOM is around to measure, e.g. on the server or in tests. */
export function estimateText(text: string, fontSize: number, maxWidth?: number) {
	const charW = fontSize * 0.56
	const lines: number[] = []
	for (const raw of text.split('\n')) {
		const w = raw.length * charW
		if (maxWidth && w > maxWidth) {
			const perLine = Math.max(1, Math.floor(maxWidth / charW))
			const n = Math.ceil(raw.length / perLine)
			for (let i = 0; i < n; i++) lines.push(Math.min(raw.length - i * perLine, perLine) * charW)
		} else lines.push(w)
	}
	return { w: Math.max(fontSize * 0.6, ...lines), h: lines.length * fontSize * LINE_HEIGHT }
}
