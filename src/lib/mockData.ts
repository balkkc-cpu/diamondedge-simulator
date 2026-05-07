import { GameCard, GameDetail, Market } from "./types";

export const mockGames: GameCard[] = [
  {
    id: "mock-game-001",
    homeTeamId: 147,
    awayTeamId: 119,
    startTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    status: "scheduled",
    homeTeam: "NYY",
    awayTeam: "LAD",
    weather: "72F, 8mph out to LF",
    ballpark: "Yankee Stadium",
    probablePitchers: "Cole vs Glasnow"
  },
  {
    id: "mock-game-002",
    homeTeamId: 121,
    awayTeamId: 143,
    startTime: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    status: "scheduled",
    homeTeam: "ATL",
    awayTeam: "PHI",
    weather: "70F, humid",
    ballpark: "Truist Park",
    probablePitchers: "Strider vs Wheeler"
  },
  {
    id: "mock-game-003",
    homeTeamId: 117,
    awayTeamId: 136,
    startTime: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
    status: "scheduled",
    homeTeam: "HOU",
    awayTeam: "SEA",
    weather: "Roof closed",
    ballpark: "Minute Maid Park",
    probablePitchers: "Valdez vs Castillo"
  }
];

export const mockMarkets: Market[] = [
  { id: "m1", gameId: "mock-game-001", marketType: "moneyline", selection: "NYY", line: null, american: 110, source: "mock" },
  { id: "m2", gameId: "mock-game-001", marketType: "moneyline", selection: "LAD", line: null, american: -120, source: "mock" },
  { id: "m3", gameId: "mock-game-001", marketType: "total", selection: "over", line: 8.5, american: -105, source: "mock" },
  { id: "m4", gameId: "mock-game-001", marketType: "runline", selection: "NYY +1.5", line: 1.5, american: -150, source: "mock" },
  { id: "m5", gameId: "mock-game-001", marketType: "first5", selection: "NYY", line: null, american: 105, source: "mock" },
  { id: "m6", gameId: "mock-game-001", marketType: "yrfi", selection: "yes", line: null, american: -110, source: "mock" },
  { id: "m7", gameId: "mock-game-001", marketType: "player_hr", selection: "Judge HR", line: 0.5, american: 280, source: "mock" },
  { id: "m8", gameId: "mock-game-001", marketType: "player_k", selection: "Cole Over 7.5 K", line: 7.5, american: 102, source: "mock" },
  { id: "m9", gameId: "mock-game-001", marketType: "player_hits", selection: "Betts Over 1.5 Hits+Runs+RBI", line: 1.5, american: -118, source: "mock" },
  { id: "m10", gameId: "mock-game-001", marketType: "team_total", selection: "NYY Over 4.5", line: 4.5, american: -110, source: "mock" },
  { id: "m11", gameId: "mock-game-002", marketType: "moneyline", selection: "ATL", line: null, american: -115, source: "mock" },
  { id: "m12", gameId: "mock-game-002", marketType: "total", selection: "under 8.0", line: 8, american: -108, source: "mock" },
  { id: "m13", gameId: "mock-game-003", marketType: "moneyline", selection: "SEA", line: null, american: 125, source: "mock" },
  { id: "m14", gameId: "mock-game-003", marketType: "first5", selection: "SEA +0.5", line: 0.5, american: -110, source: "mock" }
];

export const mockGameDetails: Record<string, GameDetail> = {
  "mock-game-001": {
    gameId: "mock-game-001",
    matchup: "LAD at NYY",
    venue: "Yankee Stadium",
    weather: "72F, wind out to LF",
    trends: ["NYY 8-2 last 10 home games", "LAD top-3 OPS vs RHP", "Over has hit in 6 of last 9 for both teams"],
    injuries: ["NYY RP day-to-day (elbow soreness)", "LAD OF probable (wrist)"],
    starters: ["NYY: Gerrit Cole (2.97 xERA, 30.4% K)", "LAD: Tyler Glasnow (3.21 xERA, 31.2% K)"],
    projectedLineups: {
      NYY: ["Soto", "Judge", "Stanton", "Rizzo", "Torres", "Volpe", "Verdugo", "Trevino", "LeMahieu"],
      LAD: ["Betts", "Ohtani", "Freeman", "Smith", "Hernandez", "Muncy", "Pages", "Lux", "Rojas"]
    },
    playersToWatch: [
      { name: "Aaron Judge", team: "NYY", position: "OF", batsOrThrows: "R", opsOrEra: ".998 OPS", recentForm: "5 HR in last 7" },
      { name: "Mookie Betts", team: "LAD", position: "SS/OF", batsOrThrows: "R", opsOrEra: ".925 OPS", recentForm: "11-game hit streak" }
    ]
  },
  "mock-game-002": {
    gameId: "mock-game-002",
    matchup: "PHI at ATL",
    venue: "Truist Park",
    weather: "70F humid, slight breeze in",
    trends: ["ATL 12-4 vs division opponents", "PHI bullpen top-5 WHIP recently", "First 5 unders 7-3 last 10 ATL starts"],
    injuries: ["PHI 2B questionable (hamstring)", "ATL C out (knee)"],
    starters: ["ATL: Spencer Strider", "PHI: Zack Wheeler"],
    projectedLineups: {
      ATL: ["Acuña", "Albies", "Riley", "Olson", "Ozuna", "Murphy", "Kelenic", "Arcia", "Harris II"],
      PHI: ["Schwarber", "Turner", "Harper", "Bohm", "Stott", "Realmuto", "Castellanos", "Marsh", "Sosa"]
    },
    playersToWatch: [
      { name: "Bryce Harper", team: "PHI", position: "1B", batsOrThrows: "L", opsOrEra: ".915 OPS", recentForm: "9 RBI in last 6" }
    ]
  },
  "mock-game-003": {
    gameId: "mock-game-003",
    matchup: "SEA at HOU",
    venue: "Minute Maid Park",
    weather: "Roof closed",
    trends: ["SEA starting pitching 2nd in MLB ERA", "HOU offense heating up, 124 wRC+ last week"],
    injuries: ["SEA RF probable (ankle)", "HOU bullpen fully available"],
    starters: ["HOU: Framber Valdez", "SEA: Luis Castillo"],
    projectedLineups: {
      HOU: ["Altuve", "Bregman", "Alvarez", "Tucker", "Abreu", "Peña", "Diaz", "Meyers", "Dubon"],
      SEA: ["Crawford", "Rodríguez", "Raleigh", "France", "Polanco", "Haniger", "Rojas", "Moore", "Urías"]
    },
    playersToWatch: [
      { name: "Julio Rodríguez", team: "SEA", position: "OF", batsOrThrows: "R", opsOrEra: ".843 OPS", recentForm: "4 SB in last 8" }
    ]
  }
};
