import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { convexAuth, createAccount } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";

import { internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalQuery, query } from "./_generated/server";
import { getCurrentPerson } from "./lib/guards";

// Login de demonstração (§5.10): aceita qualquer senha se o e-mail existir em `people`.
// O usuário do Convex Auth guarda o mesmo e-mail; é por ele que os guards acham a pessoa.

const UNKNOWN_EMAIL_MESSAGE = "Não encontramos esse e-mail.";

const PROVIDER_ID = "credentials";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const seedPeopleCredentials = ConvexCredentials<DataModel>({
  id: PROVIDER_ID,
  authorize: async (credentials, ctx) => {
    const email = normalizeEmail(credentials.email);
    const person = await ctx.runQuery(internal.auth.findPersonByEmail, { email });
    if (!person) throw new ConvexError(UNKNOWN_EMAIL_MESSAGE);

    // Sem `secret`: a senha não é verificada. Na primeira vez cria a conta; depois, devolve a mesma.
    const { user } = await createAccount(ctx, {
      provider: PROVIDER_ID,
      account: { id: email },
      profile: { email, name: person.name },
    });
    return { userId: user._id };
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [seedPeopleCredentials],
});

export const findPersonByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("people")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
  },
});

/** A pessoa logada (ou null). Usada pelo proxy do Next para redirecionar pelo papel. */
export const currentPerson = query({
  args: {},
  handler: async (ctx) => {
    const person = await getCurrentPerson(ctx);
    if (!person) return null;
    return {
      name: person.name,
      email: person.email,
      role: person.role,
      department: person.department,
      level: person.level,
    };
  },
});
