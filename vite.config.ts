import { defineConfig } from "vite";

export default defineConfig({
  server: {
    // dev-only: lets the Playwright check (running in its own container) and
    // anything else on the host/local network reach the dev server. Never
    // relevant in production -- CI builds and deploys static files, this
    // dev server never runs anywhere but a developer's own machine.
    allowedHosts: true,
  },
});
