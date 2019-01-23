const { RawSource } = require("webpack-sources");
const {
  getLicenseInformationForCompilation,
  getLicenseViolations,
  getSortedLicenseInformation,
  ignoreLicenses,
  overrideLicenses,
  writeLicenseInformation
} = require("./licenseUtils");
const { getOptions } = require("./optionsUtils");

class LicenseCheckerWebpackPlugin {
  constructor(options) {
    this.options = getOptions(options);
    this.licenseInfoWritten = false;
  }

  apply(compiler) {
    const {
      filter,
      allow,
      allowOverride,
      ignore,
      override,
      emitError,
      outputFilename,
      outputWriter,
      whenInWatchMode,
      includeDelegated,
      additionalLicenses
    } = this.options;

    if (!whenInWatchMode && (compiler.watchMode || compiler.options.watch)) {
      console.log(
        "LicenseCheckerWebpackPlugin: not running due to whenInWatchMode=false and compilation is running in watch mode"
      );
      return;
    }

    compiler.hooks.emit.tapPromise("LicenseCheckerWebpackPlugin", async compilation => {
      if (this.licenseInfoWritten) return;
      let licenseInformation = getLicenseInformationForCompilation(
        compilation,
        filter,
        includeDelegated
      );
      licenseInformation = ignoreLicenses(licenseInformation, ignore);
      licenseInformation = overrideLicenses(licenseInformation, override);

      const licenseViolations = getLicenseViolations(
        licenseInformation,
        allow,
        allowOverride && allowOverride.length
          ? allowOverride.reduce((obj, key) => {
              obj[key] = true;
              return obj;
            }, {})
          : {}
      );
      if (emitError) {
        compilation.errors.push(...licenseViolations);
      } else {
        compilation.warnings.push(...licenseViolations);
      }

      const sortedLicenseInformation = getSortedLicenseInformation(
        licenseInformation,
        additionalLicenses
      );
      compilation.assets[outputFilename] = new RawSource(
        writeLicenseInformation(outputWriter, sortedLicenseInformation)
      );
      this.licenseInfoWritten = true;
    });
  }
}

module.exports = LicenseCheckerWebpackPlugin;
