// Helper compartilhado para upload no Google Drive via Lovable Connector Gateway.
// Pasta destino: Meu Drive > "japa pesca 2026" > "bekup" (cria se não existir).

const GW = "https://connector-gateway.lovable.dev/google_drive";

function getDriveHeaders() {
  const lov = Deno.env.get("LOVABLE_API_KEY");
  const key = Deno.env.get("GOOGLE_DRIVE_API_KEY");
  if (!lov) throw new Error("LOVABLE_API_KEY ausente");
  if (!key) throw new Error("GOOGLE_DRIVE_API_KEY ausente (conecte Google Drive)");
  return {
    Authorization: `Bearer ${lov}`,
    "X-Connection-Api-Key": key,
  };
}

async function findOrCreateFolder(name: string, parentId: string | null): Promise<string> {
  const headers = getDriveHeaders();
  const safe = name.replace(/'/g, "\\'");
  const q = [
    `name='${safe}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    `trashed=false`,
    `'${parentId ?? "root"}' in parents`,
  ].join(" and ");
  const searchUrl = `${GW}/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`;
  const res = await fetch(searchUrl, { headers });
  if (!res.ok) {
    throw new Error(`Drive search folder "${name}" ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.files && json.files.length > 0) return json.files[0].id as string;

  const createRes = await fetch(`${GW}/drive/v3/files?fields=id`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Drive create folder "${name}" ${createRes.status}: ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return created.id as string;
}

export async function resolveBackupFolderId(): Promise<string> {
  const parent = await findOrCreateFolder("japa pesca 2026", null);
  const child = await findOrCreateFolder("bekup", parent);
  return child;
}

export interface DriveUploadResult {
  id: string;
  webViewLink?: string;
  name?: string;
}

export async function uploadToBackupFolder(
  fileName: string,
  bytes: Uint8Array,
  mimeType: string,
): Promise<DriveUploadResult> {
  const folderId = await resolveBackupFolderId();
  const headers = getDriveHeaders();

  const boundary = "lovable-" + crypto.randomUUID();
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const enc = new TextEncoder();
  const pre = enc.encode(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${meta}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const post = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(pre.length + bytes.length + post.length);
  body.set(pre, 0);
  body.set(bytes, pre.length);
  body.set(post, pre.length + bytes.length);

  const url = `${GW}/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Drive upload "${fileName}" ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}
