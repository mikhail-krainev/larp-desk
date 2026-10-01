import { rayExitPoint } from '../math/geometry'
import { Vec, dist, sub } from '../math/vec'
import { isClosedShape, localBounds, pageOutline, toLocal, toPage } from './shapes'
import { Binding, Endpoint, LineShape, Shape, ShapeId } from './types'

/** Space left between an arrow's tip and the shape it points at. */
export const BINDING_GAP = 6

export function canBindTo(s: Shape) {
	return isClosedShape(s) && s.type !== 'draw' && s.type !== 'frame'
}

export function bindingFor(target: Shape, page: Vec): Binding {
	const lb = localBounds(target)
	const p = toLocal(target, page)
	return {
		shapeId: target.id,
		anchor: {
			x: lb.w === 0 ? 0.5 : clamp01((p.x - lb.x) / lb.w),
			y: lb.h === 0 ? 0.5 : clamp01((p.y - lb.y) / lb.h),
		},
	}
}

export function anchorPagePoint(target: Shape, b: Binding): Vec {
	const lb = localBounds(target)
	return toPage(target, { x: lb.x + lb.w * b.anchor.x, y: lb.y + lb.h * b.anchor.y })
}

/** Where a bound endpoint should sit: on the target's edge, facing the other end. */
export function boundEndpointPagePoint(target: Shape, b: Binding, otherEnd: Vec): Vec {
	const anchor = anchorPagePoint(target, b)
	if (dist(anchor, otherEnd) < 1) return anchor
	// Cast from the far end inward so the hit is the edge nearest the other end.
	const exit = rayExitPoint(pageOutline(target), otherEnd, anchor)
	if (!exit) return anchor
	const d = sub(exit, otherEnd)
	const l = Math.hypot(d.x, d.y)
	if (l <= BINDING_GAP) return exit
	return { x: exit.x - (d.x / l) * BINDING_GAP, y: exit.y - (d.y / l) * BINDING_GAP }
}

/**
 * Recomputes a line's bound endpoints from its targets. Endpoints whose target no longer
 * exists keep their position and lose the binding.
 */
export function resolveLine(line: LineShape, getShape: (id: ShapeId) => Shape | undefined) {
	const startT = line.start.binding && getShape(line.start.binding.shapeId)
	const endT = line.end.binding && getShape(line.end.binding.shapeId)
	if (!line.start.binding && !line.end.binding) return line

	const startPage = toPage(line, line.start)
	const endPage = toPage(line, line.end)
	const startRef = startT ? anchorPagePoint(startT, line.start.binding!) : startPage
	const endRef = endT ? anchorPagePoint(endT, line.end.binding!) : endPage

	let nextStart: Endpoint = line.start
	let nextEnd: Endpoint = line.end
	if (line.start.binding) {
		nextStart = startT
			? {
					...toLocal(line, boundEndpointPagePoint(startT, line.start.binding, endRef)),
					binding: line.start.binding,
				}
			: { x: line.start.x, y: line.start.y }
	}
	if (line.end.binding) {
		nextEnd = endT
			? {
					...toLocal(line, boundEndpointPagePoint(endT, line.end.binding, startRef)),
					binding: line.end.binding,
				}
			: { x: line.end.x, y: line.end.y }
	}
	if (
		sameEndpoint(nextStart, line.start) &&
		sameEndpoint(nextEnd, line.end) &&
		!!startT === !!line.start.binding &&
		!!endT === !!line.end.binding
	) {
		return line
	}
	return { ...line, start: nextStart, end: nextEnd }
}

const sameEndpoint = (a: Endpoint, b: Endpoint) =>
	Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && a.binding === b.binding

const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

export function lineTargets(line: LineShape): ShapeId[] {
	const out: ShapeId[] = []
	if (line.start.binding) out.push(line.start.binding.shapeId)
	if (line.end.binding) out.push(line.end.binding.shapeId)
	return out
}
