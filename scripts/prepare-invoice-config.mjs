import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [workerName, databaseName, databaseId, issuer, audience, accountId] = process.argv.slice(2);
const databasePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
if (!/^[a-z0-9][a-z0-9_-]*$/.test(workerName ?? '')
  || !databaseName || !databasePattern.test(databaseId ?? '')
  || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer ?? '')
  || !audience?.trim() || !/^[a-f0-9]{32}$/.test(accountId ?? '')) {
  throw new Error('Usage: node scripts/prepare-invoice-config.mjs WORKER_NAME DB_NAME DB_ID ACCESS_ISSUER ACCESS_AUD ACCOUNT_ID');
}

const target = 'wrangler.invoice.jsonc';
if (existsSync(target)) throw new Error('The output file already exists. Review it rather than overwriting it.');
const current = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
if (current.account_id && current.account_id !== accountId) throw new Error('The existing account differs. Review the deployment target.');
if (current.d1_databases?.some((binding) => binding.binding === 'INVOICE_DB')) {
  throw new Error('An invoice binding already exists. Review the existing configuration.');
}

const config = {
  ...current,
  name: workerName,
  account_id: accountId,
  workers_dev: false,
  d1_databases: [
    ...(current.d1_databases ?? []),
    { binding: 'INVOICE_DB', database_name: databaseName, database_id: databaseId, migrations_dir: 'migrations' },
  ],
  vars: { ...current.vars, INVOICE_ACCESS_ISSUER: issuer, INVOICE_ACCESS_AUD: audience },
};
writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log('Prepared ' + target + '. No database, migration, secret or deployment was applied.');

