import { createShape } from './shapes'
import { BoardDocument, Shape, ShapeType } from './types'

export const SCHEMA_VERSION = 1

const SHAPE_TYPES: ShapeType[] = [
	'rect',
	'ellipse',
	'text',
	'sticky',
	'line',
	'draw',
	'image',
	'frame',
]

/**
 * Each entry upgrades a raw document from version `i + 1` to `i + 2`. Append only: a
 * migration that has shipped must never change, or boards saved under it load differently.
 */
const MIGRATIONS: ((doc: any) => any)[] = []

export class DocumentError extends Error {}

/**
 * Brings a stored document up to the current schema and repairs it record by record. A
 * malformed shape is dropped rather than failing the whole board, because one bad record
 * from a buggy peer should not make a board unopenable.
 */
export function migrateDocument(raw: unknown): BoardDocument {
	if (!raw || typeof raw !== 'object') throw new DocumentError('Board document is not an object')
	let doc: any = raw
	const from = typeof doc.schema === 'number' ? doc.schema : 1
	if (from > SCHEMA_VERSION) {
		throw new DocumentError(
			`Board was saved by a newer version (schema ${from}, this build reads ${SCHEMA_VERSION})`
		)
	}
	for (let v = from; v < SCHEMA_VERSION; v++) doc = MIGRATIONS[v - 1](doc)
	const shapes: Shape[] = []
	const seen = new Set<string>()
	for (const s of Array.isArray(doc.shapes) ? doc.shapes : []) {
		const fixed = repairShape(s)
		if (fixed && !seen.has(fixed.id)) {
			seen.add(fixed.id)
			shapes.push(fixed)
		}
	}
	return { schema: SCHEMA_VERSION, shapes }
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Fills missing or invalid fields from the type's defaults. Returns null if unusable. */
export function repairShape(raw: any): Shape | null {
	if (!raw || typeof raw !== 'object') return null
	if (typeof raw.id !== 'string' || !raw.id) return null
	if (!SHAPE_TYPES.includes(raw.type)) return null
	const base = createShape(raw.type as ShapeType)
	const out: any = { ...base, id: raw.id }
	for (const key of Object.keys(base)) {
		if (key === 'id' || key === 'type' || !(key in raw)) continue
		const def = (base as any)[key]
		const val = raw[key]
		if (key === 'style') {
			out.style = { ...def }
			if (val && typeof val === 'object') {
				for (const sk of Object.keys(def)) {
					if (typeof val[sk] === typeof def[sk]) out.style[sk] = val[sk]
				}
			}
		} else if (typeof def === 'number') {
			if (isNum(val)) out[key] = val
		} else if (Array.isArray(def)) {
			if (Array.isArray(val)) {
				out[key] = val.filter((p: any) => p && isNum(p.x) && isNum(p.y))
			}
		} else if (def && typeof def === 'object') {
			if (val && isNum(val.x) && isNum(val.y)) out[key] = val
		} else if (typeof val === typeof def) {
			out[key] = val
		}
	}
	return out as Shape
}
