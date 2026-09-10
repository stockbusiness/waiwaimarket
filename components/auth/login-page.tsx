import { Alert } from "@/components/ui/alert";
import { PageHeader, PageShell } from "@/components/ui/page";
import type { Audience } from "@/lib/supabase/audience";

import { LoginForm } from "./login-form";

type Props = {
  audience: Audience;
  title: string;
  description: string;
  next?: string;
  error?: string;
};

export function LoginPage({ audience, title, description, next, error }: Props) {
  return (
    <PageShell width="form">
      <PageHeader title={title} description={description} />
      {error ? <Alert tone="error">{error}</Alert> : null}
      <LoginForm audience={audience} next={next} />
    </PageShell>
  );
}
