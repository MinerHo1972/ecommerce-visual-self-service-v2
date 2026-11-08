import { SignJWT } from "jose";
const secret = new TextEncoder().encode("6fcf3d752d21307535c60cb50a2c2137f2d8526dd0326a387e8dd4b9100de772");
const token = await new SignJWT({ sub: "admin", role: "admin", email: "admin@evss.local" })
  .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign();

const listRes = await fetch("http://localhost:3000/api/assets?pageSize=30", {
  headers: { Cookie: `token=${token}` }
});
const listJson = await listRes.json();
const items = listJson.data?.items || [];
console.log(`Total assets: ${items.length}`);

const results = [];
for (let i = 0; i < items.length; i += 6) {
  const batch = items.slice(i, i + 6);
  const batchRes = await Promise.all(batch.map(async (a, idx) => {
    const start = Date.now();
    try {
      const r = await fetch(`http://localhost:3000/api/assets/${a.id}/preview?variant=thumb`, {
        headers: { Cookie: `token=${token}` }
      });
      const elapsed = Date.now() - start;
      const buf = Buffer.from(await r.arrayBuffer());
      return { idx: i + idx, id: a.id.slice(-8), status: r.status, size: buf.length, ms: elapsed };
    } catch (e) {
      return { idx: i + idx, id: a.id.slice(-8), status: "ERR", size: 0, ms: Date.now() - start, err: e.message };
    }
  }));
  results.push(...batchRes);
}

results.forEach(r => {
  console.log(`#${String(r.idx).padStart(2)} ${r.id} status=${r.status} size=${String(r.size).padStart(7)}B ${r.ms}ms ${r.err || ""}`);
});
