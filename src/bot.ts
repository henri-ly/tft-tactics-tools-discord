import {
  AttachmentBuilder,
  Client,
  Events,
  GatewayIntentBits,
  REST,
  Routes,
} from "discord.js";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { chromium } from "playwright";
import { env } from "process";
import {
  compareRanks,
  compressImage,
  createLeaderboardEmbed,
  Player,
} from "./utils";

const idsFilePath = path.join(__dirname, "../", "ids.json");

// // Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN as string);

const commands = [
  {
    name: "add",
    description: "Add user to TFT Leaderboard!",
    options: [
      {
        name: "id",
        description: "ID to add",
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: "rank",
    description: "Show the TFT leaderboards",
  },
];

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(env.CLIENT_ID as string), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(JSON.stringify(error, null, 2));
  }
})();

// // When the client is ready, run this code (only once).
// // The distinction between `client: Client<boolean>` and `readyClient: Client<true>` is important for TypeScript developers.
// // It makes some properties non-nullable.
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "add") {
    const id = interaction.options.getString("id");

    await interaction.deferReply();
    if (id && id.length < 30) {
      if (!id.includes("#")) {
        await interaction.editReply(
          "Please provide a valid ID. (ID should contain #)"
        );
      } else if (!(await checkIfPlayerExist(id))) {
        const formatId = id.replace("#", "/");
        const url = `https://tactics.tools/player/euw/${formatId}`;
        await interaction.editReply(
          "Player not found. Please provide a valid ID. check [here](" +
            url +
            ")"
        );
      } else {
        await addId(id);
        await interaction.editReply(
          `ID ${id} added successfully! You can now use /rank to generate a Leaderboard`
        );
      }
    } else {
      await interaction.editReply("Please provide an ID.");
    }
  }

  if (interaction.commandName === "rank") {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    const ids = JSON.parse(data);

    console.log("Generating leaderboard...");
    await interaction.deferReply();
    const promiseIds: (Player | undefined)[] = ids.map(async (id: string) => {
      const formatId = id.replace("#", "/");
      return takeScreenshot(`https://tactics.tools/player/euw/${formatId}`, id);
    });

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
    console.log("Leaderboard created");

    await interaction.editReply({ embeds: [embed], files });
  }
});

async function addId(id: string): Promise<void> {
  let ids: string[] = [];
  if (fs.existsSync(idsFilePath)) {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    ids = JSON.parse(data);
  } else {
    fs.writeFileSync(idsFilePath, JSON.stringify(ids, null, 2), "utf-8");
  }
  ids.push(id);
  console.log("id added", id);
  const removeDuplicate = new Set(ids);

  fs.writeFileSync(
    idsFilePath,
    JSON.stringify([...removeDuplicate], null, 2),
    "utf-8"
  );
}

async function setIds(ids: string[]): Promise<void> {
  fs.writeFileSync(idsFilePath, JSON.stringify(ids, null, 2), "utf-8");
}

async function checkIfPlayerExist(id: string): Promise<boolean> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const formatId = id.replace("#", "/");
  const url = `https://tactics.tools/player/euw/${formatId}`;
  await page.goto(url);
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
  if (!(await checkIfPlayerExist(id))) {
    return undefined;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const screenshotPath = path.join(__dirname, "../screens", `${id}.png`);
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

// Log in to Discord with your client's token
client.login(env.DISCORD_TOKEN);
