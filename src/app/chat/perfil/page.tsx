import type { Metadata } from "next";

import { ProfileScreen } from "@/features/profile/profile-screen";

export const metadata: Metadata = { title: "Meu perfil · Nexo Assist" };

/** `/chat/perfil`: "Meu perfil" do funcionário, na moldura do chat (protegida pelo proxy). */
export default function ProfilePage() {
  return <ProfileScreen />;
}
