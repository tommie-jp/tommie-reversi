/** Success or failure for errors that are expected (an illegal move, an unreadable line). */
export type Result<T, E> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
    return { ok: true, value };
}

export function err<E>(error: E): { readonly ok: false; readonly error: E } {
    return { ok: false, error };
}
