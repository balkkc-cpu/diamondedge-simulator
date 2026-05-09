import { redirect } from "next/navigation";

/** Same dashboard as home with `?sport=nba` (shared Bet Builder, coach, and env mirrors). */
export default function NbaDashboardRedirect() {
  redirect("/?sport=nba");
}
