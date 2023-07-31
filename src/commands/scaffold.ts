import { CommandModule } from "yargs";

import { createApp, deleteApp } from "../utils/apps";
import { getAndVerifyFullCredentials } from "../utils/credentials";
import {
  collectColumnNames,
  collectTableName,
  createTable,
  deleteTable,
} from "../utils/table";
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
};
const handler = async function (argv: any) {
  const credentials = await getAndVerifyFullCredentials();

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

    await deleteTable(tableName, credentials, false);
    await deleteWorkflow(workflowName, credentials, false);
    await deleteApp(tableName, credentials, false);
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
    console.log(
      `Generate mock data with: \`retool db --gendata ${tableName}\``
    );
    console.log("\n");
    await generateCRUDWorkflow(tableName, credentials);
    console.log("\n");

    await createApp(tableName, credentials);

    console.log(
      "\nTo generate an app to visually perform CRUD on table above:"
    );
    console.log(`1: Go to ${credentials.origin}`);
    console.log(`2: Click "Create New" > "From Database"`);
    console.log(`3: Resource is "retool_db", select table "${tableName}"`);
  }
};

const commandModule: CommandModule = {
  command,
  describe,
  builder,
  handler,
};

export default commandModule;
