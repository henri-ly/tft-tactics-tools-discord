import fs from "fs";
import { idsFilePath, setIds } from "../utils";

export async function addId(id: string): Promise<void> {
  let ids: string[] = [];
  if (fs.existsSync(idsFilePath)) {
    const data = fs.readFileSync(idsFilePath, "utf-8");
    ids = JSON.parse(data);
  }
  ids.push(id);
  console.log("ids", ids);
  console.log("id added", id);

  setIds(ids);
}
