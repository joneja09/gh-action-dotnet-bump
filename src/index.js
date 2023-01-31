const core = require('@actions/core');
const bumpVersion = require('./bumper');
const { exitSuccess, logError, exitFailure } = require('./utils');

(async () => {
  try {
    const tagPrefix = core.getInput('tag-prefix');
    const minorWording = core.getInput('minor-wording');
    const majorWording = core.getInput('major-wording');
    const patchWording = core.getInput('patch-wording');
    const versionPart = core.getInput('version-part');
    const rcWording = core.getInput('release-candidate-wording');
    const skipTag = core.getInput('skip-tag') > '' ? core.getBooleanInput('skip-tag') : true;
    const skipCommit = core.getInput('skip-commit') > '' ? core.getBooleanInput('skip-commit') : false;
    const skipPush = core.getInput('skip-push') > '' ? core.getBooleanInput('skip-push') : false;
    const pathToDocument = core.getInput('path-to-file');
    const targetBranch=  core.getInput('target-branch');
    const preReleaseId = core.getInput('pre-release-id');
    const commitMessageToUse = core.getInput('commit-message');
    const releaseCommitMessageRegex = core.getInput('release-commit-message-regex');
    const type = core.getInput('type');
    const dryRun = core.getInput('dry-run') > '' ? core.getBooleanInput('dry-run') : false;
    const versionOverride = core.getInput('version-override');
    const wasBumped = await bumpVersion(tagPrefix,
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
      releaseCommitMessageRegex || commitMessageToUse);
    if (wasBumped) {
      core.setOutput('wasBumped', wasBumped);
      exitSuccess('Version bumped!');
    }
  } catch (err) {
    logError(err);
    exitFailure('Failed to bump version');
  }
})();