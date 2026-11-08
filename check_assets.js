const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
p.asset.findMany({ take: 30, orderBy: { created_at: "desc" }, select: { id: true, thumb_tos_key: true, tos_key: true, filename: true, type: true } }).then(r => {
  r.forEach(a => console.log(a.id, "thumb:", a.thumb_tos_key ? "YES" : "NO", "|", a.type, "|", (a.filename||"").slice(0,40)));
  return p.$disconnect();
}).catch(e => { console.error(e); process.exit(1); });
