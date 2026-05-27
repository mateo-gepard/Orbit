import type { OrbitItem } from './types';

export interface TaskBucketInput {
  items: OrbitItem[];
  selectedDateStr: string;
  todayStr: string;
  isViewingPast: boolean;
  isViewingToday: boolean;
}

export interface TaskBuckets {
  todayTasks: OrbitItem[];
  myDayTasks: OrbitItem[];
  notDoneFromBefore: OrbitItem[];
  overdueItems: OrbitItem[];
}

function isOpenTask(item: OrbitItem) {
  return item.type === 'task' && item.status !== 'done' && item.status !== 'archived';
}

export function getTaskBuckets({
  items,
  selectedDateStr,
  todayStr,
  isViewingPast,
  isViewingToday,
}: TaskBucketInput): TaskBuckets {
  const overdueItems = isViewingToday
    ? items.filter((item) => isOpenTask(item) && Boolean(item.dueDate && item.dueDate < todayStr))
    : [];

  const todayTasks = items.filter((item) => {
    if (item.type !== 'task') return false;
    if (item.dueDate !== selectedDateStr) return false;

    if (isViewingPast) {
      return item.status === 'done' || item.status !== 'archived';
    }

    return isOpenTask(item);
  });

  const scheduledTaskIds = new Set([...overdueItems, ...todayTasks].map((item) => item.id));

  const myDayTasks = items.filter(
    (item) => isOpenTask(item) && item.myDay === selectedDateStr && !scheduledTaskIds.has(item.id)
  );

  const visibleTaskIds = new Set([...scheduledTaskIds, ...myDayTasks.map((item) => item.id)]);

  const notDoneFromBefore = isViewingToday
    ? items.filter(
        (item) => isOpenTask(item) && Boolean(item.myDay && item.myDay < todayStr && !visibleTaskIds.has(item.id))
      )
    : [];

  return { todayTasks, myDayTasks, notDoneFromBefore, overdueItems };
}
