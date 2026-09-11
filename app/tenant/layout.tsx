import { SignOutButton } from "@/components/auth/sign-out-button";
import { ConsoleHeader } from "@/components/ui/site-header";

/** テナント面の共通枠。購入者向けの導線は出さない */
export default function TenantLayout({ children }: LayoutProps<"/tenant">) {
  return (
    <>
      <ConsoleHeader label="テナント" home="/tenant">
        <SignOutButton audience="tenant" />
      </ConsoleHeader>
      {children}
    </>
  );
}
