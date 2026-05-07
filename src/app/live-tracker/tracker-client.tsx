"use client";

import { GamePkSelect, LiveTrackerBoard } from "@/components/LiveTrackerBoard";
import { GameCard } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

export function LiveTrackerClient({
  initialPk,
  initialLabel,
  games
}: {
  initialPk: string;
  initialLabel: string;
  games: GameCard[];
}) {
  const search = useSearchParams();
  const qGame = search.get("game");
  const [gamePk, setGamePk] = useState(qGame || initialPk);

  useEffect(() => {
    if (qGame) setGamePk(qGame);
  }, [qGame]);

  const label = useMemo(() => {
    const g = games.find((x) => x.id === gamePk);
    return g ? `${g.awayTeam} @ ${g.homeTeam}` : initialLabel;
  }, [games, gamePk, initialLabel]);

  return (
    <div className="space-y-4">
      {games.length > 0 ? (
        <div className="panel p-4">
          <GamePkSelect games={games} value={gamePk} onChange={setGamePk} />
        </div>
      ) : null}
      <LiveTrackerBoard gamePk={gamePk} gameLabel={label} />
    </div>
  );
}
