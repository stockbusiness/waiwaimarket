import { AUDIENCE_CONFIG, type Audience } from "@/lib/supabase/audience";

/** ログアウトは副作用なので GET ではなく POST で送る */
export function SignOutButton({ audience }: { audience: Audience }) {
  const action = `${
    AUDIENCE_CONFIG[audience].cookiePath === "/"
      ? ""
      : AUDIENCE_CONFIG[audience].cookiePath
  }/auth/signout`;

  return (
    <form action={action} method="post">
      <button type="submit" className="rounded-sm text-sm text-muted underline underline-offset-4 hover:text-body">
        ログアウト
      </button>
    </form>
  );
}
