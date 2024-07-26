import chalk from "chalk";

import { Credentials } from "./credentials";
import { getRequest, postRequest } from "./networking";
import { OutputFormat } from "../commands/apps";

const fs = require("fs");

const axios = require("axios");
const inquirer = require("inquirer");
const ora = require("ora");

export type App = {
  uuid: string;
  name: string;
  folderId: number;
  id: string;
  protected: boolean;
  updatedAt: string;
  createdAt: string;
  isGlobalWidget: boolean; // is a module
};

export type Folder = {
  id: number;
  parentFolderId: number;
  name: string;
  systemFolder: boolean;
  createdAt: string;
  updatedAt: string;
  folderType: string;
  accessLevel: string;
};

export async function createApp(
  appName: string,
  credentials: Credentials,
  outputFormat: OutputFormat,
) {
  const spinner = ora("Creating App").start();

  const { data: createAppResult } = await postRequest(
    `${credentials.origin}/api/pages/createPage`,
    {
      pageName: appName,
      isGlobalWidget: false,
      isMobileApp: false,
      multiScreenMobileApp: false,
    }
  );
  spinner.stop();

  const { page } = createAppResult;
  if (!page?.uuid) {
    console.error("Error creating app.");
    console.error(createAppResult);
    process.exit(1);
  }

  switch (outputFormat) {
    case "json":
      console.log(JSON.stringify(createAppResult, null, 2));
      break;
    default:
      console.log("Successfully created an App. 🎉");
      console.log(
        `${chalk.bold("View in browser:")} ${credentials.origin}/editor/${
          page.uuid
        }`
      );
      break;
  }
}

export async function createAppForTable(
  appName: string,
  tableName: string,
  columnName: string, //The column to use for search bar.
  credentials: Credentials,
  format: OutputFormat,
) {
  const spinner = ora("Creating App").start();

  const { data: createAppResult } = await postRequest(
    `${credentials.origin}/api/pages/autogeneratePage`,
    {
      appName,
      resourceName: credentials.retoolDBUuid,
      tableName,
      columnName,
    }
  );
  spinner.stop();

  const { pageUuid } = createAppResult;
  if (!pageUuid) {
    console.error("Error creating app.");
    console.error(createAppResult);
    process.exit(1);
  }

  switch (format) {
    case "json":
      console.log(JSON.stringify(createAppResult, null, 2));
      break;
    default:
      console.log("Successfully created an App. 🎉");
      console.log(`${chalk.bold("View in browser:")} ${credentials.origin}/editor/${pageUuid}`);
      break;
  }
}

export async function exportApp(appName: string, credentials: Credentials) {
  // Verify that the provided appName exists.
  const { apps } = await getAppsAndFolders(credentials);
  const app = apps?.filter((app) => {
    if (app.name === appName) {
      return app;
    }
  });
  if (app?.length != 1) {
    console.log(`0 or >1 Apps named ${appName} found. 😓`);
    process.exit(1);
  }

  // Export the app.
  const spinner = ora("Exporting App").start();
  const { data: exportAppResult } = await axios.post(
    `${credentials.origin}/api/pages/uuids/${app[0].uuid}/export`,
    {},
    {
      responseType: "stream",
    }
  );

  // Write the response to a file.
  try {
    const filePath = `${appName}.json`;
    const writer = fs.createWriteStream(filePath);
    exportAppResult.pipe(writer);
  } catch (error) {
    console.error("Error exporting app.");
    process.exit(1);
  }

  spinner.stop();
  console.log(`Exported ${appName} app. 📦`);
}

export async function deleteApp(
  appName: string,
  credentials: Credentials,
  confirmDeletion: boolean,
  outputFormat: OutputFormat,
) {
  if (confirmDeletion) {
    const { confirm } = await inquirer.prompt([
      {
        name: "confirm",
        message: `Are you sure you want to delete ${appName}?`,
        type: "confirm",
      },
    ]);
    if (!confirm) {
      process.exit(0);
    }
  }

  // Verify that the provided appName exists.
  const { apps } = await getAppsAndFolders(credentials);
  const app = apps?.filter((app) => {
    if (app.name === appName) {
      return app;
    }
  });
  if (app?.length != 1) {
    console.error(`0 or >1 Apps named ${appName} found. 😓`);
    process.exit(1);
  }

  // Delete the app.
  const spinner = ora("Deleting App").start();
  const { data: deleteAppResult } = await postRequest(`${credentials.origin}/api/folders/deletePage`, {
    pageId: app[0].id,
  });
  spinner.stop();

  switch (outputFormat) {
    case "json":
      console.log(JSON.stringify(deleteAppResult, null, 2));
      break;
    default:
      console.log(`Deleted ${appName} app. 🗑️`);
      break;
  }
}

// Fetch all apps (excluding apps in trash).
export async function getAppsAndFolders(
  credentials: Credentials
): Promise<{ apps?: Array<App>; folders?: Array<Folder> }> {
  const spinner = ora(`Fetching all apps.`).start();

  const fetchAppsResponse = await getRequest(
    `${credentials.origin}/api/pages?mobileAppsOnly=false`
  );

  spinner.stop();

  const apps: Array<App> | undefined = fetchAppsResponse?.data?.pages;
  const folders: Array<Folder> | undefined = fetchAppsResponse?.data?.folders;
  const trashFolderId = folders?.find(
    (folder) => folder.name === "archive" && folder.systemFolder === true
  )?.id;

  return {
    apps: apps?.filter((app) => app.folderId !== trashFolderId),
    folders: fetchAppsResponse?.data?.folders,
  };
}

export async function collectAppName(): Promise<string> {
  const { appName } = await inquirer.prompt([
    {
      name: "appName",
      message: "App name?",
      type: "input",
    },
  ]);

  if (appName.length === 0) {
    console.error("Error: App name cannot be blank.");
    process.exit(1);
  }

  // Remove spaces from app name.
  return appName.replace(/\s/g, "_");
}
