import { redirect } from "next/navigation";

import { LOGIN_PATH } from "@/features/auth/route-access";

// O proxy já manda "/" para a área do papel; isto só cobre o caso de ele não rodar.
export default function HomePage() {
  redirect(LOGIN_PATH);
}
