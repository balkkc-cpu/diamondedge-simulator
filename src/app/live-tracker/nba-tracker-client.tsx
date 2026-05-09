"use client";

import { GamePkSelect } from "@/components/LiveTrackerBoard";
import { NbaLiveTrackerBoard } from "@/components/NbaLiveTrackerBoard";
import type { GameCard } from "@/lib/types";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export function NbaTrackerClient({
  initialGameId,
  initialLabel,
  games
}: {
  initialGameId: string;
  initialLabel: string;
  games: GameCard[];
}) {
  const search = useSearchParams();
  const qGame = search.get("game");
  const [gameId, setGameId] = useState(qGame || initialGameId);

  useEffect(() => {
    if (qGame) setGameId(qGame);
  }, [qGame]);

  const label = useMemo(() => {
    const g = games.find((x) => x.id === gameId);
    return g ? `${g.awayTeam} @ ${g.homeTeam}` : initialLabel;
  }, [games, gameId, initialLabel]);

  return (
    <div className="space-y-4">
      {games.length > 0 ? (
        <div className="panel p-4">
          <GamePkSelect games={games} value={gameId} onChange={setGameId} />
        </div>
      ) : null}
      <NbaLiveTrackerBoard gameId={gameId} gameLabel={label} />
    </div>
  );
}
