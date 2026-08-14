export interface TaigaStatusLike {
  id: number;
  name: string;
  slug: string;
  is_closed: boolean;
}

export function defaultOpenStatusId(statuses: TaigaStatusLike[]): number | undefined {
  return statuses.find((status) => !status.is_closed)?.id ?? statuses[0]?.id;
}

export function findDoneStatusId(statuses: TaigaStatusLike[]): number | undefined {
  const done = statuses.find(
    (status) =>
      status.is_closed ||
      status.slug === 'done' ||
      status.slug === 'closed' ||
      status.name.toLowerCase() === 'done' ||
      status.name.toLowerCase() === 'closed' ||
      status.name.toLowerCase() === 'concluído' ||
      status.name.toLowerCase() === 'concluido',
  );
  return done?.id;
}
