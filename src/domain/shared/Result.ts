export type Ok<T> = { success: true; value: T };
export type Err<E = string> = { success: false; error: E };
export type Result<T, E = string> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ success: true, value });
export const err = <E>(error: E): Err<E> => ({ success: false, error });