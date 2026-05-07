import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.simulationResult.deleteMany();
  await prisma.simulation.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.betSlip.deleteMany();
  await prisma.oddsMarket.deleteMany();
  await prisma.liveGameState.deleteMany();
  await prisma.injury.deleteMany();
  await prisma.player.deleteMany();
  await prisma.game.deleteMany();
  await prisma.team.deleteMany();

  const yankees = await prisma.team.create({
    data: {
      name: "New York Yankees",
      abbreviation: "NYY",
      offenseRating: 1.18,
      bullpenRating: 1.05,
      defenseRating: 1.01,
      ballparkFactor: 1.08
    }
  });

  const dodgers = await prisma.team.create({
    data: {
      name: "Los Angeles Dodgers",
      abbreviation: "LAD",
      offenseRating: 1.22,
      bullpenRating: 1.08,
      defenseRating: 1.03,
      ballparkFactor: 1.03
    }
  });

  const game = await prisma.game.create({
    data: {
      externalId: "mock-game-001",
      gameDate: new Date(Date.now() + 4 * 60 * 60 * 1000),
      status: "scheduled",
      homeTeamId: yankees.id,
      awayTeamId: dodgers.id,
      weatherSummary: "72F light wind out to left"
    }
  });

  await prisma.oddsMarket.createMany({
    data: [
      { gameId: game.id, marketType: "moneyline", selection: "NYY", line: null, american: 110, source: "mock" },
      { gameId: game.id, marketType: "moneyline", selection: "LAD", line: null, american: -120, source: "mock" },
      { gameId: game.id, marketType: "total", selection: "over", line: 8.5, american: -105, source: "mock" },
      { gameId: game.id, marketType: "total", selection: "under", line: 8.5, american: -115, source: "mock" },
      { gameId: game.id, marketType: "runline", selection: "NYY +1.5", line: 1.5, american: -150, source: "mock" }
    ]
  });
}

main().finally(async () => prisma.$disconnect());
