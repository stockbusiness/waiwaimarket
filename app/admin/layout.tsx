import { SignOutButton } from "@/components/auth/sign-out-button";
import { ConsoleHeader } from "@/components/ui/site-header";

/** 本部面の共通枠 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <>
      <ConsoleHeader label="本部" home="/admin">
        <SignOutButton audience="hq" />
      </ConsoleHeader>
      {children}
    </>
  );
}
