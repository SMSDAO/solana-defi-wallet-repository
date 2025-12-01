import dotenv from 'dotenv';
import fs from 'fs';
import { execSync } from 'child_process';
import { Client } from 'pg';
import fetch from 'node-fetch';

dotenv.config();

const requiredEnvs = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SOLANA_RPC_MAINNET'
  // Add other required env vars below if needed
];

const fallbackRPCs = [
  process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET,
  process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET_FALLBACK_1,
  process.env.NEXT_PUBLIC_SOLANA_RPC_MAINNET_FALLBACK_2,
];

function errorAndExit(code: number, message: string, suggestion?: string) {
  console.error(`\n[ERROR ${code}] ${message}`);
  if (suggestion) {
    console.error(`Suggestion: ${suggestion}`);
  }
  process.exit(code);
}

// 1. Check required environment variables
for (const env of requiredEnvs) {
  if (!process.env[env]) {
    errorAndExit(
      1,
      `Missing environment variable: ${env}`,
      `Define ${env} in your .env file (see .env.example)`
    );
  }
}

// 2. Check Postgres connection
(async () => {
  try {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.end();
    console.log('[OK] PostgreSQL is reachable.');
  } catch (err) {
    errorAndExit(
      2,
      'Could not connect to PostgreSQL (DATABASE_URL).',
      'Check your DATABASE_URL or if your database is running and accessible.'
    );
  }

  // 3. Verify Prisma schema and successful generation
  const schemaPath = process.env.PRISMA_SCHEMA_PATH || './prisma/schema.prisma';
  if (!fs.existsSync(schemaPath)) {
    errorAndExit(
      3,
      `Prisma schema file not found at ${schemaPath}.`,
      'Make sure your Prisma schema exists and PRISMA_SCHEMA_PATH is correct.'
    );
  }
  try {
    execSync(`npx prisma generate`, { stdio: 'ignore' });
    console.log('[OK] Prisma schema is valid and client generated.');
  } catch (err) {
    errorAndExit(
      4,
      'Prisma generation failed.',
      'Check your schema for errors and run `npx prisma generate` manually for details.'
    );
  }

  // 4. Ping Solana RPC endpoints with fallback rotation
  let rpcOk = false;
  for (const rpc of fallbackRPCs.filter(Boolean)) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ "jsonrpc": "2.0", "id": 1, "method": "getHealth" }),
        timeout: 7000,
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.result === 'ok') {
          console.log(`[OK] Connected to Solana RPC: ${rpc}`);
          rpcOk = true;
          break;
        }
      }
    } catch (e) {}
    console.warn(`[WARN] Could not connect to Solana RPC: ${rpc}`);
  }
  if (!rpcOk) {
    errorAndExit(
      5,
      'Could not connect to any Solana mainnet RPC endpoint.',
      'Check your RPC URLs, firewall/internet connection, and try alternatives.'
    );
  }

  console.log('\n[PRECHECK SUCCESS] Your environment is ready!');
  process.exit(0);
})();
