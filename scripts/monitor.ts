import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

interface Checkpoint {
  project: string;
  lastProcessedIndex: number;
  totalIssues: number;
  completed: boolean;
  timestamp: string;
}

interface Stats {
  project: string;
  progress: number;
  processed: number;
  total: number;
  remaining: number;
  status: 'in-progress' | 'completed' | 'not-started';
  lastUpdate: string;
  linesInOutput: number;
  estimatedCompletion?: string;
}

async function loadCheckpoint(project: string): Promise<Checkpoint | null> {
  const checkpointPath = path.join('./checkpoints', `${project}.json`);
  
  if (!existsSync(checkpointPath)) {
    return null;
  }

  const data = await readFile(checkpointPath, 'utf-8');
  return JSON.parse(data);
}

function countOutputLines(project: string): number {
  const outputPath = path.join('./output', `${project}.jsonl`);
  
  if (!existsSync(outputPath)) {
    return 0;
  }

  try {
    const result = execSync(`wc -l < ${outputPath}`, { encoding: 'utf-8' });
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

function estimateCompletion(processed: number, total: number, startTime: Date): string {
  if (processed === 0) return 'Unknown';
  
  const elapsed = Date.now() - startTime.getTime();
  const rate = processed / elapsed; // issues per ms
  const remaining = total - processed;
  const estimatedMs = remaining / rate;
  
  const minutes = Math.floor(estimatedMs / 60000);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `~${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `~${minutes}m`;
  } else {
    return '<1m';
  }
}

async function getProjectStats(project: string): Promise<Stats> {
  const checkpoint = await loadCheckpoint(project);
  const linesInOutput = countOutputLines(project);

  if (!checkpoint) {
    return {
      project,
      progress: 0,
      processed: 0,
      total: 0,
      remaining: 0,
      status: 'not-started',
      lastUpdate: 'Never',
      linesInOutput,
    };
  }

  const progress = checkpoint.totalIssues > 0 
    ? (checkpoint.lastProcessedIndex / checkpoint.totalIssues) * 100 
    : 0;

  return {
    project,
    progress: Math.round(progress * 10) / 10,
    processed: checkpoint.lastProcessedIndex,
    total: checkpoint.totalIssues,
    remaining: checkpoint.totalIssues - checkpoint.lastProcessedIndex,
    status: checkpoint.completed ? 'completed' : 'in-progress',
    lastUpdate: new Date(checkpoint.timestamp).toLocaleString(),
    linesInOutput,
  };
}

function renderProgressBar(progress: number, width: number = 30): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return `[${'█'.repeat(filled)}${' '.repeat(empty)}]`;
}

function formatNumber(num: number): string {
  return num.toLocaleString();
}

async function displayDashboard(projects: string[]): Promise<void> {
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║           Apache Jira Scraper - Monitoring Dashboard               ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  let totalProcessed = 0;
  let totalRemaining = 0;
  let totalIssues = 0;

  for (const project of projects) {
    const stats = await getProjectStats(project);
    
    totalProcessed += stats.processed;
    totalRemaining += stats.remaining;
    totalIssues += stats.total;

    const statusIcon = stats.status === 'completed' ? '✓' : 
                       stats.status === 'in-progress' ? '⟳' : '○';
    
    const statusColor = stats.status === 'completed' ? '\x1b[32m' : 
                        stats.status === 'in-progress' ? '\x1b[33m' : '\x1b[90m';
    
    console.log(`${statusColor}${statusIcon}\x1b[0m ${project.padEnd(15)} ${renderProgressBar(stats.progress)} ${stats.progress.toFixed(1)}%`);
    console.log(`   Processed: ${formatNumber(stats.processed).padStart(8)} / ${formatNumber(stats.total)}`);
    console.log(`   Remaining: ${formatNumber(stats.remaining).padStart(8)} issues`);
    console.log(`   Output:    ${formatNumber(stats.linesInOutput).padStart(8)} lines written`);
    console.log(`   Updated:   ${stats.lastUpdate}`);
    console.log();
  }

  const overallProgress = totalIssues > 0 ? (totalProcessed / totalIssues) * 100 : 0;
  
  console.log('─'.repeat(70));
  console.log(`\n📊 Overall Progress: ${overallProgress.toFixed(1)}%`);
  console.log(`   Total Processed: ${formatNumber(totalProcessed)} / ${formatNumber(totalIssues)}`);
  console.log(`   Total Remaining: ${formatNumber(totalRemaining)} issues\n`);
  
  console.log('─'.repeat(70));
  console.log('Press Ctrl+C to exit monitor\n');
}

async function monitor(projects: string[], intervalMs: number = 5000): Promise<void> {
  // Initial display
  await displayDashboard(projects);

  // Update every intervalMs
  const interval = setInterval(async () => {
    await displayDashboard(projects);
  }, intervalMs);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log('\n👋 Monitoring stopped.');
    process.exit(0);
  });
}

// Main execution
const projects = process.env.JIRA_PROJECTS?.split(',') || ['HADOOP', 'KAFKA', 'SPARK'];
const updateInterval = parseInt(process.env.MONITOR_INTERVAL || '5000');

monitor(projects, updateInterval).catch(console.error);