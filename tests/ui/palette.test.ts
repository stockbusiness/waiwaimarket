import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 配色のコントラストを固定する（2026-09-18 決定、app/globals.css 参照）。
 *
 * 色は目で見ても足りているか分からない。ロゴの朱・黄・ティールは画面で
 * 鮮やかに見えるが、白地に置くと 3.38 / 1.77 / 3.23 しかなく、文字として
 * 読めない。数字で止めておかないと、次に触る人が「ブランドカラーだから」と
 * ボタンやリンクに使ってしまう。
 *
 * WCAG 2.1 の相対輝度とコントラスト比の定義に従う。
 */
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** :root の宣言から値を取る。@theme inline 側の var() 参照は拾わない */
function token(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!match) throw new Error(`${name} が #rrggbb で定義されていません`);
  return match[1].toLowerCase();
}

function channel(value: number): number {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

const AA = 4.5;

describe("配色のコントラスト", () => {
  const surface = token("--surface");

  it("ベースは白", () => {
    // 「ベースは白」は見た目の好みではなく、以下の比の前提になっている
    expect(surface).toBe("#ffffff");
    expect(token("--raised")).toBe("#ffffff");
  });

  it("文字は白地で AA を満たす", () => {
    for (const name of ["--body", "--muted", "--subtle", "--link"]) {
      expect(contrast(token(name), surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("状態色は白地で AA を満たす", () => {
    for (const name of ["--danger", "--success", "--warning"]) {
      expect(contrast(token(name), surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("主要操作とフッターは載せる文字と AA を満たす", () => {
    expect(contrast(token("--on-accent"), token("--accent"))).toBeGreaterThanOrEqual(AA);
    expect(contrast(token("--on-footer"), token("--footer"))).toBeGreaterThanOrEqual(AA);
  });

  it("リンクは本文と見分けがつく", () => {
    // --accent（紺）をそのままリンクにすると本文 #18181b と近すぎて、
    // 文中のリンクが下線だけに頼ることになる
    expect(contrast(token("--link"), token("--body"))).toBeGreaterThanOrEqual(1.5);
  });

  it("ブランドの装飾 3 色は文字として使えない値である", () => {
    // 使えないことを確認する後ろ向きのテストに見えるが、意図はその逆で、
    // 「装飾専用」という扱いの根拠をここに残しておくためのもの。
    // 将来この 3 つが AA を満たす濃さに変わったなら、扱いを見直してよい
    for (const name of ["--brand-coral", "--brand-amber", "--brand-teal"]) {
      expect(contrast(token(name), surface)).toBeLessThan(AA);
    }
  });

  it("装飾色の上に文字を置くなら紺", () => {
    // バッジなどでやむを得ず文字を載せる場合の逃げ道。黄だけが AA を満たす
    expect(contrast(token("--accent"), token("--brand-amber"))).toBeGreaterThanOrEqual(AA);
  });

  it("装飾 3 色が文字・リンク・ボタンのトークンに流用されていない", () => {
    const decorations = new Set(
      ["--brand-coral", "--brand-amber", "--brand-teal"].map(token),
    );
    for (const name of ["--body", "--muted", "--subtle", "--link", "--accent", "--footer"]) {
      expect(decorations.has(token(name))).toBe(false);
    }
  });
});
