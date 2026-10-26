import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://127.0.0.1:4173",
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    video: false,
    screenshotOnRunFailure: true,
    setupNodeEvents(on) {
      // Keep the physical headless window larger than the emulated viewports.
      // Otherwise Linux Chrome can clip dialogs while Cypress considers their
      // off-window controls visible and attempts to click them.
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium" && browser.isHeadless) {
          launchOptions.args.push("--window-size=1440,1200");
        }
        return launchOptions;
      });
      // Lets specs print to the terminal, where CI logs are read.
      on("task", {
        log(message: string) {
          console.log(message);
          return null;
        },
      });
    },
  },
  retries: {
    runMode: 1,
    openMode: 0,
  },
  viewportHeight: 720,
  viewportWidth: 1280,
});
