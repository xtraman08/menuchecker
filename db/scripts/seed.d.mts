export declare const SEED_FILE: string;
export declare function seed(options?: {
  connectionString?: string;
  file?: string;
  log?: (msg: string) => void;
}): Promise<void>;
