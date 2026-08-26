import {
  readBooleanEnvironment,
  readBoundedIntegerEnvironment,
} from '../../runtime-config';

export interface StaticTokenProvisioningConfig {
  enabled: boolean;
  accountLimit: number;
}

export function readStaticTokenProvisioningConfig(
  environment: NodeJS.ProcessEnv = process.env,
): StaticTokenProvisioningConfig {
  return {
    enabled: readBooleanEnvironment(
      'STATIC_TOKEN_AUTO_PROVISION',
      false,
      environment,
    ),
    accountLimit: readBoundedIntegerEnvironment(
      'STATIC_TOKEN_AUTO_PROVISION_LIMIT',
      1000,
      1,
      1000000,
      environment,
    ),
  };
}
