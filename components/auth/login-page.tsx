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
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-600">{description}</p>
      </header>

      {error ? (
        <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <LoginForm audience={audience} next={next} />
    </main>
  );
}
