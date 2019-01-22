const { readFileSync } = require("fs");
const { resolve } = require("path");
const glob = require("glob");
const template = require("lodash.template");
const satisfiesGlob = require("minimatch");
const { satisfies: isSatisfiedVersion } = require("semver");
const isValidLicense = require("spdx-expression-validate");
const isSatisfiedLicense = require("spdx-satisfies");
const wrap = require("wrap-ansi");
const LicenseError = require("./LicenseError");

const licenseGlob = "@(LICENSE|LICENCE|COPYING)*";
const licenseWrap = 80;

const getLicenseContents = dependencyPath => {
  const [licenseFilename] = glob.sync(licenseGlob, { cwd: dependencyPath, nocase: true });
  const licensePath = licenseFilename && resolve(dependencyPath, licenseFilename);
  return licensePath && wrap(readFileSync(licensePath).toString(), licenseWrap);
};

const getLicenseInformationForDependency = dependencyPath => {
  const package = require.main.require(`${dependencyPath}/package.json`);
  return {
    name: package.name,
    version: package.version,
    author: (package.author && package.author.name) || package.author,
    repository: (package.repository && package.repository.url) || package.repository,
    homepage: package.homepage || "",
    licenseName: package.license,
    licenseText: getLicenseContents(dependencyPath)
  };
};

const getLicenseInformationForCompilation = (compilation, filter, includeDelegated) => {
  let fileDependencies = Array.from(compilation.fileDependencies);
  if (includeDelegated) {
    const delegated = compilation.modules
      .filter(
        m =>
          m.delegateData &&
          m.originalRequest &&
          m.originalRequest.resource &&
          (!m.issuer || !/node_modules/.test(m.issuer.context))
      )
      .map(m => m.originalRequest.resource);

    fileDependencies = fileDependencies.concat(delegated);
  }
  return fileDependencies.reduce((memo, dependencyPath) => {
    const match = dependencyPath.match(filter);
    if (match) {
      const [, rootPath, dependencyName] = match;
      memo[dependencyName] = getLicenseInformationForDependency(rootPath);
    }
    return memo;
  }, {});
};

const getLicenseViolations = (licenseInformation, allow, allowOverride) => {
  return Object.keys(licenseInformation).reduce((memo, name) => {
    const { version, licenseName, licenseText } = licenseInformation[name];
    if (allowOverride && allowOverride[licenseName]) {
      return memo;
    } else if (!licenseName || licenseName === "UNLICENSED") {
      memo.push(new LicenseError(`${name}@${version} is unlicensed`));
    } else if (!isValidLicense(licenseName) || !isSatisfiedLicense(licenseName, allow)) {
      memo.push(new LicenseError(`${name}@${version} has disallowed license ${licenseName}`));
    }

    if (!licenseText || !licenseText.trim())
      memo.push(
        new LicenseError(
          `${name}@${version} has a license of type ${licenseName} but has no license text`
        )
      );
    return memo;
  }, []);
};

const getSortedLicenseInformation = (licenseInformation, additionalLicenses) => {
  let licenses = Object.values(licenseInformation);
  if (additionalLicenses) licenses = licenses.concat(additionalLicenses);
  licenses.sort(({ name: nameA }, { name: nameB }) => {
    const a = String(nameA).toLowerCase();
    const b = String(nameB).toLowerCase();
    return a < b ? -1 : a > b ? 1 : 0;
  });
  return licenses;
};

const parseVersionExpression = expr => expr.split(/(?!^)@/);

const ignoreLicenses = (licenseInformation, ignore) => {
  return Object.keys(licenseInformation).reduce(
    (memo, dependencyName) =>
      ignore.reduce((memo, ignoredExpression) => {
        const { version: dependencyVersion } = licenseInformation[dependencyName];
        const [ignoredName, ignoredVersionRange] = parseVersionExpression(ignoredExpression);
        const matchesName = satisfiesGlob(dependencyName, ignoredName);
        const matchesVersion =
          !ignoredVersionRange || isSatisfiedVersion(dependencyVersion, ignoredVersionRange);
        if (matchesName && matchesVersion) {
          delete memo[dependencyName];
        }
        return memo;
      }, memo),
    JSON.parse(JSON.stringify(licenseInformation))
  );
};

const overrideLicenses = (licenseInformation, override) => {
  return Object.keys(licenseInformation).reduce(
    (memo, dependencyName) =>
      Object.keys(override).reduce((memo, overriddenKey) => {
        const { version: dependencyVersion } = licenseInformation[dependencyName];
        const [overriddenName, overriddenVersionRange] = parseVersionExpression(overriddenKey);
        const matchesName = dependencyName === overriddenName;
        const matchesVersion =
          !overriddenVersionRange || isSatisfiedVersion(dependencyVersion, overriddenVersionRange);
        if (matchesName && matchesVersion) {
          Object.assign(memo[dependencyName], override[overriddenKey]);
        }
        return memo;
      }, memo),
    JSON.parse(JSON.stringify(licenseInformation))
  );
};

const writeLicenseInformation = (outputWriter, dependencies) => {
  if (typeof outputWriter === "string" && outputWriter !== "default") {
    if (outputWriter === "default") {
      outputWriter = resolve(__dirname, "./defaultOutputTemplate.ejs");
    } else if (outputWriter === "html") {
      outputWriter = resolve(__dirname, "./htmlOutputTemplate.ejs");
    }
    outputWriter = template(readFileSync(outputWriter));
  }
  return outputWriter({ dependencies });
};

module.exports = {
  getLicenseInformationForCompilation,
  getLicenseViolations,
  getSortedLicenseInformation,
  ignoreLicenses,
  overrideLicenses,
  writeLicenseInformation
};
