<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-8">
    <div
      v-if="!isDev"
      class="flex flex-col items-center justify-center h-[60vh] text-center"
    >
      <div class="i-mdi-lock text-64px text-gray-300 dark:text-gray-700 mb-4" />
      <h1 class="text-2xl font-bold mb-2">
        Access Denied
      </h1>
      <p class="text-gray-500">
        The admin interface is only available on localhost.
      </p>
      <NuxtLink
        to="/"
        class="mt-6 px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
      >
        Back to Home
      </NuxtLink>
    </div>

    <div
      v-else
      class="max-w-7xl mx-auto space-y-8"
    >
      <!-- Header -->
      <header class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold flex items-center gap-3">
            <div class="i-mdi-shield-crown text-blue-600" />
            Admin Dashboard
          </h1>
          <p class="text-gray-500 mt-1">
            Manage movie scraping and curation
          </p>
        </div>
        <div class="flex items-center gap-3">
          <NuxtLink
            to="/"
            class="px-4 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
          >
            <div class="i-mdi-home" />
            View Site
          </NuxtLink>
          <button 
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2" 
            :disabled="loading"
            @click="refreshStats"
          >
            <div :class="['i-mdi-refresh', loading ? 'animate-spin' : '']" />
            Refresh Stats
          </button>
        </div>
      </header>

      <!-- Stats Overview -->
      <section
        v-if="stats"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
      >
        <div class="glass p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-500 uppercase tracking-wider">Total Movies</span>
            <div class="i-mdi-movie-open text-2xl text-blue-500" />
          </div>
          <div class="text-3xl font-bold">
            {{ stats.database.total }}
          </div>
          <div class="mt-2 text-xs text-gray-400">
            {{ stats.database.matched }} matched, {{ stats.database.unmatched }} unmatched
          </div>
        </div>

        <div class="glass p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-500 uppercase tracking-wider">Archive.org Coverage</span>
            <div class="i-mdi-archive text-2xl text-amber-500" />
          </div>
          <div class="text-3xl font-bold">
            {{ stats.external.archiveOrg.scraped }}
          </div>
          <div class="mt-2 flex flex-col gap-1">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-400">of {{ stats.external.archiveOrg.total }} total</span>
              <span class="font-medium">{{ stats.external.archiveOrg.percent.toFixed(2) }}%</span>
            </div>
            <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-amber-500 transition-all duration-1000" 
                :style="{ width: `${stats.external.archiveOrg.percent}%` }"
              />
            </div>
          </div>
        </div>

        <div class="glass p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-500 uppercase tracking-wider">YouTube Sources</span>
            <div class="i-mdi-youtube text-2xl text-red-500" />
          </div>
          <div class="text-3xl font-bold">
            {{ stats.database.youtubeSources }}
          </div>
          <div class="mt-2 text-xs text-gray-400">
            Across configured channels
          </div>
        </div>

        <div class="glass p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-500 uppercase tracking-wider">Curation Status</span>
            <div class="i-mdi-check-decagram text-2xl text-green-500" />
          </div>
          <div class="text-3xl font-bold">
            {{ stats.curation.curated }}
          </div>
          <div class="mt-2 flex flex-col gap-1">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-400">of {{ stats.curation.total }} entries</span>
              <span class="font-medium">{{ stats.curation.percent.toFixed(1) }}%</span>
            </div>
            <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-green-500 transition-all duration-1000" 
                :style="{ width: `${stats.curation.percent}%` }"
              />
            </div>
          </div>
        </div>

        <div class="glass p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between mb-4">
            <span class="text-sm font-medium text-gray-500 uppercase tracking-wider">Posters Downloaded</span>
            <div class="i-mdi-image-multiple text-2xl text-purple-500" />
          </div>
          <div class="text-3xl font-bold">
            {{ stats.posters.downloaded }}
          </div>
          <div class="mt-2 flex flex-col gap-1">
            <div class="flex justify-between text-xs mb-1">
              <span class="text-gray-400">of {{ stats.posters.withPosterUrl }} with URL</span>
              <span class="font-medium">{{ stats.posters.percent.toFixed(1) }}%</span>
            </div>
            <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                class="h-full bg-purple-500 transition-all duration-1000" 
                :style="{ width: `${stats.posters.percent}%` }"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- Scrape Controls -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Archive.org Scraper -->
        <div class="glass p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-archive text-amber-500" />
            Archive.org Scraper
          </h2>
          
          <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Rows per page</label>
                <input
                  v-model="archiveOptions.rows"
                  type="number"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
              </div>
              <div class="space-y-2">
                <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Pages to fetch</label>
                <input
                  v-model="archiveOptions.pages"
                  type="number"
                  class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                >
              </div>
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="archiveOptions.autoDetect"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Auto-detect starting page</span>
              </label>
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="archiveOptions.skipOmdb"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Skip OMDB matching (faster)</span>
              </label>
            </div>

            <button 
              class="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-2xl shadow-lg shadow-amber-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" 
              :disabled="scraping"
              @click="startArchiveScrape"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-play"
              />
              {{ scraping ? 'Scraping in progress...' : 'Start Archive.org Scrape' }}
            </button>
          </div>
        </div>

        <!-- YouTube Scraper -->
        <div class="glass p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-youtube text-red-500" />
            YouTube Scraper
          </h2>
          
          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Videos per channel</label>
              <input
                v-model="youtubeOptions.limit"
                type="number"
                class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="youtubeOptions.skipOmdb"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Skip OMDB matching (faster)</span>
              </label>
            </div>

            <button 
              class="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl shadow-lg shadow-red-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" 
              :disabled="scraping"
              @click="startYouTubeScrape"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-play"
              />
              {{ scraping ? 'Scraping in progress...' : 'Start YouTube Scrape' }}
            </button>
          </div>
        </div>

        <!-- Poster Downloader -->
        <div class="glass p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-bold mb-6 flex items-center gap-2">
            <div class="i-mdi-image-multiple text-purple-500" />
            Poster Downloader
          </h2>
          
          <div class="space-y-6">
            <div class="space-y-2">
              <label class="text-sm font-medium text-gray-600 dark:text-gray-400">Download limit</label>
              <input
                v-model="posterOptions.limit"
                type="number"
                class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
              >
            </div>

            <div class="flex flex-col gap-3">
              <label class="flex items-center gap-3 cursor-pointer group">
                <div class="relative">
                  <input
                    v-model="posterOptions.force"
                    type="checkbox"
                    class="sr-only peer"
                  >
                  <div class="w-10 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
                </div>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 transition-colors">Force re-download</span>
              </label>
            </div>

            <button 
              class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-2xl shadow-lg shadow-purple-600/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" 
              :disabled="scraping"
              @click="startPosterDownload"
            >
              <div
                v-if="scraping"
                class="i-mdi-loading animate-spin"
              />
              <div
                v-else
                class="i-mdi-download"
              />
              {{ scraping ? 'Downloading...' : 'Download Posters' }}
            </button>
          </div>
        </div>
      </div>

      <!-- OMDB Enrichment Section -->
      <section class="glass p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <div class="i-mdi-database-sync text-2xl text-blue-600" />
            <h2 class="text-xl font-bold">
              OMDB Enrichment
            </h2>
          </div>
          <button
            class="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            :disabled="loadingUnmatched"
            @click="loadUnmatchedMovies"
          >
            <div :class="['i-mdi-refresh', loadingUnmatched ? 'animate-spin' : '']" />
            Refresh List
          </button>
        </div>

        <div class="mb-6 flex gap-4">
          <div class="flex-1">
            <input
              v-model="enrichmentSearch"
              type="text"
              placeholder="Search unmatched movies..."
              class="w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
            >
          </div>
          <select
            v-model="enrichmentFilter"
            class="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="all">
              All Unmatched
            </option>
            <option value="archive">
              Archive.org Only
            </option>
            <option value="youtube">
              YouTube Only
            </option>
          </select>
        </div>

        <div
          v-if="loadingUnmatched"
          class="flex items-center justify-center py-12"
        >
          <div class="i-mdi-loading animate-spin text-4xl text-blue-600" />
        </div>

        <div
          v-else-if="filteredUnmatchedMovies.length === 0"
          class="flex flex-col items-center justify-center py-12 text-gray-400"
        >
          <div class="i-mdi-check-circle text-5xl mb-3 text-green-500" />
          <p class="text-lg font-medium">
            All movies are matched!
          </p>
          <p class="text-sm">
            No unmatched movies found in the database.
          </p>
        </div>

        <div
          v-else
          class="space-y-3 max-h-[600px] overflow-y-auto pr-2"
        >
          <div
            v-for="movie in filteredUnmatchedMovies.slice(0, 50)"
            :key="movie.imdbId"
            class="flex gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-2">
                <h3 class="font-bold text-lg truncate">
                  {{ movie.title }}
                </h3>
                <span
                  v-if="movie.year"
                  class="text-sm text-gray-500"
                >
                  ({{ movie.year }})
                </span>
                <div
                  v-for="source in movie.sources"
                  :key="source.url"
                  :class="source.type === 'youtube' ? 'i-mdi-youtube text-red-600' : 'i-mdi-bank text-blue-600'"
                  class="text-sm"
                />
              </div>
              <p class="text-xs text-gray-500 font-mono mb-2">
                {{ movie.imdbId }}
              </p>
              <div
                v-if="movie.sources[0]?.description"
                class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2"
              >
                {{ movie.sources[0].description }}
              </div>
            </div>
            <div class="flex flex-col gap-2">
              <button
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-bold transition-colors disabled:opacity-50 whitespace-nowrap"
                :disabled="enrichingMovie === movie.imdbId"
                @click="openEnrichmentModal(movie)"
              >
                <div
                  v-if="enrichingMovie === movie.imdbId"
                  class="i-mdi-loading animate-spin"
                />
                <span v-else>Enrich</span>
              </button>
              <NuxtLink
                :to="`/movie/${movie.imdbId}`"
                class="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-lg font-bold transition-colors text-center"
              >
                View
              </NuxtLink>
            </div>
          </div>
          <div
            v-if="filteredUnmatchedMovies.length > 50"
            class="text-center text-sm text-gray-500 py-4"
          >
            Showing 50 of {{ filteredUnmatchedMovies.length }} unmatched movies
          </div>
        </div>
      </section>

      <!-- Enrichment Modal -->
      <div
        v-if="enrichmentModal.show"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        @click.self="closeEnrichmentModal"
      >
        <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          <div class="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h2 class="text-2xl font-bold">
                Enrich Movie
              </h2>
              <p class="text-sm text-gray-500 mt-1">
                {{ enrichmentModal.movie?.title }} {{ enrichmentModal.movie?.year ? `(${enrichmentModal.movie.year})` : '' }}
              </p>
            </div>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              @click="closeEnrichmentModal"
            >
              <div class="i-mdi-close text-2xl" />
            </button>
          </div>

          <div class="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Search Section -->
              <div class="space-y-4">
                <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-400">
                  Search OMDB
                </h3>
                <div class="flex gap-2">
                  <input
                    v-model.trim="enrichmentModal.searchTitle"
                    type="text"
                    placeholder="Movie Title"
                    class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    @keyup.enter="searchOMDB"
                  >
                  <input
                    v-model.trim="enrichmentModal.searchYear"
                    type="text"
                    placeholder="Year"
                    class="w-20 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                    @keyup.enter="searchOMDB"
                  >
                  <button
                    class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                    :disabled="enrichmentModal.searching"
                    @click="searchOMDB"
                  >
                    <div
                      v-if="enrichmentModal.searching"
                      class="i-mdi-loading animate-spin"
                    />
                    <span v-else>Search</span>
                  </button>
                </div>

                <div class="pt-2">
                  <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-400 mb-2">
                    Direct IMDB ID
                  </h3>
                  <div class="flex gap-2">
                    <input
                      v-model.trim="enrichmentModal.imdbId"
                      type="text"
                      placeholder="tt1234567"
                      class="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-mono"
                      @keyup.enter="fetchByImdbId"
                    >
                    <button
                      class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-colors disabled:opacity-50"
                      :disabled="enrichmentModal.searching || !enrichmentModal.imdbId"
                      @click="fetchByImdbId"
                    >
                      Fetch
                    </button>
                  </div>
                </div>

                <div
                  v-if="enrichmentModal.error"
                  class="text-red-500 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg"
                >
                  {{ enrichmentModal.error }}
                </div>
              </div>

              <!-- Results Section -->
              <div>
                <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-400 mb-4">
                  Search Results
                </h3>
                <div
                  v-if="enrichmentModal.results.length > 0"
                  class="space-y-2 max-h-[400px] overflow-y-auto pr-2"
                >
                  <div
                    v-for="result in enrichmentModal.results"
                    :key="result.imdbID"
                    class="flex gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-600 transition-colors group"
                  >
                    <img
                      :src="result.Poster !== 'N/A' ? result.Poster : '/favicon.ico'"
                      class="w-12 h-18 object-cover rounded"
                      alt="Poster"
                    >
                    <div class="flex-1 min-w-0">
                      <h4 class="font-bold text-sm truncate">
                        {{ result.Title }}
                      </h4>
                      <p class="text-xs text-gray-500">
                        {{ result.Year }} • {{ result.Type }}
                      </p>
                      <p class="text-[10px] font-mono text-gray-400">
                        {{ result.imdbID }}
                      </p>
                    </div>
                    <button
                      class="self-center px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg font-bold transition-opacity disabled:opacity-50"
                      :disabled="enrichmentModal.applying"
                      @click="applyEnrichment(result.imdbID)"
                    >
                      Select
                    </button>
                  </div>
                </div>
                <div
                  v-else-if="!enrichmentModal.searching"
                  class="h-[200px] flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg"
                >
                  <div class="i-mdi-magnify text-4xl mb-2" />
                  <p class="text-sm">
                    Search results will appear here
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="p-6 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <button
              class="px-6 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg font-bold transition-colors"
              @click="closeEnrichmentModal"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <!-- Results Log -->
      <section
        v-if="results || posterResults"
        class="glass p-8 rounded-3xl shadow-lg border border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-bold">
            {{ posterResults ? 'Poster Download Results' : 'Scrape Results' }}
          </h2>
          <button
            class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            @click="results = null; posterResults = null"
          >
            Clear
          </button>
        </div>
        
        <div
          v-if="results"
          class="grid grid-cols-3 gap-4 mb-6"
        >
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
            <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
              Processed
            </div>
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {{ results.processed }}
            </div>
          </div>
          <div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-2xl border border-green-100 dark:border-green-800">
            <div class="text-xs text-green-600 dark:text-green-400 uppercase font-bold tracking-wider mb-1">
              Added
            </div>
            <div class="text-2xl font-bold text-green-700 dark:text-green-300">
              {{ results.added }}
            </div>
          </div>
          <div class="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple-100 dark:border-purple-800">
            <div class="text-xs text-purple-600 dark:text-purple-400 uppercase font-bold tracking-wider mb-1">
              Updated
            </div>
            <div class="text-2xl font-bold text-purple-700 dark:text-purple-300">
              {{ results.updated }}
            </div>
          </div>
        </div>

        <div
          v-if="posterResults"
          class="grid grid-cols-2 gap-4 mb-6"
        >
          <div class="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800">
            <div class="text-xs text-blue-600 dark:text-blue-400 uppercase font-bold tracking-wider mb-1">
              Successful
            </div>
            <div class="text-2xl font-bold text-blue-700 dark:text-blue-300">
              {{ posterResults.successful }}
            </div>
          </div>
          <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-2xl border border-red-100 dark:border-red-800">
            <div class="text-xs text-red-600 dark:text-red-400 uppercase font-bold tracking-wider mb-1">
              Failed
            </div>
            <div class="text-2xl font-bold text-red-700 dark:text-red-300">
              {{ posterResults.failed }}
            </div>
          </div>
        </div>

        <div
          v-if="(results?.errors.length || 0) > 0 || (posterResults?.errors.length || 0) > 0"
          class="space-y-2"
        >
          <h3 class="text-sm font-bold text-red-500 uppercase tracking-wider">
            Errors ({{ (results?.errors.length || 0) + (posterResults?.errors.length || 0) }})
          </h3>
          <div class="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-900/10 p-4 rounded-xl text-xs font-mono text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30">
            <div
              v-for="(err, i) in (results?.errors || posterResults?.errors || [])"
              :key="i"
              class="mb-1"
            >
              • {{ err }}
            </div>
          </div>
        </div>

        <div
          v-if="results?.debug && results.debug.length > 0"
          class="space-y-2"
        >
          <h3 class="text-sm font-bold text-blue-500 uppercase tracking-wider">
            Debug Log ({{ results.debug.length }})
            /* eslint-disable no-console */
          </h3>
          <div class="max-h-60 overflow-y-auto bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl text-xs font-mono text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30">
            <div
              v-for="(msg, i) in results.debug"
              :key="i"
              class="mb-1"
            >
              {{ msg }}
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/* eslint-disable no-undef */
import { isLocalhost } from '@/utils/isLocalhost'
import type { MovieEntry, OMDBSearchResult, OMDBSearchResponse, MovieMetadata } from '~/types'

interface ScrapeStats {
  database: {
    total: number
    matched: number
    unmatched: number
    archiveOrgSources: number
    youtubeSources: number
    curatedCount: number
  }
  external: {
    archiveOrg: {
      total: number
      scraped: number
      percent: number
    }
  }
  curation: {
    total: number
    curated: number
    percent: number
  }
  posters: {
    totalMovies: number
    withPosterUrl: number
    downloaded: number
    missing: number
    percent: number
  }
}

interface ScrapeResults {
  processed: number
  added: number
  updated: number
  errors: string[]
  debug?: string[]
}

interface PosterResults {
  processed: number
  successful: number
  failed: number
  errors: string[]
}

interface UpdateResponse {
  success: boolean
  movieId: string
}

const isDev = ref(false)
const loading = ref(false)
const scraping = ref(false)
const stats = ref<ScrapeStats | null>(null)
const results = ref<ScrapeResults | null>(null)
const posterResults = ref<PosterResults | null>(null)

// Enrichment state
const unmatchedMovies = ref<MovieEntry[]>([])
const loadingUnmatched = ref(false)
const enrichmentSearch = ref('')
const enrichmentFilter = ref<'all' | 'archive' | 'youtube'>('all')
const enrichingMovie = ref<string | null>(null)

const enrichmentModal = reactive({
  show: false,
  movie: null as MovieEntry | null,
  searchTitle: '',
  searchYear: '',
  imdbId: '',
  searching: false,
  applying: false,
  results: [] as OMDBSearchResult[],
  error: '',
})

const archiveOptions = reactive({
  rows: 10,
  pages: 1,
  skipOmdb: true,
  autoDetect: true,
  collections: ['feature_films'],
})

const youtubeOptions = reactive({
  limit: 10,
  skipOmdb: true,
})

const posterOptions = reactive({
  limit: 50,
  force: false,
})

// Computed
const filteredUnmatchedMovies = computed(() => {
  let filtered = unmatchedMovies.value

  // Filter by source type
  if (enrichmentFilter.value !== 'all') {
    filtered = filtered.filter(m => 
      m.sources.some(s => s.type === enrichmentFilter.value)
    )
  }

  // Filter by search text
  if (enrichmentSearch.value.trim()) {
    const search = enrichmentSearch.value.toLowerCase()
    filtered = filtered.filter(m => 
      m.title.toLowerCase().includes(search) ||
      m.imdbId.toLowerCase().includes(search) ||
      m.sources.some(s => s.description?.toLowerCase().includes(search))
    )
  }

  return filtered
})

onMounted(async () => {
  isDev.value = isLocalhost()
  if (isDev.value) {
    await refreshStats()
    await loadUnmatchedMovies()
  }
})

const refreshStats = async () => {
  loading.value = true
  try {
    stats.value = await $fetch<ScrapeStats>('/api/admin/scrape/stats')
  } catch (e) {
    console.error('Failed to fetch stats', e)
  } finally {
    loading.value = false
  }
}

const startArchiveScrape = async () => {
  scraping.value = true
  results.value = null
  try {
    results.value = await $fetch('/api/admin/scrape/archive', {
      method: 'POST',
      body: archiveOptions
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('Archive scrape failed', e)
    results.value = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

const startYouTubeScrape = async () => {
  scraping.value = true
  results.value = null
  try {
    results.value = await $fetch('/api/admin/scrape/youtube', {
      method: 'POST',
      body: youtubeOptions
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('YouTube scrape failed', e)
    results.value = {
      processed: 0,
      added: 0,
      updated: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

const startPosterDownload = async () => {
  scraping.value = true
  posterResults.value = null
  try {
    posterResults.value = await $fetch('/api/admin/posters/download', {
      method: 'POST',
      body: posterOptions,
    })
    await refreshStats()
  } catch (e: unknown) {
    console.error('Poster download failed', e)
    posterResults.value = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  } finally {
    scraping.value = false
  }
}

// Enrichment functions
const loadUnmatchedMovies = async () => {
  loadingUnmatched.value = true
  try {
    const allMovies = await $fetch<MovieEntry[]>('/api/movies')
    unmatchedMovies.value = allMovies.filter(m => !m.metadata || !m.metadata.imdbID)
  } catch (e) {
    console.error('Failed to load unmatched movies', e)
  } finally {
    loadingUnmatched.value = false
  }
}

const openEnrichmentModal = (movie: MovieEntry) => {
  enrichmentModal.show = true
  enrichmentModal.movie = movie
  enrichmentModal.searchTitle = movie.title
  enrichmentModal.searchYear = movie.year?.toString() || ''
  enrichmentModal.imdbId = ''
  enrichmentModal.results = []
  enrichmentModal.error = ''
  enrichingMovie.value = movie.imdbId
}

const closeEnrichmentModal = () => {
  enrichmentModal.show = false
  enrichmentModal.movie = null
  enrichmentModal.searchTitle = ''
  enrichmentModal.searchYear = ''
  enrichmentModal.imdbId = ''
  enrichmentModal.results = []
  enrichmentModal.error = ''
  enrichingMovie.value = null
}

const searchOMDB = async () => {
  const title = enrichmentModal.searchTitle.trim()
  const year = enrichmentModal.searchYear.trim()
  
  if (!title) return
  
  enrichmentModal.searching = true
  enrichmentModal.error = ''
  enrichmentModal.results = []
  
  try {
    const data = await $fetch<OMDBSearchResponse>('/api/admin/omdb/search', {
      query: {
        s: title,
        y: year
      }
    })
    
    if (data.Response === 'True') {
      enrichmentModal.results = data.Search || []
    } else {
      enrichmentModal.error = data.Error || 'No results found'
    }
  } catch {
    enrichmentModal.error = 'Failed to search OMDB'
  } finally {
    enrichmentModal.searching = false
  }
}

const fetchByImdbId = async () => {
  const input = enrichmentModal.imdbId.trim()
  if (!input) return
  
  // Extract IMDB ID from input (could be full URL or just the ID)
  const match = input.match(/tt\d{7,}/)
  if (!match) {
    enrichmentModal.error = 'Invalid IMDB ID or URL (should contain tt followed by at least 7 digits)'
    return
  }
  
  const id = match[0]
  await applyEnrichment(id)
}

const applyEnrichment = async (imdbId: string) => {
  if (!enrichmentModal.movie) return
  
  try {
    enrichmentModal.applying = true
    enrichmentModal.error = ''
    
    // Get full details first
    const details = await $fetch<MovieMetadata & { Response: string, Error?: string }>('/api/admin/omdb/details', {
      query: { i: imdbId }
    })
    
    if (details.Response === 'True') {
      // Use explicit fetch with type annotation to avoid TS stack depth error
      const response = await fetch('/api/admin/movie/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          movieId: enrichmentModal.movie.imdbId,
          metadata: details,
          verified: true
        })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const res = await response.json() as UpdateResponse
      
      if (res.success) {
        // Success! Close modal and refresh
        closeEnrichmentModal()
        await loadUnmatchedMovies()
        await refreshStats()
      }
    } else {
      enrichmentModal.error = details.Error || 'Failed to get movie details'
    }
  } catch (err) {
    console.error('Failed to apply enrichment:', err)
    enrichmentModal.error = err instanceof Error ? err.message : 'Failed to update movie'
  } finally {
    enrichmentModal.applying = false
  }
}
</script>

<style scoped>
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.dark .glass {
  background: rgba(31, 41, 55, 0.7);
}
</style>
