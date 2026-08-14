export interface TaigaMilestone {
  id: number;
  name: string;
  slug: string;
  estimated_start: string | null;
  estimated_finish: string | null;
  closed: boolean;
}

export function pickDefaultSprintId(milestones: TaigaMilestone[]): number | undefined {
  if (!milestones.length) {
    return undefined;
  }

  const ranked = [...milestones].sort((a, b) => {
    const rank = (milestone: TaigaMilestone) => {
      const date = milestone.estimated_finish ?? milestone.estimated_start ?? '';
      const openBoost = milestone.closed ? 0 : 1;
      return `${openBoost}-${date}-${String(milestone.id).padStart(10, '0')}`;
    };

    return rank(b).localeCompare(rank(a));
  });

  return ranked[0]?.id;
}
