import { TextLink } from "@/components/ui/button";
import { PageHeader, PageShell } from "@/components/ui/page";

const ENTRANCES = [
  { href: "/login", label: "購入者ログイン", note: "商品の購入とポイントの確認" },
  { href: "/tenant/login", label: "テナントログイン", note: "出店申請と店舗の管理" },
  { href: "/admin/login", label: "本部ログイン", note: "審査と運営" },
];

export default function Home() {
  return (
    <PageShell>
      <PageHeader
        title="一般物販マーケット"
        description="フェーズ1（共通基盤とテナント管理）を実装中です。商品一覧と購入導線はフェーズ2以降で追加します。"
      />

      <nav aria-label="ログイン" className="flex flex-col gap-3">
        {ENTRANCES.map((entrance) => (
          <div
            key={entrance.href}
            className="flex flex-col gap-0.5 rounded-lg border border-line bg-raised p-4 text-sm"
          >
            <TextLink href={entrance.href}>{entrance.label}</TextLink>
            <span className="text-muted">{entrance.note}</span>
          </div>
        ))}
      </nav>
    </PageShell>
  );
}
