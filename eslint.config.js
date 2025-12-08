const js = require("@eslint/js");
const importPlugin = require("eslint-plugin-import");
const unusedImports = require("eslint-plugin-unused-imports");
const globals = require("globals");

module.exports = [
    js.configs.recommended,
    {
        files: ["src/**/*.js"],
        plugins: {
            import: importPlugin,
            "unused-imports": unusedImports,
        },
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "script",
            globals: {
                ...globals.browser,
                ...globals.webextensions,
                chrome: "readonly",
                TD: "readonly",
                solveChallenge: "readonly",
            }
        },
        rules: {
            "complexity": ["warn", 20],
            "max-depth": ["warn", 4],
            "max-statements": ["warn", 50],
            "no-unused-vars": "off",
            "unused-imports/no-unused-imports": "error",
            "unused-imports/no-unused-vars": [
                "warn",
                { "vars": "all", "varsIgnorePattern": "^_", "args": "after-used", "argsIgnorePattern": "^_" }
            ],
            "import/no-cycle": "warn"
        }
    }
];
