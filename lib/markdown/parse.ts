/**
 * 本部が編集する本文のための、限定した Markdown の解析。
 *
 * **HTML を一切作らない。** 文字列を HTML として解釈する経路（
 * `dangerouslySetInnerHTML` など）を持たず、ここでは構造だけを返して
 * 描画側が React のノードを組み立てる。文字列が HTML になる経路が
 * 無いので、本文に `<script>` を書いても表示されるだけで実行されない。
 *
 * 一般の Markdown ライブラリを入れない理由もこれ。多くは HTML 文字列を
 * 返すため、sanitize を正しく当て続ける責任が生じる。ここで必要なのは
 * 見出し・段落・箇条書き・強調・リンクだけなので、自前のほうが安全で小さい。
 *
 * 対応する記法：
 *   `## 見出し` / `### 小見出し`（`#` は `##` と同じに扱う。h1 はページ表題）
 *   段落（空行で区切る。段落内の改行はそのまま改行になる）
 *   `- ` の箇条書き / `1. ` の番号付き
 *   `**強調**`
 *   `[表示](URL)`（http / https / mailto と、`/` で始まるサイト内リンクのみ）
 *   `---` の区切り線
 *
 * 対応しないもの（書いてもそのまま文字として出る）：
 *   表・画像・引用・コード・見出しの下線記法・`\*` のエスケープ
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; value: string }
  | { type: "link"; href: string; label: string }
  /** 段落内の改行 */
  | { type: "break" };

export type Block =
  | { type: "heading"; level: 2 | 3; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "rule" };

/** リンクとして許すスキーム。javascript: や data: を弾くための許可制 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * リンク先として安全なら正規化した文字列、そうでなければ null。
 *
 * 許可制にしている点が要。禁止したいものを並べる方式だと、
 * `JavaScript:`（大小の混在）や前後の空白・制御文字で抜けられる。
 */
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // サイト内リンク。`//example.com` は別ホストへ飛ぶので除く
  if (value.startsWith("/")) {
    return value.startsWith("//") ? null : value;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return ALLOWED_PROTOCOLS.has(url.protocol) ? url.href : null;
}

/** `**強調**` と `[表示](URL)`。先に現れたほうから取る */
const INLINE_PATTERN = /\*\*([^\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let cursor = 0;

  INLINE_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_PATTERN.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push({ type: "text", value: text.slice(cursor, match.index) });
    }

    if (match[1] !== undefined) {
      nodes.push({ type: "strong", value: match[1] });
    } else {
      const label = match[2];
      const href = safeHref(match[3]);
      // 許せないリンク先は、リンクにせず表示文字だけ残す。
      // 記法ごと消すと本文が欠けたことに気づけない
      nodes.push(href ? { type: "link", href, label } : { type: "text", value: label });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    nodes.push({ type: "text", value: text.slice(cursor) });
  }
  return nodes;
}

/** 段落の各行を解析し、行の間に改行を挟む */
function parseParagraph(lines: string[]): Inline[] {
  const nodes: Inline[] = [];
  lines.forEach((line, index) => {
    if (index > 0) nodes.push({ type: "break" });
    nodes.push(...parseInline(line));
  });
  return nodes;
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+[.)]\s+(.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;

export function parseMarkdown(source: string): Block[] {
  // Windows の改行で貼られても同じ結果にする
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: "paragraph", children: parseParagraph(paragraph) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ type: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (line.trim() === "") {
      flushAll();
      continue;
    }

    // 区切り線の判定は箇条書きより先。`---` は `- --` ではない
    if (RULE.test(line)) {
      flushAll();
      blocks.push({ type: "rule" });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      const text = heading[2].trim();
      if (text === "") continue;
      // ページ表題が h1 なので、本文の見出しは h2 から始める
      blocks.push({
        type: "heading",
        level: heading[1].length >= 3 ? 3 : 2,
        children: parseInline(text),
      });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = ordered !== null;
      // 種類が変わったら別のリストとして開き直す
      if (list && list.ordered !== isOrdered) flushList();
      if (!list) list = { ordered: isOrdered, items: [] };
      list.items.push(parseInline((bullet ?? ordered)![1]));
      continue;
    }

    // 箇条書きの途中に素の行が来たら、そこでリストは終わり
    flushList();
    paragraph.push(line);
  }

  flushAll();
  return blocks;
}
