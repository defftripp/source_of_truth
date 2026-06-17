# Async Jobs & Workers

Guide for building an async job processing system with the pattern: **Backend → Jobs table → Worker**.

---

## 1. Core Principles

1. **Database as the queue.** Use PostgreSQL as the job queue — no need for Redis/RabbitMQ for most workloads. One less dependency.
2. **Single worker, simple polling.** One worker process polls for new jobs and processes them. No locks, no contention — just pick and execute.
3. **Fail gracefully, retry automatically.** Jobs should retry with backoff on transient errors and only move to FAILED after exhausting all attempts.
4. **Keep it simple.** No distributed locking, no advisory locks, no competing consumers. One worker grabs jobs sequentially, runs them concurrently via asyncio.

---

## 2. Job Table Schema

```sql
CREATE TABLE jobs (
    id              VARCHAR(36) PRIMARY KEY,
    type            VARCHAR(100) NOT NULL,
    status          VARCHAR(50)  NOT NULL DEFAULT 'queued',
    user_id         INTEGER      NOT NULL REFERENCES users(id),
    pipeline_id     VARCHAR(36),

    input_data      JSONB NOT NULL,
    result_data     JSONB,
    error_message   TEXT,

    -- Dependencies
    dependent_on_jobs JSONB,              -- array of job IDs that must complete first

    -- Retry tracking
    retry_count     INTEGER   DEFAULT 0,
    next_retry_at   TIMESTAMP,

    -- Control
    is_active       BOOLEAN   DEFAULT TRUE,

    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at    TIMESTAMP
);

CREATE INDEX idx_jobs_status        ON jobs(status);
CREATE INDEX idx_jobs_user_id       ON jobs(user_id);
CREATE INDEX idx_jobs_pipeline_id   ON jobs(pipeline_id);
CREATE INDEX idx_jobs_next_retry_at ON jobs(next_retry_at);
```

---

## 3. Job Statuses

```
QUEUED ──→ IN_PROGRESS ──→ COMPLETED
                │
                ↓
             FAILED
        (retries exhausted)
```

| Status             | Meaning                                               |
|--------------------|-------------------------------------------------------|
| `QUEUED`           | Created, waiting for worker to pick up                |
| `IN_PROGRESS`      | Being processed by a worker                           |
| `COMPLETED`        | Done successfully                                     |
| `FAILED`           | All retries exhausted                                 |
| `CANCELLED`        | User-initiated cancellation                           |

Optional: `WAITING_APPROVAL` — for pipelines where a human reviews output before proceeding.

---

## 4. Worker Loop

**Responsibility:** `QUEUED` → `IN_PROGRESS` → `COMPLETED` or retry

```
loop:
  1. SELECT oldest QUEUED job where dependencies are met and retry time has passed
  2. UPDATE status = IN_PROGRESS
  3. Dispatch to processor by job.type
  4. On success:
     → Write result_data, set status = COMPLETED
     → Create next pipeline jobs if any
  5. On error:
     → Increment retry_count
     → Set next_retry_at based on backoff schedule
     → Set status = QUEUED (will be re-picked after delay)
     → If retries exhausted: set FAILED, alert admins
  6. Sleep(poll_interval)
```

Key points:
- Single worker process — no need for locking or contention handling.
- Run up to `MAX_CONCURRENT_JOBS` asyncio tasks in parallel within that single worker.
- Each processor is a standalone class/function selected by `job.type`.
- Keep `is_active` check — if user cancels mid-flight, stop early.

---

## 5. Job Picking Query

```sql
SELECT *
FROM jobs
WHERE status = 'queued'
  AND is_active = TRUE
  AND (next_retry_at IS NULL OR next_retry_at <= NOW())
  AND (
      dependent_on_jobs IS NULL
      OR NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(dependent_on_jobs) AS dep_id
          WHERE NOT EXISTS (
              SELECT 1 FROM jobs d WHERE d.id = dep_id AND d.status = 'completed'
          )
      )
  )
ORDER BY created_at ASC
LIMIT 1;
```

Then immediately update the picked job:

```sql
UPDATE jobs SET status = 'in_progress', updated_at = NOW() WHERE id = :job_id;
```

Simple two-step: select, then update. Single worker — no race conditions to worry about.

---

## 6. Retry Strategy

Use exponential backoff with a ceiling:

```python
RETRY_INTERVALS = [10, 30, 60, 120, 240, 240, 240, 240, 240, 240]  # seconds
MAX_RETRIES = len(RETRY_INTERVALS)  # 10

def get_next_retry_at(retry_count: int) -> datetime:
    if retry_count >= MAX_RETRIES:
        return None  # exhausted
    delay = RETRY_INTERVALS[retry_count]
    return datetime.utcnow() + timedelta(seconds=delay)
```

On failure:
1. Set `retry_count += 1`
2. Set `next_retry_at = get_next_retry_at(retry_count)`
3. Set `status = 'queued'` (back to pick-up pool)
4. Store error in `error_message` for debugging
5. If `retry_count >= MAX_RETRIES` → mark `FAILED`, send admin alert

Make retry intervals configurable via env var (`JOB_RETRY_INTERVALS=10,30,60,...`).

---

## 7. Pipelines (Multi-Stage Jobs)

For workflows that span multiple sequential stages:

1. Group jobs by `pipeline_id`.
2. Each stage is a separate job row with its own `type`.
3. Use `dependent_on_jobs` (JSON array of job IDs) to express ordering.
4. The job-picking query checks that all dependencies are `COMPLETED` before picking.
5. When a processor finishes, it creates the next stage's jobs as `QUEUED`.

```
Pipeline: "Generate Video"
  Job 1: SCRIPT_GENERATION        → depends on: nothing
  Job 2: VOICE_SYNTHESIS          → depends on: [Job 1]
  Job 3: IMAGE_GENERATION         → depends on: [Job 1]
  Job 4: VIDEO_GENERATION         → depends on: [Job 2, Job 3]
  Job 5: COMPOSITING              → depends on: [Job 4]
```

This allows parallel execution of independent stages (Job 2 and Job 3 run concurrently).

---

## 8. Processor Pattern

Each job type maps to a processor class:

```python
PROCESSOR_MAP: dict[str, type[BaseProcessor]] = {
    "script_generation": ScriptGenerationProcessor,
    "image_generation": ImageGenerationProcessor,
    "video_generation": VideoGenerationProcessor,
    # ...
}

class BaseProcessor:
    async def process(self, job: Job) -> ProcessorResult:
        raise NotImplementedError

class ProcessorResult:
    result_data: dict           # stored in jobs.result_data
    next_jobs: list[JobCreate]  # pipeline continuation (optional)
```

Keep processors stateless. All input comes from `job.input_data`, all output goes to `result_data`.

---

## 9. Frontend Integration

### 9.1 Job creation

```
POST /api/jobs
  → validates input
  → inserts job with status=QUEUED
  → returns job_id immediately
```

### 9.2 Status polling

```
GET /api/jobs/{job_id}
  → returns current status, result_data, error_message
```

Frontend polls every 2 seconds until terminal status (`COMPLETED`, `FAILED`, `CANCELLED`).

### 9.3 Pipeline view

For multi-stage pipelines, show progress as a step indicator:
- Which stages are done, in progress, or pending.
- Allow the user to inspect intermediate results.
- If approval is required, show approve/reject/retry controls.

---

## 10. Configuration

```env
JOB_PROCESSOR_POLL_INTERVAL=0.1    # seconds between polls
MAX_CONCURRENT_JOBS=10             # parallel processing tasks
JOB_RETRY_INTERVALS=10,30,60,120,240,240,240,240,240,240
DB_POOL_SIZE=20
```

---

## 11. Checklist for New Projects

- [ ] Create `jobs` table with status, retry, and dependency columns
- [ ] Define job status enum
- [ ] Implement job picking query (SELECT + UPDATE status)
- [ ] Build worker loop (poll + dispatch + execute)
- [ ] Implement retry with exponential backoff
- [ ] Add processor base class and type→processor map
- [ ] Support `dependent_on_jobs` for pipeline ordering
- [ ] Add `is_active` flag for user cancellation
- [ ] Create job status API endpoint for frontend polling
- [ ] Send admin alerts on failure (Telegram, Slack, etc.)
- [ ] Make poll interval, concurrency, and retry schedule configurable via env
