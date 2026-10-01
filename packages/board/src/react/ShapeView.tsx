import { CSSProperties, memo } from 'react'
import type { Theme } from '../editor'
import { Vec, norm, sub } from '../math/vec'
import { resolveColor } from '../model/palette'
import { LINE_HEIGHT, lineMidpoint, linePoints } from '../model/shapes'
import { Arrowhead, DrawShape, LineShape, Shape, Style } from '../model/types'
import { FONT_FAMILY } from './measure'

export interface ShapeViewProps {
	shape: Shape
	theme: Theme
	/** Hide the shape's own text while the editor overlays a textarea on it. */
	editing: boolean
	faded: boolean
}

export const ShapeView = memo(function ShapeView({ shape, theme, editing, faded }: ShapeViewProps) {
	const transform = `translate(${shape.x} ${shape.y}) rotate(${(shape.rotation * 180) / Math.PI})`
	return (
		<g
			transform={transform}
			opacity={shape.style.opacity * (faded ? 0.3 : 1)}
			data-shape-id={shape.id}
		>
			<ShapeBody shape={shape} theme={theme} editing={editing} />
		</g>
	)
})

function ShapeBody({ shape, theme, editing }: { shape: Shape; theme: Theme; editing: boolean }) {
	const c = resolveColor(shape.style.color, theme)
	const stroke = strokeProps(shape.style, c.stroke)
	const fill = fillFor(shape.style, theme)
	switch (shape.type) {
		case 'rect':
			return (
				<>
					<rect
						width={shape.w}
						height={shape.h}
						rx={Math.min(shape.radius, shape.w / 2, shape.h / 2)}
						fill={fill}
						{...stroke}
					/>
					{!editing && shape.text && (
						<Label w={shape.w} h={shape.h} text={shape.text} color={c.stroke} fontSize={18} />
					)}
				</>
			)
		case 'ellipse':
			return (
				<>
					<ellipse
						cx={shape.w / 2}
						cy={shape.h / 2}
						rx={shape.w / 2}
						ry={shape.h / 2}
						fill={fill}
						{...stroke}
					/>
					{!editing && shape.text && (
						<Label w={shape.w} h={shape.h} text={shape.text} color={c.stroke} fontSize={18} />
					)}
				</>
			)
		case 'text':
			if (editing) return null
			return (
				<foreignObject width={shape.w} height={shape.h} overflow="visible">
					<div
						style={{
							...textStyle(shape.fontSize, c.stroke),
							padding: 4,
							textAlign:
								shape.align === 'middle' ? 'center' : shape.align === 'end' ? 'right' : 'left',
							whiteSpace: shape.autoWidth ? 'pre' : 'pre-wrap',
						}}
					>
						{shape.text}
					</div>
				</foreignObject>
			)
		case 'sticky': {
			const bg = resolveColor(shape.style.color, theme)
			return (
				<>
					<rect
						width={shape.w}
						height={shape.h}
						rx={4}
						fill={theme === 'light' ? bg.tint : bg.solid}
						filter="url(#ub-sticky-shadow)"
					/>
					{!editing && (
						<foreignObject width={shape.w} height={shape.h}>
							<div
								style={{
									...textStyle(shape.fontSize, theme === 'light' ? '#1d1d1f' : '#f8f8f8'),
									padding: 16,
									whiteSpace: 'pre-wrap',
								}}
							>
								{shape.text}
							</div>
						</foreignObject>
					)}
				</>
			)
		}
		case 'line':
			return <LineBody shape={shape} color={c.stroke} theme={theme} editing={editing} />
		case 'draw':
			return <DrawBody shape={shape} color={c.stroke} fill={fill} />
		case 'image':
			return shape.src ? (
				<image
					href={shape.src}
					width={shape.w}
					height={shape.h}
					preserveAspectRatio="none"
					aria-label={shape.alt}
				/>
			) : (
				<rect
					width={shape.w}
					height={shape.h}
					fill={c.tint}
					stroke={c.stroke}
					strokeDasharray="4 4"
				/>
			)
		case 'frame':
			return (
				<>
					<rect
						width={shape.w}
						height={shape.h}
						fill={theme === 'light' ? '#ffffff' : '#1b1b1f'}
						stroke={theme === 'light' ? '#c4c8ce' : '#4a4d53'}
						strokeWidth={1}
					/>
					{!editing && (
						<text
							x={0}
							y={-8}
							fontFamily={FONT_FAMILY}
							fontSize={14}
							fill={theme === 'light' ? '#6b7079' : '#9aa0a8'}
						>
							{shape.name}
						</text>
					)}
				</>
			)
	}
}

function Label({
	w,
	h,
	text,
	color,
	fontSize,
}: {
	w: number
	h: number
	text: string
	color: string
	fontSize: number
}) {
	return (
		<foreignObject width={w} height={h}>
			<div
				style={{
					...textStyle(fontSize, color),
					height: '100%',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					textAlign: 'center',
					padding: 8,
					whiteSpace: 'pre-wrap',
				}}
			>
				{text}
			</div>
		</foreignObject>
	)
}

export function textStyle(fontSize: number, color: string): CSSProperties {
	return {
		fontFamily: FONT_FAMILY,
		fontSize,
		lineHeight: LINE_HEIGHT,
		color,
		overflowWrap: 'anywhere',
		boxSizing: 'border-box',
		margin: 0,
		userSelect: 'none',
	}
}

function strokeProps(style: Style, color: string) {
	const w = style.strokeWidth
	return {
		stroke: color,
		strokeWidth: w,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		strokeDasharray:
			style.dash === 'dashed'
				? `${w * 4} ${w * 3}`
				: style.dash === 'dotted'
					? `0 ${w * 2.5}`
					: undefined,
	}
}

function fillFor(style: Style, theme: Theme) {
	const c = resolveColor(style.color, theme)
	if (style.fill === 'solid') return c.solid
	if (style.fill === 'tint') return c.tint
	return 'none'
}

function LineBody({
	shape,
	color,
	editing,
	theme,
}: {
	shape: LineShape
	color: string
	editing: boolean
	theme: Theme
}) {
	const pts = linePoints(shape)
	const stroke = strokeProps(shape.style, color)
	const d = pathFrom(pts)
	const w = shape.style.strokeWidth
	const mid = lineMidpoint(shape)
	return (
		<>
			<path d={d} fill="none" {...stroke} />
			<Head head={shape.startHead} tip={pts[0]} from={pts[1]} w={w} color={color} />
			<Head
				head={shape.endHead}
				tip={pts[pts.length - 1]}
				from={pts[pts.length - 2]}
				w={w}
				color={color}
			/>
			{!editing && shape.label && (
				<foreignObject x={mid.x - 100} y={mid.y - 14} width={200} height={28} overflow="visible">
					<div
						style={{
							...textStyle(16, color),
							textAlign: 'center',
							display: 'flex',
							justifyContent: 'center',
						}}
					>
						<span
							style={{
								background: theme === 'light' ? '#ffffff' : '#1b1b1f',
								padding: '0 4px',
								whiteSpace: 'pre',
							}}
						>
							{shape.label}
						</span>
					</div>
				</foreignObject>
			)}
		</>
	)
}

function Head({
	head,
	tip,
	from,
	w,
	color,
}: {
	head: Arrowhead
	tip: Vec
	from: Vec
	w: number
	color: string
}) {
	if (head === 'none' || !from) return null
	const dir = norm(sub(tip, from))
	if (dir.x === 0 && dir.y === 0) return null
	const size = 8 + w * 3
	const back = { x: tip.x - dir.x * size, y: tip.y - dir.y * size }
	const n = { x: -dir.y, y: dir.x }
	const half = size * 0.55
	const a = { x: back.x + n.x * half, y: back.y + n.y * half }
	const b = { x: back.x - n.x * half, y: back.y - n.y * half }
	switch (head) {
		case 'arrow':
			return (
				<path
					d={`M${a.x},${a.y} L${tip.x},${tip.y} L${b.x},${b.y}`}
					fill="none"
					stroke={color}
					strokeWidth={w}
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			)
		case 'triangle':
			return (
				<path
					d={`M${a.x},${a.y} L${tip.x},${tip.y} L${b.x},${b.y} Z`}
					fill={color}
					stroke={color}
					strokeWidth={w}
					strokeLinejoin="round"
				/>
			)
		case 'dot':
			return <circle cx={tip.x} cy={tip.y} r={2 + w * 1.5} fill={color} />
	}
}

function DrawBody({ shape, color, fill }: { shape: DrawShape; color: string; fill: string }) {
	const pts = shape.points
	const w = shape.highlighter ? shape.style.strokeWidth * 5 : shape.style.strokeWidth
	if (pts.length === 1) {
		return <circle cx={pts[0].x} cy={pts[0].y} r={w / 2} fill={color} />
	}
	const d = smoothPath(pts, shape.closed)
	return (
		<path
			d={d}
			fill={shape.closed ? fill : 'none'}
			stroke={color}
			strokeWidth={w}
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeOpacity={shape.highlighter ? 0.4 : 1}
			strokeDasharray={strokeProps(shape.style, color).strokeDasharray}
		/>
	)
}

export function pathFrom(pts: readonly Vec[]) {
	return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ')
}

/** Quadratic curves through segment midpoints: smooth, and passes near every sample. */
export function smoothPath(pts: readonly Vec[], closed: boolean) {
	if (pts.length < 3) return pathFrom(pts)
	let d = `M${round(pts[0].x)},${round(pts[0].y)}`
	for (let i = 1; i < pts.length - 1; i++) {
		const p = pts[i]
		const q = pts[i + 1]
		d += ` Q${round(p.x)},${round(p.y)} ${round((p.x + q.x) / 2)},${round((p.y + q.y) / 2)}`
	}
	const last = pts[pts.length - 1]
	d += ` L${round(last.x)},${round(last.y)}`
	return closed ? d + ' Z' : d
}

const round = (n: number) => Math.round(n * 100) / 100
