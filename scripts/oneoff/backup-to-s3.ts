import { readFileSync } from "fs";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "ap-southeast-2",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET ?? "migu-gis-data-collector";

async function upload(localPath: string, key: string) {
  const body = readFileSync(localPath);
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: "application/json" }),
  );
  console.log(`✅ ${key} (${(body.length / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  await upload("scripts/track-progress.json", "flight-arc/backup/track-progress-2026-03-15.json");
  await upload("scripts/flight-list.json", "flight-arc/backup/flight-list-2026-03-15.json");
  console.log("Done!");
}

main().catch(console.error);
