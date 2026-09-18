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

  it("必要なトークンがすべて定義されている", () => {
    for (const token of [
      "--surface",
      "--raised",
      "--body",
      "--muted",
      "--subtle",
      "--line",
      "--line-strong",
      "--accent",
      "--on-accent",
      "--link",
      "--footer",
      "--on-footer",
      "--brand-coral",
      "--brand-amber",
      "--brand-teal",
      "--danger",
      "--success",
      "--warning",
    ]) {
      expect(css).toContain(`${token}:`);
      // @theme inline 側の参照も要る。片方だけだとクラスが生えない
      expect(css).toMatch(new RegExp(`--color-${token.slice(2)}:\\s*var\\(${token}\\)`));
    }
  });

  it("ダークモードを持たない（2026-09-18 決定）", () => {
    // 判定はコメントを除いた本体に対して行う。決定の経緯を書いたコメントに
    // `prefers-color-scheme` の語が出るため、生の文字列を見ると常に落ちる
    const code = stripComments(css);

    // 「白を既定にする」という指定は無い。端末の設定を見るのをやめることでしか
    // 白を固定できないので、この 2 つは対になっている
    expect(code).not.toContain("prefers-color-scheme");
    expect(code).toMatch(/color-scheme:\s*light\s*;/);
    // `light dark` に戻すと、端末がダークのときセレクトやスクロールバーだけ
    // 黒く残り、白いページの上で浮く
    expect(code).not.toMatch(/color-scheme:\s*light\s+dark/);
  });

  it("@theme は inline で、値を焼き込まず var() を参照する", () => {
    // inline を落とすと、トークンを 1 か所で差し替えられなくなる
    expect(css).toContain("@theme inline");
    expect(css).toMatch(/--color-surface:\s*var\(--surface\)/);
  });
});
