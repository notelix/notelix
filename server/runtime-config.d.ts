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
