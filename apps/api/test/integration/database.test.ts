import { PrismaPg } from '@prisma/adapter-pg';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, it } from 'vitest';

import { PrismaClient } from '../../src/generated/prisma/client.ts';

let container: StartedPostgreSqlContainer;
let prisma: PrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:18-alpine').start();
  const adapter = new PrismaPg({ connectionString: container.getConnectionUri() });
  prisma = new PrismaClient({ adapter });
});

afterAll(async () => {
  await prisma.$disconnect();
  await container.stop();
});

it('connects to a real PostgreSQL', async () => {
  const result = await prisma.$queryRaw<{ ok: number }[]>`SELECT 1 AS ok`;

  expect(result).toEqual([{ ok: 1 }]);
});
