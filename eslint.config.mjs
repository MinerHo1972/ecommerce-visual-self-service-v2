import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTypescript from "eslint-config-next/typescript"

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  {
    rules: {
      // Existing codebase uses controlled legacy effects and typed API payloads.
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/prefer-as-const": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    ".npm-recovery/**",
    "next-env.d.ts",
  ]),
])
