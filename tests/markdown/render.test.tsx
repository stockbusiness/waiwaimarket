import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Markdown } from "@/components/ui/markdown";

/**
 * 描画まで通して、本文が HTML として解釈されないことを確かめる。
 *
 * parse.test.ts は解析結果を見ているだけなので、描画側で
 * dangerouslySetInnerHTML を使い始めたら気づけない。ここでは
 * 実際に出力される文字列を見る。
 */

function html(source: string): string {
  return renderToStaticMarkup(<Markdown source={source} />);
}

describe("Markdown", () => {
  it("本文中のタグは文字として出る（実行されない）", () => {
    const out = html('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">');
    expect(out).not.toContain("<script>");
    expect(out).not.toContain("<img");
    // 文字実体参照になっている。onerror という語は文字として残るが、
    // 属性ではないので実行されない
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("見出し・箇条書き・区切り線を要素にする", () => {
    const out = html("## 見出し\n\n- あ\n- い\n\n---\n\n1. 一");
    expect(out).toContain("<h2");
    expect(out).toContain("<ul");
    expect(out).toContain("<hr");
    expect(out).toContain("<ol");
  });

  it("外部リンクは別タブで開き、参照元を渡さない", () => {
    const out = html("[外部](https://example.com)");
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("サイト内リンクには target を付けない", () => {
    const out = html("[社内](/legal/company)");
    expect(out).toContain('href="/legal/company"');
    expect(out).not.toContain('target="_blank"');
  });

  it("javascript: の href を一切出力しない", () => {
    const out = html("[押して](javascript:alert(1))");
    expect(out.toLowerCase()).not.toContain("javascript:");
    expect(out).not.toContain("<a ");
  });
});
