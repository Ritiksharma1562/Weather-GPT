import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 90000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: [
    {
      command:
        "../backend/.venv/bin/uvicorn app.main:app --app-dir ../backend --host 127.0.0.1 --port 8100",
      url: "http://127.0.0.1:8100/health",
      timeout: 30000,
      env: {
        ENVIRONMENT: "test",
        DATABASE_URL: "sqlite+aiosqlite:///./e2e-test.db",
        JWT_SECRET_KEY: "isolated-e2e-test-key-never-used-in-production-123456",
        FRONTEND_ORIGINS: "http://127.0.0.1:3100",
        OPENAI_API_KEY: "",
        REDIS_URL: "",
      },
    },
    {
      command: "npm run dev -- --port 3100",
      url: "http://127.0.0.1:3100",
      timeout: 120000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        WATCHPACK_POLLING: "true",
        BACKEND_URL: "http://127.0.0.1:8100",
        NEXT_PUBLIC_WS_URL: "ws://127.0.0.1:8100/ws/live",
      },
    },
  ],
});
