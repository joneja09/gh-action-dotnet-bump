const path = require('path');
const { promises } = require('fs');
const semver = require('semver');
const {
  findPreReleaseId,
  analyseVersionChange,
  analyseVersionPartChange,
  bumpVersion,
  commitChanges,
  logInfo,
  setGitConfigs,
  checkoutBranch,
  resolveCurrentBranch,
  getProjectContent,
  getCurrentVersionCsproj,
  getNewProjectContentCsproj,
  getCurrentVersionAssembly,
  getNewProjectContentAssembly,
  getCommitMessages,
  getRelevantCommitMessages,
  normalizeCurrentVersion
} = require('./utils');

function getCurrentVersion(type, projectFile) {
  if (type === 'csproj') {
    return getCurrentVersionCsproj(projectFile);
  }
  if (type === 'assembly') {
    return getCurrentVersionAssembly(projectFile);
  }

  throw new Error(`Unsupported type "${type}". Use "csproj" or "assembly".`);
}

function getNewFileContents(type, newVersion, projectFile) {
  if (type === 'csproj') {
    return getNewProjectContentCsproj(newVersion, projectFile);
  }
  if (type === 'assembly') {
    return getNewProjectContentAssembly(newVersion, projectFile);
  }

  throw new Error(`Unsupported type "${type}". Use "csproj" or "assembly".`);
}

async function updateVersion(type, newVersion, pathToDocument, projectFile, dryRun) {
  const newContent = getNewFileContents(type, newVersion, projectFile);
  logInfo('Prepared updated project file');

  if (dryRun) {
    logInfo('Skipping file write because dry-run is enabled.');
    return;
  }

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await promises.writeFile(pathToDocument, newContent);
  logInfo('New project file written');
}

async function determineNewVersionFromCommits({
  tagPrefix,
  majorWording,
  minorWording,
  patchWording,
  rcWording,
  releaseCommitMessageRegex,
  defaultBump
}) {
  const token = process.env.GITHUB_TOKEN;
  // eslint-disable-next-line security/detect-non-literal-require
  const gitEvents = process.env.GITHUB_EVENT_PATH ? require(process.env.GITHUB_EVENT_PATH) : {};
  logInfo(`Git event: ${gitEvents.ref || gitEvents.action || 'unknown'}`);

  const commitMessages = await getCommitMessages(gitEvents, token);
  logInfo(`Found ${commitMessages.length} commit message(s)`);

  const relevantCommitMessages = getRelevantCommitMessages(commitMessages, releaseCommitMessageRegex, tagPrefix);
  logInfo(`Relevant commit messages: ${relevantCommitMessages.length}`);

  if (relevantCommitMessages.length === 0) {
    logInfo('No action necessary because latest commit was a bump!');
    return {
      doMajorVersion: false,
      doMinorVersion: false,
      doPatchVersion: false,
      doPreReleaseVersion: false,
      commitMessages: []
    };
  }

  return {
    ...analyseVersionChange(majorWording, minorWording, patchWording, rcWording, relevantCommitMessages, defaultBump),
    commitMessages: relevantCommitMessages
  };
}

async function determineVersion({
  currentVersion,
  versionPart,
  tagPrefix,
  majorWording,
  minorWording,
  patchWording,
  rcWording,
  releaseCommitMessageRegex,
  preReleaseId,
  defaultBump
}) {
  let doMajorVersion = false;
  let doMinorVersion = false;
  let doPatchVersion = false;
  let doPreReleaseVersion = false;
  let commitMessages = [];

  if (versionPart) {
    const result = analyseVersionPartChange(versionPart);
    doMajorVersion = result.doMajorVersion;
    doMinorVersion = result.doMinorVersion;
    doPatchVersion = result.doPatchVersion;
    doPreReleaseVersion = result.doPreReleaseVersion;
  } else {
    const result = await determineNewVersionFromCommits({
      tagPrefix,
      majorWording,
      minorWording,
      patchWording,
      rcWording,
      releaseCommitMessageRegex,
      defaultBump
    });
    doMajorVersion = result.doMajorVersion;
    doMinorVersion = result.doMinorVersion;
    doPatchVersion = result.doPatchVersion;
    doPreReleaseVersion = result.doPreReleaseVersion;
    commitMessages = result.commitMessages || [];
  }

  logInfo(`Should do version change? ${JSON.stringify({doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion})}`);

  if (!doMajorVersion && !doMinorVersion && !doPatchVersion && !doPreReleaseVersion) {
    logInfo('Could not find any version bump to make, skipping.');
    return null;
  }

  let resolvedPreReleaseId = preReleaseId;
  if (doPreReleaseVersion && !resolvedPreReleaseId) {
    resolvedPreReleaseId = findPreReleaseId(rcWording, commitMessages);
  }

  const nextVersion = bumpVersion(currentVersion, doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion, resolvedPreReleaseId);
  if (!nextVersion) {
    throw new Error(`Unable to bump version "${currentVersion}". It must be a valid semantic version.`);
  }
  return nextVersion;
}

async function prepareGit(dryRun, skipTag, skipCommit, skipPush, targetBranch) {
  if (dryRun) {
    logInfo('Skipping git processes because dry-run is enabled. (Tag|Commit|Push)');
    return false;
  }

  const performGitUpdates = !(skipTag && skipCommit && skipPush);
  if (!performGitUpdates) {
    return false;
  }

  await setGitConfigs();
  if (targetBranch) {
    logInfo(`Checking out target branch: ${targetBranch}`);
    await checkoutBranch(targetBranch);
  }
  return true;
}

async function bumpProjectVersion({
  tagPrefix = '',
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
  releaseCommitMessageRegex,
  defaultBump
}) {
  if (!pathToDocument) {
    throw new Error('path-to-file is required.');
  }

  if (versionOverride && !semver.valid(versionOverride)) {
    throw new Error(`version-override "${versionOverride}" is not a valid semantic version.`);
  }

  const currentBranch = resolveCurrentBranch(targetBranch);
  const performGitUpdates = await prepareGit(dryRun, skipTag, skipCommit, skipPush, targetBranch);

  const workspace = process.env.GITHUB_WORKSPACE || '';
  const resolvedPath = path.join(workspace, pathToDocument);
  logInfo(`Path to document: ${resolvedPath}`);

  const projectFile = getProjectContent(resolvedPath).toString();
  const currentVersion = getCurrentVersion(type, projectFile);

  if (!currentVersion) {
    throw new Error(`Could not find a current version in ${pathToDocument}. Add a <Version> or <VersionPrefix> property, or an AssemblyVersion attribute.`);
  }

  const normalizedCurrentVersion = normalizeCurrentVersion(currentVersion);
  logInfo(`Current version: ${normalizedCurrentVersion}`);

  const newVersion = versionOverride
    ? versionOverride
    : await determineVersion({
      currentVersion: normalizedCurrentVersion,
      versionPart,
      tagPrefix,
      majorWording,
      minorWording,
      patchWording,
      rcWording,
      releaseCommitMessageRegex,
      preReleaseId,
      defaultBump
    });

  if (!newVersion) {
    return {wasBumped: false, oldVersion: normalizedCurrentVersion, newVersion: null};
  }

  logInfo(`New version: ${newVersion}`);
  await updateVersion(type, newVersion, resolvedPath, projectFile, dryRun);

  if (dryRun) {
    logInfo('Skipping commit because dry-run is enabled.');
    return {wasBumped: true, oldVersion: normalizedCurrentVersion, newVersion};
  }

  if (performGitUpdates) {
    logInfo(`Current branch: ${currentBranch || 'unknown'}`);
    await commitChanges({
      newVersion,
      skipCommit,
      skipTag,
      skipPush,
      commitMessageToUse,
      pathToDocument: resolvedPath,
      branch: currentBranch,
      tagPrefix
    });
    logInfo('Git updates complete');
  }

  return {wasBumped: true, oldVersion: normalizedCurrentVersion, newVersion};
}

module.exports = bumpProjectVersion;
module.exports.determineVersion = determineVersion;
module.exports.getCurrentVersion = getCurrentVersion;
