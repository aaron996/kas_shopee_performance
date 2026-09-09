import React, { useMemo } from 'react';
import { parseMarkdown } from '../../utils/markdown';

function renderTokens(tokens) {
  if (!tokens || !tokens.length) return null;

  return tokens.map((token, index) => {
    switch (token.type) {
      case 'bold':
        return <strong key={index}>{renderTokens(token.children)}</strong>;
      case 'italic':
        return <em key={index}>{renderTokens(token.children)}</em>;
      case 'inline_code':
        return <code key={index} className="chat-md-inline-code">{token.content}</code>;
      case 'link':
        return (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="chat-md-link"
          >
            {renderTokens(token.children)}
          </a>
        );
      case 'text':
      default:
        return token.content;
    }
  });
}

function MarkdownBlock({ block, index }) {
  switch (block.type) {
    case 'heading': {
      const children = renderTokens(block.children);
      if (block.level <= 2) {
        return <h4 key={index} className="chat-md-heading chat-md-h4">{children}</h4>;
      }
      if (block.level <= 4) {
        return <h5 key={index} className="chat-md-heading chat-md-h5">{children}</h5>;
      }
      return <h6 key={index} className="chat-md-heading chat-md-h6">{children}</h6>;
    }

    case 'code_block':
      return (
        <div key={index} className="chat-md-code-block">
          {block.lang && (
            <div className="chat-md-code-header">
              <span>{block.lang}</span>
            </div>
          )}
          <pre><code>{block.code}</code></pre>
        </div>
      );

    case 'list': {
      const ListTag = block.ordered ? 'ol' : 'ul';
      const listClass = block.ordered ? 'chat-md-list chat-md-list--ordered' : 'chat-md-list chat-md-list--unordered';
      return (
        <ListTag key={index} className={listClass}>
          {block.items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderTokens(item.children)}</li>
          ))}
        </ListTag>
      );
    }

    case 'table':
      return (
        <div key={index} className="chat-md-table-wrap">
          <table className="chat-md-table">
            <thead>
              <tr>
                {block.headers.map((cell, cellIdx) => (
                  <th
                    key={cellIdx}
                    style={{ textAlign: block.alignments?.[cellIdx] || 'left' }}
                  >
                    {renderTokens(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      style={{ textAlign: block.alignments?.[cellIdx] || 'left' }}
                    >
                      {renderTokens(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'hr':
      return <hr key={index} className="chat-md-hr" />;

    case 'paragraph':
    default:
      return (
        <p key={index} className="chat-md-paragraph">
          {block.lines.map((lineTokens, lineIdx) => (
            <React.Fragment key={lineIdx}>
              {lineIdx > 0 && <br />}
              {renderTokens(lineTokens)}
            </React.Fragment>
          ))}
        </p>
      );
  }
}

export default function ChatMessageMarkdown({ content }) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  if (!blocks || !blocks.length) return null;

  return (
    <div className="chat-markdown">
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} index={index} />
      ))}
    </div>
  );
}
