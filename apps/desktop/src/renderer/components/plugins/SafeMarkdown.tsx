import React from "react";

export function SafeMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return <div className="markdown-body">{blocks.map((block, index) => renderBlock(block, index))}</div>;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; text: string };

function parseBlocks(input: string): Block[] {
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => { if (paragraph.length) { blocks.push({ type: "paragraph", text: paragraph.join(" ") }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push({ type: "list", ordered: list.ordered, items: list.items }); list = null; } };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (code) { blocks.push({ type: "code", text: code.join("\n") }); code = null; }
      else { flushParagraph(); flushList(); code = []; }
      continue;
    }
    if (code) { code.push(line); continue; }
    if (!line.trim()) { flushParagraph(); flushList(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2] });
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = !!ordered;
      if (!list || list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push((unordered ?? ordered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line.trim());
  }
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  flushParagraph();
  flushList();
  return blocks;
}

function renderBlock(block: Block, index: number): React.ReactNode {
  if (block.type === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3";
    return <Tag key={index}>{renderInline(block.text)}</Tag>;
  }
  if (block.type === "code") return <pre key={index}><code>{block.text}</code></pre>;
  if (block.type === "list") {
    const Tag = block.ordered ? "ol" : "ul";
    return <Tag key={index}>{block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}</Tag>;
  }
  return <p key={index}>{renderInline(block.text)}</p>;
}

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\s)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) nodes.push(<strong key={nodes.length}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("`")) nodes.push(<code key={nodes.length}>{token.slice(1, -1)}</code>);
    else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const url = link?.[2] ?? "";
      if (/^https?:\/\//i.test(url)) {
        nodes.push(<a key={nodes.length} href="#" onClick={e => { e.preventDefault(); void window.companion.openExternal(url); }}>{link?.[1]}</a>);
      } else nodes.push(token);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
