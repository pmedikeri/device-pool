import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          strict: true,
          paths: {
            "@/*": ["./src/*"],
          },
          baseUrl: ".",
        },
        diagnostics: false,
      },
    ],
  },
  transformIgnorePatterns: ["/node_modules/(?!uuid)"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "mock-prisma\\.ts$"],
};

export default config;
