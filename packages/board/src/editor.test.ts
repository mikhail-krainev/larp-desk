import { pageBounds } from './model/shapes'
import { LineShape, RectShape, TextShape } from './model/types'
import { TestBoard } from './test/TestBoard'

let board: TestBoard
beforeEach(() => {
	board = new TestBoard()
})

const rect = (x: number, y: number, w = 100, h = 100, fill: 'none' | 'solid' = 'solid') =>
	board.add('rect', { x, y, w, h, style: { fill } })

describe('history', () => {
	it('undoes and redoes a create', () => {
		const r = rect(0, 0)
		board.undo()
		expect(board.getShape(r.id)).toBeUndefined()
		board.redo()
		expect(board.getShape(r.id)).toMatchObject({ x: 0, y: 0, w: 100, h: 100 })
	})

	it('folds a whole drag into one undo step', () => {
		const r = rect(0, 0)
		board.drag([50, 50], [150, 250])
		expect(board.shape(r.id)).toMatchObject({ x: 100, y: 200 })
		board.undo()
		expect(board.shape(r.id)).toMatchObject({ x: 0, y: 0 })
		board.undo()
		expect(board.getShape(r.id)).toBeUndefined()
	})

	it('restores the selection on undo', () => {
		const a = rect(0, 0)
		rect(200, 0)
		board.select([a.id])
		board.key('Delete')
		expect(board.getState().selectedIds).toEqual([])
		board.undo()
		expect(board.getState().selectedIds).toEqual([a.id])
	})

	it('cancelling a drag reverts it without leaving an undo entry', () => {
		const r = rect(0, 0)
		board.down(50, 50).move(80, 80).move(120, 120)
		board.key('Escape')
		expect(board.shape(r.id)).toMatchObject({ x: 0, y: 0 })
		board.up(120, 120)
		board.undo()
		expect(board.getShape(r.id)).toBeUndefined()
	})

	it('ignores remote changes', () => {
		const r = rect(0, 0)
		board.store.apply(new Map([[r.id, { before: r, after: { ...r, x: 500 } }]]), 'remote')
		board.undo()
		expect(board.getShape(r.id)).toBeUndefined()
	})
})

describe('selection', () => {
	it('clicks through a hollow shape to the one behind', () => {
		const back = rect(0, 0, 200, 200, 'solid')
		rect(50, 50, 100, 100, 'none')
		board.click(100, 100)
		expect(board.getState().selectedIds).toEqual([back.id])
	})

	it('selects a hollow shape by its edge', () => {
		const r = rect(0, 0, 100, 100, 'none')
		board.click(100, 50)
		expect(board.getState().selectedIds).toEqual([r.id])
	})

	it('shift-click toggles membership', () => {
		const a = rect(0, 0)
		const b = rect(200, 0)
		board.click(50, 50)
		board.click(250, 50, { shift: true })
		expect(board.getState().selectedIds).toEqual([a.id, b.id])
		board.click(50, 50, { shift: true })
		expect(board.getState().selectedIds).toEqual([b.id])
	})

	it('marquee selects touched shapes, accel requires containment', () => {
		const a = rect(0, 0)
		rect(200, 0)
		board.drag([-10, -10], [120, 50])
		expect(board.getState().selectedIds).toEqual([a.id])
		expect(board.getState().brush).toBeNull()
		board.drag([-10, -10], [120, 50], { accel: true })
		expect(board.getState().selectedIds).toEqual([])
	})

	it('clicking empty canvas clears the selection', () => {
		rect(0, 0)
		board.click(50, 50)
		board.click(500, 500)
		expect(board.getState().selectedIds).toEqual([])
	})
})

describe('transforms', () => {
	it('resizes from a corner, anchored at the opposite one', () => {
		const r = rect(0, 0)
		board.select([r.id])
		board.dragHandle('br', [100, 100], [200, 150])
		expect(board.shape(r.id)).toMatchObject({ x: 0, y: 0, w: 200, h: 150 })
	})

	it('flips through the anchor without going negative', () => {
		const r = rect(100, 100)
		board.select([r.id])
		board.dragHandle('r', [200, 150], [50, 150])
		expect(board.shape(r.id)).toMatchObject({ x: 50, w: 50 })
	})

	it('keeps aspect ratio with shift', () => {
		const r = rect(0, 0, 100, 50)
		board.select([r.id])
		board.dragHandle('br', [100, 50], [300, 60], { shift: true })
		expect(board.shape(r.id)).toMatchObject({ w: 300, h: 150 })
	})

	it('resizes a multi-selection proportionally', () => {
		const a = rect(0, 0)
		const b = rect(100, 100)
		board.select([a.id, b.id])
		board.dragHandle('br', [200, 200], [400, 400])
		expect(board.shape(a.id)).toMatchObject({ x: 0, y: 0, w: 200, h: 200 })
		expect(board.shape(b.id)).toMatchObject({ x: 200, y: 200, w: 200, h: 200 })
	})

	it('rotates about the selection center', () => {
		const r = rect(0, 0)
		board.select([r.id])
		// Start right of center, end below it: a quarter turn clockwise.
		board.drag([100, 50], [50, 100], { target: { kind: 'rotate' } })
		const s = board.shape(r.id)
		expect(s.rotation).toBeCloseTo(Math.PI / 2)
		const b = pageBounds(s)
		expect(b.x).toBeCloseTo(0)
		expect(b.y).toBeCloseTo(0)
	})

	it('alt-drag duplicates and moves the copy', () => {
		const r = rect(0, 0)
		board.drag([50, 50], [250, 50], { alt: true })
		expect(board.getShapes()).toHaveLength(2)
		expect(board.shape(r.id)).toMatchObject({ x: 0 })
		const copy = board.getSelectedShapes()[0]
		expect(copy.id).not.toBe(r.id)
		expect(copy).toMatchObject({ x: 200 })
	})

	it('snaps a dragged shape to another shape edge', () => {
		rect(0, 0)
		const b = rect(300, 300)
		board.drag([350, 350], [153, 250])
		// Left edge would land at 103; it snaps to the other shape's right edge at 100.
		expect(board.shape(b.id).x).toBe(100)
		expect(board.getState().snapGuides).toEqual([])
	})

	it('aligns and distributes', () => {
		const a = rect(0, 0)
		const b = rect(130, 40)
		const c = rect(400, 10)
		board.select([a.id, b.id, c.id])
		board.align('top')
		expect([a, b, c].map((s) => board.shape(s.id).y)).toEqual([0, 0, 0])
		board.distribute('x')
		expect([a, b, c].map((s) => board.shape(s.id).x)).toEqual([0, 200, 400])
	})
})

describe('arrows', () => {
	it('binds both ends and follows the target', () => {
		const a = rect(0, 0)
		const b = rect(300, 0)
		board.setTool('arrow')
		board.drag([50, 50], [350, 50])
		const line = board.getSelectedShapes()[0] as LineShape
		expect(line.start.binding?.shapeId).toBe(a.id)
		expect(line.end.binding?.shapeId).toBe(b.id)
		// Endpoints sit just outside the facing edges.
		expect(line.x + line.start.x).toBeGreaterThan(100)
		expect(line.x + line.end.x).toBeLessThan(300)

		board.updateShapes([{ id: b.id, y: 200 }])
		const moved = board.shape<LineShape>(line.id)
		expect(moved.y + moved.end.y).toBeGreaterThan(150)
	})

	it('drops the binding but keeps the endpoint when the target is deleted', () => {
		rect(0, 0)
		const b = rect(300, 0)
		board.setTool('arrow')
		board.drag([50, 50], [350, 50])
		const line = board.getSelectedShapes()[0] as LineShape
		const endBefore = { x: line.end.x, y: line.end.y }
		board.deleteShapes([b.id])
		const after = board.shape<LineShape>(line.id)
		expect(after.end).toEqual(endBefore)
	})

	it('duplicating arrow and targets rebinds the copies to each other', () => {
		const a = rect(0, 0)
		const b = rect(300, 0)
		board.setTool('arrow')
		board.drag([50, 50], [350, 50])
		const line = board.getSelectedShapes()[0]
		board.select([a.id, b.id, line.id])
		board.duplicate()
		const copies = board.getSelectedShapes()
		const copyLine = copies.find((s) => s.type === 'line') as LineShape
		const copyIds = copies.map((s) => s.id)
		expect(copyIds).toContain(copyLine.start.binding!.shapeId)
		expect(copyIds).toContain(copyLine.end.binding!.shapeId)
	})

	it('a click makes a default-length line', () => {
		board.setTool('line')
		board.click(500, 500)
		const line = board.getSelectedShapes()[0] as LineShape
		expect(line.end).toEqual({ x: 160, y: 0 })
		expect(board.getState().toolId).toBe('select')
	})
})

describe('tools', () => {
	it('draws a rectangle by dragging and returns to select', () => {
		board.setTool('rect')
		board.drag([10, 10], [110, 60])
		const s = board.getSelectedShapes()[0]
		expect(s).toMatchObject({ type: 'rect', x: 10, y: 10, w: 100, h: 50 })
		expect(board.getState().toolId).toBe('select')
	})

	it('stays on the tool when locked', () => {
		board.setState({ toolLocked: true })
		board.setTool('ellipse')
		board.drag([10, 10], [110, 60])
		expect(board.getState().toolId).toBe('ellipse')
	})

	it('records a freehand stroke as one undoable shape', () => {
		board.setTool('draw')
		board.down(0, 0)
		for (let i = 1; i <= 20; i++) board.move(i * 5, Math.sin(i) * 10)
		board.up(100, 0)
		expect(board.getShapes()).toHaveLength(1)
		expect(board.getShapes()[0].type).toBe('draw')
		board.undo()
		expect(board.getShapes()).toHaveLength(0)
	})

	it('erases what the stroke passes over, on release', () => {
		const a = rect(0, 0)
		const b = rect(200, 0)
		const keep = rect(0, 300)
		board.setTool('eraser')
		board.down(50, 50).move(250, 50)
		expect(board.getState().erasingIds.sort()).toEqual([a.id, b.id].sort())
		board.up(250, 50)
		expect(board.getShapes().map((s) => s.id)).toEqual([keep.id])
	})

	it('creates text on click and removes it if left empty', () => {
		board.setTool('text')
		board.click(100, 100)
		const id = board.getState().editingId!
		expect(board.shape<TextShape>(id).type).toBe('text')
		board.stopEditing()
		expect(board.getShape(id)).toBeUndefined()
	})

	it('sizes text to its content', () => {
		const t = board.add('text', { text: 'hello' })
		const longer = board.add('text', { text: 'hello world, longer' })
		expect(longer.w).toBeGreaterThan(t.w)
		board.setText(t.id, 'a\nb\nc')
		expect(board.shape<TextShape>(t.id).h).toBeGreaterThan(t.h)
	})

	it('switches tools from the keyboard', () => {
		board.key('r')
		expect(board.getState().toolId).toBe('rect')
		board.key('Escape')
		expect(board.getState().toolId).toBe('select')
	})
})

describe('commands', () => {
	it('reorders without disturbing the rest', () => {
		const a = rect(0, 0)
		const b = rect(0, 0)
		const c = rect(0, 0)
		board.select([a.id])
		board.reorder('front')
		expect(board.getShapes().map((s) => s.id)).toEqual([b.id, c.id, a.id])
		board.reorder('backward')
		expect(board.getShapes().map((s) => s.id)).toEqual([b.id, a.id, c.id])
	})

	it('copies and pastes through serialized data', () => {
		const r = rect(0, 0)
		board.select([r.id])
		const data = board.copy()!
		const other = new TestBoard()
		other.paste(data, { x: 500, y: 500 })
		const pasted = other.getShapes()[0] as RectShape
		expect(pasted).toMatchObject({ type: 'rect', x: 450, y: 450, w: 100, h: 100 })
		expect(pasted.id).not.toBe(r.id)
	})

	it('locked shapes survive delete and ignore drags', () => {
		const r = rect(0, 0)
		board.select([r.id])
		board.toggleLock()
		board.key('Backspace')
		expect(board.getShape(r.id)).toBeDefined()
		board.drag([50, 50], [150, 150])
		expect(board.shape(r.id)).toMatchObject({ x: 0, y: 0 })
	})
})

describe('documents', () => {
	it('round-trips through getDocument and loadDocument', () => {
		rect(0, 0)
		board.add('text', { x: 10, y: 10, text: 'hi' })
		const doc = JSON.parse(JSON.stringify(board.getDocument()))
		const other = new TestBoard()
		other.loadDocument(doc)
		expect(other.getDocument()).toEqual(board.getDocument())
		expect(other.history.canUndo()).toBe(false)
	})

	it('repairs malformed records and drops unusable ones', () => {
		const other = new TestBoard()
		other.loadDocument({
			schema: 1,
			shapes: [
				{ id: 'a', type: 'rect', x: 5, w: 'wide', style: { color: 'red', fill: 3 } },
				{ id: 'b', type: 'hexagon' },
				{ type: 'rect' },
				{ id: 'a', type: 'ellipse' },
			],
		})
		const shapes = other.getShapes()
		expect(shapes).toHaveLength(1)
		expect(shapes[0]).toMatchObject({ id: 'a', type: 'rect', x: 5, w: 1 })
		expect(shapes[0].style).toMatchObject({ color: 'red', fill: 'none' })
	})

	it('refuses a document from a newer schema', () => {
		expect(() => board.loadDocument({ schema: 99, shapes: [] })).toThrow(/newer version/)
	})
})

describe('camera', () => {
	it('zooms about a screen point', () => {
		const before = board.screenToPage({ x: 300, y: 200 })
		board.zoomAt({ x: 300, y: 200 }, 2)
		expect(board.screenToPage({ x: 300, y: 200 })).toEqual(before)
		expect(board.getState().camera.z).toBe(2)
	})

	it('hit tolerance is constant in screen space', () => {
		const r = rect(0, 0, 100, 100, 'none')
		board.zoomAt({ x: 0, y: 0 }, 4)
		// 4 page units outside the edge is 16 screen px: too far at 4x.
		expect(board.getShapeAt({ x: 104, y: 50 })).toBeUndefined()
		board.zoomAt({ x: 0, y: 0 }, 1)
		expect(board.getShapeAt({ x: 104, y: 50 })?.id).toBe(r.id)
	})
})

describe('text editing', () => {
	it('one editing session is one undo step', () => {
		const s = board.add('sticky', { x: 0, y: 0 })
		board.startEditing(s.id)
		board.setText(s.id, 'h')
		board.setText(s.id, 'he')
		board.setText(s.id, 'hey')
		board.stopEditing()
		board.undo()
		expect(board.shape(s.id)).toMatchObject({ text: '' })
	})

	it('an abandoned new text box leaves no history', () => {
		const r = rect(0, 0)
		board.setTool('text')
		board.click(500, 500)
		board.stopEditing()
		expect(board.getShapes()).toHaveLength(1)
		board.undo()
		expect(board.getShape(r.id)).toBeUndefined()
	})
})
