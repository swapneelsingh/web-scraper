import { JiraScraper } from './scraper/JiraScraper';
import { config } from './config';

/**
 * Main application entry point.
 */
async function main() {
  console.log('🚀 Starting Jira LLM Scraper...');
  console.log(`Environment: ${config.env}`);

  // 1. Initialize the Scraper
  // We pass the config loaded from .env into the scraper.
  // The scraper's constructor will merge this with its defaults.
  const scraper = new JiraScraper({
    jiraBaseUrl: config.jira.baseUrl,
    projects: config.jira.projects,
    maxConcurrent: config.scraper.maxConcurrent,
    maxResults: config.scraper.maxResults,
    requestTimeout: config.scraper.timeout,
    outputDir: config.paths.outputDir,
    checkpointDir: config.paths.checkpointDir,
    rateLimitDelay: config.scraper.rateLimitDelay,
  });

  // 2. Set up event listeners for better logging
  // This lets us see what's happening inside the scraper from our main file.
  scraper.on('retry', ({ retryCount, error }) => {
    console.warn(`[RETRY] Attempt ${retryCount}. Error: ${error}`);
  });

  scraper.on('error', ({ error, project, startAt }) => {
    console.error(`[ERROR] Scraping ${project} at index ${startAt}: ${error.message}`);
  });

  scraper.on('project-error', ({ project, error }) => {
    console.error(`[FATAL_PROJECT_ERROR] Failed to scrape project ${project}.`, error);
  });

  // 3. Start the scraping process
  // This will loop through all projects defined in your .env file.
  await scraper.scrapeProjects();

  // 4. The scraper's scrapeProjects() method prints stats at the end.
  console.log('\n✅ All scraping tasks completed.');
}

// Run the main function and catch any top-level unhandled errors
main().catch((error) => {
  console.error('🔥 An unrecoverable fatal error occurred:', error);
  process.exit(1); // Exit with a failure code
});
