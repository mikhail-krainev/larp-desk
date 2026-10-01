import type { Editor } from '../editor'
import { Vec } from '../math/vec'

export interface BoardPointerEvent {
	page: Vec
	screen: Vec
	button: number
	shift: boolean
	alt: boolean
	/** Ctrl on Windows/Linux, Cmd on macOS. */
	accel: boolean
	pointerType: 'mouse' | 'pen' | 'touch'
	pressure: number
	/** What the renderer found under the pointer, if it was a selection handle. */
	target?: PointerTarget
}

export type PointerTarget =
	| { kind: 'canvas' }
	| { kind: 'handle'; handle: import('../model/transform').Handle }
	| { kind: 'rotate' }
	| { kind: 'line-end'; shapeId: string; end: 'start' | 'end' }
	| { kind: 'line-bend'; shapeId: string }

export interface BoardKeyEvent {
	key: string
	code: string
	shift: boolean
	alt: boolean
	accel: boolean
}

/**
 * A tool is a small state machine. The editor forwards input to the active tool; anything the
 * tool leaves unhandled (returns false from `onKeyDown`) falls through to global shortcuts.
 */
export abstract class Tool {
	abstract readonly id: string
	cursor = 'default'

	constructor(protected editor: Editor) {}

	onEnter(): void {}
	onExit(): void {}
	onPointerDown(_e: BoardPointerEvent): void {}
	onPointerMove(_e: BoardPointerEvent): void {}
	onPointerUp(_e: BoardPointerEvent): void {}
	onDoubleClick(_e: BoardPointerEvent): void {}
	onKeyDown(_e: BoardKeyEvent): boolean {
		return false
	}
	onKeyUp(_e: BoardKeyEvent): void {}
	/** Escape, or the gesture was interrupted (pointer lost, window blurred). */
	onCancel(): void {}
}
