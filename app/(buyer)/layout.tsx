import { BuyerHeader } from "@/components/ui/site-header";
import { SiteFooter } from "@/components/ui/site-footer";

/**
 * 購入者面の共通枠。
 *
 * 括弧付きのディレクトリ名は URL に出ないため、この配下に置いても
 * /・/login・/stores/[slug] のままである。フェーズ2 で追加する
 * 商品一覧・商品詳細も、ここへ入れれば同じヘッダーとフッターが付く。
 */
export default function BuyerLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <BuyerHeader />
      {children}
      <SiteFooter />
    </>
  );
}
