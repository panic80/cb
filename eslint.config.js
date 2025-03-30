// eslint.config.js
import globals from "globals";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactRecommended from "eslint-plugin-react/configs/recommended.js";
import jsxRuntime from "eslint-plugin-react/configs/jsx-runtime.js";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import eslintImport from "eslint-plugin-import";
import prettierConfig from "eslint-config-prettier";
import prettierPlugin from "eslint-plugin-prettier";
// import testingLibrary from 'eslint-plugin-testing-library'; // Requires flat config setup if used

// Helper function to clean browser globals keys
const cleanBrowserGlobals = Object.fromEntries(
  Object.entries(globals.browser).map(([key, value]) => [key.trim(), value])
);

export default tseslint.config(
  // 1. Global Ignores
  {
    ignores: [
      "dist/**", "build/**", "coverage/**", "node_modules/**", "logs/**", "*.log",
      "vite.config.js", "vitest.config.js", "postcss.config.cjs", "tailwind.config.js",
      "ecosystem.config.cjs", "prettier.config.js", ".prettierrc.json", ".env*",
      "*.lock", "*.local", ".vscode/**", ".idea/**", ".DS_Store", "eslint.config.js",
      "public_html/**", // Ignore public_html
      "server/**", // Ignore server JS for now
      "docs/**", // Ignore docs
    ],
  },

  // 2. Base JS/JSX Configuration (No Type Checking)
  {
    files: ["src/**/*.{js,jsx}"],
    extends: [
        js.configs.recommended,
        reactRecommended,
        jsxRuntime
    ],
    languageOptions: {
      globals: {
        ...cleanBrowserGlobals,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { typescript: true, node: true }, // Keep for resolving imports
    },
    plugins: {
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "import": eslintImport,
      "prettier": prettierPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "prettier/prettier": "warn",
      "react/prop-types": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }], // Basic JS unused vars

       // Import order rule (apply to JS/JSX too)
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          pathGroups: [
            { pattern: "react", group: "external", position: "before" },
            { pattern: "@/**", group: "internal" },
          ],
          pathGroupsExcludedImportTypes: ["react"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

  // 3. TypeScript Configuration (With Type Checking)
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [
      // js.configs.recommended, // Included via tseslint
      ...tseslint.configs.recommendedTypeChecked,
      reactRecommended, // Apply React rules to TSX
      jsxRuntime,       // Apply JSX runtime rules to TSX
    ],
    languageOptions: {
      parser: tseslint.parser, // Explicitly set parser
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: { jsx: true }, // Ensure JSX is enabled for TSX
      },
      globals: {
        ...cleanBrowserGlobals,
        ...globals.node,
        ...globals.es2021,
        // Vitest globals for TS files
        vi: "readonly", describe: "readonly", it: "readonly", expect: "readonly",
        beforeAll: "readonly", afterAll: "readonly", beforeEach: "readonly", afterEach: "readonly",
        test: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": { typescript: true, node: true },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin, // Ensure TS plugin is explicitly listed
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
      "import": eslintImport,
      "prettier": prettierPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      "prettier/prettier": "warn",
      "react/prop-types": "off", // Disabled as we use TypeScript
      // Let TS rules handle unused vars for TS files
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],

      // Relaxed type-aware rules (as before)
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-call": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unsafe-return": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "warn", // Changed from error to warn
      "@typescript-eslint/no-misused-promises": "warn", // Changed from error to warn
      "@typescript-eslint/no-unsafe-argument": "warn", // Changed from error to warn
      "@typescript-eslint/prefer-promise-reject-errors": "warn", // Changed from error to warn

      // Import order rule
      "import/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", ["parent", "sibling", "index"]],
          pathGroups: [
            { pattern: "react", group: "external", position: "before" },
            { pattern: "@/**", group: "internal" },
          ],
          pathGroupsExcludedImportTypes: ["react"],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
    },
  },

   // 4. Test File Overrides (JS/JSX/TS/TSX) - Applied after JS and TS configs
   {
     files: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
     languageOptions: {
       globals: {
         // Add Jest/Vitest specific globals here
         jest: "readonly", // Add jest global
         vi: "readonly", describe: "readonly", it: "readonly", expect: "readonly",
         beforeAll: "readonly", afterAll: "readonly", beforeEach: "readonly", afterEach: "readonly",
         test: "readonly",
       }
     },
     // extends: [testingLibrary.configs.react], // If using testing-library
     rules: {
       // Relax rules specifically for tests if needed
       "@typescript-eslint/no-unsafe-call": "off",
       "@typescript-eslint/no-unsafe-member-access": "off",
       "@typescript-eslint/no-unsafe-assignment": "off",
       "@typescript-eslint/no-unsafe-argument": "off",
       "@typescript-eslint/no-unsafe-return": "off",
       "no-undef": "off", // Turn off basic no-undef for test files as globals are handled
       // Allow console logs in tests
       "no-console": "off",
     }
   },

  // 5. Prettier Config (Must be last)
  prettierConfig,
);