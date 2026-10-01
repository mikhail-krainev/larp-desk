import { Box, boxCenter, unionBoxes } from './math/box'
import { Vec, sub } from './math/vec'
import { canBindTo, lineTargets, resolveLine } from './model/bindings'
import {
	MAX_ZOOM,
	clampZoom,
	fitBox,
	nextZoomStep,
	pageToScreen,
	screenToPage,
	viewportPageBounds,
	zoomAt,
} from './model/camera'
import { History } from './model/history'
import { deepClone, uid } from './model/ids'
import { migrateDocument, SCHEMA_VERSION } from './model/migrations'
import {
	DEFAULT_STYLE,
	LINE_HEIGHT,
	estimateText,
	hitTest,
	intersectsBox,
	pageBounds,
} from './model/shapes'
import { SnapGuide } from './model/snapping'
import { Diff, ShapeStore, StoreEvent } from './model/store'
import { translateShape } from './model/transform'
import { BoardDocument, Camera, Shape, ShapeId, ShapePatch, Style } from './model/types'
import { BoardKeyEvent, BoardPointerEvent, Tool } from './tools/tool'

export type TextMeasurer = (
	text: string,
	fontSize: number,
	maxWidth?: number
) => { w: number; h: number }

export type Theme = 'light' | 'dark'

export interface InstanceState {
	camera: Camera
	viewport: { w: number; h: number }
	selectedIds: ShapeId[]
	hoveredId: ShapeId | null
	editingId: ShapeId | null
	toolId: string
	/** Keep the creation tool active after drawing a shape instead of returning to select. */
	toolLocked: boolean
	brush: Box | null
	snapGuides: SnapGuide[]
	/** Shapes the eraser is about to remove, drawn faded. */
	erasingIds: ShapeId[]
	/** Style used for the next shape a tool creates. */
	nextStyle: Style
	theme: Theme
	grid: boolean
	snapping: boolean
	isPanning: boolean
	cursor: string
}

export interface EditorOptions {
	tools?(editor: Editor): Tool[]
	measureText?: TextMeasurer
}

export const GRID_SIZE = 20
export const STICKY_PADDING = 16
export const TEXT_PADDING = 4
/** Hit tolerance in screen pixels; divided by zoom before use. */
export const HIT_TOLERANCE = 6

/**
 * The board engine. Owns the document store, undo history, camera, selection and tools, and
 * turns input events into document changes. Rendering lives elsewhere and only reads from here.
 */
export class Editor {
	readonly store = new ShapeStore()
	readonly history: History
	private tools = new Map<string, Tool>()
	private listeners = new Set<() => void>()
	private _state: InstanceState
	private _version = 0
	private _clipboard: Shape[] | null = null
	measureText: TextMeasurer

	constructor(opts: EditorOptions = {}) {
		this.measureText = opts.measureText ?? estimateText
		this._state = {
			camera: { x: 0, y: 0, z: 1 },
			viewport: { w: 1, h: 1 },
			selectedIds: [],
			hoveredId: null,
			editingId: null,
			toolId: 'select',
			toolLocked: false,
			brush: null,
			snapGuides: [],
			erasingIds: [],
			nextStyle: { ...DEFAULT_STYLE },
			theme: 'light',
			grid: false,
			snapping: true,
			isPanning: false,
			cursor: 'default',
		}
		this.history = new History(
			this.store,
			() => this._state.selectedIds,
			(ids) => this.setState({ selectedIds: ids })
		)
		this.store.listen((e) => this.onStoreChange(e))
		for (const t of opts.tools?.(this) ?? []) this.tools.set(t.id, t)
		this.getCurrentTool()?.onEnter()
	}

	// ---------------------------------------------------------------- observation

	getState(): Readonly<InstanceState> {
		return this._state
	}

	/** Bumps on every store or instance change; cheap snapshot for React. */
	getVersion() {
		return this._version
	}

	subscribe(fn: () => void) {
		this.listeners.add(fn)
		return () => {
			this.listeners.delete(fn)
		}
	}

	setState(patch: Partial<InstanceState>) {
		let changed = false
		for (const k in patch) {
			if ((this._state as any)[k] !== (patch as any)[k]) {
				changed = true
				break
			}
		}
		if (!changed) return
		this._state = { ...this._state, ...patch }
		this.notify()
	}

	private notify() {
		this._version++
		for (const l of [...this.listeners]) l()
	}

	private onStoreChange({ diff }: StoreEvent) {
		const sel = this._state.selectedIds.filter((id) => this.store.has(id))
		const patch: Partial<InstanceState> = {}
		if (sel.length !== this._state.selectedIds.length) patch.selectedIds = sel
		if (this._state.editingId && !this.store.has(this._state.editingId)) patch.editingId = null
		if (this._state.hoveredId && !this.store.has(this._state.hoveredId)) patch.hoveredId = null
		this._state = { ...this._state, ...patch }
		this.lastDiff = diff
		this.notify()
	}

	/** The most recent store diff, for renderers that want to patch rather than redraw. */
	lastDiff: Diff = new Map()

	// ---------------------------------------------------------------- shapes

	getShape(id: ShapeId) {
		return this.store.get(id)
	}

	getShapes(): readonly Shape[] {
		return this.store.all()
	}

	getSelectedShapes(): Shape[] {
		return this._state.selectedIds.map((id) => this.store.get(id)).filter((s): s is Shape => !!s)
	}

	/** Runs `fn` as one store transaction and, unless already in one, one undo step. */
	batch<T>(fn: () => T): T {
		this.history.beginGroup()
		try {
			return this.store.transact(fn)
		} finally {
			this.history.endGroup()
		}
	}

	createShapes(shapes: Shape[]) {
		if (shapes.length === 0) return
		this.batch(() => {
			let top = this.topZ()
			const out = shapes.map((s) => (s.z === 0 ? { ...s, z: ++top } : s))
			this.store.put(out.map((s) => this.normalize(s)))
			this.repairBindings(out.map((s) => s.id))
		})
	}

	updateShapes(patches: ShapePatch[]) {
		if (patches.length === 0) return
		this.batch(() => {
			const next: Shape[] = []
			for (const p of patches) {
				const prev = this.store.get(p.id)
				if (!prev) continue
				next.push(this.normalize({ ...prev, ...p } as Shape))
			}
			this.store.put(next)
			this.repairBindings(next.map((s) => s.id))
		})
	}

	/** Replaces whole records; used by tools that compute shapes from a gesture's start state. */
	putShapes(shapes: Shape[]) {
		if (shapes.length === 0) return
		this.batch(() => {
			this.store.put(shapes.map((s) => this.normalize(s)))
			this.repairBindings(shapes.map((s) => s.id))
		})
	}

	deleteShapes(ids: ShapeId[]) {
		const existing = ids.filter((id) => this.store.has(id) && !this.store.get(id)!.locked)
		if (existing.length === 0) return
		this.batch(() => {
			this.store.remove(existing)
			this.repairBindings(existing)
		})
	}

	/**
	 * Keeps derived data consistent after `changed` shapes moved or vanished: bound line
	 * endpoints follow their targets, and text-bearing shapes keep their measured size.
	 */
	private repairBindings(changed: ShapeId[]) {
		const changedSet = new Set(changed)
		const fixes: Shape[] = []
		for (const s of this.store.all()) {
			if (s.type !== 'line') continue
			if (!changedSet.has(s.id) && !lineTargets(s).some((t) => changedSet.has(t))) continue
			const resolved = resolveLine(s, (id) => this.store.get(id))
			if (resolved !== s) fixes.push(resolved)
		}
		if (fixes.length) this.store.put(fixes)
	}

	/** Derives sizes that follow content. Pure apart from text measurement. */
	normalize(s: Shape): Shape {
		switch (s.type) {
			case 'text': {
				const m = this.measureText(s.text || ' ', s.fontSize, s.autoWidth ? undefined : s.w)
				const w = s.autoWidth ? m.w + TEXT_PADDING * 2 : s.w
				const h = m.h + TEXT_PADDING * 2
				return w === s.w && h === s.h ? s : { ...s, w, h }
			}
			case 'sticky': {
				const m = this.measureText(s.text || ' ', s.fontSize, s.w - STICKY_PADDING * 2)
				const h = Math.max(s.w, m.h + STICKY_PADDING * 2)
				return h === s.h ? s : { ...s, h }
			}
			default:
				return s
		}
	}

	topZ() {
		const all = this.store.all()
		return all.length ? all[all.length - 1].z : 0
	}

	// ---------------------------------------------------------------- queries

	getHitTolerance() {
		return HIT_TOLERANCE / this._state.camera.z
	}

	/** Topmost shape under a page point. Selected shapes win ties so they stay easy to drag. */
	getShapeAt(page: Vec, opts: { tolerance?: number; filter?(s: Shape): boolean } = {}) {
		const tol = opts.tolerance ?? this.getHitTolerance()
		const shapes = this.store.all()
		for (let i = shapes.length - 1; i >= 0; i--) {
			const s = shapes[i]
			if (opts.filter && !opts.filter(s)) continue
			if (hitTest(s, page, tol)) return s
		}
		return undefined
	}

	getBindTarget(page: Vec, exclude: ShapeId[] = []) {
		return this.getShapeAt(page, {
			tolerance: this.getHitTolerance() * 2,
			filter: (s) => canBindTo(s) && !exclude.includes(s.id),
		})
	}

	getShapesInBox(b: Box, mode: 'touch' | 'contain' = 'touch') {
		return this.store.all().filter((s) => {
			if (mode === 'touch') return intersectsBox(s, b)
			const pb = pageBounds(s)
			return pb.x >= b.x && pb.y >= b.y && pb.x + pb.w <= b.x + b.w && pb.y + pb.h <= b.y + b.h
		})
	}

	getSelectionBounds(): Box | null {
		return unionBoxes(this.getSelectedShapes().map(pageBounds))
	}

	getContentBounds(): Box | null {
		return unionBoxes(this.store.all().map(pageBounds))
	}

	/** Shapes worth rendering: anything whose bounds touch the viewport, with some margin. */
	getVisibleShapes(margin = 200): Shape[] {
		const vp = viewportPageBounds(this._state.camera, this._state.viewport)
		const m = margin / this._state.camera.z
		const b = { x: vp.x - m, y: vp.y - m, w: vp.w + m * 2, h: vp.h + m * 2 }
		return this.store.all().filter((s) => {
			const pb = pageBounds(s)
			return pb.x <= b.x + b.w && pb.x + pb.w >= b.x && pb.y <= b.y + b.h && pb.y + pb.h >= b.y
		})
	}

	// ---------------------------------------------------------------- selection

	select(ids: ShapeId[]) {
		const valid = ids.filter((id) => this.store.has(id))
		const prev = this._state.selectedIds
		if (prev.length === valid.length && prev.every((id, i) => id === valid[i])) return
		this.setState({ selectedIds: valid })
	}

	selectAll() {
		this.select(this.store.all().map((s) => s.id))
	}

	clearSelection() {
		this.select([])
	}

	isSelected(id: ShapeId) {
		return this._state.selectedIds.includes(id)
	}

	// ---------------------------------------------------------------- camera

	setViewport(w: number, h: number) {
		const vp = this._state.viewport
		if (vp.w === w && vp.h === h) return
		this.setState({ viewport: { w, h } })
	}

	setCamera(c: Camera) {
		const z = clampZoom(c.z)
		const prev = this._state.camera
		if (prev.x === c.x && prev.y === c.y && prev.z === z) return
		this.setState({ camera: { x: c.x, y: c.y, z } })
	}

	screenToPage(p: Vec) {
		return screenToPage(this._state.camera, p)
	}

	pageToScreen(p: Vec) {
		return pageToScreen(this._state.camera, p)
	}

	panBy(screenDelta: Vec) {
		const c = this._state.camera
		this.setCamera({ x: c.x + screenDelta.x / c.z, y: c.y + screenDelta.y / c.z, z: c.z })
	}

	zoomAt(screen: Vec, z: number) {
		this.setCamera(zoomAt(this._state.camera, screen, z))
	}

	private getViewportCenter() {
		return { x: this._state.viewport.w / 2, y: this._state.viewport.h / 2 }
	}

	zoomIn() {
		this.zoomAt(this.getViewportCenter(), nextZoomStep(this._state.camera.z, 1))
	}

	zoomOut() {
		this.zoomAt(this.getViewportCenter(), nextZoomStep(this._state.camera.z, -1))
	}

	resetZoom() {
		this.zoomAt(this.getViewportCenter(), 1)
	}

	zoomToFit() {
		const b = this.getContentBounds()
		if (!b) return this.setCamera({ x: 0, y: 0, z: 1 })
		this.setCamera(fitBox(this._state.viewport, b))
	}

	zoomToSelection() {
		const b = this.getSelectionBounds()
		if (!b) return
		this.setCamera(fitBox(this._state.viewport, b, 64, MAX_ZOOM))
	}

	centerOn(page: Vec) {
		const z = this._state.camera.z
		const vp = this._state.viewport
		this.setCamera({ x: vp.w / 2 / z - page.x, y: vp.h / 2 / z - page.y, z })
	}

	// ---------------------------------------------------------------- tools and input

	registerTool(tool: Tool) {
		this.tools.set(tool.id, tool)
	}

	getCurrentTool(): Tool | undefined {
		return this.tools.get(this._state.toolId)
	}

	setTool(id: string) {
		if (!this.tools.has(id) || id === this._state.toolId) return
		this.stopEditing()
		this.getCurrentTool()?.onExit()
		this.setState({ toolId: id, brush: null, snapGuides: [], erasingIds: [] })
		this.getCurrentTool()?.onEnter()
	}

	setCursor(cursor: string) {
		this.setState({ cursor })
	}

	/** Called by a creation tool when it finishes a shape. */
	afterCreate(ids: ShapeId[]) {
		this.select(ids)
		if (!this._state.toolLocked) this.setTool('select')
	}

	pointerDown(e: BoardPointerEvent) {
		this.getCurrentTool()?.onPointerDown(e)
	}

	pointerMove(e: BoardPointerEvent) {
		this.getCurrentTool()?.onPointerMove(e)
	}

	pointerUp(e: BoardPointerEvent) {
		this.getCurrentTool()?.onPointerUp(e)
	}

	doubleClick(e: BoardPointerEvent) {
		this.getCurrentTool()?.onDoubleClick(e)
	}

	cancel() {
		this.getCurrentTool()?.onCancel()
	}

	keyDown(e: BoardKeyEvent): boolean {
		if (this.getCurrentTool()?.onKeyDown(e)) return true
		return this.handleShortcut(e)
	}

	keyUp(e: BoardKeyEvent) {
		this.getCurrentTool()?.onKeyUp(e)
	}

	private handleShortcut(e: BoardKeyEvent): boolean {
		const k = e.key.toLowerCase()
		if (e.accel) {
			switch (k) {
				case 'z':
					if (e.shift) this.redo()
					else this.undo()
					return true
				case 'y':
					this.redo()
					return true
				case 'a':
					this.selectAll()
					return true
				case 'd':
					this.duplicate()
					return true
				case '=':
				case '+':
					this.zoomIn()
					return true
				case '-':
					this.zoomOut()
					return true
				case '0':
					this.resetZoom()
					return true
				case ']':
					this.reorder(e.shift ? 'front' : 'forward')
					return true
				case '[':
					this.reorder(e.shift ? 'back' : 'backward')
					return true
			}
			return false
		}
		if (e.shift) {
			switch (k) {
				case '1':
					this.zoomToFit()
					return true
				case '2':
					this.zoomToSelection()
					return true
				case '0':
					this.resetZoom()
					return true
			}
		}
		switch (e.key) {
			case 'Delete':
			case 'Backspace':
				this.deleteShapes(this._state.selectedIds)
				return true
			case 'Escape':
				if (this._state.selectedIds.length) this.clearSelection()
				else this.setTool('select')
				return true
			case 'ArrowLeft':
			case 'ArrowRight':
			case 'ArrowUp':
			case 'ArrowDown': {
				const step = e.shift ? 10 : 1
				const d = {
					ArrowLeft: { x: -step, y: 0 },
					ArrowRight: { x: step, y: 0 },
					ArrowUp: { x: 0, y: -step },
					ArrowDown: { x: 0, y: step },
				}[e.key]
				this.nudge(d)
				return true
			}
		}
		const toolKeys: Record<string, string> = {
			v: 'select',
			h: 'hand',
			r: 'rect',
			o: 'ellipse',
			a: 'arrow',
			l: 'line',
			d: 'draw',
			p: 'draw',
			e: 'eraser',
			t: 'text',
			n: 'sticky',
			f: 'frame',
		}
		if (!e.alt && toolKeys[k] && this.tools.has(toolKeys[k])) {
			this.setTool(toolKeys[k])
			return true
		}
		return false
	}

	// ---------------------------------------------------------------- commands

	undo() {
		this.stopEditing()
		this.history.undo()
	}

	redo() {
		this.stopEditing()
		this.history.redo()
	}

	nudge(delta: Vec) {
		const shapes = this.getSelectedShapes().filter((s) => !s.locked)
		this.putShapes(shapes.map((s) => translateShape(s, delta)))
	}

	/** Copies the selection, offset so the copies are visible, and selects them. */
	duplicate(offset: Vec = { x: 16, y: 16 }) {
		const shapes = this.getSelectedShapes()
		if (!shapes.length) return
		const copies = cloneShapes(shapes, offset, this.topZ())
		this.createShapes(copies)
		this.select(copies.map((s) => s.id))
	}

	copy(): string | null {
		const shapes = this.getSelectedShapes()
		if (!shapes.length) return null
		this._clipboard = shapes
		return serializeClipboard(shapes)
	}

	cut(): string | null {
		const data = this.copy()
		if (data) this.deleteShapes(this._state.selectedIds)
		return data
	}

	/**
	 * Pastes shapes from `data` (or the in-memory clipboard). With `at`, the pasted group is
	 * centered there; otherwise it lands offset from the originals.
	 */
	paste(data?: string | null, at?: Vec) {
		const shapes = (data && parseClipboard(data)) || this._clipboard
		if (!shapes?.length) return false
		const b = unionBoxes(shapes.map(pageBounds))!
		const offset = at ? sub(at, boxCenter(b)) : { x: 24, y: 24 }
		const copies = cloneShapes(shapes, offset, this.topZ())
		this.createShapes(copies)
		this.select(copies.map((s) => s.id))
		if (!at) this._clipboard = copies
		return true
	}

	reorder(dir: 'front' | 'back' | 'forward' | 'backward') {
		const sel = new Set(this._state.selectedIds)
		if (!sel.size) return
		const all = [...this.store.all()]
		const picked = all.filter((s) => sel.has(s.id))
		const rest = all.filter((s) => !sel.has(s.id))
		let order: Shape[]
		switch (dir) {
			case 'front':
				order = [...rest, ...picked]
				break
			case 'back':
				order = [...picked, ...rest]
				break
			case 'forward':
			case 'backward': {
				order = all.slice()
				const step = dir === 'forward' ? 1 : -1
				const idxs = order.map((s, i) => (sel.has(s.id) ? i : -1)).filter((i) => i >= 0)
				if (step > 0) idxs.reverse()
				for (const i of idxs) {
					const j = i + step
					if (j < 0 || j >= order.length || sel.has(order[j].id)) continue
					;[order[i], order[j]] = [order[j], order[i]]
				}
				break
			}
		}
		// Renumbering everything keeps z dense; only changed records produce diff entries.
		this.putShapes(order.map((s, i) => (s.z === i + 1 ? s : { ...s, z: i + 1 })))
	}

	align(edge: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom') {
		const shapes = this.getSelectedShapes().filter((s) => !s.locked)
		if (shapes.length < 2) return
		const b = unionBoxes(shapes.map(pageBounds))!
		this.putShapes(
			shapes.map((s) => {
				const pb = pageBounds(s)
				let dx = 0
				let dy = 0
				if (edge === 'left') dx = b.x - pb.x
				if (edge === 'right') dx = b.x + b.w - (pb.x + pb.w)
				if (edge === 'center-x') dx = b.x + b.w / 2 - (pb.x + pb.w / 2)
				if (edge === 'top') dy = b.y - pb.y
				if (edge === 'bottom') dy = b.y + b.h - (pb.y + pb.h)
				if (edge === 'center-y') dy = b.y + b.h / 2 - (pb.y + pb.h / 2)
				return translateShape(s, { x: dx, y: dy })
			})
		)
	}

	/** Spaces shapes so the gaps between neighbours are equal. */
	distribute(axis: 'x' | 'y') {
		const shapes = this.getSelectedShapes().filter((s) => !s.locked)
		if (shapes.length < 3) return
		const items = shapes
			.map((s) => ({ s, b: pageBounds(s) }))
			.sort((a, b) => (axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y))
		const size = (b: Box) => (axis === 'x' ? b.w : b.h)
		const pos = (b: Box) => (axis === 'x' ? b.x : b.y)
		const first = items[0].b
		const last = items[items.length - 1].b
		const span = pos(last) + size(last) - pos(first)
		const total = items.reduce((n, i) => n + size(i.b), 0)
		const gap = (span - total) / (items.length - 1)
		let cursor = pos(first)
		const out: Shape[] = []
		for (const { s, b } of items) {
			const d = cursor - pos(b)
			out.push(translateShape(s, axis === 'x' ? { x: d, y: 0 } : { x: 0, y: d }))
			cursor += size(b) + gap
		}
		this.putShapes(out)
	}

	/** Applies style to the selection and remembers it for the next shape. */
	setStyle(patch: Partial<Style>) {
		this.setState({ nextStyle: { ...this._state.nextStyle, ...patch } })
		const shapes = this.getSelectedShapes()
		if (shapes.length) {
			this.putShapes(shapes.map((s) => ({ ...s, style: { ...s.style, ...patch } })))
		}
	}

	toggleLock() {
		const shapes = this.getSelectedShapes()
		if (!shapes.length) return
		const lock = shapes.some((s) => !s.locked)
		this.putShapes(shapes.map((s) => ({ ...s, locked: lock })))
	}

	// ---------------------------------------------------------------- text editing

	startEditing(id: ShapeId) {
		const s = this.store.get(id)
		if (!s || s.locked || !hasText(s)) return
		this.stopEditing()
		this.select([id])
		// The whole editing session is one undo step, not one per keystroke.
		this.history.beginGroup()
		this.setState({ editingId: id })
	}

	/** Ends text editing. Text shapes left empty are removed. */
	stopEditing() {
		const id = this._state.editingId
		if (!id) return
		this.setState({ editingId: null })
		const s = this.store.get(id)
		if (s?.type === 'text' && s.text.trim() === '') this.deleteShapes([id])
		this.history.endGroup()
	}

	setText(id: ShapeId, text: string) {
		const s = this.store.get(id)
		if (!s || !hasText(s)) return
		if (s.type === 'line') this.updateShapes([{ id, label: text }])
		else if (s.type === 'frame') this.updateShapes([{ id, name: text }])
		else this.updateShapes([{ id, text } as ShapePatch])
	}

	// ---------------------------------------------------------------- persistence

	getDocument(): BoardDocument {
		return { schema: SCHEMA_VERSION, shapes: this.store.all().map((s) => deepClone(s)) }
	}

	/** Replaces the whole board. Not undoable: loading a board starts a fresh history. */
	loadDocument(doc: unknown) {
		const migrated = migrateDocument(doc)
		this.stopEditing()
		this.history.ignore(() => {
			this.store.transact(() => {
				this.store.clear()
				this.store.put(migrated.shapes.map((s) => this.normalize(s)))
			}, 'remote')
		})
		this.history.clear()
		this.setState({ selectedIds: [], hoveredId: null })
	}

	/** Centre the camera on content after a load, keeping zoom at 1 when it fits. */
	frameContent() {
		const b = this.getContentBounds()
		if (!b) return
		this.setCamera(fitBox(this._state.viewport, b, 64, 1))
	}

	// ---------------------------------------------------------------- creation helpers

	styleForNewShape(): Style {
		return { ...this._state.nextStyle }
	}

	snapThreshold() {
		return 8 / this._state.camera.z
	}

	translateBy(shapes: Shape[], delta: Vec) {
		return shapes.map((s) => translateShape(s, delta))
	}

	pagePointWithGrid(p: Vec): Vec {
		if (!this._state.grid) return p
		return {
			x: Math.round(p.x / GRID_SIZE) * GRID_SIZE,
			y: Math.round(p.y / GRID_SIZE) * GRID_SIZE,
		}
	}

	lineHeight(fontSize: number) {
		return fontSize * LINE_HEIGHT
	}
}

export function hasText(s: Shape) {
	return (
		s.type === 'text' ||
		s.type === 'sticky' ||
		s.type === 'rect' ||
		s.type === 'ellipse' ||
		s.type === 'line' ||
		s.type === 'frame'
	)
}

export function textOf(s: Shape): string {
	switch (s.type) {
		case 'line':
			return s.label
		case 'frame':
			return s.name
		case 'text':
		case 'sticky':
		case 'rect':
		case 'ellipse':
			return s.text
		default:
			return ''
	}
}

/** Fresh ids for a set of shapes, with bindings between them rewired to the copies. */
export function cloneShapes(shapes: readonly Shape[], offset: Vec, baseZ: number): Shape[] {
	const ids = new Map(shapes.map((s) => [s.id, uid()]))
	const sorted = [...shapes].sort((a, b) => a.z - b.z)
	return sorted.map((s, i) => {
		const copy: Shape = { ...deepClone(s), id: ids.get(s.id)!, z: baseZ + i + 1 }
		const moved = translateShape(copy, offset)
		if (moved.type !== 'line') return moved
		const rebind = (ep: typeof moved.start) => {
			if (!ep.binding) return ep
			const target = ids.get(ep.binding.shapeId)
			if (!target) return { x: ep.x, y: ep.y }
			return { ...ep, binding: { ...ep.binding, shapeId: target } }
		}
		return { ...moved, start: rebind(moved.start), end: rebind(moved.end) }
	})
}

const CLIPBOARD_MARKER = 'unoboard/shapes'

export function serializeClipboard(shapes: readonly Shape[]) {
	return JSON.stringify({ type: CLIPBOARD_MARKER, schema: SCHEMA_VERSION, shapes })
}

export function parseClipboard(text: string): Shape[] | null {
	try {
		const data = JSON.parse(text)
		if (data?.type !== CLIPBOARD_MARKER) return null
		return migrateDocument({ schema: data.schema, shapes: data.shapes }).shapes
	} catch {
		return null
	}
}
