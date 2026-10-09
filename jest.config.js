const preset = require("jest-expo/jest-preset");
module.exports = {
    preset: "jest-expo",
    testMatch: ["**/tests/**/*.test.[jt]s?(x)"],
    setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
    moduleNameMapper: {
        "^lucide-react-native$":
            "<rootDir>/node_modules/lucide-react-native/dist/cjs/lucide-react-native.js",
    },
    transformIgnorePatterns: preset.transformIgnorePatterns.map((pattern) =>
        pattern.replace("|@sentry", "|decode-uri-component|@sentry"),
    ),
};
