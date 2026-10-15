import { DatabaseSync } from 'node:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import type { InvoiceDB, Statement } from './invoice-store.ts';

class MemoryStatement implements Statement {
  readonly db: DatabaseSync;
  readonly sql: string;
  readonly values: unknown[];
  constructor(db: DatabaseSync, sql: string, values: unknown[] = []) { this.db=db; this.sql=sql; this.values=values; }
  bind(...values: unknown[]): Statement { return new MemoryStatement(this.db,this.sql,values); }
  async first<T>(): Promise<T | null> { return (this.db.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null; }
  async all<T>(): Promise<{results:T[]}> { return {results:this.db.prepare(this.sql).all(...this.values as never[]) as T[]}; }
  async run(): Promise<{meta:{changes:number}}> { return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values as never[]).changes)}}; }
}
export class MemoryDB implements InvoiceDB {
  readonly connection = new DatabaseSync(':memory:');
  constructor() {
    this.connection.exec('PRAGMA foreign_keys = ON;');
    this.connection.exec(readFileSync(new URL('../migrations/0001_invoices.sql',import.meta.url),'utf8'));
    const integrity = new URL('../migrations/0002_invoice_integrity.sql',import.meta.url);
    if (existsSync(integrity)) this.connection.exec(readFileSync(integrity,'utf8'));
  }
  prepare(sql: string): Statement { return new MemoryStatement(this.connection,sql); }
  async batch(statements: Statement[]): Promise<unknown[]> {
    this.connection.exec('BEGIN');
    try {
      const results=[];
      for (const statement of statements) {
        const before = Number(this.connection.prepare('SELECT total_changes() AS n').get()!.n);
        const result = await statement.all();
        const after = Number(this.connection.prepare('SELECT total_changes() AS n').get()!.n);
        const changes = after === before ? 0 : Number(this.connection.prepare('SELECT changes() AS n').get()!.n);
        results.push({ ...result,success:true,meta:{ changes } });
      }
      this.connection.exec('COMMIT'); return results;
    } catch(error) { this.connection.exec('ROLLBACK'); throw error; }
  }
}
export async function accessFixture() {
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const key={...await crypto.subtle.exportKey('jwk',pair.publicKey),kid:crypto.randomUUID(),alg:'RS256'};
  const issuer='https://invoice-test.cloudflareaccess.com', audience='synthetic-audience';
  const b64=(bytes:Uint8Array) => Buffer.from(bytes).toString('base64url');
  const issueRaw=async (claimsJson:string) => {
    const header=b64(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:key.kid})));
    const payload=b64(new TextEncoder().encode(claimsJson));
    const data=header+'.'+payload;
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,new TextEncoder().encode(data));
    return data+'.'+b64(new Uint8Array(signature));
  };
  const issue=async (overrides:Record<string,unknown>={}) => issueRaw(JSON.stringify({
    iss:issuer,aud:[audience],exp:Math.floor(Date.now()/1000)+300,email:'seller@example.test',...overrides,
  }));
  return {key,issuer,audience,issue,issueRaw};
}

