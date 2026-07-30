import { validateGoogleSheetsConnection } from "../src/lib/google-sheets-log";

async function main() {
  const result = await validateGoogleSheetsConnection();
  console.log(JSON.stringify(result, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
