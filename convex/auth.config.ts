import type { AuthConfig } from "convex/server";

// Quem emite os tokens aceitos pelo Convex: o próprio deployment (Convex Auth).
const authConfig: AuthConfig = {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
