import { CSSProperties, useEffect, useRef } from 'react'
import { Editor } from '../editor'
import { resolveColor } from '../model/palette'
import { lineMidpoint, toPage } from '../model/shapes'
import { Shape } from '../model/types'
import { textStyle } from './ShapeView'

/**
 * A textarea laid over the shape being edited, in screen space so the browser handles caret,
 * selection, IME and spellcheck. The shape below hides its own text meanwhile.
 */
export function TextEditor({
	editor,
	shape,
	initial,
}: {
	editor: Editor
	shape: Shape
	initial: string
}) {
	const ref = useRef<HTMLTextAreaElement>(null)
	const { camera, theme } = editor.getState()
	const z = camera.z

	useEffect(() => {
		const el = ref.current!
		el.focus({ preventScroll: true })
		el.setSelectionRange(el.value.length, el.value.length)
		if (initial) el.select()
	}, [initial])

	const color =
		shape.type === 'sticky'
			? theme === 'light'
				? '#1d1d1f'
				: '#f8f8f8'
			: resolveColor(shape.style.color, theme).stroke
	const layout = layoutFor(shape)
	const origin = editor.pageToScreen(toPage(shape, { x: layout.x, y: layout.y }))
	const style: CSSProperties = {
		...textStyle(layout.fontSize * z, color),
		userSelect: 'text',
		position: 'absolute',
		left: origin.x,
		top: origin.y,
		width: layout.w * z,
		height: layout.h * z,
		padding: layout.padding * z,
		transform: `rotate(${shape.rotation}rad)`,
		transformOrigin: 'top left',
		textAlign: layout.align,
		background: 'transparent',
		border: 'none',
		outline: 'none',
		resize: 'none',
		overflow: 'hidden',
		whiteSpace: layout.nowrap ? 'pre' : 'pre-wrap',
	}

	return (
		<textarea
			ref={ref}
			defaultValue={initial}
			style={style}
			spellCheck
			onChange={(e) => editor.setText(shape.id, e.target.value)}
			onBlur={() => editor.stopEditing()}
			onPointerDown={(e) => e.stopPropagation()}
			onKeyDown={(e) => {
				e.stopPropagation()
				if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
					e.preventDefault()
					const board = e.currentTarget.parentElement
					editor.stopEditing()
					board?.focus({ preventScroll: true })
				}
			}}
		/>
	)
}

interface Layout {
	x: number
	y: number
	w: number
	h: number
	fontSize: number
	padding: number
	align: 'left' | 'center' | 'right'
	nowrap: boolean
}

function layoutFor(shape: Shape): Layout {
	switch (shape.type) {
		case 'text':
			return {
				x: 0,
				y: 0,
				// A little slack so the caret has room before the shape re-measures.
				w: shape.w + shape.fontSize,
				h: shape.h,
				fontSize: shape.fontSize,
				padding: 4,
				align: shape.align === 'middle' ? 'center' : shape.align === 'end' ? 'right' : 'left',
				nowrap: shape.autoWidth,
			}
		case 'sticky':
			return {
				x: 0,
				y: 0,
				w: shape.w,
				h: shape.h,
				fontSize: shape.fontSize,
				padding: 16,
				align: 'left',
				nowrap: false,
			}
		case 'rect':
		case 'ellipse': {
			const lines = Math.max(1, shape.text.split('\n').length)
			const h = Math.min(shape.h, lines * 18 * 1.35 + 16)
			return {
				x: 0,
				y: (shape.h - h) / 2,
				w: shape.w,
				h,
				fontSize: 18,
				padding: 8,
				align: 'center',
				nowrap: false,
			}
		}
		case 'line': {
			const m = lineMidpoint(shape)
			return {
				x: m.x - 100,
				y: m.y - 14,
				w: 200,
				h: 28,
				fontSize: 16,
				padding: 0,
				align: 'center',
				nowrap: true,
			}
		}
		case 'frame':
			return {
				x: 0,
				y: -26,
				w: Math.max(120, shape.w),
				h: 22,
				fontSize: 14,
				padding: 0,
				align: 'left',
				nowrap: true,
			}
		default:
			return { x: 0, y: 0, w: 100, h: 24, fontSize: 16, padding: 0, align: 'left', nowrap: true }
	}
}
