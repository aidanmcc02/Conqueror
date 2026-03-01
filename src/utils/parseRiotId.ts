/**
 * Parse league_username (e.g. "FM Stew#MEEPS") into gameName and tagLine.
 */
export function parseRiotId(
  leagueUsername: string
): { gameName: string; tagLine: string } | null {
  if (!leagueUsername) return null;
  const match = leagueUsername.match(/^(.+?)#(.+)$/);
  if (match) return { gameName: match[1].trim(), tagLine: match[2].trim() };
  return null;
}
