# gh-action-dotnet-bump

GitHub Action that bumps a .NET library version using [Semantic Versioning](https://semver.org/).

It reads the current version from a `.csproj`, `Directory.Build.props`, or `AssemblyInfo.cs` file, decides the next version from commit messages (or an explicit override), then optionally commits, tags, and pushes the change.

## Requirements

- Use `actions/checkout` with enough git history to inspect commits. `fetch-depth: 0` is recommended.
- Grant `contents: write` so the action can commit and push.
- The default `GITHUB_TOKEN` is enough unless your repository needs a custom token.

```yaml
permissions:
  contents: write
```

## Workflow

Based on the commit messages since the last version-bump commit:

- **Major** if a commit is a conventional breaking change (`feat!:`, `fix(api)!:`, or `BREAKING CHANGE` in the body), or matches `major-wording`.
- **Minor** if a commit type matches `minor-wording` (`feat` and `feature` by default).
- **Patch** if a commit type matches `patch-wording` (`fix` by default).
- **Prerelease** if a commit type matches `release-candidate-wording` (`next` by default).
- Otherwise the `default` bump is used (`patch` by default). Set `default: none` to skip instead.

The action then:

1. Updates the project file.
2. Commits the change (unless `skip-commit` is `true`).
3. Creates a tag (unless `skip-tag` is `true`; tagging is off by default).
4. Pushes to the current or `target-branch` (unless `skip-push` is `true`).

If the latest commit is already a version-bump commit, the action exits without bumping again.

## Usage

```yaml
name: Bump version

on:
  push:
    branches:
      - main

permissions:
  contents: write

jobs:
  bump:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Automated Version Bump
        id: version
        uses: joneja09/gh-action-dotnet-bump@main
        with:
          path-to-file: src/MyLibrary/MyLibrary.csproj
      - name: Print bump result
        run: |
          echo "Bumped: ${{ steps.version.outputs.wasBumped }}"
          echo "Old: ${{ steps.version.outputs.oldVersion }}"
          echo "New: ${{ steps.version.outputs.newVersion }}"
```

### Force a specific segment

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    version-part: Patch
```

### Set an exact version

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    version-override: 2.0.0
```

### Customize bump wording

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    minor-wording: 'feat,feature,add'
    major-wording: 'MAJOR,cut-major'
    patch-wording: 'fix,patch'
    release-candidate-wording: 'next,alpha'
    default: none
```

### Prerelease versions

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    default: prerelease
    pre-release-id: rc
```

### Skip git side effects

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    skip-commit: 'true'
    skip-tag: 'true'
    skip-push: 'true'
    dry-run: 'true'
```

### Tag prefix, target branch, and commit message

```yaml
- name: Automated Version Bump
  uses: joneja09/gh-action-dotnet-bump@main
  with:
    path-to-file: src/MyLibrary/MyLibrary.csproj
    tag-prefix: v
    skip-tag: 'false'
    target-branch: main
    commit-message: 'ci: version bump to {{version}} [skip ci]'
```

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `path-to-file` | _(required)_ | Path to the `.csproj`, `Directory.Build.props`, or `AssemblyInfo.cs` file |
| `type` | `csproj` | `csproj` or `assembly` |
| `tag-prefix` | `''` | Prefix added to the git tag, for example `v` |
| `minor-wording` | `feat,feature` | Commit type words that trigger a minor bump |
| `major-wording` | `feat!,fix!,refactor!` | Commit type words that trigger a major bump |
| `patch-wording` | `fix` | Commit type words that trigger a patch bump |
| `release-candidate-wording` | `next` | Commit type words that trigger a prerelease bump |
| `default` | `patch` | Bump to use when no wording matches: `major`, `minor`, `patch`, `prerelease`, or `none` |
| `version-part` | `''` | Force a bump of `Major`, `Minor`, `Patch`, or `Prerelease` |
| `version-override` | `''` | Set this exact semantic version |
| `skip-tag` | `true` | Skip creating a git tag |
| `skip-commit` | `false` | Skip creating a git commit |
| `skip-push` | `false` | Skip pushing commits and tags |
| `target-branch` | `''` | Checkout and push this branch instead of the current one |
| `pre-release-id` | `next` | Prerelease identifier, for example `rc` or `next` |
| `commit-message` | `ci: version bump to {{version}}` | Commit message. `{{version}}` is replaced with the new version |
| `release-commit-message-regex` | same as `commit-message` | Pattern used to detect the previous bump commit |
| `dry-run` | `false` | Calculate the new version without writing, committing, tagging, or pushing |
| `github-token` | `${{ github.token }}` | Token used to list commits when git history is unavailable |

## Outputs

| Output | Description |
| --- | --- |
| `wasBumped` | `true` when a new version was produced |
| `oldVersion` | Version found in the project file |
| `newVersion` | Version after the bump |

## .NET version fields

For SDK-style projects the action updates these properties when they exist:

- `Version`
- `PackageVersion`
- `VersionPrefix` / `VersionSuffix`
- `AssemblyVersion` and `FileVersion` (numeric `major.minor.patch.0`, including when the new version is a prerelease)
- `InformationalVersion`

If no `<Version>` is present, one is added to the first `PropertyGroup`. If only `<VersionPrefix>` is present, that value is used as the current version.

For `type: assembly`, `AssemblyVersion` and `AssemblyFileVersion` are updated. Commented-out attributes are ignored.

## Notes

- Checkout credentials from `actions/checkout` are reused for `git push`. The token is not written into the remote URL.
- Only the target project file is staged. The action no longer runs `git commit -a`.
- `skip-commit` no longer skips tagging and pushing. If you tag without committing, the tag points at the current HEAD.
