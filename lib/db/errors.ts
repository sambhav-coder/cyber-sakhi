export class DatabaseError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "DatabaseError";
    this.code = code;
  }
}

export function throwIfError(
  error: { message: string; code?: string } | null,
  fallback: string
): void {
  if (error) {
    throw new DatabaseError(error.message || fallback, error.code);
  }
}

export function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}
