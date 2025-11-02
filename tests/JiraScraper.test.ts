import { JiraScraper } from '../src/scraper/JiraScraper';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';
import MockAdapter from 'axios-mock-adapter';

describe('JiraScraper', () => {
  let scraper: JiraScraper;

  beforeEach(() => {
    scraper = new JiraScraper({
      projects: ['TEST'],
      maxConcurrent: 2,
      maxResults: 10,
      outputDir: './test-output',
      checkpointDir: './test-checkpoints',
    });
  });

  afterEach(async () => {
    // Cleanup test directories
    if (existsSync('./test-output')) {
      await rm('./test-output', { recursive: true });
    }
    if (existsSync('./test-checkpoints')) {
      await rm('./test-checkpoints', { recursive: true });
    }
  });

  describe('initialization', () => {
    it('should create output and checkpoint directories', () => {
      expect(existsSync('./test-output')).toBe(true);
      expect(existsSync('./test-checkpoints')).toBe(true);
    });

    it('should initialize with default config', () => {
      const defaultScraper = new JiraScraper();
      expect(defaultScraper).toBeDefined();
    });
  });

  describe('HTML stripping', () => {
    it('should remove HTML tags from description', () => {
      const html = '<p>This is <strong>bold</strong> text</p>';
      // @ts-ignore - accessing private method for testing
      const stripped = scraper.stripHtmlTags(html);
      expect(stripped).toBe('This is bold text');
    });

    it('should handle empty or null descriptions', () => {
      // @ts-ignore
      expect(scraper.stripHtmlTags('')).toBe('');
      // @ts-ignore
      expect(scraper.stripHtmlTags(null)).toBe('');
    });

    it('should decode HTML entities', () => {
      const html = 'Test &amp; &lt;tag&gt; &quot;quotes&quot;';
      // @ts-ignore
      const stripped = scraper.stripHtmlTags(html);
      expect(stripped).toBe('Test & <tag> "quotes"');
    });
  });

  describe('checkpoint system', () => {
    it('should save and load checkpoints', async () => {
      const checkpoint = {
        project: 'TEST',
        lastProcessedIndex: 100,
        totalIssues: 1000,
        completed: false,
        timestamp: new Date().toISOString(),
      };

      // @ts-ignore
      await scraper.saveCheckpoint(checkpoint);
      // @ts-ignore
      const loaded = await scraper.loadCheckpoint('TEST');

      expect(loaded.project).toBe(checkpoint.project);
      expect(loaded.lastProcessedIndex).toBe(checkpoint.lastProcessedIndex);
      expect(loaded.totalIssues).toBe(checkpoint.totalIssues);
    });

    it('should return default checkpoint if not exists', async () => {
      // @ts-ignore
      const checkpoint = await scraper.loadCheckpoint('NONEXISTENT');
      expect(checkpoint.lastProcessedIndex).toBe(0);
      expect(checkpoint.completed).toBe(false);
    });
  });

  describe('task generation', () => {
    it('should generate LLM training tasks', () => {
      const mockIssue = {
        id: '12345',
        key: 'TEST-123',
        fields: {
          summary: 'Test issue',
          description: 'This is a test',
          status: { name: 'Open' },
          priority: { name: 'High' },
          reporter: { displayName: 'John Doe' },
          created: '2024-01-01T00:00:00.000Z',
          updated: '2024-01-02T00:00:00.000Z',
          labels: ['test'],
          issuetype: { name: 'Bug' },
          project: { key: 'TEST', name: 'Test Project' },
        },
      };

      // @ts-ignore
      const tasks = scraper.generateTasks(mockIssue, 'This is a test', 'This is a test');

      expect(tasks.summarization).toBeDefined();
      expect(tasks.classification).toBeDefined();
      expect(tasks.qna).toHaveLength(3);
      expect(tasks.qna[0].question).toContain('TEST-123');
    });
  });

  describe('error handling', () => {
    it('should emit retry events on failure', async () => {
      // Create a new scraper instance for this test
      const testScraper = new JiraScraper({
        projects: ['TEST'],
        maxConcurrent: 1,
        maxResults: 10,
        outputDir: './test-output',
        checkpointDir: './test-checkpoints',
        jiraBaseUrl: 'https://test-jira.example.com',
      });

      // Get the axios instance from the scraper
      // @ts-ignore - accessing private property
      const mock = new MockAdapter(testScraper.client);

      // Mock the first request to fail, then succeed immediately
      mock
        .onGet('/rest/api/2/search')
        .replyOnce(500) // First attempt fails
        .onGet('/rest/api/2/search')
        .reply(200, {
          startAt: 0,
          maxResults: 10,
          total: 0,
          issues: [],
        });

      let retryDetected = false;

      // Listen for retry event
      testScraper.on('retry', ({ retryCount }) => {
        expect(retryCount).toBeGreaterThan(0);
        retryDetected = true;
      });

      // Trigger the scrape which will fail and retry once
      await testScraper.scrapeProjects();

      mock.restore();
      expect(retryDetected).toBe(true);
    }, 10000);

    it('should handle rate limit errors (429)', async () => {
      const testScraper = new JiraScraper({
        projects: ['TEST'],
        outputDir: './test-output',
        checkpointDir: './test-checkpoints',
        jiraBaseUrl: 'https://test-jira.example.com',
      });

      // @ts-ignore
      const mock = new MockAdapter(testScraper.client);

      // Mock rate limit response, then success
      mock
        .onGet('/rest/api/2/search')
        .replyOnce(429, { errorMessages: ['Rate limit exceeded'] })
        .onGet('/rest/api/2/search')
        .reply(200, {
          startAt: 0,
          maxResults: 10,
          total: 0,
          issues: [],
        });

      await testScraper.scrapeProjects();

      mock.restore();

      const stats = testScraper.getStats();
      expect(stats.retriedRequests).toBeGreaterThan(0);
    }, 10000);

    it('should handle server errors (500)', async () => {
      const testScraper = new JiraScraper({
        projects: ['TEST'],
        outputDir: './test-output',
        checkpointDir: './test-checkpoints',
        jiraBaseUrl: 'https://test-jira.example.com',
      });

      // @ts-ignore
      const mock = new MockAdapter(testScraper.client);

      // Mock server error, then success
      mock
        .onGet('/rest/api/2/search')
        .replyOnce(500, { errorMessages: ['Internal server error'] })
        .onGet('/rest/api/2/search')
        .reply(200, {
          startAt: 0,
          maxResults: 10,
          total: 0,
          issues: [],
        });

      await testScraper.scrapeProjects();

      mock.restore();

      const stats = testScraper.getStats();
      expect(stats.retriedRequests).toBeGreaterThan(0);
    }, 10000);
  });

  describe('statistics', () => {
    it('should track scraping statistics', () => {
      const stats = scraper.getStats();
      expect(stats).toHaveProperty('totalIssues');
      expect(stats).toHaveProperty('successfulScrapes');
      expect(stats).toHaveProperty('failedScrapes');
      expect(stats).toHaveProperty('retriedRequests');
    });
  });
});

describe('Edge Cases', () => {
  let scraper: JiraScraper;

  beforeEach(() => {
    scraper = new JiraScraper({
      outputDir: './test-output',
      checkpointDir: './test-checkpoints',
    });
  });

  afterEach(async () => {
    if (existsSync('./test-output')) {
      await rm('./test-output', { recursive: true });
    }
    if (existsSync('./test-checkpoints')) {
      await rm('./test-checkpoints', { recursive: true });
    }
  });

  it('should handle issues with no comments', async () => {
    const mockIssue = {
      id: '1',
      key: 'TEST-1',
      fields: {
        summary: 'Test',
        description: 'Test description',
        status: { name: 'Open' },
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        labels: [],
        issuetype: { name: 'Bug' },
        project: { key: 'TEST', name: 'Test' },
        comment: { comments: [] },
      },
    };

    // @ts-ignore
    const result = await scraper.processIssue(mockIssue);
    expect(result).not.toBeNull();
    expect(result?.content.comments).toHaveLength(0);
  });

  it('should handle issues with missing optional fields', async () => {
    const mockIssue = {
      id: '1',
      key: 'TEST-1',
      fields: {
        summary: 'Test',
        status: { name: 'Open' },
        created: '2024-01-01T00:00:00.000Z',
        updated: '2024-01-01T00:00:00.000Z',
        labels: [],
        issuetype: { name: 'Bug' },
        project: { key: 'TEST', name: 'Test' },
      },
    };

    // @ts-ignore
    const result = await scraper.processIssue(mockIssue);
    expect(result).not.toBeNull();
    expect(result?.metadata.priority).toBeUndefined();
    expect(result?.metadata.assignee).toBeUndefined();
  });
});
