export type LicenseBlock = {
  id: string;
  title: string;
  description: string;
  body: string;
  paragraphs?: string[];
  variables: string[];
  /** Rendering role in the document */
  blockType?: 'title' | 'preamble' | 'article' | 'modules';
};

// Bumped to v2 — new block model with title/preamble/modules blocks
const FRAME_KEY = 'lb_frame_blocks_v2';
const MODULE_KEY = 'lb_blocks_v1';

export function loadFrameBlocks(): LicenseBlock[] {
  try {
    const raw = localStorage.getItem(FRAME_KEY);
    return raw ? (JSON.parse(raw) as LicenseBlock[]) : DEFAULT_FRAME_BLOCKS;
  } catch { return DEFAULT_FRAME_BLOCKS; }
}
export function saveFrameBlocks(blocks: LicenseBlock[]): void {
  localStorage.setItem(FRAME_KEY, JSON.stringify(blocks));
}
export function loadModuleBlocks(): LicenseBlock[] {
  try {
    const raw = localStorage.getItem(MODULE_KEY);
    return raw ? (JSON.parse(raw) as LicenseBlock[]) : DEFAULT_MODULE_BLOCKS;
  } catch { return DEFAULT_MODULE_BLOCKS; }
}
export function saveModuleBlocks(blocks: LicenseBlock[]): void {
  localStorage.setItem(MODULE_KEY, JSON.stringify(blocks));
}

export const DEFAULT_FRAME_BLOCKS: LicenseBlock[] = [
  {
    id: 'frame-title',
    blockType: 'title',
    title: 'Заголовок договора',
    description: 'Название и тип лицензии',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-preamble',
    blockType: 'preamble',
    title: 'Преамбула',
    description: 'Место, дата, стороны договора',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-art1',
    blockType: 'article',
    title: 'Статья 1',
    description: 'Первая статья',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-art2',
    blockType: 'article',
    title: 'Статья 2',
    description: 'Вторая статья',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-modules',
    blockType: 'modules',
    title: 'Статья 3',
    description: 'Статья из модулей (сборка)',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-art4',
    blockType: 'article',
    title: 'Статья 4',
    description: 'Четвёртая статья',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'frame-art5',
    blockType: 'article',
    title: 'Статья 5',
    description: 'Пятая статья',
    body: '',
    paragraphs: [],
    variables: [],
  },
];

export const DEFAULT_MODULE_BLOCKS: LicenseBlock[] = [
  {
    id: 'module-1',
    title: 'Модуль 1',
    description: 'Описание модуля',
    body: '',
    paragraphs: [],
    variables: [],
  },
  {
    id: 'module-2',
    title: 'Модуль 2',
    description: 'Описание модуля',
    body: '',
    paragraphs: [],
    variables: [],
  },
];

export const FRAME_DEFAULTS = {
  reqLeft: '',
  reqRight: '',
};

// Backward compat aliases
export const TEST_BLOCKS = DEFAULT_MODULE_BLOCKS;
export const TEST_FRAME = { header: '', footer: '' };
