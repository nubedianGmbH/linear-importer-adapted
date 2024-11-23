import {
  ENABLE_DETAILED_LOGGING,
  MAX_REQUESTS_PER_SECOND,
} from "../config/config.js";
import parseCSV from "./csv/parse.mjs";
import chalk from "chalk";

import fetchStatuses from "./statuses/list.mjs";

// import deleteLabels from "./labels/delete.mjs";
import createLabels from "./labels/create.mjs";
import fetchLabels from "./labels/list.mjs";
import fetchIssuesForTeam from "./issues/list.mjs";
import createIssue from "./issues/create.mjs";

import proceedWithImport from "./prompts/proceed_with_import.js";

import { RELEASE_LABEL_NAME } from "./init.mjs";
import init from "./init.mjs";
import readSuccessfulImports from "./logger/read_successful_imports.mjs";
import logSuccessfulImport from "./logger/log_successful_import.mjs";

// PROMPTS
const {
  releaseStories,
  pivotalStories,
  // statusTypes,
  labels,
  csvFilename,
  pivotalUsers,
} = await parseCSV();

// Optional Import params
// const { importFiles } = await importFileAttachments();
// const { importLabels } = await importLabelsFromCSV();
// const estimationScale = await importPivotalEstimates({ teamId });
// const { selectedStatusTypes } = await selectStatusTypes(statusTypes);
const successfulImports = await readSuccessfulImports(teamName);
const uniquePivotalStories = [
  ...new Map(pivotalStories.map((story) => [story.id, story])).values(),
];

const newReleaseStories = releaseStories.filter(
  (story) => !successfulImports.has(story.id),
);

// Filter pivotal stories based on selectedStatusTypes
const newPivotalStories = uniquePivotalStories.filter(
  (story) =>
    selectedStatusTypes.includes(story.type.toLowerCase()) &&
    !successfulImports.has(story.id),
);

if (ENABLE_DETAILED_LOGGING) {
  console.log("\nFiltering results:");
  console.log("- Total stories before filtering:", uniquePivotalStories.length);
  console.log(
    "- Stories matching selected type(s):",
    uniquePivotalStories.filter((story) =>
      selectedStatusTypes.includes(story.type.toLowerCase()),
    ).length,
  );
  console.log(
    "- Stories remaining after excluding imports:",
    newPivotalStories.length,
  );
}

// const { userConfirmedProceed } = await proceedWithImport({
//   releaseStories: newReleaseStories,
//   pivotalStories: newPivotalStories,
//   successfulImportsLength: successfulImports.size,
//   selectedStatusTypes,
// });

if (userConfirmedProceed) {
  // if (newReleaseStories.length + newPivotalStories.length === 0) {
  //   console.log(chalk.bold.green("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  //   console.log(chalk.bold.green("✨ All stories already imported! ✨"));
  //   console.log(chalk.bold.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));
  //   process.exit(0);
  // }

  // Creates Team Labels and Workflow Statuses
  await init({ teamId, teamName, pivotalUsers });

  // Create Labels from CSV
  if (importLabels) await createLabels({ teamId, labels });

  const teamStatuses = await fetchStatuses({ teamId });
  const teamLabels = await fetchLabels({ teamId });

  const processReleaseStories = async () => {
    if (newReleaseStories?.length === 0) {
      console.log(
        chalk.cyan(`No release stories to convert for Team ${teamName}`),
      );
    } else {
      console.log(
        chalk.cyan(
          `Converting ${newReleaseStories.length} Release Stories into Linear Cycles for Team ${teamName}`,
        ),
      );

      for (const [index, pivotalStory] of newReleaseStories.entries()) {
        const stateId = teamStatuses.find(
          (state) => state.name === `pivotal - ${pivotalStory.state}`,
        )?.id;
        const pivotalStoryTypeLabelId = teamLabels.find(
          (label) => label.name === `pivotal - ${pivotalStory.type}`,
        )?.id;
        const otherLabelIds = pivotalStory.labels
          ? pivotalStory.labels
              .split(",")
              .map((label) => label.trim())
              .map(
                (label) =>
                  teamLabels.find((teamLabel) => teamLabel.name === label)?.id,
              )
              .filter((id) => id)
          : [];
        const labelIds = [pivotalStoryTypeLabelId, ...otherLabelIds].filter(
          Boolean,
        );

        const importNumber = index + 1;
        await new Promise((resolve) => setTimeout(resolve, DELAY));

        try {
          await createIssue({
            importNumber,
            teamId,
            teamName,
            pivotalStory,
            stateId,
            labelIds,
            csvFilename,
            importFiles,
            estimationScale,
          });
          await logSuccessfulImport(pivotalStory.id, teamName);
        } catch (error) {
          console.error(
            `Failed to import release story ${pivotalStory.id}:`,
            error,
          );
        }
      }
    }
  };

  // Process Release Stories first
  if (CREATE_ISSUES) {
    if (selectedStatusTypes.includes("release")) {
      await processReleaseStories();
    }
  }

  // Add delay to ensure synchronicity
  await new Promise((resolve) => setTimeout(resolve, DELAY * 2));

  // Process Pivotal Stories
  const processPivotalStories = async () => {
    if (newPivotalStories?.length === 0) {
      console.log("No Pivotal Stories found to import.");
    } else {
      console.log(
        chalk.cyan(
          `Converting ${newPivotalStories.length} Pivotal Stories into Linear Issues for Team ${teamName}`,
        ),
      );

      // Fetch all release issues
      const releaseIssues = await fetchIssuesForTeam({
        teamId,
        filters: { labels: { some: { name: { eq: RELEASE_LABEL_NAME } } } },
      });

      for (const [index, pivotalStory] of newPivotalStories.entries()) {
        const parentIssue = releaseIssues?.find((releaseIssue) =>
          releaseIssue.title.includes(`[${pivotalStory.iteration}]`),
        );
        const stateId = teamStatuses.find(
          (state) => state.name === `pivotal - ${pivotalStory.state}`,
        )?.id;
        const pivotalStoryTypeLabelId = teamLabels.find(
          (label) => label.name === `pivotal - ${pivotalStory.type}`,
        )?.id;
        const otherLabelIds = pivotalStory.labels
          ? pivotalStory.labels
              .split(",")
              .map((label) => label.trim())
              .map(
                (label) =>
                  teamLabels.find((teamLabel) => teamLabel.name === label)?.id,
              )
              .filter((id) => id)
          : [];
        const labelIds = [pivotalStoryTypeLabelId, ...otherLabelIds].filter(
          Boolean,
        );

        const importNumber = index + 1;
        await new Promise((resolve) => setTimeout(resolve, DELAY));

        try {
          await createIssue({
            importNumber,
            teamId,
            teamName,
            pivotalStory,
            stateId,
            labelIds,
            csvFilename,
            importFiles,
            estimationScale,
          });
          await logSuccessfulImport(pivotalStory.id, teamName);
        } catch (error) {
          console.error(`Failed to import story ${pivotalStory.id}:`, error);
        }
      }
    }
  };

  // Process all remaining Pivotal Stories
  if (CREATE_ISSUES) await processPivotalStories();
}

// Close Logger
process.on("exit", () => {
  logger.close();
});
