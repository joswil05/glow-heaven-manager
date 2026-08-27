export class BusinessError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

export function formatErrorMessage(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof BusinessError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Ha ocurrido un error inesperado.',
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message: 'Error no identificado en la operación.',
  };
}
