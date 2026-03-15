/**
 * upload-split-to-s3.ts
 * 上傳分拆後的 tracks/airports/*.jsonl + tracks/regions/*.jsonl + manifest 到 S3
 *
 * Usage:
 *   npx tsx scripts/upload-split-to-s3.ts
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BUCKET = process.env.S3_BUCKET ?? "migu-gis-data-collector";
const REGION = process.env.S3_REGION ?? "ap-southeast-2";
const S3_PREFIX = "flight-arc";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
});

async function upload(localPath: string, s3Key: string) {
  const body = readFileSync(localPath);
  const contentType = s3Key.endsWith(".json") ? "application/json" : "application/x-ndjson";
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
    }),
  );
  console.log(`  ✓ ${s3Key} (${(body.length / 1024).toFixed(0)} KB)`);
}

async function main() {
  const tracksDir = resolve(__dirname, "../public/tracks");
  const airspaceDir = resolve(__dirname, "../public/airspace");

  // 1. tracks/manifest.json
  console.log("=== Tracks Manifest ===");
  await upload(resolve(tracksDir, "manifest.json"), `${S3_PREFIX}/tracks/manifest.json`);

  // 2. tracks/airports/*.jsonl
  const airportsDir = resolve(tracksDir, "airports");
  if (existsSync(airportsDir)) {
    const files = readdirSync(airportsDir).filter((f) => f.endsWith(".jsonl"));
    console.log(`\n=== Tracks Airports (${files.length} files) ===`);
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      await upload(
        resolve(airportsDir, file),
        `${S3_PREFIX}/tracks/airports/${file}`,
      );
      if ((i + 1) % 50 === 0) console.log(`  ... ${i + 1}/${files.length}`);
    }
  }

  // 3. tracks/regions/*.jsonl
  const regionsDir = resolve(tracksDir, "regions");
  if (existsSync(regionsDir)) {
    const files = readdirSync(regionsDir).filter((f) => f.endsWith(".jsonl"));
    console.log(`\n=== Tracks Regions (${files.length} files) ===`);
    for (const file of files) {
      await upload(
        resolve(regionsDir, file),
        `${S3_PREFIX}/tracks/regions/${file}`,
      );
    }
  }

  // 4. airspace/manifest.json + airspace/days/*.jsonl
  if (existsSync(resolve(airspaceDir, "manifest.json"))) {
    console.log("\n=== Airspace ===");
    await upload(resolve(airspaceDir, "manifest.json"), `${S3_PREFIX}/airspace/manifest.json`);

    const daysDir = resolve(airspaceDir, "days");
    if (existsSync(daysDir)) {
      const files = readdirSync(daysDir).filter((f) => f.endsWith(".jsonl"));
      console.log(`Airspace days: ${files.length} files`);
      for (const file of files) {
        await upload(
          resolve(daysDir, file),
          `${S3_PREFIX}/airspace/days/${file}`,
        );
      }
    }
  }

  console.log("\n✅ Done!");
}

main().catch(console.error);
