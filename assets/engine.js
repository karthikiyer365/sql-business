// DuckDB-WASM in a Web Worker, one view per Parquet table. Loaded only when a problem opens.
import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.33.1-dev57.0/+esm';

/** @typedef {{ columns: string[], rows: unknown[][], ms: number }} Result */

let connection;

/** Start DuckDB once and expose each table as a view over data/<table>.parquet (HTTP range reads). */
export function connect(tables) {
  return connection ??= open(tables);
}

async function open(tables) {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles());
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }));
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), new Worker(workerUrl));
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
  URL.revokeObjectURL(workerUrl);
  const conn = await db.connect();
  for (const t of tables) {
    await db.registerFileURL(`${t}.parquet`, new URL(`data/${t}.parquet`, location.href).href, duckdb.DuckDBDataProtocol.HTTP, false);
    await conn.query(`CREATE VIEW ${t} AS SELECT * FROM '${t}.parquet'`);
  }
  return conn;
}

/** Run SQL. Values come back as plain JS: numbers, strings, null; timestamps as 'YYYY-MM-DD hh:mm:ss'. @returns {Promise<Result>} */
export async function query(sql) {
  const conn = await connection;
  const started = performance.now();
  const res = await conn.query(sql);
  const fields = res.schema.fields;
  const plain = fields.map(f => toPlain(f.type));
  return {
    columns: fields.map(f => f.name),
    rows: res.toArray().map(r => fields.map((f, i) => plain[i](r[f.name]))),
    ms: Math.round(performance.now() - started),
  };
}

function toPlain(type) {
  const name = String(type);
  if (name.startsWith('Date')) return v => v == null ? null : new Date(Number(v)).toISOString().slice(0, 10);
  if (name.startsWith('Timestamp')) return v => v == null ? null : new Date(Number(v)).toISOString().replace('T', ' ').replace(/(\.000)?Z$/, '');
  if (name.startsWith('Decimal')) return v => v == null ? null : Number(String(v)) / 10 ** type.scale;
  return v => typeof v === 'bigint' ? Number(v) : v ?? null;
}
