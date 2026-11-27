// Manage encrypted puzzle content banks.
//
//   node scripts/content.mjs key        print a new random CONTENT_KEY
//   node scripts/content.mjs encrypt    content/private/*.json -> content/encrypted/*.json.enc
//   node scripts/content.mjs decrypt    content/encrypted/*.json.enc -> content/private/*.json
//
// CONTENT_KEY is read from the environment or from .env.local.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  decryptContent,
  encryptContent,
  generateContentKey,
  parseContentKey,
} from "../src/lib/content-crypto.ts";

const BANKS = ["quads-bank.json", "deepcut-bank.json"];
const priv = path.join("content", "private");
const enc = path.join("content", "encrypted");

function keyFromEnv() {
  let value = process.env.CONTENT_KEY;
  if (!value && existsSync(".env.local")) {
    const line = readFileSync(".env.local", "utf8").split("\n").find((l) => l.startsWith("CONTENT_KEY="));
    value = line?.slice("CONTENT_KEY=".length).trim();
  }
  const key = parseContentKey(value);
  if (!key) {
    console.error("CONTENT_KEY is missing or invalid (needs 32 bytes, base64). Create one with: node scripts/content.mjs key");
    process.exit(1);
  }
  return key;
}

const command = process.argv[2];
if (command === "key") {
  console.log(generateContentKey());
} else if (command === "encrypt") {
  const key = keyFromEnv();
  mkdirSync(enc, { recursive: true });
  for (const file of BANKS) {
    const src = path.join(priv, file);
    if (!existsSync(src)) continue;
    const text = readFileSync(src, "utf8");
    JSON.parse(text); // refuse to encrypt invalid JSON
    writeFileSync(path.join(enc, `${file}.enc`), encryptContent(text, file, key) + "\n");
    console.log(`encrypted ${src}`);
  }
} else if (command === "decrypt") {
  const key = keyFromEnv();
  mkdirSync(priv, { recursive: true });
  for (const name of existsSync(enc) ? readdirSync(enc) : []) {
    if (!name.endsWith(".enc")) continue;
    const file = name.slice(0, -".enc".length);
    const text = decryptContent(readFileSync(path.join(enc, name), "utf8"), file, key);
    writeFileSync(path.join(priv, file), text);
    console.log(`decrypted ${file}`);
  }
} else {
  console.error("Usage: node scripts/content.mjs key|encrypt|decrypt");
  process.exit(1);
}
