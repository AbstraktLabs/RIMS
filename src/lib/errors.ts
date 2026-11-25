// Errors thrown from controllers. The API handler turns them into JSON responses.

export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, message, details);
export const unauthorized = (message = "Unauthorized") => new AppError(401, message);
export const forbidden = (message = "You do not have permission to do this") => new AppError(403, message);
export const notFound = (what = "Record") => new AppError(404, `${what} not found`);
export const conflict = (message: string, details?: unknown) => new AppError(409, message, details);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, message, details);

/** Postgres error codes we translate into friendly API errors. */
export function fromPgError(err: unknown): AppError | null {
  const e = (err as { cause?: { code?: string; constraint?: string; detail?: string } })?.cause ?? (err as never);
  const code = (e as { code?: string })?.code;
  const constraint = (e as { constraint?: string })?.constraint;
  if (!code) return null;
  switch (code) {
    case "23505":
      return conflict("A record with these details already exists", { constraint });
    case "23503":
      return conflict("This record is linked to other records and cannot be changed or removed", { constraint });
    case "23514":
      return badRequest("Value violates a data rule", { constraint });
    case "22P02":
      return badRequest("Invalid identifier or value format");
    case "40001":
    case "40P01":
      return conflict("Another change happened at the same time — please retry");
    default:
      return null;
  }
}
