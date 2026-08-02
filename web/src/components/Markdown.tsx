import React from "react";

function inline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      parts.push(
        <strong key={`${keyBase}-b${i}`}>{tok.slice(2, -2)}</strong>,
      );
    } else {
      parts.push(
        <code key={`${keyBase}-c${i}`} className="md-code">
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i++;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  let key = 0;

  const flushList = () => {
    if (!list.length) return;
    out.push(
      <ul key={`ul-${key++}`}>
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    if (line.startsWith("### ")) {
      flushList();
      out.push(<h4 key={`h-${key++}`}>{inline(line.slice(4), `h-${key}`)}</h4>);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(<h3 key={`h-${key++}`}>{inline(line.slice(3), `h-${key}`)}</h3>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      out.push(
        <p key={`p-${key++}`}>{inline(line, `p-${key}`)}</p>,
      );
    }
  }
  flushList();
  return <div className="md">{out}</div>;
}
