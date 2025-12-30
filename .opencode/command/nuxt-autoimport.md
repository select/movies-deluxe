---
description: Check for correct usage of Nuxt 4 auto-import
---

Auto-imported means that if the modules export something there is not need for an `import` statement to use the exported functions or variables.

If there are type errors because of the auto imports first try to

```
app/
├── components/
│ └── MovieCard.vue # ✅ Auto-imported
├── composables/
│ └── useDatabase.ts # ✅ Auto-imported
├── utils/
│ ├── formatCount.ts # ✅ Auto-imported (root level only)
│ └── nested/
│  └── helper.ts # ❌ NOT auto-imported
├── stores/
│ └── useMovieStore.ts # ✅ Auto-imported
├── types/
│ └── index.ts # ❌ NOT auto-imported
├── constants/
│ └── config.ts # ❌ NOT auto-imported
├── layouts/
│ └── default.vue # ❌ NOT auto-imported
├── pages/
│ └── index.vue # ❌ NOT auto-imported
├── plugins/
│ └── dark-mode.client.ts # ❌ NOT auto-imported
└── workers/
└── database.worker.ts # ❌ NOT auto-imported
shared/
├── types/
│ └── collections.ts # ✅ Auto-imported in both server and app
└── utils/
  └── languageNormalizer.ts # ✅ Auto-imported in both server and app
server/
├── api/
│ └── movies.get.ts # ❌ NOT auto-imported
└── utils/
└── movieData.ts # ❌ NOT auto-imported
```
