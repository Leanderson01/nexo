import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: { name: "app", environment: "node", include: ["src/**/*.test.ts"] },
      },
      {
        // convex-test pede o edge-runtime, igual ao ambiente das funções Convex.
        resolve: { alias },
        test: { name: "convex", environment: "edge-runtime", include: ["convex/**/*.test.ts"] },
      },
    ],
    passWithNoTests: true,
  },
});
