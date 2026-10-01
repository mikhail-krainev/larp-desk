import { Editor } from '../editor'
import { createShape } from '../model/shapes'
import { Handle } from '../model/transform'
import { Shape, ShapeOfType, ShapeType, Style } from '../model/types'
import { defaultTools } from '../tools'
import { BoardPointerEvent, PointerTarget } from '../tools/tool'

interface Mods {
	shift?: boolean
	alt?: boolean
	accel?: boolean
	target?: PointerTarget
}

/** An editor driven by synthetic page-space input. Camera starts at identity. */
export class TestBoard extends Editor {
	constructor() {
		super({ tools: defaultTools })
		this.setViewport(1000, 800)
	}

	private ev(x: number, y: number, mods: Mods = {}): BoardPointerEvent {
		const page = { x, y }
		return {
			page,
			screen: this.pageToScreen(page),
			button: 0,
			shift: !!mods.shift,
			alt: !!mods.alt,
			accel: !!mods.accel,
			pointerType: 'mouse',
			pressure: 0.5,
			target: mods.target,
		}
	}

	down(x: number, y: number, mods?: Mods) {
		this.pointerDown(this.ev(x, y, mods))
		return this
	}
	move(x: number, y: number, mods?: Mods) {
		this.pointerMove(this.ev(x, y, mods))
		return this
	}
	up(x: number, y: number, mods?: Mods) {
		this.pointerUp(this.ev(x, y, mods))
		return this
	}
	click(x: number, y: number, mods?: Mods) {
		return this.down(x, y, mods).up(x, y, mods)
	}
	drag(from: [number, number], to: [number, number], mods?: Mods) {
		this.down(from[0], from[1], mods)
		this.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, mods)
		this.move(to[0], to[1], mods)
		return this.up(to[0], to[1], mods)
	}
	dragHandle(handle: Handle, from: [number, number], to: [number, number], mods: Mods = {}) {
		return this.drag(from, to, { ...mods, target: { kind: 'handle', handle } })
	}
	key(key: string, mods: Omit<Mods, 'target'> = {}) {
		return this.keyDown({
			key,
			code: key,
			shift: !!mods.shift,
			alt: !!mods.alt,
			accel: !!mods.accel,
		})
	}

	add<T extends ShapeType>(
		type: T,
		props: Partial<Omit<ShapeOfType<T>, 'type' | 'style'>> & { style?: Partial<Style> } = {}
	): ShapeOfType<T> {
		const s = createShape(type, props)
		this.createShapes([s])
		return this.getShape(s.id) as ShapeOfType<T>
	}

	shape<S extends Shape = Shape>(id: string) {
		return this.getShape(id) as S
	}
}
