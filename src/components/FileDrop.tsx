import { FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";
import clsx from "clsx";

export function FileDrop({ label, description, busy, onFile }: { label: string; description: string; busy?: boolean; onFile: (file: File) => void | Promise<void> }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={clsx("file-drop", dragging && "file-drop--dragging", busy && "file-drop--busy")}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void onFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFile(file);
          event.currentTarget.value = "";
        }}
      />
      <span className="file-icon"><FileSpreadsheet aria-hidden="true" /></span>
      <div><strong>{busy ? "Reading your file…" : label}</strong><p>{description}</p></div>
      <button className="button button--secondary" type="button" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload aria-hidden="true" /> Choose file
      </button>
    </div>
  );
}
