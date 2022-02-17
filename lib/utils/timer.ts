import Errawr from 'errawr';

export const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

export const timeout = (ms: number): Promise<void> => {
  return wait(ms).then(() => {
    throw new Errawr('Timeout expired', {
      code: 'timeout',
    });
  });
};
