const os = require('os');
const path = require('path');
const fs = require('fs');
const bumper = require('../src/bumper');

describe('file integration', () => {
  let workspace;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'dotnet-bump-'));
    process.env.GITHUB_WORKSPACE = workspace;
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  test('writes a bumped csproj when git updates are skipped', async () => {
    const relativePath = 'Lib.csproj';
    const filePath = path.join(workspace, relativePath);
    fs.writeFileSync(filePath, `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Version>1.4.0</Version>
    <PackageVersion>1.4.0</PackageVersion>
    <AssemblyVersion>1.4.0.0</AssemblyVersion>
  </PropertyGroup>
</Project>
`);

    const result = await bumper({
      tagPrefix: 'v',
      minorWording: 'feat',
      majorWording: 'feat!',
      patchWording: 'fix',
      versionPart: '',
      rcWording: 'next',
      skipTag: true,
      skipCommit: true,
      skipPush: true,
      pathToDocument: relativePath,
      targetBranch: '',
      preReleaseId: 'next',
      commitMessageToUse: 'ci: version bump to {{version}}',
      type: 'csproj',
      dryRun: false,
      versionOverride: '1.5.0-next.0',
      releaseCommitMessageRegex: 'ci: version bump to {{version}}',
      defaultBump: 'patch'
    });

    const written = fs.readFileSync(filePath, 'utf8');
    expect(result).toEqual({wasBumped: true, oldVersion: '1.4.0', newVersion: '1.5.0-next.0'});
    expect(written).toContain('<Version>1.5.0-next.0</Version>');
    expect(written).toContain('<PackageVersion>1.5.0-next.0</PackageVersion>');
    expect(written).toContain('<AssemblyVersion>1.5.0.0</AssemblyVersion>');
  });

  test('leaves the file unchanged during a dry run', async () => {
    const relativePath = 'Lib.csproj';
    const filePath = path.join(workspace, relativePath);
    const original = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <Version>0.1.0</Version>
  </PropertyGroup>
</Project>
`;
    fs.writeFileSync(filePath, original);

    const result = await bumper({
      skipTag: true,
      skipCommit: true,
      skipPush: true,
      pathToDocument: relativePath,
      type: 'csproj',
      dryRun: true,
      versionOverride: '0.2.0',
      commitMessageToUse: 'ci: version bump to {{version}}',
      releaseCommitMessageRegex: 'ci: version bump to {{version}}'
    });

    expect(result.newVersion).toEqual('0.2.0');
    expect(fs.readFileSync(filePath, 'utf8')).toEqual(original);
  });
});
