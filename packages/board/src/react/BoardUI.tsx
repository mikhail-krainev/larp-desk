import { CSSProperties, ReactNode } from 'react'
import { Editor } from '../editor'
import { PALETTE_KEYS, resolveColor } from '../model/palette'
import { Arrowhead, Dash, Fill, Shape } from '../model/types'
import { useEditorVersion } from './Board'

interface ToolDef {
	id: string
	label: string
	key: string
	icon: ReactNode
}

const I = (d: string) => (
	<svg
		width="20"
		height="20"
		viewBox="0 0 20 20"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.6"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d={d} />
	</svg>
)

const TOOLS: ToolDef[] = [
	{ id: 'select', label: 'Select', key: 'V', icon: I('M5 3l10 6-4.5 1.2L8.5 15z') },
	{
		id: 'hand',
		label: 'Hand',
		key: 'H',
		icon: I(
			'M7 10V5a1.2 1.2 0 012.4 0v4M9.4 9V4a1.2 1.2 0 012.4 0v5M11.8 9V5.2a1.2 1.2 0 012.4 0V12a5 5 0 01-5 5h-.6a5 5 0 01-4-2l-2-2.8a1.2 1.2 0 011.9-1.5L7 12'
		),
	},
	{ id: 'rect', label: 'Rectangle', key: 'R', icon: I('M3.5 5h13v10h-13z') },
	{
		id: 'ellipse',
		label: 'Ellipse',
		key: 'O',
		icon: I('M10 4.5c3.9 0 7 2.5 7 5.5s-3.1 5.5-7 5.5S3 13 3 10s3.1-5.5 7-5.5z'),
	},
	{ id: 'arrow', label: 'Arrow', key: 'A', icon: I('M4 16L16 4M9 4h7v7') },
	{ id: 'line', label: 'Line', key: 'L', icon: I('M4 16L16 4') },
	{ id: 'draw', label: 'Pen', key: 'D', icon: I('M3 15c2-1 3-5 5-5s1 4 3 4 3-6 6-8') },
	{
		id: 'highlighter',
		label: 'Highlighter',
		key: '',
		icon: I('M6 14l-2 3h4l1-1M6 14l7-9 3 2.5-7 9zM6 14l3 2.5'),
	},
	{ id: 'text', label: 'Text', key: 'T', icon: I('M4 5V4h12v1M10 4v12M8 16h4') },
	{ id: 'sticky', label: 'Sticky note', key: 'N', icon: I('M4 4h12v8l-4 4H4zM12 16v-4h4') },
	{ id: 'frame', label: 'Frame', key: 'F', icon: I('M6 3v14M14 3v14M3 6h14M3 14h14') },
	{ id: 'eraser', label: 'Eraser', key: 'E', icon: I('M8 16h8M4.5 12.5l7-7.5 4 4-7 7.5H7z') },
]

const panel: CSSProperties = {
	position: 'absolute',
	display: 'flex',
	gap: 2,
	padding: 4,
	borderRadius: 10,
	background: 'var(--ub-panel)',
	boxShadow: '0 1px 3px rgba(0,0,0,.12), 0 4px 16px rgba(0,0,0,.08)',
	color: 'var(--ub-text)',
	fontFamily: 'system-ui, sans-serif',
	fontSize: 12,
	pointerEvents: 'all',
}

const themeVars = (theme: 'light' | 'dark'): CSSProperties =>
	({
		'--ub-panel': theme === 'light' ? '#ffffff' : '#232327',
		'--ub-text': theme === 'light' ? '#1d1d1f' : '#ececef',
		'--ub-muted': theme === 'light' ? '#6b7079' : '#9aa0a8',
		'--ub-hover': theme === 'light' ? '#f1f2f4' : '#2f3036',
		'--ub-active': theme === 'light' ? '#e3edfd' : '#22344f',
		'--ub-accent': '#2f80ed',
	}) as CSSProperties

function Button({
	active,
	title,
	onClick,
	children,
	disabled,
}: {
	active?: boolean
	title: string
	onClick(): void
	children: ReactNode
	disabled?: boolean
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			aria-pressed={active}
			disabled={disabled}
			onClick={onClick}
			onPointerDown={(e) => e.stopPropagation()}
			style={{
				display: 'grid',
				placeItems: 'center',
				minWidth: 32,
				height: 32,
				padding: '0 6px',
				border: 'none',
				borderRadius: 7,
				background: active ? 'var(--ub-active)' : 'transparent',
				color: active ? 'var(--ub-accent)' : 'inherit',
				opacity: disabled ? 0.35 : 1,
				cursor: disabled ? 'default' : 'pointer',
				font: 'inherit',
			}}
		>
			{children}
		</button>
	)
}

/** Default chrome: tools, style controls, zoom and history. Optional; the engine runs without it. */
export function BoardUI({ editor, extraMenu }: { editor: Editor; extraMenu?: ReactNode }) {
	useEditorVersion(editor)
	const st = editor.getState()
	return (
		<div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', ...themeVars(st.theme) }}>
			<div
				style={{ ...panel, bottom: 12, left: '50%', transform: 'translateX(-50%)' }}
				role="toolbar"
				aria-label="Tools"
			>
				{TOOLS.map((t) => (
					<Button
						key={t.id}
						title={t.key ? `${t.label} (${t.key})` : t.label}
						active={st.toolId === t.id}
						onClick={() => editor.setTool(t.id)}
					>
						{t.icon}
					</Button>
				))}
				<Divider />
				<Button
					title="Keep tool after drawing"
					active={st.toolLocked}
					onClick={() => editor.setState({ toolLocked: !st.toolLocked })}
				>
					{I(
						st.toolLocked
							? 'M6 9V6.5a4 4 0 018 0V9M5 9h10v8H5z'
							: 'M6 9V6.5a4 4 0 017.7-1.5M5 9h10v8H5z'
					)}
				</Button>
			</div>
			<StylePanel editor={editor} />
			<div style={{ ...panel, bottom: 12, left: 12 }}>
				<Button title="Undo" disabled={!editor.history.canUndo()} onClick={() => editor.undo()}>
					{I('M7 5L3 9l4 4M3 9h9a5 5 0 010 10h-2')}
				</Button>
				<Button title="Redo" disabled={!editor.history.canRedo()} onClick={() => editor.redo()}>
					{I('M13 5l4 4-4 4M17 9H8a5 5 0 000 10h2')}
				</Button>
				<Divider />
				<Button title="Zoom out" onClick={() => editor.zoomOut()}>
					{I('M5 10h10')}
				</Button>
				<Button title="Reset zoom" onClick={() => editor.resetZoom()}>
					<span style={{ minWidth: 40, textAlign: 'center' }}>
						{Math.round(st.camera.z * 100)}%
					</span>
				</Button>
				<Button title="Zoom in" onClick={() => editor.zoomIn()}>
					{I('M5 10h10M10 5v10')}
				</Button>
				<Button title="Zoom to fit" onClick={() => editor.zoomToFit()}>
					{I('M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4')}
				</Button>
			</div>
			<div style={{ ...panel, top: 12, left: 12 }}>
				<Button title="Grid" active={st.grid} onClick={() => editor.setState({ grid: !st.grid })}>
					{I('M3 7h14M3 13h14M7 3v14M13 3v14')}
				</Button>
				<Button
					title="Snap to shapes"
					active={st.snapping}
					onClick={() => editor.setState({ snapping: !st.snapping })}
				>
					{I('M4 4v12h12M8 4v8h8')}
				</Button>
				<Button
					title={st.theme === 'light' ? 'Dark theme' : 'Light theme'}
					onClick={() => editor.setState({ theme: st.theme === 'light' ? 'dark' : 'light' })}
				>
					{I(
						st.theme === 'light'
							? 'M15 12.5A6 6 0 017.5 5a6 6 0 107.5 7.5z'
							: 'M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5 5l1 1M14 14l1 1M5 15l1-1M14 6l1-1M10 7a3 3 0 100 6 3 3 0 000-6z'
					)}
				</Button>
				{extraMenu}
			</div>
		</div>
	)
}

function Divider() {
	return <div style={{ width: 1, margin: '4px 2px', background: 'var(--ub-hover)' }} />
}

const DRAWING_TOOLS = new Set([
	'rect',
	'ellipse',
	'arrow',
	'line',
	'draw',
	'highlighter',
	'text',
	'sticky',
])

function StylePanel({ editor }: { editor: Editor }) {
	const st = editor.getState()
	const selected = editor.getSelectedShapes()
	if (selected.length === 0 && !DRAWING_TOOLS.has(st.toolId)) return null
	const style = selected[0]?.style ?? st.nextStyle
	const types = new Set<Shape['type']>(selected.map((s) => s.type))
	if (selected.length === 0) {
		const map: Record<string, Shape['type']> = { arrow: 'line', highlighter: 'draw' }
		types.add(map[st.toolId] ?? (st.toolId as Shape['type']))
	}
	const lines = selected.filter((s) => s.type === 'line')
	const hasStroke = [...types].some((t) => t !== 'sticky' && t !== 'text' && t !== 'image')
	const hasFill = [...types].some((t) => t === 'rect' || t === 'ellipse' || t === 'draw')
	const texts = selected.filter((s) => s.type === 'text' || s.type === 'sticky')
	const row: CSSProperties = { display: 'flex', gap: 2, flexWrap: 'wrap' }

	return (
		<div
			style={{
				...panel,
				top: 12,
				right: 12,
				flexDirection: 'column',
				width: 196,
				gap: 6,
				padding: 8,
			}}
			aria-label="Style"
		>
			<div style={row}>
				{PALETTE_KEYS.map((k) => (
					<button
						key={k}
						type="button"
						title={k}
						aria-label={k}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => editor.setStyle({ color: k })}
						style={{
							width: 26,
							height: 26,
							borderRadius: 13,
							border: style.color === k ? '2px solid var(--ub-accent)' : '2px solid transparent',
							background: resolveColor(k, st.theme).stroke,
							backgroundClip: 'content-box',
							padding: 3,
							cursor: 'pointer',
						}}
					/>
				))}
			</div>
			{hasFill && (
				<div style={row}>
					{(['none', 'tint', 'solid'] as Fill[]).map((f) => (
						<Button
							key={f}
							title={`Fill: ${f}`}
							active={style.fill === f}
							onClick={() => editor.setStyle({ fill: f })}
						>
							{f === 'none' ? 'No fill' : f === 'tint' ? 'Tint' : 'Solid'}
						</Button>
					))}
				</div>
			)}
			{hasStroke && (
				<>
					<div style={row}>
						{[1, 2, 4, 8].map((w) => (
							<Button
								key={w}
								title={`Stroke ${w}`}
								active={style.strokeWidth === w}
								onClick={() => editor.setStyle({ strokeWidth: w })}
							>
								<span
									style={{
										display: 'block',
										width: 18,
										height: w,
										borderRadius: w,
										background: 'currentColor',
									}}
								/>
							</Button>
						))}
					</div>
					<div style={row}>
						{(['solid', 'dashed', 'dotted'] as Dash[]).map((d) => (
							<Button
								key={d}
								title={`Dash: ${d}`}
								active={style.dash === d}
								onClick={() => editor.setStyle({ dash: d })}
							>
								{d[0].toUpperCase() + d.slice(1)}
							</Button>
						))}
					</div>
				</>
			)}
			{lines.length > 0 && (
				<div style={row}>
					{(['none', 'arrow', 'triangle', 'dot'] as Arrowhead[]).map((h) => (
						<Button
							key={h}
							title={`End: ${h}`}
							active={lines.every((l) => l.type === 'line' && l.endHead === h)}
							onClick={() => editor.updateShapes(lines.map((l) => ({ id: l.id, endHead: h })))}
						>
							{h === 'none' ? '—' : h === 'arrow' ? '→' : h === 'triangle' ? '▶' : '●'}
						</Button>
					))}
				</div>
			)}
			{texts.length > 0 && (
				<div style={row}>
					{[14, 20, 28, 40].map((size) => (
						<Button
							key={size}
							title={`Font size ${size}`}
							active={texts.every(
								(t) => (t.type === 'text' || t.type === 'sticky') && t.fontSize === size
							)}
							onClick={() => editor.updateShapes(texts.map((t) => ({ id: t.id, fontSize: size })))}
						>
							{size === 14 ? 'S' : size === 20 ? 'M' : size === 28 ? 'L' : 'XL'}
						</Button>
					))}
				</div>
			)}
			<div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ub-muted)' }}>
				Opacity
				<input
					type="range"
					min={0.1}
					max={1}
					step={0.1}
					value={style.opacity}
					onPointerDown={(e) => e.stopPropagation()}
					onChange={(e) => editor.setStyle({ opacity: Number(e.target.value) })}
					style={{ flex: 1 }}
				/>
			</div>
			{selected.length > 0 && (
				<>
					<div style={row}>
						<Button title="Bring to front" onClick={() => editor.reorder('front')}>
							{I('M4 12h12M6 8h8M8 4h4M10 12v5')}
						</Button>
						<Button title="Send to back" onClick={() => editor.reorder('back')}>
							{I('M4 8h12M6 12h8M8 16h4M10 8V3')}
						</Button>
						<Button title="Duplicate" onClick={() => editor.duplicate()}>
							{I('M7 7h9v9H7zM4 13V4h9')}
						</Button>
						<Button
							title={selected.every((s) => s.locked) ? 'Unlock' : 'Lock'}
							active={selected.every((s) => s.locked)}
							onClick={() => editor.toggleLock()}
						>
							{I('M6 9V6.5a4 4 0 018 0V9M5 9h10v8H5z')}
						</Button>
						<Button title="Delete" onClick={() => editor.deleteShapes(st.selectedIds)}>
							{I('M4 6h12M8 6V4h4v2M6 6l1 11h6l1-11')}
						</Button>
					</div>
					{selected.length > 1 && (
						<div style={row}>
							<Button title="Align left" onClick={() => editor.align('left')}>
								{I('M4 3v14M7 6h9M7 13h5')}
							</Button>
							<Button title="Align centers horizontally" onClick={() => editor.align('center-x')}>
								{I('M10 3v14M5 6h10M7 13h6')}
							</Button>
							<Button title="Align right" onClick={() => editor.align('right')}>
								{I('M16 3v14M4 6h9M8 13h5')}
							</Button>
							<Button title="Align top" onClick={() => editor.align('top')}>
								{I('M3 4h14M6 7v9M13 7v5')}
							</Button>
							<Button title="Align middles vertically" onClick={() => editor.align('center-y')}>
								{I('M3 10h14M6 5v10M13 7v6')}
							</Button>
							<Button title="Align bottom" onClick={() => editor.align('bottom')}>
								{I('M3 16h14M6 4v9M13 8v5')}
							</Button>
							{selected.length > 2 && (
								<>
									<Button title="Distribute horizontally" onClick={() => editor.distribute('x')}>
										{I('M3 4v12M17 4v12M8 7h4v6H8z')}
									</Button>
									<Button title="Distribute vertically" onClick={() => editor.distribute('y')}>
										{I('M4 3h12M4 17h12M7 8h6v4H7z')}
									</Button>
								</>
							)}
						</div>
					)}
				</>
			)}
		</div>
	)
}
