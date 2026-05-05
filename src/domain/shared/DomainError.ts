export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class UnauthorizedError extends DomainError {
  constructor() {
    super("Unauthorized", "UNAUTHORIZED", 401);
  }
}

export class InsufficientFundsError extends DomainError {
  constructor() {
    super("Insufficient wallet balance", "INSUFFICIENT_FUNDS", 400);
  }
}