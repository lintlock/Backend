import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";
import globals from "globals";

export default [
  js.configs.recommended,

  {
    files: ["**/*.js"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },

    plugins: {
      import: importPlugin,
    },

    settings: {
      "import/resolver": {
        node: {
          extensions: [".js"],
        },
      },
    },

    rules: {
      "import/no-unresolved": "error",
      "import/extensions": [
        "error",
        "ignorePackages",
        { js: "always" },
      ],
      "no-console": "off",
      "no-unused-vars": [
        "warn",
        {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
        }
      ],
    },
  },
];
