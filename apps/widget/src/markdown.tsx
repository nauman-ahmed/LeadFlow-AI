import type { ReactNode } from 'react';

// Minimal markdown for assistant replies: paragraphs, bullet/numbered lists,
// **bold**, *italic* and `code`. Builds React elements (never raw HTML), so
// model output can't inject markup into the host page.

const INLINE = /(\*\*[^*\n]+?\*\*|`[^`\n]+`|\*[^*\s][^*\n]*?\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] };

export function renderMarkdown(text: string): ReactNode {
  const blocks: Block[] = [];
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const bullet = line.match(BULLET);
    const numbered = bullet ? null : line.match(NUMBERED);
    const last = blocks[blocks.length - 1];

    if (bullet || numbered) {
      const kind = bullet ? 'ul' : 'ol';
      const item = (bullet ?? numbered)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (!line.trim()) {
      blocks.push({ kind: 'p', lines: [] }); // paragraph break
    } else if (last && last.kind === 'p' && last.lines.length > 0) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: 'p', lines: [line] });
    }
  }

  return blocks
    .filter((b) => (b.kind === 'p' ? b.lines.length > 0 : true))
    .map((b, i) => {
      if (b.kind === 'p') {
        return (
          <p key={i}>
            {b.lines.flatMap((l, j) =>
              j === 0 ? renderInline(l, `${i}-${j}`) : [<br key={`${i}-br-${j}`} />, ...renderInline(l, `${i}-${j}`)]
            )}
          </p>
        );
      }
      const items = b.items.map((it, j) => <li key={j}>{renderInline(it, `${i}-${j}`)}</li>);
      return b.kind === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
    });
}
