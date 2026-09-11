import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * globals.css にレイヤー外の要素セレクタを置かないことを固定する。
 *
 * CSS のカスケードでは、レイヤーに属さない宣言が @layer 内のユーティリティに
 * 勝つ。create-next-app の雛形が残していた
 *
 *   body { background: var(--background); color: var(--foreground) }
 *
 * が layout.tsx の bg-* / text-* を上書きし、端末がダークモードのときだけ
 * 「背景は黒、各画面のクラスはライト前提」という食い違いが起きていた。
 * 枠線が白く浮き、補足文字が沈んで読めなくなる。
 *
 * 色はユーティリティ経由で当てる。切り替えは変数の再定義だけで行う。
 */
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * @layer / @theme / @media などのブロックを丸ごと取り除き、
 * どのレイヤーにも属さない記述だけを残す。中括弧は残すこと。
 */
function stripAtRuleBlocks(source: string): string {
  let out = "";
  let i = 0;

  while (i < source.length) {
    if (source[i] !== "@") {
      out += source[i];
      i += 1;
      continue;
    }

    // at-rule のプレリュードを読む
    let j = i;
    while (j < source.length && source[j] !== "{" && source[j] !== ";") j += 1;

    if (source[j] !== "{") {
      // @import のようにブロックを持たない at-rule はそのまま残す
      out += source.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    // 対応する閉じ括弧まで飛ばす
    let depth = 0;
    while (j < source.length) {
      if (source[j] === "{") depth += 1;
      else if (source[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          j += 1;
          break;
        }
      }
      j += 1;
    }
    i = j;
  }

  return out;
}

describe("app/globals.css", () => {
  const unlayered = stripAtRuleBlocks(stripComments(css));

  it("レイヤー外に body の規則を置かない", () => {
    expect(unlayered).not.toMatch(/(^|[\s,}])body\s*\{/);
  });

  it("レイヤー外に置いてよいのは :root の変数定義だけ", () => {
    // セレクタは直前の ; から { までの部分（@import などの文を読み飛ばす）
    const selectors = [...unlayered.matchAll(/([^{}]+)\{/g)].map((m) =>
      (m[1].split(";").pop() ?? "").trim(),
    );
    for (const selector of selectors) {
      expect(selector).toBe(":root");
    }
  });

  it("明暗どちらの値も定義されている", () => {
    expect(css).toContain("prefers-color-scheme: dark");
    for (const token of ["--surface", "--body", "--muted", "--line", "--accent"]) {
      // ライト側とダーク側で 2 回以上出る（@theme inline での参照を含む）
      const defined = css.split(`${token}:`).length - 1;
      expect(defined).toBeGreaterThanOrEqual(2);
    }
  });

  it("@theme は inline で、値を焼き込まず var() を参照する", () => {
    // inline を落とすとメディアクエリで色が切り替わらなくなる
    expect(css).toContain("@theme inline");
    expect(css).toMatch(/--color-surface:\s*var\(--surface\)/);
  });
});
