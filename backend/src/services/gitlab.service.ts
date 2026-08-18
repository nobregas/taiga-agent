import type { GitlabConfig } from '../db/types.js';

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

function truncateSnippet(diff: string, maxLines: number): string | undefined {
  if (!diff) {
    return undefined;
  }

  return diff
    .split('\n')
    .slice(0, maxLines)
    .join('\n');
}

/**
 * GitLab integration is read-only by design.
 * Only GET endpoints are called (commits + compare). No writes to GitLab.
 */
export class GitlabService {
  private async get<T>(gitlab: GitlabConfig, path: string): Promise<T> {
    if (!gitlab.token) {
      throw new Error('GITLAB_TOKEN is not configured');
    }

    if (!path.startsWith('/')) {
      throw new Error('GitLab API path must start with /');
    }

    const response = await fetch(`${gitlab.url}${path}`, {
      method: 'GET',
      headers: {
        'PRIVATE-TOKEN': gitlab.token,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitLab API error ${response.status}: ${body}`);
    }

    return response.json() as Promise<T>;
  }

  async searchBranches(gitlab: GitlabConfig, query = '', limit = 20): Promise<string[]> {
    if (!gitlab.projectId) {
      throw new Error('GITLAB_PROJECT_ID is not configured');
    }

    const projectId = encodeURIComponent(gitlab.projectId);
    const params = new URLSearchParams({
      per_page: String(Math.min(Math.max(limit, 1), 100)),
    });

    const trimmed = query.trim();
    if (trimmed) {
      params.set('search', trimmed);
    }

    const branches = await this.get<Array<{ name: string }>>(
      gitlab,
      `/projects/${projectId}/repository/branches?${params.toString()}`,
    );

    return branches.map((branch) => branch.name).slice(0, limit);
  }

  async getBranchContext(
    gitlab: GitlabConfig,
    branch: string,
    compareBase = gitlab.defaultBase,
  ): Promise<BranchContext> {
    if (!gitlab.projectId) {
      throw new Error('GITLAB_PROJECT_ID is not configured');
    }

    const projectId = encodeURIComponent(gitlab.projectId);
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
      this.get<GitlabCommit[]>(
        gitlab,
        `/projects/${projectId}/repository/commits?ref_name=${encodedBranch}&per_page=100`,
      ),
      this.get<GitlabCompare>(
        gitlab,
        `/projects/${projectId}/repository/compare?from=${encodeURIComponent(compareBase)}&to=${encodedBranch}`,
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
        snippet: isSensitivePath(diff.new_path) ? undefined : truncateSnippet(patch, gitlab.diffSnippetLines),
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
