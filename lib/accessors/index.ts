import { CAccessor } from './c/accessor';

import { Accessor } from '../types';

export { Accessor };

const accessors: Array<Accessor> = [new CAccessor()];

export default accessors;
