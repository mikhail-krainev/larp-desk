export {
	Editor,
	GRID_SIZE,
	HIT_TOLERANCE,
	STICKY_PADDING,
	TEXT_PADDING,
	cloneShapes,
	hasText,
	parseClipboard,
	serializeClipboard,
	textOf,
} from './editor'
export type { EditorOptions, InstanceState, TextMeasurer, Theme } from './editor'
export {
	box,
	boxCenter,
	boxContainsBox,
	boxContainsPoint,
	boxCorners,
	boxFromCorners,
	boxFromPoints,
	boxesOverlap,
	expandBox,
	unionBoxes,
} from './math/box'
export type { Box } from './math/box'
export {
	distanceToPolyline,
	distanceToSegment,
	ellipsePoints,
	nearestPointOnSegment,
	polygonContainsPoint,
	polylineIntersectsBox,
	rayExitPoint,
	segmentsIntersect,
	simplifyPolyline,
} from './math/geometry'
export {
	add,
	angleOf,
	cross,
	dist,
	dot,
	eq,
	len,
	lerp,
	mul,
	norm,
	normalizeAngle,
	rotate,
	snapAngle,
	sub,
	vec,
} from './math/vec'
export type { Vec } from './math/vec'
export {
	BINDING_GAP,
	anchorPagePoint,
	bindingFor,
	boundEndpointPagePoint,
	canBindTo,
	lineTargets,
	resolveLine,
} from './model/bindings'
export {
	MAX_ZOOM,
	MIN_ZOOM,
	ZOOM_STEPS,
	clampZoom,
	fitBox,
	nextZoomStep,
	pageToScreen,
	screenToPage,
	viewportPageBounds,
	zoomAt,
} from './model/camera'
export { History } from './model/history'
export type { HistoryEntry } from './model/history'
export { deepClone, uid } from './model/ids'
export { DocumentError, SCHEMA_VERSION, migrateDocument, repairShape } from './model/migrations'
export { PALETTE, PALETTE_KEYS, resolveColor } from './model/palette'
export type { PaletteColor } from './model/palette'
export {
	DEFAULT_STYLE,
	LINE_HEIGHT,
	STICKY_SIZE,
	createShape,
	estimateText,
	hitTest,
	intersectsBox,
	isClosedShape,
	lineControlPoint,
	lineMidpoint,
	linePoints,
	localBounds,
	localOutline,
	pageBounds,
	pageCenter,
	pageOutline,
	toLocal,
	toPage,
} from './model/shapes'
export { snapBox, snapToGrid } from './model/snapping'
export type { SnapGuide, SnapResult } from './model/snapping'
export { ShapeStore, compareZ, composeDiff, invertDiff } from './model/store'
export type { Change, ChangeSource, Diff, StoreEvent } from './model/store'
export {
	HANDLES,
	HANDLE_POS,
	computeScale,
	frameCorners,
	frameToPage,
	handlePagePoint,
	isCornerHandle,
	pageToFrame,
	resizeShape,
	rotateShape,
	selectionFrame,
	selectionPageBounds,
	translateShape,
} from './model/transform'
export type { Handle, ResizeOptions, Scale, SelectionFrame } from './model/transform'
export type {
	Arrowhead,
	BaseShape,
	Binding,
	BoardDocument,
	Camera,
	Dash,
	DrawShape,
	EllipseShape,
	Endpoint,
	Fill,
	FrameShape,
	ImageShape,
	LineShape,
	RectShape,
	Shape,
	ShapeId,
	ShapeOfType,
	ShapePatch,
	ShapeType,
	StickyShape,
	Style,
	TextAlign,
	TextShape,
} from './model/types'
export { Tool } from './tools/tool'
export type { BoardKeyEvent, BoardPointerEvent, PointerTarget } from './tools/tool'
export { DRAG_DISTANCE, SelectTool } from './tools/select'
export {
	BoxTool,
	DrawTool,
	EraserTool,
	HandTool,
	LineTool,
	StickyTool,
	TextTool,
} from './tools/create'
export { defaultTools } from './tools'
