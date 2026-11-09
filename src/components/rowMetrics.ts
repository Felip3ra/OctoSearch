/**
 * Height of a record row (without an expanded stack trace). The virtual list positions rows with
 * these numbers and LogEntryRow sets them on the row, so both always agree; otherwise rows would
 * overlap or leave gaps as the error adds up over thousands of rows.
 */
export const ROW_HEIGHT = { normal: 34, compact: 24 } as const;

/** The row's bottom border, outside the fixed-height line. */
export const ROW_BORDER = 1;
