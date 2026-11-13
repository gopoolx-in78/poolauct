import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside a React Server Component bundle; tests run in plain Node.
      "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
    },
  },
  test: {
    // DB-backed integration tests run separately: pnpm test:integration
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: { provider: "v8", include: ["src/lib/**", "src/modules/**"] },
  },
});
