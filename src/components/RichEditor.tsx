import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import clsx from "clsx";

export function RichEditor({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noopener noreferrer" } }),
      Placeholder.configure({ placeholder: "Write the message here. Keep it warm, clear, and specific." }),
    ],
    content: value,
    editorProps: { attributes: { class: "editor-surface", "aria-label": "Email message" } },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== value) editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="editor-loading">Loading editor…</div>;

  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt("Paste the link address", previous ?? "https://");
    if (href === null) return;
    if (href === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
  };

  const tools = [
    { label: "Bold", icon: Bold, active: editor.isActive("bold"), action: () => editor.chain().focus().toggleBold().run() },
    { label: "Italic", icon: Italic, active: editor.isActive("italic"), action: () => editor.chain().focus().toggleItalic().run() },
    { label: "Bullet list", icon: List, active: editor.isActive("bulletList"), action: () => editor.chain().focus().toggleBulletList().run() },
    { label: "Numbered list", icon: ListOrdered, active: editor.isActive("orderedList"), action: () => editor.chain().focus().toggleOrderedList().run() },
    { label: "Add link", icon: LinkIcon, active: editor.isActive("link"), action: setLink },
  ];

  return (
    <div className="rich-editor">
      <div className="editor-toolbar" aria-label="Email formatting tools">
        {tools.map(({ label, icon: Icon, active, action }) => (
          <button key={label} type="button" className={clsx(active && "is-active")} onClick={action} aria-label={label} aria-pressed={active}>
            <Icon aria-hidden="true" />
          </button>
        ))}
        <span className="toolbar-divider" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} aria-label="Undo"><Undo2 aria-hidden="true" /></button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} aria-label="Redo"><Redo2 aria-hidden="true" /></button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
