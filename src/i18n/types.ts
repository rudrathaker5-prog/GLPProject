export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Dot-notation paths into the translation tree, e.g. `awareness.heroTitle`. */
export type PathsOf<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : PathsOf<T[K], `${Prefix}${K}.`>;
}[keyof T & string];
