import path from "path";
import fs from "fs";

export const idsFilePath = path.join(__dirname, "../../", "ids.json");

export async function addId(id: string): Promise<void> {
  let ids: string[] = [];
  if (fs.existsSync(idsFilePath)) {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    ids = JSON.parse(data);
  }
  ids.push(id);
  console.log("id added", id);

  setIds(ids);
}

export async function setIds(ids: string[]): Promise<void> {
  const removeDuplicate = new Set(ids);

  fs.writeFileSync(
    idsFilePath,
    JSON.stringify([...removeDuplicate], null, 2),
    "utf-8"
  );
}
