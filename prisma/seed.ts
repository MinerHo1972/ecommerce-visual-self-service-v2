import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // 管理员
  await prisma.user.upsert({
    where: { email: 'admin@shop.local' },
    update: {},
    create: {
      name: '管理员',
      email: 'admin@shop.local',
      password_hash: bcrypt.hashSync('admin123', 10),
      role: Role.admin,
    },
  });

  // 设计师
  await prisma.user.upsert({
    where: { email: 'designer@shop.local' },
    update: {},
    create: {
      name: '设计师',
      email: 'designer@shop.local',
      password_hash: bcrypt.hashSync('designer123', 10),
      role: Role.designer,
    },
  });

  // 运营
  await prisma.user.upsert({
    where: { email: 'operator@shop.local' },
    update: {},
    create: {
      name: '运营',
      email: 'operator@shop.local',
      password_hash: bcrypt.hashSync('operator123', 10),
      role: Role.operator,
    },
  });

  console.log('Seed data inserted: admin@shop.local, designer@shop.local, operator@shop.local');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
