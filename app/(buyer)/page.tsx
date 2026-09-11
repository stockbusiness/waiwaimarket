import { TextLink } from "@/components/ui/button";
import { Card, PageHeader, PageShell, SectionHeader } from "@/components/ui/page";

const ENTRANCES = [
  { href: "/login", label: "購入者ログイン", note: "注文履歴とポイントの確認" },
  { href: "/tenant/login", label: "テナントログイン", note: "出店申請と店舗の管理" },
  { href: "/admin/login", label: "本部ログイン", note: "審査と運営" },
];

export default function Home() {
  return (
    <PageShell>
      <PageHeader
        title="審査を通過したお店だけが出品するマーケット"
        description="フェーズ1（共通基盤とテナント管理）を実装中です。商品一覧と購入導線はフェーズ2以降で追加します。"
      />

      <section className="flex flex-col gap-3">
        <SectionHeader title="ログイン" />
        <ul className="flex flex-col gap-3">
          {ENTRANCES.map((entrance) => (
            <li key={entrance.href}>
              <Card>
                <div className="flex flex-col gap-1 text-sm">
                  <span className="font-bold">
                    <TextLink href={entrance.href}>{entrance.label}</TextLink>
                  </span>
                  <span className="text-muted">{entrance.note}</span>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </PageShell>
  );
}
