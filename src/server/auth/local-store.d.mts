export const LOCAL_AUTH_DDL: string;
export function hashPassword(password: string): Promise<string>;
export function verifyPassword(password: string, stored: string): Promise<boolean>;
export function dummyHash(): Promise<string>;
export function randomPassword(): string;
export function ensureLocalAuthSchema(client: { query(sql: string): Promise<unknown> }): Promise<void>;
