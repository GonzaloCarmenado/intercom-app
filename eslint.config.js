import jsdoc from "eslint-plugin-jsdoc";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "coverage/", "src-tauri/", "**/*.d.ts"],
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylistic,
  {
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            ArrowFunctionExpression: false,
            ClassDeclaration: true,
            ClassExpression: true,
            FunctionDeclaration: true,
            MethodDefinition: false,
          },
        },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/prefer-readonly": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-non-null-assertion": "off", // shadowRoot! es un patrón válido en Web Components
      "no-console": "warn",
      "prefer-const": "error",
      "no-var": "error",
      "no-eval": "error", // Tauri CSP: no eval permitido

      "max-lines": ["warn", { max: 300, skipComments: true, skipBlankLines: true }],
      "max-lines-per-function": ["warn", { max: 60, skipComments: true, skipBlankLines: true }],
      "max-depth": ["warn", { max: 3 }],
      "max-params": ["warn", { max: 4 }],
    },
  },
  {
    files: ["**/*.spec.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "@typescript-eslint/unbound-method": "off",
      "jsdoc/require-jsdoc": "off",
    },
  },
);
