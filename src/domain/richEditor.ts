export type RichEditorSyncTarget = {
  isDestroyed: boolean;
  getHTML: () => string;
  commands: { setContent: (value: string, options: { emitUpdate: boolean }) => unknown };
};

export function syncRichEditorValue(editor: RichEditorSyncTarget | null, value: string) {
  if (!editor || editor.isDestroyed || editor.getHTML() === value) return false;
  editor.commands.setContent(value, { emitUpdate: false });
  return true;
}
