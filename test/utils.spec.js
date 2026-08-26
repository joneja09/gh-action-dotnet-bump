const { logInfo, logError, bumpVersion, analyseVersionChange, analyseVersionPartChange, getCurrentVersionCsproj, getNewProjectContentCsproj, getCurrentVersionAssembly, getNewProjectContentAssembly, getRelevantCommitMessages, toFourPartVersion, normalizeCurrentVersion, applyDefaultBump, hasBreakingChange, findPreReleaseId } = require('../src/utils');
describe('Utils', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('logInfo', () => {
    test('should log correct message', () => {
      const spy = jest.spyOn(global.console, 'info').mockImplementation(() => { return; });
      const message = 'message';
      logInfo(message);
      expect(spy).toHaveBeenNthCalledWith(1, message);
    });
  });
  describe('logError', () => {
    test('should log correct message', () => {
      const spy = jest.spyOn(global.console, 'error').mockImplementation(() => { return; });
      const message = 'message';
      logError(message);
      expect(spy).toHaveBeenNthCalledWith(1, `✖  fatal     ${message}`);
    });
  });
  describe('bumpVersion', () => {
    test('should bump major version', () => {
      const newVersion = bumpVersion('0.0.0', true, false, false, false, undefined);
      expect(newVersion).toEqual('1.0.0');
    });
    test('should bump minor version', () => {
      const newVersion = bumpVersion('0.0.0', false, true, false, false, undefined);
      expect(newVersion).toEqual('0.1.0');
    });
    test('should bump fix version', () => {
      const newVersion = bumpVersion('0.0.0', false, false, true, false, undefined);
      expect(newVersion).toEqual('0.0.1');
    });
    test('should bump prerelease version', () => {
      const newVersion = bumpVersion('0.0.0', false, false, false, true, 'pre');
      expect(newVersion).toEqual('0.0.1-pre.0');
    });
    test('should bump existing prerelease version', () => {
      const newVersion = bumpVersion('0.0.1-pre.0', false, false, false, true, 'pre');
      expect(newVersion).toEqual('0.0.1-pre.1');
    });
    test('should bump existing prerelease version to new prerelease id', () => {
      const newVersion = bumpVersion('0.0.1-pre.0', false, false, false, true, 'pre2');
      expect(newVersion).toEqual('0.0.1-pre2.0');
    });
  });
  
  describe('getRelevantCommitMessages', () => {
    test('should return relevant commit messages up until release commit', () => {
      const messages = [
        'feat: new test something description\n',
        'ci: fixed commit message not matched\n',
        'chore(release): test something v0.3.0 (#6)\n',
        'feat: new test something description\n'
      ];
      const relevantCommitMessages = getRelevantCommitMessages(messages, 'chore\\(release\\): test something v{{version}}', '');
      expect(relevantCommitMessages).toEqual([
        'feat: new test something description\n',
        'ci: fixed commit message not matched\n'
      ]);
    });
    test('should return no commits if release is the latest commit', () => {
      const messages = [
        'chore(release): test something v0.3.0 (#6)\n',
        'feat: new test something description\n'
      ];
      const relevantCommitMessages = getRelevantCommitMessages(messages, 'chore\\(release\\): test something v{{version}}', '');
      expect(relevantCommitMessages).toEqual([]);
    });
    test('should keep matching after inspecting a non-bump commit', () => {
      const messages = [
        'feat: first\n',
        'ci: version bump to 1.2.3\n',
        'feat: older\n'
      ];
      expect(getRelevantCommitMessages(messages, 'ci: version bump to {{version}}', '')).toEqual([
        'feat: first\n'
      ]);
    });
  });
  
  describe('analyseVersionChange', () => {
    test('wording in commit message', () => {
      const {doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion} = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['ci: feat! test']);
      expect(doMajorVersion).toEqual(false);
      expect(doMinorVersion).toEqual(false);
      expect(doPatchVersion).toEqual(false);
      expect(doPreReleaseVersion).toEqual(false);
    });
    test('figure out to bump major version', () => {
      const {doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion} = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['feat!: change request']);
      expect(doMajorVersion).toEqual(true);
      expect(doMinorVersion).toEqual(false);
      expect(doPatchVersion).toEqual(false);
      expect(doPreReleaseVersion).toEqual(false);
    });
    test('figure out to bump minor version', () => {
      const {doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion} = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['feat: change request']);
      expect(doMajorVersion).toEqual(false);
      expect(doMinorVersion).toEqual(true);
      expect(doPatchVersion).toEqual(false);
      expect(doPreReleaseVersion).toEqual(false);
    });
    test('figure out to bump patch version', () => {
      const {doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion} = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['fix: change request']);
      expect(doMajorVersion).toEqual(false);
      expect(doMinorVersion).toEqual(false);
      expect(doPatchVersion).toEqual(true);
      expect(doPreReleaseVersion).toEqual(false);
    });
    test('figure out to bump pre-release version', () => {
      const {doMajorVersion, doMinorVersion, doPatchVersion, doPreReleaseVersion} = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['pre: change request']);
      expect(doMajorVersion).toEqual(false);
      expect(doMinorVersion).toEqual(false);
      expect(doPatchVersion).toEqual(false);
      expect(doPreReleaseVersion).toEqual(true);
    });
    test('treats conventional breaking changes as major', () => {
      const scoped = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['feat(api)!: drop legacy endpoint']);
      expect(scoped.doMajorVersion).toEqual(true);

      const footer = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['fix: handle empty input\n\nBREAKING CHANGE: response shape changed']);
      expect(footer.doMajorVersion).toEqual(true);
    });
    test('does not treat prefix as a fix', () => {
      const result = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['prefix: unrelated']);
      expect(result.doPatchVersion).toEqual(false);
    });
    test('uses the default bump when no wording matches', () => {
      const result = analyseVersionChange('feat!', 'feat', 'fix', 'pre', ['chore: housekeeping'], 'patch');
      expect(result.doPatchVersion).toEqual(true);
    });
  });

  describe('analyseVersionPartChange', () => {
    test('accepts lowercase version parts', () => {
      expect(analyseVersionPartChange('minor')).toEqual({
        doMajorVersion: false,
        doMinorVersion: true,
        doPatchVersion: false,
        doPreReleaseVersion: false
      });
    });
    test('rejects invalid version parts', () => {
      expect(() => analyseVersionPartChange('build')).toThrow('version-part must be one of');
    });
  });

  describe('toFourPartVersion', () => {
    test('converts a prerelease version to a numeric assembly version', () => {
      expect(toFourPartVersion('1.2.3-next.0')).toEqual('1.2.3.0');
    });
  });

  describe('normalizeCurrentVersion', () => {
    test('coerces four-part assembly-style versions to semver', () => {
      expect(normalizeCurrentVersion('1.2.3.0')).toEqual('1.2.3');
    });
    test('rejects values that are not versions', () => {
      expect(() => normalizeCurrentVersion('abc')).toThrow('not a valid semantic version');
    });
  });

  describe('applyDefaultBump', () => {
    test('maps named bumps', () => {
      expect(applyDefaultBump('prerelease').doPreReleaseVersion).toEqual(true);
      expect(applyDefaultBump('none')).toEqual({
        doMajorVersion: false,
        doMinorVersion: false,
        doPatchVersion: false,
        doPreReleaseVersion: false
      });
    });
  });

  describe('hasBreakingChange', () => {
    test('detects footer and bang syntax', () => {
      expect(hasBreakingChange('feat!: remove api')).toEqual(true);
      expect(hasBreakingChange('fix: typo')).toEqual(false);
    });
  });

  describe('findPreReleaseId', () => {
    test('accepts a comma-separated wording string', () => {
      expect(findPreReleaseId('pre-alpha,next', ['chore: pre-alpha release'])).toEqual('alpha');
    });
  });
  describe('getCurrentVersionCsproj', () => {
    test('should return version', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <GeneratePackageOnBuild>false</GeneratePackageOnBuild>
    <Version>1.0.0</Version>
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client"/>
    <None Remove="System.Text.Json"/>
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0"/>
    <PackageReference Include="System.Text.Json" Version="5.0.2"/>
  </ItemGroup>
</Project>
`;
      const version = getCurrentVersionCsproj(csproj);
      expect(version).toEqual('1.0.0');
    });

    test('should return version 3', () => {
      const csproj = `
<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="14.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <Import Project="$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props" Condition="Exists('$(MSBuildExtensionsPath)\$(MSBuildToolsVersion)\Microsoft.Common.props')" />
  <PropertyGroup>
    <Configuration Condition=" '$(Configuration)' == '' ">Debug</Configuration>
    <Platform Condition=" '$(Platform)' == '' ">AnyCPU</Platform>
    <ProjectGuid>{E7ECDD31-5969-43AF-A7E1-31E04631124C}</ProjectGuid>
    <OutputType>Library</OutputType>
    <AppDesignerFolder>Properties</AppDesignerFolder>
    <RootNamespace>Oxide.Ext.GamingApi</RootNamespace>
    <AssemblyName>Oxide.Ext.GamingApi</AssemblyName>
    <TargetFrameworkVersion>v4.6.1</TargetFrameworkVersion>
    <FileAlignment>512</FileAlignment>
    <TargetFrameworkProfile />
    <Version>0.0.0</Version>
    <PackageVersion>0.0.0</PackageVersion>
    <AssemblyVersion>0.0.0.0</AssemblyVersion>
    <FileVersion>0.0.0.0</FileVersion>
    <RepositoryUrl>https://github.com/GamingAPI/umod-rust-server-extension.git</RepositoryUrl> 
  </PropertyGroup>
  <PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Debug|AnyCPU' ">
    <DebugSymbols>true</DebugSymbols>
    <DebugType>full</DebugType>
    <Optimize>false</Optimize>
    <OutputPath>bin\Debug\</OutputPath>
    <DefineConstants>DEBUG;TRACE</DefineConstants>
    <ErrorReport>prompt</ErrorReport>
    <WarningLevel>4</WarningLevel>
    <Prefer32Bit>false</Prefer32Bit>
    <LangVersion>6</LangVersion>
  </PropertyGroup>
  <PropertyGroup Condition=" '$(Configuration)|$(Platform)' == 'Release|AnyCPU' ">
    <DebugType>pdbonly</DebugType>
    <Optimize>true</Optimize>
    <OutputPath>bin\Release\</OutputPath>
    <DefineConstants>TRACE</DefineConstants>
    <ErrorReport>prompt</ErrorReport>
    <WarningLevel>4</WarningLevel>
    <Prefer32Bit>false</Prefer32Bit>
  </PropertyGroup>
  <PropertyGroup>
    <StartupObject />
  </PropertyGroup>
</Project>
`;
      const version = getCurrentVersionCsproj(csproj);
      expect(version).toEqual('0.0.0');
    });
    test('should return version 2', () => {
      const csproj = `
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFrameworks>netstandard2.0;netstandard2.1;net461</TargetFrameworks>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <Version>0.1.0</Version>
    <PackageVersion>0.1.0</PackageVersion>
    <AssemblyVersion>0.1.0.0</AssemblyVersion>
    <FileVersion>0.1.0.0</FileVersion>
    <RepositoryUrl>https://github.com/GamingAPI/rust-csharp-game-api.git</RepositoryUrl> 
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client" />
    <None Remove="System.Text.Json" />
    <None Remove="Microsoft.CSharp" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0" />
    <PackageReference Include="System.Text.Json" Version="5.0.2" />
    <PackageReference Include="Microsoft.CSharp" Version="4.7.0" />
  </ItemGroup>
</Project>
`;
      const version = getCurrentVersionCsproj(csproj);
      expect(version).toEqual('0.1.0');
    });
    test('should return undefined when no version present', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <GeneratePackageOnBuild>false</GeneratePackageOnBuild>
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client"/>
    <None Remove="System.Text.Json"/>
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0"/>
    <PackageReference Include="System.Text.Json" Version="5.0.2"/>
  </ItemGroup>
</Project>
`;
      const version = getCurrentVersionCsproj(csproj);
      expect(version).toBeUndefined();
    });
    test('should return VersionPrefix when Version is absent', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <VersionPrefix>2.3.4</VersionPrefix>
    <VersionSuffix>beta.1</VersionSuffix>
  </PropertyGroup>
</Project>
`;
      expect(getCurrentVersionCsproj(csproj)).toEqual('2.3.4-beta.1');
    });
  });
  
  describe('getNewProjectContentCsproj', () => {
    test('should return accurate version change for multiple version properties', () => {
      const csproj = `
  <Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFrameworks>netstandard2.0;netstandard2.1;net461</TargetFrameworks>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <Version>0.1.0</Version>
    <PackageVersion>0.1.0</PackageVersion>
    <AssemblyVersion>0.1.0.0</AssemblyVersion>
    <FileVersion>0.1.0.0</FileVersion>
    <RepositoryUrl>https://github.com/GamingAPI/rust-csharp-game-api.git</RepositoryUrl> 
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client" />
    <None Remove="System.Text.Json" />
    <None Remove="Microsoft.CSharp" />
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0" />
    <PackageReference Include="System.Text.Json" Version="5.0.2" />
    <PackageReference Include="Microsoft.CSharp" Version="4.7.0" />
  </ItemGroup>
  </Project>
  `;
      const newProjectFile = getNewProjectContentCsproj('12.0.45', csproj);
      expect(newProjectFile).toMatchSnapshot();
    });
    test('should return version', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <GeneratePackageOnBuild>false</GeneratePackageOnBuild>
    <Version>1.0.0</Version>
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client"/>
    <None Remove="System.Text.Json"/>
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0"/>
    <PackageReference Include="System.Text.Json" Version="5.0.2"/>
  </ItemGroup>
</Project>`;
      const content = getNewProjectContentCsproj('1.0.1', csproj);
      expect(content).toMatchSnapshot();
    });
    test('should return correctly when no version present', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netcoreapp3.1</TargetFramework>
    <RootNamespace>Asyncapi.Nats.Client</RootNamespace>
    <GeneratePackageOnBuild>false</GeneratePackageOnBuild>
  </PropertyGroup>

  <ItemGroup>
    <None Remove="NATS.Client"/>
    <None Remove="System.Text.Json"/>
  </ItemGroup>
  <ItemGroup>
    <PackageReference Include="NATS.Client" Version="0.12.0"/>
    <PackageReference Include="System.Text.Json" Version="5.0.2"/>
  </ItemGroup>
</Project>
`;
      const content = getNewProjectContentCsproj('1.0.1', csproj);
      expect(content).toMatchSnapshot();
    });
    test('should keep assembly versions numeric for prereleases', () => {
      const csproj = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <Version>1.0.0</Version>
    <PackageVersion>1.0.0</PackageVersion>
    <VersionPrefix>1.0.0</VersionPrefix>
    <VersionSuffix></VersionSuffix>
    <AssemblyVersion>1.0.0.0</AssemblyVersion>
    <FileVersion>1.0.0.0</FileVersion>
    <InformationalVersion>1.0.0</InformationalVersion>
  </PropertyGroup>
</Project>`;
      const content = getNewProjectContentCsproj('1.1.0-next.0', csproj);
      expect(content).toContain('<Version>1.1.0-next.0</Version>');
      expect(content).toContain('<PackageVersion>1.1.0-next.0</PackageVersion>');
      expect(content).toContain('<VersionPrefix>1.1.0</VersionPrefix>');
      expect(content).toContain('<VersionSuffix>next.0</VersionSuffix>');
      expect(content).toContain('<AssemblyVersion>1.1.0.0</AssemblyVersion>');
      expect(content).toContain('<FileVersion>1.1.0.0</FileVersion>');
      expect(content).toContain('<InformationalVersion>1.1.0-next.0</InformationalVersion>');
    });
  });
  
  describe('getCurrentVersionAssembly', () => {
    test('should return version', () => {
      const assembly = `using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

// General Information about an assembly is controlled through the following
// set of attributes. Change these attribute values to modify the information
// associated with an assembly.
[assembly: AssemblyTitle("GamingEventPlugins")]
[assembly: AssemblyDescription("Rust plugins for sharing events with the GamingEventAPI network")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyProduct("GamingEventPlugins")]
[assembly: AssemblyCopyright("Copyright ©  2018")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]

// Setting ComVisible to false makes the types in this assembly not visible
// to COM components.  If you need to access a type in this assembly from
// COM, set the ComVisible attribute to true on that type.
[assembly: ComVisible(false)]

// The following GUID is for the ID of the typelib if this project is exposed to COM
[assembly: Guid("e3b20e54-acff-4cb1-a5ec-97eb6ab462ef")]

// Version information for an assembly consists of the following four values:
//
//      Major Version
//      Minor Version
//      Build Number
//      Revision
//
// You can specify all the values or you can default the Build and Revision Numbers
// by using the '*' as shown below:
// [assembly: AssemblyVersion("1.0.*")]
[assembly: AssemblyVersion("1.2.0.3")]
[assembly: AssemblyFileVersion("1.0.0.0")]
`;
      const version = getCurrentVersionAssembly(assembly);
      expect(version).toEqual('1.2.0');
    });
    test('should ignore commented assembly versions', () => {
      const assembly = `// [assembly: AssemblyVersion("9.9.9.9")]
[assembly: AssemblyVersion("2.0.1.0")]
`;
      expect(getCurrentVersionAssembly(assembly)).toEqual('2.0.1');
    });
    test('should return undefined when no version present', () => {
      const assembly = `using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

// General Information about an assembly is controlled through the following
// set of attributes. Change these attribute values to modify the information
// associated with an assembly.
[assembly: AssemblyTitle("GamingEventPlugins")]
[assembly: AssemblyDescription("Rust plugins for sharing events with the GamingEventAPI network")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyProduct("GamingEventPlugins")]
[assembly: AssemblyCopyright("Copyright ©  2018")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]

// Setting ComVisible to false makes the types in this assembly not visible
// to COM components.  If you need to access a type in this assembly from
// COM, set the ComVisible attribute to true on that type.
[assembly: ComVisible(false)]

// The following GUID is for the ID of the typelib if this project is exposed to COM
[assembly: Guid("e3b20e54-acff-4cb1-a5ec-97eb6ab462ef")]
`;
      const version = getCurrentVersionAssembly(assembly);
      expect(version).toBeUndefined();
    });
  });
  
  describe('getNewProjectContentAssembly', () => {
    test('should return version', () => {
      const assembly = `using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

// General Information about an assembly is controlled through the following
// set of attributes. Change these attribute values to modify the information
// associated with an assembly.
[assembly: AssemblyTitle("GamingEventPlugins")]
[assembly: AssemblyDescription("Rust plugins for sharing events with the GamingEventAPI network")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyProduct("GamingEventPlugins")]
[assembly: AssemblyCopyright("Copyright ©  2018")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]

// Setting ComVisible to false makes the types in this assembly not visible
// to COM components.  If you need to access a type in this assembly from
// COM, set the ComVisible attribute to true on that type.
[assembly: ComVisible(false)]

// The following GUID is for the ID of the typelib if this project is exposed to COM
[assembly: Guid("e3b20e54-acff-4cb1-a5ec-97eb6ab462ef")]

// Version information for an assembly consists of the following four values:
//
//      Major Version
//      Minor Version
//      Build Number
//      Revision
//
// You can specify all the values or you can default the Build and Revision Numbers
// by using the '*' as shown below:
// [assembly: AssemblyVersion("1.0.*")]
[assembly: AssemblyVersion("1.2.0.3")]
[assembly: AssemblyFileVersion("1.0.0.0")]
`;
      const content = getNewProjectContentAssembly('3.2.1', assembly);
      expect(content).toMatchSnapshot();
    });
    test('should return undefined when no version present', () => {
      const assembly = `using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;

// General Information about an assembly is controlled through the following
// set of attributes. Change these attribute values to modify the information
// associated with an assembly.
[assembly: AssemblyTitle("GamingEventPlugins")]
[assembly: AssemblyDescription("Rust plugins for sharing events with the GamingEventAPI network")]
[assembly: AssemblyConfiguration("")]
[assembly: AssemblyCompany("")]
[assembly: AssemblyProduct("GamingEventPlugins")]
[assembly: AssemblyCopyright("Copyright ©  2018")]
[assembly: AssemblyTrademark("")]
[assembly: AssemblyCulture("")]

// Setting ComVisible to false makes the types in this assembly not visible
// to COM components.  If you need to access a type in this assembly from
// COM, set the ComVisible attribute to true on that type.
[assembly: ComVisible(false)]

// The following GUID is for the ID of the typelib if this project is exposed to COM
[assembly: Guid("e3b20e54-acff-4cb1-a5ec-97eb6ab462ef")]
`;
      const content = getNewProjectContentAssembly('3.2.1', assembly);
      expect(content).toMatchSnapshot();
    });
  });
});