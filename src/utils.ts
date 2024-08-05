import { EmbedBuilder } from "discord.js";
import fs from "fs";
import path from "path";
import sharp from "sharp";

export const idsFilePath = path.join(__dirname, "../../", "ids.json");

const tftRanks = [
  "Challenger",
  "Grandmaster",
  "Master",
  "Diamond I",
  "Diamond II",
  "Diamond III",
  "Diamond IV",
  "Platinum I",
  "Platinum II",
  "Platinum III",
  "Platinum IV",
  "Gold I",
  "Gold II",
  "Gold III",
  "Gold IV",
  "Silver I",
  "Silver II",
  "Silver III",
  "Silver IV",
  "Bronze I",
  "Bronze II",
  "Bronze III",
  "Bronze IV",
  "Iron I",
  "Iron II",
  "Iron III",
  "Iron IV",
];

const rankToIndex = new Map(tftRanks.map((rank, index) => [rank, index]));

export function parseRankWithLP(rankWithLP: string) {
  const match = rankWithLP.match(/^([a-zA-Z\s]+)\s(\d+)LP$/);
  if (!match) {
    throw new Error(`Invalid rank format: ${rankWithLP}`);
  }
  const rank = match[1].trim();
  const lp = parseInt(match[2], 10);
  return { rank, lp };
}

export function compareRanks(a: string, b: string): number {
  const { rank: rankA, lp: lpA } = parseRankWithLP(a);
  const { rank: rankB, lp: lpB } = parseRankWithLP(b);

  const rankIndexA = rankToIndex.get(rankA) ?? 0;
  const rankIndexB = rankToIndex.get(rankB) ?? 0;

  if (rankIndexA === rankIndexB) {
    return lpB - lpA; // Compare LP within the same rank
  }

  return rankIndexA - rankIndexB; // Compare ranks
}

export const getURL = (id: string, region = "euw") =>
  encodeURI(`https://tactics.tools/player/${region}/${id.replace("#", "/")}`);

export function getMedalForRank(index: number): string {
  switch (index) {
    case 0:
      return "🥇"; // Gold medal
    case 1:
      return "🥈"; // Silver medal
    case 2:
      return "🥉"; // Bronze medal
    default:
      return " " + (index + 1).toString();
  }
}

export type Player = { rank: string; path: string; id: string };

export function createLeaderboardEmbed(data: Player[]): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle("Leaderboard TFT - by Henri")
    .setColor("#FFD700"); // Set a default color

  embed.setDescription("use /add <id#TAG> to add your ID to the leaderboard");

  embed.addFields({
    name: `#`,
    value: data.map((_, index) => getMedalForRank(index)).join("\n"),
    inline: true,
  });

  embed.addFields({
    name: `ID / Name`,
    value: data
      .map((entry) => {
        return `[${entry.id}](${getURL(entry.id)})`;
      })
      .join("\n"),
    inline: true,
  });

  embed.addFields({
    name: `Rank`,
    value: data
      .map((entry) => {
        return entry.rank;
      })
      .join("\n"),
    inline: true,
  });

  embed.setTimestamp(new Date());

  return embed;
}

export async function compressImage(filePath: string): Promise<void> {
  const outputPath =
    filePath.substring(0, filePath.length - 4) + "_compressed.png";
  let quality = 20;

  const originalImage = sharp(filePath);

  const metadata = await originalImage.metadata();

  const newWidth = Math.round((metadata.width ?? 0) * 0.7);
  const newHeight = Math.round((metadata.height ?? 0) * 0.7);

  await sharp(filePath)
    .resize(newWidth, newHeight)
    .png({ quality, compressionLevel: 9 }) // PNG does not have a quality setting; here it’s for consistency
    .toFile(outputPath);

  fs.unlinkSync(filePath); // Delete the original image
}

export async function setIds(ids: string[]): Promise<void> {
  const removeDuplicate = new Set(ids);

  fs.writeFileSync(
    idsFilePath,
    JSON.stringify([...removeDuplicate], null, 2),
    "utf-8"
  );
}
