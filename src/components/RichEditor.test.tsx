import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { syncRichEditorValue } from "../domain/richEditor";
import { RichEditor } from "./RichEditor";

describe("RichEditor lifecycle", () => {
  it("does not read a destroyed Tiptap editor while StrictMode replaces it", () => {
    const getHTML = vi.fn(() => { throw new Error("destroyed editor schema"); });
    const setContent = vi.fn();
    expect(syncRichEditorValue({ isDestroyed: true, getHTML, commands: { setContent } }, "<p>Hello</p>")).toBe(false);
    expect(getHTML).not.toHaveBeenCalled();
    expect(setContent).not.toHaveBeenCalled();
  });

  it("survives React StrictMode destroying and recreating the Tiptap instance", async () => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onChange = vi.fn();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await act(async () => {
      root.render(<StrictMode><RichEditor value="<p>Hello</p>" onChange={onChange} /></StrictMode>);
      await new Promise((resolve) => window.setTimeout(resolve, 5));
    });

    expect(container.querySelector('[aria-label="Email message"]')).not.toBeNull();
    expect(warning.mock.calls.flat().join(" ")).not.toContain("Duplicate extension names");
    await act(async () => root.unmount());
    warning.mockRestore();
    container.remove();
  });
});
