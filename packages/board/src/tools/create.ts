import { boxFromCorners } from '../math/box'
import { simplifyPolyline } from '../math/geometry'
import { Vec, angleOf, dist, snapAngle, sub } from '../math/vec'
import { bindingFor } from '../model/bindings'
import { STICKY_SIZE, createShape, hitTest } from '../model/shapes'
import { DrawShape, LineShape, ShapeId } from '../model/types'
import { DRAG_DISTANCE } from './select'
import { BoardKeyEvent, BoardPointerEvent, Tool } from './tool'

export class HandTool extends Tool {
	readonly id = 'hand'
	override cursor = 'grab'
	private last: Vec | null = null

	override onEnter() {
		this.editor.setCursor('grab')
	}
	override onExit() {
		this.editor.setCursor('default')
	}
	override onPointerDown(e: BoardPointerEvent) {
		this.last = e.screen
		this.editor.setCursor('grabbing')
	}
	override onPointerMove(e: BoardPointerEvent) {
		if (!this.last) return
		this.editor.panBy(sub(e.screen, this.last))
		this.last = e.screen
	}
	override onPointerUp() {
		this.last = null
		this.editor.setCursor('grab')
	}
	override onCancel() {
		this.onPointerUp()
	}
}

/**
 * Drag out a box-shaped shape. A plain click drops one at a default size, so the tool still
 * works on touch screens where a drag would pan.
 */
export class BoxTool extends Tool {
	override cursor = 'crosshair'
	private origin: BoardPointerEvent | null = null
	private creating: ShapeId | null = null

	constructor(
		editor: import('../editor').Editor,
		readonly id: 'rect' | 'ellipse' | 'frame',
		private defaultSize = { w: 160, h: 100 }
	) {
		super(editor)
	}

	override onEnter() {
		this.editor.setCursor('crosshair')
	}
	override onExit() {
		this.onCancel()
		this.editor.setCursor('default')
	}

	override onPointerDown(e: BoardPointerEvent) {
		if (e.button !== 0) return
		this.origin = { ...e, page: this.editor.pagePointWithGrid(e.page) }
	}

	override onPointerMove(e: BoardPointerEvent) {
		const ed = this.editor
		if (!this.origin) return
		if (!this.creating) {
			if (dist(e.screen, this.origin.screen) < DRAG_DISTANCE) return
			ed.history.beginGroup()
			const s = createShape(this.id, {
				x: this.origin.page.x,
				y: this.origin.page.y,
				style: ed.styleForNewShape(),
				// Frames sit beneath what they contain.
				z: this.id === 'frame' ? minZ(ed) - 1 : 0,
			})
			ed.createShapes([s])
			this.creating = s.id
		}
		let p = ed.pagePointWithGrid(e.page)
		const o = this.origin.page
		if (e.shift) {
			const side = Math.max(Math.abs(p.x - o.x), Math.abs(p.y - o.y))
			p = { x: o.x + side * Math.sign(p.x - o.x || 1), y: o.y + side * Math.sign(p.y - o.y || 1) }
		}
		const b = e.alt
			? boxFromCorners({ x: o.x * 2 - p.x, y: o.y * 2 - p.y }, p)
			: boxFromCorners(o, p)
		ed.updateShapes([
			{ id: this.creating, x: b.x, y: b.y, w: Math.max(1, b.w), h: Math.max(1, b.h) },
		])
	}

	override onPointerUp() {
		const ed = this.editor
		if (!this.origin) return
		let id = this.creating
		if (!id) {
			const { w, h } = this.defaultSize
			const s = createShape(this.id, {
				x: this.origin.page.x - w / 2,
				y: this.origin.page.y - h / 2,
				w,
				h,
				style: ed.styleForNewShape(),
				z: this.id === 'frame' ? minZ(ed) - 1 : 0,
			})
			ed.createShapes([s])
			id = s.id
		} else {
			ed.history.endGroup()
		}
		this.origin = null
		this.creating = null
		ed.afterCreate([id])
	}

	override onCancel() {
		if (this.creating) this.editor.history.cancelGroup()
		this.origin = null
		this.creating = null
	}
}

function minZ(ed: import('../editor').Editor) {
	const all = ed.getShapes()
	return all.length ? all[0].z : 0
}

export class StickyTool extends Tool {
	readonly id = 'sticky'
	override cursor = 'crosshair'

	override onEnter() {
		this.editor.setCursor('crosshair')
	}
	override onExit() {
		this.editor.setCursor('default')
	}
	override onPointerUp(e: BoardPointerEvent) {
		const ed = this.editor
		const p = ed.pagePointWithGrid(e.page)
		const style = ed.styleForNewShape()
		const s = createShape('sticky', {
			x: p.x - STICKY_SIZE / 2,
			y: p.y - STICKY_SIZE / 2,
			style: { ...style, color: style.color === 'ink' ? 'yellow' : style.color },
		})
		// Creation and the first edit share one undo step.
		ed.history.beginGroup()
		ed.createShapes([s])
		ed.afterCreate([s.id])
		ed.startEditing(s.id)
		ed.history.endGroup()
	}
}

export class TextTool extends Tool {
	readonly id = 'text'
	override cursor = 'text'

	override onEnter() {
		this.editor.setCursor('text')
	}
	override onExit() {
		this.editor.setCursor('default')
	}
	override onPointerUp(e: BoardPointerEvent) {
		const ed = this.editor
		const hit = ed.getShapeAt(e.page)
		if (hit?.type === 'text') {
			ed.setTool('select')
			ed.startEditing(hit.id)
			return
		}
		const fontSize = 20
		const s = createShape('text', {
			x: e.page.x,
			y: e.page.y - (fontSize * 1.35) / 2 - 4,
			fontSize,
			style: ed.styleForNewShape(),
		})
		// Creation and the first edit share one undo step, so an abandoned empty text box
		// leaves nothing in history.
		ed.history.beginGroup()
		ed.createShapes([s])
		// Text tool always hands back to select: the next click should end editing, not
		// start another text box.
		ed.select([s.id])
		ed.setTool('select')
		ed.startEditing(s.id)
		ed.history.endGroup()
	}
}

export class LineTool extends Tool {
	override cursor = 'crosshair'
	private creating: { id: ShapeId; origin: Vec } | null = null

	constructor(
		editor: import('../editor').Editor,
		readonly id: 'line' | 'arrow'
	) {
		super(editor)
	}

	override onEnter() {
		this.editor.setCursor('crosshair')
	}
	override onExit() {
		this.onCancel()
		this.editor.setCursor('default')
	}

	override onPointerDown(e: BoardPointerEvent) {
		if (e.button !== 0) return
		const ed = this.editor
		ed.history.beginGroup()
		const target = e.accel ? undefined : ed.getBindTarget(e.page)
		const origin = ed.pagePointWithGrid(e.page)
		const s = createShape('line', {
			x: origin.x,
			y: origin.y,
			start: { x: 0, y: 0, binding: target ? bindingFor(target, e.page) : undefined },
			end: { x: 0, y: 0 },
			endHead: this.id === 'arrow' ? 'arrow' : 'none',
			style: ed.styleForNewShape(),
		})
		ed.createShapes([s])
		this.creating = { id: s.id, origin }
	}

	override onPointerMove(e: BoardPointerEvent) {
		const ed = this.editor
		if (!this.creating) {
			const t = e.accel ? undefined : ed.getBindTarget(e.page)
			ed.setState({ hoveredId: t?.id ?? null })
			return
		}
		const line = ed.getShape(this.creating.id) as LineShape | undefined
		if (!line) return
		const o = this.creating.origin
		let page = ed.pagePointWithGrid(e.page)
		if (e.shift) {
			const a = snapAngle(angleOf(o, page), Math.PI / 4)
			const r = dist(o, page)
			page = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r }
		}
		const target = e.accel ? undefined : ed.getBindTarget(e.page, [line.id])
		// Binding both ends to the same shape draws nothing useful.
		const sameAsStart = target && target.id === line.start.binding?.shapeId
		const binding = target && !sameAsStart ? bindingFor(target, page) : undefined
		ed.putShapes([{ ...line, end: { x: page.x - line.x, y: page.y - line.y, binding } }])
		ed.setState({ hoveredId: binding ? target!.id : null })
	}

	override onPointerUp(e: BoardPointerEvent) {
		const ed = this.editor
		if (!this.creating) return
		const { id, origin } = this.creating
		this.creating = null
		const line = ed.getShape(id) as LineShape | undefined
		if (
			line &&
			dist(origin, e.page) * ed.getState().camera.z < DRAG_DISTANCE &&
			!line.end.binding
		) {
			// A click without a drag: make a default-length line rather than a dot.
			ed.putShapes([{ ...line, end: { x: 160, y: 0 } }])
		}
		ed.history.endGroup()
		ed.setState({ hoveredId: null })
		ed.afterCreate([id])
	}

	override onCancel() {
		if (this.creating) this.editor.history.cancelGroup()
		this.creating = null
	}
}

export class DrawTool extends Tool {
	override cursor = 'crosshair'
	private creating: { id: ShapeId; points: DrawShape['points'] } | null = null

	constructor(
		editor: import('../editor').Editor,
		readonly id: 'draw' | 'highlighter'
	) {
		super(editor)
	}

	override onEnter() {
		this.editor.setCursor('crosshair')
	}
	override onExit() {
		this.onCancel()
		this.editor.setCursor('default')
	}

	override onPointerDown(e: BoardPointerEvent) {
		if (e.button !== 0) return
		const ed = this.editor
		ed.history.beginGroup()
		const style = ed.styleForNewShape()
		const s = createShape('draw', {
			x: e.page.x,
			y: e.page.y,
			points: [{ x: 0, y: 0, p: pressureOf(e) }],
			highlighter: this.id === 'highlighter',
			style:
				this.id === 'highlighter'
					? { ...style, color: style.color === 'ink' ? 'yellow' : style.color }
					: style,
		})
		ed.createShapes([s])
		this.creating = { id: s.id, points: s.points }
	}

	override onPointerMove(e: BoardPointerEvent) {
		const ed = this.editor
		if (!this.creating) return
		const s = ed.getShape(this.creating.id)
		if (s?.type !== 'draw') return
		const p = { x: e.page.x - s.x, y: e.page.y - s.y, p: pressureOf(e) }
		const pts = this.creating.points
		const last = pts[pts.length - 1]
		// Skip sub-pixel moves; they add points without adding shape.
		if (Math.hypot(p.x - last.x, p.y - last.y) * ed.getState().camera.z < 1) return
		if (e.shift && pts.length >= 1) {
			// Shift draws a straight segment from the stroke's first point.
			this.creating.points = [pts[0], p]
		} else {
			this.creating.points = [...pts, p]
		}
		ed.putShapes([{ ...s, points: this.creating.points }])
	}

	override onPointerUp() {
		const ed = this.editor
		if (!this.creating) return
		const { id, points } = this.creating
		this.creating = null
		const s = ed.getShape(id)
		if (s?.type === 'draw') {
			const simplified = simplifyPolyline(
				points,
				0.5 / ed.getState().camera.z
			) as DrawShape['points']
			const first = simplified[0]
			const last = simplified[simplified.length - 1]
			const closed =
				simplified.length > 6 &&
				Math.hypot(first.x - last.x, first.y - last.y) * ed.getState().camera.z < 12 &&
				!s.highlighter
			ed.putShapes([{ ...s, points: simplified.length ? simplified : points, closed }])
		}
		ed.history.endGroup()
		// Drawing stays in the draw tool; picking select after every stroke would be maddening.
	}

	override onCancel() {
		if (this.creating) this.editor.history.cancelGroup()
		this.creating = null
	}
}

function pressureOf(e: BoardPointerEvent) {
	return e.pointerType === 'pen' ? e.pressure : 0.5
}

export class EraserTool extends Tool {
	readonly id = 'eraser'
	override cursor = 'cell'
	private erasing = false
	private last: Vec | null = null
	private hits = new Set<ShapeId>()

	override onEnter() {
		this.editor.setCursor('cell')
	}
	override onExit() {
		this.onCancel()
		this.editor.setCursor('default')
	}

	override onPointerDown(e: BoardPointerEvent) {
		this.erasing = true
		this.last = e.page
		this.hits.clear()
		this.collect(e.page)
	}

	override onPointerMove(e: BoardPointerEvent) {
		if (!this.erasing) return
		this.collect(e.page)
		this.last = e.page
	}

	override onPointerUp() {
		if (!this.erasing) return
		this.erasing = false
		const ids = [...this.hits]
		this.hits.clear()
		this.editor.setState({ erasingIds: [] })
		this.editor.deleteShapes(ids)
	}

	override onCancel() {
		this.erasing = false
		this.hits.clear()
		this.editor.setState({ erasingIds: [] })
	}

	override onKeyDown(e: BoardKeyEvent) {
		if (e.key === 'Escape' && this.erasing) {
			this.onCancel()
			return true
		}
		return false
	}

	/** Tests the swept segment, not just the point, so fast strokes do not skip shapes. */
	private collect(page: Vec) {
		const ed = this.editor
		const tol = ed.getHitTolerance()
		const from = this.last ?? page
		const steps = Math.max(1, Math.ceil(dist(from, page) / (tol * 2)))
		for (let i = 0; i <= steps; i++) {
			const t = i / steps
			const p = { x: from.x + (page.x - from.x) * t, y: from.y + (page.y - from.y) * t }
			for (const s of ed.getShapes()) {
				if (s.locked || this.hits.has(s.id)) continue
				if (hitTest(s, p, tol)) this.hits.add(s.id)
			}
		}
		ed.setState({ erasingIds: [...this.hits] })
	}
}
