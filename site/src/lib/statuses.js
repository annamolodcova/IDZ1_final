// Единый справочник этапов воронки. Порядок важен: он же используется в фильтре.
export const STATUSES = [
  { id: 'applied', label: 'Отклик' },
  { id: 'screening', label: 'Скрининг' },
  { id: 'test', label: 'Тестовое задание' },
  { id: 'interview', label: 'Интервью' },
  { id: 'offer', label: 'Оффер' },
  { id: 'rejected', label: 'Отказ' },
];

export const DEFAULT_STATUS = 'applied';

export const STATUS_MAP = Object.fromEntries(STATUSES.map((status) => [status.id, status]));

export function isStatusId(value) {
  return Object.hasOwn(STATUS_MAP, value);
}
