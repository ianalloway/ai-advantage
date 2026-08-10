import { describe, expect, it } from "vitest";
import { markdownToProseMirrorDoc } from "./substack-markdown.mjs";

describe("markdownToProseMirrorDoc", () => {
  it("wraps plain text in a single paragraph", () => {
    expect(markdownToProseMirrorDoc("Hello world")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }],
    });
  });

  it("splits blank-line-separated blocks into separate paragraphs", () => {
    const doc = markdownToProseMirrorDoc("First paragraph.\n\nSecond paragraph.");
    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content[0].text).toBe("First paragraph.");
    expect(doc.content[1].content[0].text).toBe("Second paragraph.");
  });

  it("parses headings with their level", () => {
    const doc = markdownToProseMirrorDoc("## A heading");
    expect(doc.content[0]).toEqual({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "A heading" }],
    });
  });

  it("applies bold, italic, code, and link marks", () => {
    const doc = markdownToProseMirrorDoc(
      "This is **bold**, *italic*, `code`, and a [link](https://example.com).",
    );
    const nodes = doc.content[0].content;

    expect(nodes).toContainEqual({ type: "text", text: "bold", marks: [{ type: "strong" }] });
    expect(nodes).toContainEqual({ type: "text", text: "italic", marks: [{ type: "em" }] });
    expect(nodes).toContainEqual({ type: "text", text: "code", marks: [{ type: "code" }] });
    expect(nodes).toContainEqual({
      type: "text",
      text: "link",
      marks: [{ type: "link", attrs: { href: "https://example.com" } }],
    });
  });

  it("parses bullet lists", () => {
    const doc = markdownToProseMirrorDoc("- one\n- two\n- three");
    expect(doc.content[0].type).toBe("bullet_list");
    expect(doc.content[0].content).toHaveLength(3);
    expect(doc.content[0].content[1]).toEqual({
      type: "list_item",
      content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }],
    });
  });

  it("parses ordered lists", () => {
    const doc = markdownToProseMirrorDoc("1. one\n2. two");
    expect(doc.content[0].type).toBe("ordered_list");
    expect(doc.content[0].content).toHaveLength(2);
  });

  it("parses blockquotes", () => {
    const doc = markdownToProseMirrorDoc("> A quoted line");
    expect(doc.content[0].type).toBe("blockquote");
    expect(doc.content[0].content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "A quoted line" }],
    });
  });

  it("parses fenced code blocks", () => {
    const doc = markdownToProseMirrorDoc("```js\nconst x = 1;\n```");
    expect(doc.content[0]).toEqual({
      type: "code_block",
      content: [{ type: "text", text: "const x = 1;\n" }],
    });
  });

  it("falls back to a single empty paragraph for empty input", () => {
    expect(markdownToProseMirrorDoc("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
