import { Router } from 'express';
import { runtimeConfig } from '../services/runtime-config.service.js';
import {
  buildUsDescription,
  buildUsSubject,
  publishRequestSchema,
  updatePublishedSchema,
} from '../schemas/draft.schema.js';
import { tagPlanToTaigaTags } from '../utils/tags.js';
import { applyDefaultAssignees, isMergeTask } from '../utils/default-tasks.js';
import { taigaService } from '../services/taiga.service.js';

export const publishRouter = Router();

function defaultOpenStatusId(statuses: Array<{ id: number; is_closed: boolean }>): number | undefined {
  return statuses.find((status) => !status.is_closed)?.id ?? statuses[0]?.id;
}

publishRouter.post('/', async (req, res, next) => {
  try {
    const { mode, draft } = publishRequestSchema.parse(req.body);
    runtimeConfig.assertTaigaConfigured();
    const meta = await taigaService.getProjectMeta();
    const projectId = runtimeConfig.getTaigaConfig().projectId!;
    const subject = buildUsSubject(draft.escopo, draft.titulo);
    const description = buildUsDescription(draft);

    const tagEntries = tagPlanToTaigaTags(draft.tagPlan, draft.tagColors ?? {});
    const tagColorsMap = { ...meta.tagColors };
    const ensuredTags = await taigaService.ensureTags(
      projectId,
      tagEntries.map((tag) => ({ name: tag.name, color: tag.color })),
      tagColorsMap,
    );

    const workspace = runtimeConfig.getActiveWorkspace();
    const preparedTasks = applyDefaultAssignees(draft.tasks, {
      defaultAssigneeId: meta.currentUser?.id ?? null,
      mergeAssigneeId: workspace?.mergeAssigneeId ?? null,
    }).map((task) =>
      workspace?.mergeAssigneeId && isMergeTask(task.subject)
        ? { ...task, assignedTo: workspace.mergeAssigneeId }
        : task,
    );

    const usStatusId = draft.usStatusId ?? defaultOpenStatusId(meta.userStoryStatuses);
    const defaultTaskStatusId = defaultOpenStatusId(meta.taskStatuses);

    let userStoryId = draft.existingUserStoryId;
    let userStoryRef = draft.existingUserStoryRef;
    let userStorySubject = subject;
    let userStoryVersion = 1;
    let userStoryStatusId = usStatusId ?? 0;

    if (mode === 'new_us') {
      const created = await taigaService.createUserStory({
        subject,
        description,
        tags: ensuredTags,
        statusId: usStatusId,
        milestoneId: draft.milestoneId ?? meta.defaultSprintId,
      });
      userStoryId = created.id;
      userStoryRef = created.ref;
      userStorySubject = created.subject;
      userStoryVersion = created.version;
      userStoryStatusId = created.status;
    } else {
      if (!userStoryId && userStoryRef) {
        const existing = await taigaService.findUserStoryByRef(userStoryRef);
        userStoryId = existing.id;
        userStorySubject = existing.subject;
        userStoryVersion = existing.version;
        userStoryStatusId = existing.status;
      }

      if (!userStoryId) {
        res.status(400).json({
          error: 'existingUserStoryId or existingUserStoryRef is required for existing_us mode',
        });
        return;
      }
    }

    const tasks = await taigaService.createTasksBulk({
      userStoryId: userStoryId!,
      tasks: preparedTasks.map((task) => ({
        subject: task.subject,
        description: task.description,
        statusId: task.statusId ?? defaultTaskStatusId,
        assignedTo: task.assignedTo ?? meta.currentUser?.id ?? null,
      })),
      defaultStatusId: defaultTaskStatusId,
    });

    res.json({
      success: true,
      userStory: {
        id: userStoryId,
        ref: userStoryRef,
        subject: userStorySubject,
        description,
        tags: ensuredTags,
        statusId: userStoryStatusId,
        version: userStoryVersion,
        url: userStoryRef ? taigaService.buildUserStoryUrl(userStoryRef, meta.projectSlug) : null,
      },
      tasks: tasks.map((task) => ({
        id: task.id,
        ref: task.ref,
        subject: task.subject,
        description: task.description,
        statusId: task.status,
        assignedTo: task.assigned_to ?? null,
        version: task.version,
        url: taigaService.buildTaskUrl(task.ref, meta.projectSlug),
      })),
      gitNotes: draft.gitNotes,
      reminders: [
        'Cada US deve ter seu proprio Pull Request unico.',
        `Branch documentada: ${draft.branch}`,
        'Para USs grandes, PRs secundarias devem apontar para a branch da US.',
      ],
    });
  } catch (error) {
    next(error);
  }
});

publishRouter.patch('/update', async (req, res, next) => {
  try {
    const payload = updatePublishedSchema.parse(req.body);
    runtimeConfig.assertTaigaConfigured();
    const meta = await taigaService.getProjectMeta();
    const projectId = runtimeConfig.getTaigaConfig().projectId!;
    const { draft, tasks, userStoryId, userStoryVersion } = payload;

    const tagEntries = tagPlanToTaigaTags(draft.tagPlan, draft.tagColors ?? {});
    const tagColorsMap = { ...meta.tagColors };
    const ensuredTags = await taigaService.ensureTags(
      projectId,
      tagEntries.map((tag) => ({ name: tag.name, color: tag.color })),
      tagColorsMap,
    );

    const subject = buildUsSubject(draft.escopo, draft.titulo);
    const description = buildUsDescription(draft);

    const updatedUs = await taigaService.updateUserStory(userStoryId, {
      subject,
      description,
      tags: ensuredTags,
      statusId: draft.usStatusId,
      milestoneId: draft.milestoneId ?? null,
      version: userStoryVersion,
    });

    const workspace = runtimeConfig.getActiveWorkspace();
    const updatedTasks = [];
    for (const task of tasks) {
      const assignedTo =
        workspace?.mergeAssigneeId && isMergeTask(task.subject)
          ? workspace.mergeAssigneeId
          : task.assignedTo;
      updatedTasks.push(
        await taigaService.updateTask(task.id, {
          subject: task.subject,
          description: task.description ?? '',
          statusId: task.statusId,
          assignedTo,
          version: task.version,
        }),
      );
    }

    res.json({
      success: true,
      userStory: {
        id: updatedUs.id,
        ref: updatedUs.ref,
        subject: updatedUs.subject,
        description: updatedUs.description,
        tags: ensuredTags,
        statusId: updatedUs.status,
        version: updatedUs.version,
        url: taigaService.buildUserStoryUrl(updatedUs.ref, meta.projectSlug),
      },
      tasks: updatedTasks.map((task) => ({
        id: task.id,
        ref: task.ref,
        subject: task.subject,
        description: task.description,
        statusId: task.status,
        assignedTo: task.assigned_to ?? null,
        version: task.version,
        url: taigaService.buildTaskUrl(task.ref, meta.projectSlug),
      })),
    });
  } catch (error) {
    next(error);
  }
});
