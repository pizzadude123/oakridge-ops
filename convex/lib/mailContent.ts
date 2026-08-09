import sanitizeHtml from "sanitize-html";

export function sanitizeEditorHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "strong", "em", "u", "s", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: {
          ...attributes,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();
}
