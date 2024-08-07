import { CommandModule } from "yargs";

import { createAppForTable, deleteApp } from "../utils/apps";
import {
  Credentials,
  getAndVerifyCredentialsWithRetoolDB,
} from "../utils/credentials";
import { getRequest, postRequest } from "../utils/networking";
import {
  collectColumnNames,
  collectTableName,
  createTable,
  createTableFromCSV,
  deleteTable,
  generateDataWithGPT,
} from "../utils/table";
import type { DBInfoPayload } from "../utils/table";
import { logDAU } from "../utils/telemetry";
import { deleteWorkflow, generateCRUDWorkflow } from "../utils/workflows";

const inquirer = require("inquirer");

const command = "scaffold";
const describe = "Scaffold a Retool DB table, CRUD Workflow, and App.";
const builder: CommandModule["builder"] = {
  name: {
    alias: "n",
    describe: `Name of table to scaffold. Usage:
    retool scaffold -n <table_name>`,
    type: "string",
    nargs: 1,
  },
  columns: {
    alias: "c",
    describe: `Column names in DB to scaffold. Usage:
    retool scaffold -c <col1> <col2>`,
    type: "array",
  },
  delete: {
    alias: "d",
    describe: `Delete a table, Workflow and App created via scaffold. Usage:
    retool scaffold -d <db_name>`,
    type: "string",
    nargs: 1,
  },
  "from-csv": {
    alias: "f",
    describe: `Create a table, Workflow and App from a CSV file. Usage:
    retool scaffold -f <path-to-csv>`,
    type: "array",
  },
  "no-workflow": {
    describe: `Modifier to avoid generating Workflow. Usage:
    retool scaffold --no-workflow`,
    type: "boolean",
  },
};
const handler = async function (argv: any) {
  const credentials = await getAndVerifyCredentialsWithRetoolDB();
  // fire and forget
  void logDAU(credentials);

  // TODO: Support JSON output.
  const format = "default";

  // Handle `retool scaffold -d <db_name>`
  if (argv.delete) {
    const tableName = argv.delete;
    const workflowName = `${tableName} CRUD Workflow`;

    // Confirm deletion.
    const { confirm } = await inquirer.prompt([
      {
        name: "confirm",
        message: `Are you sure you want to delete ${tableName} table, CRUD workflow and app?`,
        type: "confirm",
      },
    ]);
    if (!confirm) {
      process.exit(0);
    }

    //TODO: Could be parallelized.
    //TODO: Verify existence before trying to delete.
    await deleteTable(tableName, credentials, false);
    await deleteWorkflow(workflowName, credentials, false);
    await deleteApp(`${tableName} App`, credentials, false, format);
  }

  // Handle `retool scaffold -f <path-to-csv>`
  else if (argv.f) {
    const csvFileNames = argv.f;

    for (const csvFileName of csvFileNames) {
      const { tableName, colNames } = await createTableFromCSV(
        csvFileName,
        credentials,
        false,
        false
      );

      if (!argv["no-workflow"]) {
        console.log("\n");
        await generateCRUDWorkflow(tableName, credentials);
      }

      console.log("\n");
      const searchColumnName = colNames.length > 0 ? colNames[0] : "id";
      await createAppForTable(
        `${tableName} App`,
        tableName,
        searchColumnName,
        credentials,
        format,
      );
      console.log("");
    }
  }

  // Handle `retool scaffold`
  else {
    let tableName = argv.name;
    let colNames = argv.columns;
    if (!tableName || tableName.length == 0) {
      tableName = await collectTableName();
    }
    if (!colNames || colNames.length == 0) {
      colNames = await collectColumnNames();
    }

    await createTable(tableName, colNames, undefined, credentials, false);
    // Fire and forget
    void insertSampleData(tableName, credentials);

    if (!argv["no-workflow"]) {
      console.log("\n");
      await generateCRUDWorkflow(tableName, credentials);
    }

    console.log("\n");
    const searchColumnName = colNames.length > 0 ? colNames[0] : "id";
    await createAppForTable(
      `${tableName} App`,
      tableName,
      searchColumnName,
      credentials,
      format,
    );
  }
};

const insertSampleData = async function (
  tableName: string,
  credentials: Credentials
) {
  const infoRes = await getRequest(
    `${credentials.origin}/api/grid/${credentials.gridId}/table/${tableName}/info`,
    false
  );
  const retoolDBInfo: DBInfoPayload = infoRes.data;
  const { fields } = retoolDBInfo.tableInfo;

  const generatedData = await generateDataWithGPT(
    retoolDBInfo,
    fields,
    0,
    credentials,
    false
  );
  if (generatedData) {
    await postRequest(
      `${credentials.origin}/api/grid/${credentials.gridId}/action`,
      {
        kind: "BulkInsertIntoTable",
        tableName: tableName,
        additions: generatedData,
      }
    );
  }
};

const commandModule: CommandModule = {
  command,
  describe,
  builder,
  handler,
};

export default commandModule;
