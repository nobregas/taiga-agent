import { config } from '../config.js';

export interface BranchCommit {
  sha: string;
  title: string;
  body: string;
  date: string;
}

export interface DiffSummaryItem {
  path: string;
  additions: number;
  deletions: number;
  snippet?: string;
}

export interface BranchContext {
  branch: string;
  commits: BranchCommit[];
  diffSummary: DiffSummaryItem[];
  stats: {
    totalCommits: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

const IGNORED_PATHS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.(png|jpg|jpeg|gif|webp|ico|svg|woff2?|ttf|eot)$/i,
  /^dist\//,
  /^node_modules\//,
];

const SENSITIVE_PATHS = [/\.env/i, /secret/i, /credential/i, /\.pem$/i, /\.key$/i];

function shouldIgnorePath(path: string): boolean {
  return IGNORED_PATHS.some((pattern) => pattern.test(path));
}

function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATHS.some((pattern) => pattern.test(path));
}

function truncateSnippet(diff: string, maxLines = config.gitlab.diffSnippetLines): string | undefined {
  if (!diff) {
    return undefined;
  }

  return diff
    .split('\n')
    .slice(0, maxLines)
    .join('\n');
}

export class GitlabService {
  private async request<T>(path: string): Promise<T> {
    if (!config.gitlab.token) {
      throw new Error('GITLAB_TOKEN is not configured');
    }

    const response = await fetch(`${config.gitlab.url}${path}`, {
      headers: {
        'PRIVATE-TOKEN': config.gitlab.token,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async getBranchContext(branch: string): Promise<BranchContext> {
    if (!config.gitlab.projectId) {
      throw new Error('GITLAB_PROJECT_ID is not configured');
    }

    const projectId = encodeURIComponent(config.gitlab.projectId);
    const encodedBranch = encodeURIComponent(branch);

    type GitlabCommit = {
      id: string;
      title: string;
      message: string;
      committed_date: string;
    };

    type GitlabCompare = {
      commits?: GitlabCommit[];
      diffs?: Array<{
        new_path: string;
        diff?: string;
      }>;
    };

    const [commits, compare] = await Promise.all([
      this.request<GitlabCommit[]>(
        `/projects/${projectId}/repository/commits?ref_name=${encodedBranch}&per_page=100`,
      ),
      this.request<GitlabCompare>(
        `/projects/${projectId}/repository/compare?from=${encodeURIComponent(config.gitlab.defaultBase)}&to=${encodedBranch}`,
      ).catch(() => ({ commits: [], diffs: [] } as GitlabCompare)),
    ]);

    const commitList = (compare.commits?.length ? compare.commits : commits)
      .filter((commit) => !/^merge /i.test(commit.title))
      .map((commit) => ({
        sha: commit.id.slice(0, 8),
        title: commit.title,
        body: commit.message.replace(commit.title, '').trim(),
        date: commit.committed_date,
      }));

    const diffSummary: DiffSummaryItem[] = [];
    let linesAdded = 0;
    let linesRemoved = 0;

    for (const diff of compare.diffs ?? []) {
      if (shouldIgnorePath(diff.new_path) || isSensitivePath(diff.new_path)) {
        continue;
      }

      const patch = diff.diff ?? '';
      const additions = (patch.match(/^\+/gm) ?? []).length;
      const deletions = (patch.match(/^-/gm) ?? []).length;
      linesAdded += additions;
      linesRemoved += deletions;

      diffSummary.push({
        path: diff.new_path,
        additions,
        deletions,
        snippet: isSensitivePath(diff.new_path) ? undefined : truncateSnippet(patch),
      });
    }

    return {
      branch,
      commits: commitList,
      diffSummary: diffSummary.slice(0, 50),
      stats: {
        totalCommits: commitList.length,
        filesChanged: diffSummary.length,
        linesAdded,
        linesRemoved,
      },
    };
  }

  formatContextForPrompt(context: BranchContext): string {
    const commitsText = context.commits
      .map((commit) => `- ${commit.sha} ${commit.title}\n  ${commit.body}`.trim())
      .join('\n\n');

    const diffText = context.diffSummary
      .map((item) => {
        const snippet = item.snippet ? `\n  snippet:\n${item.snippet}` : '';
        return `- ${item.path} (+${item.additions}/-${item.deletions})${snippet}`;
      })
      .join('\n');

    return `Branch: ${context.branch}
Stats: ${context.stats.totalCommits} commits, ${context.stats.filesChanged} files, +${context.stats.linesAdded}/-${context.stats.linesRemoved}

Commits:
${commitsText || 'Nenhum commit encontrado'}

Diff summary:
${diffText || 'Nenhum diff disponivel'}`;
  }
}

export const gitlabService = new GitlabService();
