export function truncateStack(error: Error, frames = 1): Error {
  error.stack = error.stack && error.stack.split('\n').slice(frames).join('\n');
  return error;
}

export function printError(error: Error): string {
  let printed = '';
  let error_: any = error;

  while (error_) {
    if (printed !== '') {
      printed += 'Caused by: \n';
    }
    printed += error.stack ? error.stack : error;
    error_ = error_.cause;
  }

  return printed;
}
