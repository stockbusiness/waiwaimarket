import { describe, expect, it } from "vitest";

import { parseMarkdown, safeHref, type Block } from "@/lib/markdown/parse";

/**
 * 本部が編集する本文の解析。
 *
 * この本文は管理画面から自由に入力できるため、解析結果がそのまま
 * 公開ページに出る。HTML 文字列を作らない設計なので描画側で XSS は
 * 起きないが、リンク先だけは属性として DOM に入る。javascript: を
 * 弾けているかをここで固定する。
 */

function texts(block: Block): string {
  if (block.type === "rule") return "";
  const inlines = block.type === "list" ? block.items.flat() : block.children;
  return inlines
    .map((node) => {
      switch (node.type) {
        case "text":
          return node.value;
        case "strong":
          return node.value;
        case "link":
          return node.label;
        case "break":
          return "\n";
      }
    })
    .join("");
}

describe("safeHref", () => {
  it("http / https / mailto を許す", () => {
    expect(safeHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeHref("http://example.com")).toBe("http://example.com/");
    expect(safeHref("mailto:info@example.com")).toBe("mailto:info@example.com");
  });

  it("サイト内リンクを許す", () => {
    expect(safeHref("/legal/privacy")).toBe("/legal/privacy");
  });

  it("javascript: を弾く。大小の混在・前後の空白でも抜けられない", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("  javascript:alert(1)")).toBeNull();
    expect(safeHref("\tjavascript:alert(1)")).toBeNull();
  });

  it("data: と vbscript: と file: を弾く", () => {
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeHref("file:///etc/passwd")).toBeNull();
  });

  it("// で始まる指定は別ホストへ飛ぶので弾く", () => {
    expect(safeHref("//evil.example")).toBeNull();
  });

  it("URL として読めないものを弾く", () => {
    expect(safeHref("")).toBeNull();
    expect(safeHref("   ")).toBeNull();
    expect(safeHref("ただの文字列")).toBeNull();
  });
});

describe("parseMarkdown", () => {
  it("見出しの段階を 2 と 3 に割り当てる", () => {
    const blocks = parseMarkdown("# 大\n\n## 中\n\n### 小\n\n#### さらに小");
    expect(blocks.map((b) => (b.type === "heading" ? b.level : null))).toEqual([
      2, 2, 3, 3,
    ]);
  });

  it("空行で段落を分け、段落内の改行は改行として残す", () => {
    const blocks = parseMarkdown("1 行目\n2 行目\n\n次の段落");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(texts(blocks[0])).toBe("1 行目\n2 行目");
    expect(texts(blocks[1])).toBe("次の段落");
  });

  it("箇条書きと番号付きを別のリストにする", () => {
    const blocks = parseMarkdown("- あ\n- い\n1. 一\n2. 二");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "list", ordered: false });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: true });
    if (blocks[0].type === "list") expect(blocks[0].items).toHaveLength(2);
    if (blocks[1].type === "list") expect(blocks[1].items).toHaveLength(2);
  });

  it("--- は区切り線であって箇条書きではない", () => {
    const blocks = parseMarkdown("前\n\n---\n\n後");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "rule", "paragraph"]);
  });

  it("強調とリンクを取り出す", () => {
    const blocks = parseMarkdown("**重要**なお知らせは [こちら](https://example.com) です");
    expect(blocks[0].type).toBe("paragraph");
    if (blocks[0].type !== "paragraph") return;
    expect(blocks[0].children).toEqual([
      { type: "strong", value: "重要" },
      { type: "text", value: "なお知らせは " },
      { type: "link", href: "https://example.com/", label: "こちら" },
      { type: "text", value: " です" },
    ]);
  });

  it("危険なリンク先は、リンクにせず表示文字だけ残す", () => {
    const blocks = parseMarkdown("[押して](javascript:void)");
    if (blocks[0].type !== "paragraph") throw new Error("段落のはず");
    expect(blocks[0].children).toEqual([{ type: "text", value: "押して" }]);
  });

  it("括弧を含む危険なリンク先でも link にならない", () => {
    // URL の走査が最初の ) で止まるため余りが文字として残るが、
    // link ノードが出ないことが要点
    const blocks = parseMarkdown("[押して](javascript:alert(1))");
    if (blocks[0].type !== "paragraph") throw new Error("段落のはず");
    expect(blocks[0].children.some((node) => node.type === "link")).toBe(false);
  });

  it("HTML を書いてもただの文字として扱う", () => {
    const blocks = parseMarkdown("<script>alert(1)</script>");
    if (blocks[0].type !== "paragraph") throw new Error("段落のはず");
    // 解析結果に text 以外のノードが出ない ＝ タグとして解釈されていない
    expect(blocks[0].children).toEqual([
      { type: "text", value: "<script>alert(1)</script>" },
    ]);
  });

  it("Windows の改行でも同じ結果になる", () => {
    expect(parseMarkdown("## 見出し\r\n\r\n本文")).toEqual(
      parseMarkdown("## 見出し\n\n本文"),
    );
  });

  it("箇条書きの直後に素の行が来たらリストを閉じる", () => {
    const blocks = parseMarkdown("- あ\n続きの文");
    expect(blocks.map((b) => b.type)).toEqual(["list", "paragraph"]);
  });

  it("空文字は何も返さない", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n  \n")).toEqual([]);
  });

  it("解析しても内容が消えない（初期の雛形に近い本文で確かめる）", () => {
    const source = [
      "## 第1条（適用）",
      "",
      "本規約は、本マーケットの利用に関する条件を定めるものです。",
      "",
      "- 「本部」とは、運営する当社をいいます。",
      "- 「テナント」とは、出品する事業者をいいます。",
      "",
      "---",
      "",
      "お問い合わせは [会社概要](/legal/company) をご覧ください。",
    ].join("\n");

    const blocks = parseMarkdown(source);
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "rule",
      "paragraph",
    ]);
    expect(texts(blocks[4])).toBe("お問い合わせは 会社概要 をご覧ください。");
  });
});
