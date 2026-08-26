export function readBoundedIntegerEnvironment(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
  environment?: Record<string, string | undefined>,
): number;

export function readPortEnvironment(
  name: string,
  fallback: number,
  environment?: Record<string, string | undefined>,
): number;

export function readEnvironmentChoice<T extends string>(
  name: string,
  fallback: T,
  allowedValues: readonly T[],
  environment?: Record<string, string | undefined>,
): T;

export function readBooleanEnvironment(
  name: string,
  fallback: boolean,
  environment?: Record<string, string | undefined>,
): boolean;
