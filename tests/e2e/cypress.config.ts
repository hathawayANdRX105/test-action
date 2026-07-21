import { defineConfig } from 'cypress';

// eslint-disable-next-line import/no-default-export
export default defineConfig({
	e2e: {
		baseUrl: 'http://localhost:61812',
		specPattern: 'tests/e2e/e2e/**/*.cy.{js,jsx,ts,tsx}',
		supportFile: 'tests/e2e/support/e2e.ts',
		fixturesFolder: 'tests/e2e/fixtures',
		screenshotsFolder: 'tests/e2e/screenshots',
		videosFolder: 'tests/e2e/videos',
	},
});
