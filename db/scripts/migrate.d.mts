export declare const MIGRATIONS_DIR: string;
export declare function listMigrations(
  dir?: string,
): Promise<{ name: string; sql: string; checksum: string }[]>;
export declare function migrate(options?: {
  connectionString?: string;
  dir?: string;
  log?: (msg: string) => void;
}): Promise<string[]>;
