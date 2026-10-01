import type { Editor } from '../editor'
import { BoxTool, DrawTool, EraserTool, HandTool, LineTool, StickyTool, TextTool } from './create'
import { SelectTool } from './select'
import { Tool } from './tool'

export function defaultTools(editor: Editor): Tool[] {
	return [
		new SelectTool(editor),
		new HandTool(editor),
		new BoxTool(editor, 'rect'),
		new BoxTool(editor, 'ellipse'),
		new BoxTool(editor, 'frame', { w: 480, h: 320 }),
		new LineTool(editor, 'line'),
		new LineTool(editor, 'arrow'),
		new DrawTool(editor, 'draw'),
		new DrawTool(editor, 'highlighter'),
		new EraserTool(editor),
		new TextTool(editor),
		new StickyTool(editor),
	]
}
