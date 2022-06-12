/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // Automatically clear mock calls, instances and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  collectCoverageFrom: ["appscript/**ts"],

  detectOpenHandles: true,

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",
  globals: {
    "ts-jest": {}
  },
  moduleNameMapper: {
    /*
    Unfortunately there are some open issues in the Jest repository regarding modern package export formats so jest
    doesn't know where to load files from.

    You need to manually tell jest where these files should be loaded from, by defining moduleNameMapper inside your
    jest.config.js

    https://github.com/ivanhofer/typesafe-i18n#tests-are-not-running-with-jest
    */
    "typesafe-i18n/adapters/(.*)": "typesafe-i18n/adapters/$1.cjs",
    "typesafe-i18n/detectors": "typesafe-i18n/detectors/index.cjs",
  }
};
