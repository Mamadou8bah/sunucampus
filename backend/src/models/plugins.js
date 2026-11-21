/** Shared toJSON: expose `id`, hide `_id` and `__v`. */
export function cleanJSON(schema) {
  schema.set('toJSON', {
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}
