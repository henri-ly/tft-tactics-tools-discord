import path from "path";
import fs from "fs";
import { setIds } from "../utils";

export const idsFilePath = path.join(__dirname, "../../", "ids.json");

export async function removeId(id: string): Promise<void> {
  let ids: string[] = [];
  if (fs.existsSync(idsFilePath)) {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    ids = JSON.parse(data);
  }
  ids = ids.filter((i) => i !== id);
  console.log("id remove", id);

  setIds(ids);
}
