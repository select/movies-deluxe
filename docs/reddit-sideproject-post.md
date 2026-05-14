# Reddit r/SideProject Post Plan

## When to Post

|                   | Best                  | Good      |
| ----------------- | --------------------- | --------- |
| **Day**           | **Monday or Tuesday** | Wednesday |
| **Time (Berlin)** | **12:00–14:00**       | 15:00     |

**Target: Monday at 13:00 Berlin time** — catches US morning commuters, European lunch browsers, and gives the post all day to build momentum.

---

## Title Options (pick one)

> I dreamt about this for years but it felt too big. Over Christmas break I finally built it — 26,000 free legal movies, searchable in your browser with no backend

> Built a free movie discovery site with 26,700 legal films. Everything runs client-side in your browser using SQLite + WebAssembly

---

## Post Body

I'm a movie nerd who's been frustrated for years that there's no good way to discover the thousands of free, legal movies scattered across Archive.org and YouTube channels like Mosfilm, Popcornflix, and PizzaFlix. They're just... sitting there, barely findable.

Last Christmas break I finally stopped dreaming and started building. 5 months later: [mdlx.org](https://select.github.io/movies/)

**What it does:**

- 26,700 movies from Archive.org + 13 YouTube channels, all legal and free to watch
- Semantic search powered by AI embeddings — describe a mood or vibe, not just a title
- Runs entirely in your browser. No backend, no account, no tracking. SQLite via WebAssembly handles all queries client-side
- IMDB ratings, filters by decade/genre/language, curated collections
- Works offline once loaded

**How it works (for the nerds):**

1. Scraped metadata from Archive.org (26k films) and YouTube channels
2. AI-matched titles to IMDB for ratings/posters (18,240 matched so far)
3. Generated vector embeddings for semantic search
4. Packed everything into SQLite databases that load in your browser via WASM
5. Built with Nuxt 4 + UnoCSS, deployed as a static site on GitHub Pages

**The messy truth:** With 26,700 movies, data curation is a nightmare. There are still wrong matches, clips mixed in with features, and 8,000+ unmatched entries. I'm chipping away at it.

This is a 100% passion project. No monetization, no tracking, open source. Built it because I wanted it to exist.

Would love feedback on the UX or if you find movies that are mismatched. What features would make you actually use something like this?

[mdlx.org](https://select.github.io/movies/)

---

## Key Principles (why this works)

Based on analysis of top r/SideProject posts (May 2026):

1. **Personal story** ("dreamt about this for years") — top posts always have a human motivation
2. **Specific numbers** (26,700 movies, 18,240 matched, 5 months) — builds credibility
3. **Humble/honest** ("the messy truth", "data curation is a nightmare") — authenticity wins
4. **Technical depth** for the nerds without being a wall of jargon
5. **No marketing speak** — reads like a dev talking to devs
6. **Ends with invitation** for feedback — drives comments which boost ranking
7. **"100% passion project"** — this exact phrase appears in multiple viral posts
8. **Free / no catch** — removes friction for engagement

## Patterns from Top Posts

### Title formulas that work:

- Personal story + unexpected outcome: "I built X because [personal reason]. [Surprising result]"
- Time investment + question: "Can't believe I spent 100 hours on this...was it worth it?"
- Relatable frustration → solution: "My [person] had [problem]. I got sick of it, so I built..."
- Self-deprecating humor: "spent 3 weeks vibe coding a texting app that's slower than email"

### What viral posts have in common:

- ✅ Personal motivation/backstory (not "I made a cool thing")
- ✅ Specific numbers (100 hours, 40,000 screenshots, 10k DAU)
- ✅ Humble tone
- ✅ "How it works" section for technically curious
- ✅ No marketing speak — reads like talking to a friend
- ✅ Ends with a question or invitation for feedback
- ✅ Free / no catch

---

## Pre-Post Checklist

- [ ] Ensure site is live and responsive (test mdlx.org)
- [ ] Have a screenshot/video ready (Reddit posts with media get more engagement)
- [ ] Be ready to reply to comments within the first 2 hours (critical for algorithm)
- [ ] Cross-post consideration: r/webdev, r/vuejs, r/internetisbeautiful (stagger by days)
