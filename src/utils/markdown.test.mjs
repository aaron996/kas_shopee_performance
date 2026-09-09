import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeUrl, tokenizeInline, parseMarkdown } from './markdown.js';

test('isSafeUrl allows valid HTTP, HTTPS, mailto, and relative URLs', () => {
  assert.equal(isSafeUrl('https://ghn.vn'), true);
  assert.equal(isSafeUrl('http://localhost:3000'), true);
  assert.equal(isSafeUrl('mailto:cskh@ghn.vn'), true);
  assert.equal(isSafeUrl('/reports/odr'), true);
  assert.equal(isSafeUrl('#section-summary'), true);
  assert.equal(isSafeUrl('./data/sample.csv'), true);
});

test('isSafeUrl rejects malicious schemes and obfuscation attempts', () => {
  assert.equal(isSafeUrl('javascript:alert(1)'), false);
  assert.equal(isSafeUrl('JAVASCRIPT:alert(document.cookie)'), false);
  assert.equal(isSafeUrl('java\tscript:alert(1)'), false);
  assert.equal(isSafeUrl('  javascript:alert(1)  '), false);
  assert.equal(isSafeUrl('data:text/html,<script>alert(1)</script>'), false);
  assert.equal(isSafeUrl('vbscript:msgbox(1)'), false);
  assert.equal(isSafeUrl('file:///etc/passwd'), false);
  assert.equal(isSafeUrl(''), false);
  assert.equal(isSafeUrl(null), false);
  assert.equal(isSafeUrl(undefined), false);
});

test('tokenizeInline parses bold with Vietnamese text and punctuation', () => {
  const input = '**ODR SPB toàn quốc:** **90,6%**';
  const tokens = tokenizeInline(input);

  assert.equal(tokens.length, 3);
  assert.equal(tokens[0].type, 'bold');
  assert.equal(tokens[0].children[0].content, 'ODR SPB toàn quốc:');
  assert.equal(tokens[1].type, 'text');
  assert.equal(tokens[1].content, ' ');
  assert.equal(tokens[2].type, 'bold');
  assert.equal(tokens[2].children[0].content, '90,6%');
});

test('tokenizeInline parses italic with * and _', () => {
  const astStar = tokenizeInline('*lưu ý quan trọng*');
  assert.equal(astStar.length, 1);
  assert.equal(astStar[0].type, 'italic');
  assert.equal(astStar[0].children[0].content, 'lưu ý quan trọng');

  const astUnder = tokenizeInline('_chỉ tiêu ngày_');
  assert.equal(astUnder.length, 1);
  assert.equal(astUnder[0].type, 'italic');
  assert.equal(astUnder[0].children[0].content, 'chỉ tiêu ngày');

  // Should NOT treat snake_case variable names as italic
  const astSnake = tokenizeInline('deli_rows_count');
  assert.equal(astSnake.length, 1);
  assert.equal(astSnake[0].type, 'text');
  assert.equal(astSnake[0].content, 'deli_rows_count');
});

test('tokenizeInline parses bold+italic combination', () => {
  const tokens = tokenizeInline('***rất quan trọng***');
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'bold');
  assert.equal(tokens[0].children[0].type, 'italic');
  assert.equal(tokens[0].children[0].children[0].content, 'rất quan trọng');
});

test('tokenizeInline parses inline code', () => {
  const tokens = tokenizeInline('Chỉ số `ODR_SPB` cần đạt `>= 90%`');
  assert.equal(tokens.length, 4);
  assert.equal(tokens[0].content, 'Chỉ số ');
  assert.equal(tokens[1].type, 'inline_code');
  assert.equal(tokens[1].content, 'ODR_SPB');
  assert.equal(tokens[2].content, ' cần đạt ');
  assert.equal(tokens[3].type, 'inline_code');
  assert.equal(tokens[3].content, '>= 90%');
});

test('tokenizeInline parses safe links and sanitizes dangerous links', () => {
  const safeTokens = tokenizeInline('[Trang chủ GHN](https://ghn.vn)');
  assert.equal(safeTokens.length, 1);
  assert.equal(safeTokens[0].type, 'link');
  assert.equal(safeTokens[0].href, 'https://ghn.vn');
  assert.equal(safeTokens[0].children[0].content, 'Trang chủ GHN');

  const evilTokens = tokenizeInline('[Click me](javascript:alert(1))');
  assert.equal(evilTokens.length, 1);
  // Unsafe links are NOT emitted as link tokens
  assert.equal(evilTokens[0].type, 'text');
  assert.equal(evilTokens[0].content, '[Click me](javascript:alert(1))');
});

test('parseMarkdown handles headings h1 through h6', () => {
  const text = `# Tiêu đề 1\n## Tiêu đề 2\n### Tiêu đề 3\n#### Tiêu đề 4\n##### Tiêu đề 5\n###### Tiêu đề 6`;
  const blocks = parseMarkdown(text);

  assert.equal(blocks.length, 6);
  assert.equal(blocks[0].type, 'heading');
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[0].children[0].content, 'Tiêu đề 1');
  assert.equal(blocks[5].type, 'heading');
  assert.equal(blocks[5].level, 6);
  assert.equal(blocks[5].children[0].content, 'Tiêu đề 6');
});

test('parseMarkdown handles unordered and ordered lists', () => {
  const text = `
- **ODR SPB:** 90,6%
- *OPR SPB:* 95,2%
- Ca 1: đạt

1. Bước một: kiểm tra dữ liệu
2. Bước hai: tổng hợp
`;
  const blocks = parseMarkdown(text);

  assert.equal(blocks.length, 2);

  // Unordered list
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].ordered, false);
  assert.equal(blocks[0].items.length, 3);
  assert.equal(blocks[0].items[0].children[0].type, 'bold');
  assert.equal(blocks[0].items[1].children[0].type, 'italic');

  // Ordered list
  assert.equal(blocks[1].type, 'list');
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[1].items.length, 2);
  assert.equal(blocks[1].items[0].orderNumber, 1);
  assert.equal(blocks[1].items[1].orderNumber, 2);
});

test('parseMarkdown handles fenced code blocks with lang and streaming unclosed block', () => {
  const text = "```sql\nSELECT hub, odr FROM spb_kpi;\n```";
  const blocks = parseMarkdown(text);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'code_block');
  assert.equal(blocks[0].lang, 'sql');
  assert.equal(blocks[0].code, 'SELECT hub, odr FROM spb_kpi;');
  assert.equal(blocks[0].closed, true);

  // Streaming unclosed code block
  const streamingText = "```json\n{\n  \"status\": \"pending\"";
  const streamingBlocks = parseMarkdown(streamingText);

  assert.equal(streamingBlocks.length, 1);
  assert.equal(streamingBlocks[0].type, 'code_block');
  assert.equal(streamingBlocks[0].lang, 'json');
  assert.equal(streamingBlocks[0].closed, false);
  assert.ok(streamingBlocks[0].code.includes('"status": "pending"'));
});

test('parseMarkdown handles tables with alignments', () => {
  const tableText = `
| Chỉ số | Target | Thực tế |
| :--- | :---: | ---: |
| ODR SPB | >= 90% | 90,6% |
| OPR SPB | >= 95% | 96,1% |
`;
  const blocks = parseMarkdown(tableText);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'table');
  assert.equal(blocks[0].headers.length, 3);
  assert.deepEqual(blocks[0].alignments, ['left', 'center', 'right']);
  assert.equal(blocks[0].rows.length, 2);
});

test('parseMarkdown preserves soft line breaks inside paragraph', () => {
  const text = `Dòng 1: bắt đầu\nDòng 2: tiếp theo\nDòng 3: kết thúc`;
  const blocks = parseMarkdown(text);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  assert.equal(blocks[0].lines.length, 3);
  assert.equal(blocks[0].lines[0][0].content, 'Dòng 1: bắt đầu');
  assert.equal(blocks[0].lines[1][0].content, 'Dòng 2: tiếp theo');
  assert.equal(blocks[0].lines[2][0].content, 'Dòng 3: kết thúc');
});

test('streaming partial markdown does not crash and recovers gracefully', () => {
  // Partial unclosed bold during streaming
  const partialBold = 'Tỉ lệ đạt **90,';
  const tokens = tokenizeInline(partialBold);
  assert.ok(tokens.length >= 1);
  // Plain text fallback or partial token, no uncaught error
  const blocks = parseMarkdown(partialBold);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');

  // Incomplete link [title](http...
  const partialLink = 'Xem thêm [GHN Dashboard](https://';
  const linkBlocks = parseMarkdown(partialLink);
  assert.equal(linkBlocks.length, 1);
});

test('XSS HTML payload is not parsed into HTML DOM tags', () => {
  const malicious = '<script>alert("xss")</script><img src="x" onerror="alert(1)">';
  const blocks = parseMarkdown(malicious);

  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'paragraph');
  // Raw text contains the strings verbatim without creating raw DOM
  const rawText = blocks[0].lines[0].map(t => t.content).join('');
  assert.equal(rawText, malicious);
});
