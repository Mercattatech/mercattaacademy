"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SwitchAccountButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="min-h-11 self-start text-[15px] font-semibold text-ink-muted hover:text-ink"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
    >
      Sair e usar outra conta
    </button>
  );
}
