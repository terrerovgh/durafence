@echo off
node --experimental-strip-types --test src/invoice/model.test.ts src/invoice/pdf.test.ts worker/invoice-auth.test.ts worker/invoice-store.test.ts worker/invoice-api.test.ts
if errorlevel 1 exit /b 1
if not errorlevel 0 exit /b 1
exit /b 0

