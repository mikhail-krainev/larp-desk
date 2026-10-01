import { cloneShapes, hasText } from '../editor'
import { boxFromCorners, unionBoxes } from '../math/box'
import { Vec, angleOf, dist, snapAngle, sub } from '../math/vec'
import { bindingFor } from '../model/bindings'
import { pageBounds, toLocal, toPage } from '../model/shapes'
import { snapBox } from '../model/snapping'
import {
	Handle,
	SelectionFrame,
	computeScale,
	frameToPage,
	resizeShape,
	rotateShape,
	selectionFrame,
	translateShape,
} from '../model/transform'
import { LineShape, Shape, ShapeId } from '../model/types'
import { BoardKeyEvent, BoardPointerEvent, Tool } from './tool'

/** Screen pixels the pointer must travel before a press becomes a drag. */
export const DRAG_DISTANCE = 4

type State =
	| { name: 'idle' }
	| {
			name: 'pointing'
			origin: BoardPointerEvent
			/** Shape under the pointer, if any. */
			hit: Shape | null
			/** Shift-clicking a selected shape deselects it, but only if no drag follows. */
			toggleOnUp: ShapeId | null
	  }
	| {
			name: 'translating'
			origin: Vec
			initial: Shape[]
			cloned: boolean
			snapTargets: ReturnType<typeof pageBounds>[]
	  }
	| { name: 'brushing'; origin: Vec; initialSelection: ShapeId[] }
	| { name: 'resizing'; handle: Handle; frame: SelectionFrame; initial: Shape[] }
	| { name: 'rotating'; center: Vec; startAngle: number; initial: Shape[] }
	| { name: 'line-end'; end: 'start' | 'end'; initial: LineShape }
	| { name: 'line-bend'; initial: LineShape }

export class SelectTool extends Tool {
	readonly id = 'select'
	private state: State = { name: 'idle' }
	private lastPointer: BoardPointerEvent | null = null

	override onExit() {
		this.onCancel()
	}

	override onPointerDown(e: BoardPointerEvent) {
		if (e.button !== 0) return
		const ed = this.editor
		if (ed.getState().editingId) ed.stopEditing()
		const t = e.target

		if (t?.kind === 'handle' || t?.kind === 'rotate') {
			const shapes = ed.getSelectedShapes().filter((s) => !s.locked)
			const frame = selectionFrame(shapes)
			if (!frame) return
			ed.history.beginGroup()
			if (t.kind === 'handle') {
				this.state = { name: 'resizing', handle: t.handle, frame, initial: shapes }
			} else {
				const center = selectionCenter(frame)
				this.state = {
					name: 'rotating',
					center,
					startAngle: angleOf(center, e.page),
					initial: shapes,
				}
			}
			return
		}

		if (t?.kind === 'line-end' || t?.kind === 'line-bend') {
			const line = ed.getShape(t.shapeId)
			if (line?.type !== 'line' || line.locked) return
			ed.history.beginGroup()
			this.state =
				t.kind === 'line-end'
					? { name: 'line-end', end: t.end, initial: line }
					: { name: 'line-bend', initial: line }
			return
		}

		const hit = ed.getShapeAt(e.page) ?? null
		let toggleOnUp: ShapeId | null = null
		if (hit) {
			if (e.shift) {
				if (ed.isSelected(hit.id)) toggleOnUp = hit.id
				else ed.select([...ed.getState().selectedIds, hit.id])
			} else if (!ed.isSelected(hit.id)) {
				ed.select([hit.id])
			}
		}
		this.state = { name: 'pointing', origin: e, hit, toggleOnUp }
	}

	override onPointerMove(e: BoardPointerEvent) {
		this.lastPointer = e
		const ed = this.editor
		const s = this.state
		switch (s.name) {
			case 'idle': {
				const hit = ed.getShapeAt(e.page)
				ed.setState({ hoveredId: hit?.id ?? null })
				return
			}
			case 'pointing': {
				if (dist(e.screen, s.origin.screen) < DRAG_DISTANCE) return
				if (s.hit) this.startTranslating(s.origin, e)
				else {
					const initialSelection = e.shift ? ed.getState().selectedIds : []
					if (!e.shift) ed.clearSelection()
					this.state = { name: 'brushing', origin: s.origin.page, initialSelection }
				}
				this.onPointerMove(e)
				return
			}
			case 'translating':
				return this.translate(s, e)
			case 'brushing': {
				const brush = boxFromCorners(s.origin, e.page)
				const hits = ed.getShapesInBox(brush, e.accel ? 'contain' : 'touch').map((h) => h.id)
				ed.setState({ brush })
				ed.select([...new Set([...s.initialSelection, ...hits])])
				return
			}
			case 'resizing': {
				const scale = computeScale(s.frame, s.handle, e.page, {
					keepAspect: e.shift || s.initial.some(keepsAspect),
					fromCenter: e.alt,
				})
				ed.putShapes(s.initial.map((sh) => resizeShape(sh, s.frame, scale, s.handle)))
				return
			}
			case 'rotating': {
				let delta = angleOf(s.center, e.page) - s.startAngle
				if (e.shift) delta = snapAngle(delta, Math.PI / 12)
				ed.putShapes(s.initial.map((sh) => rotateShape(sh, s.center, delta)))
				return
			}
			case 'line-end':
				return this.dragLineEnd(s.initial, s.end, e)
			case 'line-bend': {
				const line = s.initial
				const p = toLocal(line, e.page)
				const d = sub(line.end, line.start)
				const l = Math.hypot(d.x, d.y) || 1
				const mid = { x: (line.start.x + line.end.x) / 2, y: (line.start.y + line.end.y) / 2 }
				let bend = ((p.x - mid.x) * -d.y + (p.y - mid.y) * d.x) / l
				if (Math.abs(bend) < 8 / ed.getState().camera.z) bend = 0
				ed.putShapes([{ ...line, bend }])
				return
			}
		}
	}

	override onPointerUp(e: BoardPointerEvent) {
		const ed = this.editor
		const s = this.state
		switch (s.name) {
			case 'pointing':
				if (s.toggleOnUp) ed.select(ed.getState().selectedIds.filter((id) => id !== s.toggleOnUp))
				else if (!s.hit && !e.shift) ed.clearSelection()
				else if (s.hit && !e.shift && ed.getState().selectedIds.length > 1) ed.select([s.hit.id])
				break
			case 'brushing':
				ed.setState({ brush: null })
				break
			case 'translating':
			case 'resizing':
			case 'rotating':
			case 'line-end':
			case 'line-bend':
				ed.history.endGroup()
				ed.setState({ snapGuides: [] })
				break
		}
		this.state = { name: 'idle' }
	}

	override onDoubleClick(e: BoardPointerEvent) {
		const ed = this.editor
		const hit = ed.getShapeAt(e.page)
		if (hit && hasText(hit)) {
			ed.startEditing(hit.id)
			return
		}
		if (!hit) {
			ed.setTool('text')
			ed.getCurrentTool()?.onPointerDown(e)
			ed.getCurrentTool()?.onPointerUp(e)
		}
	}

	override onKeyDown(e: BoardKeyEvent) {
		if (e.key === 'Escape' && this.state.name !== 'idle') {
			this.onCancel()
			return true
		}
		if (e.key === 'Enter' && this.state.name === 'idle') {
			const sel = this.editor.getSelectedShapes()
			if (sel.length === 1 && hasText(sel[0])) {
				this.editor.startEditing(sel[0].id)
				return true
			}
		}
		// Modifier changes mid-gesture should take effect without waiting for the pointer.
		if ((e.key === 'Shift' || e.key === 'Alt') && this.lastPointer && this.state.name !== 'idle') {
			this.onPointerMove({ ...this.lastPointer, shift: e.shift, alt: e.alt })
		}
		return false
	}

	override onKeyUp(e: BoardKeyEvent) {
		if ((e.key === 'Shift' || e.key === 'Alt') && this.lastPointer && this.state.name !== 'idle') {
			this.onPointerMove({ ...this.lastPointer, shift: e.shift, alt: e.alt })
		}
	}

	override onCancel() {
		const ed = this.editor
		const s = this.state
		if (s.name === 'brushing') {
			ed.select(s.initialSelection)
			ed.setState({ brush: null })
		} else if (s.name !== 'idle' && s.name !== 'pointing') {
			ed.history.cancelGroup()
			ed.setState({ snapGuides: [] })
		}
		this.state = { name: 'idle' }
	}

	private startTranslating(origin: BoardPointerEvent, e: BoardPointerEvent) {
		const ed = this.editor
		ed.history.beginGroup()
		let initial = ed.getSelectedShapes().filter((s) => !s.locked)
		let cloned = false
		if (e.alt && initial.length) {
			const copies = cloneShapes(initial, { x: 0, y: 0 }, ed.topZ())
			ed.createShapes(copies)
			ed.select(copies.map((c) => c.id))
			initial = copies.map((c) => ed.getShape(c.id)!)
			cloned = true
		}
		const moving = new Set(initial.map((s) => s.id))
		const snapTargets = ed
			.getVisibleShapes(0)
			.filter((s) => !moving.has(s.id) && s.type !== 'line' && s.type !== 'draw')
			.map(pageBounds)
		this.state = { name: 'translating', origin: origin.page, initial, cloned, snapTargets }
	}

	private translate(s: Extract<State, { name: 'translating' }>, e: BoardPointerEvent) {
		const ed = this.editor
		let delta = sub(e.page, s.origin)
		if (e.shift) {
			if (Math.abs(delta.x) > Math.abs(delta.y)) delta = { x: delta.x, y: 0 }
			else delta = { x: 0, y: delta.y }
		}
		let guides: ReturnType<typeof snapBox>['guides'] = []
		const b = unionBoxes(s.initial.map(pageBounds))
		if (b && ed.getState().grid) {
			const snapped = ed.pagePointWithGrid({ x: b.x + delta.x, y: b.y + delta.y })
			delta = { x: snapped.x - b.x, y: snapped.y - b.y }
		} else if (b && ed.getState().snapping && !e.accel) {
			const moved = { ...b, x: b.x + delta.x, y: b.y + delta.y }
			const snap = snapBox(moved, s.snapTargets, ed.snapThreshold())
			delta = { x: delta.x + snap.offset.x, y: delta.y + snap.offset.y }
			guides = snap.guides
		}
		ed.putShapes(s.initial.map((sh) => translateShape(sh, delta)))
		ed.setState({ snapGuides: guides })
	}

	private dragLineEnd(initial: LineShape, end: 'start' | 'end', e: BoardPointerEvent) {
		const ed = this.editor
		const target = e.accel ? undefined : ed.getBindTarget(e.page, [initial.id])
		const other = end === 'start' ? initial.end : initial.start
		let page = e.page
		if (e.shift) {
			const o = toPage(initial, other)
			const a = snapAngle(angleOf(o, page), Math.PI / 4)
			const r = dist(o, page)
			page = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r }
		}
		const local = toLocal(initial, page)
		const binding = target ? bindingFor(target, page) : undefined
		ed.putShapes([{ ...initial, [end]: { ...local, binding } }])
		ed.setState({ hoveredId: target?.id ?? null })
	}
}

function selectionCenter(f: SelectionFrame) {
	return frameToPage(f, { x: f.box.x + f.box.w / 2, y: f.box.y + f.box.h / 2 })
}

const keepsAspect = (s: Shape) => s.type === 'image'
