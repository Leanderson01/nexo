"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Button, type ButtonProps } from "@mantine/core";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { saveRememberMePreference } from "./remember-me";
import { LOGIN_PATH } from "./route-access";

/** Botão "Sair" para o cabeçalho das telas internas: encerra a sessão e volta ao login. */
export function SignOutButton(props: Omit<ButtonProps, "onClick" | "loading">) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      await signOut();
    } finally {
      saveRememberMePreference(false);
      router.replace(LOGIN_PATH);
      router.refresh();
    }
  }

  return (
    <Button variant="default" size="xs" {...props} loading={isSigningOut} onClick={handleSignOut}>
      Sair
    </Button>
  );
}
