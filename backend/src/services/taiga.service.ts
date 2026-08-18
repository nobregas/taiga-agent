import { runtimeConfig } from './runtime-config.service.js';
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
  photo?: string | null;
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
  assigned_to: number | null;
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
  members: TaigaUser[];
}

export interface TaigaProjectSummary {
  id: number;
  name: string;
  slug: string;
}

interface TaigaMembership {
  user: number | null;
  user_extra_info?: {
    username?: string;
    full_name_display?: string;
    full_name?: string;
    photo?: string | null;
  } | null;
}

const PROJECT_CACHE_TTL_MS = 5 * 60 * 1000;

export class TaigaService {
  private authToken: string | null = null;
  private currentUser: TaigaUser | null = null;
  private readonly projectMetaCache = new Map<number, { at: number; value: TaigaProjectMeta }>();
  private readonly membersCache = new Map<number, { at: number; value: TaigaUser[] }>();

  invalidateAuth(): void {
    this.authToken = null;
    this.currentUser = null;
    this.invalidateProjectCache();
  }

  invalidateProjectCache(projectId?: number | null): void {
    if (projectId) {
      this.projectMetaCache.delete(projectId);
      this.membersCache.delete(projectId);
      return;
    }

    this.projectMetaCache.clear();
    this.membersCache.clear();
  }

  private getConfig() {
    return runtimeConfig.getTaigaConfig();
  }

  private async fetchTaiga(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new Error(`Falha ao conectar no Taiga (${this.getConfig().url})`, { cause: error });
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const { url } = this.getConfig();
    const response = await this.fetchTaiga(`${url}${path}`, {
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
    const taiga = this.getConfig();

    if (taiga.token) {
      this.authToken = taiga.token;
      return taiga.token;
    }

    if (this.authToken) {
      return this.authToken;
    }

    if (!taiga.username || !taiga.password) {
      throw new Error('Taiga credentials are not configured');
    }

    const data = await this.fetchTaiga(`${taiga.url}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'normal',
        username: taiga.username,
        password: taiga.password,
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
    if (this.currentUser) {
      return this.currentUser;
    }

    const me = await this.request<{
      id: number;
      username: string;
      full_name?: string;
      full_name_display?: string;
      photo?: string | null;
    }>('/users/me');

    this.currentUser = {
      id: me.id,
      username: me.username,
      full_name: me.full_name_display ?? me.full_name ?? me.username,
      photo: me.photo ?? null,
    };

    return this.currentUser;
  }

  private mapMemberships(memberships: TaigaMembership[]): TaigaUser[] {
    const seen = new Set<number>();
    const members: TaigaUser[] = [];

    for (const membership of memberships) {
      if (!membership.user || seen.has(membership.user)) {
        continue;
      }

      seen.add(membership.user);
      const extra = membership.user_extra_info;
      members.push({
        id: membership.user,
        username: extra?.username ?? String(membership.user),
        full_name: extra?.full_name_display ?? extra?.full_name ?? extra?.username ?? String(membership.user),
        photo: extra?.photo ?? null,
      });
    }

    return members.sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'));
  }

  async getProjectMembers(projectId?: number | null): Promise<TaigaUser[]> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const cached = this.membersCache.get(resolvedProjectId);
    if (cached && Date.now() - cached.at < PROJECT_CACHE_TTL_MS) {
      return cached.value;
    }

    const memberships = await this.request<TaigaMembership[]>(`/memberships?project=${resolvedProjectId}`);
    const members = this.mapMemberships(memberships);
    this.membersCache.set(resolvedProjectId, { at: Date.now(), value: members });
    return members;
  }

  async listProjects(): Promise<TaigaProjectSummary[]> {
    runtimeConfig.assertTaigaCredentials();
    const projects = await this.request<Array<{ id: number; name: string; slug: string }>>('/projects');
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      slug: project.slug,
    }));
  }

  async getProjectMeta(projectId?: number | null): Promise<TaigaProjectMeta> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const cached = this.projectMetaCache.get(resolvedProjectId);
    if (cached && Date.now() - cached.at < PROJECT_CACHE_TTL_MS) {
      return cached.value;
    }

    const [project, tagColors, usStatuses, taskStatuses, milestones, members] = await Promise.all([
      this.request<{ id: number; slug: string }>(`/projects/${resolvedProjectId}`),
      this.request<Record<string, string | null>>(`/projects/${resolvedProjectId}/tags_colors`),
      this.request<TaigaStatus[]>(`/userstory-statuses?project=${resolvedProjectId}`),
      this.request<TaigaStatus[]>(`/task-statuses?project=${resolvedProjectId}`),
      this.request<TaigaMilestone[]>(`/milestones?project=${resolvedProjectId}`),
      this.getProjectMembers(resolvedProjectId),
    ]);

    let currentUser: TaigaUser | null = null;
    try {
      currentUser = await this.getCurrentUser();
    } catch {
      currentUser = null;
    }

    let memberList = members;
    if (currentUser && !memberList.some((member) => member.id === currentUser.id)) {
      memberList = [currentUser, ...memberList];
    }

    const meta: TaigaProjectMeta = {
      tags: Object.keys(tagColors),
      tagColors,
      userStoryStatuses: usStatuses,
      taskStatuses,
      sprints: milestones,
      defaultSprintId: pickDefaultSprintId(milestones) ?? null,
      projectSlug: project.slug,
      currentUser,
      members: memberList,
    };

    this.projectMetaCache.set(resolvedProjectId, { at: Date.now(), value: meta });
    return meta;
  }

  async findUserStoryByRef(ref: number, projectId?: number | null): Promise<TaigaUserStory> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaUserStory>(`/userstories/by_ref?ref=${ref}&project=${resolvedProjectId}`);
  }

  async searchUserStories(query: string, projectId?: number | null): Promise<TaigaUserStory[]> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaUserStory[]>(
      `/userstories?project=${resolvedProjectId}&subject=${encodeURIComponent(query)}`,
    );
  }

  async listRecentUserStories(limit = 20, projectId?: number | null): Promise<TaigaUserStory[]> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const stories = await this.request<TaigaUserStory[]>(`/userstories?project=${resolvedProjectId}&order_by=-ref`);
    return stories.slice(0, limit);
  }

  async getTasksByUserStory(userStoryId: number, projectId?: number | null): Promise<TaigaTask[]> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    return this.request<TaigaTask[]>(`/tasks?user_story=${userStoryId}&project=${resolvedProjectId}`);
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
    const projectId = input.projectId ?? this.getConfig().projectId;
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
    assignedTo?: number | null;
  }): Promise<TaigaTask> {
    const projectId = input.projectId ?? this.getConfig().projectId;
    if (!projectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const meta = await this.getProjectMeta(projectId);
    const openStatus = meta.taskStatuses.find((status) => !status.is_closed) ?? meta.taskStatuses[0];
    const assignedTo = input.assignedTo === undefined ? (meta.currentUser?.id ?? null) : input.assignedTo;

    return this.request<TaigaTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        project: projectId,
        subject: input.subject,
        description: input.description ?? '',
        user_story: input.userStoryId,
        status: input.statusId ?? openStatus?.id,
        assigned_to: assignedTo,
      }),
    });
  }

  async createTasksBulk(input: {
    userStoryId: number;
    tasks: Array<{ subject: string; description?: string; statusId?: number; assignedTo?: number | null }>;
    projectId?: number;
    assignedTo?: number | null;
    defaultStatusId?: number;
  }): Promise<TaigaTask[]> {
    const created: TaigaTask[] = [];
    let fallbackAssignee = input.assignedTo;
    if (fallbackAssignee === undefined) {
      try {
        fallbackAssignee = (await this.getCurrentUser()).id;
      } catch {
        fallbackAssignee = null;
      }
    }

    for (const task of input.tasks) {
      created.push(
        await this.createTask({
          subject: task.subject,
          description: task.description,
          userStoryId: input.userStoryId,
          projectId: input.projectId,
          assignedTo: task.assignedTo === undefined ? fallbackAssignee : task.assignedTo,
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

  async editTag(projectId: number, fromTag: string, toTag: string, color: string): Promise<void> {
    await this.request<void>(`/projects/${projectId}/edit_tag`, {
      method: 'POST',
      body: JSON.stringify({ from_tag: fromTag, to_tag: toTag, color }),
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
        const currentColor = (existingTagColors[existing] ?? '').toLowerCase();
        const nextColor = tag.color.toLowerCase();
        if (tag.color && currentColor && currentColor !== nextColor) {
          try {
            await this.editTag(projectId, existing, existing, tag.color);
            existingTagColors[existing] = tag.color;
          } catch {
            /* keep the existing project color if Taiga rejects the edit */
          }
        }
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

    this.invalidateProjectCache(projectId);
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
      assignedTo?: number | null;
      version?: number;
    },
  ): Promise<TaigaTask> {
    return this.request<TaigaTask>(`/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        ...(input.subject ? { subject: input.subject } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statusId ? { status: input.statusId } : {}),
        ...(input.assignedTo !== undefined ? { assigned_to: input.assignedTo } : {}),
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
