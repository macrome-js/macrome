import { hasOutput } from './utils/shell';

export type VCSConfig = {
  name: string;
  dir: string;
  lock: string;
  isDirty: (dir?: string) => boolean;
};

export const vcsConfigs: Array<VCSConfig> = [
  {
    name: 'git',
    dir: '.git',
    lock: 'index.lock',
    isDirty: (dir) => hasOutput('git', ['status', '-s', '--porcelain'], dir),
  },
  {
    name: 'hg',
    dir: '.hg',
    lock: 'wlock',
    isDirty: (dir) => hasOutput('hg', ['status', '--color=never', '--pager=never'], dir),
  },
];
