# LoopMind 🏌️ — AI Golf Caddie

LoopMind is an AI caddie for golfers from complete beginners to pros. It knows the
hole you're on, shows your position and yardages, and recommends the smartest
shot for **your** skill level — what club to hit, where to aim, the safe miss,
and why, in plain, encouraging language.

> **Not a perfect oracle.** GPS, course maps, elevation, green contours and pin
> data may be approximate or unavailable. LoopMind gives confident *estimates* to
> help you decide — always use your own judgment on the course.

## Tech stack

- **React Native + Expo** (file-based routing via `expo-router`), **TypeScript** (strict)
- **Supabase** for auth, profiles, clubs, rounds and stats (optional — offline mode otherwise)
- **OpenAI** for natural-language caddie explanations (optional — rule-based fallback)
- **Weather API** for wind / temp / humidity (optional — mock fallback)
- **react-native-svg** hole map (swappable for **Mapbox/Google Maps**)
- **Zustand** + AsyncStorage for state & persistence
- Light **and** dark mode, green/black/white premium palette

## Quick start

```bash
cd loopmind
npm install
cp .env.example .env     # optional — app runs fully without any keys
npm run web              # or: npm run ios / npm run android / npm start
```

The app runs immediately with **zero configuration** in offline/mock mode:
local accounts, three sample courses, mock weather, and the deterministic
rule-based caddie. Add keys in `.env` to enable the real integrations.

### Run on a phone

```bash
npm start                # scan the QR code with Expo Go (iOS/Android)
```

## How the caddie works (important design note)

The caddie's **decision is always made by a deterministic rule engine**
(`src/caddie/engine.ts`). It factors in: distance, lie, skill level, the player's
own club distances, wind, elevation, temperature, hazards/forced carries, pin
position, shot shape and risk tolerance. OpenAI is used **only** to rewrite the
resulting facts into warm, human caddie language (`src/caddie/explain.ts`). If no
OpenAI key is set, a built-in template produces the same advice — so
recommendations are always reliable and never depend on a network call.

## Project structure

```
loopmind/
├── app/                          # expo-router routes (screens)
│   ├── _layout.tsx               # root: theme + auth/onboarding routing gate
│   ├── (auth)/                   # sign-in / sign-up
│   ├── onboarding/               # skill → hand/shape → club distances
│   ├── (tabs)/                   # Play · Courses · Practice · Profile
│   ├── course/[id].tsx           # course detail + hole list + start round
│   ├── hole/[courseId]/[holeNumber].tsx   # rangefinder + AI recommendation
│   ├── round/active.tsx          # live round tracking
│   ├── round/summary.tsx         # round summary
│   └── putting.tsx               # putting assistant
├── src/
│   ├── caddie/                   # engine.ts, explain.ts, practice.ts  ← the brain
│   ├── components/               # reusable UI (Card, Button, HoleMap, …)
│   ├── constants/                # club defaults, skill metadata
│   ├── data/mockCourses.ts       # 3 built-in sample courses (+ generator)
│   ├── lib/                      # env + supabase client
│   ├── services/                 # location, weather, courses, openai
│   ├── store/                    # zustand stores (auth, profile, rounds)
│   ├── theme/                    # palette + ThemeProvider (light/dark)
│   └── types/models.ts           # shared domain types
└── supabase/schema.sql           # full DB schema + RLS policies
```

## Features (MVP)

- **Onboarding** — skill level, dominant hand, shot shape, club distances with an
  "I don't know my distances" path that loads sensible defaults you can tune.
- **Courses** — GPS "nearby" list (mock until a provider is connected) + search.
- **Rangefinder** — big front/middle/back yardages, tee selector, hazards &
  carries, SVG hole map with your position and aim line.
- **AI caddie** — club, target line, safe miss, conservative/aggressive options,
  expected result and a plain-English explanation; skill-aware strategy.
- **Round mode** — track strokes, putts, chips, penalties, fairways and GIR;
  saved round history.
- **Putting assistant** — start line + speed from distance, slope and break.
- **Practice** — estimates lost strokes per area and builds a weekly plan.

## Plugging in real APIs

Search for these clearly-marked extension points:

| Integration | File | What to do |
|---|---|---|
| Course data | `src/services/courses.ts`, `src/data/mockCourses.ts` | Replace mock returns with a real course-data provider; keep the `Course` shape. |
| Maps | `src/components/HoleMap.tsx` | Swap the SVG renderer for Mapbox/Google using real lat/lng. |
| Weather | `src/services/weather.ts` | Fill in the real fetch when `EXPO_PUBLIC_WEATHER_API_KEY` is set. |
| AI wording | `src/services/openai.ts` | Set `EXPO_PUBLIC_OPENAI_API_KEY` (proxy via your backend in prod). |
| Auth / DB | `src/lib/supabase.ts`, `supabase/schema.sql` | Set Supabase keys and run the schema. |
| Green contours | `app/putting.tsx` (`buildPuttPlan`) | Replace the manual read with contour-derived data. |

## Roadmap (post-MVP)

Real course API integration · hazard mapping from GPS · live weather/wind ·
green-reading from contour data · advanced shot dispersion · tournament mode.

## Scripts

```bash
npm run web         # run in the browser
npm start           # Expo dev server (Expo Go / simulators)
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
```
