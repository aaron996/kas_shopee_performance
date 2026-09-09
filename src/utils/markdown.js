/**
 * Safe, zero-dependency Markdown parser for KAS Chatbot messages.
 * Converts markdown text into an AST (Abstract Syntax Tree) suitable
 * for direct React element rendering without innerHTML.
 */

const SAFE_PROTOCOL_PATTERN = /^(?:https?:|mailto:|tel:|\/|#|\.\/|\.\.\/)/i;
const DANGEROUS_PROTOCOL_PATTERN = /^(?:javascript|data|vbscript|file):/i;

/**
 * Validates whether a URL is safe for use in an <a href="..."> tag.
 * Rejects javascript:, data:, vbscript:, etc.
 */
export function isSafeUrl(url) {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Strip control chars and whitespace to prevent bypasses like `java\tscript:`
  const sanitized = trimmed.replace(/[\u0000-\u001F\s]+/g, '');
  if (DANGEROUS_PROTOCOL_PATTERN.test(sanitized)) {
    return false;
  }

  return SAFE_PROTOCOL_PATTERN.test(trimmed);
}

/**
 * Tokenizes inline Markdown content:
 * - Bold + Italic: ***text*** or ___text___
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_ (with word-boundary safety for _)
 * - Inline code: `code`
 * - Links: [label](url)
 * - Raw text
 */
export function tokenizeInline(text) {
  if (!text) return [];

  const tokens = [];
  let pos = 0;
  const len = text.length;

  while (pos < len) {
    // 1. Inline code: `code`
    if (text[pos] === '`') {
      const closingIndex = text.indexOf('`', pos + 1);
      if (closingIndex !== -1) {
        tokens.push({
          type: 'inline_code',
          content: text.slice(pos + 1, closingIndex)
        });
        pos = closingIndex + 1;
        continue;
      }
    }

    // 2. Links: [label](url)
    if (text[pos] === '[') {
      const closingBracket = text.indexOf(']', pos + 1);
      if (closingBracket !== -1 && text[closingBracket + 1] === '(') {
        const closingParen = text.indexOf(')', closingBracket + 2);
        if (closingParen !== -1) {
          const rawLabel = text.slice(pos + 1, closingBracket);
          const rawUrl = text.slice(closingBracket + 2, closingParen).trim();
          if (isSafeUrl(rawUrl)) {
            tokens.push({
              type: 'link',
              href: rawUrl,
              children: tokenizeInline(rawLabel)
            });
          } else {
            // Unsafe URL: do not render as link; render as safe text
            tokens.push({
              type: 'text',
              content: `[${rawLabel}](${rawUrl})`
            });
          }
          pos = closingParen + 1;
          continue;
        }
      }
    }

    // 3. Bold + Italic: ***text*** or ___text___
    if (text.startsWith('***', pos) || text.startsWith('___', pos)) {
      const marker = text.slice(pos, pos + 3);
      const closingIndex = text.indexOf(marker, pos + 3);
      if (closingIndex !== -1 && closingIndex > pos + 3) {
        tokens.push({
          type: 'bold',
          children: [
            {
              type: 'italic',
              children: tokenizeInline(text.slice(pos + 3, closingIndex))
            }
          ]
        });
        pos = closingIndex + 3;
        continue;
      }
    }

    // 4. Bold: **text** or __text__
    if (text.startsWith('**', pos) || text.startsWith('__', pos)) {
      const marker = text.slice(pos, pos + 2);
      const closingIndex = text.indexOf(marker, pos + 2);
      if (closingIndex !== -1 && closingIndex > pos + 2) {
        tokens.push({
          type: 'bold',
          children: tokenizeInline(text.slice(pos + 2, closingIndex))
        });
        pos = closingIndex + 2;
        continue;
      }
    }

    // 5. Italic: *text* or _text_
    if (text[pos] === '*' || text[pos] === '_') {
      const marker = text[pos];
      // For underscore italic, avoid matching snake_case identifiers like foo_bar_baz
      const isUnderscore = marker === '_';
      const prevChar = pos > 0 ? text[pos - 1] : ' ';
      const isWordCharBefore = /[\p{L}\p{N}]/u.test(prevChar);

      if (!isUnderscore || !isWordCharBefore) {
        let closingIndex = -1;
        let searchPos = pos + 1;
        while (searchPos < len) {
          const candidate = text.indexOf(marker, searchPos);
          if (candidate === -1) break;
          // Avoid escaped \* or \_
          if (text[candidate - 1] === '\\') {
            searchPos = candidate + 1;
            continue;
          }
          if (isUnderscore) {
            const nextChar = candidate + 1 < len ? text[candidate + 1] : ' ';
            if (/[\p{L}\p{N}]/u.test(nextChar)) {
              searchPos = candidate + 1;
              continue;
            }
          }
          closingIndex = candidate;
          break;
        }

        if (closingIndex !== -1 && closingIndex > pos + 1) {
          tokens.push({
            type: 'italic',
            children: tokenizeInline(text.slice(pos + 1, closingIndex))
          });
          pos = closingIndex + 1;
          continue;
        }
      }
    }

    // 6. Plain text accumulation
    let nextSpecial = len;
    for (let i = pos + 1; i < len; i++) {
      const ch = text[i];
      if (ch === '`' || ch === '[' || ch === '*' || ch === '_') {
        nextSpecial = i;
        break;
      }
    }

    const chunk = text.slice(pos, nextSpecial);
    if (tokens.length > 0 && tokens[tokens.length - 1].type === 'text') {
      tokens[tokens.length - 1].content += chunk;
    } else {
      tokens.push({
        type: 'text',
        content: chunk
      });
    }
    pos = nextSpecial;
  }

  return tokens;
}

/**
 * Checks if a line is a markdown table separator line, e.g. | --- | :---: | ---: |
 */
function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const parts = trimmed.split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every(part => /^:?-+:?$/.test(part));
}

/**
 * Parses table alignments from separator row.
 */
function parseAlignments(separatorLine) {
  return separatorLine
    .split('|')
    .map(s => s.trim())
    .filter(Boolean)
    .map(cell => {
      const left = cell.startsWith(':');
      const right = cell.endsWith(':');
      if (left && right) return 'center';
      if (right) return 'right';
      return 'left';
    });
}

/**
 * Parses raw Markdown text into block-level AST nodes.
 */
export function parseMarkdown(rawText) {
  if (!rawText) return [];

  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let i = 0;
  const total = lines.length;

  while (i < total) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Fenced code block: ```[language]
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines = [];
      i++;
      let closed = false;
      while (i < total) {
        if (lines[i].trim().startsWith('```')) {
          closed = true;
          i++;
          break;
        }
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'code_block',
        lang,
        code: codeLines.join('\n'),
        closed
      });
      continue;
    }

    // 3. Horizontal rule: --- or *** or ___
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // 4. Headings: # H1 through ###### H6
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        children: tokenizeInline(headingMatch[2].trim())
      });
      i++;
      continue;
    }

    // 5. Table check
    if (trimmed.startsWith('|') && i + 1 < total && isTableSeparator(lines[i + 1])) {
      const headerCells = trimmed.split('|').map(s => s.trim()).filter(Boolean);
      const alignments = parseAlignments(lines[i + 1]);
      i += 2; // skip header and separator
      const rows = [];
      while (i < total && lines[i].trim().startsWith('|')) {
        const rowCells = lines[i].split('|').map(s => s.trim()).filter(Boolean);
        rows.push(rowCells.map(cell => tokenizeInline(cell)));
        i++;
      }
      blocks.push({
        type: 'table',
        headers: headerCells.map(h => tokenizeInline(h)),
        alignments,
        rows
      });
      continue;
    }

    // 6. List items:
    // Unordered: - item, * item, + item
    // Ordered: 1. item, 2. item
    const unorderedMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
    const orderedMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);

    if (unorderedMatch || orderedMatch) {
      const isOrdered = Boolean(orderedMatch);
      const items = [];

      while (i < total) {
        const curLine = lines[i];
        const uMatch = curLine.match(/^(\s*)([-*+])\s+(.+)$/);
        const oMatch = curLine.match(/^(\s*)(\d+)\.\s+(.+)$/);

        if (isOrdered && oMatch) {
          items.push({
            orderNumber: parseInt(oMatch[2], 10),
            children: tokenizeInline(oMatch[3].trim())
          });
          i++;
        } else if (!isOrdered && uMatch) {
          items.push({
            children: tokenizeInline(uMatch[3].trim())
          });
          i++;
        } else {
          // Check if it's an indented continuation of the list item
          if (items.length > 0 && curLine.startsWith('    ') && curLine.trim()) {
            const lastItem = items[items.length - 1];
            const extraTokens = tokenizeInline(' ' + curLine.trim());
            lastItem.children.push(...extraTokens);
            i++;
          } else {
            break;
          }
        }
      }

      blocks.push({
        type: 'list',
        ordered: isOrdered,
        items
      });
      continue;
    }

    // 7. Regular paragraph (groups consecutive text lines)
    const paraLines = [];
    while (i < total) {
      const curLine = lines[i];
      const curTrimmed = curLine.trim();

      // Check if line starts a new block
      if (!curTrimmed) break;
      if (curTrimmed.startsWith('```')) break;
      if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(curTrimmed)) break;
      if (/^(#{1,6})\s+/.test(curLine)) break;
      if (/^\s*[-*+]\s+/.test(curLine)) break;
      if (/^\s*\d+\.\s+/.test(curLine)) break;
      if (curTrimmed.startsWith('|') && i + 1 < total && isTableSeparator(lines[i + 1])) break;

      paraLines.push(tokenizeInline(curLine));
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: 'paragraph',
        lines: paraLines
      });
    }
  }

  return blocks;
}
