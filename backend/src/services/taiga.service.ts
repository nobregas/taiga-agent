import { config } from '../config.js';
import type { TaigaMilestone } from '../utils/sprints.js';
import { pickDefaultSprintId } from '../utils/sprints.js';

export interface TaigaStatus {
  id: number;
  name: string;
  slug: string;
  is_closed: boolean;
}

export interface TaigaUser {
  id: number;
  username: string;
  full_name: string;
}

export interface TaigaUserStory {
  id: number;
  ref: number;
  subject: string;
  description: string;
  tags: Array<[string, string | null]>;
  project: number;
  status: number;
  milestone: number | null;
  version: number;
}

export interface TaigaTask {
  id: number;
  ref: number;
  subject: string;
  description: string;
  user_story: number;
  project: number;
  status: number;
  version: number;
}

export interface TaigaProjectMeta {
  tags: string[];
  tagColors: Record<string, string | null>;
  userStoryStatuses: TaigaStatus[];
  taskStatuses: TaigaStatus[];
  sprints: TaigaMilestone[];
  defaultSprintId: number | null;
  projectSlug: string;
  currentUser: TaigaUser | null;
}

export class TaigaService {
  private authToken: string | null = config.taiga.token ?? null;
  private currentUser: TaigaUser | null = null;

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const response = await fetch(`${config.taiga.url}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Taiga API error ${response.status}: ${body}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  async getToken(): Promise<string> {
    if (this.authToken) {
      return this.authToken;
    }

    if (!config.taiga.username || !config.taiga.password) {
      throw new Error('Taiga credentials are not configured');
    }

    const data = await fetch(`${config.taiga.url}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'normal',
        username: config.taiga.username,
        password: config.taiga.password,
      }),
    });

    if (!data.ok) {
      throw new Error(`Taiga auth failed: ${data.status}`);
    }

    const payload = (await data.json()) as {
      auth_token: string;
      id: number;
      username: string;
      full_name_display?: string;
      full_name?: string;
    };

    this.authToken = payload.auth_token;
    this.currentUser = {
      id: payload.id,
      username: payload.username,
      full_name: payload.full_name_display ?? payload.full_name ?? payload.username,
    };

    return this.authToken;
  }

  async getCurrentUser(): Promise<TaigaUser> {
    await this.getToken();
    if (!this.currentUser) {
      throw new Error('Unable to resolve current Taiga user');
    }
    return this.currentUser;
  }

  async getProjectMeta(projectId = config.taiga.projectId): Promise<TaigaProjectMeta> {
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const [project, tagColors, usStatuses, taskStatuses, milestones] = await Promise.all([
      this.request<{ id: number; slug: string }>(`/projects/${projectId}`),
      this.request<Record<string, string | null>>(`/projects/${projectId}/tags_colors`),
      this.request<TaigaStatus[]>(`/userstory-statuses?project=${projectId}`),
      this.request<TaigaStatus[]>(`/task-statuses?project=${projectId}`),
      this.request<TaigaMilestone[]>(`/milestones?project=${projectId}`),
    ]);

    let currentUser: TaigaUser | null = null;
    try {
      currentUser = await this.getCurrentUser();
    } catch {
      currentUser = null;
    }

    return {
      tags: Object.keys(tagColors),
      tagColors,
      userStoryStatuses: usStatuses,
      taskStatuses,
      sprints: milestones,
      defaultSprintId: pickDefaultSprintId(milestones) ?? null,
      projectSlug: project.slug,
      currentUser,
    };
  }

  async findUserStoryByRef(ref: number, projectId = config.taiga.projectId): Promise<TaigaUserStory> {
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaUserStory>(`/userstories/by_ref?ref=${ref}&project=${projectId}`);
  }

  async searchUserStories(query: string, projectId = config.taiga.projectId): Promise<TaigaUserStory[]> {
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaUserStory[]>(
      `/userstories?project=${projectId}&subject=${encodeURIComponent(query)}`,
    );
  }

  async listRecentUserStories(limit = 20, projectId = config.taiga.projectId): Promise<TaigaUserStory[]> {
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const stories = await this.request<TaigaUserStory[]>(`/userstories?project=${projectId}&order_by=-ref`);
    return stories.slice(0, limit);
  }

  async getTasksByUserStory(userStoryId: number, projectId = config.taiga.projectId): Promise<TaigaTask[]> {
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaTask[]>(`/tasks?user_story=${userStoryId}&project=${projectId}`);
  }

  async createUserStory(input: {
    subject: string;
    description: string;
    tags: string[];
    statusId?: number;
    milestoneId?: number | null;
    projectId?: number;
    assignedTo?: number;
  }): Promise<TaigaUserStory> {
    const projectId = input.projectId ?? config.taiga.projectId;
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const meta = await this.getProjectMeta(projectId);
    const openStatus = meta.userStoryStatuses.find((status) => !status.is_closed) ?? meta.userStoryStatuses[0];
    const assignedTo = input.assignedTo ?? meta.currentUser?.id;

    return this.request<TaigaUserStory>('/userstories', {
      method: 'POST',
      body: JSON.stringify({
        project: projectId,
        subject: input.subject,
        description: input.description,
        tags: input.tags,
        status: input.statusId ?? openStatus?.id,
        milestone: input.milestoneId ?? null,
        assigned_to: assignedTo ?? null,
      }),
    });
  }

  async createTask(input: {
    subject: string;
    description?: string;
    userStoryId: number;
    projectId?: number;
    statusId?: number;
    assignedTo?: number;
  }): Promise<TaigaTask> {
    const projectId = input.projectId ?? config.taiga.projectId;
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const meta = await this.getProjectMeta(projectId);
    const openStatus = meta.taskStatuses.find((status) => !status.is_closed) ?? meta.taskStatuses[0];
    const assignedTo = input.assignedTo ?? meta.currentUser?.id;

    return this.request<TaigaTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        project: projectId,
        subject: input.subject,
        description: input.description ?? '',
        user_story: input.userStoryId,
        status: input.statusId ?? openStatus?.id,
        assigned_to: assignedTo ?? null,
      }),
    });
  }

  async createTasksBulk(input: {
    userStoryId: number;
    tasks: Array<{ subject: string; description?: string; statusId?: number }>;
    projectId?: number;
    assignedTo?: number;
    defaultStatusId?: number;
  }): Promise<TaigaTask[]> {
    const assignedTo = input.assignedTo ?? (await this.getCurrentUser()).id;
    const created: TaigaTask[] = [];

    for (const task of input.tasks) {
      created.push(
        await this.createTask({
          subject: task.subject,
          description: task.description,
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          assignedTo,
          statusId: task.statusId ?? input.defaultStatusId,
        }),
      );
    }

    return created;
  }

  async createTag(projectId: number, tag: string, color: string): Promise<void> {
    await this.request<void>(`/projects/${projectId}/create_tag`, {
      method: 'POST',
      body: JSON.stringify({ tag, color }),
    });
  }

  async ensureTags(
    projectId: number,
    tags: Array<{ name: string; color: string }>,
    existingTagColors: Record<string, string | null>,
  ): Promise<string[]> {
    const ensured: string[] = [];

    for (const tag of tags) {
      const existing = Object.keys(existingTagColors).find(
        (item) => item.toLowerCase() === tag.name.toLowerCase(),
      );

      if (existing) {
        ensured.push(existing);
        continue;
      }

      try {
        await this.createTag(projectId, tag.name, tag.color);
        existingTagColors[tag.name] = tag.color;
        ensured.push(tag.name);
      } catch {
        const fallback = Object.keys(existingTagColors).find(
          (item) => item.toLowerCase() === tag.name.toLowerCase(),
        );
        ensured.push(fallback ?? tag.name);
      }
    }

    return ensured;
  }

  async getUserStory(id: number): Promise<TaigaUserStory> {
    return this.request<TaigaUserStory>(`/userstories/${id}`);
  }

  async getTask(id: number): Promise<TaigaTask> {
    return this.request<TaigaTask>(`/tasks/${id}`);
  }

  async updateUserStory(
    id: number,
    input: {
      subject?: string;
      description?: string;
      tags?: string[];
      statusId?: number;
      milestoneId?: number | null;
      version?: number;
    },
  ): Promise<TaigaUserStory> {
    return this.request<TaigaUserStory>(`/userstories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.description ? { description: input.description } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.statusId ? { status: input.statusId } : {}),
        ...(input.milestoneId !== undefined ? { milestone: input.milestoneId } : {}),
        ...(input.version ? { version: input.version } : {}),
      }),
    });
  }

  async updateTask(
    id: number,
    input: {
      subject?: string;
      description?: string;
      statusId?: number;
      version?: number;
    },
  ): Promise<TaigaTask> {
    return this.request<TaigaTask>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statusId ? { status: input.statusId } : {}),
        ...(input.version ? { version: input.version } : {}),
      }),
    });
  }

  buildUserStoryUrl(ref: number, projectSlug: string): string {
    return `https://tree.taiga.io/project/${projectSlug}/us/${ref}`;
  }

  buildTaskUrl(ref: number, projectSlug: string): string {
    return `https://tree.taiga.io/project/${projectSlug}/task/${ref}`;
  }
}

export const taigaService = new TaigaService();
