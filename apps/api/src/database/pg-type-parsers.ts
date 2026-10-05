import { types } from 'pg';

/**
 * node-postgres parses `date` columns into JS `Date` at local midnight, which shifts calendar
 * days across time zones. Keep them as `YYYY-MM-DD` strings (ADR-003).
 * `bigint` (int8) stays a string by default and is converted by `bigintCentsTransformer` (ADR-002).
 */
types.setTypeParser(types.builtins.DATE, (value: string) => value);
