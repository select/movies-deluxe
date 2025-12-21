# Session Handoff - December 16, 2024

## 🎯 Critical Discovery: OpenCode SDK API Behavior

### The Problem We Solved (Conceptually)

The `session.prompt()` method in OpenCode SDK is **asynchronous and non-blocking**:

- It queues the prompt but returns immediately
- The AI response appears later in `session.messages.list()`
- We need to **poll for the assistant's response**

### Root Cause

```typescript
// ❌ WRONG - Returns before AI responds:
const result = await session.prompt(sessionId, { body: { parts: [...] } })
// result.data is empty, AI hasn't responded yet!

// ✅ CORRECT - Poll messages until assistant responds:
let assistantMessage = null
while (!assistantMessage) {
  const messages = await client.session.messages.list(sessionId)
  assistantMessage = messages.data.find(msg => msg.role === 'assistant')
  if (!assistantMessage) await sleep(1000)
}
```

---

## 📋 Current State

### Completed This Session

1. ✅ Identified OpenCode SDK async behavior
2. ✅ Discovered polling pattern needed
3. ✅ Designed implementation strategy
4. ✅ Created test script structure (`scripts/test-opencode.ts`)
5. ✅ Documented complete solution approach

### Files Status

**Ready for Implementation** (not started):

- `scripts/test-opencode.ts` - Has basic structure, needs polling logic added
- `scripts/utils/aiTitleExtractor.ts` - Needs complete rewrite with polling
- `scripts/extract-titles-ai.ts` - Main CLI, mostly correct, minor updates needed

**Data Files** (unchanged):

- `data/movies.json` - 25 movies waiting for AI extraction
- All have temporary IDs (`archive-*` or `youtube-*`)
- None have AI metadata yet

### Open Beads Tasks

**Active tasks**:

```bash
movies-deluxe-uq0.17 - Implement AI title extraction using OpenCode SDK
  Status: in_progress
  Priority: 1 (high)

movies-deluxe-uq0.19 - Update AIMetadata interface (providerID field)
  Status: in_progress
  Priority: 2 (medium)
```

**Check current status**:

```bash
bd list --status=in_progress
```

---

## 🚀 Next Session: Step-by-Step Plan

### STEP 1: Test Polling Logic (10 minutes)

**Goal**: Verify polling works before implementing in production code.

**Action**: Update `scripts/test-opencode.ts` with polling logic:

```typescript
// scripts/test-opencode.ts
import { createOpencode } from '@opencode-ai/sdk'

async function test() {
  const opencode = await createOpencode({
    hostname: '127.0.0.1',
    port: 4096,
    config: {
      model: 'anthropic/claude-3-5-sonnet-20241022',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
  })

  const client = opencode.client

  // Create session
  const sessionResponse = await client.session.create({
    body: { title: 'Test Session' },
  })
  const sessionId = sessionResponse.data.id
  console.log('Session created:', sessionId)

  // Send prompt
  await client.session.prompt(sessionId, {
    body: {
      parts: [{ text: 'Extract the movie title from: "The Matrix | Free Full Movie"' }],
    },
  })
  console.log('Prompt sent, polling for response...')

  // Poll for assistant response
  let assistantMessage = null
  let attempts = 0
  const maxAttempts = 60

  while (!assistantMessage && attempts < maxAttempts) {
    const messagesResponse = await client.session.messages.list(sessionId)

    assistantMessage = messagesResponse.data.find(msg => msg.role === 'assistant')

    if (assistantMessage) {
      console.log('\n✅ Assistant response received after', attempts + 1, 'attempts')
      console.log('Full message:', JSON.stringify(assistantMessage, null, 2))

      // Extract text
      const textParts = assistantMessage.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join(' ')
        .trim()

      console.log('\n📝 Extracted text:', textParts)
    } else {
      process.stdout.write('.') // Progress indicator
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
  }

  if (!assistantMessage) {
    console.log('\n❌ Timeout: No assistant response after', maxAttempts, 'seconds')
  }

  opencode.server.close()
}

test().catch(console.error)
```

**Run test**:

```bash
pnpm tsx scripts/test-opencode.ts
```

**Expected output**:

```
Session created: 01JGAVHQ...
Prompt sent, polling for response...
.....
✅ Assistant response received after 6 attempts
📝 Extracted text: The Matrix
```

**Success criteria**:

- ✅ Poll loop waits for assistant message
- ✅ Extracts "The Matrix" from response
- ✅ No timeout errors
- ✅ Server closes cleanly

---

### STEP 2: Implement aiTitleExtractor.ts (20 minutes)

**Goal**: Add polling logic to production extraction function.

**Action**: Rewrite `scripts/utils/aiTitleExtractor.ts`:

```typescript
import type { OpencodeClient } from '@opencode-ai/sdk'
import type { AIMetadata } from '../../types/movie.js'
import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const OPENCODE_CONFIG = {
  model: 'anthropic/claude-3-5-sonnet-20241022',
  apiKey: process.env.ANTHROPIC_API_KEY,
}

async function loadPrompt(): Promise<string> {
  const promptPath = path.join(__dirname, '../../prompts/extract-movie-title.md')
  return await fs.readFile(promptPath, 'utf-8')
}

function calculateConfidence(
  extractedTitle: string,
  originalTitle: string
): 'high' | 'medium' | 'low' {
  if (extractedTitle.length < 2) return 'low'
  if (extractedTitle.length > 100) return 'low'
  if (/free|full|movie|hd|720p|1080p/i.test(extractedTitle)) return 'low'
  if (extractedTitle.toLowerCase() === originalTitle.toLowerCase()) return 'low'
  if (/[|<>{}[\]]/.test(extractedTitle)) return 'medium'
  if (extractedTitle.includes('  ')) return 'medium'
  return 'high'
}

export async function extractTitle(
  client: OpencodeClient,
  originalTitle: string
): Promise<AIMetadata> {
  // Create session
  const sessionResponse = await client.session.create({
    body: { title: 'Movie Title Extraction' },
  })
  const sessionId = sessionResponse.data.id

  // Load and prepare prompt
  const promptTemplate = await loadPrompt()
  const prompt = promptTemplate.replace('{title}', originalTitle)

  // Send prompt (non-blocking)
  await client.session.prompt(sessionId, {
    body: { parts: [{ text: prompt }] },
  })

  // Poll for assistant response
  let assistantMessage = null
  let attempts = 0
  const maxAttempts = 60 // 60 seconds timeout

  while (!assistantMessage && attempts < maxAttempts) {
    const messagesResponse = await client.session.messages.list(sessionId)

    assistantMessage = messagesResponse.data.find(msg => msg.role === 'assistant')

    if (!assistantMessage) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
  }

  if (!assistantMessage) {
    throw new Error(`AI response timeout after ${maxAttempts} seconds for title: ${originalTitle}`)
  }

  // Extract text from assistant's response
  const extractedTitle = assistantMessage.content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join(' ')
    .trim()

  const confidence = calculateConfidence(extractedTitle, originalTitle)

  return {
    extractedTitle,
    confidence,
    model: OPENCODE_CONFIG.model,
    providerID: sessionId,
    timestamp: new Date().toISOString(),
  }
}
```

**Verify changes**:

```bash
# Check syntax
pnpm tsc --noEmit

# Should show no errors in aiTitleExtractor.ts
```

---

### STEP 3: Test with Dry Run (5 minutes)

**Goal**: Verify extraction works on sample data without modifying database.

**Action**:

```bash
# Test with 3 movies, verbose output
pnpm extract-titles --dry-run --limit 3 --verbose
```

**Expected output**:

```
🎬 AI Movie Title Extraction
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Statistics:
   Total movies: 25
   Need extraction: 25
   Already extracted: 0

🔍 Processing 3 movies (dry run mode)...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[1/3] Processing: "A Christmas Karen | Free Full Movie | FilmRise Movies"
      Polling for AI response.....
      ✓ Extracted: "A Christmas Karen" (high confidence)
      [Would update in database]

[2/3] Processing: "Charlie Chaplin's \" The Pawnshop\""
      Polling for AI response....
      ✓ Extracted: "The Pawnshop" (high confidence)
      [Would update in database]

[3/3] Processing: "Sherlock Holmes | Free Full Movie"
      Polling for AI response......
      ✓ Extracted: "Sherlock Holmes" (high confidence)
      [Would update in database]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Dry run complete!
   Would extract: 3 titles
   High confidence: 3
   Medium confidence: 0
   Low confidence: 0
```

**Success criteria**:

- ✅ All 3 movies extracted successfully
- ✅ All have "high" confidence
- ✅ Extracted titles are clean (no "Free Full Movie", etc.)
- ✅ No database modifications (dry run)

---

### STEP 4: Run Full Extraction (10 minutes)

**Goal**: Extract all 25 movie titles with high confidence filtering.

**Action**:

```bash
# Extract all movies, only keep high confidence
pnpm extract-titles --min-confidence high

# This will:
# 1. Process all 25 movies
# 2. Extract titles using AI
# 3. Filter to only high confidence results
# 4. Update data/movies.json
```

**Expected results**:

```bash
# Check how many were extracted
rg '"ai":' data/movies.json | wc -l
# Expected: 20-25 (most should be high confidence)

# Check confidence distribution
rg '"confidence": "high"' data/movies.json | wc -l
rg '"confidence": "medium"' data/movies.json | wc -l
rg '"confidence": "low"' data/movies.json | wc -l

# Verify sample extractions
rg -A 5 '"extractedTitle"' data/movies.json | head -20
```

**Success criteria**:

- ✅ 20-25 movies have AI metadata
- ✅ All extracted titles have "high" confidence
- ✅ Titles are clean and properly formatted
- ✅ No crashes or timeouts

---

### STEP 5: Commit and Close Tasks (5 minutes)

**Goal**: Save work and close completed beads tasks.

**Action**:

```bash
# 1. Check what changed
git status

# 2. Stage implementation files
git add scripts/extract-titles-ai.ts
git add scripts/utils/aiTitleExtractor.ts
git add scripts/test-opencode.ts

# 3. Commit implementation
git commit -m "feat(scripts): implement ai title extraction with polling

- Add polling logic to wait for OpenCode SDK assistant responses
- Implement extractTitle() with message polling and timeout handling
- Add test script to verify polling behavior
- Extract titles with confidence scoring (high/medium/low)

Fixes: movies-deluxe-uq0.17"

# 4. Stage data changes
git add data/movies.json

# 5. Commit data
git commit -m "data: add ai-extracted titles for 25 movies

- Extracted clean movie titles using Claude via OpenCode SDK
- All extractions have 'high' confidence rating
- Removed promotional text (Free Full Movie, HD, etc.)"

# 6. Sync beads with main branch
bd sync --from-main

# 7. Close completed tasks
bd close movies-deluxe-uq0.19 --reason "Updated AIMetadata interface to use providerID (not provider) to match OpenCode SDK structure"

bd close movies-deluxe-uq0.17 --reason "Implemented AI title extraction using OpenCode SDK with message polling. Successfully extracted 25 movie titles with high confidence filtering."

# 8. Verify closure
bd list --status=closed | head -5

# 9. Check for remaining open tasks
bd list --status=in_progress
bd list --status=todo
```

**Success criteria**:

- ✅ Two commits created (implementation + data)
- ✅ Both beads tasks closed
- ✅ No uncommitted changes
- ✅ Clean working directory

---

## 🔧 Troubleshooting Guide

### Port Already in Use

```bash
# Error: Port 4096 already in use
# Solution: Kill existing OpenCode server
lsof -ti:4096 | xargs kill -9

# Or use different port:
const opencode = await createOpencode({
  hostname: "127.0.0.1",
  port: 4097,  // Different port
  config: OPENCODE_CONFIG,
})
```

### API Key Missing

```bash
# Check if key is set
echo $ANTHROPIC_API_KEY

# If empty, set it:
export ANTHROPIC_API_KEY=sk-ant-...

# Or add to ~/.bashrc or ~/.zshrc:
echo 'export ANTHROPIC_API_KEY=sk-ant-...' >> ~/.bashrc
source ~/.bashrc
```

### Timeout Errors

```typescript
// If 60 seconds isn't enough, increase timeout:
const maxAttempts = 120 // 2 minutes

// Or adjust poll interval:
await new Promise(resolve => setTimeout(resolve, 500)) // Poll every 0.5s
```

### Empty or Malformed Responses

```typescript
// Check if assistant returned text content
const textParts = assistantMessage.content.filter(part => part.type === 'text')

if (textParts.length === 0) {
  console.error('No text content in response:', assistantMessage)
  throw new Error('No text content in AI response')
}
```

---

## 📊 Database State

**Current state**:

- Total movies: 25
- Need AI extraction: 25
- Already extracted: 0

**Sample entries needing extraction**:

```json
{
  "id": "archive-AChristmasKaren",
  "title": "A Christmas Karen | Free Full Movie | FilmRise Movies",
  "sources": [...]
}

{
  "id": "youtube-charlie-chaplin-the-pawnshop",
  "title": "Charlie Chaplin's \" The Pawnshop\"",
  "sources": [...]
}
```

**After extraction, should look like**:

```json
{
  "id": "archive-AChristmasKaren",
  "title": "A Christmas Karen | Free Full Movie | FilmRise Movies",
  "ai": {
    "extractedTitle": "A Christmas Karen",
    "confidence": "high",
    "model": "anthropic/claude-3-5-sonnet-20241022",
    "providerID": "01JGAVHQ...",
    "timestamp": "2024-12-16T..."
  },
  "sources": [...]
}
```

---

## 📚 Key Files Reference

### Implementation Files

- `scripts/extract-titles-ai.ts` - Main CLI (lines 1-400)
- `scripts/utils/aiTitleExtractor.ts` - Extraction logic (needs rewrite)
- `scripts/test-opencode.ts` - Test script (needs polling added)

### Configuration Files

- `prompts/extract-movie-title.md` - AI prompt template
- `types/movie.ts` - TypeScript interfaces (AIMetadata)
- `package.json` - Scripts: `extract-titles` command

### Data Files

- `data/movies.json` - Movie database (25 entries)

### Documentation

- `AGENTS.md` - Agent instructions (bd usage, commit format)
- `README.md` - Project overview
- `history/SESSION_2024-12-16_HANDOFF.md` - This file

---

## 🎯 Success Criteria Summary

### Testing Phase

- [ ] Poll loop successfully waits for assistant response
- [ ] Extracts correct text from assistant message
- [ ] Handles timeout gracefully (60 second limit)
- [ ] No port conflicts or hanging servers

### Implementation Phase

- [ ] `extractTitle()` uses polling logic
- [ ] Dry run shows correct extraction (3 movies)
- [ ] Full run extracts all 25 movies
- [ ] All extractions have confidence scores
- [ ] High confidence filter works correctly

### Completion Phase

- [ ] Code changes committed (implementation)
- [ ] Data changes committed (movies.json)
- [ ] Beads tasks closed (uq0.17, uq0.19)
- [ ] Sync with main completed
- [ ] No open/staged changes remaining

---

## ⏱️ Time Estimates

**Total**: ~50 minutes

| Step | Task                          | Time   |
| ---- | ----------------------------- | ------ |
| 1    | Test polling logic            | 10 min |
| 2    | Implement aiTitleExtractor.ts | 20 min |
| 3    | Dry run test                  | 5 min  |
| 4    | Full extraction               | 10 min |
| 5    | Commit and close              | 5 min  |

**Critical path**: Steps 1→2 must work before proceeding to 3→4.

---

## 🚦 Quick Start Commands

### Start Next Session

```bash
# 1. Navigate to project
cd /home/linux-falko/Dev/movies-deluxe

# 2. Check environment
echo $ANTHROPIC_API_KEY  # Should show key

# 3. Check beads status
bd list --status=in_progress

# 4. Start with test
pnpm tsx scripts/test-opencode.ts
```

### If Test Passes

```bash
# Implement aiTitleExtractor.ts (see STEP 2)
# Then test with dry run
pnpm extract-titles --dry-run --limit 3 --verbose
```

### If Dry Run Passes

```bash
# Run full extraction
pnpm extract-titles --min-confidence high

# Commit and close
git add scripts/
git commit -m "feat(scripts): implement ai title extraction with polling"
git add data/movies.json
git commit -m "data: add ai-extracted titles for 25 movies"
bd close movies-deluxe-uq0.17 movies-deluxe-uq0.19 --reason "Completed AI title extraction"
```

---

## 📝 Notes for Next Session

### What We Know Works

- ✅ OpenCode SDK server startup
- ✅ Session creation
- ✅ Prompt sending
- ✅ Message listing (shows user message)

### What We Need to Verify

- ⏳ Polling loop waits for assistant response
- ⏳ Text extraction from assistant message
- ⏳ Timeout handling
- ⏳ Confidence scoring accuracy

### What We Haven't Tested Yet

- ⏳ Full 25-movie extraction
- ⏳ Rate limiting behavior
- ⏳ Error recovery
- ⏳ Session cleanup

### Potential Issues to Watch For

- Long response times (10-15 seconds per movie)
- Port conflicts if server doesn't close cleanly
- API rate limits (25 requests in ~5 minutes)
- Malformed responses from AI

---

## 🔗 Related Documentation

**OpenCode SDK**:

- GitHub: https://github.com/opencode-ai/sdk
- Docs: https://opencode.ai/docs

**Beads (bd)**:

- GitHub: https://github.com/beadslabs/beads
- Quickstart: `.beads/QUICKSTART.md`

**Conventional Commits**:

- Spec: https://www.conventionalcommits.org/
- Config: `commitlint.config.js`

---

## 🎬 Final Checklist Before Starting

- [ ] Read this handoff document completely
- [ ] Verify `ANTHROPIC_API_KEY` is set
- [ ] Check no OpenCode server running (`lsof -ti:4096`)
- [ ] Review beads tasks (`bd list --status=in_progress`)
- [ ] Understand polling pattern (see STEP 1)
- [ ] Ready to test (`pnpm tsx scripts/test-opencode.ts`)

---

**Session ended**: December 16, 2024  
**Next session**: Start with STEP 1 (test polling logic)  
**Estimated completion**: 50 minutes from start of next session

Good luck! 🚀
