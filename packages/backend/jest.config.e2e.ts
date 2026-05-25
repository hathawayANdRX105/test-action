/*
* For a detailed explanation regarding each configuration property and type check, visit:
* https://jestjs.io/docs/en/configuration.html
*/

import base from './jest.config.common.ts';

export default {
	...base,
	globalSetup: "<rootDir>/test/jest.global-setup.e2e.cjs",
	setupFilesAfterEnv: ["<rootDir>/test/jest.setup.e2e.mjs"],
	testMatch: [
		"<rootDir>/test/e2e/**/*.ts",
	],
};
