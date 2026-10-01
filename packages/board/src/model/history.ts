import { ChangeSource, Diff, ShapeStore, composeDiff, invertDiff } from './store'

export interface HistoryEntry {
	diff: Diff
	/** Selection before and after, so undo puts the user back where they were. */
	selectionBefore: string[]
	selectionAfter: string[]
}

/**
 * Undo stack over store diffs. Only `user` changes are recorded; remote edits are not ours to
 * undo, and replaying history must not record itself.
 *
 * While a group is open (a drag, a resize, a stroke being drawn) every change folds into one
 * entry, so a gesture undoes as a single step no matter how many pointer moves it took.
 */
export class History {
	private undos: HistoryEntry[] = []
	private redos: HistoryEntry[] = []
	private group: HistoryEntry | null = null
	private groupDepth = 0
	private paused = 0

	constructor(
		private store: ShapeStore,
		private getSelection: () => string[],
		private setSelection: (ids: string[]) => void,
		private limit = 500
	) {
		store.listen(({ diff, source }) => this.record(diff, source))
	}

	canUndo() {
		return this.undos.length > 0 || (this.group !== null && this.group.diff.size > 0)
	}

	canRedo() {
		return this.redos.length > 0
	}

	beginGroup() {
		if (this.groupDepth++ === 0) {
			const sel = this.getSelection()
			this.group = { diff: new Map(), selectionBefore: sel, selectionAfter: sel }
		}
	}

	endGroup() {
		if (this.groupDepth === 0) return
		if (--this.groupDepth > 0) return
		const g = this.group!
		this.group = null
		g.selectionAfter = this.getSelection()
		if (g.diff.size > 0) this.pushUndo(g)
	}

	/** Reverts everything the open group changed and discards it, e.g. on Escape mid-drag. */
	cancelGroup() {
		if (!this.group) return
		const g = this.group
		this.group = null
		this.groupDepth = 0
		this.ignore(() => this.store.apply(invertDiff(g.diff), 'history'))
		this.setSelection(g.selectionBefore)
	}

	/** Runs `fn` without recording, for changes that should not be undoable. */
	ignore<T>(fn: () => T): T {
		this.paused++
		try {
			return fn()
		} finally {
			this.paused--
		}
	}

	undo() {
		if (this.group) this.endGroupNow()
		const entry = this.undos.pop()
		if (!entry) return false
		this.ignore(() => this.store.apply(invertDiff(entry.diff), 'history'))
		this.redos.push(entry)
		this.setSelection(entry.selectionBefore.filter((id) => this.store.has(id)))
		return true
	}

	redo() {
		const entry = this.redos.pop()
		if (!entry) return false
		this.ignore(() => this.store.apply(entry.diff, 'history'))
		this.undos.push(entry)
		this.setSelection(entry.selectionAfter.filter((id) => this.store.has(id)))
		return true
	}

	clear() {
		this.undos = []
		this.redos = []
	}

	private endGroupNow() {
		this.groupDepth = 1
		this.endGroup()
	}

	private record(diff: Diff, source: ChangeSource) {
		if (source !== 'user' || this.paused > 0) return
		if (this.group) {
			composeDiff(this.group.diff, diff)
			return
		}
		const sel = this.getSelection()
		this.pushUndo({ diff: composeDiff(new Map(), diff), selectionBefore: sel, selectionAfter: sel })
	}

	private pushUndo(entry: HistoryEntry) {
		this.undos.push(entry)
		if (this.undos.length > this.limit) this.undos.shift()
		this.redos = []
	}
}
