import debug from 'debug';

export const log = debug('resolve');
log.cond = debug('resolve:conditional');
log.value = debug('resolve:value');
log.comp = debug('resolve:composition');
log.obj = debug('resolve:object');
