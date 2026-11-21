import mongoose from 'mongoose';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';

export const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let error = err;

  if (err instanceof mongoose.Error.CastError) error = ApiError.badRequest(`Invalid ${err.path}`);
  else if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    error = ApiError.badRequest('Validation failed', details);
  } else if (err?.code === 11000) error = ApiError.conflict('A record with that value already exists');
  else if (err?.type === 'entity.parse.failed') error = ApiError.badRequest('Malformed JSON body');

  const status = error instanceof ApiError ? error.status : 500;
  if (status === 500 && !env.isTest) console.error(err);

  res.status(status).json({
    error: {
      message: status === 500 ? 'Internal server error' : error.message,
      ...(error.details && { details: error.details }),
    },
  });
}
