import { Shape, ShapeId } from './types'

/**
 * One record's change. `before` undefined means it was created, `after` undefined means it was
 * deleted. A diff holds at most one entry per id, so composing diffs keeps the first `before`
 * and the last `after`.
 */
export interface Change {
	before?: Shape
	after?: Shape
}

export type Diff = Map<ShapeId, Change>

export type ChangeSource = 'user' | 'remote' | 'history'

export interface StoreEvent {
	diff: Diff
	source: ChangeSource
}

export function composeDiff(into: Diff, next: Diff) {
	for (const [id, change] of next) {
		const prev = into.get(id)
		if (!prev) {
			into.set(id, { before: change.before, after: change.after })
			continue
		}
		prev.after = change.after
		if (prev.before === undefined && prev.after === undefined) into.delete(id)
	}
	return into
}

export function invertDiff(diff: Diff): Diff {
	const out: Diff = new Map()
	for (const [id, c] of diff) out.set(id, { before: c.after, after: c.before })
	return out
}

/**
 * Records are immutable objects held in a mutable map. Every write goes through a transaction
 * that yields one diff, so listeners, history and sync all see the same unit of change.
 */
export class ShapeStore {
	private records = new Map<ShapeId, Shape>()
	private listeners = new Set<(e: StoreEvent) => void>()
	private pending: Diff | null = null
	private pendingSource: ChangeSource = 'user'
	private sortedCache: Shape[] | null = null

	get(id: ShapeId): Shape | undefined {
		return this.records.get(id)
	}

	has(id: ShapeId) {
		return this.records.has(id)
	}

	getSize() {
		return this.records.size
	}

	/** All shapes, bottom to top. */
	all(): readonly Shape[] {
		if (!this.sortedCache) {
			this.sortedCache = [...this.records.values()].sort(compareZ)
		}
		return this.sortedCache
	}

	listen(fn: (e: StoreEvent) => void) {
		this.listeners.add(fn)
		return () => this.listeners.delete(fn)
	}

	transact<T>(fn: () => T, source: ChangeSource = 'user'): T {
		if (this.pending) return fn()
		this.pending = new Map()
		this.pendingSource = source
		let result: T
		try {
			result = fn()
		} catch (e) {
			// Roll back whatever the failed transaction managed to write.
			const partial = this.pending
			this.pending = null
			this.applyRaw(invertDiff(partial))
			throw e
		}
		const diff = this.pending
		this.pending = null
		if (diff.size > 0) this.emit({ diff, source })
		return result
	}

	put(shapes: readonly Shape[]) {
		this.transact(() => {
			for (const s of shapes) this.write(s.id, s)
		})
	}

	remove(ids: readonly ShapeId[]) {
		this.transact(() => {
			for (const id of ids) if (this.records.has(id)) this.write(id, undefined)
		})
	}

	/** Applies a diff's `after` side, e.g. for undo/redo or a remote peer's change. */
	apply(diff: Diff, source: ChangeSource) {
		this.transact(() => {
			for (const [id, c] of diff) this.write(id, c.after)
		}, source)
	}

	clear() {
		this.remove([...this.records.keys()])
	}

	private write(id: ShapeId, next: Shape | undefined) {
		const prev = this.records.get(id)
		if (prev === next) return
		if (next) this.records.set(id, next)
		else this.records.delete(id)
		this.sortedCache = null
		composeDiff(this.pending!, new Map([[id, { before: prev, after: next }]]))
	}

	private applyRaw(diff: Diff) {
		for (const [id, c] of diff) {
			if (c.after) this.records.set(id, c.after)
			else this.records.delete(id)
		}
		this.sortedCache = null
	}

	private emit(e: StoreEvent) {
		for (const l of [...this.listeners]) l(e)
	}
}

export function compareZ(a: Shape, b: Shape) {
	return a.z - b.z || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
