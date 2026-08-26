function readBoundedIntegerEnvironment(
  name,
  fallback,
  minimum,
  maximum,
  environment = process.env,
) {
  if (
    !Number.isSafeInteger(fallback) ||
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum > maximum ||
    fallback < minimum ||
    fallback > maximum
  ) {
    throw new Error(`invalid numeric configuration bounds for ${name}`);
  }
  const configured = environment[name];
  if (configured === undefined || configured === '') {
    return fallback;
  }
  if (!/^\d+$/.test(configured)) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  const value = Number(configured);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}`,
    );
  }
  return value;
}

function readPortEnvironment(name, fallback, environment = process.env) {
  return readBoundedIntegerEnvironment(name, fallback, 1, 65535, environment);
}

function readEnvironmentChoice(
  name,
  fallback,
  allowedValues,
  environment = process.env,
) {
  const configured = environment[name];
  const value =
    configured === undefined || configured === '' ? fallback : configured;
  if (!allowedValues.includes(value)) {
    throw new Error(`${name} must be one of: ${allowedValues.join(', ')}`);
  }
  return value;
}

function readBooleanEnvironment(name, fallback, environment = process.env) {
  const configured = environment[name];
  if (configured === undefined || configured === '') {
    return fallback;
  }
  const normalized = configured.toLowerCase();
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false`);
}

module.exports = {
  readBooleanEnvironment,
  readBoundedIntegerEnvironment,
  readEnvironmentChoice,
  readPortEnvironment,
};
