import { Vec } from '../math/vec'

export type ShapeId = string

export type Dash = 'solid' | 'dashed' | 'dotted'
export type Fill = 'none' | 'tint' | 'solid'
export type TextAlign = 'start' | 'middle' | 'end'

export interface Style {
	/** A palette key (see `palette.ts`) or any CSS color. */
	color: string
	fill: Fill
	strokeWidth: number
	dash: Dash
	opacity: number
}

export interface BaseShape {
	id: ShapeId
	type: string
	/** Position of the local origin (top-left before rotation) in page space. */
	x: number
	y: number
	/** Radians, clockwise, about the local origin. */
	rotation: number
	/** Stacking order; higher draws on top. Fractional so inserts never renumber siblings. */
	z: number
	locked: boolean
	style: Style
}

export interface RectShape extends BaseShape {
	type: 'rect'
	w: number
	h: number
	radius: number
	text: string
}

export interface EllipseShape extends BaseShape {
	type: 'ellipse'
	w: number
	h: number
	text: string
}

export interface TextShape extends BaseShape {
	type: 'text'
	w: number
	h: number
	text: string
	fontSize: number
	align: TextAlign
	/** When true the width follows the text; otherwise text wraps at `w`. */
	autoWidth: boolean
}

export interface StickyShape extends BaseShape {
	type: 'sticky'
	w: number
	h: number
	text: string
	fontSize: number
}

export interface Binding {
	shapeId: ShapeId
	/** Anchor in the target's local box, normalized 0..1. */
	anchor: Vec
}

export interface Endpoint extends Vec {
	binding?: Binding
}

export type Arrowhead = 'none' | 'arrow' | 'triangle' | 'dot'

export interface LineShape extends BaseShape {
	type: 'line'
	/** Both endpoints are local to (x, y). */
	start: Endpoint
	end: Endpoint
	startHead: Arrowhead
	endHead: Arrowhead
	/** Perpendicular offset of the midpoint; 0 draws a straight line. */
	bend: number
	label: string
}

export interface DrawShape extends BaseShape {
	type: 'draw'
	/** Local points; `p` on each point carries pen pressure in 0..1 when known. */
	points: { x: number; y: number; p?: number }[]
	closed: boolean
	/** Highlighter strokes render translucent and beneath other ink. */
	highlighter: boolean
}

export interface ImageShape extends BaseShape {
	type: 'image'
	w: number
	h: number
	src: string
	alt: string
}

export interface FrameShape extends BaseShape {
	type: 'frame'
	w: number
	h: number
	name: string
}

export type Shape =
	| RectShape
	| EllipseShape
	| TextShape
	| StickyShape
	| LineShape
	| DrawShape
	| ImageShape
	| FrameShape

export type ShapeType = Shape['type']
export type ShapeOfType<T extends ShapeType> = Extract<Shape, { type: T }>

/** A partial update: id is required, everything else optional. Distributes over the union. */
export type ShapePatch<S extends Shape = Shape> = S extends Shape
	? { id: ShapeId } & Partial<Omit<S, 'id' | 'type'>>
	: never

export interface Camera {
	x: number
	y: number
	z: number
}

export interface BoardDocument {
	schema: number
	shapes: Shape[]
}
