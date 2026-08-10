// Converts a small Markdown subset into the ProseMirror-shaped JSON document
// Substack's draft API expects for `draft_body` (headings, paragraphs, bold,
// italic, inline code, links, bullet/ordered lists, blockquotes, fenced code).
// Not a full CommonMark implementation — just enough for Hermes-generated post bodies.

const INLINE_PATTERN =
  /(\*\*(.+?)\*\*|__(.+?)__|`(.+?)`|\[(.+?)\]\((.+?)\)|\*(.+?)\*|_(.+?)_)/g;

function textNode(text, marks) {
  const node = { type: "text", text };
  if (marks && marks.length) node.marks = marks;
  return node;
}

function parseInline(text) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  INLINE_PATTERN.lastIndex = 0;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(textNode(text.slice(lastIndex, match.index)));
    }
    if (match[2] !== undefined) nodes.push(textNode(match[2], [{ type: "strong" }]));
    else if (match[3] !== undefined) nodes.push(textNode(match[3], [{ type: "strong" }]));
    else if (match[4] !== undefined) nodes.push(textNode(match[4], [{ type: "code" }]));
    else if (match[5] !== undefined)
      nodes.push(textNode(match[5], [{ type: "link", attrs: { href: match[6] } }]));
    else if (match[7] !== undefined) nodes.push(textNode(match[7], [{ type: "em" }]));
    else if (match[8] !== undefined) nodes.push(textNode(match[8], [{ type: "em" }]));
    lastIndex = INLINE_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(textNode(text.slice(lastIndex)));
  return nodes.filter((node) => node.text !== "");
}

function paragraph(text) {
  const node = { type: "paragraph" };
  const inline = parseInline(text);
  if (inline.length) node.content = inline;
  return node;
}

function heading(level, text) {
  const node = { type: "heading", attrs: { level } };
  const inline = parseInline(text);
  if (inline.length) node.content = inline;
  return node;
}

function parseBlock(block) {
  const headingMatch = block.match(/^(#{1,3})\s+(.*)$/);
  if (headingMatch) return heading(headingMatch[1].length, headingMatch[2]);

  if (block.startsWith("```")) {
    const codeText = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
    const node = { type: "code_block" };
    if (codeText) node.content = [{ type: "text", text: codeText }];
    return node;
  }

  const lines = block.split("\n");

  if (lines.every((line) => /^>\s?/.test(line))) {
    const inner = lines.map((line) => line.replace(/^>\s?/, "")).join("\n");
    return { type: "blockquote", content: [parseBlock(inner)] };
  }

  if (lines.every((line) => /^[-*]\s+/.test(line))) {
    return {
      type: "bullet_list",
      content: lines.map((line) => ({
        type: "list_item",
        content: [paragraph(line.replace(/^[-*]\s+/, ""))],
      })),
    };
  }

  if (lines.every((line) => /^\d+\.\s+/.test(line))) {
    return {
      type: "ordered_list",
      content: lines.map((line) => ({
        type: "list_item",
        content: [paragraph(line.replace(/^\d+\.\s+/, ""))],
      })),
    };
  }

  return paragraph(lines.join(" "));
}

export function markdownToProseMirrorDoc(markdown) {
  const blocks = String(markdown ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  const content = blocks.map(parseBlock);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
