import Queue, { Job, JobOptions } from 'bull';
import { EventEmitter } from 'events';

interface ScrapeJob {
  project: string;
  startAt: number;
  maxResults: number;
}

interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  concurrency: number;
  attempts: number;
  backoff: {
    type: 'exponential';
    delay: number;
  };
}

export class QueueManager extends EventEmitter {
  private queue: Queue.Queue<ScrapeJob>;
  private config: QueueConfig;

  constructor(config: Partial<QueueConfig> = {}) {
    super();
    
    this.config = {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
      },
      concurrency: parseInt(process.env.QUEUE_CONCURRENCY || '5'),
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      ...config,
    };

    this.queue = new Queue<ScrapeJob>('jira-scraper', {
      redis: this.config.redis,
      defaultJobOptions: {
        attempts: this.config.attempts,
        backoff: this.config.backoff,
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.queue.on('completed', (job: Job<ScrapeJob>) => {
      console.log(`✓ Job ${job.id} completed: ${job.data.project}`);
      this.emit('job-completed', job.data);
    });

    this.queue.on('failed', (job: Job<ScrapeJob>, err: Error) => {
      console.error(`✗ Job ${job.id} failed: ${err.message}`);
      this.emit('job-failed', { job: job.data, error: err });
    });

    this.queue.on('stalled', (job: Job<ScrapeJob>) => {
      console.warn(`⚠ Job ${job.id} stalled`);
      this.emit('job-stalled', job.data);
    });

    this.queue.on('progress', (job: Job<ScrapeJob>, progress: number) => {
      console.log(`Job ${job.id} progress: ${progress}%`);
    });
  }

  async addJob(data: ScrapeJob, options?: JobOptions): Promise<Job<ScrapeJob>> {
    return this.queue.add(data, {
      jobId: `${data.project}-${data.startAt}`,
      ...options,
    });
  }

  async addBulkJobs(jobs: ScrapeJob[]): Promise<Job<ScrapeJob>[]> {
    return this.queue.addBulk(
      jobs.map(data => ({
        data,
        opts: {
          jobId: `${data.project}-${data.startAt}`,
        },
      }))
    );
  }

  process(handler: (job: Job<ScrapeJob>) => Promise<void>): void {
    this.queue.process(this.config.concurrency, async (job: Job<ScrapeJob>) => {
      try {
        await handler(job);
      } catch (error) {
        throw error; // Bull will handle retry
      }
    });
  }

  async getJobCounts() {
    return this.queue.getJobCounts();
  }

  async clean(grace: number = 0, status: 'completed' | 'failed' = 'completed'): Promise<void> {
    await this.queue.clean(grace, status);
  }

  async pause(): Promise<void> {
    await this.queue.pause();
  }

  async resume(): Promise<void> {
    await this.queue.resume();
  }

  async close(): Promise<void> {
    await this.queue.close();
  }

  getQueue(): Queue.Queue<ScrapeJob> {
    return this.queue;
  }
}
