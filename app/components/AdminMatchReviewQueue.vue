<template>
  <section class="bg-theme-surface border border-theme-border rounded-xl p-6 space-y-6">
    <!-- Automated Pipeline -->
    <div class="p-4 rounded-xl bg-theme-background border border-theme-border space-y-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h3 class="text-base font-bold flex items-center gap-2 text-theme-text">
            <div class="i-mdi-robot-outline text-blue-500"></div>
            Automated Pipeline
          </h3>
          <p class="text-xs text-theme-textmuted mt-0.5">
            Run automated cleanup, false-hit remediation, or unmatched movie matching.
            High-confidence verdicts auto-apply; only uncertain items are queued below.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <label class="flex items-center gap-1.5 text-xs">
            <span class="text-theme-textmuted">Limit:</span>
            <input
              v-model.number="autoLimit"
              type="number"
              min="1"
              max="25000"
              class="w-20 px-2 py-1 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text font-mono"
              :disabled="autoRunning"
            />
          </label>

          <label v-if="autoTask !== 'clean_previews'" class="flex items-center gap-1.5 text-xs">
            <span class="text-theme-textmuted">Min Confidence:</span>
            <input
              v-model.number="autoMinConfidence"
              type="number"
              min="0.5"
              max="1"
              step="0.05"
              class="w-16 px-2 py-1 text-xs rounded-lg border border-theme-border bg-theme-surface text-theme-text font-mono"
              :disabled="autoRunning"
            />
          </label>

          <label
            v-if="autoTask !== 'clean_previews'"
            class="flex items-center gap-1.5 text-xs cursor-pointer select-none"
          >
            <input v-model="autoAllowGoogle" type="checkbox" :disabled="autoRunning" />
            <span>Allow Google (&le;100/day)</span>
          </label>

          <button
            class="px-3 py-1.5 text-xs font-semibold bg-theme-surface border border-theme-border hover:bg-theme-selection text-theme-text rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            :disabled="autoRunning || auditing"
            @click="runAutoPipeline(true)"
          >
            <div class="i-mdi-play-outline" :class="{ 'animate-spin': autoRunning }"></div>
            Dry Run
          </button>

          <button
            class="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
            :disabled="autoRunning || auditing"
            @click="runAutoPipeline(false)"
          >
            <div class="i-mdi-auto-fix" :class="{ 'animate-spin': autoRunning }"></div>
            Run &amp; Auto-Apply
          </button>
        </div>
      </div>

      <!-- Task Selector Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          v-for="card in autoTaskCards"
          :key="card.id"
          type="button"
          class="text-left p-3 rounded-lg border transition-colors space-y-1"
          :class="
            autoTask === card.id
              ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
              : 'border-theme-border bg-theme-surface hover:bg-theme-selection/50'
          "
          :disabled="autoRunning"
          @click="autoTask = card.id"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-bold text-theme-text flex items-center gap-1.5">
              <div :class="[card.icon, card.iconClass]"></div>
              {{ card.title }}
            </span>
            <span
              v-if="autoTask === card.id"
              class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-blue-600 text-white"
            >
              Selected
            </span>
          </div>
          <p class="text-[11px] text-theme-textmuted leading-snug">
            {{ card.description }}
          </p>
        </button>
      </div>

      <!-- Auto-Pipeline Result Summary Banner -->
      <div
        v-if="autoResult"
        class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-900 dark:text-emerald-200 space-y-2"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-3">
            <span class="font-bold">
              {{ autoTaskLabel(autoResult.task) }}
              {{ autoResult.dryRun ? '(Dry Run)' : '(Applied)' }}:
            </span>

            <template v-if="autoResult.task === 'clean_previews'">
              <span class="font-mono">Movies: {{ autoResult.scannedMovies }}</span>
              <span class="font-mono">Sources: {{ autoResult.scannedSources }}</span>
              <span class="font-mono">Removed: {{ autoResult.removedRedundant }}</span>
              <span class="font-mono">Marked: {{ autoResult.markedIncomplete }}</span>
              <span class="font-mono">Cartoons Protected: {{ autoResult.skippedCartoons }}</span>
              <span class="font-mono">Queued: {{ autoResult.queuedBorderline }}</span>
            </template>

            <template v-else-if="autoResult.task === 'audit_false_hits'">
              <span class="font-mono">Scanned: {{ autoResult.scanned }}</span>
              <span class="font-mono">Flagged: {{ autoResult.deterministicFlagged }}</span>
              <span class="font-mono">Kept: {{ autoResult.llmKept }}</span>
              <span class="font-mono">Rematched: {{ autoResult.autoRematched }}</span>
              <span class="font-mono">Unmatched: {{ autoResult.autoUnmatched }}</span>
              <span class="font-mono">Queued: {{ autoResult.queuedUncertain }}</span>
            </template>

            <template v-else>
              <span class="font-mono">Scanned: {{ autoResult.scanned }}</span>
              <span class="font-mono">Direct: {{ autoResult.directUrlMatches }}</span>
              <span class="font-mono">Deterministic: {{ autoResult.deterministicMatches }}</span>
              <span class="font-mono">LLM: {{ autoResult.llmMatches }}</span>
              <span class="font-mono">Queued: {{ autoResult.queuedUncertain }}</span>
              <span class="font-mono">No Match: {{ autoResult.noMatch }}</span>
              <span v-if="autoResult.errors" class="font-mono text-red-600 dark:text-red-300">
                Errors: {{ autoResult.errors }}
              </span>
            </template>
          </div>

          <div class="flex items-center gap-3">
            <button
              v-if="autoResult.samples.length > 0"
              class="underline font-semibold hover:opacity-80"
              @click="showAutoSamples = !showAutoSamples"
            >
              {{ showAutoSamples ? 'Hide' : 'Show' }} Samples ({{ autoResult.samples.length }})
            </button>
            <button class="underline opacity-80 hover:opacity-100" @click="autoResult = null">
              Dismiss
            </button>
          </div>
        </div>

        <div
          v-if="showAutoSamples && autoResult.samples.length > 0"
          class="max-h-56 overflow-y-auto rounded border border-emerald-200 dark:border-emerald-800/70 bg-theme-surface p-2 space-y-1 font-mono text-[11px] text-theme-text"
        >
          <div
            v-for="(sample, idx) in autoResult.samples"
            :key="idx"
            class="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-theme-border/40 last:border-b-0"
          >
            <span class="truncate max-w-md font-sans font-medium">
              {{ sample.title }}
            </span>
            <span class="px-1.5 py-0.5 rounded bg-theme-background border border-theme-border">
              {{ sample.action }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Header & Audit Controls -->
    <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div class="space-y-2">
        <div class="flex flex-wrap items-center gap-3">
          <h2 class="text-2xl font-bold flex items-center gap-2">
            <div class="i-mdi-clipboard-check-multiple text-amber-500"></div>
            Match Review Queue
          </h2>
          <div class="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span
              class="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            >
              Pending: {{ counts.byStatus.pending }}
            </span>
            <span
              class="px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
            >
              False Hits: {{ counts.byKind.false_hit }}
            </span>
            <span
              class="px-2.5 py-1 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
            >
              Archive Previews: {{ counts.byKind.archive_preview }}
            </span>
            <span
              class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
            >
              New Matches: {{ counts.byKind.new_match }}
            </span>
          </div>
        </div>
        <p class="text-sm text-theme-textmuted">
          Audit suspicious IMDb matches, Archive.org previews, and candidate matches.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-1.5 text-sm cursor-pointer select-none">
          <input v-model="auditUseLlm" type="checkbox" :disabled="auditing" />
          <span>Use LLM Verifier</span>
        </label>

        <label class="flex items-center gap-1.5 text-sm">
          <span class="text-theme-textmuted">Limit:</span>
          <input
            v-model.number="auditLimit"
            type="number"
            min="1"
            max="5000"
            class="w-20 px-2 py-1.5 text-sm rounded-lg border border-theme-border bg-theme-background text-theme-text font-mono"
            :disabled="auditing"
          />
        </label>

        <button
          class="px-3.5 py-2 text-sm font-semibold bg-theme-background border border-theme-border hover:bg-theme-selection text-theme-text rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          :disabled="auditing"
          @click="runAudit(true)"
        >
          <div class="i-mdi-magnify-scan" :class="{ 'animate-spin': auditing }"></div>
          Run Audit (Dry Run)
        </button>

        <button
          class="px-3.5 py-2 text-sm font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
          :disabled="auditing"
          @click="runAudit(false)"
        >
          <div class="i-mdi-playlist-plus" :class="{ 'animate-spin': auditing }"></div>
          Run Audit &amp; Enqueue
        </button>

        <button
          class="px-3 py-2 text-sm bg-theme-background border border-theme-border rounded-lg hover:bg-theme-selection transition-colors flex items-center gap-1"
          :disabled="loading"
          @click="fetchQueue"
        >
          <div class="i-mdi-refresh" :class="{ 'animate-spin': loading }"></div>
          Refresh
        </button>
      </div>
    </div>

    <!-- Live Audit Progress Bar -->
    <div
      v-if="
        progress.audit &&
        (progress.audit.status === 'starting' || progress.audit.status === 'in_progress')
      "
      class="p-4 rounded-xl bg-theme-background border border-theme-border space-y-2"
    >
      <div class="flex items-center justify-between text-xs gap-2">
        <span class="text-theme-textmuted truncate">
          {{ progress.audit.message }}
        </span>
        <span class="font-mono text-nowrap text-theme-text">
          {{ progress.audit.current }} / {{ progress.audit.total || '?' }}
          <template v-if="progress.audit.total">
            ({{ Math.round((progress.audit.current / progress.audit.total) * 100) }}%)
          </template>
        </span>
      </div>
      <div class="h-2.5 bg-theme-border rounded-full overflow-hidden">
        <div
          class="h-full bg-amber-500 transition-all duration-200"
          :style="{
            width: progress.audit.total
              ? `${Math.min(100, (progress.audit.current / progress.audit.total) * 100)}%`
              : '0%',
          }"
        ></div>
      </div>
      <div class="flex items-center gap-4 text-[11px] text-theme-textmuted">
        <span>Flagged: {{ progress.audit.successCurrent || 0 }}</span>
        <span v-if="progress.audit.failedCurrent"
          >Enqueued: {{ progress.audit.failedCurrent }}</span
        >
      </div>
    </div>

    <!-- Audit Result / Error Banners -->
    <div
      v-if="auditResult"
      class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-sm text-blue-800 dark:text-blue-200 flex flex-wrap items-center justify-between gap-2"
    >
      <div class="flex flex-wrap items-center gap-3">
        <span class="font-semibold">
          Audit {{ auditResult.dryRun ? '(Dry Run)' : 'Complete' }}:
        </span>
        <span v-if="auditResult.scanned !== undefined" class="font-mono">
          Scanned: {{ auditResult.scanned }}
        </span>
        <span v-if="auditResult.flagged !== undefined" class="font-mono">
          Flagged: {{ auditResult.flagged }}
        </span>
        <span v-if="auditResult.enqueued !== undefined" class="font-mono">
          Enqueued: {{ auditResult.enqueued }}
        </span>
        <span v-if="auditResult.message">{{ auditResult.message }}</span>
      </div>
      <button class="text-xs underline opacity-80 hover:opacity-100" @click="auditResult = null">
        Dismiss
      </button>
    </div>

    <div
      v-if="errorMessage"
      class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-2"
    >
      <span>{{ errorMessage }}</span>
      <button class="text-xs underline opacity-80 hover:opacity-100" @click="errorMessage = null">
        Dismiss
      </button>
    </div>

    <!-- Filter Tabs & Status Selector -->
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-theme-border pb-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <button
          v-for="tab in kindTabs"
          :key="tab.value"
          class="px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
          :class="
            selectedKind === tab.value
              ? 'bg-blue-600 text-white'
              : 'bg-theme-background text-theme-textmuted hover:text-theme-text border border-theme-border'
          "
          @click="selectKind(tab.value)"
        >
          <span>{{ tab.label }}</span>
          <span
            class="text-xs font-mono px-1.5 py-0.2 rounded-full"
            :class="
              selectedKind === tab.value
                ? 'bg-white/20 text-white'
                : 'bg-theme-surface text-theme-textmuted'
            "
          >
            {{ counts.byKind[tab.value] }}
          </span>
        </button>
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wider text-theme-textmuted">
          Status:
        </span>
        <select
          v-model="selectedStatus"
          class="px-3 py-1.5 text-sm rounded-lg border border-theme-border bg-theme-background text-theme-text"
          @change="onStatusChange"
        >
          <option value="pending">Pending ({{ counts.byStatus.pending }})</option>
          <option value="approved">Approved ({{ counts.byStatus.approved }})</option>
          <option value="rejected">Rejected ({{ counts.byStatus.rejected }})</option>
          <option value="resolved">Resolved ({{ counts.byStatus.resolved }})</option>
        </select>
      </div>
    </div>

    <!-- Loading / Empty States -->
    <div v-if="loading && items.length === 0" class="py-12 text-center text-theme-textmuted">
      <div class="i-mdi-loading animate-spin text-3xl mx-auto mb-2"></div>
      <p class="text-sm">Loading review queue...</p>
    </div>

    <div
      v-else-if="items.length === 0"
      class="py-12 text-center text-theme-textmuted border border-dashed border-theme-border rounded-xl"
    >
      <div class="i-mdi-check-circle-outline text-4xl mx-auto mb-2 text-green-500"></div>
      <p class="font-medium text-theme-text">No {{ selectedStatus }} items in this category</p>
      <p class="text-xs mt-1">Run an audit above to scan for suspicious matches or previews.</p>
    </div>

    <!-- Queue Card List -->
    <div v-else class="space-y-4">
      <div
        v-for="item in items"
        :key="item.id"
        class="p-4 rounded-xl border border-theme-border bg-theme-background/60 space-y-4"
      >
        <!-- Card Top Meta Row -->
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="px-2 py-0.5 text-xs font-bold uppercase rounded"
              :class="kindBadgeClass(item.kind)"
            >
              {{ kindLabel(item.kind) }}
            </span>

            <span
              class="px-2 py-0.5 text-xs font-mono rounded bg-theme-surface border border-theme-border text-theme-textmuted"
            >
              #{{ item.id }} · {{ item.status }}
            </span>

            <span
              v-if="item.score !== null"
              class="px-2 py-0.5 text-xs font-mono rounded bg-theme-surface border border-theme-border"
            >
              Score: {{ item.score.toFixed(2) }}
            </span>

            <!-- LLM Verdict Badge -->
            <span
              v-if="item.llmVerdict"
              class="px-2 py-0.5 text-xs font-semibold rounded flex items-center gap-1"
              :class="verdictBadgeClass(item.llmVerdict)"
              :title="item.llmReason || undefined"
            >
              <div class="i-mdi-robot"></div>
              LLM: {{ item.llmVerdict }}
              <span v-if="item.llmConfidence !== null" class="font-mono">
                ({{ Math.round(item.llmConfidence * 100) }}%)
              </span>
            </span>
          </div>

          <span class="text-xs text-theme-textmuted font-mono">
            {{ formatDate(item.createdAt) }}
          </span>
        </div>

        <!-- Deterministic Flags & LLM Reason -->
        <div v-if="item.flags.length > 0 || item.llmReason" class="space-y-2">
          <div v-if="item.flags.length > 0" class="flex flex-wrap gap-1.5">
            <span
              v-for="flag in item.flags"
              :key="flag"
              class="px-2 py-0.5 text-[11px] font-mono rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            >
              {{ flag }}
            </span>
          </div>
          <p
            v-if="item.llmReason"
            class="text-xs text-theme-textmuted bg-theme-surface px-3 py-2 rounded-lg border border-theme-border"
          >
            <span class="font-semibold text-theme-text">LLM Reason:</span>
            {{ item.llmReason }}
          </p>
        </div>

        <!-- Side-by-Side Comparison -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <!-- Left: Source Info -->
          <div class="p-3.5 rounded-lg bg-theme-surface border border-theme-border space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-theme-textmuted">
                Source
              </h3>
              <NuxtLink
                :to="`/movie/${item.movieId}`"
                target="_blank"
                class="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>/movie/{{ item.movieId }}</span>
                <div class="i-mdi-open-in-new text-xs"></div>
              </NuxtLink>
            </div>

            <div
              v-if="item.movie"
              class="text-sm font-semibold text-theme-text flex items-center gap-2"
            >
              <span>{{ item.movie.title }}</span>
              <span v-if="item.movie.year" class="text-xs font-mono text-theme-textmuted">
                ({{ item.movie.year }})
              </span>
              <span
                v-if="item.movie.verified"
                class="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded"
              >
                Verified
              </span>
            </div>

            <div v-if="item.sources.length === 0" class="text-xs text-theme-textmuted italic">
              No source records found in database.
            </div>

            <div
              v-for="src in item.sources"
              :key="src.id"
              class="p-2.5 rounded border space-y-1.5"
              :class="
                item.sourceId && src.sourceId === item.sourceId
                  ? 'border-purple-400 dark:border-purple-600 bg-purple-50/40 dark:bg-purple-900/10 ring-1 ring-purple-400/40'
                  : 'border-theme-border/70 bg-theme-background/50'
              "
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  v-if="item.sourceId && src.sourceId === item.sourceId"
                  class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300"
                >
                  Flagged
                </span>

                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-theme-surface border border-theme-border"
                >
                  <div
                    :class="
                      src.platform === 'youtube'
                        ? 'i-mdi-youtube text-red-600'
                        : 'i-mdi-archive text-amber-600'
                    "
                  ></div>
                  {{ src.channelName || src.platform }}
                </span>

                <span
                  v-if="src.duration"
                  class="px-1.5 py-0.5 text-[11px] font-mono rounded bg-theme-surface border border-theme-border"
                >
                  {{ Math.round(src.duration / 60) }} min
                </span>

                <span
                  v-if="src.size"
                  class="px-1.5 py-0.5 text-[11px] font-mono rounded bg-theme-surface border border-theme-border"
                >
                  {{ formatMb(src.size) }} MB
                </span>

                <span
                  v-if="src.mbPerMin !== null"
                  class="px-1.5 py-0.5 text-[11px] font-mono rounded font-semibold"
                  :class="
                    src.mbPerMin < 2
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-theme-surface text-theme-textmuted border border-theme-border'
                  "
                >
                  {{ src.mbPerMin.toFixed(2) }} MB/min
                </span>

                <span
                  v-for="mark in src.qualityMarks"
                  :key="mark"
                  class="px-1.5 py-0.5 text-[10px] font-bold uppercase rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                >
                  {{ mark }}
                </span>
              </div>

              <div class="text-sm font-medium text-theme-text break-words">
                {{ src.title || '(Untitled source)' }}
              </div>

              <p v-if="src.description" class="text-xs text-theme-textmuted break-words">
                {{ src.description }}
              </p>
            </div>
          </div>

          <!-- Right: Current / Proposed IMDb -->
          <div class="p-3.5 rounded-lg bg-theme-surface border border-theme-border space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-theme-textmuted">
                Current / Proposed IMDb
              </h3>
              <div class="flex items-center gap-2">
                <a
                  v-if="item.currentImdbId"
                  :href="`https://www.imdb.com/title/${item.currentImdbId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Current: {{ item.currentImdbId }}</span>
                  <div class="i-mdi-open-in-new text-xs"></div>
                </a>
                <a
                  v-if="item.proposedImdbId"
                  :href="`https://www.imdb.com/title/${item.proposedImdbId}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="text-xs font-mono text-green-600 dark:text-green-400 hover:underline flex items-center gap-1"
                >
                  <span>Proposed: {{ item.proposedImdbId }}</span>
                  <div class="i-mdi-open-in-new text-xs"></div>
                </a>
              </div>
            </div>

            <!-- Current OMDb Metadata -->
            <div v-if="item.metadata" class="space-y-1.5 text-xs">
              <div class="text-sm font-semibold text-theme-text flex flex-wrap items-center gap-2">
                <span>{{ item.metadata.Title }}</span>
                <span v-if="item.metadata.Year" class="font-mono text-theme-textmuted">
                  ({{ item.metadata.Year }})
                </span>
                <span
                  v-if="item.metadata.Type"
                  class="px-1.5 py-0.5 text-[10px] uppercase rounded bg-theme-background border border-theme-border"
                >
                  {{ item.metadata.Type }}
                </span>
                <span
                  v-if="item.metadata.imdbRating"
                  class="px-1.5 py-0.5 text-[10px] font-mono rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                >
                  ★ {{ item.metadata.imdbRating }}
                </span>
              </div>
              <div v-if="item.metadata.Runtime" class="text-theme-textmuted">
                <span class="font-medium text-theme-text">Runtime:</span>
                {{ item.metadata.Runtime }}
              </div>
              <div v-if="item.metadata.Director" class="text-theme-textmuted">
                <span class="font-medium text-theme-text">Director:</span>
                {{ item.metadata.Director }}
              </div>
              <div v-if="item.metadata.Actors" class="text-theme-textmuted">
                <span class="font-medium text-theme-text">Cast:</span>
                {{ item.metadata.Actors }}
              </div>
            </div>

            <!-- Preview Analysis (for archive_preview) -->
            <div
              v-if="item.kind === 'archive_preview' && item.candidate"
              class="p-2.5 rounded border border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-900/10 space-y-1.5 text-xs"
            >
              <div class="font-semibold text-purple-800 dark:text-purple-300">Preview Analysis</div>
              <div class="flex flex-wrap gap-3 text-theme-textmuted font-mono">
                <span v-if="item.candidate.sizeMB !== null && item.candidate.sizeMB !== undefined">
                  Size: {{ Number(item.candidate.sizeMB).toFixed(1) }} MB
                </span>
                <span
                  v-if="
                    item.candidate.runtimeMinutes !== null &&
                    item.candidate.runtimeMinutes !== undefined
                  "
                >
                  Runtime: {{ item.candidate.runtimeMinutes }} min
                </span>
                <span
                  v-if="item.candidate.mbPerMin !== null && item.candidate.mbPerMin !== undefined"
                >
                  Ratio: {{ Number(item.candidate.mbPerMin).toFixed(2) }} MB/min
                </span>
              </div>
              <div v-if="item.candidate.reason" class="text-theme-text">
                {{ item.candidate.reason }}
              </div>
            </div>

            <!-- Candidate Info (for new_match or proposed replacement) -->
            <div
              v-else-if="item.candidate"
              class="p-2.5 rounded border border-green-200 dark:border-green-800/60 bg-green-50/50 dark:bg-green-900/10 space-y-1 text-xs"
            >
              <div class="font-semibold text-green-800 dark:text-green-300">Proposed Candidate</div>
              <div class="text-theme-text font-medium">
                {{ item.candidate.Title || item.candidate.title || item.proposedImdbId }}
                <span
                  v-if="item.candidate.Year || item.candidate.year"
                  class="font-mono text-theme-textmuted"
                >
                  ({{ item.candidate.Year || item.candidate.year }})
                </span>
              </div>
              <div v-if="item.candidate.Director" class="text-theme-textmuted">
                Director: {{ item.candidate.Director }}
              </div>
              <div v-if="item.candidate.Runtime" class="text-theme-textmuted">
                Runtime: {{ item.candidate.Runtime }}
              </div>
            </div>

            <div
              v-if="!item.metadata && !item.candidate && !item.proposedImdbId"
              class="text-xs text-theme-textmuted italic"
            >
              No OMDb metadata attached. Enter a custom IMDb ID below to match.
            </div>
          </div>
        </div>

        <!-- Action Bar -->
        <div
          class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-theme-border/60"
        >
          <div class="flex flex-wrap items-center gap-2">
            <button
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              :disabled="actingId === item.id"
              @click="performAction(item.id, 'keep_verified')"
            >
              <div class="i-mdi-check-decagram"></div>
              Keep &amp; Verify
            </button>

            <button
              v-if="item.proposedImdbId"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              :disabled="actingId === item.id"
              @click="performAction(item.id, 'approve_match')"
            >
              <div class="i-mdi-check"></div>
              Approve Match ({{ item.proposedImdbId }})
            </button>

            <button
              v-if="item.currentImdbId || item.metadata"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              :disabled="actingId === item.id"
              @click="performAction(item.id, 'unmatch')"
            >
              <div class="i-mdi-link-off"></div>
              Unmatch
            </button>

            <button
              v-if="item.kind === 'archive_preview'"
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center gap-1 disabled:opacity-50"
              :disabled="actingId === item.id"
              @click="performAction(item.id, 'mark_preview')"
            >
              <div class="i-mdi-filmstrip-off"></div>
              Mark Preview/Incomplete
            </button>

            <button
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-theme-surface border border-theme-border hover:bg-theme-selection text-theme-textmuted hover:text-theme-text transition-colors flex items-center gap-1 disabled:opacity-50"
              :disabled="actingId === item.id"
              @click="performAction(item.id, 'reject')"
            >
              <div class="i-mdi-close"></div>
              Dismiss
            </button>
          </div>

          <!-- Custom IMDb ID Re-match -->
          <div class="flex items-center gap-2">
            <input
              v-model="customImdbIds[item.id]"
              type="text"
              placeholder="tt1234567"
              class="w-32 px-2.5 py-1.5 text-xs font-mono rounded-lg border border-theme-border bg-theme-surface text-theme-text"
              :disabled="actingId === item.id"
              @keydown.enter="performCustomMatch(item.id)"
            />
            <button
              class="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600/90 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
              :disabled="actingId === item.id || !isValidImdbInput(customImdbIds[item.id])"
              @click="performCustomMatch(item.id)"
            >
              Re-match
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div
      v-if="total > 0"
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-theme-border text-xs text-theme-textmuted"
    >
      <div>Showing {{ offset + 1 }}–{{ Math.min(offset + limit, total) }} of {{ total }}</div>
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-background hover:bg-theme-selection text-theme-text disabled:opacity-40"
          :disabled="loading || offset === 0"
          @click="prevPage"
        >
          Prev
        </button>
        <button
          class="px-3 py-1.5 rounded-lg border border-theme-border bg-theme-background hover:bg-theme-selection text-theme-text disabled:opacity-40"
          :disabled="loading || offset + limit >= total"
          @click="nextPage"
        >
          Next
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { storeToRefs } from '#imports'
import { $fetch } from '#build/fetch'
import { NuxtLink } from '#components'
import { useAdminStore } from '~/stores/useAdminStore'
import type {
  AuditMatchesResponse,
  LlmVerdict,
  MatchReviewActionResponse,
  MatchReviewActionType,
  MatchReviewCounts,
  MatchReviewListResponse,
  MatchReviewQueueItem,
  ReviewItemKind,
  ReviewItemStatus,
} from '#shared/types/match-review'

type KindFilter = 'all' | ReviewItemKind
type AutoTaskType = 'clean_previews' | 'audit_false_hits' | 'match_unmatched'

interface AutoCleanPreviewsResponse {
  task: 'clean_previews'
  dryRun: boolean
  scannedMovies: number
  scannedSources: number
  removedRedundant: number
  markedIncomplete: number
  skippedCartoons: number
  queuedBorderline: number
  samples: Array<{ title: string; action: string }>
}

interface AutoAuditFalseHitsResponse {
  task: 'audit_false_hits'
  dryRun: boolean
  scanned: number
  deterministicFlagged: number
  llmKept: number
  autoRematched: number
  autoUnmatched: number
  queuedUncertain: number
  samples: Array<{ title: string; action: string }>
}

interface AutoMatchUnmatchedResponse {
  task: 'match_unmatched'
  dryRun: boolean
  scanned: number
  directUrlMatches: number
  deterministicMatches: number
  llmMatches: number
  queuedUncertain: number
  noMatch: number
  errors: number
  samples: Array<{ title: string; action: string }>
}

type AutoPipelineResult =
  | AutoCleanPreviewsResponse
  | AutoAuditFalseHitsResponse
  | AutoMatchUnmatchedResponse

const autoTaskCards: Array<{
  id: AutoTaskType
  title: string
  description: string
  icon: string
  iconClass: string
}> = [
  {
    id: 'clean_previews',
    title: 'Auto-Clean Archive Previews',
    description:
      'Uses size + film length, protects cartoons, removes redundant trailers/TV spots, marks single-source previews.',
    icon: 'i-mdi-filmstrip-off',
    iconClass: 'text-purple-500',
  },
  {
    id: 'audit_false_hits',
    title: 'Auto-Audit & Fix False Hits',
    description: 'LLM-verified auto-rematch/unmatch; only uncertain items go to the review queue.',
    icon: 'i-mdi-shield-search',
    iconClass: 'text-red-500',
  },
  {
    id: 'match_unmatched',
    title: 'Auto-Match Unmatched',
    description:
      'Local IMDb index + TMDB + LLM adjudicator; only uncertain items go to the review queue.',
    icon: 'i-mdi-movie-search',
    iconClass: 'text-blue-500',
  },
]

const kindTabs: Array<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'false_hit', label: 'False Hits' },
  { value: 'archive_preview', label: 'Archive Previews' },
  { value: 'new_match', label: 'New Matches' },
]

const adminStore = useAdminStore()
const { progress } = storeToRefs(adminStore)

const items = ref<MatchReviewQueueItem[]>([])
const total = ref(0)
const limit = ref(50)
const offset = ref(0)
const counts = ref<MatchReviewCounts>({
  byStatus: { pending: 0, approved: 0, rejected: 0, resolved: 0 },
  byKind: { all: 0, new_match: 0, false_hit: 0, archive_preview: 0 },
})

const selectedKind = ref<KindFilter>('all')
const selectedStatus = ref<ReviewItemStatus>('pending')

const loading = ref(false)
const actingId = ref<number | null>(null)
const errorMessage = ref<string | null>(null)

const autoTask = ref<AutoTaskType>('clean_previews')
const autoLimit = ref(500)
const autoMinConfidence = ref(0.85)
const autoAllowGoogle = ref(false)
const autoRunning = ref(false)
const autoResult = ref<AutoPipelineResult | null>(null)
const showAutoSamples = ref(false)

const auditing = ref(false)
const auditUseLlm = ref(true)
const auditLimit = ref(100)
const auditResult = ref<AuditMatchesResponse | null>(null)

const customImdbIds = reactive<Record<number, string>>({})

function autoTaskLabel(task: AutoTaskType): string {
  if (task === 'clean_previews') return 'Archive Preview Cleanup'
  if (task === 'audit_false_hits') return 'False-Hit Audit'
  return 'Unmatched Auto-Match'
}

async function runAutoPipeline(dryRun: boolean) {
  autoRunning.value = true
  errorMessage.value = null
  showAutoSamples.value = false
  try {
    const res = await $fetch<AutoPipelineResult>('/api/admin/auto/run', {
      method: 'POST',
      body: {
        task: autoTask.value,
        dryRun,
        limit: autoLimit.value,
        ...(autoTask.value !== 'clean_previews'
          ? {
              minConfidence: autoMinConfidence.value,
              allowGoogle: autoAllowGoogle.value,
            }
          : {}),
      },
    })
    autoResult.value = res
    if (!dryRun) {
      offset.value = 0
      await fetchQueue()
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Automated pipeline request failed'
  } finally {
    autoRunning.value = false
  }
}

async function fetchQueue() {
  loading.value = true
  errorMessage.value = null
  try {
    const res = await $fetch<MatchReviewListResponse>('/api/admin/review/list', {
      query: {
        status: selectedStatus.value,
        kind: selectedKind.value,
        limit: limit.value,
        offset: offset.value,
      },
    })
    items.value = res.items
    total.value = res.total
    counts.value = res.counts
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to load review queue'
  } finally {
    loading.value = false
  }
}

async function runAudit(dryRun: boolean) {
  auditing.value = true
  errorMessage.value = null
  try {
    const res = await $fetch<AuditMatchesResponse>('/api/admin/audit/matches', {
      method: 'POST',
      body: {
        dryRun,
        useLlm: auditUseLlm.value,
        limit: auditLimit.value,
      },
    })
    auditResult.value = { ...res, dryRun }
    if (!dryRun) {
      offset.value = 0
      await fetchQueue()
    }
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Audit request failed'
  } finally {
    auditing.value = false
  }
}

async function performAction(id: number, action: MatchReviewActionType, customImdbId?: string) {
  actingId.value = id
  errorMessage.value = null
  try {
    await $fetch<MatchReviewActionResponse>('/api/admin/review/action', {
      method: 'POST',
      body: {
        id,
        action,
        ...(customImdbId ? { customImdbId } : {}),
      },
    })
    await fetchQueue()
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Failed to apply review action'
  } finally {
    actingId.value = null
  }
}

function isValidImdbInput(val: string | undefined): boolean {
  if (!val) return false
  return /^tt\d{7,}$/.test(val.trim())
}

async function performCustomMatch(id: number) {
  const imdbId = customImdbIds[id]?.trim()
  if (!imdbId || !isValidImdbInput(imdbId)) return
  await performAction(id, 'approve_match', imdbId)
  customImdbIds[id] = ''
}

function selectKind(kind: KindFilter) {
  selectedKind.value = kind
  offset.value = 0
  fetchQueue()
}

function onStatusChange() {
  offset.value = 0
  fetchQueue()
}

function prevPage() {
  if (offset.value === 0) return
  offset.value = Math.max(0, offset.value - limit.value)
  fetchQueue()
}

function nextPage() {
  if (offset.value + limit.value >= total.value) return
  offset.value += limit.value
  fetchQueue()
}

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1)
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

function kindLabel(kind: ReviewItemKind): string {
  if (kind === 'false_hit') return 'False Hit'
  if (kind === 'archive_preview') return 'Archive Preview'
  return 'New Match'
}

function kindBadgeClass(kind: ReviewItemKind): string {
  if (kind === 'false_hit') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  if (kind === 'archive_preview') {
    return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
  }
  return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
}

function verdictBadgeClass(verdict: LlmVerdict): string {
  if (verdict === 'mismatch') {
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
  }
  if (verdict === 'match') {
    return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
  }
  return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
}

onMounted(() => {
  fetchQueue()
})
</script>
