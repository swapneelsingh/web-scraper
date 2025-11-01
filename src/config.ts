import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Parses a comma-separated string from environment variables into an array.
 */
function getEnvArray(key: string): string[] {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value.split(',').filter(s => s.length > 0);
}

/**
 * Parses an environment variable as a number.
 */
function getEnvNumber(key: string): number {
  const value = process.env[key];
  if (!value || isNaN(Number(value))) {
    throw new Error(`Invalid or missing environment variable: ${key}`);
  }
  return Number(value);
}

// Export all configuration settings
export const config = {
  jira: {
    baseUrl: process.env.JIRA_BASE_URL || 'https://issues.apache.org/jira',
    projects: getEnvArray('JIRA_PROJECTS'),
  },
  scraper: {
    maxConcurrent: getEnvNumber('MAX_CONCURRENT'),
    maxResults: getEnvNumber('MAX_RESULTS'),
    timeout: getEnvNumber('REQUEST_TIMEOUT'),
    rateLimitDelay: getEnvNumber('RATE_LIMIT_DELAY'),
  },
  paths: {
    outputDir: process.env.OUTPUT_DIR || './output',
    checkpointDir: process.env.CHECKPOINT_DIR || './checkpoints',
  },
  env: process.env.NODE_ENV || 'development',
};

// Log the projects being targeted
console.log(`Targeting Jira Projects: ${config.jira.projects.join(', ')}`);