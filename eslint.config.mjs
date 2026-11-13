import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Secrets must never reach the browser: server env and (later) the service-role client are server-only.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/env.server",
              message: "Server-only. Import from server components, route handlers or actions only.",
            },
          ],
        },
      ],
    },
  },
  {
    // Allowed in server-side code.
    files: [
      "src/app/api/**",
      "src/modules/**/server/**",
      "src/lib/**/*.server.ts",
      "src/lib/supabase/**",
      "src/app/**/actions.ts",
      "src/app/**/route.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
