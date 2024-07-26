import { ArgumentsCamelCase, CommandModule, InferredOptionTypes } from "yargs";

import {
  collectAppName,
  createApp,
  createAppForTable,
  deleteApp,
  exportApp,
  getAppsAndFolders,
} from "../utils/apps";
import type { App, Folder } from "../utils/apps";
import { createBuilder } from "../utils/command"
import { getAndVerifyCredentialsWithRetoolDB } from "../utils/credentials";
import { dateOptions } from "../utils/date";
import {
  collectTableName,
  fetchTableInfo,
  verifyTableExists,
} from "../utils/table";
import { logDAU } from "../utils/telemetry";

const outputFormats = ["default", "json"] as const;
export type OutputFormat = typeof outputFormats[number]

const command = "apps";
const describe = "Interface with Retool Apps.";
const builder = createBuilder({
  create: {
    alias: "c",
    describe: `Create a new app. Optionally provide an app name to be created. Usage:
      retool apps -c [app-name]`,
  },
  "create-from-table": {
    alias: "t",
    describe: `Create a new app to visualize a Retool DB table.`,
    type: "boolean",
  },
  force: {
    describe: "Force the operation without confirmation",
    type: "boolean",
  },
  list: {
    alias: "l",
    describe: `List folders and apps at root level. Optionally provide a folder name to list all apps in that folder. Usage:
      retool apps -l [folder-name]`,
  },
  "list-recursive": {
    alias: "r",
    describe: `List all apps and folders.`,
    type: "boolean",
  },
  "output-format": {
    choices: outputFormats,
    default: "default",
    describe: "Specify output format",
  },
  delete: {
    alias: "d",
    describe: `Delete an app. Usage:
      retool apps -d <app-name>`,
    string: true,
    type: "array",
  },
  export: {
    alias: "e",
    describe: `Export an app JSON. Usage:
      retool apps -e <app-name>`,
    string: true,
    type: "array",
  },
} as const);
type AppOptionType = InferredOptionTypes<typeof builder>
const handler = async function (argv: ArgumentsCamelCase<AppOptionType>) {
  const credentials = await getAndVerifyCredentialsWithRetoolDB();
  // fire and forget
  void logDAU(credentials);

  // Handle `retool apps --list [folder-name]`
  const listOption = argv.list
  if (listOption || argv.listRecursive) {
    let { apps, folders } = await getAppsAndFolders(credentials);
    const rootFolderId = folders?.find(
      (folder) => folder.name === "root" && folder.systemFolder === true
    )?.id;

    // Only list apps in the specified folder.
    if (typeof listOption === "string") {
      const folder = folders?.find((folder) => folder.name === listOption);
      if (folder) {
        const appsInFolder = apps?.filter((app) => app.folderId === folder.id);
        if (appsInFolder && appsInFolder.length > 0) {
          printApps([], appsInFolder, argv.outputFormat);
        } else {
          console.error(`No apps found in ${listOption}.`);
        }
      } else {
        console.error(`No folder named ${listOption} found.`);
      }
    }

    // List all folders, then all apps in root folder.
    else {
      // Filter out undesired folders/apps.
      folders = folders?.filter((folder) => folder.systemFolder === false);
      if (!argv.listRecursive) {
        apps = apps?.filter((app) => app.folderId === rootFolderId);
      }

      // Sort from oldest to newest.
      folders?.sort((a, b) => {
        return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      });
      apps?.sort((a, b) => {
        return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
      });

      if ((!folders || folders.length === 0) && (!apps || apps.length === 0)) {
        console.error("No folders or apps found.");
      } else {
        // List all folders and apps in root folder.
        printApps(folders, apps, argv.outputFormat);
      }
    }
  }

  // Handle `retool apps --create-from-table`
  else if (argv.t) {
    const tableName = await collectTableName();
    await verifyTableExists(tableName, credentials);
    const tableInfo = await fetchTableInfo(tableName, credentials);
    if (!tableInfo) {
      console.error(`Table ${tableName} info not found.`);
      process.exit(1);
    }
    const appName = await collectAppName();
    // Use the first non-pkey column as the search column.
    const searchColumnName = tableInfo.fields.find(
      (field) => field.name !== tableInfo.primaryKeyColumn
    )?.name;

    await createAppForTable(
      appName,
      tableName,
      searchColumnName || tableInfo.primaryKeyColumn,
      credentials,
      argv.outputFormat,
    );
  }

  // Handle `retool apps --create`
  else if (argv.create) {
    const appName = typeof argv.create === "string" ? argv.create : await collectAppName();
    await createApp(appName, credentials, argv.outputFormat);
  }

  // Handle `retool apps -d <app-name>`
  else if (argv.delete) {
    const appNames = argv.delete;
    for (const appName of appNames) {
      await deleteApp(appName, credentials, !argv.force, argv.outputFormat);
    }
  }

  // Handle `retool apps -e <app-name>`
  else if (argv.export) {
    const appNames = argv.export;
    for (const appName of appNames) {
      await exportApp(appName, credentials);
    }
  }

  // No flag specified.
  else {
    console.error(
      "No flag specified. See `retool apps --help` for available flags."
    );
  }
};

function printApps(folders: Array<Folder> | undefined, apps: Array<App> | undefined, format: OutputFormat): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify({ folders, apps }, null, 2));
      break;
    default:
        if (folders && folders?.length > 0) {
          folders.forEach((folder) => {
            const date = new Date(Date.parse(folder.updatedAt));
            console.log(
              `${date.toLocaleString(undefined, dateOptions)}     📂     ${
                folder.name
              }/`
            );
          });
        }
      if (apps && apps?.length > 0) {
        apps.forEach((app) => {
          const date = new Date(Date.parse(app.updatedAt));
          console.log(
            `${date.toLocaleString(undefined, dateOptions)}     ${
              app.isGlobalWidget ? "🔧" : "💻"
            }     ${app.name}`
          );
        });
      }
      break;
  }
}

const commandModule: CommandModule<any, AppOptionType> = {
  command,
  describe,
  builder,
  handler,
};

export default commandModule;
