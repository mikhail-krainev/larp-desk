import { Editor } from '../editor'
import { Vec } from '../math/vec'
import { lineMidpoint, pageOutline, toPage } from '../model/shapes'
import {
	HANDLES,
	HANDLE_POS,
	Handle,
	frameCorners,
	frameToPage,
	handlePagePoint,
	selectionFrame,
} from '../model/transform'
import { pathFrom } from './ShapeView'

const ACCENT = '#2f80ed'
const RESIZE_CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize']

/** Selection chrome drawn in page space; sizes are divided by zoom to stay constant on screen. */
export function Overlay({ editor }: { editor: Editor }) {
	const st = editor.getState()
	const z = st.camera.z
	const px = (n: number) => n / z
	const selected = editor.getSelectedShapes()
	const hovered =
		st.hoveredId && !st.selectedIds.includes(st.hoveredId)
			? editor.getShape(st.hoveredId)
			: undefined
	const busy = st.toolId !== 'select' || st.brush !== null

	return (
		<g pointerEvents="none">
			{hovered && (
				<path
					d={
						pathFrom(pageOutline(hovered)) +
						(hovered.type === 'line' || (hovered.type === 'draw' && !hovered.closed) ? '' : ' Z')
					}
					fill="none"
					stroke={ACCENT}
					strokeWidth={px(1.5)}
				/>
			)}
			{selected.length > 1 &&
				selected.map((s) => (
					<path
						key={s.id}
						d={pathFrom(pageOutline(s)) + (s.type === 'line' || s.type === 'draw' ? '' : ' Z')}
						fill="none"
						stroke={ACCENT}
						strokeOpacity={0.5}
						strokeWidth={px(1)}
					/>
				))}
			<SelectionHandles editor={editor} hideHandles={busy || !!st.editingId} />
			{st.brush && (
				<rect
					x={st.brush.x}
					y={st.brush.y}
					width={st.brush.w}
					height={st.brush.h}
					fill={ACCENT}
					fillOpacity={0.08}
					stroke={ACCENT}
					strokeWidth={px(1)}
				/>
			)}
			{st.snapGuides.map((g, i) =>
				g.axis === 'x' ? (
					<line
						key={i}
						x1={g.at}
						x2={g.at}
						y1={g.from}
						y2={g.to}
						stroke="#e8590c"
						strokeWidth={px(1)}
					/>
				) : (
					<line
						key={i}
						y1={g.at}
						y2={g.at}
						x1={g.from}
						x2={g.to}
						stroke="#e8590c"
						strokeWidth={px(1)}
					/>
				)
			)}
		</g>
	)
}

function SelectionHandles({ editor, hideHandles }: { editor: Editor; hideHandles: boolean }) {
	const st = editor.getState()
	const z = st.camera.z
	const px = (n: number) => n / z
	const selected = editor.getSelectedShapes()
	if (selected.length === 0) return null

	if (selected.length === 1 && selected[0].type === 'line') {
		const line = selected[0]
		if (hideHandles || line.locked) return null
		const ends: ['start' | 'end', Vec][] = [
			['start', toPage(line, line.start)],
			['end', toPage(line, line.end)],
		]
		const mid = toPage(line, lineMidpoint(line))
		return (
			<g pointerEvents="all">
				{ends.map(([end, p]) => (
					<circle
						key={end}
						cx={p.x}
						cy={p.y}
						r={px(5)}
						fill="#fff"
						stroke={ACCENT}
						strokeWidth={px(1.5)}
						data-line-end={end}
						data-shape-id={line.id}
						style={{ cursor: 'grab' }}
					/>
				))}
				<circle
					cx={mid.x}
					cy={mid.y}
					r={px(4)}
					fill={ACCENT}
					stroke="#fff"
					strokeWidth={px(1.5)}
					data-line-bend=""
					data-shape-id={line.id}
					style={{ cursor: 'grab' }}
				/>
			</g>
		)
	}

	const frame = selectionFrame(selected)!
	const corners = frameCorners(frame)
	const locked = selected.every((s) => s.locked)
	const screenW = frame.box.w * z
	const screenH = frame.box.h * z
	// Small selections keep only corner handles so the shape itself is still grabbable.
	const showEdges = screenW > 40 && screenH > 40
	const topCenter = frameToPage(frame, {
		x: frame.box.x + frame.box.w / 2,
		y: frame.box.y - px(24),
	})
	return (
		<g>
			<path d={pathFrom(corners) + ' Z'} fill="none" stroke={ACCENT} strokeWidth={px(1.5)} />
			{!hideHandles && !locked && (
				<g pointerEvents="all">
					{HANDLES.filter((h) => showEdges || h.length === 2).map((h) => {
						const p = handlePagePoint(frame, h)
						const s = px(8)
						return (
							<rect
								key={h}
								x={p.x - s / 2}
								y={p.y - s / 2}
								width={s}
								height={s}
								fill="#fff"
								stroke={ACCENT}
								strokeWidth={px(1.5)}
								transform={`rotate(${(frame.rotation * 180) / Math.PI} ${p.x} ${p.y})`}
								data-handle={h}
								style={{ cursor: cursorFor(h, frame.rotation) }}
							/>
						)
					})}
					<circle
						cx={topCenter.x}
						cy={topCenter.y}
						r={px(5)}
						fill="#fff"
						stroke={ACCENT}
						strokeWidth={px(1.5)}
						data-rotate=""
						style={{ cursor: 'grab' }}
					/>
				</g>
			)}
		</g>
	)
}

/** Picks the resize cursor whose direction is closest to the handle's on-screen direction. */
function cursorFor(h: Handle, rotation: number) {
	const p = HANDLE_POS[h]
	const angle = Math.atan2(p.y - 0.5, p.x - 0.5) + rotation
	const octant = Math.round(angle / (Math.PI / 4))
	return RESIZE_CURSORS[((octant % 4) + 4) % 4]
}
