import { redirect } from "next/navigation";

import { AddressList } from "@/components/buyer/address-list";
import { Breadcrumb, PageHeader, PageShell } from "@/components/ui/page";
import { listAddresses } from "@/lib/addresses/store";
import { AuthorizationError } from "@/lib/auth/errors";
import { requireBuyer } from "@/lib/auth/guard";

export const metadata = { title: "配送先" };

/**
 * 配送先の管理（docs/00 5.1「配送先登録」）。
 *
 * 0013 の `buyer_addresses_self_all` が自分の行だけに絞る。
 */
export default async function AddressesPage() {
  let context;
  try {
    context = await requireBuyer();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      redirect("/login?next=%2Faddresses");
    }
    throw error;
  }

  const addresses = await listAddresses(context.client);

  return (
    <PageShell width="form">
      <Breadcrumb
        items={[
          { href: "/", label: "トップ" },
          { href: "/addresses", label: "配送先" },
        ]}
      />
      <PageHeader
        title="配送先"
        description="購入手続きで選べます。既定の配送先は 1 つだけ指定できます。"
      />

      <AddressList addresses={addresses} />
    </PageShell>
  );
}
