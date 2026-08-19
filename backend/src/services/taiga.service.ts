import { runtimeConfig } from './runtime-config.service.js';
import type { TaigaMilestone } from '../utils/sprints.js';
import { pickDefaultSprintId } from '../utils/sprints.js';
import { defaultOpenStatusId, findReadyForDevStatusId } from '../utils/task-status.js';
import { HttpError } from '../utils/http-error.js';

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
  email?: string | null;
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

export interface TaigaUserStorySearchHit {
  id: number;
  ref: number;
  subject: string;
  status?: number | string | { id?: number; name?: string } | null;
}

export interface UserStorySearchResult {
  id: number;
  ref: number;
  subject: string;
  status?: number | string;
}

interface TaigaSearchResponse {
  count?: number;
  userstories?: TaigaUserStorySearchHit[];
}

interface TaigaAuthPayload {
  auth_token?: string;
  id: number;
  username: string;
  email?: string | null;
  full_name?: string;
  full_name_display?: string;
  photo?: string | null;
}

type TaigaRequestInit = RequestInit & { disablePagination?: boolean };

interface TaigaMembership {
  id?: number;
  user?: number | TaigaUserLike | null;
  username?: string;
  full_name?: string;
  full_name_display?: string;
  photo?: string | null;
  user_extra_info?: {
    username?: string;
    full_name_display?: string;
    full_name?: string;
    photo?: string | null;
  } | null;
}

interface TaigaUserLike {
  id?: number;
  username?: string;
  full_name?: string;
  full_name_display?: string;
  photo?: string | null;
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

  hydrateSession(token: string, user: TaigaUser): void {
    this.authToken = token;
    this.currentUser = user;
  }

  private mapUser(payload: {
    id: number;
    username: string;
    email?: string | null;
    full_name?: string;
    full_name_display?: string;
    photo?: string | null;
  }): TaigaUser {
    return {
      id: payload.id,
      username: payload.username,
      full_name: payload.full_name_display ?? payload.full_name ?? payload.username,
      email: payload.email ?? null,
      photo: payload.photo ?? null,
    };
  }

  private mapSearchHit(hit: TaigaUserStorySearchHit): UserStorySearchResult | null {
    if (!hit || typeof hit.id !== 'number' || typeof hit.ref !== 'number') {
      return null;
    }

    let status: number | string | undefined;
    if (hit.status != null && typeof hit.status === 'object') {
      status = hit.status.name ?? (typeof hit.status.id === 'number' ? hit.status.id : undefined);
    } else if (typeof hit.status === 'number' || typeof hit.status === 'string') {
      status = hit.status;
    }

    return {
      id: hit.id,
      ref: hit.ref,
      subject: hit.subject ?? '',
      ...(status !== undefined ? { status } : {}),
    };
  }

  private async fetchTaiga(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      throw new Error(`Falha ao conectar no Taiga (${this.getConfig().url})`, { cause: error });
    }
  }

  private async request<T>(path: string, init: TaigaRequestInit = {}): Promise<T> {
    const token = await this.getToken();
    const { url } = this.getConfig();
    const { disablePagination, headers: initHeaders, ...rest } = init;
    const requestUrl = `${url}${path}`;
    const response = await this.fetchTaiga(requestUrl, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(disablePagination ? { 'x-disable-pagination': 'True' } : {}),
        ...(initHeaders && typeof initHeaders === 'object' && !Array.isArray(initHeaders) && !(initHeaders instanceof Headers)
          ? initHeaders
          : {}),
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`Taiga ${rest.method ?? 'GET'} ${path} → ${response.status}`, body);
      const status = response.status >= 400 && response.status < 600 ? response.status : 502;
      throw new HttpError(`Taiga API error ${response.status}: ${body}`, status >= 500 ? 502 : status);
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
      const body = await data.text();
      console.error(`Taiga POST /auth → ${data.status}`, body);
      throw new HttpError(`Taiga auth failed: ${data.status}`, data.status === 401 ? 401 : 502);
    }

    const payload = (await data.json()) as TaigaAuthPayload;
    if (!payload.auth_token) {
      throw new HttpError('Taiga nao retornou token de autenticacao', 502);
    }

    this.authToken = payload.auth_token;
    this.currentUser = this.mapUser(payload);

    return this.authToken;
  }

  async authenticate(username: string, password: string): Promise<{ token: string; user: TaigaUser }> {
    const { url } = this.getConfig();
    const data = await this.fetchTaiga(`${url}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'normal',
        username,
        password,
      }),
    });

    if (!data.ok) {
      const body = await data.text();
      console.error(`Taiga POST /auth → ${data.status}`, body);
      throw new HttpError('Usuario ou senha do Taiga invalidos', 401);
    }

    const payload = (await data.json()) as TaigaAuthPayload;
    if (!payload.auth_token) {
      throw new HttpError('Taiga nao retornou token de autenticacao', 502);
    }

    const user = this.mapUser(payload);
    this.hydrateSession(payload.auth_token, user);
    return { token: payload.auth_token, user };
  }

  async getCurrentUser(): Promise<TaigaUser> {
    await this.getToken();
    if (this.currentUser) {
      return this.currentUser;
    }

    const me = await this.request<{
      id: number;
      username: string;
      email?: string | null;
      full_name?: string;
      full_name_display?: string;
      photo?: string | null;
    }>('/users/me');

    this.currentUser = this.mapUser(me);

    return this.currentUser;
  }

  private pickMemberName(...candidates: Array<string | null | undefined>): string | null {
    for (const candidate of candidates) {
      const value = candidate?.trim();
      if (value && !/^\d+$/.test(value)) {
        return value;
      }
    }
    return null;
  }

  private normalizeMembership(membership: TaigaMembership): TaigaUser | null {
    const extra = membership.user_extra_info ?? null;
    const nestedUser = membership.user && typeof membership.user === 'object' ? membership.user : null;
    const userId =
      typeof membership.user === 'number'
        ? membership.user
        : typeof nestedUser?.id === 'number'
          ? nestedUser.id
          : null;

    if (userId == null) {
      return null;
    }

    const username =
      this.pickMemberName(extra?.username, nestedUser?.username, membership.username) ?? `user-${userId}`;
    const fullName =
      this.pickMemberName(
        extra?.full_name_display,
        extra?.full_name,
        nestedUser?.full_name_display,
        nestedUser?.full_name,
        membership.full_name_display,
        membership.full_name,
        username,
      ) ?? 'Membro';

    return {
      id: userId,
      username,
      full_name: fullName,
      photo: extra?.photo ?? nestedUser?.photo ?? membership.photo ?? null,
    };
  }

  private mapMemberships(memberships: TaigaMembership[]): TaigaUser[] {
    const seen = new Set<number>();
    const members: TaigaUser[] = [];

    for (const membership of memberships) {
      const member = this.normalizeMembership(membership);
      if (!member || seen.has(member.id)) {
        continue;
      }

      seen.add(member.id);
      members.push(member);
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
    const user = await this.getCurrentUser();
    const projects = await this.request<Array<{ id: number; name: string; slug: string; i_am_member?: boolean }>>(
      `/projects?member=${user.id}&order_by=memberships__user_order`,
      { disablePagination: true },
    );

    return projects
      .filter((project) => project.i_am_member !== false)
      .map((project) => ({
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

  async searchUserStories(query: string, projectId?: number | null): Promise<UserStorySearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const params = new URLSearchParams({
      project: String(resolvedProjectId),
      text: trimmed,
    });
    const searchPath = `/search?${params.toString()}`;

    const payload = await this.request<TaigaSearchResponse | TaigaUserStorySearchHit[]>(searchPath);
    const rawHits = Array.isArray(payload) ? payload : (payload.userstories ?? []);
    const mapped = rawHits
      .map((hit) => this.mapSearchHit(hit))
      .filter((hit): hit is UserStorySearchResult => hit != null);

    const refMatch = trimmed.replace(/^#/, '');
    const ref = Number.parseInt(refMatch, 10);
    if (Number.isFinite(ref) && String(ref) === refMatch) {
      try {
        const byRef = await this.findUserStoryByRef(ref, resolvedProjectId);
        if (!mapped.some((item) => item.id === byRef.id)) {
          mapped.unshift({
            id: byRef.id,
            ref: byRef.ref,
            subject: byRef.subject,
            status: byRef.status,
          });
        }
      } catch (error) {
        if (!(error instanceof HttpError) || error.status !== 404) {
          console.error(
            `Taiga GET /userstories/by_ref?ref=${ref}&project=${resolvedProjectId} falhou`,
            error,
          );
        }
      }
    }

    return mapped.slice(0, 20);
  }

  async listRecentUserStories(limit = 20, projectId?: number | null): Promise<TaigaUserStory[]> {
    const resolvedProjectId = projectId ?? this.getConfig().projectId;
    if (!resolvedProjectId) {
      throw new Error('TAIGA_PROJECT_ID is not configured');
    }

    const stories = await this.request<TaigaUserStory[]>(
      `/userstories?project=${resolvedProjectId}&order_by=-ref`,
      { disablePagination: true },
    );
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
    const readyStatusId = findReadyForDevStatusId(meta.userStoryStatuses);
    const assignedTo = input.assignedTo ?? meta.currentUser?.id;

    return this.request<TaigaUserStory>('/userstories', {
      method: 'POST',
      body: JSON.stringify({
        project: projectId,
        subject: input.subject,
        description: input.description,
        tags: input.tags,
        status: input.statusId ?? readyStatusId,
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
    const openStatusId = defaultOpenStatusId(meta.taskStatuses);
    const assignedTo = input.assignedTo === undefined ? (meta.currentUser?.id ?? null) : input.assignedTo;

    return this.request<TaigaTask>('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        project: projectId,
        subject: input.subject,
        description: input.description ?? '',
        user_story: input.userStoryId,
        status: input.statusId ?? openStatusId,
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
