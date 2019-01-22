const Joi = require("joi");

const optionsSchema = Joi.object().keys({
  filter: Joi.object()
    .type(RegExp)
    .required(),
  allow: Joi.string().required(),
  allowOverride: Joi.array().items(Joi.string()),
  ignore: Joi.array()
    .items(Joi.string())
    .required(),
  override: Joi.object().required(),
  emitError: Joi.boolean().required(),
  outputWriter: Joi.alternatives()
    .try(Joi.string(), Joi.func())
    .required(),
  outputFilename: Joi.string().required(),
  whenInWatchMode: Joi.boolean(),
  includeDelegated: Joi.boolean(),
  additionalLicenses: Joi.array().items(Joi.alternatives().try(Joi.string(), Joi.object()))
});

const defaultOptions = {
  filter: /(^.*[/\\]node_modules[/\\]((?:@[^/\\]+[/\\])?(?:[^/\\]+)))/,
  allow: "(Apache-2.0 OR BSD-2-Clause OR BSD-3-Clause OR MIT)",
  allowOverride: [],
  ignore: [],
  override: {},
  emitError: false,
  outputWriter: "default",
  outputFilename: "ThirdPartyNotice.txt",
  whenInWatchMode: false,
  includeDelegated: false,
  additionalLicenses: []
};

const getOptions = options => {
  const finalOptions = Object.assign({}, defaultOptions, options);

  const result = Joi.validate(finalOptions, optionsSchema);
  if (result.error != null) {
    throw result.error;
  }

  return finalOptions;
};

module.exports = {
  getOptions
};
