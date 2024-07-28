import { ArgumentsCamelCase, CommandModule, InferredOptionTypes } from "yargs";

import {
  collectAppName,
  createApp,
  createAppForTable,
  deleteApp,
  exportApp,
  getAppsAndFolders,
} from "../utils/apps";
import type { App } from "../utils/apps";
import { createBuilder } from "../utils/command";
import { getAndVerifyCredentialsWithRetoolDB } from "../utils/credentials";
import { dateOptions } from "../utils/date";
import {
  collectTableName,
  fetchTableInfo,
  verifyTableExists,
} from "../utils/table";
import { logDAU } from "../utils/telemetry";

const command = "apps";
const describe = "Interface with Retool Apps.";
const builder = createBuilder({
  create: {
    alias: "c",
    describe: `Create a new app.`,
    type: "boolean",
  },
  "create-from-table": {
    alias: "t",
    describe: `Create a new app to visualize a Retool DB table.`,
    type: "boolean",
  },
  list: {
    alias: "l",
    describe: `List folders and apps at root level. Optionally provide a folder name to list all apps in that folder. Usage:
      retool apps -l [folder-name]`,
    // Intentionally untyped to allow for string or boolean.
  },
  "list-recursive": {
    alias: "r",
    describe: `List all apps and folders.`,
    type: "boolean",
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

type AppsOptionTypes = InferredOptionTypes<typeof builder>;

const handler = async function (argv: ArgumentsCamelCase<AppsOptionTypes>) {
  const credentials = await getAndVerifyCredentialsWithRetoolDB();
  // fire and forget
  void logDAU(credentials);

  // Handle `retool apps --list [folder-name]`
  if (argv.list || argv.listRecursive) {
    let { apps, folders } = await getAppsAndFolders(credentials);
    const rootFolderId = folders?.find(
      (folder) => folder.name === "root" && folder.systemFolder
    )?.id;

    // Only list apps in the specified folder.
    const folderName = argv.list;
    if (typeof folderName === "string") {
      const folderId = folders?.find(
        (folder) => folder.name === folderName
      )?.id;
      if (folderId) {
        const appsInFolder = apps?.filter((app) => app.folderId === folderId);
        if (appsInFolder && appsInFolder.length > 0) {
          printApps(appsInFolder);
        } else {
          console.log(`No apps found in ${folderName}.`);
        }
      } else {
        console.log(`No folder named ${folderName} found.`);
      }
    }

    // List all folders, then all apps in root folder.
    else {
      // Filter out undesired folders/apps.
      folders = folders?.filter((folder) => !folder.systemFolder);
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
        console.log("No folders or apps found.");
      } else {
        // List all folders
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
        // List all apps in root folder.
        printApps(apps);
      }
    }
  }

  // Handle `retool apps --create-from-table`
  else if (argv.createFromTable) {
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
      credentials
    );
  }

  // Handle `retool apps --create`
  else if (argv.create) {
    const appName = await collectAppName();
    await createApp(appName, credentials);
  }

  // Handle `retool apps -d <app-name>`
  else if (argv.delete) {
    const appNames = argv.delete;
    for (const appName of appNames) {
      await deleteApp(appName, credentials, true);
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
    console.log(
      "No flag specified. See `retool apps --help` for available flags."
    );
  }
};

function printApps(apps: Array<App> | undefined): void {
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
}

const commandModule: CommandModule<any, AppsOptionTypes> = {
  command,
  describe,
  builder,
  handler,
};

export default commandModule;
