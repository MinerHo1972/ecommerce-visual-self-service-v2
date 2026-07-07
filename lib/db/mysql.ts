import { getRuntimeConfig } from "../config";

type QueryResult<T> = [T, unknown];

export type MysqlPool = {
  query<T>(sql: string, values?: Record<string, unknown>): Promise<QueryResult<T>>;
  execute<T = unknown>(sql: string, values?: Record<string, unknown>): Promise<QueryResult<T>>;
};

type MysqlModule = {
  createPool(options: {
    uri: string;
    connectionLimit: number;
    namedPlaceholders: boolean;
    timezone: string;
  }): MysqlPool;
};

let pool: MysqlPool | null = null;

export async function getMysqlPool(): Promise<MysqlPool> {
  const { databaseUrl } = getRuntimeConfig();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required when TEMPLATE_REPOSITORY_MODE=rds");
  }

  if (!pool) {
    const mysqlModuleName = "mysql2/promise";
    const mysql = (await import(mysqlModuleName)) as MysqlModule;
    pool = mysql.createPool({
      uri: databaseUrl,
      connectionLimit: 8,
      namedPlaceholders: true,
      timezone: "+08:00"
    });
  }

  return pool;
}
