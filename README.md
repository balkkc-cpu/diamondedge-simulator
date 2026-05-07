# DiamondEdge Simulator

DiamondEdge Simulator is an MLB analytics and simulation platform (not a sportsbook).  
It runs 1,000-game Monte Carlo style simulations to estimate hit probability, edge, EV, confidence, and suggested unit sizing for baseball market selections.

## Legal and Safety

- No wager processing
- No sportsbook account integrations
- No payment processing
- Simulation estimates only
- No outcome is guaranteed
- Creator donations are optional and routed to external payment links only

## Tech Stack

- Next.js + React + TypeScript + Tailwind CSS
- Prisma ORM + SQLite (default, can switch to Postgres)
- Recharts for distributions
- Zustand for bet slip state
- API adapters with fallback mock data
- Expo mobile wrapper (`mobile/`) for Android/iOS testing

## Included Pages

- `/` Dashboard
- `/signup` User signup
- `/login` User login
- `/verify-email` Email verification landing
- `/games/[id]` Game detail page
- `/bet-builder` Bet builder + bet slip
- `/simulation-results` 1,000 simulation outputs
- `/live-tracker` Live scoreboard (inning, count, bases, linescore, win %, pitcher vs batter, last play — MLB Stats API)
- `/settings` Configuration + legal messaging

## API Integrations (with fallbacks)

Configured in `src/lib/apiClients.ts`:

- MLB Stats API (daily schedule)
- The Odds API (structure ready; mock fallback)
- SportsDataIO (injury adapter; mock fallback)
- Weather API adapter (OpenWeather key slot + fallback)
- Live score/news key slots in `.env.example`

If keys are missing, app still works using mock datasets.

## User Accounts + Verification

- Users must sign up with email and password.
- Verification token is generated and must be confirmed before login.
- Production email is wired with Resend (`RESEND_API_KEY` + `RESEND_FROM_EMAIL`).
- In local/dev without Resend key, verification URL is returned/logged for testing.

Regular user flow:

1. Open public app link (from Vercel deploy).
2. Create account at `/signup`.
3. Verify email via link.
4. Login at `/login`.
5. Access simulator pages.

## Quick Start

1. Install Node.js 20+ and npm
2. Open terminal in project root:

```bash
cd "C:\Users\Dell\Documents\DiamondEdge-Simulator"
npm install
copy .env.example .env
npx prisma generate
npx prisma db push
npm run db:seed
npm run dev
```

Local app URL:

- [http://localhost:3000](http://localhost:3000)

## Environment Variables

Copy `.env.example` to `.env` and fill as needed:

- `DATABASE_URL` (default SQLite)
- `ODDS_API_KEY`
- `SPORTSDATAIO_API_KEY`
- `OPENWEATHER_API_KEY`
- `NEWS_API_KEY` (optional)
- `LIVE_SCORE_API_KEY` (optional)
- `RESEND_API_KEY` (required for real verification emails)
- `RESEND_FROM_EMAIL` (verified sender in Resend)
- `ADMIN_USERNAME` (master account username)
- `ADMIN_PASSWORD_HASH` (SHA-256 hash of password, never store plain text)
- `AUTH_SECRET` (long random secret for signed sessions)
- `NEXT_PUBLIC_PAYPAL_DONATION_URL` (your PayPal link)
- `NEXT_PUBLIC_VENMO_DONATION_URL` (your Venmo link)
- `NEXT_PUBLIC_CARD_DONATION_URL` (your card checkout link, e.g. Stripe Payment Link)

Preconfigured per your request:

- Venmo points to `@lecture423` (`https://venmo.com/lecture423`)
- PayPal donation points to `lecture423@gmail.com`

### Create Master Login Credentials

Master login URL:

- [http://localhost:3000/master-login](http://localhost:3000/master-login)

Generate password hash in PowerShell:

```powershell
$pwd = "YourSuperStrongPasswordHere"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($pwd)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
$hash
```

Put output into `ADMIN_PASSWORD_HASH` in `.env`.

## Build for Production

```bash
npm install
npm run build
npm run start
```

## Vercel Deployment (Instant)

1. Push this project to GitHub.
2. Import repo in Vercel.
3. Set environment variables from `.env.example`.
4. Deploy.

CLI deploy commands:

```bash
npm i -g vercel
vercel login
vercel
vercel --prod
```

After deploy, Vercel gives your public website link.

**Production link (bookmark / share):** [https://diamond-edge-simulator.vercel.app](https://diamond-edge-simulator.vercel.app)

This is your regular app link to share with everyone. They can sign up and verify email.

After each code push, run `vercel --prod` from the project folder so this URL shows the latest build.

## Phones & tablets (what to tell users)

DiamondEdge is a **normal website**. Share this link — nothing else is required:

**https://diamond-edge-simulator.vercel.app**

**Optional home-screen icon (recommended wording for users):** “Open the link in your browser, then use **Add to Home Screen** / **Install app** — that saves a shortcut to the **same** site. No separate download, no ‘helper’ app, no App Store step.”

- **iPhone (Safari):** Share → **Add to Home Screen**
- **Android (Chrome):** ⋮ → **Install app** or **Add to Home screen**

The site ships a small **PWA manifest** so the install prompt looks like a real app icon where the browser supports it.

### Optional (owners / developers only): native Android wrapper

If you later need a **Play Store `.apk`**, the `mobile/` folder is an Expo **WebView shell** around the same URL — that path is for **you**, not something everyday users should see. See `mobile/README.md` (if present) or `mobile/app.config.js` and use EAS Build when you are ready.

## Security Hardening Included

- Signed, HttpOnly, SameSite strict admin session cookies
- Owner-only route protection for `/admin`
- Security headers via `middleware.ts` (CSP, clickjacking, MIME sniffing, referrer policy)
- API rate limiting for login/simulation/dashboard endpoints
- Request validation for simulation payloads
- No direct payment processing in app (external links only)

Important: no internet app can be guaranteed "impenetrable". Keep dependencies updated, set strong secrets, enable HTTPS, and use platform protections (Vercel + provider MFA).

## iPhone App Store (optional, owner)

End users can use **Safari → Add to Home Screen** today. A full App Store binary is optional; if you pursue it, use the `mobile/` Expo project + EAS when you have an Apple Developer account (TestFlight / production).

## App Store / Share Readiness Checklist

- Set production `.env` secrets and donation links
- Use your own payout pages only
- Verify legal disclaimer text in UI
- Run lint/build locally before release
- Deploy HTTPS production URL on Vercel
- For mobile store submission, replace WebView wrapper with full native screens if strict store policy requires it

## Data + Simulation Notes

- `src/lib/simEngine.ts` runs 1,000 iterations by default.
- Factors: offense, bullpen, weather, injuries, variance, and market-specific baselines.
- Outputs:
  - Hit probabilities
  - Parlay probability
  - EV and edge
  - Confidence score
  - Suggested fractional-Kelly-based unit sizing (capped at 1.5u)
  - Score distribution histogram
  - Risk labels

## Database Models

Prisma schema includes:

- `Team`
- `Player`
- `Game`
- `OddsMarket`
- `Bet`
- `BetSlip`
- `Simulation`
- `SimulationResult`
- `Injury`
- `LiveGameState`

## MVP Coverage Checklist

- Select MLB games
- Choose multiple bet types
- Build straight/parlay slips
- Run 1,000 simulations
- View probabilities, EV, edge, unit sizing
- View score distribution charts
- Responsive desktop/mobile dashboard

