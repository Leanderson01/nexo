import type { Metadata } from "next";

import { LoginScreen } from "@/features/auth/login/login-screen";

export const metadata: Metadata = { title: "Entrar · Nexo Assist" };

export default function LoginPage() {
  return <LoginScreen />;
}
