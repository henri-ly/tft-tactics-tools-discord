import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import "dotenv/config";
import fs from "fs";
import { env } from "process";
import { addId } from "./commands/add";
import { checkIfPlayerExist, generateEmbedLeaderboard } from "./commands/rank";
import { removeId } from "./commands/remove";
import { idsFilePath } from "./utils";

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
    const id = decodeURI(interaction.options.getString("id") || "");

    console.log("Adding ID...", id);
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

  if (interaction.commandName === "remove") {
    const id = decodeURI(interaction.options.getString("id") || "");

    console.log("Removing ID...", id);
    if (id && id.length < 30) {
      if (!id.includes("#")) {
        await interaction.editReply(
          "Please provide a valid ID. (ID should contain #)"
        );
      } else {
        removeId(id);
        await interaction.editReply(`ID ${id} removed successfully!`);
      }
    } else {
      await interaction.editReply("Please provide an ID");
    }
  }

  if (interaction.commandName === "rank") {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    const ids = JSON.parse(data);

    console.log("Generating leaderboard...");
    await interaction.deferReply();

    const { embed, files } = await generateEmbedLeaderboard(ids);

    const totalFiles = files.length;
    const filesLimit = 9;
    const filesChunks = [];

    for (let i = 0; i < totalFiles; i += filesLimit) {
      filesChunks.push(files.slice(i, i + filesLimit));
    }
    let thread = await (
      await interaction.editReply({ embeds: [embed] })
    ).startThread({
      name: `Leaderboard-${new Date()
        .toISOString()
        .replace("T", " ")
        .slice(0, 19)}`,
      autoArchiveDuration: 60,
    });
    for (const chunk of filesChunks) {
      await thread.send({ files: chunk });
    }
    console.log(
      "Leaderboard created successfully at " + new Date().toISOString()
    );
  }
});

// Log in to Discord with your client's token
client.login(env.DISCORD_TOKEN);
