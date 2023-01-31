const path = require('path');
const { promises } = require('fs');
const core = require('@actions/core');
const {
  exitSuccess,
  findPreReleaseId,
  analyseVersionChange,
  analyseVersionPartChange,
  bumpVersion,
  commitChanges,
  logInfo,
  setGitConfigs,
  getProjectContent,
  getCurrentVersionCsproj,
  getNewProjectContentCsproj,
  getCurrentVersionAssembly,
  getNewProjectContentAssembly,
  getCommitMessages,
  getRelevantCommitMessages,
  logError
} = require('./utils');

var isDryRun = false;

function getCurrentVersion(type, projectFile) {
  if (type === 'csproj') {
    return getCurrentVersionCsproj(projectFile);
  } else if (type === 'assembly') {
    return getCurrentVersionAssembly(projectFile);
  }

  logError(`Type not recognized: ${type}`);
  return null;
}

function getNewFileContents(type, newVersion, projectFile)
{
  if (type === 'csproj') {
    return getNewProjectContentCsproj(newVersion, projectFile);
  } else if (type === 'assembly') {
    return getNewProjectContentAssembly(newVersion, projectFile);
  }

  return null;
}

async function updateVersion(type, newVersion, pathToDocument, projectFile) {
  let newContent = getNewFileContents(type, newVersion, projectFile);

  logInfo(`New project file: ${newContent}`);

  if (isDryRun)
  {
    logInfo('Skipping File Write.');
  }
  else 
  {
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    await promises.writeFile(pathToDocument, newContent);
    logInfo('New project file written');
  }
}

function determineNewVersionFromVersionPart(versionPart) {
  return analyseVersionPartChange(versionPart);
}

async function determineNewVersionFromCommits(tagPrefix, majorWording, minorWording, patchWording, rcWording, releaseCommitMessageRegex) {
  const token = process.env.GITHUB_TOKEN;
    
  // eslint-disable-next-line security/detect-non-literal-require
  const gitEvents = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {};
  logInfo(`Found the following git events: ${JSON.stringify(gitEvents, null, 4)}`);

  const commitMessages = await getCommitMessages(gitEvents, token);
  logInfo(`Found commit messages: ${JSON.stringify(commitMessages, null, 4)}`);

  const relevantCommitMessages = getRelevantCommitMessages(commitMessages, releaseCommitMessageRegex, tagPrefix);
  logInfo(`Relevant commit messages: ${JSON.stringify(relevantCommitMessages, null, 4)}`);

  if (relevantCommitMessages.length === 0) {
    exitSuccess('No action necessary because latest commit was a bump!');
    return false;
  }

  return analyseVersionChange(majorWording, minorWording, patchWording, rcWording, commitMessages);
}

async function determineVersion(currentVersion, versionPart, tagPrefix, majorWording, minorWording, patchWording, rcWording, releaseCommitMessageRegex, preReleaseId) {
  let doMajorVersion = false, doMinorVersion = false, doPatchVersion = false, doPreReleaseVersion = false;
  if (versionPart > '')
  {
    const result = determineNewVersionFromVersionPart(versionPart);
    doMajorVersion = result.doMajorVersion;
    doMinorVersion = result.doMinorVersion;
    doPatchVersion = result.doPatchVersion;
    doPreReleaseVersion = result.doPreReleaseVersion;
  }
  else
  {
    const result = await determineNewVersionFromCommits(tagPrefix, majorWording, minorWording, patchWording, rcWording, releaseCommitMessageRegex);
    doMajorVersion = result.doMajorVersion;
    doMinorVersion = result.doMinorVersion;
    doPatchVersion = result.doPatchVersion;
    doPreReleaseVersion = result.doPreReleaseVersion;
  }

  logInfo(`Should do version change? ${JSON.stringify({doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion})}`);

  //Should we do any version updates? 
  if (!doMajorVersion && !doMinorVersion && !doPatchVersion && !doPreReleaseVersion) {
    logInfo('Could not find any version bump to make, skipping.');
    return null;
  }
  
  // case: if prerelease id not explicitly set, use the found prerelease id in commit messages
  if (doPreReleaseVersion && !preReleaseId) {
    preReleaseId = findPreReleaseId(rcWording, commitMessages);
  }

  return bumpVersion(currentVersion, doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion, preReleaseId);
}

module.exports = async (
  tagPrefix,
  minorWording,
  majorWording,
  patchWording,
  versionPart,
  rcWording,
  skipTag,
  skipCommit,
  skipPush,
  pathToDocument,
  targetBranch,
  preReleaseId,
  commitMessageToUse, 
  type,
  dryRun,
  versionOverride,
  // eslint-disable-next-line sonarjs/cognitive-complexity
  releaseCommitMessageRegex) => {  
  
  isDryRun = dryRun;

  if (dryRun)
  {
    logInfo('Skipping Git Processes. (Tag|Commit|Push)');
  }

  const performGitUpdates = !dryRun && !(skipTag && skipCommit && skipPush);
  if (performGitUpdates) {
    await setGitConfigs();
  }

  const workspace = process.env.GITHUB_WORKSPACE || '';

  pathToDocument = path.join(workspace, pathToDocument);
  logInfo(`Path to document: ${pathToDocument}`);
  
  const projectFile = getProjectContent(pathToDocument).toString();
  logInfo(`projectFile: ${projectFile}`);
  
  let currentVersion = getCurrentVersion(type, projectFile);

  if (currentVersion === undefined || currentVersion === null) {
    logError(`Could not find the current version as it was undefined: ${currentVersion}`);
    return false;
  }

  core.setOutput('oldVersion', currentVersion);
  logInfo(`Current version: ${currentVersion}`);
    
  //Bump version
  const newVersion = versionOverride > '' ? versionOverride : await determineVersion(currentVersion, versionPart, tagPrefix, majorWording, minorWording, patchWording, rcWording, releaseCommitMessageRegex, preReleaseId);

  if (newVersion === null)
  {
    return false;
  }

  core.setOutput('newVersion', `${newVersion}`);
  logInfo(`New version: ${newVersion}`);
  
  await updateVersion(type, newVersion, pathToDocument, projectFile);

  if (dryRun)
  {
    logInfo('Skipping commit');
  }
  else
  {
    let currentBranch;
    if (performGitUpdates)
    {
      // eslint-disable-next-line security/detect-child-process
      currentBranch = (/refs\/[a-zA-Z]+\/(.*)/).exec(process.env.GITHUB_REF)[1];
      if (process.env.GITHUB_HEAD_REF) {
        // Comes from a pull request
        currentBranch = process.env.GITHUB_HEAD_REF;
      }
      if (targetBranch !== '') {
        // We want to override the branch that we are pulling / pushing to
        currentBranch = targetBranch;
      }
      logInfo(`Current branch: ${currentBranch}`);
    }

    await commitChanges(newVersion, skipCommit, skipTag, skipPush, commitMessageToUse);
    logInfo('Changes committed');
  }

  return true;
};
