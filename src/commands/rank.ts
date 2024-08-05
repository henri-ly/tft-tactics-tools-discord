import { AttachmentBuilder } from "discord.js";
import {
  compareRanks,
  compressImage,
  createLeaderboardEmbed,
  getURL,
  Player,
  setIds,
} from "../utils";
import { chromium } from "playwright";
import path from "path";

export const generateEmbedLeaderboard = async (ids: string[]) => {
  console.log({ ids });
  const promiseIds: Promise<Player | undefined>[] = ids.map(
    async (id: string) => await takeScreenshot(getURL(id), id)
  );

  const screenedPlayers = (await Promise.all(promiseIds)).filter(
    Boolean
  ) as Player[];

  screenedPlayers.sort(({ rank: rankA }, { rank: rankB }) => {
    return compareRanks(rankA, rankB);
  });

  await setIds(screenedPlayers.map(({ id }) => id));

  const files = screenedPlayers.map(({ path }) => {
    return new AttachmentBuilder(path);
  });

  const embed = createLeaderboardEmbed(screenedPlayers);

  return { files, embed };
};

export async function checkIfPlayerExist(id: string): Promise<boolean> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(getURL(id));
  await page.getByRole("button", { name: "Accept" }).click();
  if (await page.getByText("Summoner ").isVisible()) {
    await browser.close();
    return false;
  }
  return true;
}

async function takeScreenshot(
  url: string,
  id: string
): Promise<Player | undefined> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const screenshotPath = path.join(__dirname, "../../screens", `${id}.png`);
  console.log(`Connecting to ${url} ...`);
  await page.goto(url);
  await page.getByRole("button", { name: "Accept" }).click();
  await page.getByRole("tab", { name: "Ranked" }).click();
  await page.locator("#menu").evaluate((el) => (el.style.display = "none"));
  await page
    .locator("div")
    .filter({ hasText: /^LeaderboardsWrapped$/ })
    .first()
    .evaluate((el) => (el.style.display = "none"));
  await page
    .locator("div:nth-child(2) > div:nth-child(2) > div:nth-child(2)")
    .first()
    .screenshot({
      path: screenshotPath,
    });

  const rank = await page
    .locator(
      '//*[@id="content-container"]/div/div[2]/div[2]/div[2]/div[1]/div[2]/div[1]/div[7]/div[2]/div[1]'
    )
    .allTextContents();

  await browser.close();
  console.log(`Screenshot taken for ${id}`);
  await compressImage(screenshotPath);
  return { rank: rank[0], path: `./screens/${id}_compressed.png`, id };
}
