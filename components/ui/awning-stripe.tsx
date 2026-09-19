/**
 * 幌のストライプ。ロゴのマークをそのまま帯にしたもの。
 *
 * ブランドの朱・黄・ティールは文字に使えない（白地でのコントラストが
 * 3.38 / 1.77 / 3.23 で AA に届かない。app/globals.css 参照）。
 * 面にしか置けないので、この帯が画面上でロゴとつながる唯一の場所になる。
 *
 * **並び順をここ 1 か所に持つ。** ヘッダーとフッターで同じ帯を使うため、
 * 色の順序を両方に書くと、ロゴが変わったときに片方だけ直して食い違う。
 * 並びはロゴを実測して合わせてある（朱→黄→ティール→黄）。
 *
 * 高さは 8px（2026-09-18）。最初は 4px にしていたが、画面で見ると細すぎて
 * 気づかれなかった。12px 以上にすると帯のほうがロゴより目立つ。
 *
 * 装飾なので読み上げからは外す。
 */
export function AwningStripe() {
  return (
    <div aria-hidden className="flex h-2">
      <div className="flex-1 bg-brand-coral" />
      <div className="flex-1 bg-brand-amber" />
      <div className="flex-1 bg-brand-teal" />
      <div className="flex-1 bg-brand-amber" />
    </div>
  );
}
