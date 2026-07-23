interface Logger {
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
  setCurrentTest: (testName: string) => void;
}

let currentTest = "";

export const logger: Logger = {
  info: (message: string, ...args: unknown[]) => {
    if (process.env.DEBUG_TESTS === "true") {
      console.log(`[${currentTest}] ℹ️  ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[${currentTest}] ⚠️  ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${currentTest}] ❌ ${message}`, ...args);
  },
  setCurrentTest: (testName: string) => {
    currentTest = testName;
  },
};
