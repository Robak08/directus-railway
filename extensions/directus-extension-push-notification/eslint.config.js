import eslintJs from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import process from "node:process";
import typescriptEslint from "typescript-eslint";

export default [
  // Global config
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },

  // Ignored files
  {
    ignores: [
      "**/dist/",
      "node_modules/",
      ".pnpm-store/",
      "playwright-report/",
      "test-results/",
      "test-user-data-dir/",
      "packages/",
      "tests/",
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/*.e2e.ts",
      "vitest.config.ts",
      "playwright.config.cjs",
    ],
  },

  // Enable recommended rules for JS files
  eslintJs.configs.recommended,

  // Custom basic rules
  {
    rules: {
      // No console & debugger statements in production
      "no-console": process.env.NODE_ENV !== "development" ? "error" : "off",
      "no-debugger": process.env.NODE_ENV !== "development" ? "error" : "off",
      // Require empty line between certain statements
      "padding-line-between-statements": [
        "error",
        {
          blankLine: "always",
          prev: [
            "block",
            "block-like",
            "cjs-export",
            "class",
            "export",
            "import",
          ],
          next: "*",
        },
        {
          blankLine: "any",
          prev: ["export", "import"],
          next: ["export", "import"],
        },
      ],
    },
  },

  // TypeScript configuration
  ...typescriptEslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),

  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: typescriptEslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint.plugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Test files configuration
  {
    files: ["tests/**/*.ts", "tests/**/*.js", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "no-console": "off", // Allow console in test files
    },
  },

  // Prettier config to disable conflicting rules
  eslintConfigPrettier,
];
