"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { authCtaOutline } from "@/components/auth-shell";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={authCtaOutline}
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      Sair e usar o e-mail do convite
    </button>
  );
}
