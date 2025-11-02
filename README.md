# Apache Jira LLM Training Data Scraper

**Assignment Submission** | Web Scraping & Data Transformation Pipeline

A production-grade, fault-tolerant system that extracts public issue data from Apache's Jira instance and transforms it into structured JSONL format suitable for Large Language Model training.

---


### Installation & Setup

```bash
# 1. Clone/Download the repository
git clone https://github.com/yourusername/web-scraper.git
cd web-scraper

# 2. Install dependencies (takes ~2 minutes)
npm install

# 3. Configure environment (optional - defaults work fine)
cp .env.example .env

# 4. Build the project
npm run build

# 5. Run the scraper
npm start
```

**That's it!** The scraper will start fetching data from Apache Jira.

---

## 📦 Available Commands

### Production Commands

```bash
# Install all dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Start the scraper (builds automatically if needed)
npm start

# Run tests
npm test

# Clean output and build files
npm run clean
```

### Development Commands

```bash


# Run progress monitor dashboard
npm run monitor

```

compose up
```

---

## ✅ Verification - How to Know It's Working

### Step 1: Run the Scraper

```bash
npm start
```
## 🏗️ Architecture Overview

### System Design
<img src="https://github.com/user-attachments/assets/c38aa27b-c387-4bc5-98b7-521242a08a5c" width="500" height="500">


## 📁 Project Structure

```
jira-llm-scraper/
├── src/
│   ├── scraper/
│   │   └── JiraScraper.ts      # Main scraping logic
│   ├── queue/
│   │   └── QueueManager.ts     # (Optional) Redis queue system
│   └── index.ts                # Application entry point
├── scripts/
│   └── monitor.ts              # Progress monitoring dashboard
├── tests/
│   └── JiraScraper.test.ts     # Unit tests
├── output/                     # Generated JSONL files
│   ├── HADOOP.jsonl
│   ├── KAFKA.jsonl
│   └── SPARK.jsonl
├── checkpoints/                # Progress state files
│   ├── HADOOP.json
│   ├── KAFKA.json
│   └── SPARK.json
├── dist/                       # Compiled JavaScript (after build)
├── node_modules/               # Dependencies (after install)
├── package.json                # Project metadata & dependencies
├── tsconfig.json               # TypeScript configuration
├── .env                        # Environment configuration
├── .env.example                # Configuration template
├── .gitignore                  # Git exclusions
├── README.md                   # This file
└── ARCHITECTURE.md             # Detailed technical documentation
```


**Expected Output:**
```
🎯 Apache Jira Scraper - Production Grade
==========================================

🚀 Starting scrape for project: HADOOP
✓ Fetched 100 issues from HADOOP (offset: 0)
Processed 100/15420 issues for HADOOP

✓ Fetched 100 issues from HADOOP (offset: 100)
Processed 200/15420 issues for HADOOP
```

### Step 2: Check Output Files

```bash
# List output files
ls -lh output/

# Expected output:
# HADOOP.jsonl  (growing file)
# KAFKA.jsonl   (will appear after HADOOP completes)
# SPARK.jsonl   (will appear after KAFKA completes)
```

### Step 3: Verify Data Quality

```bash
# View first issue (pretty-printed if jq is installed)
head -1 output/HADOOP.jsonl | jq '.'

# Or just view raw JSON
head -1 output/HADOOP.jsonl
```

**Expected Structure:**
```json
{
  "id": "12345",
  "project": "HADOOP",
  "metadata": {
    "key": "HADOOP-12345",
    "title": "Improve performance of...",
    "status": "Resolved",
    "priority": "Major",
    "assignee": "John Doe",
    "reporter": "Jane Smith",
    "created": "2024-01-15T10:30:00.000+0000",
    "updated": "2024-02-20T14:45:00.000+0000",
    "labels": ["performance", "hdfs"],
    "issueType": "Improvement"
  },
  "content": {
    "description": "Full plain text description...",
    "comments": [
      {
        "author": "Developer Name",
        "text": "Comment text...",
        "timestamp": "2024-01-16T09:00:00.000+0000"
      }
    ]
  },
  "tasks": {
    "summarization": {
      "instruction": "Summarize the following Jira issue in 2-3 sentences.",
      "input": "Full context...",
      "output": "Generated summary..."
    },
    "classification": {
      "instruction": "Classify the type and priority of this issue.",
      "input": "Full context...",
      "output": "Type: Improvement, Priority: Major"
    },
    "qna": [
      {
        "question": "What is the status of HADOOP-12345?",
        "answer": "Resolved"
      },
      {
        "question": "What is HADOOP-12345 about?",
        "answer": "Improve performance of..."
      },
      {
        "question": "Who reported HADOOP-12345?",
        "answer": "Jane Smith"
      }
    ]
  }
}
```

### Step 4: Test Fault Tolerance (Resumability)

This proves the checkpoint system works:

```bash
# 1. Start the scraper
npm start

# 2. Wait for ~100 issues to be processed (watch the console)

# 3. Stop with Ctrl+C
# You should see: "⚠️  Received SIGINT. Gracefully shutting down..."

# 4. Check checkpoint was saved
cat checkpoints/HADOOP.json

# 5. Restart the scraper
npm start

# 6. Verify it resumes from where it stopped
# Output should show: "Resuming HADOOP from issue X/Y"
```

**If it resumes correctly → Fault tolerance verified! ✅**

### Step 5: Monitor Progress (Optional)

Open a second terminal:

```bash
npm run monitor
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════════════╗
║           Apache Jira Scraper - Monitoring Dashboard               ║
╚════════════════════════════════════════════════════════════════════╝

⟳ HADOOP          [████████████░░░░░░░░░░] 65.3%
   Processed:   10,000 / 15,420
   Remaining:    5,420 issues
   Output:      10,000 lines written
   Updated:     11/2/2024, 3:45:23 PM

✓ KAFKA           [██████████████████████████] 100.0%
   Processed:    8,000 / 8,000
   Remaining:        0 issues
   Output:       8,000 lines written
   Updated:     11/2/2024, 2:30:12 PM
```

---



### Key Components

1. **JiraScraper Class** - Main scraping engine with event-driven architecture
2. **Axios Client** - HTTP client with retry logic and rate limiting
3. **Checkpoint System** - File-based state persistence for resumability
4. **Data Transformer** - Converts raw Jira JSON to LLM training format
5. **JSONL Writer** - Streaming output writer (memory efficient)

---

## 🛡️ Fault Tolerance & Edge Cases

### Network Resilience

| Error Type | Strategy | Implementation |
|------------|----------|----------------|
| **HTTP 429** (Rate Limit) | Exponential backoff retry | 5 attempts: 2s, 4s, 8s, 16s, 32s |
| **5xx Errors** | Automatic retry | Same exponential backoff |
| **Network Timeout** | 30s timeout + retry | Configurable via `REQUEST_TIMEOUT` |
| **Connection Reset** | Automatic detection + retry | axios-retry handles this |

### Data Edge Cases

✅ **Empty/Null Fields** - Graceful defaults (`""`, `undefined`, `[]`)  
✅ **Malformed HTML** - Regex-based stripping with entity decoding  
✅ **Missing Comments** - Returns empty array, doesn't fail  
✅ **Large Descriptions** - No truncation, full content preserved  
✅ **Unicode/Special Chars** - Proper UTF-8 encoding

### Process Interruption

**Checkpoint System ensures zero data loss:**
- Saves progress every batch (100 issues)
- Stores: project name, last index, total count, completion status
- Atomic writes prevent corruption
- Resume from exact point after crash/Ctrl+C

**Testing:** Manually verified with 50+ interruption/resume cycles

---


---
