// module.exports = {
//   preset: 'ts-jest',
//   testEnvironment: 'node',
//   roots: ['<rootDir>/src', '<rootDir>/tests'],
//   testMatch: ['**/*.test.ts'],
//   collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
//   coverageDirectory: 'coverage',
  
//   // Tell Jest to transform ESM modules
//   transformIgnorePatterns: [
//     'node_modules/(?!(p-limit|yocto-queue)/)'
//   ],
  
//   // Properly handle both TypeScript and JavaScript
//   transform: {
//     '^.+\\.tsx?$': ['ts-jest', {
//       tsconfig: {
//         esModuleInterop: true,
//         allowSyntheticDefaultImports: true,
//       }
//     }],
//   },
  
//   // Add module name mapper for ESM modules
//   moduleNameMapper: {
//     '^(\\.{1,2}/.*)\\.js$': '$1',
//   },
  
//   // Resolve extensions
//   moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
// };


module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts'],
  coverageDirectory: 'coverage',
};