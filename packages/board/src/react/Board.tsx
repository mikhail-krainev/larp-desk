import {
	PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useSyncExternalStore,
} from 'react'
import { Editor, textOf } from '../editor'
import { Vec, dist } from '../math/vec'
import { createShape } from '../model/shapes'
import { Handle } from '../model/transform'
import { BoardKeyEvent, BoardPointerEvent, PointerTarget } from '../tools/tool'
import { Overlay } from './Overlay'
import { ShapeView } from './ShapeView'
import { TextEditor } from './TextEditor'

export function useEditorVersion(editor: Editor) {
	return useSyncExternalStore(
		useCallback((fn) => editor.subscribe(fn), [editor]),
		() => editor.getVersion()
	)
}

export interface BoardProps {
	editor: Editor
	/** Turns a dropped or pasted file into an image URL; defaults to an inline data URL. */
	uploadImage?(file: File): Promise<string>
	className?: string
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * The board canvas: renders shapes as SVG and turns DOM input into editor input. It owns no
 * document state; everything comes from `editor`.
 */
export function Board({ editor, uploadImage = readAsDataUrl, className }: BoardProps) {
	useEditorVersion(editor)
	const ref = useRef<HTMLDivElement>(null)
	const st = editor.getState()
	const gesture = useRef(new GestureTracker())
	const spaceHeld = useRef(false)

	useLayoutEffect(() => {
		const el = ref.current!
		const ro = new ResizeObserver(() => {
			const r = el.getBoundingClientRect()
			editor.setViewport(r.width, r.height)
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [editor])

	const toScreen = useCallback((e: { clientX: number; clientY: number }): Vec => {
		const r = ref.current!.getBoundingClientRect()
		return { x: e.clientX - r.left, y: e.clientY - r.top }
	}, [])

	const toBoardEvent = useCallback(
		(
			e: PointerEvent | ReactPointerEvent | MouseEvent,
			target?: PointerTarget
		): BoardPointerEvent => {
			const screen = toScreen(e)
			const pe = e as PointerEvent
			return {
				screen,
				page: editor.screenToPage(screen),
				button: e.button,
				shift: e.shiftKey,
				alt: e.altKey,
				accel: isMac ? e.metaKey : e.ctrlKey,
				pointerType: (pe.pointerType as BoardPointerEvent['pointerType']) || 'mouse',
				pressure: pe.pressure ?? 0.5,
				target,
			}
		},
		[editor, toScreen]
	)

	// Wheel must be non-passive to stop the page scrolling or zooming behind the board.
	useEffect(() => {
		const el = ref.current!
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			const screen = toScreen(e)
			const scale = e.deltaMode === 1 ? 16 : 1
			if (e.ctrlKey || e.metaKey) {
				// Trackpad pinch arrives as ctrl+wheel.
				const z = editor.getState().camera.z * Math.exp((-e.deltaY * scale) / 100)
				editor.zoomAt(screen, z)
			} else if (e.shiftKey && e.deltaX === 0) {
				editor.panBy({ x: -e.deltaY * scale, y: 0 })
			} else {
				editor.panBy({ x: -e.deltaX * scale, y: -e.deltaY * scale })
			}
		}
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => el.removeEventListener('wheel', onWheel)
	}, [editor, toScreen])

	const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
		if (isEditable(e.target)) return
		ref.current!.focus({ preventScroll: true })
		ref.current!.setPointerCapture(e.pointerId)
		const g = gesture.current
		g.add(e.pointerId, toScreen(e))
		if (g.count() === 2) {
			// Second finger: whatever the first one started becomes a pinch.
			editor.cancel()
			return
		}
		if (g.count() > 2) return
		if (e.button === 1 || (e.button === 0 && spaceHeld.current)) {
			g.panning = true
			editor.setState({ isPanning: true })
			return
		}
		if (e.button === 2) return
		editor.pointerDown(toBoardEvent(e, targetOf(e.target)))
	}

	const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gesture.current
		const screen = toScreen(e)
		if (g.count() >= 2) {
			const pinch = g.move(e.pointerId, screen)
			if (pinch) {
				editor.panBy(pinch.pan)
				editor.zoomAt(pinch.center, editor.getState().camera.z * pinch.scale)
			}
			return
		}
		const prev = g.get(e.pointerId)
		g.move(e.pointerId, screen)
		if (g.panning) {
			if (prev) editor.panBy({ x: screen.x - prev.x, y: screen.y - prev.y })
			return
		}
		editor.pointerMove(toBoardEvent(e))
	}

	const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
		const g = gesture.current
		const wasMulti = g.count() >= 2
		g.remove(e.pointerId)
		if (ref.current!.hasPointerCapture(e.pointerId)) ref.current!.releasePointerCapture(e.pointerId)
		if (g.panning) {
			if (g.count() === 0) {
				g.panning = false
				editor.setState({ isPanning: false })
			}
			return
		}
		if (wasMulti) return
		editor.pointerUp(toBoardEvent(e))
	}

	const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
		gesture.current.remove(e.pointerId)
		gesture.current.panning = false
		editor.setState({ isPanning: false })
		editor.cancel()
	}

	const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if (isEditable(e.target)) return
		editor.doubleClick(toBoardEvent(e.nativeEvent))
	}

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (isEditable(e.target)) return
		if (e.key === ' ') {
			spaceHeld.current = true
			e.preventDefault()
			return
		}
		if (editor.keyDown(toKeyEvent(e))) e.preventDefault()
	}

	const onKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key === ' ') spaceHeld.current = false
		if (isEditable(e.target)) return
		editor.keyUp(toKeyEvent(e))
	}

	// Clipboard goes through the native events so system copy/paste and menus work.
	useEffect(() => {
		const el = ref.current!
		const owns = () => el.contains(document.activeElement) && !isEditable(document.activeElement)
		const onCopy = (e: ClipboardEvent) => {
			if (!owns()) return
			const data = editor.copy()
			if (!data) return
			e.clipboardData?.setData('text/plain', data)
			e.preventDefault()
		}
		const onCut = (e: ClipboardEvent) => {
			if (!owns()) return
			const data = editor.cut()
			if (!data) return
			e.clipboardData?.setData('text/plain', data)
			e.preventDefault()
		}
		const onPaste = async (e: ClipboardEvent) => {
			if (!owns()) return
			e.preventDefault()
			const center = editor.screenToPage({
				x: editor.getState().viewport.w / 2,
				y: editor.getState().viewport.h / 2,
			})
			const files = [...(e.clipboardData?.files ?? [])]
			if (files.length) return insertFiles(editor, files, center, uploadImage)
			const text = e.clipboardData?.getData('text/plain') ?? ''
			if (editor.paste(text)) return
			if (text.trim()) {
				const s = createShape('text', {
					x: center.x,
					y: center.y,
					text,
					style: editor.styleForNewShape(),
				})
				editor.createShapes([s])
				editor.select([s.id])
			}
		}
		document.addEventListener('copy', onCopy)
		document.addEventListener('cut', onCut)
		document.addEventListener('paste', onPaste)
		return () => {
			document.removeEventListener('copy', onCopy)
			document.removeEventListener('cut', onCut)
			document.removeEventListener('paste', onPaste)
		}
	}, [editor, uploadImage])

	const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
		e.preventDefault()
		const files = [...e.dataTransfer.files]
		if (files.length) insertFiles(editor, files, editor.screenToPage(toScreen(e)), uploadImage)
	}

	const { camera, theme } = st
	const shapes = editor.getVisibleShapes()
	const erasing = new Set(st.erasingIds)
	const editingShape = st.editingId ? editor.getShape(st.editingId) : undefined
	const gridSize = 20 * camera.z
	const cursor = st.isPanning ? 'grabbing' : spaceHeld.current ? 'grab' : st.cursor

	return (
		<div
			ref={ref}
			className={className}
			tabIndex={0}
			data-theme={theme}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
			onDoubleClick={onDoubleClick}
			onKeyDown={onKeyDown}
			onKeyUp={onKeyUp}
			onDragOver={(e) => e.preventDefault()}
			onDrop={onDrop}
			onContextMenu={(e) => e.preventDefault()}
			style={{
				position: 'relative',
				overflow: 'hidden',
				width: '100%',
				height: '100%',
				outline: 'none',
				touchAction: 'none',
				userSelect: 'none',
				cursor,
				background: theme === 'light' ? '#f8f9fa' : '#161618',
				backgroundImage: st.grid
					? `radial-gradient(circle, ${theme === 'light' ? '#c9cdd3' : '#3a3d42'} 1px, transparent 1px)`
					: undefined,
				backgroundSize: st.grid ? `${gridSize}px ${gridSize}px` : undefined,
				backgroundPosition: st.grid
					? `${camera.x * camera.z}px ${camera.y * camera.z}px`
					: undefined,
			}}
		>
			<svg
				width="100%"
				height="100%"
				style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
			>
				<defs>
					<filter id="ub-sticky-shadow" x="-10%" y="-10%" width="130%" height="140%">
						<feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" />
					</filter>
				</defs>
				<g transform={`scale(${camera.z}) translate(${camera.x} ${camera.y})`}>
					{shapes.map((s) => (
						<ShapeView
							key={s.id}
							shape={s}
							theme={theme}
							editing={s.id === st.editingId}
							faded={erasing.has(s.id)}
						/>
					))}
					<Overlay editor={editor} />
				</g>
			</svg>
			{editingShape && (
				<TextEditor
					key={editingShape.id}
					editor={editor}
					shape={editingShape}
					initial={textOf(editingShape)}
				/>
			)}
		</div>
	)
}

function targetOf(el: EventTarget | null): PointerTarget | undefined {
	if (!(el instanceof Element)) return undefined
	const handle = el.getAttribute('data-handle')
	if (handle) return { kind: 'handle', handle: handle as Handle }
	if (el.hasAttribute('data-rotate')) return { kind: 'rotate' }
	const end = el.getAttribute('data-line-end')
	const shapeId = el.getAttribute('data-shape-id')
	if (end && shapeId) return { kind: 'line-end', shapeId, end: end as 'start' | 'end' }
	if (el.hasAttribute('data-line-bend') && shapeId) return { kind: 'line-bend', shapeId }
	return { kind: 'canvas' }
}

function isEditable(el: EventTarget | null) {
	return (
		el instanceof HTMLElement &&
		(el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
	)
}

function toKeyEvent(e: React.KeyboardEvent): BoardKeyEvent {
	return {
		key: e.key,
		code: e.code,
		shift: e.shiftKey,
		alt: e.altKey,
		accel: isMac ? e.metaKey : e.ctrlKey,
	}
}

/** Tracks active pointers so two touches become pan + pinch. */
class GestureTracker {
	private pointers = new Map<number, Vec>()
	panning = false

	add(id: number, p: Vec) {
		this.pointers.set(id, p)
	}
	get(id: number) {
		return this.pointers.get(id)
	}
	remove(id: number) {
		this.pointers.delete(id)
	}
	count() {
		return this.pointers.size
	}

	/** Updates a pointer; with two down, returns the pan and scale since the last move. */
	move(id: number, p: Vec) {
		if (!this.pointers.has(id)) return null
		const before = [...this.pointers.values()].slice(0, 2)
		this.pointers.set(id, p)
		if (this.pointers.size < 2) return null
		const after = [...this.pointers.values()].slice(0, 2)
		const c0 = mid(before[0], before[1])
		const c1 = mid(after[0], after[1])
		const d0 = dist(before[0], before[1]) || 1
		const d1 = dist(after[0], after[1]) || 1
		return { pan: { x: c1.x - c0.x, y: c1.y - c0.y }, center: c1, scale: d1 / d0 }
	}
}

const mid = (a: Vec, b: Vec) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

function readAsDataUrl(file: File) {
	return new Promise<string>((resolve, reject) => {
		const r = new FileReader()
		r.onload = () => resolve(r.result as string)
		r.onerror = () => reject(r.error)
		r.readAsDataURL(file)
	})
}

async function insertFiles(
	editor: Editor,
	files: File[],
	at: Vec,
	upload: (f: File) => Promise<string>
) {
	const images = files.filter((f) => f.type.startsWith('image/'))
	const ids: string[] = []
	let x = at.x
	for (const file of images) {
		const src = await upload(file)
		const size = await imageSize(src)
		// Large images land at a readable size rather than filling the board.
		const k = Math.min(1, 800 / Math.max(size.w, size.h))
		const w = size.w * k
		const h = size.h * k
		const s = createShape('image', { x, y: at.y - h / 2, w, h, src, alt: file.name })
		editor.createShapes([s])
		ids.push(s.id)
		x += w + 16
	}
	if (ids.length) editor.select(ids)
}

function imageSize(src: string) {
	return new Promise<{ w: number; h: number }>((resolve) => {
		const img = new Image()
		img.onload = () => resolve({ w: img.naturalWidth || 320, h: img.naturalHeight || 240 })
		img.onerror = () => resolve({ w: 320, h: 240 })
		img.src = src
	})
}
