/** Límites compartidos con las restricciones CHECK de la base de datos. Cambiar en ambos sitios. */
export const LIMITS = {
  titleMax: 200,
  descriptionMax: 10_000,
  noteMax: 20_000,
  tagsMax: 20,
  tagMax: 32,
  subtaskTitleMax: 200,
  attachmentMaxBytes: 10 * 1024 * 1024,
  attachmentMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const,
  staleDaysMin: 1,
  staleDaysMax: 90,
  searchQueryMax: 200,
} as const;

/** Mismo patrón que private.normalize_tags en SQL. */
export const TAG_PATTERN = /^[a-z0-9áéíóúüñ_-]{1,32}$/;
