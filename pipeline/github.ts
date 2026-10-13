import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as tar from "tar";

// Public repositories only, unauthenticated: no scope is requested and no
// token exists to store. The cost is GitHub's anonymous rate limit.
const API = "https://api.github.com";
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;
const TIMEOUT_MS = 120_000;

export class FetchError extends Error {}

export interface RepoRef {
  owner: string;
  name: string;
  /** "owner/name", lowercased: GitHub treats case as the same repository. */
  key: string;
}

// Accepts a github.com URL (with .git, a branch path, a trailing slash) or a
// bare owner/name. Anything else is rejected rather than guessed at.
export function parseRepoUrl(input: string): RepoRef {
  const trimmed = input.trim();
  const match =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i.exec(trimmed) ??
    /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (!match) throw new FetchError(`"${trimmed}" is not a GitHub repository URL`);
  const [, owner, name] = match;
  return { owner, name, key: `${owner}/${name}`.toLowerCase() };
}

async function githubGet(url: string, accept: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: accept, "User-Agent": "code-tracer" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new FetchError(`Could not reach GitHub: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (res.ok) return res;
  if (res.status === 404) throw new FetchError("Repository not found or not public");
  if (res.status === 409) throw new FetchError("Repository is empty");
  if (res.status === 403 || res.status === 429) {
    throw new FetchError("GitHub rate limit reached for anonymous requests; try again later");
  }
  throw new FetchError(`GitHub answered ${res.status} ${res.statusText}`);
}

// The commit is resolved first and the archive is requested by that sha, so
// the recorded commit is the one the files came from even if a push lands
// between the two requests.
export async function resolveHead(repo: RepoRef): Promise<string> {
  const res = await githubGet(
    `${API}/repos/${repo.owner}/${repo.name}/commits/HEAD`,
    "application/vnd.github.sha",
  );
  const sha = (await res.text()).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new FetchError("GitHub returned an unexpected commit id");
  return sha;
}

export interface Checkout {
  /** Directory holding the repository's files at the top level. */
  dir: string;
  cleanup(): void;
}

export async function downloadArchive(repo: RepoRef, sha: string): Promise<Checkout> {
  const res = await githubGet(
    `${API}/repos/${repo.owner}/${repo.name}/tarball/${sha}`,
    "application/vnd.github+json",
  );
  if (!res.body) throw new FetchError("GitHub sent an empty archive");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-tracer-"));
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true });

  // Counted as it streams, so an oversized archive stops mid-download.
  async function* chunks(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader();
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      received += value.length;
      if (received > MAX_ARCHIVE_BYTES) {
        await reader.cancel();
        throw new FetchError(`Archive is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB`);
      }
      yield value;
    }
  }

  try {
    // strip: 1 drops GitHub's "owner-name-sha/" wrapper directory.
    await pipeline(Readable.from(chunks(res.body)), tar.extract({ cwd: dir, strip: 1 }));
  } catch (e) {
    cleanup();
    if (e instanceof FetchError) throw e;
    throw new FetchError(`Could not unpack the archive: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { dir, cleanup };
}
