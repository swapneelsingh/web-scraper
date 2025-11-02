import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import pLimit from 'p-limit';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { appendFile, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: string;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string };
    reporter?: { displayName: string };
    created: string;
    updated: string;
    labels: string[];
    issuetype: { name: string };
    project: { key: string; name: string };
    comment?: {
      comments: Array<{
        author: { displayName: string };
        body: string;
        created: string;
      }>;
    };
  };
}

interface JiraApiResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

interface ScraperConfig {
  jiraBaseUrl: string;
  projects: string[];
  maxConcurrent: number;
  maxResults: number;
  requestTimeout: number;
  outputDir: string;
  checkpointDir: string;
  rateLimitDelay: number;
}

interface Checkpoint {
  project: string;
  lastProcessedIndex: number;
  totalIssues: number;
  completed: boolean;
  timestamp: string;
}

interface LLMTrainingData {
  id: string;
  project: string;
  metadata: {
    key: string;
    title: string;
    status: string;
    priority?: string;
    assignee?: string;
    reporter?: string;
    created: string;
    updated: string;
    labels: string[];
    issueType: string;
  };
  content: {
    description: string;
    comments: Array<{
      author: string;
      text: string;
      timestamp: string;
    }>;
  };
  tasks: {
    summarization: {
      instruction: string;
      input: string;
      output: string;
    };
    classification: {
      instruction: string;
      input: string;
      output: string;
    };
    qna: Array<{
      question: string;
      answer: string;
    }>;
  };
}

export class JiraScraper extends EventEmitter {
  private client: AxiosInstance;
  private config: ScraperConfig;
  private limiter: ReturnType<typeof pLimit>;
  private stats = {
    totalIssues: 0,
    successfulScrapes: 0,
    failedScrapes: 0,
    retriedRequests: 0,
  };

  constructor(config: Partial<ScraperConfig> = {}) {
    super();

    this.config = {
      jiraBaseUrl: 'https://issues.apache.org/jira',
      projects: ['HADOOP', 'KAFKA', 'SPARK'],
      maxConcurrent: 5,
      maxResults: 100,
      requestTimeout: 30000,
      outputDir: './output',
      checkpointDir: './checkpoints',
      rateLimitDelay: 1000,
      ...config,
    };

    // Initialize directories
    [this.config.outputDir, this.config.checkpointDir].forEach((dir) => {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    });

    // Configure axios with retry logic
    this.client = axios.create({
      baseURL: this.config.jiraBaseUrl,
      timeout: this.config.requestTimeout,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Academic-Research-Bot/1.0',
      },
    });

    // Exponential backoff retry strategy
    axiosRetry(this.client, {
      retries: 5,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: (error: AxiosError) => {
        this.stats.retriedRequests++;
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429 ||
          (error.response?.status ?? 0) >= 500
        );
      },
      onRetry: (retryCount, error) => {
        this.emit('retry', { retryCount, error: error.message });
        console.log(`Retry attempt ${retryCount} for ${error.config?.url}`);
      },
    });

    this.limiter = pLimit(this.config.maxConcurrent);
  }

  async scrapeProjects(): Promise<void> {
    console.log(`Starting scrape for projects: ${this.config.projects.join(', ')}`);

    for (const project of this.config.projects) {
      try {
        await this.scrapeProject(project);
      } catch (error) {
        console.error(`Failed to scrape project ${project}:`, error);
        this.emit('project-error', { project, error });
      }
    }

    this.printStats();
  }

  private async scrapeProject(projectKey: string): Promise<void> {
    console.log(`\n🚀 Starting scrape for project: ${projectKey}`);

    const checkpoint = await this.loadCheckpoint(projectKey);
    const outputFile = path.join(this.config.outputDir, `${projectKey}.jsonl`);

    if (checkpoint.completed) {
      console.log(`✓ Project ${projectKey} already completed. Skipping.`);
      return;
    }

    let startAt = checkpoint.lastProcessedIndex;
    let totalIssues = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const response = await this.fetchIssues(projectKey, startAt);

        if (!response || !response.issues || response.issues.length === 0) {
          hasMore = false;
          break;
        }

        totalIssues = response.total;
        const issues = response.issues;

        // Process issues concurrently with rate limiting
        const processedData = await Promise.all(
          issues.map((issue) => this.limiter(() => this.processIssue(issue))),
        );

        // Write to JSONL file
        for (const data of processedData) {
          if (data) {
            await appendFile(outputFile, JSON.stringify(data) + '\n');
            this.stats.successfulScrapes++;
          } else {
            this.stats.failedScrapes++;
          }
        }

        startAt += issues.length;

        // Save checkpoint
        await this.saveCheckpoint({
          project: projectKey,
          lastProcessedIndex: startAt,
          totalIssues,
          completed: startAt >= totalIssues,
          timestamp: new Date().toISOString(),
        });

        console.log(`Processed ${startAt}/${totalIssues} issues for ${projectKey}`);

        hasMore = startAt < totalIssues;

        // Rate limiting delay
        if (hasMore) {
          await this.delay(this.config.rateLimitDelay);
        }
      } catch (error) {
        console.error(`Error processing batch at ${startAt}:`, error);
        throw error;
      }
    }

    console.log(`✓ Completed scraping ${projectKey}: ${totalIssues} issues`);
  }

  private async fetchIssues(projectKey: string, startAt: number): Promise<JiraApiResponse> {
    try {
      const response = await this.client.get('/rest/api/2/search', {
        params: {
          jql: `project = ${projectKey} ORDER BY created DESC`,
          startAt,
          maxResults: this.config.maxResults,
          fields:
            'summary,description,status,priority,assignee,reporter,created,updated,labels,issuetype,project,comment',
        },
      });

      this.emit('fetch-success', {
        project: projectKey,
        startAt,
        count: response.data.issues.length,
      });
      return response.data;
    } catch (error) {
      this.handleFetchError(error as AxiosError, projectKey, startAt);
      throw error;
    }
  }

  private async processIssue(issue: JiraIssue): Promise<LLMTrainingData | null> {
    try {
      const description = this.stripHtmlTags(issue.fields.description || '');
      const comments = (issue.fields.comment?.comments || []).map((c) => ({
        author: c.author.displayName,
        text: this.stripHtmlTags(c.body),
        timestamp: c.created,
      }));

      const fullContext = `${description}\n\n${comments.map((c) => c.text).join('\n')}`;

      const trainingData: LLMTrainingData = {
        id: issue.id,
        project: issue.fields.project.key,
        metadata: {
          key: issue.key,
          title: issue.fields.summary,
          status: issue.fields.status.name,
          priority: issue.fields.priority?.name,
          assignee: issue.fields.assignee?.displayName,
          reporter: issue.fields.reporter?.displayName,
          created: issue.fields.created,
          updated: issue.fields.updated,
          labels: issue.fields.labels,
          issueType: issue.fields.issuetype.name,
        },
        content: {
          description,
          comments,
        },
        tasks: this.generateTasks(issue, description, fullContext),
      };

      this.stats.totalIssues++;
      return trainingData;
    } catch (error) {
      console.error(`Error processing issue ${issue.key}:`, error);
      return null;
    }
  }

  private generateTasks(issue: JiraIssue, description: string, fullContext: string) {
    return {
      summarization: {
        instruction: 'Summarize the following Jira issue in 2-3 sentences.',
        input: fullContext,
        output: `${issue.fields.summary}. Status: ${issue.fields.status.name}. ${description.substring(0, 200)}...`,
      },
      classification: {
        instruction: 'Classify the type and priority of this issue.',
        input: fullContext,
        output: `Type: ${issue.fields.issuetype.name}, Priority: ${issue.fields.priority?.name || 'Not specified'}`,
      },
      qna: [
        {
          question: `What is the status of ${issue.key}?`,
          answer: issue.fields.status.name,
        },
        {
          question: `What is ${issue.key} about?`,
          answer: issue.fields.summary,
        },
        {
          question: `Who reported ${issue.key}?`,
          answer: issue.fields.reporter?.displayName || 'Unknown',
        },
      ],
    };
  }

  //   private stripHtmlTags(html: string): string {
  //     return html
  //       .replace(/<[^>]*>/g, '')
  //       .replace(/&nbsp;/g, ' ')
  //       .replace(/&amp;/g, '&')
  //       .replace(/&lt;/g, '<')
  //       .replace(/&gt;/g, '>')
  //       .replace(/&quot;/g, '"')
  //       .trim();
  //   }

  private stripHtmlTags(html: string): string {
    // FIX 2: Add null check at the start
    if (!html) {
      return '';
    }

    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .trim();
  }

  private handleFetchError(error: AxiosError, project: string, startAt: number): void {
    if (error.response) {
      const status = error.response.status;
      console.error(`HTTP ${status} error for ${project} at ${startAt}`);

      if (status === 429) {
        console.log('Rate limit hit. Waiting before retry...');
      } else if (status >= 500) {
        console.log('Server error. Will retry...');
      }
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Request setup error:', error.message);
    }

    this.emit('error', { error, project, startAt });
  }

  private async loadCheckpoint(project: string): Promise<Checkpoint> {
    const checkpointFile = path.join(this.config.checkpointDir, `${project}.json`);

    if (existsSync(checkpointFile)) {
      const data = await readFile(checkpointFile, 'utf-8');
      return JSON.parse(data);
    }

    return {
      project,
      lastProcessedIndex: 0,
      totalIssues: 0,
      completed: false,
      timestamp: new Date().toISOString(),
    };
  }

  private async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
    const checkpointFile = path.join(this.config.checkpointDir, `${checkpoint.project}.json`);
    await writeFile(checkpointFile, JSON.stringify(checkpoint, null, 2));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private printStats(): void {
    console.log('\n📊 Scraping Statistics:');
    console.log(`Total Issues: ${this.stats.totalIssues}`);
    console.log(`Successful: ${this.stats.successfulScrapes}`);
    console.log(`Failed: ${this.stats.failedScrapes}`);
    console.log(`Retried Requests: ${this.stats.retriedRequests}`);
  }

  getStats() {
    return { ...this.stats };
  }
}
