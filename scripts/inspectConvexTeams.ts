import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Official CLI 1.46.0 uses GET https://api.convex.dev/api/teams.
// Read stored authentication without ever printing its value.
const config = JSON.parse(await readFile(join(homedir(), '.convex/config.json'), 'utf8'));
if (!config.accessToken) throw new Error('Convex authentication is missing.');
const response = await fetch('https://api.convex.dev/api/teams', {
  headers: { Authorization: `Bearer ${config.accessToken}` },
});
if (!response.ok) throw new Error(`Convex team lookup failed (${response.status}).`);
const teams = await response.json() as { id: number; slug: string; name: string }[];
for (const { id, slug, name } of teams) console.log(JSON.stringify({ id, slug, name }));
